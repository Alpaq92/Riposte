// engine/operators/paint.js — painting (fill / stroke / clip).
// fill and stroke consume the current path (an implicit newpath), as in
// PostScript; clip narrows the clip region and leaves the path intact.
import { PSPath } from '../graphics/path.js';
import { toRGBA } from '../graphics/paint.js';
import { scaleFactor } from '../graphics/matrix.js';

function deviceWidth(g) { const w = g.lineWidth * scaleFactor(g.ctm); return w > 0 ? w : 1; }
function strokeParams(g) {
  const sf = scaleFactor(g.ctm);
  return {
    width: deviceWidth(g), cap: g.lineCap, join: g.lineJoin, miter: g.miterLimit,
    dash: g.dashArray.map((d) => d * sf), offset: g.dashOffset * sf,
  };
}
function clearPath(vm) { vm.gstate.path = new PSPath(); vm.gstate.hasCP = false; vm.gstate.bbox = null; }

export default {
  fill(vm) { vm.driver.fill(vm.gstate.path, 'nonzero', toRGBA(vm.gstate.fillPaint)); clearPath(vm); },
  eofill(vm) { vm.driver.fill(vm.gstate.path, 'evenodd', toRGBA(vm.gstate.fillPaint)); clearPath(vm); },
  stroke(vm) { vm.driver.stroke(vm.gstate.path, strokeParams(vm.gstate), toRGBA(vm.gstate.strokePaint)); clearPath(vm); },
  clip(vm) { vm.driver.clip(vm.gstate.path, 'nonzero'); vm.gstate.clip = { path: vm.gstate.path.clone(), rule: 'nonzero' }; },
  eoclip(vm) { vm.driver.clip(vm.gstate.path, 'evenodd'); vm.gstate.clip = { path: vm.gstate.path.clone(), rule: 'evenodd' }; },
};
