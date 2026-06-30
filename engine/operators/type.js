// engine/operators/type.js — type queries, conversions, attributes, and bind.
import { PS, T, PSObject, nameString } from '../object.js';
import { PSError } from '../errors.js';

const TYPENAMES = {
  integer: 'integertype', real: 'realtype', boolean: 'booleantype', name: 'nametype',
  string: 'stringtype', array: 'arraytype', dict: 'dicttype', operator: 'operatortype',
  mark: 'marktype', null: 'nulltype', file: 'filetype', fontid: 'fonttype', save: 'savetype',
};

export function anyToString(o) {
  switch (o.type) {
    case T.INTEGER: return String(o.value);
    case T.REAL: return Number.isInteger(o.value) ? o.value.toFixed(1) : String(o.value);
    case T.BOOLEAN: return o.value ? 'true' : 'false';
    case T.NAME: return nameString(o.value);
    case T.STRING: return o.value.toJSString();
    default: return '--' + o.type + '--';
  }
}

function bindArray(vm, arr) {
  for (let i = 0; i < arr.length; i++) {
    const el = arr.get(i);
    if (el.type === T.NAME && el.executable) {
      const v = vm.dictstack.load(el);
      if (v && v.type === T.OPERATOR) arr.put(i, v);
    } else if (el.type === T.ARRAY && el.executable) {
      bindArray(vm, el.value);                              // recurse nested procs (shallow)
    }
  }
}

export default {
  type(vm) { const o = vm.pop(); vm.push(PS.name(TYPENAMES[o.type] || 'nulltype', false)); },

  cvx(vm) { const o = vm.pop(); o.executable = true; vm.push(o); },
  cvlit(vm) { const o = vm.pop(); o.executable = false; vm.push(o); },
  xcheck(vm) { const o = vm.pop(); vm.push(PS.bool(!!o.executable)); },

  cvi(vm) {
    const o = vm.pop();
    if (o.type === T.INTEGER) return vm.push(o);
    if (o.type === T.REAL) return vm.push(PS.int(Math.trunc(o.value)));
    if (o.type === T.STRING) { const n = parseFloat(o.value.toJSString()); if (Number.isNaN(n)) throw new PSError('typecheck'); return vm.push(PS.int(Math.trunc(n))); }
    throw new PSError('typecheck');
  },
  cvr(vm) {
    const o = vm.pop();
    if (o.type === T.REAL) return vm.push(o);
    if (o.type === T.INTEGER) return vm.push(PS.real(o.value));
    if (o.type === T.STRING) { const n = parseFloat(o.value.toJSString()); if (Number.isNaN(n)) throw new PSError('typecheck'); return vm.push(PS.real(n)); }
    throw new PSError('typecheck');
  },
  cvn(vm) { const o = vm.popType(T.STRING); vm.push(PS.name(o.value.toJSString(), o.executable)); },
  cvs(vm) {
    const s = vm.popType(T.STRING);
    const any = vm.pop();
    const str = anyToString(any);
    const m = Math.min(str.length, s.value.length);
    for (let i = 0; i < m; i++) s.value.put(i, str.charCodeAt(i) & 0xff);
    vm.push(new PSObject(T.STRING, s.value.getInterval(0, m), false));
  },

  bind(vm) {
    const proc = vm.pop();
    if (proc.type !== T.ARRAY) throw new PSError('typecheck');
    bindArray(vm, proc.value);
    vm.push(proc);
  },
};
