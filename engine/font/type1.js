// engine/font/type1.js
// Parse a Type 1 font program (PFA / PFB / raw font bytes) into a descriptor the
// renderer can use: { fontMatrix, encoding, charstrings: Map<name, bytes>,
// subrs: [bytes], fontName }. We decrypt the eexec section and scan its Private
// dict for /Subrs and /CharStrings (the RD-binary entries), decrypting each
// charstring with the charstring cipher.
import { decrypt } from './type1-crypt.js';
import { latin1, concatBytes, coerceBytes } from './bytes.js';

const isWS = (c) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c;

// --- StandardEncoding (ASCII range; enough for most Latin text) --------------
const STD = [];
{
  const punct = { 32: 'space', 33: 'exclam', 34: 'quotedbl', 35: 'numbersign', 36: 'dollar', 37: 'percent', 38: 'ampersand', 39: 'quoteright', 40: 'parenleft', 41: 'parenright', 42: 'asterisk', 43: 'plus', 44: 'comma', 45: 'hyphen', 46: 'period', 47: 'slash', 58: 'colon', 59: 'semicolon', 60: 'less', 61: 'equal', 62: 'greater', 63: 'question', 64: 'at', 91: 'bracketleft', 92: 'backslash', 93: 'bracketright', 94: 'asciicircum', 95: 'underscore', 96: 'quoteleft', 123: 'braceleft', 124: 'bar', 125: 'braceright', 126: 'asciitilde' };
  const digits = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  for (const k in punct) STD[+k] = punct[k];
  for (let c = 48; c <= 57; c++) STD[c] = digits[c - 48];
  for (let c = 65; c <= 90; c++) STD[c] = String.fromCharCode(c);
  for (let c = 97; c <= 122; c++) STD[c] = String.fromCharCode(c);
}

function stripPFB(b) {
  if (b[0] !== 0x80) return b;                       // not a PFB container
  const segs = [];
  let p = 0;
  while (p < b.length && b[p] === 0x80) {
    const type = b[p + 1];
    if (type === 3) break;                           // EOF segment
    const len = b[p + 2] | (b[p + 3] << 8) | (b[p + 4] << 16) | (b[p + 5] << 24);
    p += 6;
    segs.push(b.subarray(p, p + len));
    p += len;
  }
  return concatBytes(segs);
}

const hexVal = (c) => (c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1);
function looksHex(b) { let n = 0, i = 0; while (i < b.length && n < 4) { const c = b[i++]; if (isWS(c)) continue; if (hexVal(c) < 0) return false; n++; } return n > 0; }
function hexDecode(b) { const out = []; let hi = -1; for (let i = 0; i < b.length; i++) { const d = hexVal(b[i]); if (d < 0) continue; if (hi < 0) hi = d; else { out.push((hi << 4) | d); hi = -1; } } return Uint8Array.from(out); }

function parseMatrix(s) {
  const m = /\/FontMatrix\s*\[([^\]]+)\]/.exec(s);
  if (!m) return null;
  const n = m[1].trim().split(/\s+/).map(Number);
  return n.length === 6 && n.every((x) => !Number.isNaN(x)) ? n : null;
}
function parseEncoding(s) {
  const enc = [];
  if (/\/Encoding\s+StandardEncoding\s+def/.test(s)) { for (let i = 0; i < 256; i++) if (STD[i]) enc[i] = STD[i]; return enc; }
  const re = /dup\s+(\d+)\s*\/([^\s/{}()<>[\]]+)\s+put/g;
  let m;
  while ((m = re.exec(s))) enc[+m[1]] = m[2];
  return enc;
}

// Scan binary RD entries (Subrs or CharStrings), jumping past each glyph's binary
// so we never scan into it.
function parseBinEntries(dec, ds, re, start, end, lenIV, isSubr) {
  re.lastIndex = start;
  const result = isSubr ? [] : new Map();
  let m;
  while ((m = re.exec(ds)) && m.index < end) {
    const len = +m[2];
    const binStart = m.index + m[0].length;
    const cs = decrypt(dec.subarray(binStart, binStart + len), 4330, lenIV);
    if (isSubr) result[+m[1]] = cs; else result.set(m[1], cs);
    re.lastIndex = binStart + len;
  }
  return result;
}

export function parseType1(input) {
  let b = coerceBytes(input);
  b = stripPFB(b);
  const eexecIdx = latin1(b).indexOf('eexec');
  if (eexecIdx < 0) return parseType1Parts(b, null);
  let p = eexecIdx + 5;
  while (p < b.length && isWS(b[p])) p++;
  return parseType1Parts(b.subarray(0, eexecIdx), b.subarray(p));
}

// Parse from an explicit (cleartext header, encrypted eexec block) split. The
// in-document `eexec` operator calls this with the boundaries it already knows,
// so we never re-scan the program text for "eexec" — which can occur in a comment
// or string and fool a substring search.
export function parseType1Parts(clearBytes, encBytes) {
  const clearPart = latin1(clearBytes);
  const fontMatrix = parseMatrix(clearPart) || [0.001, 0, 0, 0.001, 0, 0];
  const fontName = (/\/FontName\s*\/([^\s]+)\s+def/.exec(clearPart) || [])[1] || null;
  const encoding = parseEncoding(clearPart);

  let charstrings = new Map(), subrs = [];
  if (encBytes && encBytes.length) {
    let bin = encBytes;
    if (looksHex(bin)) bin = hexDecode(bin);
    const dec = decrypt(bin, 55665, 4);
    const ds = latin1(dec);
    const lenIV = +(/\/lenIV\s+(\d+)/.exec(ds) || [, 4])[1];
    const csIdx = ds.indexOf('/CharStrings');
    const subrIdx = ds.indexOf('/Subrs');
    if (subrIdx >= 0) subrs = parseBinEntries(dec, ds, /dup\s+(\d+)\s+(\d+)\s+(?:RD|-\|) /g, subrIdx, csIdx >= 0 ? csIdx : ds.length, lenIV, true);
    if (csIdx >= 0) charstrings = parseBinEntries(dec, ds, /\/([^\s/{}()<>[\]]+)\s+(\d+)\s+(?:RD|-\|) /g, csIdx, ds.length, lenIV, false);
  }
  return { type1: true, fontName, fontMatrix, encoding, charstrings, subrs };
}
