// Writes preview/portraits.html: every character x every mood, plus every fx. Open it in a browser.
// Usage: npm run portraits
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPortraitSVG, MOODS, FX } from '../src/portrait/render.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const layers = JSON.parse(readFileSync(join(root, 'src/portrait/layers.json'), 'utf8'));
const cast = JSON.parse(readFileSync(join(root, 'cast/lake-sparkle.json'), 'utf8'));

const cell = (svg, caption) =>
  `<figure><div class="frame">${svg}</div><figcaption>${caption}</figcaption></figure>`;

const rows = Object.entries(cast.characters).map(([name, c]) => {
  const moods = MOODS.map((m) => cell(renderPortraitSVG(layers, c.look, { mood: m }), m)).join('');
  const fxs = FX.map((f) => cell(renderPortraitSVG(layers, c.look, { mood: 'surprised', fx: [f] }), `surprised + ${f}`)).join('');
  return `<section><h2>${name} <small>(${c.look.style})</small></h2><div class="row">${moods}${fxs}</div></section>`;
});

const html = `<!doctype html><meta charset="utf-8"><title>Portrait sheet</title>
<style>
body{margin:24px;background:#170a21;color:#f6ead8;font:16px/1.3 monospace}
h2{color:#ff6fb1;font-size:16px;margin:24px 0 8px}small{color:#c9b3d6}
.row{display:flex;flex-wrap:wrap;gap:14px}
figure{margin:0;text-align:center}
.frame{width:96px;height:96px;border:4px solid #ff6fb1;background:#3a1a4d}
figcaption{font-size:12px;color:#c9b3d6;margin-top:4px;max-width:104px}
</style>${rows.join('')}`;

mkdirSync(join(root, 'preview'), { recursive: true });
writeFileSync(join(root, 'preview/portraits.html'), html);
console.log('wrote preview/portraits.html');
