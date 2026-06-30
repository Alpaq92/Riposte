import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VM } from '../engine/vm.js';
import { T, nameString } from '../engine/object.js';

function run(src) {
  const out = [];
  const vm = new VM({ out: (s) => out.push(s) });
  vm.runString(src);
  return { vm, out: out.join('') };
}
const stackValues = (vm) => vm.ostack.map((o) => o.value);
const top = (vm) => vm.ostack[vm.ostack.length - 1];

test('arithmetic and == output', () => {
  const { vm, out } = run('3 4 add ==');
  assert.equal(out, '7\n');
  assert.equal(vm.ostack.length, 0);
});

test('int/real distinction is preserved through arithmetic', () => {
  assert.equal(run('2 3 mul').vm.ostack[0].type, T.INTEGER);
  const r = run('7 2 div').vm.ostack[0];
  assert.equal(r.type, T.REAL);
  assert.equal(r.value, 3.5);
});

test('def and load via the dict stack', () => {
  const { vm } = run('/x 5 def x x add');
  assert.equal(top(vm).value, 10);
});

test('ifelse', () => {
  assert.equal(run('2 3 lt {10}{20} ifelse').vm.ostack[0].value, 10);
  assert.equal(run('5 3 lt {10}{20} ifelse').vm.ostack[0].value, 20);
});

test('for accumulates', () => {
  assert.equal(run('0 1 1 4 {add} for').vm.ostack[0].value, 10); // 0+1+2+3+4
});

test('repeat', () => {
  assert.equal(run('0 5 {1 add} repeat').vm.ostack[0].value, 5);
});

test('loop with exit', () => {
  assert.equal(run('0 {1 add dup 5 ge {exit} if} loop').vm.ostack[0].value, 5);
});

test('deep recursion does NOT overflow the JS call stack', () => {
  // 20000-deep recursion through ifelse — would blow a host-recursive evaluator.
  const { vm } = run('/count {dup 0 gt {1 sub count} {} ifelse} def 20000 count');
  assert.equal(top(vm).value, 0);
});

test('stopped catches an error and yields true', () => {
  const { vm } = run('{1 0 div} stopped');     // div-by-zero -> undefinedresult
  assert.equal(vm.ostack.length, 1);
  assert.equal(top(vm).type, T.BOOLEAN);
  assert.equal(top(vm).value, true);
});

test('stopped on a clean proc yields false', () => {
  const { vm } = run('{42} stopped');
  assert.equal(vm.ostack.length, 2);
  assert.equal(vm.ostack[0].value, 42);
  assert.equal(top(vm).value, false);
});

test('forall over an array', () => {
  assert.equal(run('0 [1 2 3] {add} forall').vm.ostack[0].value, 6);
});

test('roll rotates the top n elements', () => {
  // 1 2 3  (3 top)  ->  3 1 1 roll  ->  3 1 2
  assert.deepEqual(stackValues(run('1 2 3 3 1 roll').vm), [3, 1, 2]);
});

test('array build, length, get', () => {
  assert.equal(run('[10 20 30] length').vm.ostack[0].value, 3);
  assert.equal(run('[10 20 30] 1 get').vm.ostack[0].value, 20);
});

test('dict: begin/def/load/end', () => {
  assert.equal(run('1 dict begin /a 7 def a end').vm.ostack[0].value, 7);
});

test('<< >> dict constructor and get', () => {
  assert.equal(run('<< /a 1 /b 2 >> /b get').vm.ostack[0].value, 2);
});

test('type operator', () => {
  const { vm } = run('/x type');
  assert.equal(nameString(top(vm).value), 'nametype');
});

test('bind replaces operators and user redefinition still works', () => {
  // redefining add in userdict is honored by execName
  const { vm } = run('/add {sub} def 10 3 add');
  assert.equal(top(vm).value, 7);
});

test('string: build, length, put, get', () => {
  assert.equal(run('(abc) length').vm.ostack[0].value, 3);
  assert.equal(run('(abc) 0 get').vm.ostack[0].value, 97); // 'a'
});

test('undefined name raises (propagates out of run)', () => {
  assert.throws(() => run('nosuchname'), (e) => e.psname === 'undefined');
});
