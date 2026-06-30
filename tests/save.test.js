import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VM } from '../engine/vm.js';
import { T } from '../engine/object.js';

function run(src) {
  const out = [];
  const vm = new VM({ out: (s) => out.push(s) });
  vm.runString(src);
  return { vm, out: out.join('') };
}

test('save returns a save object', () => {
  assert.equal(run('save').vm.ostack[0].type, T.SAVE);
});

test('restore rolls back an array put', () => {
  // a[0] = 99 after save, then restore -> back to 1
  const { out } = run('/a [1 2 3] def save a 0 99 put a 0 get == restore a 0 get ==');
  assert.equal(out, '99\n1\n');
});

test('restore rolls back a string put', () => {
  const { out } = run('/s (abc) def save s 0 88 put s 0 get == restore s 0 get ==');
  assert.equal(out, '88\n97\n');   // 88='X', 97='a'
});

test('restore rolls back dict additions and value changes', () => {
  const { out } = run('/d 2 dict def d /x 5 put save d /x 99 put d /y 7 put d /x get == restore d /x get == d /y known ==');
  assert.equal(out, '99\n5\nfalse\n');   // y added after save is gone
});

test('restore through getinterval window aliasing', () => {
  // mutate a sub-window after save; restore must roll back the shared backing
  const { out } = run('/a [10 20 30 40] def /b a 1 2 getinterval def save b 0 99 put a 1 get == restore a 1 get ==');
  assert.equal(out, '99\n20\n');
});

test('nested save/restore', () => {
  const { out } = run('/a [0] def save a 0 1 put save a 0 2 put a 0 get == restore a 0 get == restore a 0 get ==');
  assert.equal(out, '2\n1\n0\n');
});

test('restore of a non-save raises typecheck', () => {
  assert.throws(() => run('5 restore'), (e) => e.psname === 'typecheck');
});

test('mutations with no active save are not tracked (no crash)', () => {
  const { out } = run('/a [1] def a 0 9 put a 0 get ==');
  assert.equal(out, '9\n');
});
