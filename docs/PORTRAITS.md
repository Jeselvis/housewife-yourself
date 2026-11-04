# Portraits

Pixel-art headshots built from layers on a 16x16 grid, so there is no picture per character per situation.

```
final portrait = base face (by hair style, tinted with the character's colours)
               + mood overlay   (eyes and mouth)
               + fx overlays    (wine, souffle, horns, sparkle)
```

Overlays use the same colour tokens as the base, so one `surprised` or one `wine` works on every character, and adding a character costs nothing extra.

`src/portrait/layers.json` is the source of truth. `src/portrait/render.js` turns it into an SVG string. `npm run portraits` writes `preview/portraits.html` with every character in every mood and every fx; open it (or screenshot it) after changing anything here.

## Data format

```json
{
  "viewBox": 16,
  "defaultStyle": "bob",
  "bases": { "big": [ [2, 1, 12, 13, "$hair"], [4, 4, 8, 8, "$skin"], ... ] },
  "moods": { "surprised": [ ... ] },
  "fx":    { "wine": [ ... ] }
}
```

Each rect is `[x, y, width, height, fill]` in grid units. A fill starting with `$` is a colour token resolved from the character's `look`: `$hair`, `$skin`, `$outfit`, `$lips`, `$accent`. Anything else is a literal hex colour (for example white eye whites, or the wine red). Rects are drawn in array order; later rects cover earlier ones.

## Using it

```js
import layers from './portrait/layers.json';          // Vite; in Node use readFileSync + JSON.parse
import { renderPortraitSVG } from './portrait/render.js';

const svg = renderPortraitSVG(layers, cast.characters[scene.speaker].look,
  { mood: scene.mood, fx: scene.fx, size: 96, label: 'Dolly, smug' });
```

Without `label` the SVG is `aria-hidden` (the speaker name is already text beside it). With `label` it gets `role="img"`. The caller draws the frame (the mockup uses a 4px pink border on `#3a1a4d`). A speaker not in the cast gets no portrait; handle that in the UI.

## Adding a character

Add an entry to `cast/*.json` with a `look`: `style` (`big`, `bob`, `long`, `slick`) and five hex colours (`hair`, `skin`, `outfit`, `lips`, `accent`). `accent` is earrings on `big` and `long`, pearls on `bob`, and a tie on `slick`. Run `npm run portraits` and check it.

## Adding a hair style

Add a new array under `bases` in `layers.json`, add the name to the `style` enum in `schema/cast.schema.json`, and add it to the style list in `test/portrait.test.mjs`. Draw it on the 16x16 grid with the face at roughly x 4 to 12, y 4 to 12 so the mood overlays (which sit at x 5 to 11, y 5 to 11) line up.

## Adding a mood or fx

1. Add the rects under `moods` or `fx` in `layers.json`. A mood overlay repaints the face area (`$skin` rect first) and then draws eyes and mouth, so it replaces the base expression. An fx overlay only adds pixels on top.
2. Add the name to the matching enum in `schema/adventure.schema.json` (`mood` or `fxList`) and to `MOODS` or `FX` in `render.js`.
3. If the LLM may use it, it's picked up automatically through the schema; mention it in the system prompt rules in `docs/LLM_CONTRACT.md`.
4. Run `npm run portraits` and `npm test`.

Ideas that fit the system: tears, black eye, glitter, a flipped-table dust cloud, a tiara, sunglasses.

## Accessibility and crispness

Render at integer multiples of 16 (96, 128) so pixels stay sharp, and keep `shape-rendering="crispEdges"`. Moods read by shape (eyebrows, mouth), not by colour alone.
