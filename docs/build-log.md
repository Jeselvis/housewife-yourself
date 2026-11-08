# Build Log

## 2026-11-07 — Replaced Ajv with inline validator in Worker

**What changed:** `functions/api/scene.mjs` no longer imports `ajv` or `src/validate/validate.js`. Schema validation is now a simple inline function checking property existence and allowlists.

**Why:** Cloudflare Workers block `eval()` and `new Function()` for security. Ajv compiles JSON Schemas into validator functions using `new Function()`, which threw `"Code generation from strings disallowed for this context"` and caused every LLM generate beat to fall back.

**Safety tradeoff:** Ajv caught structural schema violations precisely. The inline validator catches the same things that actually matter at runtime — missing required fields, speaker not in cast, invalid mood/fx values, bad `next` values. `sanitizeGeneratedScene` still runs after validation and clamps/strips anything the LLM sneaks through (unknown flags, out-of-range stat deltas, invalid fx). Real protection was always there; Ajv was belt-and-suspenders.

**Rule:** Do not add Ajv (or any schema library that uses codegen) as a dependency of `functions/` or `worker.js`. Use it in `src/validate/` for local CLI tooling only.

## 2026-11-08 — Added explicit JSON schema example to system prompt

**What changed:** `buildSystemPrompt` in `functions/api/scene.mjs` now includes a formatted JSON example showing every required field and the choices array shape.

**Why:** After the Ajv fix deployed, scenes still fell back — the LLM was returning wrong field names (no `place`, choices without `text`). The system prompt said "match the schema" but never showed field names explicitly. Adding a concrete example stopped the guessing.

**Rule:** When the LLM must produce a specific JSON shape, show a literal example in the prompt — don't describe the schema in prose.
