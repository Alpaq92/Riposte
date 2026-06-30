// engine/graphics/path.js
// A path is a flat list of device-space segments. PostScript points are
// transformed user -> device by the CTM *at construction time* (see the path
// operators), so the path the driver receives is already in device coordinates.

export class PSPath {
  constructor() { this.segs = []; }
  moveTo(x, y) { this.segs.push({ op: 'M', x, y }); }
  lineTo(x, y) { this.segs.push({ op: 'L', x, y }); }
  curveTo(x1, y1, x2, y2, x3, y3) { this.segs.push({ op: 'C', x1, y1, x2, y2, x3, y3 }); }
  close() { this.segs.push({ op: 'Z' }); }
  get isEmpty() { return this.segs.length === 0; }
  clone() { const p = new PSPath(); p.segs = this.segs.slice(); return p; }   // segments are immutable
}

// Approximate a circular arc (user space) as a sequence of cubic Béziers, each
// spanning at most 90°. Returns the start/end points and the control points of
// each segment, all in user space (the caller transforms them by the CTM).
export function arcSegments(cx, cy, r, a1deg, a2deg, clockwise) {
  let a1 = (a1deg * Math.PI) / 180;
  let a2 = (a2deg * Math.PI) / 180;
  if (!clockwise) { while (a2 < a1) a2 += 2 * Math.PI; }
  else { while (a2 > a1) a2 -= 2 * Math.PI; }

  const total = a2 - a1;
  const nSeg = Math.max(1, Math.ceil(Math.abs(total) / (Math.PI / 2) - 1e-9));
  const delta = total / nSeg;
  const k = (4 / 3) * Math.tan(delta / 4);

  const at = (t) => [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  const start = at(a1);
  const segs = [];
  let theta = a1;
  for (let i = 0; i < nSeg; i++) {
    const t2 = theta + delta;
    const p0 = at(theta), p3 = at(t2);
    const c1 = [p0[0] - k * r * Math.sin(theta), p0[1] + k * r * Math.cos(theta)];
    const c2 = [p3[0] + k * r * Math.sin(t2), p3[1] - k * r * Math.cos(t2)];
    segs.push([c1, c2, p3]);
    theta = t2;
  }
  return { start, segs, end: at(a2) };
}
