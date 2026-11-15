// Item sprite renderer. Same rect-stacking approach as render.js but for items.
// layers = parsed item-layers.json. sprite = { base, color, accent }.

export function itemRects(layers, sprite) {
  const base    = layers.bases[sprite.base] ?? layers.bases['orb'];
  const accent  = sprite.accent && sprite.accent !== 'none' ? (layers.accents[sprite.accent] ?? []) : [];
  const color   = layers.colorMap[sprite.color] ?? layers.colorMap['cream'];
  const resolve = (fill) => fill === '$color' ? color : fill;
  return [...base, ...accent].map(([x, y, w, h, fill]) => [x, y, w, h, resolve(fill)]);
}

export function renderItemSVG(layers, sprite, { size = 64, label = '' } = {}) {
  const rects = itemRects(layers, sprite ?? { base: 'orb', color: 'cream', accent: 'none' });
  const body  = rects
    .map(([x, y, w, h, fill]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`)
    .join('');
  const a11y  = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${layers.viewBox} ${layers.viewBox}" shape-rendering="crispEdges" ${a11y}>${body}</svg>`;
}
