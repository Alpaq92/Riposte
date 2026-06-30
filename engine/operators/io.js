// engine/operators/io.js — output operators (stdout via vm.out).
import { T } from '../object.js';
import { anyToString } from './type.js';

export default {
  '=='(vm) { const o = vm.pop(); vm.out(o.toString() + '\n'); },   // re-readable form
  '='(vm) { const o = vm.pop(); vm.out(anyToString(o) + '\n'); },  // plain form
  print(vm) { const s = vm.popType(T.STRING); vm.out(s.value.toJSString()); },

  stack(vm) { for (let i = vm.ostack.length - 1; i >= 0; i--) vm.out(anyToString(vm.ostack[i]) + '\n'); },
  pstack(vm) { for (let i = vm.ostack.length - 1; i >= 0; i--) vm.out(vm.ostack[i].toString() + '\n'); },
  flush() { /* no-op: output is unbuffered */ },
};
