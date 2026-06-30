// engine/graphics/paint.js
// Colour is kept in its native PostScript space and converted to RGBA only at
// draw time (CMYK → RGB happens here, since Canvas/SVG are RGB).

const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const gray = (g) => ({ space: 'gray', c: [g] });
export const rgb = (r, g, b) => ({ space: 'rgb', c: [r, g, b] });
export const cmyk = (c, m, y, k) => ({ space: 'cmyk', c: [c, m, y, k] });

export function hsb(h, s, b) {                 // h,s,b in 0..1
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = b * (1 - s), q = b * (1 - f * s), t = b * (1 - (1 - f) * s);
  const [r, g, bl] = [[b, t, p], [q, b, p], [p, b, t], [p, q, b], [t, p, b], [b, p, q]][i % 6];
  return rgb(r, g, bl);
}

export function toRGBA(paint) {
  switch (paint.space) {
    case 'gray': { const g = clamp(paint.c[0]); return { r: g, g, b: g, a: 1 }; }
    case 'rgb': return { r: clamp(paint.c[0]), g: clamp(paint.c[1]), b: clamp(paint.c[2]), a: 1 };
    case 'cmyk': {
      const [c, m, y, k] = paint.c;
      return { r: (1 - clamp(c)) * (1 - clamp(k)), g: (1 - clamp(m)) * (1 - clamp(k)), b: (1 - clamp(y)) * (1 - clamp(k)), a: 1 };
    }
    default: return { r: 0, g: 0, b: 0, a: 1 };
  }
}

export function toHex(rgba) {
  const h = (x) => Math.round(clamp(x) * 255).toString(16).padStart(2, '0');
  return '#' + h(rgba.r) + h(rgba.g) + h(rgba.b);
}
export function toCss(rgba) {
  const c = (x) => Math.round(clamp(x) * 255);
  return `rgba(${c(rgba.r)},${c(rgba.g)},${c(rgba.b)},${rgba.a})`;
}
