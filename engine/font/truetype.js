// engine/font/truetype.js
// A clean-room TrueType (sfnt) parser. Given font bytes it returns a descriptor
// the renderer can use:
//   { truetype, fontName, unitsPerEm, fontMatrix, numGlyphs,
//     cmapLookup(charCode), advanceWidth(gid), glyphOutline(gid, sink) }
//
// Outlines are emitted to a sink with moveTo / lineTo / curveTo / close, in font
// units (the caller applies fontMatrix * size * CTM). TrueType outlines are
// quadratic; each quadratic segment is upgraded to a CUBIC for curveTo (the rest
// of the engine speaks cubic Béziers only):
//   C1 = P0 + (2/3)(Q - P0) ; C2 = P2 + (2/3)(Q - P2)
//
// We implement the sfnt offset table, the head/maxp/hhea/hmtx/loca/glyf/cmap/name
// tables, simple + composite glyphs, and cmap formats 4 / 12 / 6 / 0.

import { coerceBytes } from './bytes.js';

// True if the bytes start with an sfnt magic this parser handles (TrueType
// outlines: 0x00010000 or 'true'). Lets the demo route .ttf vs Type 1 without
// re-encoding the magic numbers.
export const isSfnt = (b) => {
  if (!b || b.length < 4) return false;
  const v = (b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3]) >>> 0;
  return v === 0x00010000 || v === 0x74727565;
};

// --- A tiny big-endian reader over a Uint8Array -----------------------------
// All sfnt fields are big-endian; we wrap a DataView and keep a cursor so the
// table parsers read sequentially without manual offset bookkeeping.
class Reader {
  constructor(bytes, start = 0) {
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.p = start;
  }
  seek(p) { this.p = p; return this; }
  skip(n) { this.p += n; return this; }
  u8() { return this.dv.getUint8(this.p++); }
  i8() { const v = this.dv.getInt8(this.p); this.p += 1; return v; }
  u16() { const v = this.dv.getUint16(this.p); this.p += 2; return v; }
  i16() { const v = this.dv.getInt16(this.p); this.p += 2; return v; }
  u32() { const v = this.dv.getUint32(this.p); this.p += 4; return v; }
  // F2Dot14 fixed-point: a signed 16-bit value scaled by 1/16384.
  f2dot14() { return this.i16() / 16384; }
  tag() { let s = ''; for (let k = 0; k < 4; k++) s += String.fromCharCode(this.u8()); return s; }
}

// Locate every table in the sfnt directory. Returns Map<tag, {offset, length}>.
function readDirectory(bytes) {
  const r = new Reader(bytes, 0);
  const version = r.u32();
  // Accept TrueType outlines: 0x00010000, or the 'true'/'ttcf'... we only need
  // 'true' (0x74727565) and the standard version. 'OTTO' (CFF) is not handled.
  if (version !== 0x00010000 && version !== 0x74727565)
    throw new Error('truetype: unsupported sfnt version 0x' + version.toString(16));
  const numTables = r.u16();
  r.skip(6);                                    // searchRange, entrySelector, rangeShift
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const tag = r.tag();
    r.u32();                                    // checksum (ignored)
    const offset = r.u32();
    const length = r.u32();
    tables.set(tag, { offset, length });
  }
  return tables;
}

// --- name table: pull a human-readable font name ----------------------------
// We want the PostScript name (nameID 6); fall back to the full font name (4).
// Records can be in Macintosh (platform 1, single-byte) or Windows/Unicode
// (platform 0/3, UTF-16BE) encodings — decode accordingly.
function readName(bytes, t) {
  if (!t) return null;
  const r = new Reader(bytes, t.offset);
  r.u16();                                       // format
  const count = r.u16();
  const stringOffset = t.offset + r.u16();
  let best = null, bestRank = -1;
  for (let i = 0; i < count; i++) {
    const platformID = r.u16();
    r.u16();                                     // encodingID
    r.u16();                                     // languageID
    const nameID = r.u16();
    const length = r.u16();
    const offset = r.u16();
    // Prefer PostScript name (6) over full name (4); within that, no strong
    // platform preference, first match wins.
    const rank = nameID === 6 ? 2 : nameID === 4 ? 1 : -1;
    if (rank <= bestRank) continue;
    const start = stringOffset + offset;
    const sub = bytes.subarray(start, start + length);
    let str;
    if (platformID === 0 || platformID === 3) {  // UTF-16BE
      str = '';
      for (let k = 0; k + 1 < sub.length; k += 2) str += String.fromCharCode((sub[k] << 8) | sub[k + 1]);
    } else {                                     // single-byte (Mac Roman-ish)
      str = String.fromCharCode.apply(null, sub);
    }
    best = str; bestRank = rank;
    if (rank === 2) break;                        // can't do better than PostScript name
  }
  return best;
}

