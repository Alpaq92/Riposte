// engine/operators/vmem.js — VM memory operators (save / restore).
import { PS } from '../object.js';

export default {
  save(vm) { vm.push(vm.save()); },
  restore(vm) { vm.restore(vm.pop()); },
  vmstatus(vm) { vm.push(PS.int(vm.saveLevel)); vm.push(PS.int(0)); vm.push(PS.int(0)); }, // level, used, max (stub)
};
