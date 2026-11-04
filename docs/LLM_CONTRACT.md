# LLM contract

How a `"generate"` beat works end to end. Implement this in Phase 2. Keep the logic in one host-agnostic module (build prompt, call provider, validate, sanitize) with a thin adapter for the host (Cloudflare Pages Function, Azure Static Web Apps, etc.).

## Flow

```
client: choose() returns status "generate"
  -> POST /api/scene  { adventureId, spice, state summary, lastScene, choice, hint }
server: build prompt -> call model -> parse JSON
  -> validateGeneratedScene  (schema + speaker is in the cast)
  -> sanitizeGeneratedScene  (drop unapproved flags and unknown stats, clamp deltas)
  -> on any failure: retry once with the error appended, then respond { fallback: true }
client: provideGeneratedScene(adventure, state, scene)  or  fallbackScene(state)
```

`validateGeneratedScene` and `sanitizeGeneratedScene` already exist in `src/validate/validate.js` and are tested. The client never calls the model directly and never holds a key.

## Request

Keep it small; the server is stateless.

```json
{
  "adventureId": "reunion",
  "spice": 2,
  "stats": { "drama": 77, "pop": 63, "glasses": 1, "brand": 38000 },
  "flags": ["tabloid_confessed"],
  "memory": ["Chad has everyone's texts."],
  "recentBeats": ["Chad: 'A tabloid! In my house!'", "You: Demanded a cut."],
  "lastScene": { "place": "...", "speaker": "HOST CHAD BELLAMY-OKAFOR", "line": "..." },
  "choice": { "text": "Stand up and declare yourself the tabloid.", "hint": "The couch reacts." },
  "beat": 1
}
```

The server loads the adventure and cast itself (by id) for `tone`, the approved flag list, stat definitions, and character voices, so the client can't inject them. Cap `memory` to about 8 items and `recentBeats` to about 4. Reject unknown `adventureId` and oversized bodies.

## Response

Exactly the shape in `schema/generated-scene.schema.json`:

```json
{
  "place": "STUDIO 9 · THE REUNION COUCH · LIVE",
  "narration": "The audience gasps in unison. Somewhere, a producer is weeping with joy.",
  "speaker": "HOST CHAD BELLAMY-OKAFOR",
  "line": "A tabloid! In my house!",
  "confessional": "I'd like to thank the goat.",
  "mood": "surprised",
  "fx": ["sparkle"],
  "memory": ["Chad is delighted by your confession."],
  "choices": [
    { "text": "...", "next": "generate", "delta": { "drama": 15, "brand": 10000 }, "set": ["tabloid_confessed"] },
    { "text": "...", "next": "generate", "delta": { "pop": 10 } },
    { "text": "...", "next": "END", "delta": { "drama": 20, "pop": -5 }, "hint": "optional" }
  ]
}
```

Exactly 3 choices. `next` is only `"generate"` or `"END"` (a model can't invent scene ids). Use structured/JSON output mode if the provider has one.

## System prompt (starting point)

```
You write one beat of "The Real Housewives of Lake Sparkle", a retro text-adventure parody of reality TV. Every character and place is fictional.

TONE: {adventure.tone}
SPICE LEVEL: {spice}
{spice guide for that level}

Reply with ONE JSON object that matches the schema. No prose, no code fences.

RULES
- speaker must be exactly one of the cast names below.
- narration: 1 or 2 sentences, present tense, second person ("you").
- line: the speaker's words, in their voice. confessional: a short aside to camera.
- React to the player's last choice and to the active flags. Callback to memory facts when it's funny.
- Each beat is wilder than the last. Never repeat a joke from RECENT BEATS.
- Exactly 3 choices. Each is a distinct, absurd move the player could make. Make them funny to read, not just wild.
- delta: small integers. Brand Value moves in dollars (typically 3000 to 20000).
- set: only flags from APPROVED FLAGS, and only when the choice would plausibly cause it.
- mood: neutral | surprised | angry | smug. fx: wine | souffle | horns | sparkle, only when something physically happens to the speaker.
- Never make the speaker's line more spicy than their own ceiling.

CAST
{for each character: NAME, voice, secret (hint, never state outright), spice ceiling}

APPROVED FLAGS: {flag ids}
STATS: {stat ids}
```

### Spice guide

| Level | Guide text |
|---|---|
| 1 Cozy | Gentle camp. Passive-aggressive politeness. Silly chaos, no insults. |
| 2 Petty | Vain, vengeful, shameless. Dark confessionals. Mild insults, no swearing. |
| 3 Unhinged | Savage, feral, wildly escalating. Swearing is always bleeped like "[BLEEP]". Innuendo is fine and stays implied, never explicit. |

### Always off limits (all levels)

Real people, real brands, real shows or cast. Explicit sexual content. Slurs or humor that punches at a group of people. Self-harm, suicide, abuse or real tragedies as a punchline. Targeting a private individual. The target of the joke is a character's ego, not a category of people. If a choice would need any of this, write a different choice.

## Reliability

| Failure | Handling |
|---|---|
| Not JSON / schema fails | Retry once with the validation errors appended; then fallback |
| Speaker not in cast | Same as above |
| Unknown flags or stats | `sanitizeGeneratedScene` drops them silently |
| Delta too large | Clamped to the stat's `maxStep` |
| Provider timeout (set about 8 s) or error | Fallback scene |
| Over the rate limit or daily cap | Respond with fallback and a flag the UI can show ("the producers are on a break") |

`fallbackScene` is safe and always has 3 choices that end the episode, so a bad call never softlocks the game.

## Cost and abuse control

- Short prompts: system prompt + state is on the order of 600 tokens in, 300 to 400 out.
- A small model for every beat; optionally a stronger one for the opening and finale only.
- Server-side per-IP rate limit and a global daily cap; reject bodies over a few KB; never echo raw model output to the client unvalidated.
- Log validity rate and retry rate (no player text) so you can see how often the model needs a fallback.

## Evaluation script (Phase 3)

`scripts/eval.mjs`: play a fixed list of choice indices through the real endpoint N times on each candidate model and print: valid-JSON rate, retry rate, fallback rate, average latency. Read a handful of outputs yourself. Whether it's funny is the real metric.
