import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt } from '../engine/font/type1-crypt.js';
import { parseType1 } from '../engine/font/type1.js';
import { VM } from '../engine/vm.js';

// The triangle charstring (decrypted form) from type1.test.js.
const TRIANGLE = Uint8Array.of(139, 249, 130, 13, 239, 139, 21, 247, 192, 139, 5, 251, 42, 248, 236, 5, 9, 14);

const bytes = (str) => { const b = new Uint8Array(str.length); for (let i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 0xff; return b; };
const concat = (...arrs) => { const n = arrs.reduce((a, x) => a + x.length, 0); const out = new Uint8Array(n); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };

// Build a minimal but real Type 1 font program: a cleartext header + an
// eexec-encrypted Private dict with one CharString ("A" = the triangle).
function buildSyntheticFont() {
  const csEnc = encrypt(concat(Uint8Array.of(0, 0, 0, 0), TRIANGLE), 4330); // lenIV(4) lead + charstring
  const privPlain = concat(
    Uint8Array.of(0, 0, 0, 0),                                              // eexec lead bytes
    bytes('dup /Private 3 dict dup begin\n/lenIV 4 def\n/CharStrings 1 dict dup begin\n/A ' + csEnc.length + ' RD '),
    csEnc,
    bytes(' ND\nend end\nreadonly put\n'),
  );
  const eexec = encrypt(privPlain, 55665);
  const clear = bytes(
    '%!PS-AdobeFont-1.0: DemoFont 001.000\n' +
    '/FontName /DemoFont def\n' +
    '/FontMatrix [0.001 0 0 0.001 0 0] def\n' +
    '/Encoding 256 array\ndup 65 /A put\nreadonly def\n' +
    'currentdict end\ncurrentfile eexec\n');
  return concat(clear, eexec);
}

test('parseType1 extracts FontName, FontMatrix, Encoding and CharStrings', () => {
  const f = parseType1(buildSyntheticFont());
  assert.equal(f.fontName, 'DemoFont');
  assert.deepEqual(f.fontMatrix, [0.001, 0, 0, 0.001, 0, 0]);
  assert.equal(f.encoding[65], 'A');
  assert.ok(f.charstrings.get('A'), 'charstring A present');
  assert.deepEqual(Array.from(f.charstrings.get('A')), Array.from(TRIANGLE)); // decrypted back to the original
});

test('parsed font renders via findfont / setfont / show', () => {
  const fills = [];
  const capture = {
    beginPage() {}, endPage() {}, showPage() {}, save() {}, restore() {}, stroke() {}, clip() {}, showText() {},
    fill(path) { fills.push(path.segs.map((s) => s.op).join('')); },
  };
  const vm = new VM({ driver: capture, out() {} });
  vm.registerFont('DemoFont', parseType1(buildSyntheticFont()));
  vm.runString('/DemoFont findfont 1000 scalefont setfont newpath 0 0 moveto (A) show');

  assert.equal(fills.length, 1);
  assert.equal(fills[0], 'MLLZ');     // the triangle outline, filled
});