// --- cmap: build a charCode -> glyphId lookup -------------------------------
// Choose the best Unicode subtable, then dispatch on its format. We return a
// function so the descriptor stays small and lazy lookups are cheap.
function readCmap(bytes, t) {
  if (!t) return () => 0;
  const base = t.offset;
  const r = new Reader(bytes, base);
  r.u16();                                       // version
  const numTables = r.u16();
  // Score subtables: prefer Windows Unicode BMP (3,1) format 4 and full (3,10)
  // / (0,*) format 12; accept anything else as a fallback.
  let bestOff = -1, bestScore = -1;
  const records = [];
  for (let i = 0; i < numTables; i++) {
    const platformID = r.u16();
    const encodingID = r.u16();
    const offset = r.u32();                       // subtable offset is uint32 from cmap base
    records.push({ platformID, encodingID, offset });
  }
  for (const rec of records) {
    const fmt = new Reader(bytes, base + rec.offset).u16();
    let score = 0;
    if (rec.platformID === 3 && rec.encodingID === 10 && fmt === 12) score = 5;
    else if (rec.platformID === 0 && fmt === 12) score = 5;
    else if (rec.platformID === 3 && rec.encodingID === 1 && fmt === 4) score = 4;
    else if (rec.platformID === 0 && fmt === 4) score = 4;
    else if (fmt === 12) score = 3;
    else if (fmt === 4) score = 2;
    else if (fmt === 6) score = 1;
    else if (fmt === 0) score = 1;
    else continue;
    if (score > bestScore) { bestScore = score; bestOff = base + rec.offset; }
  }
  if (bestOff < 0) return () => 0;

  const sr = new Reader(bytes, bestOff);
  const format = sr.u16();
  if (format === 0) return cmapFormat0(sr);
  if (format === 4) return cmapFormat4(sr, bestOff);
  if (format === 6) return cmapFormat6(sr);
  if (format === 12) return cmapFormat12(sr);
  return () => 0;
}

// Format 0: a flat 256-byte byte-index table (cursor is just past the format).
function cmapFormat0(r) {
  r.u16(); r.u16();                              // length, language
  const map = new Uint8Array(256);
  for (let i = 0; i < 256; i++) map[i] = r.u8();
  return (c) => (c >= 0 && c < 256 ? map[c] : 0);
}

// Format 4: segment mapping to delta values — the classic BMP cmap.
function cmapFormat4(r, base) {
  r.u16();                                       // length
  r.u16();                                       // language
  const segCountX2 = r.u16();
  const segCount = segCountX2 >> 1;
  r.u16(); r.u16(); r.u16();                     // searchRange, entrySelector, rangeShift
  const endCode = new Array(segCount);
  for (let i = 0; i < segCount; i++) endCode[i] = r.u16();
  r.u16();                                       // reservedPad
  const startCode = new Array(segCount);
  for (let i = 0; i < segCount; i++) startCode[i] = r.u16();
  const idDelta = new Array(segCount);
  for (let i = 0; i < segCount; i++) idDelta[i] = r.i16();
  // idRangeOffset entries are byte offsets relative to their own slot; remember
  // where the idRangeOffset array begins so we can resolve glyphIdArray reads.
  const idRangeOffsetPos = r.p;
  const idRangeOffset = new Array(segCount);
  for (let i = 0; i < segCount; i++) idRangeOffset[i] = r.u16();
  const dv = r.dv;
  return (c) => {
    if (c < 0 || c > 0xffff) return 0;
    // Find the first segment whose endCode >= c.
    let seg = -1;
    for (let i = 0; i < segCount; i++) { if (endCode[i] >= c) { seg = i; break; } }
    if (seg < 0 || startCode[seg] > c) return 0;
    if (idRangeOffset[seg] === 0) return (c + idDelta[seg]) & 0xffff;
    // glyphId is read from glyphIdArray; the offset arithmetic is the spec's
    // pointer trick: address = idRangeOffsetPos + seg*2 + idRangeOffset[seg]
    //                          + (c - startCode[seg]) * 2
    const gidAddr = idRangeOffsetPos + seg * 2 + idRangeOffset[seg] + (c - startCode[seg]) * 2;
    const g = dv.getUint16(gidAddr);
    return g === 0 ? 0 : (g + idDelta[seg]) & 0xffff;
  };
}

