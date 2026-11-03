# SPOILER - submission drafts (NOT posted, NOT submitted)

Live game: https://ahmardchain.github.io/spoiler/
Repo: https://github.com/ahmardchain/spoiler
Clip: clip/spoiler-clip.mp4 (~26 s, 1920x1080; scripted/bot-driven inputs, real game rendering)

> **NEEDS A DECISION BEFORE ANY POST OR SUBMISSION:** the original pitch (a live window that shows your death 1.5 s early) was REMOVED at Ahmard's request. The name "SPOILER" no longer matches the game and the texts below are re-drafted for the new, simpler troll-platformer. Rename or confirm the name, then re-read them.
>
> Also: re-read the official Loadout rules/entry form (the rules page was behind a Vercel checkpoint during research) and confirm deadline (Fri 6 Nov 2026, 15:00 UTC = 16:00 Lagos), required fields, and whether a hosted URL, repo, video and/or X post are required. The clip is bot/script-driven and must be disclosed as such.

---

## X post (draft) - attach clip/spoiler-clip.mp4

> A tiny troll-platformer where the level watches YOU.
>
> The stalker follows you. The door runs away. 14 levels, instant respawn, plays in your browser, full screen: https://ahmardchain.github.io/spoiler/
>
> My entry for @loadoutprotocol's AI Game Competition #LoadoutAI

(Reply with repo link if wanted: https://github.com/ahmardchain/spoiler)

---

## Entry form - short description (draft)

A tiny, brutal troll-platformer in the browser: 14 single-screen levels, 3-8 seconds each, instant respawn, keyboard + touch, full-screen and no tutorial text. The traps are reactive: a stalker follows you along its rail and drops the moment you stop under it, and the exit door hops away when you get close. Floors crumble, ceilings fall and nothing is quite where you left it.

## Development plan / how it was built (draft)

1. **Idea & originality check** - researched the Loadout competition entries and the troll-platformer space (Level Devil, Trap Adventure, Syobon Action, jam entries). The first concept was a live preview of your own future; after play-testing it was cut for a cleaner, full-screen experience.
2. **Deterministic core** - a pure fixed-step (60 Hz) simulation with no DOM dependency, shared by the game, the solver and the tests.
3. **Reactive traps** - the stalker and the shy door read the real player position each tick.
4. **AI in the loop** - a beam-search solver bot plays every level offline; its replay-verified solutions prove each level is beatable and are re-checked by the test suite on every change. The same bot drives the demo clip. Levels were tuned against bot results (e.g. making sure holding right, or right + jump, never wins).
5. **Assets** - Kenney Pixel Platformer (CC0), Juhani Junkala chiptunes (CC0), Press Start 2P (OFL); sound effects synthesised in code; full list in CREDITS.md.
6. **Quality** - vitest suite (map validity, bot-solvability, determinism, reactive-trap behaviour) + a headless-Chrome end-to-end script that plays all 14 levels in the real build.
7. **Ship** - Vite + TypeScript, ~29 kB JS, static hosting on GitHub Pages.
8. **Built with AI assistance** (Grok Bot) end to end: design iteration, code, solver, tests, assets sourcing, recording.
