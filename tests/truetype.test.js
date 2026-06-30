import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrueType } from '../engine/font/truetype.js';

// --- Synthetic TTF builder ---------------------------------------------------
// We build a minimal but real sfnt in memory: head, maxp, hhea, hmtx, cmap
// (format 4 mapping 'A' -> gid 1), loca (short), glyf (gid 0 empty, gid 1 a
// triangle), and a name table. Each table is laid out below, padded to a 4-byte
// boundary, then the offset table + directory are written in front.

const UNITS_PER_EM = 1000;
const ADV_WIDTH_GID1 = 723;     // arbitrary advance width we read back from hmtx

// A big-endian byte writer backed by a growable plain array.
class W {
  constructor() { this.b = []; }
  get length() { return this.b.length; }
  u8(v) { this.b.push(v & 0xff); return this; }
  u16(v) { this.b.push((v >>> 8) & 0xff, v & 0xff); return this; }
  i16(v) { return this.u16(v & 0xffff); }
  u32(v) { this.b.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); return this; }
  tag(s) { for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i)); return this; }
  bytes(arr) { for (const v of arr) this.u8(v); return this; }
  pad4() { while (this.b.length % 4) this.b.push(0); return this; }
  out() { return this.b; }
}

function buildHead() {
  const w = new W();
  w.u32(0x00010000);    // version
  w.u32(0x00010000);    // fontRevision
  w.u32(0);             // checkSumAdjustment
  w.u32(0x5f0f3cf5);    // magicNumber
  w.u16(0);             // flags
  w.u16(UNITS_PER_EM);  // unitsPerEm        (offset +18)
  w.u32(0); w.u32(0);   // created (8 bytes)
  w.u32(0); w.u32(0);   // modified (8 bytes)
  w.i16(0); w.i16(0); w.i16(1000); w.i16(800);  // bbox xMin/yMin/xMax/yMax
  w.u16(0);             // macStyle
  w.u16(8);             // lowestRecPPEM
  w.i16(2);             // fontDirectionHint
  w.i16(0);             // indexToLocFormat  (offset +50): 0 = short loca
  w.i16(0);             // glyphDataFormat
  return w.out();
}

function buildMaxp(numGlyphs) {
  const w = new W();
  w.u32(0x00010000);    // version
  w.u16(numGlyphs);     // numGlyphs (offset +4)
  // remaining maxp 1.0 fields can be zero for our purposes
  for (let i = 0; i < 13; i++) w.u16(0);
  return w.out();
}

function buildHhea(numberOfHMetrics) {
  const w = new W();
  w.u32(0x00010000);    // version
  w.i16(800);           // ascender
  w.i16(-200);          // descender
  w.i16(0);             // lineGap
  w.u16(1000);          // advanceWidthMax
  w.i16(0);             // minLeftSideBearing
  w.i16(0);             // minRightSideBearing
  w.i16(1000);          // xMaxExtent
  w.i16(1);             // caretSlopeRise
  w.i16(0);             // caretSlopeRun
  w.i16(0);             // caretOffset
  w.i16(0); w.i16(0); w.i16(0); w.i16(0);  // 4 reserved
  w.i16(0);             // metricDataFormat
  w.u16(numberOfHMetrics);   // numberOfHMetrics (offset +34)
  return w.out();
}

function buildHmtx() {
  // numberOfHMetrics = 2: gid 0 and gid 1, each (advanceWidth u16, lsb i16).
  const w = new W();
  w.u16(600); w.i16(0);              // gid 0
  w.u16(ADV_WIDTH_GID1); w.i16(100); // gid 1
  return w.out();
}

