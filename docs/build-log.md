# Build Log

## 2026-11-09 — Cross-adventure global flags

**What:** A lightweight persistent flag system letting any adventure read or write a small shared set of flags stored separately from per-episode state (`state.globalFlags`, seeded and persisted to `localStorage` by the app layer).

**Why:** Players who replay episodes or play multiple adventures should see the world react to their history. If you took the iguana in EP 11, Magdalena should know at the wedding. If you flipped a table in the Wedding Special, Georgie Chase should recognise you at the holiday party.

**Order-independence:** Global flags only gate bonus variants and optional choices. Every scene always has at least 3 ungated choices — game is fully playable without any global flags set. Play adventures in any order; replay old ones to earn callbacks.

**Current flags:**

| Flag | Set by | Read by | Trigger |
|---|---|---|---|
| `iguana_keeper` | toast (EP 11) | passions (Wedding Special) | Take the iguana at Secret Santa |
| `wine_ally` | toast (EP 11) | passions (Wedding Special) | Defend Roxy's brand at Janna's party |
| `said_it_before` | toast or passions | both | Say what you said, on camera |
| `chaos_agent` | passions (Wedding Special) | toast (EP 11) | Flip the buffet table |

**Files changed:** `globals.json` (new), `schema/globals.schema.json` (new), `schema/adventure.schema.json`, `src/engine/conditions.js`, `src/engine/engine.js`, `src/validate/validate.js`, `scripts/validate-adventures.mjs`, `testkit/helpers.mjs`, `adventures/toast.json`, `adventures/passions.json`

## 2026-11-07 — Replaced Ajv with inline validator in Worker

**What changed:** `functions/api/scene.mjs` no longer imports `ajv` or `src/validate/validate.js`. Schema validation is now a simple inline function checking property existence and allowlists.

**Why:** Cloudflare Workers block `eval()` and `new Function()` for security. Ajv compiles JSON Schemas into validator functions using `new Function()`, which threw `"Code generation from strings disallowed for this context"` and caused every LLM generate beat to fall back.

**Safety tradeoff:** Ajv caught structural schema violations precisely. The inline validator catches the same things that actually matter at runtime — missing required fields, speaker not in cast, invalid mood/fx values, bad `next` values. `sanitizeGeneratedScene` still runs after validation and clamps/strips anything the LLM sneaks through (unknown flags, out-of-range stat deltas, invalid fx). Real protection was always there; Ajv was belt-and-suspenders.

**Rule:** Do not add Ajv (or any schema library that uses codegen) as a dependency of `functions/` or `worker.js`. Use it in `src/validate/` for local CLI tooling only.

## 2026-11-08 — Added explicit JSON schema example to system prompt

**What changed:** `buildSystemPrompt` in `functions/api/scene.mjs` now includes a formatted JSON example showing every required field and the choices array shape.

**Why:** After the Ajv fix deployed, scenes still fell back — the LLM was returning wrong field names (no `place`, choices without `text`). The system prompt said "match the schema" but never showed field names explicitly. Adding a concrete example stopped the guessing.

**Rule:** When the LLM must produce a specific JSON shape, show a literal example in the prompt — don't describe the schema in prose.
