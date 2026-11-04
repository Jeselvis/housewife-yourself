import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPortraitSVG, portraitRects, MOODS, FX } from '../src/portrait/render.js';
import { layers, cast } from '../testkit/helpers.mjs';

const L = layers();
const dolly = cast().characters['DOLLY MARCHETTI-WYNN'].look;

test('layers cover every base style, mood and fx the schema allows', () => {
  for (const style of ['big', 'bob', 'long', 'slick']) assert.ok(L.bases[style].length > 5, style);
  for (const mood of MOODS.filter((m) => m !== 'neutral')) assert.ok(L.moods[mood].length > 0, mood);
  for (const fx of FX) assert.ok(L.fx[fx].length > 0, fx);
});

test('no unresolved colour tokens leak into the SVG', () => {
  for (const [name, c] of Object.entries(cast().characters)) {
    for (const mood of MOODS) {
      const svg = renderPortraitSVG(L, c.look, { mood, fx: FX });
      assert.equal(svg.includes('$'), false, `${name}/${mood}`);
      assert.equal(svg.includes('undefined'), false, `${name}/${mood}`);
    }
  }
});

test('draw order is base, then mood, then fx; character colours are applied', () => {
  const rects = portraitRects(L, dolly, { mood: 'surprised', fx: ['wine'] });
  const base = L.bases.big.length;
  assert.equal(rects.length, base + L.moods.surprised.length + L.fx.wine.length);
  assert.equal(rects[0][4], dolly.hair);
  assert.ok(rects.slice(base).some((r) => r[4] === '#ffffff')); // surprised eye whites
});

test('unknown style falls back to the default base; unknown mood/fx add nothing', () => {
  const rects = portraitRects(L, { ...dolly, style: 'mohawk' }, { mood: 'melancholy', fx: ['glitter'] });
  assert.equal(rects.length, L.bases[L.defaultStyle].length);
});

test('render output is an accessible, crisp SVG', () => {
  const decor = renderPortraitSVG(L, dolly);
  assert.match(decor, /aria-hidden="true"/);
  assert.match(decor, /shape-rendering="crispEdges"/);
  const labelled = renderPortraitSVG(L, dolly, { label: 'Dolly, smug', size: 48 });
  assert.match(labelled, /role="img" aria-label="Dolly, smug"/);
  assert.match(labelled, /width="48"/);
});
