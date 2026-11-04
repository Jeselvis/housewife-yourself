// Portrait renderer. Pure: layers + a character's look + mood + fx -> SVG string.
// `layers` is the parsed src/portrait/layers.json (Vite can import it directly; in Node, readFileSync + JSON.parse).
//
// Draw order: base face (by look.style) -> mood overlay -> fx overlays.
// Overlays reuse the character's own colour tokens, so one mood/fx works on every character.

export const MOODS = ['neutral', 'surprised', 'angry', 'smug'];
export const FX = ['wine', 'souffle', 'horns', 'sparkle'];

export function portraitRects(layers, look, { mood = 'neutral', fx = [] } = {}) {
  const base = layers.bases[look.style] ?? layers.bases[layers.defaultStyle];
  const rects = [...base, ...(layers.moods[mood] ?? [])];
  for (const f of fx) rects.push(...(layers.fx[f] ?? []));
  return rects.map(([x, y, w, h, fill]) => [x, y, w, h, fill.startsWith('$') ? look[fill.slice(1)] : fill]);
}

export function renderPortraitSVG(layers, look, { mood = 'neutral', fx = [], size = 96, label = '' } = {}) {
  const body = portraitRects(layers, look, { mood, fx })
    .map(([x, y, w, h, fill]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`)
    .join('');
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${layers.viewBox} ${layers.viewBox}" shape-rendering="crispEdges" ${a11y}>${body}</svg>`;
}
