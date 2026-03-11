# **Reflection**

## **What was your game idea?**
My game idea was a one‑button stacking game: “Tower Up,” where you tap to drop moving cake layers onto a growing tower. Each layer slides side to side; your single tap locks it in place, and any overhang is sliced off and falls. Perfect alignment builds a combo multiplier, and the pace accelerates as the tower grows. I wanted it to feel satisfying and readable with a cozy, dessert‑themed look, subtle haptics, and a sky background that changes theme between rounds👍.

## **What was the most difficult part to implement?**
The most difficult part to implement was the real‑time😭 feel without a physics engine. I had to balance the requestAnimationFrame loop, state updates, and visual effects so the game stayed smooth on mobile. That meant carefully managing the moving layer position, the falling slices, and floating score text—each with its own lifecycle and cleanup. The placement logic also required precise math: computing overlap, snapping on “perfect” hits, trimming overhangs, and shifting the entire stack upward once it reached a target height to keep the action centered. Getting that right while avoiding janky jumps or out‑of‑sync animations took the most iteration.

## **What would you improve with more time?**

With more time😭, I’d improve both depth and polish. On the gameplay side, I’d add more modes (time attack, endless, or “precision only”), and expand the difficulty system with dynamic modifiers rather than just speed scaling. I’d also add achievements, streak rewards, and optional power‑ups to encourage longer sessions. On the presentation side, I’d add sound design, more reactive particle effects, and better feedback for perfect streaks (e.g., a brief glow or aura). Finally, I’d improve accessibility (color‑blind palette options, larger UI mode), performance tuning on lower‑end devices, and a proper tutorial flow so new players understand the perfect‑window and multiplier system immediately.



