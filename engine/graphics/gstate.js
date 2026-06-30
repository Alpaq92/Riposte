// engine/graphics/gstate.js
// The PostScript graphics state. gsave/grestore push/pop clones of this; the
// current path and the current point (tracked in user space for rmoveto /
// currentpoint) are part of it.
import { identity } from './matrix.js';
import { PSPath } from './path.js';
import { gray } from './paint.js';

export class GState {
  constructor() {
    this.ctm = identity();
    this.lineWidth = 1; this.lineCap = 0; this.lineJoin = 0; this.miterLimit = 10; this.flatness = 1;
    this.dashArray = []; this.dashOffset = 0;
    this.strokePaint = gray(0); this.fillPaint = gray(0);
    this.path = new PSPath();
    this.clip = null;                 // null = unclipped; else { path, rule }
    this.font = null;
    // current point (user space) + current subpath start
    this.cpx = 0; this.cpy = 0; this.hasCP = false;
    this.startx = 0; this.starty = 0;
    this.bbox = null;                 // [minx, miny, maxx, maxy] in user space
  }

  extendBBox(x, y) {
    if (!this.bbox) this.bbox = [x, y, x, y];
    else {
      if (x < this.bbox[0]) this.bbox[0] = x;
      if (y < this.bbox[1]) this.bbox[1] = y;
      if (x > this.bbox[2]) this.bbox[2] = x;
      if (y > this.bbox[3]) this.bbox[3] = y;
    }
  }

  clone() {
    const g = new GState();
    g.ctm = this.ctm.slice();
    g.lineWidth = this.lineWidth; g.lineCap = this.lineCap; g.lineJoin = this.lineJoin;
    g.miterLimit = this.miterLimit; g.flatness = this.flatness;
    g.dashArray = this.dashArray.slice(); g.dashOffset = this.dashOffset;
    g.strokePaint = this.strokePaint; g.fillPaint = this.fillPaint;   // paints are immutable
    g.path = this.path.clone();
    g.clip = this.clip;
    g.font = this.font;
    g.cpx = this.cpx; g.cpy = this.cpy; g.hasCP = this.hasCP;
    g.startx = this.startx; g.starty = this.starty;
    g.bbox = this.bbox ? this.bbox.slice() : null;
    return g;
  }
}
