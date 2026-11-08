// Portrait renderer. Pure: layers + a character's look + mood + fx -> SVG string.
// `layers` is the parsed src/portrait/layers.json (Vite can import it directly; in Node, readFileSync + JSON.parse).
//
// Draw order: base face (by look.style) -> mood overlay -> fx overlays.
// Overlays reuse the character's own colour tokens, so one mood/fx works on every character.

export const MOODS = ['neutral', 'surprised', 'angry', 'smug'];
export const FX = ['wine', 'souffle', 'horns', 'sparkle'];

export function portraitRects(layers, look, { mood = 'neutral', fx = [], confessional = false } = {}) {
  const base = layers.bases[look.style] ?? layers.bases[layers.defaultStyle];
  const rects = [...base, ...(layers.moods[mood] ?? [])];
  if (confessional) rects.push(...(layers.confessional_outfit ?? []));
  for (const f of fx) rects.push(...(layers.fx[f] ?? []));
  return rects.map(([x, y, w, h, fill]) => [x, y, w, h, fill.startsWith('$') ? look[fill.slice(1)] : fill]);
}

/** Render just the gesture_hand layer as a standalone SVG for animation overlay. */
export function renderGestureSVG(layers, look, size = 96) {
  const resolve = (fill) => fill.startsWith('$') ? look[fill.slice(1)] : fill;
  const body = (layers.gesture_hand ?? [])
    .map(([x, y, w, h, fill]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${resolve(fill)}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${layers.viewBox} ${layers.viewBox}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
}

export function renderPortraitSVG(layers, look, { mood = 'neutral', fx = [], size = 96, label = '', confessional = false } = {}) {
  const body = portraitRects(layers, look, { mood, fx, confessional })
    .map(([x, y, w, h, fill]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`)
    .join('');
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  // Confessional uses a tighter crop: skip top 2 rows (less hair), zoom in on face
  const viewBox = confessional ? `0 2 ${layers.viewBox} ${layers.viewBox - 4}` : `0 0 ${layers.viewBox} ${layers.viewBox}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" shape-rendering="crispEdges" ${a11y}>${body}</svg>`;
}
