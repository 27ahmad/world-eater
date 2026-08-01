# World Eater

A self-contained HTML5 canvas browser game. Eat and grow from a microscopic mote into a galactic sovereign.

## Live Deployed Link
Play the game here: https://27ahmad.github.io/world-eater/

## Controls
- Your first run is guided by the **First Hunt** objectives; after that you're on your own.
- Drag or move mouse (or WASD / arrow keys) to move the player mote.
- Devour objects smaller than you to grow.
- On level-up, three mutation orbs appear around you — **swim into the one you want**. The game never pauses to ask. Prefer it automatic? Turn on **Auto-pick mutations** in Settings.
- **Red ring = it is hunting you.** A quiet dashed outline just means "too big to eat yet" — inert scenery shoulders you aside instead of hurting you, so the damage on screen is always something that chose to come after you.
- Threats grow faster and hit harder the longer you survive, and some hunters spawn as **elites** (ringed in red) — bigger, faster, and worth far more. At the final evolution, **apex predators** still outsize you.
- Getting hit halves your combo instead of wiping it; streaks of 25/50/100 heal you.
- Press Space, Shift, F, or E (or double-tap on touch) to dash. **A dash swallows prey slightly too big to eat normally** — the Phase Fang mutation widens that window and refunds the dash on a kill.
- Press M to toggle mute/unmute audio.
- Press Escape or P to pause.
- Press Enter to resume while paused.
- Press Q to quit run while paused.
- Press Space or Enter to restart on Game Over or Victory screens.
- Press Escape to return to menu on Game Over or Victory screens.

## Project Structure
- index.html: Game page structure, UI screens, and styling.
- game.js: Core game engine, procedural audio system, particles, and gameplay logic.
