# SPOILER - submission drafts (NOT posted, NOT submitted)

Live game: https://ahmardchain.github.io/spoiler/
Repo: https://github.com/ahmardchain/spoiler
Clip: clip/spoiler-clip.mp4 (26 s, 1920x1080; scripted/bot-driven inputs, real game rendering)

> Before submitting: re-read the official Loadout rules/entry form (the rules page was behind a Vercel checkpoint during research) and confirm deadline (Fri 6 Nov 2026, 15:00 UTC = 16:00 Lagos), required fields, and whether a hosted URL, repo, video and/or X post are required.

---

## X post (draft) - attach clip/spoiler-clip.mp4

Option A (short):

> I made a platformer that shows you your own death 1.5 seconds early.
>
> Then the traps learned to read it.
>
> SPOILER: 14 levels, 5-15 seconds each, instant respawn. Play free in your browser: https://ahmardchain.github.io/spoiler/
>
> My entry for @loadoutprotocol's AI Game Competition #LoadoutAI

Option B (hook-first):

> The corner window says "YOU DIE IN 0.4s".
> So you jump. Now the stalker is aiming at where the window says you'll land.
>
> SPOILER - a browser platformer where the future is a spoiler, and the level can read it too. Free, no download: https://ahmardchain.github.io/spoiler/
>
> @loadoutprotocol AI Game Competition entry

(Reply with repo link if wanted: https://github.com/ahmardchain/spoiler)

---

## Entry form - short description (draft)

SPOILER is a one-button-simple, brutally short platformer with one idea: a picture-in-picture window labelled SPOILER runs a perfect copy of the game 1.5 seconds into the future (assuming you keep holding the same keys) and shows your death before it happens: spikes, falling blocks, crumbling floors, saws. From level 6 the traps read that same preview: a stalker slams down where you are *predicted* to be, and the exit door runs away from the future where you reach it. You win by changing the future you were shown. 14 levels, 5-15 s each, instant respawn, keyboard + touch, plays instantly in the browser with no install.

## Development plan / how it was built (draft)

1. **Idea & originality check** - researched the Loadout competition entries and the "troll platformer" space (Level Devil, Trap Adventure, Syobon Action, jam entries). None we found use a live, readable preview of the player's own future as the core mechanic.
2. **Deterministic core** - a pure fixed-step (60 Hz) simulation with no DOM dependency. Because it is deterministic and cheap to clone, the "future window" is just a real rollout (clone state, run 90 ticks with held input), not a fake animation.
3. **Reactive traps** - stalker and shy door consume a "ghost" (the end of that same rollout), so the honest preview becomes something the level can exploit. Levels 1-5 teach honest previews; 6+ add the feint.
4. **AI in the loop** - a beam-search solver bot (6-tick macro actions, flood-fill heuristic) plays every level offline; its replay-verified solutions prove each level is beatable and are re-checked by the test suite on every change. The same bot drives the demo clip. Level and trap tuning iterated against bot results (e.g. making levels fail "just hold right").
5. **Assets** - Kenney Pixel Platformer (CC0), Juhani Junkala chiptunes (CC0), Press Start 2P (OFL); sound effects synthesised in code; full list in CREDITS.md.
6. **Quality** - vitest suite (69 tests: map validity, bot-solvability, determinism, preview == reality, reactive-trap behaviour) + a headless-Chrome end-to-end script that plays all 14 levels in the real build.
7. **Ship** - Vite + TypeScript, ~31 kB JS, static hosting on GitHub Pages; loads fast and plays instantly.
8. **Built with AI assistance** (Grok Bot) end to end: design iteration, code, solver, tests, assets sourcing, recording.
