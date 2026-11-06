# Adventure authoring brief

You are writing a new adventure for **Lake Sparkle Adventure** — a retro choose-your-own-adventure parody of reality TV. The player is a new housewife on the fictional show "The Real Housewives of Lake Sparkle." Every character and place is fictional.

## Your task

Write one complete adventure as a single valid JSON file, matching the format in `ADVENTURE_FORMAT.md` and the schema in `adventure.schema.json`. Output only the JSON — no prose, no code fences.

## Files attached

| File | Purpose |
|---|---|
| `ADVENTURE_FORMAT.md` | Full format spec. Read this carefully. |
| `adventure.schema.json` | JSON Schema the file must pass. |
| `lake-sparkle.json` | Cast: exact character names, voices, spice ceilings. Every `speaker` value must match a key here exactly. |
| `goat.json` | A complete working example. Use it as a pattern. |

## What I want

Tell me the episode concept before you write, or I'll describe it here:

> *(Replace this line with your episode brief — setting, inciting incident, tone, any specific flags or items you want.)*

## Hard rules

1. `"id"` — lowercase, digits, dashes. Pick something short and memorable.
2. `"cast"` must be `"lake-sparkle"`.
3. Every `speaker` is an exact key from `lake-sparkle.json`.
4. Every flag used in `set` or `requires` must be declared in top-level `"flags"`.
5. Every item used in `give`, `consume`, `hasItems`, `notItems` must be declared in top-level `"items"`.
6. Every scene needs **at least 3 choices with no `requires`** (gated choices are allowed on top).
7. Last rule in a `next` array and last entry in `endings` must have no `"if"`.
8. `"generate"` and `"END"` are reserved — don't use them as scene ids.
9. No real people, real brands, or real show names. No explicit content. Swearing at spice 3 is always bleeped as `[BLEEP]`.

## Authoring tips

- Keep flags to 10–15. Use a hub scene where routes converge and flags change what happens.
- Put the funniest jokes in hand-written scenes; use `"generate"` for connective beats and give each a `"hint"`.
- `endAfter: 6` is a good default episode length.
- Tune ending thresholds to the stat ranges your choices produce.
- Spice 2 is the base text. Add `"spice": { "1": {…}, "3": {…} }` on scenes where the tone shift is worth it.
- Brand Value moves in dollars (3 000–20 000 per choice is typical).
