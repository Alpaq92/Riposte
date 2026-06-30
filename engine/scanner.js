// engine/scanner.js
// Riposte — PostScript scanner (lexer + object builder in a single pass).
//
// Source-agnostic over bytes; emits PSObjects directly (it IS the `token`
// operator). Procedures {...} are captured RECURSIVELY at scan time into
// executable arrays. By contrast `[ ] << >>` are emitted as executable-name
// tokens and the array/dict is built at RUN time by the mark operators.

import { PS, PSString } from './object.js';

export class PSSyntaxError extends Error {}

const EOF = Symbol('eof');
const CLOSE_BRACE = Symbol('}');

// character-class lookup tables (256 entries; index by byte)
const WS = new Uint8Array(256);
for (const c of [0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]) WS[c] = 1;       // null tab lf ff cr space
const DELIM = new Uint8Array(256);
for (const c of [0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]) DELIM[c] = 1; // ()<>[]{}/%

function toBytes(src) {
  if (src instanceof Uint8Array) return src;
  if (typeof src === 'string') {
    const b = new Uint8Array(src.length);
    for (let i = 0; i < src.length; i++) b[i] = src.charCodeAt(i) & 0xff;
    return b;
  }
  throw new TypeError('Scanner: source must be a string or Uint8Array');
}

export class Scanner {
  constructor(src) { this.b = toBytes(src); this.pos = 0; this.len = this.b.length; }
  code(i) { return i < this.len ? this.b[i] : -1; }

  /** Next object, or null at end of input. */
  next() {
    const r = this._scanOne();
    if (r === EOF) return null;
    if (r === CLOSE_BRACE) throw new PSSyntaxError("unmatched '}'");
    return r;
  }
  *[Symbol.iterator]() { for (let o; (o = this.next()) !== null;) yield o; }

  _skipWsAndComments() {
    const b = this.b;
    for (;;) {
      while (this.pos < this.len && WS[b[this.pos]]) this.pos++;
      if (this.pos < this.len && b[this.pos] === 0x25) {            // % comment to end of line
        this.pos++;
        while (this.pos < this.len && b[this.pos] !== 0x0a && b[this.pos] !== 0x0d) this.pos++;
        continue;
      }
      break;
    }
  }

  _scanOne() {
    this._skipWsAndComments();
    if (this.pos >= this.len) return EOF;
    const c = this.b[this.pos];
    switch (c) {
      case 0x7d: this.pos++; return CLOSE_BRACE;                    // }
      case 0x29: throw new PSSyntaxError("unmatched ')'");
      case 0x28: return this._readString();                         // (
      case 0x3c: return this._readAngleOpen();                      // <  -> <<, hex, or <~
      case 0x3e:                                                    // >
        if (this.code(this.pos + 1) === 0x3e) { this.pos += 2; return PS.name('>>', true); }
        throw new PSSyntaxError("unmatched '>'");
      case 0x5b: this.pos++; return PS.name('[', true);
      case 0x5d: this.pos++; return PS.name(']', true);
      case 0x7b: return this._readProcedure();                      // {
      case 0x2f: return this._readLiteralName();                    // /
      default: return this._readToken();                            // number or executable name
    }
  }

  _readAngleOpen() {
    const n = this.code(this.pos + 1);
    if (n === 0x3c) { this.pos += 2; return PS.name('<<', true); }  // <<
    if (n === 0x7e) throw new PSSyntaxError('ASCII85 strings (<~ ~>) not yet supported');
    return this._readHexString();
  }

  _readProcedure() {
    this.pos++; // consume {
    const items = [];
    for (;;) {
      const r = this._scanOne();
      if (r === EOF) throw new PSSyntaxError("unterminated procedure (missing '}')");
      if (r === CLOSE_BRACE) break;
      items.push(r);
    }
    return PS.array(items, true); // executable array == procedure
  }

  _readRegularRun() {
    const start = this.pos, b = this.b;
    while (this.pos < this.len && !WS[b[this.pos]] && !DELIM[b[this.pos]]) this.pos++;
    let s = '';
    for (let i = start; i < this.pos; i++) s += String.fromCharCode(b[i]);
    return s;
  }

