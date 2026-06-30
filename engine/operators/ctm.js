// engine/operators/ctm.js — coordinate-system (CTM) and matrix operators.
// translate/scale/rotate/transform/dtransform have two forms: with a matrix
// operand they fill that matrix (and leave the CTM alone); without, they
// concatenate onto / use the CTM.
import { PS, T } from '../object.js';
import { PSError } from '../errors.js';
import { identity, multiply, translate, scale, rotate, transformPoint, dtransform, inverse } from '../graphics/matrix.js';

const arr6 = (o) => Array.from(o.value).map((x) => {
  if (x.type !== T.INTEGER && x.type !== T.REAL) throw new PSError('typecheck');
  return x.value;
});
function popMatrix(vm) { const a = vm.popType(T.ARRAY); if (a.value.length !== 6) throw new PSError('rangecheck'); return arr6(a); }
const newMatrix = (m) => PS.array(m.map((v) => PS.real(v)), false);
function fill6(arrObj, m) { for (let i = 0; i < 6; i++) arrObj.value.put(i, PS.real(m[i])); return arrObj; }

export default {
  matrix(vm) { vm.push(newMatrix(identity())); },
  currentmatrix(vm) { const a = vm.popType(T.ARRAY); if (a.value.length !== 6) throw new PSError('rangecheck'); vm.push(fill6(a, vm.gstate.ctm)); },
  setmatrix(vm) { vm.gstate.ctm = popMatrix(vm); },
  concat(vm) { vm.gstate.ctm = multiply(popMatrix(vm), vm.gstate.ctm); },
  concatmatrix(vm) { const m3 = vm.popType(T.ARRAY); const m2 = popMatrix(vm); const m1 = popMatrix(vm); vm.push(fill6(m3, multiply(m1, m2))); },

  translate(vm) {
    const top = vm.pop();
    if (top.type === T.ARRAY) { const ty = vm.popNum().value, tx = vm.popNum().value; vm.push(fill6(top, [1, 0, 0, 1, tx, ty])); }
    else { const ty = top.value, tx = vm.popNum().value; vm.gstate.ctm = translate(vm.gstate.ctm, tx, ty); }
  },
  scale(vm) {
    const top = vm.pop();
    if (top.type === T.ARRAY) { const sy = vm.popNum().value, sx = vm.popNum().value; vm.push(fill6(top, [sx, 0, 0, sy, 0, 0])); }
    else { const sy = top.value, sx = vm.popNum().value; vm.gstate.ctm = scale(vm.gstate.ctm, sx, sy); }
  },
  rotate(vm) {
    const top = vm.pop();
    if (top.type === T.ARRAY) { const a = vm.popNum().value, r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); vm.push(fill6(top, [c, s, -s, c, 0, 0])); }
    else { vm.gstate.ctm = rotate(vm.gstate.ctm, top.value); }
  },

  transform(vm) {
    const top = vm.pop();
    let m, x, y;
    if (top.type === T.ARRAY) { m = arr6(top); y = vm.popNum().value; x = vm.popNum().value; }
    else { m = vm.gstate.ctm; y = top.value; x = vm.popNum().value; }
    const [a, b] = transformPoint(m, x, y); vm.push(PS.real(a)); vm.push(PS.real(b));
  },
  dtransform(vm) {
    const top = vm.pop();
    let m, x, y;
    if (top.type === T.ARRAY) { m = arr6(top); y = vm.popNum().value; x = vm.popNum().value; }
    else { m = vm.gstate.ctm; y = top.value; x = vm.popNum().value; }
    const [a, b] = dtransform(m, x, y); vm.push(PS.real(a)); vm.push(PS.real(b));
  },
  itransform(vm) {
    const top = vm.pop();
    let m, x, y;
    if (top.type === T.ARRAY) { m = arr6(top); y = vm.popNum().value; x = vm.popNum().value; }
    else { m = vm.gstate.ctm; y = top.value; x = vm.popNum().value; }
    const inv = inverse(m); if (!inv) throw new PSError('undefinedresult');
    const [a, b] = transformPoint(inv, x, y); vm.push(PS.real(a)); vm.push(PS.real(b));
  },
  idtransform(vm) {
    const top = vm.pop();
    let m, x, y;
    if (top.type === T.ARRAY) { m = arr6(top); y = vm.popNum().value; x = vm.popNum().value; }
    else { m = vm.gstate.ctm; y = top.value; x = vm.popNum().value; }
    const inv = inverse(m); if (!inv) throw new PSError('undefinedresult');
    const [a, b] = dtransform(inv, x, y); vm.push(PS.real(a)); vm.push(PS.real(b));
  },
  invertmatrix(vm) { const dst = vm.popType(T.ARRAY); const inv = inverse(popMatrix(vm)); if (!inv) throw new PSError('undefinedresult'); vm.push(fill6(dst, inv)); },
};
