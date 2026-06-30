// engine/operators/composite.js — operators polymorphic over array/string/dict.
import { PS, PSObject, T, nameString } from '../object.js';
import { PSError } from '../errors.js';

export default {
  length(vm) {
    const o = vm.pop();
    switch (o.type) {
      case T.ARRAY: case T.STRING: return vm.push(PS.int(o.value.length));
      case T.DICT: return vm.push(PS.int(o.value.size));
      case T.NAME: return vm.push(PS.int(nameString(o.value).length));
      default: throw new PSError('typecheck');
    }
  },

  get(vm) {
    const k = vm.pop(), o = vm.pop();
    if (o.type === T.ARRAY) {
      if (k.type !== T.INTEGER) throw new PSError('typecheck');
      if (k.value < 0 || k.value >= o.value.length) throw new PSError('rangecheck');
      return vm.push(o.value.get(k.value));
    }
    if (o.type === T.STRING) {
      if (k.type !== T.INTEGER) throw new PSError('typecheck');
      if (k.value < 0 || k.value >= o.value.length) throw new PSError('rangecheck');
      return vm.push(PS.int(o.value.get(k.value)));
    }
    if (o.type === T.DICT) {
      const v = o.value.get(k);
      if (v === undefined) throw new PSError('undefined');
      return vm.push(v);
    }
    throw new PSError('typecheck');
  },

  put(vm) {
    const v = vm.pop(), k = vm.pop(), o = vm.pop();
    if (o.type === T.ARRAY || o.type === T.STRING || o.type === T.DICT) vm.recordMutation(o.value);
    if (o.type === T.ARRAY) {
      if (k.type !== T.INTEGER) throw new PSError('typecheck');
      if (k.value < 0 || k.value >= o.value.length) throw new PSError('rangecheck');
      return void o.value.put(k.value, v);
    }
    if (o.type === T.STRING) {
      if (k.type !== T.INTEGER || v.type !== T.INTEGER) throw new PSError('typecheck');
      if (k.value < 0 || k.value >= o.value.length) throw new PSError('rangecheck');
      return void o.value.put(k.value, v.value);
    }
    if (o.type === T.DICT) return void o.value.put(k, v);
    throw new PSError('typecheck');
  },

  getinterval(vm) {
    const count = vm.popInt(), idx = vm.popInt(), o = vm.pop();
    if (o.type === T.ARRAY) {
      if (idx < 0 || count < 0 || idx + count > o.value.length) throw new PSError('rangecheck');
      return vm.push(new PSObject(T.ARRAY, o.value.getInterval(idx, count), o.executable));
    }
    if (o.type === T.STRING) {
      if (idx < 0 || count < 0 || idx + count > o.value.length) throw new PSError('rangecheck');
      return vm.push(new PSObject(T.STRING, o.value.getInterval(idx, count), false));
    }
    throw new PSError('typecheck');
  },

  putinterval(vm) {
    const src = vm.pop(), idx = vm.popInt(), dst = vm.pop();
    if (dst.type === T.ARRAY || dst.type === T.STRING) vm.recordMutation(dst.value);
    if (dst.type === T.ARRAY && src.type === T.ARRAY) {
      if (idx < 0 || idx + src.value.length > dst.value.length) throw new PSError('rangecheck');
      for (let i = 0; i < src.value.length; i++) dst.value.put(idx + i, src.value.get(i));
      return;
    }
    if (dst.type === T.STRING && src.type === T.STRING) {
      if (idx < 0 || idx + src.value.length > dst.value.length) throw new PSError('rangecheck');
      for (let i = 0; i < src.value.length; i++) dst.value.put(idx + i, src.value.get(i));
      return;
    }
    throw new PSError('typecheck');
  },
};
