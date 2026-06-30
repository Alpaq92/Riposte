import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, parseNumber, PSSyntaxError } from '../engine/scanner.js';
import { T, nameString } from '../engine/object.js';

test('basic sequence: 1 2 add', () => {
  const t = tokenize('1 2 add');
  assert.equal(t.length, 3);
  assert.equal(t[0].type, T.INTEGER);
  assert.equal(t[0].value, 1);
  assert.equal(t[2].type, T.NAME);
  assert.equal(t[2].isExecutableName, true);
  assert.equal(nameString(t[2].value), 'add');
});

test('numbers: int, real, radix, exponent, signed; fallbacks', () => {
  assert.deepEqual(parseNumber('-42'), { type: 'integer', value: -42 });
  assert.deepEqual(parseNumber('3.14'), { type: 'real', value: 3.14 });
  assert.deepEqual(parseNumber('16#FF'), { type: 'integer', value: 255 });
  assert.deepEqual(parseNumber('1e3'), { type: 'real', value: 1000 });
  assert.equal(parseNumber('1e'), null);       // not a number -> becomes a name
  assert.equal(parseNumber('--'), null);
});

test('literal and immediate names', () => {
  const [lit] = tokenize('/foo');
  assert.equal(lit.isLiteralName, true);
  assert.equal(nameString(lit.value), 'foo');
  const [imm] = tokenize('//bar');
  assert.equal(imm.isExecutableName, true);
  assert.equal(imm.immediate, true);
});

test('string with nesting and escapes', () => {
  const [s] = tokenize('(a(b)c\\n\\101)');
  assert.equal(s.type, T.STRING);
  assert.equal(s.value.toJSString(), 'a(b)c\nA');
});

test('hex string', () => {
  const [s] = tokenize('<48656C6C6F>');
  assert.equal(s.value.toJSString(), 'Hello');
});

test('procedure is a single executable array', () => {
  const t = tokenize('{1 2 add}');
  assert.equal(t.length, 1);
  assert.equal(t[0].type, T.ARRAY);
  assert.equal(t[0].isExecutable, true);
  assert.equal(t[0].value.length, 3);
  assert.equal(nameString(t[0].value.get(2).value), 'add');
});

test('nested procedure', () => {
  const t = tokenize('{1 {2} add}');
  assert.equal(t[0].value.length, 3);
  const inner = t[0].value.get(1);
  assert.equal(inner.type, T.ARRAY);
  assert.equal(inner.isExecutable, true);
  assert.equal(inner.value.get(0).value, 2);
});

test('array brackets are executable-name tokens (built at run time)', () => {
  const t = tokenize('[1 2 3]');
  assert.equal(nameString(t[0].value), '[');
  assert.equal(t[0].isExecutableName, true);
  assert.equal(nameString(t[4].value), ']');
});

test('<< and >> are executable-name tokens', () => {
  const t = tokenize('<< /a 1 >>');
  assert.equal(nameString(t[0].value), '<<');
  assert.equal(nameString(t[t.length - 1].value), '>>');
});

test('comments are skipped', () => {
  const t = tokenize('% a comment\n42 %tail\n');
  assert.equal(t.length, 1);
  assert.equal(t[0].value, 42);
});

test('unmatched close brace throws', () => {
  assert.throws(() => tokenize('1 2 }'), PSSyntaxError);
});
