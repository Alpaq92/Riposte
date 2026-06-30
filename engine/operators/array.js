// engine/operators/array.js — array construction and array-specific operators.
import { PS, MARK, NULL, T } from '../object.js';
import { PSError } from '../errors.js';

export default {
  array(vm) {
    const n = vm.popInt();
    if (n < 0) throw new PSError('rangecheck');
    vm.push(PS.array(new Array(n).fill(NULL), false));
  },

  // `[` pushes a mark; `]` collects everything above the mark into an array.
  '['(vm) { vm.push(MARK); },
  ']'(vm) {
    const items = [];
    for (;;) {
      if (!vm.ostack.length) throw new PSError('unmatchedmark');
      const o = vm.ostack.pop();
      if (o.type === T.MARK) break;
      items.push(o);
    }
    items.reverse();
    vm.push(PS.array(items, false));
  },

  aload(vm) {
    const a = vm.popType(T.ARRAY);
    for (let i = 0; i < a.value.length; i++) vm.push(a.value.get(i));
    vm.push(a);
  },
  astore(vm) {
    const a = vm.popType(T.ARRAY);
    vm.recordMutation(a.value);
    const n = a.value.length;
    if (vm.ostack.length < n) throw new PSError('stackunderflow');
    for (let i = n - 1; i >= 0; i--) a.value.put(i, vm.pop());
    vm.push(a);
  },
};
