import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PS, T, MARK, NULL, nameString } from '../engine/object.js';

test('int vs real keep distinct tags', () => {
  assert.equal(PS.int(5).type, T.INTEGER);
  assert.equal(PS.real(5).type, T.REAL);
  assert.equal(PS.int(5).value, 5);
});

test('name interning gives identity regardless of exec flag', () => {
  const a = PS.name('foo');
  const b = PS.name('foo', true);
  assert.equal(a.value, b.value);                       // same interned id
  assert.equal(nameString(a.value), 'foo');
  assert.notEqual(PS.name('foo').value, PS.name('bar').value);
});

test('literal vs executable name flag', () => {
  assert.equal(PS.name('foo', false).isLiteralName, true);
  assert.equal(PS.name('foo', true).isExecutableName, true);
});

test('string window aliases backing on getInterval', () => {
  const s = PS.string('hello').value;                   // PSString
  const sub = s.getInterval(1, 3);                      // 'ell'
  assert.equal(sub.toJSString(), 'ell');
  sub.put(0, 'E'.charCodeAt(0));                        // mutate through the window
  assert.equal(s.toJSString(), 'hEllo');                // visible in the parent (shared storage)
});

test('array window aliases backing on getInterval', () => {
  const arr = PS.array([PS.int(1), PS.int(2), PS.int(3)]).value;
  const sub = arr.getInterval(1, 2);
  assert.equal(sub.get(0).value, 2);
  sub.put(0, PS.int(99));
  assert.equal(arr.get(1).value, 99);                   // shared storage
});

test('mark and null are singletons', () => {
  assert.equal(MARK.type, T.MARK);
  assert.equal(NULL.type, T.NULL);
  assert.equal(MARK, MARK);
});
