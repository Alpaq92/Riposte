import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt } from '../engine/font/type1-crypt.js';
import { VM } from '../engine/vm.js';

// The triangle charstring (decrypted form), shared with the Type 1 tests.
const TRIANGLE = Uint8Array.of(139, 249, 130, 13, 239, 139, 21, 247, 192, 139, 5, 251, 42, 248, 236, 5, 9, 14);
const bytes = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b; };
const concat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0); const o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };

// A complete .ps that DEFINES a Type 1 font inline via `currentfile eexec` and
// then USES it — exactly the in-document font case.
function inlineFontDoc(drawTail) {
  const csEnc = encrypt(concat(Uint8Array.of(0, 0, 0, 0), TRIANGLE), 4330);
  const priv = concat(
    Uint8Array.of(0, 0, 0, 0),
    bytes('dup /Private 3 dict dup begin\n/lenIV 4 def\n/CharStrings 1 dict dup begin\n/A ' + csEnc.length + ' RD '),
    csEnc,
    bytes(' ND\nend end\nreadonly put\n'),
  );
  const eexecBin = encrypt(priv, 55665);
  const header = bytes(
    '%!PS-AdobeFont-1.0: DemoFont\n' +
    '/FontName /DemoFont def\n' +
    '/FontMatrix [0.001 0 0 0.001 0 0] def\n' +
    '/Encoding 256 array\ndup 65 /A put\ndef\n' +
    'currentfile eexec\n');
  const tail = bytes('\n0000000000000000\ncleartomark\n');
  return concat(header, eexecBin, tail, bytes(drawTail));
}

function captureVM() {
  const fills = [];
  const driver = {
    beginPage() {}, endPage() {}, showPage() {}, save() {}, restore() {}, stroke() {}, clip() {}, showText() {},
    fill(p) { fills.push(p.segs.map((s) => s.op).join('')); },
  };
  return { vm: new VM({ driver, out() {} }), fills };
}

test('in-document eexec registers an embedded Type 1 font', () => {
  const { vm } = captureVM();
  vm.runString(inlineFontDoc(''));
  const fd = vm.fonts.get('DemoFont');
  assert.ok(fd, 'eexec registered DemoFont');
  assert.ok(fd.charstrings.get('A'), 'CharString A extracted');
  assert.deepEqual(Array.from(fd.charstrings.get('A')), Array.from(TRIANGLE));
});

test('execution resumes after the eexec block and renders the embedded glyph', () => {
  const { vm, fills } = captureVM();
  vm.runString(inlineFontDoc('/DemoFont findfont 1000 scalefont setfont newpath 0 0 moveto (A) show showpage'));
  assert.equal(fills.length, 1);
  assert.equal(fills[0], 'MLLZ');   // the triangle outline, filled
});

test('streaming currentfile is available to the running program', () => {
  const { vm } = captureVM();
  // currentfile must return a file object (type-checks through `closefile`).
  vm.runString('currentfile closefile');
});
