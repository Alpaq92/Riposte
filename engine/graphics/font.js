// engine/graphics/font.js
// Phase-4 font support: map the standard PostScript font names to CSS families
// (the browser/SVG renderer draws real glyph outlines), and provide approximate
// advance-width metrics for `stringwidth` and current-point advancement.
//
// Embedded Type 1 / TrueType glyph-outline rasterization is a later sub-phase;
// until then, base-14 names render as their nearest system family.

const FAMILIES = {
  Helvetica: 'sans-serif', Arial: 'sans-serif',
  Times: 'serif', 'Times-Roman': 'serif',
  Courier: 'monospace',
  Symbol: 'serif', ZapfDingbats: 'serif',
};

export function fontFromName(name) {
  const root = String(name).split('-')[0];
  const family = FAMILIES[name] || FAMILIES[root] || 'sans-serif';
  return {
    name: String(name),
    family,
    bold: /Bold/i.test(name),
    italic: /(Italic|Oblique)/i.test(name),
    mono: family === 'monospace',
  };
}

// Approximate advance widths in em fractions (proportional fonts vary; this is a
// coarse model — exact AFM metrics arrive with embedded-font support).
const NARROW = new Set(Array.from(" ijl.,:;'!|()[]{}/\\").map((c) => c.charCodeAt(0)));
const WIDE = new Set(Array.from('mwMW@%').map((c) => c.charCodeAt(0)));

function emWidth(font, code) {
  if (font.mono) return 0.6;
  if (NARROW.has(code)) return 0.28;
  if (WIDE.has(code)) return 0.83;
  if (code >= 0x41 && code <= 0x5a) return 0.68;   // upper case
  return 0.5;
}

export function stringWidth(font, str, size) {
  let w = 0;
  for (let i = 0; i < str.length; i++) w += emWidth(font, str.charCodeAt(i)) * size;
  return w;
}
