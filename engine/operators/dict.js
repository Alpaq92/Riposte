// engine/operators/dict.js — dictionary construction and dict-stack operators.
import { PS, MARK, T } from '../object.js';
import { PSError } from '../errors.js';

export default {
  dict(vm) { vm.popInt(); vm.push(PS.dict()); },           // capacity hint ignored
  '<<'(vm) { vm.push(MARK); },
  '>>'(vm) {
    const items = [];
    for (;;) {
      if (!vm.ostack.length) throw new PSError('unmatchedmark');
      const o = vm.ostack.pop();
      if (o.type === T.MARK) break;
      items.push(o);                                       // [vN, kN, ..., v1, k1]
    }
    if (items.length % 2 !== 0) throw new PSError('rangecheck');
    const d = PS.dict();
    for (let i = 0; i < items.length; i += 2) d.value.put(items[i + 1], items[i]);
    vm.push(d);
  },

  begin(vm) { vm.dictstack.push(vm.popType(T.DICT)); },
  end(vm) { vm.dictstack.pop(); },
  def(vm) { const val = vm.pop(), key = vm.pop(); const d = vm.dictstack.top(); vm.recordMutation(d.value); d.value.put(key, val); },
  load(vm) { const key = vm.pop(); const v = vm.dictstack.load(key); if (v === undefined) throw new PSError('undefined'); vm.push(v); },
  store(vm) {
    const val = vm.pop(), key = vm.pop();
    const d = vm.dictstack.where(key) || vm.dictstack.top();
    vm.recordMutation(d.value);
    d.value.put(key, val);
  },
  known(vm) { const key = vm.pop(); const d = vm.popType(T.DICT); vm.push(PS.bool(d.value.knows(key))); },
  where(vm) {
    const key = vm.pop();
    const d = vm.dictstack.where(key);
    if (d) { vm.push(d); vm.push(PS.bool(true)); } else vm.push(PS.bool(false));
  },
  undef(vm) { const key = vm.pop(); const d = vm.popType(T.DICT); vm.recordMutation(d.value); d.value.undef(key); },
  currentdict(vm) { vm.push(vm.dictstack.top()); },
  maxlength(vm) { const d = vm.popType(T.DICT); vm.push(PS.int(d.value.size)); },
};
