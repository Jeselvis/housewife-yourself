# Lake Sparkle Adventure

A retro choose-your-own-adventure game that parodies reality-TV housewives. You play a new cast member at a dinner party. An LLM writes the NPCs' lines and offers three hilariously wild options each beat. Your choices move four stats (Drama, Popularity, Wine Thrown, Brand Value), set story flags that change later scenes, and decide which spin-off offer you get at the end.

All characters and places are fictional. This is a standalone project.

## What's in the box

| Path | What it is |
|---|---|
| `CLAUDE.md` | Instructions for Claude Code: rules, commands, what to build next |
| `docs/PLAN.md` | The full plan: loop, architecture, features, build phases |
| `docs/ADVENTURE_FORMAT.md` | Reference for writing adventures (scenes, flags, branching, spice, endings) |
| `docs/LLM_CONTRACT.md` | The endpoint, the system prompt, the JSON the model must return, safety rails |
| `docs/PORTRAITS.md` | How the layered pixel portraits work and how to extend them |
| `schema/` | JSON Schemas: adventure, cast, LLM output |
| `cast/` | Reusable casts (characters, looks, voices, secrets) |
| `adventures/` | Playable adventures (`goat.json` is fully scripted; `reunion.json` uses LLM beats) |
| `src/engine/` | Framework-free game engine (pure functions, JSON state) |
| `src/portrait/` | Portrait layers (`layers.json`) and an SVG renderer |
| `src/validate/` | Schema + cross-reference validation, and LLM-output sanitizing |
| `mockup/Main.dc.html` | The approved visual mockup (reference for look and copy only; it can't run on its own) |
| `test/` | 29 tests (`node:test`) |

## Quick start

```bash
npm install
npm run check        # validates adventures, then runs the tests
npm run portraits    # writes preview/portraits.html, open it to see every face
```

Needs Node 20 or newer. The only dependency is Ajv (dev).

## Building it with Claude Code

```bash
cd lake-sparkle-adventure
claude
```

Then try:

> Read CLAUDE.md and docs/PLAN.md, then build Phase 1: the playable app. Match mockup/Main.dc.html, make it mobile-first, and use the engine in src/engine.

Phase 1 needs no API key. The LLM comes in Phase 2.

## Writing a new adventure

1. Copy `adventures/goat.json`, change `id`, `label`, `episode`.
2. Write scenes. Every choice names a `next` scene, `"END"`, or `"generate"` (let the LLM write it).
3. `npm run validate` catches broken references, undeclared flags, missing speakers and unreachable scenes.

See `docs/ADVENTURE_FORMAT.md`.

## Content guardrails

Camp, chaos, petty and dark humor are in. Real people and brands, explicit sexual content, slurs or stereotype humor, and tragedy as a punchline are out. A three-level Spice setting (cozy, petty, unhinged) dials the edge up or down. Level 3 allows bleeped swearing and innuendo only. Details in `docs/LLM_CONTRACT.md`.
