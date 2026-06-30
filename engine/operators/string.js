// engine/operators/string.js — string construction (string-specific ops).
import { PS, PSString, T } from '../object.js';
import { PSError } from '../errors.js';

export default {
  string(vm) {
    const n = vm.popInt();
    if (n < 0) throw new PSError('rangecheck');
    vm.push(PS.string(new PSString(new Uint8Array(n))));
  },
};