// cmap with one format-4 subtable (platform 3, encoding 1) mapping 'A' (65) ->
// gid 1. We use idDelta to map the segment, with idRangeOffset = 0.
function buildCmap() {
  // Format 4 body. Two segments: [65..65] and the required [0xffff..0xffff].
  // For segment 0, idDelta is chosen so 65 + idDelta == 1 (mod 65536):
  //   idDelta = 1 - 65 = -64.
  const seg = new W();
  const segCount = 2;
  seg.u16(4);                 // format
  seg.u16(0);                 // length (patched below)
  seg.u16(0);                 // language
  seg.u16(segCount * 2);      // segCountX2
  seg.u16(2);                 // searchRange (not used by reader)
  seg.u16(0);                 // entrySelector
  seg.u16(0);                 // rangeShift
  seg.u16(65); seg.u16(0xffff);          // endCode[]
  seg.u16(0);                            // reservedPad
  seg.u16(65); seg.u16(0xffff);          // startCode[]
  seg.i16(-64); seg.i16(1);              // idDelta[]  (seg1 delta irrelevant)
  seg.u16(0); seg.u16(0);                // idRangeOffset[]
  const sub = seg.out();
  // patch length (bytes 2..3)
  sub[2] = (sub.length >>> 8) & 0xff; sub[3] = sub.length & 0xff;

  // cmap header: version, numTables, then one encoding record, then the subtable.
  const w = new W();
  w.u16(0);                   // version
  w.u16(1);                   // numTables
  const recordSize = 8;       // platformID u16, encodingID u16, offset u32
  const headerSize = 4 + recordSize;
  w.u16(3);                   // platformID (Windows)
  w.u16(1);                   // encodingID (Unicode BMP)
  w.u32(headerSize);          // offset to subtable from cmap start
  w.bytes(sub);
  return w.out();
}

function buildLoca(glyfLengths) {
  // Short loca: cumulative half-offsets. glyfLengths must each be even.
  const w = new W();
  let acc = 0;
  w.u16(acc / 2);
  for (const len of glyfLengths) { acc += len; w.u16(acc / 2); }
  return w.out();
}

// gid 1: a simple triangle, one contour, three on-curve points.
function buildTriangleGlyph(p0, p1, p2) {
  const w = new W();
  w.i16(1);                   // numberOfContours
  w.i16(0); w.i16(0); w.i16(1000); w.i16(800);  // bbox
  w.u16(2);                   // endPtsOfContours[0] = last point index (3 points)
  w.u16(0);                   // instructionLength
  // flags: all three on-curve (0x01). No repeats. Use long-form coords (no
  // X_SHORT / Y_SHORT, no SAME bits) so we can write absolute deltas as i16.
  w.u8(0x01); w.u8(0x01); w.u8(0x01);
  // X deltas (i16): first is absolute from 0, then successive deltas.
  w.i16(p0[0]); w.i16(p1[0] - p0[0]); w.i16(p2[0] - p1[0]);
  // Y deltas (i16)
  w.i16(p0[1]); w.i16(p1[1] - p0[1]); w.i16(p2[1] - p1[1]);
  // pad the glyph to an even byte length so short loca stays exact
  if (w.length % 2) w.u8(0);
  return w.out();
}

// A glyph with an off-curve control point to exercise quadratic -> cubic.
// One contour: on-curve (0,0), off-curve control (500,1000), on-curve (1000,0).
function buildCurveGlyph() {
  const w = new W();
  w.i16(1);                   // numberOfContours
  w.i16(0); w.i16(0); w.i16(1000); w.i16(1000);
  w.u16(2);                   // last point index
  w.u16(0);                   // instructionLength
  // flags: on-curve, OFF-curve, on-curve
  w.u8(0x01); w.u8(0x00); w.u8(0x01);
  // X: 0, +500, +500
  w.i16(0); w.i16(500); w.i16(500);
  // Y: 0, +1000, -1000
  w.i16(0); w.i16(1000); w.i16(-1000);
  if (w.length % 2) w.u8(0);
  return w.out();
}

