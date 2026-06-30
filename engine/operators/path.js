// engine/operators/path.js — path construction.
// Each point is transformed user -> device by the CTM as the segment is added,
// so the path stored in the graphics state is already in device space. The
// current point is tracked in user space for rmoveto / currentpoint.
import { PS, T } from '../object.js';
import { PSError } from '../errors.js';
import { PSPath, arcSegments } from '../graphics/path.js';
import { transformPoint } from '../graphics/matrix.js';

const dev = (vm, x, y) => transformPoint(vm.gstate.ctm, x, y);
function setCP(vm, x, y) { vm.gstate.cpx = x; vm.gstate.cpy = y; vm.gstate.hasCP = true; vm.gstate.extendBBox(x, y); }
function needCP(vm) { if (!vm.gstate.hasCP) throw new PSError('nocurrentpoint'); }

function arcOp(vm, clockwise) {
  const a2 = vm.popNum().value, a1 = vm.popNum().value, r = vm.popNum().value, cy = vm.popNum().value, cx = vm.popNum().value;
  const { start, segs, end } = arcSegments(cx, cy, r, a1, a2, clockwise);
  const [sx, sy] = dev(vm, start[0], start[1]);
  if (vm.gstate.hasCP) vm.gstate.path.lineTo(sx, sy);
  else { vm.gstate.path.moveTo(sx, sy); vm.gstate.startx = start[0]; vm.gstate.starty = start[1]; }
  for (const [c1, c2, p3] of segs) {
    const d1 = dev(vm, c1[0], c1[1]), d2 = dev(vm, c2[0], c2[1]), d3 = dev(vm, p3[0], p3[1]);
    vm.gstate.path.curveTo(d1[0], d1[1], d2[0], d2[1], d3[0], d3[1]);
  }
  vm.gstate.extendBBox(cx - r, cy - r); vm.gstate.extendBBox(cx + r, cy + r);
  vm.gstate.cpx = end[0]; vm.gstate.cpy = end[1]; vm.gstate.hasCP = true;
}

export default {
  newpath(vm) { vm.gstate.path = new PSPath(); vm.gstate.hasCP = false; vm.gstate.bbox = null; },

  moveto(vm) {
    const y = vm.popNum().value, x = vm.popNum().value;
    const [dx, dy] = dev(vm, x, y);
    vm.gstate.path.moveTo(dx, dy);
    vm.gstate.startx = x; vm.gstate.starty = y; setCP(vm, x, y);
  },
  rmoveto(vm) {
    const dy = vm.popNum().value, dx = vm.popNum().value; needCP(vm);
    const x = vm.gstate.cpx + dx, y = vm.gstate.cpy + dy;
    const [px, py] = dev(vm, x, y);
    vm.gstate.path.moveTo(px, py);
    vm.gstate.startx = x; vm.gstate.starty = y; setCP(vm, x, y);
  },
  lineto(vm) {
    const y = vm.popNum().value, x = vm.popNum().value; needCP(vm);
    const [dx, dy] = dev(vm, x, y); vm.gstate.path.lineTo(dx, dy); setCP(vm, x, y);
  },
  rlineto(vm) {
    const dy = vm.popNum().value, dx = vm.popNum().value; needCP(vm);
    const x = vm.gstate.cpx + dx, y = vm.gstate.cpy + dy;
    const [px, py] = dev(vm, x, y); vm.gstate.path.lineTo(px, py); setCP(vm, x, y);
  },
  curveto(vm) {
    const y3 = vm.popNum().value, x3 = vm.popNum().value, y2 = vm.popNum().value, x2 = vm.popNum().value, y1 = vm.popNum().value, x1 = vm.popNum().value;
    needCP(vm);
    const a = dev(vm, x1, y1), b = dev(vm, x2, y2), c = dev(vm, x3, y3);
    vm.gstate.path.curveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
    vm.gstate.extendBBox(x1, y1); vm.gstate.extendBBox(x2, y2); setCP(vm, x3, y3);
  },
  rcurveto(vm) {
    const dy3 = vm.popNum().value, dx3 = vm.popNum().value, dy2 = vm.popNum().value, dx2 = vm.popNum().value, dy1 = vm.popNum().value, dx1 = vm.popNum().value;
    needCP(vm);
    const cx = vm.gstate.cpx, cy = vm.gstate.cpy;
    const x1 = cx + dx1, y1 = cy + dy1, x2 = cx + dx2, y2 = cy + dy2, x3 = cx + dx3, y3 = cy + dy3;
    const a = dev(vm, x1, y1), b = dev(vm, x2, y2), c = dev(vm, x3, y3);
    vm.gstate.path.curveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
    vm.gstate.extendBBox(x1, y1); vm.gstate.extendBBox(x2, y2); setCP(vm, x3, y3);
  },
  closepath(vm) {
    if (!vm.gstate.path.isEmpty) {
      vm.gstate.path.close();
      vm.gstate.cpx = vm.gstate.startx; vm.gstate.cpy = vm.gstate.starty; vm.gstate.hasCP = true;
    }
  },
  currentpoint(vm) { needCP(vm); vm.push(PS.real(vm.gstate.cpx)); vm.push(PS.real(vm.gstate.cpy)); },
  arc(vm) { arcOp(vm, false); },
  arcn(vm) { arcOp(vm, true); },
  pathbbox(vm) {
    if (!vm.gstate.bbox) throw new PSError('nocurrentpoint');
    const [a, b, c, d] = vm.gstate.bbox;
    vm.push(PS.real(a)); vm.push(PS.real(b)); vm.push(PS.real(c)); vm.push(PS.real(d));
  },
};
