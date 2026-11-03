# SPOILER

**See your death before it happens. Then change it.**

A tiny, brutal platformer made for the **Loadout AI Game Competition 2026**. A picture-in-picture window labelled **SPOILER** runs a perfect copy of the game 1.5 seconds into the future, assuming you keep holding the keys you're holding right now. It shows you the spikes you're about to hit, the block that's about to drop, the floor that's about to crumble.

Then the traps start reading it too. The stalker slams down where the window says you'll be. The door runs away from the future where you reach it. Fool the future.

## Play
**Live: https://ahmardchain.github.io/spoiler/**

- **Move:** arrows / WASD. **Jump:** Space / Up / Z (hold to bounce). **R** restart, **Esc** level select, **M** mute. Touch buttons appear on phones.
- 14 single-screen levels, 5-15 seconds each, instant respawn, progress saved in `localStorage`.

## How it works
- `src/sim.ts` is a pure, DOM-free, fixed-step (60 Hz) simulation. The game, the solver bot and the tests all run the exact same code.
- The SPOILER window is a real rollout: clone the state, run 90 ticks with the held inputs, draw the result (path, death/exit marker, zoomed view of the future).
- Reactive traps (stalker, shy door) read a *ghost*, the end of that same rollout, refreshed every 6 ticks. Level 1-5 are honest previews; from level 6 the future is something the level uses against you.
- `src/bot.ts` is a layered beam-search solver (6-tick macro-actions, flood-fill heuristic). `npm run solve` finds and replay-verifies a winning input script for every level (`solutions/*.json` -> `src/solutions.json`). The tests re-play them, so a level edit that makes a level unbeatable fails CI.

## Scripts
```
npm run dev        # vite dev server
npm test           # vitest: map validity, solvability, determinism, preview == reality, reactive traps
npm run solve      # re-run the solver bot on all levels (parallel) and rebuild src/solutions.json
npm run build      # typecheck + production build into dist/
node scripts/e2e.mjs [url]   # plays every level in headless Chrome with the solver's inputs (needs Playwright + Chrome)
```

## Credits
All third-party assets are CC0 or OFL; see [CREDITS.md](CREDITS.md). Sound effects are synthesised in code. MIT licensed (code).
