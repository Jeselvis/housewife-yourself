# Adventure format (v1)

One JSON file per adventure in `adventures/`. Validate with `npm run validate`. The schema is `schema/adventure.schema.json`; add `"$schema": "../schema/adventure.schema.json"` at the top for editor autocomplete.

## Top level

```json
{
  "version": 1,
  "id": "goat",
  "label": "EP 7",
  "episode": "SEASON 4 · EPISODE 7 · \"WHO INVITED THE GOAT?\"",
  "cast": "lake-sparkle",
  "tone": "Absurd, escalating, petty.",
  "endAfter": 6,
  "stats": { },
  "flags": { },
  "items": { },
  "scenes": { },
  "endings": [ ]
}
```

| Field | Notes |
|---|---|
| `version` | Always `1`. Bump when the format changes so old saves can be migrated |
| `id` | Lowercase, digits, dashes |
| `label` | Short tab label (12 characters max) |
| `cast` | Id of a file in `cast/`. Every `speaker` must be a character in it |
| `tone` | Style note fed to the LLM for generated beats. Required if anything uses `"generate"` |
| `endAfter` | Optional. Forces the ending after this many choices, even if the scene says `generate` |

## Stats

```json
"stats": {
  "drama":   { "label": "Drama",       "start": 62,    "min": 0, "max": 100, "maxStep": 30,    "display": "bar" },
  "brand":   { "label": "Brand Value", "start": 25000, "min": 0,               "maxStep": 25000, "display": "money" }
}
```

