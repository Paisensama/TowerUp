import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from "react-native";

type Phase = "idle" | "running" | "gameover";

type Layer = {
  x: number;
  y: number;
  width: number;
  color: string;
};

type FallingSlice = {
  id: number;
  x: number;
  y: number;
  width: number;
  vy: number;
  color: string;
};

type FloatingText = {
  id: number;
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
};

const LAYER_HEIGHT = 30;
const PERFECT_WINDOW = 8;
const GRAVITY = 0.34;
const FLOAT_LIFE_START = 52;
const HIDE_STAND_AT = 12;
const CAKE_COLORS = ["#f8bbd0", "#ffe0b2", "#dcedc8", "#d1c4e9", "#ffccbc"];
const BEST_SCORE_KEY = "towerup.bestScore";

type DifficultyKey = "easy" | "normal" | "hard";
type ThemeKey = "aurora" | "neon" | "sunset";

const DIFFICULTY_CONFIG: Record<
  DifficultyKey,
  { label: string; baseSpeed: number; speedStep: number; maxSpeed: number }
> = {
  easy: { label: "Easy", baseSpeed: 1.35, speedStep: 0.09, maxSpeed: 4.4 },
  normal: { label: "Normal", baseSpeed: 1.7, speedStep: 0.11, maxSpeed: 5.2 },
  hard: { label: "Hard", baseSpeed: 2.25, speedStep: 0.16, maxSpeed: 7.1 },
};

const THEMES: Record<
  ThemeKey,
  {
    skyTop: string;
    skyBottom: string;
    moonGlow: string;
    auroraA: string;
    auroraB: string;
    cloud: string;
  }
> = {
  aurora: {
    skyTop: "#0a1f3a",
    skyBottom: "#102a4a",
    moonGlow: "rgba(140, 202, 255, 0.28)",
    auroraA: "rgba(95, 255, 205, 0.18)",
    auroraB: "rgba(140, 150, 255, 0.12)",
    cloud: "rgba(255,255,255,0.14)",
  },
  neon: {
    skyTop: "#140b2d",
    skyBottom: "#1f0f3e",
    moonGlow: "rgba(255, 120, 214, 0.28)",
    auroraA: "rgba(88, 255, 240, 0.2)",
    auroraB: "rgba(180, 90, 255, 0.18)",
    cloud: "rgba(255,255,255,0.12)",
  },
  sunset: {
    skyTop: "#2a1b3d",
    skyBottom: "#ff6b6b",
    moonGlow: "rgba(255, 214, 143, 0.32)",
    auroraA: "rgba(255, 180, 120, 0.2)",
    auroraB: "rgba(255, 120, 90, 0.16)",
    cloud: "rgba(255,255,255,0.16)",
  },
};

const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];

function pickRandomTheme(previous?: ThemeKey) {
  if (!previous || THEME_KEYS.length === 1) {
    return THEME_KEYS[Math.floor(Math.random() * THEME_KEYS.length)];
  }
  let next = previous;
  while (next === previous) {
    next = THEME_KEYS[Math.floor(Math.random() * THEME_KEYS.length)];
  }
  return next;
}

function randomCakeColor() {
  return CAKE_COLORS[Math.floor(Math.random() * CAKE_COLORS.length)];
}

function makeInitialState(screenWidth: number, screenHeight: number) {
  const startWidth = Math.min(screenWidth * 0.58, 250);
  const baseY = screenHeight * 0.8;
  const baseX = (screenWidth - startWidth) / 2;
  const initialDirection = Math.random() < 0.5 ? -1 : 1;
  const baseLayer: Layer = {
    x: baseX,
    y: baseY,
    width: startWidth,
    color: randomCakeColor(),
  };
  const movingLayer: Layer = {
    x: initialDirection > 0 ? 0 : screenWidth - startWidth,
    y: baseY - LAYER_HEIGHT,
    width: startWidth,
    color: randomCakeColor(),
  };

  return { baseLayer, movingLayer, initialDirection };
}

