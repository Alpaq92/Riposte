// engine/operators/stack.js — operand-stack manipulation operators.
import { PS, MARK, T } from '../object.js';
import { PSError } from '../errors.js';

export default {
  dup(vm) { const o = vm.pop(); vm.push(o); vm.push(o); },
  pop(vm) { vm.pop(); },
  exch(vm) { const b = vm.pop(), a = vm.pop(); vm.push(b); vm.push(a); },

  copy(vm) {
    const o = vm.pop();
    if (o.type !== T.INTEGER) throw new PSError('typecheck'); // composite copy lives in composite.js
    const n = o.value;
    if (n < 0) throw new PSError('rangecheck');
    const len = vm.ostack.length;
    if (n > len) throw new PSError('stackunderflow');
    for (let i = 0; i < n; i++) vm.push(vm.ostack[len - n + i]);
  },

  index(vm) {
    const n = vm.popInt();
    if (n < 0) throw new PSError('rangecheck');
    const len = vm.ostack.length;
    if (n >= len) throw new PSError('stackunderflow');
    vm.push(vm.ostack[len - 1 - n]);
  },

  roll(vm) {
    const j = vm.popInt();
    const n = vm.popInt();
    if (n < 0) throw new PSError('rangecheck');
    if (n > vm.ostack.length) throw new PSError('stackunderflow');
    if (n === 0) return;
    const base = vm.ostack.length - n;
    const slice = vm.ostack.splice(base, n);          // bottom..top of the top-n
    const k = ((j % n) + n) % n;                       // positive j rolls toward the top
    const rolled = slice.slice(n - k).concat(slice.slice(0, n - k));
    for (const x of rolled) vm.ostack.push(x);
  },

  clear(vm) { vm.ostack.length = 0; },
  count(vm) { vm.push(PS.int(vm.ostack.length)); },
  mark(vm) { vm.push(MARK); },

  cleartomark(vm) {
    while (vm.ostack.length) { if (vm.ostack.pop().type === T.MARK) return; }
    throw new PSError('unmatchedmark');
  },
  counttomark(vm) {
    for (let i = vm.ostack.length - 1; i >= 0; i--) {
      if (vm.ostack[i].type === T.MARK) { vm.push(PS.int(vm.ostack.length - 1 - i)); return; }
    }
    throw new PSError('unmatchedmark');
  },
};
