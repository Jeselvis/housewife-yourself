// One-off: pulls the pixel-art rects out of mockup/Main.dc.html into src/portrait/layers.json.
// After this runs, layers.json is the source of truth; edit it, not the mockup.
// Usage: node scripts/extract-portrait-layers.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'mockup/Main.dc.html'), 'utf8');

const blockRe = /<sc-if value="\{\{p\.(\w+)\}\}"[^>]*>\s*<svg[^>]*>([\s\S]*?)<\/svg>\s*<\/sc-if>/g;
const rectRe = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="([^"]+)"\s*\/>/g;

const groups = { bases: {}, moods: {}, fx: {} };
for (const m of html.matchAll(blockRe)) {
  const key = m[1]; // isBig, moodSurprised, fxWine ...
  const rects = [...m[2].matchAll(rectRe)].map((r) => [
    Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4]),
    r[5].startsWith('{{p.') ? '$' + r[5].slice(4, -2) : r[5],
  ]);
  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  if (key.startsWith('is')) groups.bases[lower(key.slice(2))] = rects;
  else if (key.startsWith('mood')) groups.moods[lower(key.slice(4))] = rects;
  else if (key.startsWith('fx')) groups.fx[lower(key.slice(2))] = rects;
}

const layerLines = (obj) =>
  Object.entries(obj)
    .map(([k, rects]) => `    ${JSON.stringify(k)}: [\n${rects.map((r) => '      ' + JSON.stringify(r)).join(',\n')}\n    ]`)
    .join(',\n');

const out = `{
  "_comment": "16x16 pixel grid. Each rect is [x, y, width, height, fill]. A fill starting with $ is a character colour token: $hair $skin $outfit $lips $accent. Draw order: base, then mood, then fx.",
  "viewBox": 16,
  "defaultStyle": "bob",
  "bases": {
${layerLines(groups.bases)}
  },
  "moods": {
${layerLines(groups.moods)}
  },
  "fx": {
${layerLines(groups.fx)}
  }
}
`;
writeFileSync(join(root, 'src/portrait/layers.json'), out);
console.log('bases:', Object.keys(groups.bases).join(', '));
console.log('moods:', Object.keys(groups.moods).join(', '));
console.log('fx:   ', Object.keys(groups.fx).join(', '));