  _readLiteralName() {
    this.pos++; // consume /
    let immediate = false;
    if (this.code(this.pos) === 0x2f) { this.pos++; immediate = true; }   // //name (immediate)
    const s = this._readRegularRun();
    const obj = PS.name(s, immediate);   // literal name: non-executable; immediate: executable
    if (immediate) obj.immediate = true;
    return obj;
  }

  _readToken() {
    const s = this._readRegularRun();
    const num = parseNumber(s);
    if (num) return num.type === 'integer' ? PS.int(num.value) : PS.real(num.value);
    return PS.name(s, true); // executable name (try-number-then-name fallback)
  }

  _readString() {
    this.pos++; // consume (
    const out = [];
    let depth = 1;
    const b = this.b;
    while (this.pos < this.len) {
      const c = b[this.pos++];
      if (c === 0x5c) {                          // backslash escape
        const e = b[this.pos++];
        switch (e) {
          case 0x6e: out.push(0x0a); break;      // \n
          case 0x72: out.push(0x0d); break;      // \r
          case 0x74: out.push(0x09); break;      // \t
          case 0x62: out.push(0x08); break;      // \b
          case 0x66: out.push(0x0c); break;      // \f
          case 0x5c: out.push(0x5c); break;      // \\
          case 0x28: out.push(0x28); break;      // \(
          case 0x29: out.push(0x29); break;      // \)
          case 0x0d: if (b[this.pos] === 0x0a) this.pos++; break; // line continuation (CR / CRLF)
          case 0x0a: break;                                       // line continuation (LF)
          default:
            if (e >= 0x30 && e <= 0x37) {         // \ddd octal (1-3 digits)
              let v = e - 0x30;
              for (let k = 0; k < 2 && b[this.pos] >= 0x30 && b[this.pos] <= 0x37; k++) {
                v = (v << 3) + (b[this.pos++] - 0x30);
              }
              out.push(v & 0xff);
            } else {
              out.push(e);                        // unknown escape: drop backslash, keep char
            }
        }
        continue;
      }
      if (c === 0x28) { depth++; out.push(c); continue; }          // nested (
      if (c === 0x29) { if (--depth === 0) break; out.push(c); continue; } // )
      out.push(c);
    }
    if (depth !== 0) throw new PSSyntaxError('unterminated string (missing ")")');
    return PS.string(new PSString(Uint8Array.from(out)));
  }

  _readHexString() {
    this.pos++; // consume <
    const out = [];
    let hi = -1;
    const b = this.b;
    while (this.pos < this.len) {
      const c = b[this.pos++];
      if (c === 0x3e) break;                      // >
      if (WS[c]) continue;
      const d = hexVal(c);
      if (d < 0) throw new PSSyntaxError('bad hex digit in <...> string');
      if (hi < 0) hi = d; else { out.push((hi << 4) | d); hi = -1; }
    }
    if (hi >= 0) out.push(hi << 4);               // odd trailing digit padded with 0
    return PS.string(new PSString(Uint8Array.from(out)));
  }
}

function hexVal(c) {
  if (c >= 0x30 && c <= 0x39) return c - 0x30;
  if (c >= 0x41 && c <= 0x46) return c - 0x41 + 10;
  if (c >= 0x61 && c <= 0x66) return c - 0x61 + 10;
  return -1;
}

const RE_RADIX = /^(\d{1,2})#([0-9A-Za-z]+)$/;
const RE_INT = /^[+-]?\d+$/;
const RE_REAL = /^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/;

/** Classify a token string as integer/real, or null if it is not a number. */
export function parseNumber(s) {
  if (s.length === 0) return null;
  const r = RE_RADIX.exec(s);
  if (r) {
    const base = +r[1];
    if (base >= 2 && base <= 36) {
      const v = parseInt(r[2], base);
      if (!Number.isNaN(v)) return { type: 'integer', value: v };
    }
    return null;
  }
  if (RE_INT.test(s)) return { type: 'integer', value: parseInt(s, 10) };
  if (RE_REAL.test(s) && /[.eE]/.test(s)) {
    const v = parseFloat(s);
    if (!Number.isNaN(v)) return { type: 'real', value: v };
  }
  return null;
}

/** Convenience: scan an entire source into an array of PSObjects. */
export function tokenize(src) {
  const out = [];
  for (const o of new Scanner(src)) out.push(o);
  return out;
}
