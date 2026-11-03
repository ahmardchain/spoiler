# SPOILER

**A tiny, brutal troll-platformer. 14 levels. Nothing is what it seems.**

Made for the **Loadout AI Game Competition 2026**. The level fills your whole screen, with no guide, no hints and no tutorial text. The traps watch where you actually are: the stalker follows you along its rail and slams down when you stop under it, and the exit door hops away when you get close.

> Note: the working title *SPOILER* came from an earlier preview mechanic (a picture-in-picture window showing your next 1.5 s). That mechanic was removed; the name is kept for now and probably needs changing.

## Play
**Live: https://ahmardchain.github.io/spoiler/**

- **Move:** arrows / WASD. **Jump:** Space / Up / Z (hold to bounce). **R** restart, **Esc** level select, **M** mute, **F** fullscreen (or the small fullscreen icon). The camera is zoomed in (hero ≈ 9% of screen height at 1080p) and follows the hero with look-ahead, pixel-crisp at any size. Semi-transparent touch buttons appear on phones.
- 14 single-screen levels, 3-8 seconds each, instant respawn, progress saved in `localStorage`.

## How it works
- `src/sim.ts` is a pure, DOM-free, fixed-step (60 Hz) simulation. The game, the solver bot and the tests all run the exact same code.
- Reactive traps read the real hero position every tick: the **stalker** chases the hero's x (with a small lead in the direction of travel) and slams after 12 ticks of being lined up and close; the **shy door** hops to its next spot when the hero stays within 48 px for 2 ticks (then rests 70 ticks). The last spot is the real exit.
- `src/bot.ts` is a layered beam-search solver (6-tick macro-actions, flood-fill heuristic). `npm run solve` finds and replay-verifies a winning input script for every level (`solutions/*.json` -> `src/solutions.json`). The tests re-play them, so a level edit that makes a level unbeatable fails CI.

## Scripts
```
npm run dev        # vite dev server
npm test           # vitest: map validity, solvability, determinism, reactive traps, no-preview checks
npm run solve      # re-run the solver bot on all levels (parallel) and rebuild src/solutions.json
npm run build      # typecheck + production build into dist/
node scripts/e2e.mjs [url]   # plays every level in headless Chrome with the solver's inputs (needs Playwright + Chrome)
```

## Credits
All third-party assets are CC0 or OFL; see [CREDITS.md](CREDITS.md). Sound effects are synthesised in code. MIT licensed (code).
