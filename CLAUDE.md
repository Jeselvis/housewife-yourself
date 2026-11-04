# Lake Sparkle Adventure

Retro choose-your-own-adventure reality-TV parody. An LLM writes NPC dialogue and offers 3 wild choices each beat. Standalone project: not related to any other repo or project.

Read `docs/PLAN.md` first for the full picture. `docs/ADVENTURE_FORMAT.md` and `docs/LLM_CONTRACT.md` are the specs.

## Commands

```bash
npm install
npm run validate     # cast + adventures: schema, then cross-reference checks
npm test             # node:test, no framework
npm run check        # both. Run before finishing ANY change.
npm run portraits    # writes preview/portraits.html (gitignored); screenshot it after touching portraits
```

## Rules

1. **Content is data.** Scene text, choices, flags, endings and cast live in `adventures/*.json` and `cast/*.json`. Never hardcode story text in code, except `fallbackScene` in the engine.
2. **The engine stays pure.** `src/engine/` has no DOM, network, clock or randomness. State is plain JSON and every function returns a new state. It must stay importable from a browser, a Worker and Node.
3. **Schema, validator, docs move together.** If you change the adventure format, update `schema/adventure.schema.json`, `src/validate/validate.js`, `docs/ADVENTURE_FORMAT.md` and the shipped adventures in the same change, and add a test.
4. **Never trust model output.** LLM scenes go through `validateGeneratedScene` then `sanitizeGeneratedScene` before they reach the engine. Moods, fx and flags are allowlists. Deltas are clamped by each stat's `maxStep`. On any failure: retry once, then `fallbackScene`.
5. **No API keys in the client.** The browser talks to our own endpoint only. Endpoint logic lives in a provider-agnostic module so the host (Cloudflare Pages Function by default, Azure Static Web Apps as an alternative) is a thin adapter.
6. **Original and fictional.** No real people, no real brands, no real show or cast names. Keep Spice 3 to bleeped swearing and innuendo. See `docs/LLM_CONTRACT.md` for the content rules, and keep them in the system prompt.
7. **Keep it simple.** No accounts, no database, no server state. Game state lives on the device (localStorage) and travels with each request. Don't add a state library or UI kit unless there's a concrete need.

## Layout

```
src/engine/      conditions.js, engine.js (createState, resolveScene, visibleChoices, choose, ...)
src/portrait/    layers.json (source of truth for the pixel art), render.js
src/validate/    validate.js (Ajv + semantic checks + sanitizeGeneratedScene)
schema/          adventure, cast, generated-scene JSON Schemas
adventures/      goat.json (scripted), reunion.json (LLM beats)
cast/            lake-sparkle.json
testkit/         test helpers (kept out of test/ so node --test doesn't run them)
mockup/          approved visual design, reference only
```

Create the web app in `app/` (Vite + React) and the endpoint in `api/` or `functions/`. Import the engine with a relative path (`../src/engine/index.js`). Do not copy it.

## Visual design (from the approved mockup)

Retro terminal / 8-bit TV look. Scanline background.

| Token | Value |
|---|---|
| Background | `#170a21` with faint 1px scanlines every 4px |
| Panel | `#24112f`, border `#ffd54a` (3px) |
| Pink (primary, choices, drama) | `#ff6fb1` |
| Gold (headings, labels) | `#ffd54a` |
| Teal (popularity, confessional) | `#5ee6d6` |
| Money green (brand value) | `#7dff9b` |
| Text | cream `#f6ead8`, lavender `#c9b3d6`, dim purple `#3a1a4d` |
| Fonts | `Press Start 2P` (headings, labels), `VT323` (body) via Google Fonts |

Layout, top to bottom: title and episode, spice + episode switchers, stats row, scene panel (place, narration, portrait + speaker line), confessional cutaway (teal dashed box), "WHAT DO YOU DO?" with three lettered buttons, footer (cast memory, episode picker).

The mockup is a fixed 960px board. **The real app must be mobile-first** (390px wide, choice buttons reachable by thumb, 44px minimum touch targets, text contrast 4.5:1 or better, portraits stay crisp via `shape-rendering: crispEdges`). Respect `prefers-reduced-motion`.

## Status

- [x] **Phase 0:** specs, schemas, validator, engine core, portrait layers + renderer, two adventures, 29 tests
- [ ] **Phase 1:** playable app, scripted only (no LLM, no API key). Mobile-first UI from the mockup, `Portrait` component, stats row, flags + branching via the engine, spice switcher, episode picker, ending screen with recap, save/resume in localStorage. `"generate"` beats use `fallbackScene` for now.
- [ ] **Phase 2:** LLM endpoint per `docs/LLM_CONTRACT.md`: prompt builder, provider call, validate, sanitize, retry once, fallback. Rate limit and daily cap. A `?scripted=1` mode that never calls the model.
- [ ] **Phase 3:** cast memory and callbacks tuned in the prompt; recent-beats list to avoid repeated jokes; a small eval script that plays N choices through the model and reports JSON validity.
- [ ] **Phase 4:** PWA (manifest, service worker, offline for scripted adventures), shareable recap card, more adventures and a second cast.

## Definition of done for a change

`npm run check` is green, new behavior has a test, docs match the code, and anything visual has been looked at in a screenshot at 390px and desktop width.
