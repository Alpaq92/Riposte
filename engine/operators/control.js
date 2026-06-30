// engine/operators/control.js — control-flow operators.
// Loops push a loop frame and return immediately; iteration is driven by the
// main eval loop (no host recursion). `exit`/`stop` unwind the execution stack.
import { T } from '../object.js';
import { PSError } from '../errors.js';
import {
  ProcFrame, ForFrame, RepeatFrame, LoopFrame,
  ForallArrayFrame, ForallStringFrame, ForallDictFrame, StoppedFrame,
  unwindToLoop, unwindToStop,
} from '../frames.js';

function popProc(vm) {
  const o = vm.pop();
  if (o.type !== T.ARRAY || !o.executable) throw new PSError('typecheck');
  return o;
}
function popBool(vm) {
  const o = vm.pop();
  if (o.type !== T.BOOLEAN) throw new PSError('typecheck');
  return o.value;
}

export default {
  exec(vm) {
    const o = vm.pop();
    if (o.type === T.ARRAY && o.executable) vm.estack.push(new ProcFrame(o.value));
    else vm.execObject(o);
  },
  if(vm) {
    const proc = popProc(vm);
    if (popBool(vm)) vm.estack.push(new ProcFrame(proc.value));
  },
  ifelse(vm) {
    const p2 = popProc(vm), p1 = popProc(vm);
    vm.estack.push(new ProcFrame((popBool(vm) ? p1 : p2).value));
  },
  for(vm) {
    const proc = popProc(vm);
    const limit = vm.popNum(), inc = vm.popNum(), initial = vm.popNum();
    const isInt = initial.type === T.INTEGER && inc.type === T.INTEGER && limit.type === T.INTEGER;
    vm.estack.push(new ForFrame(initial.value, inc.value, limit.value, proc.value, isInt));
  },
  repeat(vm) {
    const proc = popProc(vm);
    const n = vm.popInt();
    if (n < 0) throw new PSError('rangecheck');
    vm.estack.push(new RepeatFrame(n, proc.value));
  },
  loop(vm) {
    const proc = popProc(vm);
    vm.estack.push(new LoopFrame(proc.value));
  },
  forall(vm) {
    const proc = popProc(vm);
    const o = vm.pop();
    if (o.type === T.ARRAY) vm.estack.push(new ForallArrayFrame(o.value, proc.value));
    else if (o.type === T.STRING) vm.estack.push(new ForallStringFrame(o.value, proc.value));
    else if (o.type === T.DICT) {
      const entries = o.value.keys().map((k) => [k, o.value.get(k)]);
      vm.estack.push(new ForallDictFrame(entries, proc.value));
    } else throw new PSError('typecheck');
  },
  exit(vm) { if (!unwindToLoop(vm)) throw new PSError('invalidexit'); },
  stop(vm) { if (!unwindToStop(vm)) vm.quit = true; },
  stopped(vm) {
    const p = vm.pop();
    vm.estack.push(new StoppedFrame());
    if (p.type === T.ARRAY && p.executable) vm.estack.push(new ProcFrame(p.value));
    else vm.execObject(p);
  },
  quit(vm) { vm.quit = true; },
};