`min`/`max` clamp. `maxStep` is the largest change an LLM-written choice may apply (hand-written choices aren't limited). `display` is `bar`, `number` or `money`. Any stat key can be used in `delta` and in conditions.

## Flags

```json
"flags": {
  "wine_thrown": { "recap": "You poured wine on Bunny's head." },
  "bunny_enemy": {}
}
```

Every flag must be declared. This is also the allowlist for flags the LLM may propose. `recap` is the line shown on the ending screen when the flag is set (in the order flags were set). A flag that is set but never read by a condition should have a `recap`, or the validator warns.

## Items

```json
"items": {
  "bunny_knife":  { "label": "Bunny's Knife" },
  "goat_deed":    { "label": "Deed to the Goat" }
}
```

Persistent inventory carried through the episode. Every item must be declared. `label` is the display name shown in the inventory strip.

Choices use `give` and `consume` to add or remove items:

```json
{ "text": "Accept the knife.",  "next": "dessert", "give":    ["bunny_knife"] }
{ "text": "Return the knife.",  "next": "dessert", "consume": ["bunny_knife"] }
```

Conditions use `hasItems` / `notItems` (same object form as `flags` / `notFlags`):

```json
{ "hasItems": ["bunny_knife"], "notItems": ["goat_deed"] }
```

The validator errors if an item is used in a condition but no choice ever gives it, and warns if an item is declared but never given or never read.

## Scenes

```json
"twin": {
  "place": "VILLA SPARKLE · THE DINING ROOM · 8:44 PM",
  "narration": "Bunny rises. Her pearls rise one second later, out of respect.",
  "speaker": "BUNNY VANDERKLEET",
  "line": "A twin? I was an only child. I made sure of it.",
  "confessional": "If she's my twin, where's my half of the inheritance?",
  "mood": "surprised",
  "fx": ["wine"],
  "memory": ["Bunny now suspects you of being family."],
  "choices": [ ],
  "variants": [ ],
  "spice": { }
}
```

- `start` is required and is where every episode begins. Scene ids are lowercase with underscores. `generate` and `END` are reserved.
- `place`, `narration` and `choices` are required. `speaker`, `line`, `confessional` are optional (a scene with no `line` shows narration only).
- `mood`: `neutral` (default), `surprised`, `angry`, `smug`. `fx`: any of `wine`, `souffle`, `horns`, `sparkle`. They affect the speaker's portrait.
- `memory`: short facts added to the cast's memory when the scene is entered. Shown in the footer and fed to the LLM.

### Choices

```json
{
  "text": "Pour your wine on Bunny's head. It's how twins are tested.",
  "next": "wined",
  "delta": { "drama": 20, "glasses": 1, "brand": 15000 },
  "set": ["wine_thrown", "bunny_enemy"],
  "requires": ["bunny_enemy"],
  "hint": "Only for next: \"generate\". A nudge to the LLM."
}
```

- `text` and `next` are required. `delta`, `set`, `give`, `consume`, `requires`, `hint` are optional.
- **Always author at least 3 choices that have no `requires`**, so the player sees 3 no matter what. The engine shows the first 3 choices whose `requires` holds, in authored order, so put gated choices first and they displace the last ungated one.

### `next`

| Value | Meaning |
|---|---|
| `"scene_id"` | Go to that scene |
| `"END"` | Episode over; pick an ending |
| `"generate"` | Ask the LLM for the next beat (Phase 2). Until then the engine uses `fallbackScene` |
| `[ { "if": cond, "go": target }, ..., { "go": target } ]` | Ordered rules. First match wins. The **last rule must have no `if`** |

### Conditions (`requires`, `if`)

Either a flag list (all must be set) or an object. Everything listed must hold.

```json
["wine_thrown", "bunny_enemy"]

{ "flags": ["a"], "notFlags": ["b"], "stats": { "brand": ">=40000", "drama": "<50" }, "hasItems": ["bunny_knife"], "notItems": ["goat_deed"] }
```

Stat operators: `>=  <=  >  <  ==  !=`.

### `variants`: callbacks

```json
"variants": [
  { "if": ["bunny_enemy"],
    "use": { "speaker": "BUNNY VANDERKLEET", "line": "Why don't you cut it, darling? I brought my own knife.", "fx": ["wine"] } }
]
```

The first variant whose `if` holds is merged over the base scene. `use` can override any scene field except `variants` and `spice`.

### `spice`: the edge dial

```json
"spice": {
  "1": { "line": "Oh sweetheart, that's Bunny's special chair." },
  "3": { "line": "You absolute [BLEEP]. You sat in Bunny's chair." }
}
```

Level 2 is the base text. Each entry overrides any scene field except `variants` and `spice`. If a scene has no `spice` block it reads the same at every level.

**Merge order:** base scene, then the first matching variant, then the spice override (spice wins).

## Acts

```json
"acts": [
  {
    "goal": "Establish yourself — discover Vangie's secret or Crystal's plan before the ceremony.",
    "until": { "stats": { "drama": ">=75" } },
    "minBeats": 2
  },
  {
    "goal": "The ceremony must be disrupted. Interrupt the vows or unleash Magdalena.",
    "until": { "stats": { "drama": ">=90" } },
    "minBeats": 3,
    "anchor": "confrontation"
  },
  {
    "goal": "Everything is in the open. Escalate to the ending.",
    "minBeats": 3
  }
]
```

Acts are the spine of the story. All acts must complete before `END` choices unlock.

| Field | Notes |
|---|---|
| `goal` | Injected into the LLM user message as `Act goal:` so each beat steers toward the right part of the story |
| `until` | Condition (same format as `requires`/`if`) that completes this act. Omit for a time-only act |
| `minBeats` | The act cannot complete until at least this many beats have been played in it |
| `anchor` | Optional scene id. When this act completes, the engine routes here automatically — useful to force a scripted turning point |

**Rules:**
- Acts are checked after every `choose()` call. If `actBeat >= minBeats` **and** `until` is met (or omitted), the act advances.
- `END` is blocked (overridden to `generate`) while `act < acts.length`. Once all acts are done, `END` works normally.
- An `anchor` fires before the choice's own `next` is resolved — it overrides routing entirely.
- The last act should have no `until` and use `minBeats` alone to enforce a minimum confrontation length.
- The act `goal` is *not* shown to the player — it's a director's note to the LLM.

## Endings

```json
"endings": [
  { "if": { "stats": { "brand": ">=70000" } },
    "title": "Your Own Candle Line",
    "text": "The network wants a scent called 'Souffle Fury.'",
    "spice": { "1": { "title": "Your Own Tea Collection", "text": "..." } } },
  { "title": "Woman Near Fountain", "text": "You get one minute of screen time." }
]
```

First ending whose `if` holds wins. The last ending must have no `if`. The ending screen also shows the `recap` of every flag set. Tune thresholds to your episode length.

## Authoring checklist

- Keep to 10 to 15 flags. Prefer a few hub scenes (like `dessert` in `goat.json`) where all routes converge and flags change what happens there.
- Put the funniest, most specific jokes in hand-written scenes; use `"generate"` for connective beats.
- Give every `generate` choice a `hint` for the beat you want, and set the adventure `tone`.
- `npm run validate` before playing. Warnings are worth reading: unreachable scenes and unused flags are usually mistakes.

## What the validator checks

Schema shape; unknown moods, fx, typos; every `next`/`go` target exists; the last `next` rule and last ending have no `if`; every flag used or set is declared; a flag read in a condition is set by some choice; delta and condition stats exist; every speaker is in the cast; at least 3 ungated choices per scene (including variants and spice overrides); every item used in a condition is given by some choice; scenes unreachable from `start` (warning); flags declared but never set, or set but never read and without a `recap` (warnings); items declared but never given, or given but never used in a condition (warnings).
