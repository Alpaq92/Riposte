// engine/operators/index.js — assemble all operator modules into systemdict.
import { PS, NULL } from '../object.js';
import stack from './stack.js';
import math from './math.js';
import relational from './relational.js';
import control from './control.js';
import dict from './dict.js';
import composite from './composite.js';
import array from './array.js';
import string from './string.js';
import type from './type.js';
import io from './io.js';
import file from './file.js';
import graphics from './graphics.js';
import path from './path.js';
import paint from './paint.js';
import ctm from './ctm.js';
import vmem from './vmem.js';

const MODULES = [stack, math, relational, control, dict, composite, array, string, type, io, file, graphics, path, paint, ctm, vmem];

export function installOperators(vm) {
  for (const mod of MODULES) {
    for (const [name, fn] of Object.entries(mod)) {
      if (typeof fn !== 'function') continue;
      vm.systemdict.value.put(PS.name(name), PS.op(name, fn));
    }
  }
  // boolean/null constants are VALUES bound in systemdict (not operators):
  // an executable name `true`/`false`/`null` resolves to them and is pushed.
  vm.systemdict.value.put(PS.name('true'), PS.bool(true));
  vm.systemdict.value.put(PS.name('false'), PS.bool(false));
  vm.systemdict.value.put(PS.name('null'), NULL);
}