export default function CakeTowerGame() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const initial = useMemo(
    () => makeInitialState(screenWidth, screenHeight),
    [screenWidth, screenHeight]
  );

  const [phase, setPhase] = useState<Phase>("idle");
  const [difficulty, setDifficulty] = useState<DifficultyKey>("normal");
  const [showSettings, setShowSettings] = useState(false);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [theme, setTheme] = useState<ThemeKey>(() => pickRandomTheme());
  const [stack, setStack] = useState<Layer[]>([initial.baseLayer]);
  const [moving, setMoving] = useState<Layer>(initial.movingLayer);
  const [speed, setSpeed] = useState(DIFFICULTY_CONFIG.normal.baseSpeed);
  const [direction, setDirection] = useState(initial.initialDirection);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [perfectStreak, setPerfectStreak] = useState(0);
  const [perfectHit, setPerfectHit] = useState(false);
  const [slices, setSlices] = useState<FallingSlice[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);

  const rafRef = useRef<number | null>(null);
  const sliceIdRef = useRef(0);
  const floatTextIdRef = useRef(0);
  const shakeX = useRef(new Animated.Value(0)).current;
  const placedLayerAnim = useRef(new Animated.Value(1)).current;
  const [lastPlacedIndex, setLastPlacedIndex] = useState<number | null>(null);
  const hasLoadedBestScore = useRef(false);
  const currentDifficulty = DIFFICULTY_CONFIG[difficulty];
  const currentTheme = THEMES[theme];
  const visibleStack = useMemo(
    () =>
      stack.filter(
        (layer) =>
          layer.y < screenHeight + LAYER_HEIGHT * 2 &&
          layer.y > -LAYER_HEIGHT * 3
      ),
    [screenHeight, stack]
  );
  const visibleSlices = useMemo(
    () =>
      slices.filter(
        (piece) => piece.y < screenHeight + 120 && piece.y > -LAYER_HEIGHT * 3
      ),
    [screenHeight, slices]
  );


  const hapticLight = () => {
    if (!vibrationEnabled) {
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const hapticSuccess = () => {
    if (!vibrationEnabled) {
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );
  };

  const hapticError = () => {
    if (!vibrationEnabled) {
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
      () => {}
    );
  };

  useEffect(() => {
    const loop = () => {
      setMoving((prev) => {
        if (phase !== "running") {
          return prev;
        }

        let nextX = prev.x + direction * speed;
        if (nextX <= 0) {
          nextX = 0;
          setDirection(1);
        } else if (nextX + prev.width >= screenWidth) {
          nextX = screenWidth - prev.width;
          setDirection(-1);
        }

        return { ...prev, x: nextX };
      });

      setSlices((prev) =>
        prev
          .map((piece) => ({
            ...piece,
            y: piece.y + piece.vy,
            vy: piece.vy + GRAVITY,
          }))
          .filter((piece) => piece.y < screenHeight + 100)
      );

      setFloatingTexts((prev) =>
        prev
          .map((item) => ({
            ...item,
            y: item.y + item.vy,
            life: item.life - 1,
          }))
          .filter((item) => item.life > 0)
      );

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [direction, phase, screenHeight, screenWidth, speed]);

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(BEST_SCORE_KEY)
      .then((value) => {
        if (!isMounted || value === null) {
          return;
        }
        const parsed = Number.parseInt(value, 10);
        if (!Number.isNaN(parsed)) {
          setBestScore(parsed);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) {
          hasLoadedBestScore.current = true;
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedBestScore.current) {
      return;
    }
    AsyncStorage.setItem(BEST_SCORE_KEY, String(bestScore)).catch(() => {});
  }, [bestScore]);

  useEffect(() => {
    const nextInitial = makeInitialState(screenWidth, screenHeight);
    setStack([nextInitial.baseLayer]);
    setMoving(nextInitial.movingLayer);
    setSlices([]);
    setPhase("idle");
    setSpeed(DIFFICULTY_CONFIG[difficulty].baseSpeed);
    setDirection(nextInitial.initialDirection);
    setScore(0);
    setPerfectStreak(0);
    setPerfectHit(false);
    setFloatingTexts([]);
    setTheme((prev) => pickRandomTheme(prev));
    setLastPlacedIndex(null);
  }, [difficulty, screenWidth, screenHeight]);

  const reset = () => {
    const nextInitial = makeInitialState(screenWidth, screenHeight);
    setStack([nextInitial.baseLayer]);
    setMoving(nextInitial.movingLayer);
    setSlices([]);
    setPhase("idle");
    setSpeed(currentDifficulty.baseSpeed);
    setDirection(nextInitial.initialDirection);
    setScore(0);
    setPerfectStreak(0);
    setPerfectHit(false);
    setFloatingTexts([]);
    setTheme((prev) => pickRandomTheme(prev));
    setLastPlacedIndex(null);
  };

  const start = () => {
    setPhase("running");
  };

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeX, {
        toValue: 12,
        duration: 45,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: -10,
        duration: 45,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: 6,
        duration: 40,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: 0,
        duration: 35,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const addFloatingText = (
    x: number,
    y: number,
    text: string,
    color: string
  ) => {
    setFloatingTexts((prev) => [
      ...prev,
      {
        id: floatTextIdRef.current++,
        x,
        y,
        vy: -1.1,
        life: FLOAT_LIFE_START,
        text,
        color,
      },
    ]);
  };

  const placeLayer = () => {
    const last = stack[stack.length - 1];
    const movingLeft = moving.x;
    const movingRight = moving.x + moving.width;
    const lastLeft = last.x;
    const lastRight = last.x + last.width;
    const overlapLeft = Math.max(movingLeft, lastLeft);
    const overlapRight = Math.min(movingRight, lastRight);
    const overlapWidth = overlapRight - overlapLeft;

    if (overlapWidth <= 0) {
      hapticError();
      triggerShake();
      setSlices((prev) => [
        ...prev,
        {
          id: sliceIdRef.current++,
          x: moving.x,
          y: moving.y,
          width: moving.width,
          vy: 2.5,
          color: moving.color,
        },
      ]);
      setPhase("gameover");
      setPerfectStreak(0);
      setBestScore((prev) => Math.max(prev, score));
      addFloatingText(
        moving.x + moving.width / 2,
        moving.y - 8,
        "MISS",
        "#ff476f"
      );
      return;
    }

    const isPerfect = Math.abs(moving.x - last.x) <= PERFECT_WINDOW;
    const snappedX = isPerfect ? last.x : overlapLeft;
    const snappedWidth = isPerfect ? last.width : overlapWidth;
    const overhangWidth = moving.width - snappedWidth;

    if (overhangWidth > 0) {
      const sliceX =
        moving.x < snappedX ? moving.x : snappedX + snappedWidth;

      setSlices((prev) => [
        ...prev,
        {
          id: sliceIdRef.current++,
          x: sliceX,
          y: moving.y,
          width: overhangWidth,
          vy: 1.8,
          color: moving.color,
        },
      ]);
    }

    if (isPerfect) {
      hapticSuccess();
    } else {
      hapticLight();
    }

    const nextStreak = isPerfect ? perfectStreak + 1 : 0;
    const multiplier = 1 + Math.floor(nextStreak / 3);
    const points = (isPerfect ? 2 : 1) * multiplier;
    const newScore = score + points;

    addFloatingText(
      snappedX + snappedWidth / 2,
      moving.y - 10,
      isPerfect ? "PERFECT" : `+${points}`,
      isPerfect ? "#ffe066" : "#ffffff"
    );

    setPerfectHit(isPerfect);
    setPerfectStreak(nextStreak);
    setScore(newScore);
    setBestScore((prev) => Math.max(prev, newScore));

    let nextStack = [
      ...stack,
      {
        x: snappedX,
        y: last.y - LAYER_HEIGHT,
        width: snappedWidth,
        color: moving.color,
      },
    ];

    const nextDirection = Math.random() < 0.5 ? -1 : 1;
    let nextMoving: Layer = {
      x: nextDirection > 0 ? 0 : screenWidth - snappedWidth,
      y: last.y - LAYER_HEIGHT * 2,
      width: snappedWidth,
      color: randomCakeColor(),
    };

    const targetTop = screenHeight * 0.3;
    if (nextMoving.y < targetTop) {
      const shift = targetTop - nextMoving.y;
      nextStack = nextStack.map((layer) => ({ ...layer, y: layer.y + shift }));
      nextMoving = { ...nextMoving, y: nextMoving.y + shift };
      setSlices((prev) => prev.map((piece) => ({ ...piece, y: piece.y + shift })));
    }

    setStack(nextStack);
    setMoving(nextMoving);
    setSpeed((prev) =>
      Math.min(prev + currentDifficulty.speedStep, currentDifficulty.maxSpeed)
    );
    setDirection(nextDirection);
    setLastPlacedIndex(nextStack.length - 1);
    placedLayerAnim.setValue(0);
    Animated.timing(placedLayerAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const onPress = () => {
    if (showSettings) {
      return;
    }

    if (phase === "idle") {
      start();
      return;
    }

    if (phase === "gameover") {
      reset();
      return;
    }

    placeLayer();
  };

  return (
    <TouchableWithoutFeedback onPress={onPress}>
      <Animated.View style={[styles.container, { transform: [{ translateX: shakeX }] }]}>
        <StatusBar hidden />

        <View style={[styles.skyTop, { backgroundColor: currentTheme.skyTop }]} />
        <View
          style={[styles.skyBottom, { backgroundColor: currentTheme.skyBottom }]}
        />
        <View style={[styles.moonGlow, { backgroundColor: currentTheme.moonGlow }]} />
        <View style={[styles.auroraA, { backgroundColor: currentTheme.auroraA }]} />
        <View style={[styles.auroraB, { backgroundColor: currentTheme.auroraB }]} />
        <View style={styles.starA} />
        <View style={styles.starB} />
        <View style={styles.starC} />
        <View style={styles.starD} />
        <View style={styles.starE} />
        <View style={styles.starF} />
        <View style={[styles.cloudA, { backgroundColor: currentTheme.cloud }]} />
        <View style={[styles.cloudB, { backgroundColor: currentTheme.cloud }]} />
        <View style={[styles.cloudC, { backgroundColor: currentTheme.cloud }]} />
        {stack.length <= HIDE_STAND_AT && (
          <>
            <View style={styles.standShadow} />
            <View style={styles.standStem} />
            <View style={styles.standBase} />
            <View style={styles.standSide} />
            <View style={styles.standTop} />
            <View style={styles.standFrosting} />
            <View style={styles.standPearlsRow}>
              {Array.from({ length: 9 }).map((_, i) => (
                <View key={`pearl-${i}`} style={styles.standPearl} />
              ))}
            </View>
          </>
        )}

        <View style={styles.hudCard}>
          <Text style={styles.scoreText}>{score}</Text>
          <Text style={styles.bestText}>Best: {bestScore}</Text>
          <Text style={styles.comboText}>
            Combo: {perfectStreak} | Multiplier: x{1 + Math.floor(perfectStreak / 3)}
          </Text>
          {phase === "idle" && (
            <Text style={styles.modeText}>Mode: {currentDifficulty.label}</Text>
          )}
        </View>
        <Pressable
          style={styles.settingsButton}
          onPress={(e) => {
            e.stopPropagation();
            setShowSettings((prev) => !prev);
          }}
        >
          <Text style={styles.settingsButtonText}>Settings</Text>
        </Pressable>

        {showSettings && (
          <View style={styles.settingsOverlay}>
            <Pressable
              style={styles.settingsBackdrop}
              onPress={(e) => {
                e.stopPropagation();
                setShowSettings(false);
              }}
            />
            <Pressable
              style={styles.settingsPanel}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.settingsTitle}>Game Settings</Text>

              <View style={styles.settingsRow}>
                <Text style={styles.settingsLabel}>Vibration</Text>
                <Switch
                  value={vibrationEnabled}
                  onValueChange={setVibrationEnabled}
                  trackColor={{ false: "#7f9dc4", true: "#9ad6a5" }}
                  thumbColor={vibrationEnabled ? "#2a7d3e" : "#dce5f5"}
                />
              </View>
            </Pressable>
          </View>
        )}

        {phase === "idle" && (
          <View style={styles.messageWrap}>
            <View style={styles.messageCard}>
              <Text style={styles.title}>Tower Up</Text>
              <Text style={styles.message}>Tap to drop each cake layer</Text>
              <Text style={styles.subMessage}>Perfects build multiplier</Text>
              <Pressable
                style={styles.actionButton}
                onPress={(e) => {
                  e.stopPropagation();
                  start();
                }}
              >
                <Text style={styles.actionButtonText}>Start Game</Text>
              </Pressable>
              <View style={styles.difficultyRow}>
                {(
                  Object.keys(DIFFICULTY_CONFIG) as DifficultyKey[]
                ).map((key) => {
                  const isActive = key === difficulty;
                  return (
                    <Pressable
                      key={key}
                      style={[
                        styles.diffChip,
                        isActive && styles.diffChipActive,
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        setDifficulty(key);
                        setSpeed(DIFFICULTY_CONFIG[key].baseSpeed);
                      }}
                    >
                      <Text
                        style={[
                          styles.diffChipText,
                          isActive && styles.diffChipTextActive,
                        ]}
                      >
                        {DIFFICULTY_CONFIG[key].label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {phase === "gameover" && (
          <View style={styles.messageWrap}>
            <View style={[styles.messageCard, styles.gameOverCard]}>
              <Text style={styles.gameOverTitle}>Tower Fell</Text>
              <Text style={styles.message}>Your Score: {score}</Text>
              <Pressable
                style={styles.actionButton}
                onPress={(e) => {
                  e.stopPropagation();
                  reset();
                }}
              >
                <Text style={styles.actionButtonText}>Restart</Text>
              </Pressable>
            </View>
          </View>
        )}

        {visibleStack.map((layer, i) => {
          const isLast = i === lastPlacedIndex;
          const animatedStyle = isLast
            ? {
                transform: [
                  {
                    translateY: placedLayerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-8, 0],
                    }),
                  },
                  {
                    scale: placedLayerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.98, 1],
                    }),
                  },
                ],
              }
            : undefined;
          const LayerComponent = isLast ? Animated.View : View;
          return (
            <LayerComponent
              key={`layer-${i}`}
              style={[
                styles.layer,
                animatedStyle,
                {
                  left: layer.x,
                  top: layer.y,
                  width: layer.width,
                  backgroundColor: layer.color,
                },
              ]}
            >
              <View style={styles.icing} />
            </LayerComponent>
          );
        })}

        {phase !== "gameover" && (
          <View
            style={[
              styles.layer,
              {
                left: moving.x,
                top: moving.y,
                width: moving.width,
                backgroundColor: moving.color,
              },
            ]}
          >
            <View style={styles.icing} />
          </View>
        )}

        {visibleSlices.map((piece) => (
          <View
            key={piece.id}
            style={[
              styles.layer,
              {
                left: piece.x,
                top: piece.y,
                width: piece.width,
                backgroundColor: piece.color,
              },
            ]}
          >
            <View style={styles.icing} />
          </View>
        ))}

        {floatingTexts.map((item) => (
          <Text
            key={item.id}
            style={[
              styles.floatText,
              {
                left: item.x - 60,
                top: item.y,
                color: item.color,
                opacity: item.life / FLOAT_LIFE_START,
              },
            ]}
          >
            {item.text}
          </Text>
        ))}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#061426",
  },
  skyTop: {
    ...StyleSheet.absoluteFillObject,
  },
  skyBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "55%",
  },
  moonGlow: {
    position: "absolute",
    top: -40,
    right: -10,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  auroraA: {
    position: "absolute",
    top: 40,
    left: -30,
    right: -30,
    height: 140,
    borderRadius: 90,
    transform: [{ rotate: "-4deg" }],
  },
  auroraB: {
    position: "absolute",
    top: 90,
    left: -40,
    right: -20,
    height: 160,
    borderRadius: 120,
    transform: [{ rotate: "3deg" }],
  },
  starA: {
    position: "absolute",
    top: 70,
    left: 30,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  starB: {
    position: "absolute",
    top: 110,
    right: 80,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  starC: {
    position: "absolute",
    top: 160,
    left: 120,
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  starD: {
    position: "absolute",
    top: 210,
    right: 40,
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  starE: {
    position: "absolute",
    top: 140,
    right: 160,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.8)",
  },
  starF: {
    position: "absolute",
    top: 190,
    left: 40,
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  hudCard: {
    position: "absolute",
    top: 28,
    left: 14,
    right: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderRadius: 20,
    backgroundColor: "transparent",
    borderWidth: 0,
    zIndex: 18,
    elevation: 0,
    shadowOpacity: 0,
  },
  scoreText: {
    marginTop: 2,
    width: "100%",
    textAlign: "center",
    color: "#fefefe",
    fontSize: 42,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  bestText: {
    width: "100%",
    textAlign: "center",
    color: "#d7e8ff",
    fontSize: 15,
    fontWeight: "700",
  },
  comboText: {
    marginTop: 2,
    width: "100%",
    textAlign: "center",
    color: "#f1f6ff",
    fontSize: 13,
    fontWeight: "800",
  },
  modeText: {
    marginTop: 1,
    width: "100%",
    textAlign: "center",
    color: "#bcd7ff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  settingsButton: {
    position: "absolute",
    top: 40,
    right: 24,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    zIndex: 41,
    elevation: 8,
  },
  settingsButtonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 12,
  },
  settingsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
    elevation: 120,
    justifyContent: "center",
    alignItems: "center",
  },
  settingsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 16, 34, 0.35)",
  },
  settingsPanel: {
    width: 280,
    backgroundColor: "rgba(15,32,58,0.86)",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    gap: 8,
    zIndex: 121,
    elevation: 121,
  },
  settingsTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 3,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingsLabel: {
    color: "#e6efff",
    fontSize: 13,
    fontWeight: "700",
  },
  messageWrap: {
    position: "absolute",
    top: "23%",
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 24,
    zIndex: 60,
    elevation: 60,
  },
  messageCard: {
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: "rgba(6, 26, 52, 0.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  gameOverCard: {
    backgroundColor: "rgba(44, 12, 30, 0.72)",
    borderColor: "rgba(255, 158, 184, 0.45)",
  },
  title: {
    fontSize: 40,
    color: "#ffffff",
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  gameOverTitle: {
    fontSize: 42,
    color: "#ff7b97",
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  message: {
    marginTop: 8,
    fontSize: 17,
    color: "#f7fbff",
    fontWeight: "700",
  },
  subMessage: {
    marginTop: 6,
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "700",
    opacity: 0.9,
  },
  actionButton: {
    marginTop: 18,
    backgroundColor: "#ffcf74",
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#ffdca1",
    minWidth: 150,
    alignItems: "center",
    shadowColor: "#573400",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 8,
    elevation: 6,
  },
  actionButtonText: {
    color: "#1f2f46",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  difficultyRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
  },
  diffChip: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  diffChipActive: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff",
  },
  diffChipText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  diffChipTextActive: {
    color: "#1f3560",
  },
  perfectText: {
    position: "absolute",
    top: "18%",
    width: "100%",
    textAlign: "center",
    color: "#ffe89f",
    fontSize: 20,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  layer: {
    position: "absolute",
    height: LAYER_HEIGHT,
    borderRadius: 0,
    overflow: "hidden",
  },
  icing: {
    height: 9,
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  floatText: {
    position: "absolute",
    width: 120,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cloudA: {
    position: "absolute",
    top: 170,
    left: 25,
    width: 90,
    height: 32,
    borderRadius: 16,
  },
  cloudB: {
    position: "absolute",
    top: 220,
    right: 30,
    width: 120,
    height: 38,
    borderRadius: 19,
  },
  cloudC: {
    position: "absolute",
    top: 292,
    left: 74,
    width: 58,
    height: 22,
    borderRadius: 12,
  },
  standShadow: {
    position: "absolute",
    left: "18%",
    right: "18%",
    bottom: -6,
    height: 12,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  standStem: {
    position: "absolute",
    left: "44%",
    right: "44%",
    bottom: 16,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#f2d3da",
  },
  standBase: {
    position: "absolute",
    left: "34%",
    right: "34%",
    bottom: 4,
    height: 20,
    borderRadius: 18,
    backgroundColor: "#e7c0c9",
  },
  standSide: {
    position: "absolute",
    left: "8%",
    right: "8%",
    bottom: 58,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#b05c6d",
  },
  standTop: {
    position: "absolute",
    left: "6%",
    right: "6%",
    bottom: 86,
    height: 16,
    borderRadius: 14,
    backgroundColor: "#f6e2e8",
  },
  standFrosting: {
    position: "absolute",
    left: "6%",
    right: "6%",
    bottom: 80,
    height: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  standPearlsRow: {
    position: "absolute",
    left: "10%",
    right: "10%",
    bottom: 60,
    height: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  standPearl: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ff8fb0",
  },
});