// Format 6: a dense run of entryCount codes starting at firstCode.
function cmapFormat6(r) {
  r.u16(); r.u16();                              // length, language
  const firstCode = r.u16();
  const entryCount = r.u16();
  const arr = new Array(entryCount);
  for (let i = 0; i < entryCount; i++) arr[i] = r.u16();
  return (c) => { const i = c - firstCode; return i >= 0 && i < entryCount ? arr[i] : 0; };
}

// Format 12: groups of contiguous (startChar..endChar -> startGlyph) ranges.
function cmapFormat12(r) {
  r.u16();                                       // reserved
  r.u32();                                       // length
  r.u32();                                       // language
  const nGroups = r.u32();
  const groups = new Array(nGroups);
  for (let i = 0; i < nGroups; i++) groups[i] = { start: r.u32(), end: r.u32(), gid: r.u32() };
  return (c) => {
    for (const g of groups) if (c >= g.start && c <= g.end) return g.gid + (c - g.start);
    return 0;
  };
}

// --- glyf: decode one simple glyph's points ---------------------------------
// Returns { contours: [ [ {x, y, onCurve} ... ] ... ] } in absolute font units,
// or null for an empty glyph. Composite glyphs are handled separately.
function readSimpleGlyph(bytes, off, numberOfContours) {
  const r = new Reader(bytes, off);
  r.i16();                                       // numberOfContours (already known)
  r.i16(); r.i16(); r.i16(); r.i16();            // xMin, yMin, xMax, yMax (bbox, unused)
  const endPts = new Array(numberOfContours);
  for (let i = 0; i < numberOfContours; i++) endPts[i] = r.u16();
  const numPoints = numberOfContours ? endPts[numberOfContours - 1] + 1 : 0;
  const instrLen = r.u16();
  r.skip(instrLen);                              // skip hinting instructions

  // Flags, with run-length expansion: flag 0x08 (REPEAT) means the next byte is
  // a repeat count for the just-read flag.
  const ON_CURVE = 0x01, X_SHORT = 0x02, Y_SHORT = 0x04, REPEAT = 0x08;
  const X_SAME = 0x10, Y_SAME = 0x20;            // "same or positive" sign/skip bits
  const flags = new Array(numPoints);
  for (let i = 0; i < numPoints;) {
    const f = r.u8();
    flags[i++] = f;
    if (f & REPEAT) { let rep = r.u8(); while (rep-- > 0 && i < numPoints) flags[i++] = f; }
  }

  // X coordinates: delta-encoded. X_SHORT -> 1 byte, sign from X_SAME; otherwise
  // X_SAME means "same as previous" (delta 0), else a signed 16-bit delta.
  const xs = new Array(numPoints);
  let x = 0;
  for (let i = 0; i < numPoints; i++) {
    const f = flags[i];
    if (f & X_SHORT) { const d = r.u8(); x += (f & X_SAME) ? d : -d; }
    else if (!(f & X_SAME)) { x += r.i16(); }
    xs[i] = x;
  }
  const ys = new Array(numPoints);
  let y = 0;
  for (let i = 0; i < numPoints; i++) {
    const f = flags[i];
    if (f & Y_SHORT) { const d = r.u8(); y += (f & Y_SAME) ? d : -d; }
    else if (!(f & Y_SAME)) { y += r.i16(); }
    ys[i] = y;
  }

  // Split the flat point list into contours by endPtsOfContours.
  const contours = [];
  let s = 0;
  for (let ci = 0; ci < numberOfContours; ci++) {
    const e = endPts[ci];
    const pts = [];
    for (let i = s; i <= e; i++) pts.push({ x: xs[i], y: ys[i], onCurve: (flags[i] & ON_CURVE) !== 0 });
    contours.push(pts);
    s = e + 1;
  }
  return { contours };
}

