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
| `adventures/` | Live playable adventures (drop a `.json` here to add one to the app) |
| `adventures/archived/` | Adventures removed from the live game (kept for reference) |
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

1. Copy an existing adventure from `adventures/archived/`, change `id`, `label`, `episode`.
2. Write scenes. Every choice names a `next` scene, `"END"`, or `"generate"` (let the LLM write it).
3. `npm run validate` catches broken references, undeclared flags, missing speakers and unreachable scenes.
4. Add an import and entry to `functions/api/scene.mjs` so the Worker can serve LLM beats for it.
5. The app picks it up automatically via `import.meta.glob` — no code change needed on the frontend.

To archive an adventure: move its `.json` to `adventures/archived/` and remove its import from `functions/api/scene.mjs`.

See `docs/ADVENTURE_FORMAT.md` and `docs/adventure-authoring-brief.md`.

## Deployment

Pushes to `main` trigger GitHub Actions (`.github/workflows/deploy.yml`), which builds the app and deploys the Worker to Cloudflare. Secrets (`MAGICA_API_KEY`, `GEMINI_API_KEY`, `SCENE_PROVIDER`, `CF_API_TOKEN`) live in GitHub → Settings → Secrets → Actions and are set on the Worker automatically on each deploy.

Cloudflare's own git integration is disabled ("Disable builds" enabled in project settings) to avoid double-deploys.

See `docs/DEPLOY.md` for initial setup steps.

## Debugging the LLM endpoint

Stream Worker logs live while playing the game:

```bash
npx wrangler tail realyouwives
```

Logs show LLM validation errors and raw output. Run in a separate terminal; authenticate first with `npx wrangler login` if needed.

## Content guardrails

Camp, chaos, petty and dark humor are in. Real people and brands, explicit sexual content, slurs or stereotype humor, and tragedy as a punchline are out. A three-level Spice setting (cozy, petty, unhinged) dials the edge up or down. Level 3 allows bleeped swearing and innuendo only. Details in `docs/LLM_CONTRACT.md`.