function buildName(psName) {
  // One record: platform 3 (Windows), nameID 6 (PostScript), UTF-16BE.
  const strBytes = [];
  for (let i = 0; i < psName.length; i++) { strBytes.push(0, psName.charCodeAt(i)); }
  const w = new W();
  w.u16(0);                   // format
  w.u16(1);                   // count
  const stringOffset = 6 + 12;  // header(6) + one record(12)
  w.u16(stringOffset);        // stringOffset
  // name record
  w.u16(3);                   // platformID
  w.u16(1);                   // encodingID
  w.u16(0x0409);              // languageID (en-US)
  w.u16(6);                   // nameID (PostScript name)
  w.u16(strBytes.length);     // length
  w.u16(0);                   // offset into string storage
  w.bytes(strBytes);
  return w.out();
}

// Assemble all tables into a complete sfnt.
function buildTTF() {
  // glyf: gid 0 empty (length 0), gid 1 triangle.
  const triangle = buildTriangleGlyph([100, 0], [900, 0], [500, 800]);
  const glyfData = triangle.slice();             // gid 0 contributes nothing
  const glyfLengths = [0, triangle.length];      // per-gid lengths -> loca
  const numGlyphs = 2;

  const tablesRaw = {
    head: buildHead(),
    maxp: buildMaxp(numGlyphs),
    hhea: buildHhea(2),
    hmtx: buildHmtx(),
    cmap: buildCmap(),
    loca: buildLoca(glyfLengths),
    glyf: glyfData,
    name: buildName('TestTT'),
  };

  // Directory order: tags should be sorted, but the reader doesn't care.
  const tags = Object.keys(tablesRaw);
  const numTables = tags.length;
  const dirSize = 12 + numTables * 16;

  // Compute offsets (each table 4-byte aligned).
  const records = [];
  let offset = dirSize;
  for (const tag of tags) {
    const data = tablesRaw[tag];
    records.push({ tag, offset, length: data.length, data });
    offset += data.length;
    while (offset % 4) offset++;                  // align next table
  }
  const totalSize = offset;

  const out = new Uint8Array(totalSize);
  const dw = new W();
  dw.u32(0x00010000);          // sfnt version
  dw.u16(numTables);
  // searchRange / entrySelector / rangeShift (cosmetic; reader skips them)
  let entrySelector = 0, sr = 1;
  while (sr * 2 <= numTables) { sr *= 2; entrySelector++; }
  dw.u16(sr * 16);
  dw.u16(entrySelector);
  dw.u16(numTables * 16 - sr * 16);
  for (const rec of records) {
    dw.tag(rec.tag);
    dw.u32(0);                 // checksum (zero is fine)
    dw.u32(rec.offset);
    dw.u32(rec.length);
  }
  const dirBytes = dw.out();
  out.set(dirBytes, 0);
  for (const rec of records) out.set(rec.data, rec.offset);
  return out;
}

// --- Tests -------------------------------------------------------------------

test('parseTrueType: head / maxp metrics', () => {
  const desc = parseTrueType(buildTTF());
  assert.equal(desc.truetype, true);
  assert.equal(desc.unitsPerEm, 1000);
  assert.equal(desc.numGlyphs, 2);
  assert.deepEqual(desc.fontMatrix, [1 / 1000, 0, 0, 1 / 1000, 0, 0]);
  assert.equal(desc.fontName, 'TestTT');
});

test('parseTrueType: cmap format 4 maps A -> gid 1, others -> 0', () => {
  const desc = parseTrueType(buildTTF());
  assert.equal(desc.cmapLookup(65), 1);   // 'A'
  assert.equal(desc.cmapLookup(66), 0);   // 'B' unmapped
  assert.equal(desc.cmapLookup(0), 0);
});

test('parseTrueType: hmtx advance widths', () => {
  const desc = parseTrueType(buildTTF());
  assert.equal(desc.advanceWidth(1), ADV_WIDTH_GID1);
  // gid beyond numberOfHMetrics clamps to the last hMetric
  assert.equal(desc.advanceWidth(99), ADV_WIDTH_GID1);
});

