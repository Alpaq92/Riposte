// engine/operators/relational.js — comparison and boolean/bitwise operators.
import { PS, T } from '../object.js';
import { PSError } from '../errors.js';

function eq(a, b) {
  if (a.isNumber && b.isNumber) return a.value === b.value;
  if (a.type !== b.type) return false;
  switch (a.type) {
    case T.BOOLEAN: return a.value === b.value;
    case T.NAME: return a.value === b.value;
    case T.STRING: return a.value.toJSString() === b.value.toJSString();
    case T.NULL: case T.MARK: return true;
    default: return a === b || a.value === b.value; // arrays/dicts/operators by identity
  }
}

function cmp(vm, test) {
  const b = vm.pop(), a = vm.pop();
  if (a.isNumber && b.isNumber) return vm.push(PS.bool(test(a.value - b.value)));
  if (a.type === T.STRING && b.type === T.STRING) {
    const x = a.value.toJSString(), y = b.value.toJSString();
    return vm.push(PS.bool(test(x < y ? -1 : x > y ? 1 : 0)));
  }
  throw new PSError('typecheck');
}

export default {
  eq(vm) { const b = vm.pop(), a = vm.pop(); vm.push(PS.bool(eq(a, b))); },
  ne(vm) { const b = vm.pop(), a = vm.pop(); vm.push(PS.bool(!eq(a, b))); },
  gt(vm) { cmp(vm, (d) => d > 0); },
  ge(vm) { cmp(vm, (d) => d >= 0); },
  lt(vm) { cmp(vm, (d) => d < 0); },
  le(vm) { cmp(vm, (d) => d <= 0); },

  and(vm) {
    const b = vm.pop(), a = vm.pop();
    if (a.type === T.BOOLEAN && b.type === T.BOOLEAN) return vm.push(PS.bool(a.value && b.value));
    if (a.type === T.INTEGER && b.type === T.INTEGER) return vm.push(PS.int(a.value & b.value));
    throw new PSError('typecheck');
  },
  or(vm) {
    const b = vm.pop(), a = vm.pop();
    if (a.type === T.BOOLEAN && b.type === T.BOOLEAN) return vm.push(PS.bool(a.value || b.value));
    if (a.type === T.INTEGER && b.type === T.INTEGER) return vm.push(PS.int(a.value | b.value));
    throw new PSError('typecheck');
  },
  xor(vm) {
    const b = vm.pop(), a = vm.pop();
    if (a.type === T.BOOLEAN && b.type === T.BOOLEAN) return vm.push(PS.bool(a.value !== b.value));
    if (a.type === T.INTEGER && b.type === T.INTEGER) return vm.push(PS.int(a.value ^ b.value));
    throw new PSError('typecheck');
  },
  not(vm) {
    const a = vm.pop();
    if (a.type === T.BOOLEAN) return vm.push(PS.bool(!a.value));
    if (a.type === T.INTEGER) return vm.push(PS.int(~a.value));
    throw new PSError('typecheck');
  },
  bitshift(vm) {
    const s = vm.popInt(), a = vm.popInt();
    vm.push(PS.int(s >= 0 ? a << s : a >> (-s)));
  },
};
