import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VM } from '../engine/vm.js';

// The parser is covered by truetype.test.js; here we verify the renderer wiring:
// findfont(registered TrueType) -> setfont -> show -> renderTrueType -> driver.fill,
// using a stand-in descriptor that exposes the same cmap/outline/advance API.
test('show fills an embedded TrueType glyph via cmap + glyphOutline', () => {
  const fills = [];
  const driver = {
    beginPage() {}, endPage() {}, showPage() {}, save() {}, restore() {}, stroke() {}, clip() {}, showText() {},
    fill(p) { fills.push(p.segs.map((s) => s.op).join('')); },
  };
  const vm = new VM({ driver, out() {} });
  vm.registerFont('FakeTT', {
    truetype: true, unitsPerEm: 1000, fontMatrix: [0.001, 0, 0, 0.001, 0, 0], numGlyphs: 2,
    cmapLookup: (c) => (c === 65 ? 1 : 0),
    advanceWidth: (g) => (g ? 700 : 0),
    glyphOutline: (g, sink) => { if (g !== 1) return; sink.moveTo(0, 0); sink.lineTo(700, 0); sink.lineTo(350, 800); sink.close(); },
  });
  vm.runString('/FakeTT findfont 1000 scalefont setfont newpath 0 0 moveto (A) show');
  assert.equal(fills.length, 1);
  assert.equal(fills[0], 'MLLZ');   // triangle outline, filled
});