test('parseTrueType: simple glyph outline (triangle)', () => {
  const desc = parseTrueType(buildTTF());
  const ops = [];
  const sink = {
    moveTo: (x, y) => ops.push(['M', x, y]),
    lineTo: (x, y) => ops.push(['L', x, y]),
    curveTo: (...a) => ops.push(['C', ...a]),
    close: () => ops.push(['Z']),
  };
  desc.glyphOutline(1, sink);
  // Start on-curve point (100,0), then lineTo (900,0), lineTo (500,800), close.
  assert.deepEqual(ops, [
    ['M', 100, 0],
    ['L', 900, 0],
    ['L', 500, 800],
    ['Z'],
  ]);
});

test('parseTrueType: empty glyph (.notdef gid 0) emits nothing', () => {
  const desc = parseTrueType(buildTTF());
  const ops = [];
  const sink = { moveTo: () => ops.push('M'), lineTo: () => ops.push('L'), curveTo: () => ops.push('C'), close: () => ops.push('Z') };
  desc.glyphOutline(0, sink);
  assert.equal(ops.length, 0);
});

test('parseTrueType: quadratic off-curve point becomes a cubic curveTo', () => {
  // Build a TTF whose gid 1 carries an off-curve control point. We reuse the
  // builder but swap the triangle glyph for the curve glyph.
  const curve = buildCurveGlyph();
  const glyfLengths = [0, curve.length];

  // Rebuild a TTF inline with the curve glyph as gid 1.
  const tablesRaw = {
    head: buildHead(),
    maxp: buildMaxp(2),
    hhea: buildHhea(2),
    hmtx: buildHmtx(),
    cmap: buildCmap(),
    loca: buildLoca(glyfLengths),
    glyf: curve.slice(),
    name: buildName('TestTT'),
  };
  const tags = Object.keys(tablesRaw);
  const dirSize = 12 + tags.length * 16;
  const records = [];
  let off = dirSize;
  for (const tag of tags) { const d = tablesRaw[tag]; records.push({ tag, offset: off, length: d.length, data: d }); off += d.length; while (off % 4) off++; }
  const out = new Uint8Array(off);
  const dw = new W();
  dw.u32(0x00010000); dw.u16(tags.length); dw.u16(16); dw.u16(0); dw.u16(tags.length * 16 - 16);
  for (const rec of records) { dw.tag(rec.tag); dw.u32(0); dw.u32(rec.offset); dw.u32(rec.length); }
  out.set(dw.out(), 0);
  for (const rec of records) out.set(rec.data, rec.offset);

  const desc = parseTrueType(out);
  const ops = [];
  const sink = {
    moveTo: (x, y) => ops.push(['M', x, y]),
    lineTo: (x, y) => ops.push(['L', x, y]),
    curveTo: (...a) => ops.push(['C', ...a]),
    close: () => ops.push(['Z']),
  };
  desc.glyphOutline(1, sink);

  // Expect: moveTo(0,0); a curveTo to (1000,0); a closing lineTo back to start;
  // close. The cubic control points come from the quadratic conversion:
  //   P0=(0,0), Q=(500,1000), P2=(1000,0)
  //   C1 = P0 + 2/3 (Q-P0) = (333.33, 666.67)
  //   C2 = P2 + 2/3 (Q-P2) = (666.67, 666.67)
  assert.deepEqual(ops[0], ['M', 0, 0]);
  const c = ops.find((o) => o[0] === 'C');
  assert.ok(c, 'a curveTo was emitted from the quadratic segment');
  const approx = (a, b) => Math.abs(a - b) < 1e-6;
  assert.ok(approx(c[1], 1000 / 3), 'C1x ~= 333.33');
  assert.ok(approx(c[2], 2000 / 3), 'C1y ~= 666.67');
  assert.ok(approx(c[3], 2000 / 3), 'C2x ~= 666.67');
  assert.ok(approx(c[4], 2000 / 3), 'C2y ~= 666.67');
  assert.deepEqual([c[5], c[6]], [1000, 0], 'curve endpoint is P2');
  assert.deepEqual(ops[ops.length - 1], ['Z']);
});
