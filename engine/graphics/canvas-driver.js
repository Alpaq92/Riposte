// engine/graphics/canvas-driver.js
// Renders to a CanvasRenderingContext2D. The PostScript imaging model maps 1:1
// onto Canvas 2D, so this backend is thin. Browser/worker only — outside the
// browser use SVGDriver (see ../../docs/ARCHITECTURE.md).
import { Driver, CAP, JOIN } from './driver.js';
import { toCss } from './paint.js';

export class CanvasDriver extends Driver {
  constructor(ctx) { super(); this.ctx = ctx; }

  beginPage(width, height) {
    super.beginPage(width, height);
    this.ctx.clearRect(0, 0, width, height);
  }

  _trace(path) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (const s of path.segs) {
      if (s.op === 'M') ctx.moveTo(s.x, s.y);
      else if (s.op === 'L') ctx.lineTo(s.x, s.y);
      else if (s.op === 'C') ctx.bezierCurveTo(s.x1, s.y1, s.x2, s.y2, s.x3, s.y3);
      else if (s.op === 'Z') ctx.closePath();
    }
  }

  fill(path, rule, color) {
    this.ctx.fillStyle = toCss(color);
    this._trace(path);
    this.ctx.fill(rule);
  }

  stroke(path, params, color) {
    const ctx = this.ctx;
    ctx.strokeStyle = toCss(color);
    ctx.lineWidth = params.width;
    ctx.lineCap = CAP[params.cap] || 'butt';
    ctx.lineJoin = JOIN[params.join] || 'miter';
    ctx.miterLimit = params.miter;
    ctx.setLineDash(params.dash || []);
    ctx.lineDashOffset = params.offset || 0;
    this._trace(path);
    ctx.stroke();
  }

  clip(path, rule) { this._trace(path); this.ctx.clip(rule); }
  save() { this.ctx.save(); }
  restore() { this.ctx.restore(); }

  // Text honours the full CTM (translate / rotate / scale) via the supplied
  // matrix; glyph outlines come from the system font for the mapped family.
  showText(text, m, size, color, font) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.fillStyle = toCss(color);
    const style = (font.italic ? 'italic ' : '') + (font.bold ? 'bold ' : '');
    ctx.font = `${style}${size}px ${font.family}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}