// Emit one contour to the sink, inserting implied on-curve midpoints between
// consecutive off-curve points and upgrading each quadratic to a cubic.
//
// We walk the points as [start, middle...] and let the final segment wrap back
// to start: a straight wrap is left to close() (no redundant lineTo), while a
// curved wrap still emits its curveTo ending exactly on start.
function emitContour(pts, sink, tf) {
  if (pts.length === 0) return;
  const P = (p) => { const q = tf ? tf(p.x, p.y) : { x: p.x, y: p.y }; return { x: q.x, y: q.y, onCurve: p.onCurve }; };

  // Find a starting on-curve point; if none exists (all off-curve), synthesize
  // one at the midpoint of the first two points.
  let startIdx = -1;
  for (let i = 0; i < pts.length; i++) if (pts[i].onCurve) { startIdx = i; break; }

  // Build the walk list `seq`: index 0 is the start (always on-curve), followed
  // by the remaining contour points in order. The implicit wrap from the last
  // element back to seq[0] is the closing segment.
  let seq;
  if (startIdx >= 0) {
    seq = [];
    for (let k = 0; k < pts.length; k++) seq.push(P(pts[(startIdx + k) % pts.length]));
  } else {
    const a = P(pts[0]), b = P(pts[pts.length - 1]);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, onCurve: true };
    seq = [mid];
    for (let k = 0; k < pts.length; k++) seq.push(P(pts[k]));
  }
  const start = seq[0];

  sink.moveTo(start.x, start.y);
  let cur = start;
  for (let i = 1; i <= seq.length; i++) {
    // seq[i] with i === seq.length wraps to the start point.
    const p = i < seq.length ? seq[i] : start;
    if (p.onCurve) {
      // A straight segment back to the start is implied by close(); only emit a
      // lineTo for interior on-curve points.
      if (i < seq.length) { sink.lineTo(p.x, p.y); cur = p; }
      continue;
    }
    // p is an off-curve control point; its on-curve endpoint is the next
    // on-curve point, or the implied midpoint when the next point is also off.
    const next = i + 1 < seq.length ? seq[i + 1] : start;
    let end;
    if (next.onCurve) { end = next; i++; }
    else { end = { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2, onCurve: true }; }
    quadToCubic(sink, cur, p, end);
    cur = end;
  }
  sink.close();
}

// Quadratic (P0, control Q, P2) -> cubic (C1, C2, P2) for the sink.
function quadToCubic(sink, p0, q, p2) {
  const c1x = p0.x + (2 / 3) * (q.x - p0.x);
  const c1y = p0.y + (2 / 3) * (q.y - p0.y);
  const c2x = p2.x + (2 / 3) * (q.x - p2.x);
  const c2y = p2.y + (2 / 3) * (q.y - p2.y);
  sink.curveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
}

