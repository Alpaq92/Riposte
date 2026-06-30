import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decrypt, encrypt } from '../engine/font/type1-crypt.js';
import { runCharstring } from '../engine/font/type1-charstring.js';
import { VM } from '../engine/vm.js';
import { PSObject, T } from '../engine/object.js';

// A hand-built charstring for a triangle:
//   hsbw(0, 750) ; 100 0 rmoveto ; 300 0 rlineto ; -150 600 rlineto ; closepath ; endchar
const TRIANGLE = Uint8Array.of(
  139, 249, 130, 13,      // 0 750 hsbw
  239, 139, 21,           // 100 0 rmoveto
  247, 192, 139, 5,       // 300 0 rlineto
  251, 42, 248, 236, 5,   // -150 600 rlineto
  9,                      // closepath
  14,                     // endchar
);

test('Type 1 cipher round-trips (encrypt -> decrypt)', () => {
  const lead = Uint8Array.of(1, 2, 3, 4);          // 4 lead bytes discarded by decrypt
  const plain = Uint8Array.of(10, 20, 30, 200, 255, 0, 7);
  const full = Uint8Array.of(...lead, ...plain);
  const cipher = encrypt(full, 4330);
  const back = decrypt(cipher, 4330, 4);
  assert.deepEqual(Array.from(back), Array.from(plain));
});

test('charstring interpreter: lines (triangle) -> outline + width', () => {
  const ops = [];
  const sink = {
    moveTo: (x, y) => ops.push(['M', x, y]),
    lineTo: (x, y) => ops.push(['L', x, y]),
    curveTo: (...a) => ops.push(['C', ...a]),
    close: () => ops.push(['Z']),
  };
  const { width, sbx } = runCharstring(TRIANGLE, { subrs: [], sink });
  assert.equal(width, 750);
  assert.equal(sbx, 0);
  assert.deepEqual(ops, [['M', 100, 0], ['L', 400, 0], ['L', 250, 600], ['Z']]);
});

test('charstring interpreter: rrcurveto -> one cubic', () => {
  // hsbw(0,1000); 0 0 rmoveto; 100 200 300 0 100 -200 rrcurveto; endchar
  const cs = Uint8Array.of(
    139, 250, 124, 13,                       // 0 1000 hsbw
    139, 139, 21,                            // 0 0 rmoveto
    239, 247, 92, 247, 192, 139, 239, 251, 92, 8,  // 100 200 300 0 100 -200 rrcurveto
    14,                                      // endchar
  );
  const ops = [];
  const sink = { moveTo: (x, y) => ops.push(['M', x, y]), lineTo: () => {}, curveTo: (...a) => ops.push(['C', ...a]), close: () => {} };
  runCharstring(cs, { subrs: [], sink });
  assert.equal(ops[0][0], 'M');
  const c = ops.find((o) => o[0] === 'C');
  assert.ok(c, 'a curve was emitted');
  // start (0,0): c1=(100,200), c2=(400,200), end=(500,0)
  assert.deepEqual(c.slice(1), [100, 200, 400, 200, 500, 0]);
});

test('show renders an embedded Type 1 glyph as a filled outline', () => {
  const fills = [];
  const capture = {
    beginPage() {}, endPage() {}, showPage() {}, save() {}, restore() {},
    stroke() {}, clip() {}, showText() {},
    fill(path) { fills.push({ ops: path.segs.map((s) => s.op).join(''), first: path.segs[0] }); },
  };
  const fd = {
    charstrings: new Map([['A', TRIANGLE]]),
    encoding: (() => { const e = []; e[65] = 'A'; return e; })(),
    fontMatrix: [0.001, 0, 0, 0.001, 0, 0],
    subrs: [],
    size: 1000,           // 0.001 * 1000 = 1 -> glyph units map 1:1 to user units
  };
  const vm = new VM({ driver: capture, out() {} });   // CTM stays identity (no Y-flip)
  vm.gstate.font = new PSObject(T.FONTID, fd, false);
  vm.runString('newpath 0 0 moveto (A) show');

  assert.equal(fills.length, 1);
  assert.equal(fills[0].ops, 'MLLZ');                  // triangle: move, line, line, close
  assert.deepEqual([fills[0].first.x, fills[0].first.y], [100, 0]);
});
