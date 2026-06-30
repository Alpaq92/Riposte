// engine/operators/math.js — arithmetic and math operators.
import { PS, T } from '../object.js';
import { PSError } from '../errors.js';

function n2(vm) { const b = vm.popNum(), a = vm.popNum(); return [a, b]; }
const bothInt = (a, b) => a.type === T.INTEGER && b.type === T.INTEGER;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export default {
  add(vm) { const [a, b] = n2(vm); const r = a.value + b.value; vm.push(bothInt(a, b) ? PS.int(r) : PS.real(r)); },
  sub(vm) { const [a, b] = n2(vm); const r = a.value - b.value; vm.push(bothInt(a, b) ? PS.int(r) : PS.real(r)); },
  mul(vm) { const [a, b] = n2(vm); const r = a.value * b.value; vm.push(bothInt(a, b) ? PS.int(r) : PS.real(r)); },
  div(vm) { const [a, b] = n2(vm); if (b.value === 0) throw new PSError('undefinedresult'); vm.push(PS.real(a.value / b.value)); },

  idiv(vm) {
    const b = vm.pop(), a = vm.pop();
    if (a.type !== T.INTEGER || b.type !== T.INTEGER) throw new PSError('typecheck');
    if (b.value === 0) throw new PSError('undefinedresult');
    vm.push(PS.int(Math.trunc(a.value / b.value)));
  },
  mod(vm) {
    const b = vm.pop(), a = vm.pop();
    if (a.type !== T.INTEGER || b.type !== T.INTEGER) throw new PSError('typecheck');
    if (b.value === 0) throw new PSError('undefinedresult');
    vm.push(PS.int(a.value % b.value));
  },

  neg(vm) { const a = vm.popNum(); vm.push(a.type === T.INTEGER ? PS.int(-a.value) : PS.real(-a.value)); },
  abs(vm) { const a = vm.popNum(); vm.push(a.type === T.INTEGER ? PS.int(Math.abs(a.value)) : PS.real(Math.abs(a.value))); },
  sqrt(vm) { const a = vm.popNum(); if (a.value < 0) throw new PSError('rangecheck'); vm.push(PS.real(Math.sqrt(a.value))); },
  sin(vm) { const a = vm.popNum(); vm.push(PS.real(Math.sin(a.value * D2R))); },
  cos(vm) { const a = vm.popNum(); vm.push(PS.real(Math.cos(a.value * D2R))); },
  atan(vm) { const den = vm.popNum(), num = vm.popNum(); let d = Math.atan2(num.value, den.value) * R2D; if (d < 0) d += 360; vm.push(PS.real(d)); },
  exp(vm) { const e = vm.popNum(), b = vm.popNum(); vm.push(PS.real(Math.pow(b.value, e.value))); },
  ln(vm) { const a = vm.popNum(); vm.push(PS.real(Math.log(a.value))); },
  log(vm) { const a = vm.popNum(); vm.push(PS.real(Math.log10(a.value))); },

  ceiling(vm) { const a = vm.popNum(); vm.push(a.type === T.INTEGER ? a : PS.real(Math.ceil(a.value))); },
  floor(vm) { const a = vm.popNum(); vm.push(a.type === T.INTEGER ? a : PS.real(Math.floor(a.value))); },
  round(vm) { const a = vm.popNum(); vm.push(a.type === T.INTEGER ? a : PS.real(Math.round(a.value))); },
  truncate(vm) { const a = vm.popNum(); vm.push(a.type === T.INTEGER ? a : PS.real(Math.trunc(a.value))); },
};
