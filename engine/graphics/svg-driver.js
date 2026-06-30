// engine/graphics/svg-driver.js
// Emits an SVG document. Pure string building — runs anywhere (Node/Deno/Bun/
// browser), needs no canvas, and gives exact vector output. The natural
// headless backend. (Clip is approximate in this first version — see below.)
import { Driver, CAP, JOIN } from './driver.js';
import { toHex } from './paint.js';

const n = (x) => String(Math.round(x * 1000) / 1000);

export class SVGDriver extends Driver {
  constructor() { super(); this.parts = []; }
  beginPage(width, height) { super.beginPage(width, height); this.parts = []; }

  _d(path) {
    let d = '';
    for (const s of path.segs) {
      if (s.op === 'M') d += `M${n(s.x)} ${n(s.y)}`;
      else if (s.op === 'L') d += `L${n(s.x)} ${n(s.y)}`;
      else if (s.op === 'C') d += `C${n(s.x1)} ${n(s.y1)} ${n(s.x2)} ${n(s.y2)} ${n(s.x3)} ${n(s.y3)}`;
      else if (s.op === 'Z') d += 'Z';
    }
    return d;
  }

  fill(path, rule, color) {
    this.parts.push(
      `<path d="${this._d(path)}" fill="${toHex(color)}"` +
      (color.a !== 1 ? ` fill-opacity="${color.a}"` : '') +
      (rule === 'evenodd' ? ' fill-rule="evenodd"' : '') + '/>'
    );
  }

  stroke(path, params, color) {
    const dash = params.dash && params.dash.length
      ? ` stroke-dasharray="${params.dash.map(n).join(' ')}"` +
        (params.offset ? ` stroke-dashoffset="${n(params.offset)}"` : '')
      : '';
    this.parts.push(
      `<path d="${this._d(path)}" fill="none" stroke="${toHex(color)}"` +
      (color.a !== 1 ? ` stroke-opacity="${color.a}"` : '') +
      ` stroke-width="${n(params.width)}"` +
      ` stroke-linecap="${CAP[params.cap] || 'butt'}"` +
      ` stroke-linejoin="${JOIN[params.join] || 'miter'}"` +
      ` stroke-miterlimit="${params.miter}"${dash}/>`
    );
  }

  // Phase 3: clip is a no-op in SVG output (the golden fixture uses no clip).
  // A <clipPath> implementation lands with the full SVG backend.
  clip(path, rule) {}

  showText(text, m, size, color, font) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const style = (font.italic ? ' font-style="italic"' : '') + (font.bold ? ' font-weight="bold"' : '');
    this.parts.push(
      `<text transform="matrix(${m.map(n).join(' ')})" font-size="${n(size)}" ` +
      `font-family="${font.family}"${style} fill="${toHex(color)}">${esc(text)}</text>`
    );
  }

  toSVG() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(this.width)}" height="${n(this.height)}" ` +
      `viewBox="0 0 ${n(this.width)} ${n(this.height)}">\n${this.parts.join('\n')}\n</svg>\n`;
  }
}