export function parseTrueType(input) {
  const bytes = coerceBytes(input);
  const tables = readDirectory(bytes);
  const need = (tag) => { const t = tables.get(tag); if (!t) throw new Error('truetype: missing required table ' + tag); return t; };

  // head: unitsPerEm + loca format.
  const head = need('head');
  const unitsPerEm = new Reader(bytes, head.offset + 18).u16();
  const indexToLocFormat = new Reader(bytes, head.offset + 50).i16();   // 0 short, 1 long

  // maxp: glyph count.
  const numGlyphs = new Reader(bytes, need('maxp').offset + 4).u16();

  // hhea + hmtx: advance widths.
  const numberOfHMetrics = new Reader(bytes, need('hhea').offset + 34).u16();
  const hmtx = tables.get('hmtx');
  const advances = new Array(numberOfHMetrics);
  if (hmtx) {
    const r = new Reader(bytes, hmtx.offset);
    for (let i = 0; i < numberOfHMetrics; i++) { advances[i] = r.u16(); r.i16(); /* lsb */ }
  }

  // loca: glyph offsets into glyf. Short loca stores half-offsets (×2).
  const loca = need('loca');
  const glyf = need('glyf');
  const locaOffsets = new Array(numGlyphs + 1);
  {
    const r = new Reader(bytes, loca.offset);
    if (indexToLocFormat === 0) for (let i = 0; i <= numGlyphs; i++) locaOffsets[i] = r.u16() * 2;
    else for (let i = 0; i <= numGlyphs; i++) locaOffsets[i] = r.u32();
  }

  const cmapLookup = readCmap(bytes, tables.get('cmap'));
  const fontName = readName(bytes, tables.get('name'));

  function advanceWidth(gid) {
    if (numberOfHMetrics === 0) return 0;
    if (gid >= numberOfHMetrics) gid = numberOfHMetrics - 1;   // monospaced tail
    if (gid < 0) gid = 0;
    return advances[gid] || 0;
  }

  // Emit a glyph's outline, applying an optional 2x2+offset transform (used by
  // composite components). depth guards against pathological recursion.
  function emitGlyph(gid, sink, tf, depth) {
    if (gid < 0 || gid >= numGlyphs || depth > 8) return;
    const start = locaOffsets[gid];
    const end = locaOffsets[gid + 1];
    if (end <= start) return;                     // empty glyph (e.g. space / .notdef)
    const gOff = glyf.offset + start;
    const numberOfContours = new Reader(bytes, gOff).i16();
    if (numberOfContours >= 0) {
      const { contours } = readSimpleGlyph(bytes, gOff, numberOfContours);
      for (const c of contours) emitContour(c, sink, tf);
      return;
    }
    // Composite glyph: walk components and recurse with each one's transform.
    const ARG_1_AND_2_ARE_WORDS = 0x0001, ARGS_ARE_XY_VALUES = 0x0002;
    const WE_HAVE_A_SCALE = 0x0008, MORE_COMPONENTS = 0x0020;
    const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040, WE_HAVE_A_TWO_BY_TWO = 0x0080;
    const r = new Reader(bytes, gOff + 10);       // skip numberOfContours + bbox
    let more = true;
    while (more) {
      const flags = r.u16();
      const glyphIndex = r.u16();
      let arg1, arg2;
      if (flags & ARG_1_AND_2_ARE_WORDS) {
        arg1 = (flags & ARGS_ARE_XY_VALUES) ? r.i16() : r.u16();
        arg2 = (flags & ARGS_ARE_XY_VALUES) ? r.i16() : r.u16();
      } else {
        arg1 = (flags & ARGS_ARE_XY_VALUES) ? r.i8() : r.u8();
        arg2 = (flags & ARGS_ARE_XY_VALUES) ? r.i8() : r.u8();
      }
      // 2x2 component transform; defaults to identity.
      let a = 1, b = 0, c = 0, d = 1;
      if (flags & WE_HAVE_A_SCALE) { a = d = r.f2dot14(); }
      else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) { a = r.f2dot14(); d = r.f2dot14(); }
      else if (flags & WE_HAVE_A_TWO_BY_TWO) { a = r.f2dot14(); b = r.f2dot14(); c = r.f2dot14(); d = r.f2dot14(); }
      // Offset: only the ARGS_ARE_XY_VALUES case is a dx,dy placement. (Point
      // matching is rare; we treat the non-xy case as a zero offset.)
      const dx = (flags & ARGS_ARE_XY_VALUES) ? arg1 : 0;
      const dy = (flags & ARGS_ARE_XY_VALUES) ? arg2 : 0;
      // Compose with the incoming transform tf so nested composites stack.
      const local = (x, y) => {
        const px = a * x + c * y + dx;
        const py = b * x + d * y + dy;
        return tf ? tf(px, py) : { x: px, y: py };
      };
      emitGlyph(glyphIndex, sink, local, depth + 1);
      more = (flags & MORE_COMPONENTS) !== 0;
    }
  }

  function glyphOutline(gid, sink) { emitGlyph(gid, sink, null, 0); }

  return {
    truetype: true,
    fontName,
    unitsPerEm,
    fontMatrix: [1 / unitsPerEm, 0, 0, 1 / unitsPerEm, 0, 0],
    numGlyphs,
    cmapLookup,
    advanceWidth,
    glyphOutline,
  };
}
