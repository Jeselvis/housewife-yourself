# Plan

## 1. Concept

A choose-your-own-adventure game, styled like an old text adventure on a CRT, that parodies reality-TV housewives episodes. You are the newest cast member. Each beat gives you a scene, an NPC's line, a confessional cutaway, and three options. The options are meant to be hilariously wild. An LLM writes the NPC lines and the options; the engine owns all rules.

## 2. Game loop

1. The engine shows a scene: place, narration, speaker + portrait, line, confessional, and up to 3 choices.
2. The player picks. The engine applies stat changes (`delta`), sets story flags (`set`), records memory, and resolves `next`.
3. `next` is one of: a scene id (hand-written scene), `"generate"` (ask the LLM to write the next beat), `"END"` (episode over), or an ordered list of conditional rules.
4. At the end, the highest-qualifying ending is chosen from final stats, and a recap lists the story-defining things you did.

Hand-written scenes are the guaranteed jokes and the major branches. Generated beats fill the space between them.

## 3. Stats

| Stat | Meaning |
|---|---|
| Drama (0 to 100) | Chaos level; fuel for the LLM's escalation |
| Popularity (0 to 100) | How much the audience loves you |
| Wine Thrown | Counter, a running joke, drives bonus titles |
| Brand Value ($, min 0) | What you could sell. Separate from Popularity. Decides the ending |

Stats are defined per adventure (`stats` block: label, start, min, max, `maxStep` for LLM changes, display type), so new stats need no code changes.

## 4. Branching with flags

Choices record facts; later scenes read them. No hand-wired path explosion.

- `set`: a choice sets flags such as `bunny_enemy`.
- `requires`: a choice only appears if a condition holds. Gated choices go first and displace the last ungated one (the player always sees exactly 3).
- `next` as rules: `[{ "if": [...], "go": "x" }, { "go": "default" }]`, first match wins, last rule must be a default.
- `variants`: a scene rewrites itself when a condition holds (a callback: "you threw wine at her, remember?").
- Conditions: flags, notFlags, and stat expressions like `brand >= 40000`.

Guardrails: 10 to 15 flags per adventure, and build around hub scenes where routes converge (the dessert scene in `goat.json`). Flags that are set but never read need a `recap` line or the validator warns.

## 5. Spice (edge dial)

Three levels, switchable any time: **1 Cozy**, **2 Petty** (the base text), **3 Unhinged**. Any scene or ending can carry a `spice` block that overrides fields at that level; scenes without one read the same at every level. Characters have their own ceiling in the cast file. The LLM prompt gets the level and each speaker's ceiling.

Content line: camp, chaos, petty, dark and shameless are all fair game. Not allowed: real people or brands, explicit sexual content, slurs or stereotype humor, tragedy or self-harm as a punchline. Spice 3 means bleeped swearing and innuendo, nothing more. The adult-product ending is innuendo only and appears only at Spice 3. Mind app-store age ratings if you publish widely.

## 6. Endings

After the last beat (a scene returns `END`, or `endAfter` choices have passed), the engine picks the first ending whose `if` holds; the last has none. Tiers are brand-value based (candle line, spin-off, one more season, "Woman Near Fountain"), can be overridden per spice level, and show a recap built from the flags you set. Thresholds in `goat.json` are scaled for its short episode; a longer episode needs higher thresholds.

## 7. Portraits

Pixel-art headshots drawn from layers, so there is no picture per situation. Base face (4 hair styles, tinted per character) + mood overlay (surprised, angry, smug) + fx overlays (wine, souffle, horns, sparkle). A scene names `mood` and `fx`; the renderer stacks layers. About 11 small shared pieces serve every character. See `PORTRAITS.md`.

## 8. LLM feasibility

A lightweight model can do this because it only needs to be funny, not clever about the game: short outputs (one narration line, one NPC line, one confessional), classification from fixed lists (mood, fx, flags), and a fixed JSON schema. Risks and mitigations:

- **Joke drift** over a long episode: per-character voice and secret in the cast file, an escalation instruction, a short recent-beats list to avoid repeats.
- **Memory:** the engine feeds a compact memory list and the active flags every call; the model is not trusted to recall history.
- **Consequences:** pass the last choice and the current fx explicitly instead of making the model infer them.
- **Malformed output:** schema validation, sanitize, retry once, scripted fallback.

Test it before committing: run the same 10 choices through a small and a larger model and compare JSON validity and how often it's actually funny. A stronger model can be reserved for the opening and the finale if needed.

## 9. Architecture (as simple as possible)

```
Phone (PWA)                        Serverless function              LLM API
+----------------------+  POST     +--------------------+   call    +--------+
| UI + engine          | --------> | key + system prompt| --------> | small  |
| state in localStorage| <-------- | validate+sanitize  | <-------- | model  |
| adventures/*.json    |  scene    | retry, fallback    |   JSON    +--------+
+----------------------+           +--------------------+
```

- **Client:** static site (Vite + React), engine imported from `src/engine`, state in `localStorage`, installable as a PWA, scripted adventures work offline.
- **Endpoint:** one function, stateless. It exists only because an API key can't live in a phone app. It builds the prompt from the state the client sends, calls the model, validates and sanitizes the reply, and applies a rate limit and daily cap.
- **Hosting:** Cloudflare Pages + Pages Function by default (generous free tier); Azure Static Web Apps with a built-in Function works equally well. Keep endpoint logic host-agnostic.
- **Skip for now:** accounts, cloud saves, streaming, a database.
- **Build habits:** a `version` field on adventure files so old saves keep working; a scripted-only mode that never calls the model (offline and test mode).

## 10. Build phases

1. **Phase 0 (done):** this repo's specs, schemas, validator, engine, portrait layers, two adventures, tests.
2. **Phase 1:** playable scripted app on your phone. Mobile-first UI from the mockup; portrait component; spice and episode switchers; ending screen with recap; save and resume. No API key.
3. **Phase 2:** LLM endpoint and `generate` beats, with validation, sanitizing, retry, fallback, rate limit.
4. **Phase 3:** memory and callbacks tuned in the prompt; recent-beats list; an eval script.
5. **Phase 4:** PWA install and offline, shareable recap card, more adventures and casts.

## 11. Open questions

- Should the player be able to type their own move in addition to the three choices?
- Fixed episode length (`endAfter`) or run until a stat condition ends it?
- Which model and provider for the first test?
- Does Spice 3 ship on by default, behind a toggle, or only in a separate build?
