// engine/object.js
// Riposte — PostScript object model.
//
// One uniform tagged representation for every PostScript value:
//   - simple values (integer/real/boolean) are stored INLINE (never boxed);
//   - composites (string/array) are (backing, offset, length) WINDOWS, so that
//     getinterval/substring ALIAS the same storage instead of copying — this is
//     required by PostScript semantics, not an optimization;
//   - names are interned to integer ids, so name equality is an id compare.
//
// Pure JS: no DOM, no browser globals. Runs in Node/Deno/Bun/browser/worker.

export const T = Object.freeze({
  INTEGER: 'integer', REAL: 'real', BOOLEAN: 'boolean', NAME: 'name',
  STRING: 'string', ARRAY: 'array', DICT: 'dict', OPERATOR: 'operator',
  MARK: 'mark', NULL: 'null', FILE: 'file', SAVE: 'save', FONTID: 'fontid',
});

// Access attributes (PostScript readonly/executeonly/noaccess). Default unlimited.
export const ACCESS = Object.freeze({ UNLIMITED: 0, READONLY: 1, EXECUTEONLY: 2, NONE: 3 });

// --- name interning ---------------------------------------------------------
const _nameIds = new Map();   // string -> id
const _nameStrings = [];      // id -> string

export function internName(str) {
  let id = _nameIds.get(str);
  if (id === undefined) { id = _nameStrings.length; _nameIds.set(str, id); _nameStrings.push(str); }
  return id;
}
export function nameString(id) { return _nameStrings[id]; }

// --- composite windows ------------------------------------------------------
// A PSString is a window over a Uint8Array (PostScript strings are byte strings).
export class PSString {
  constructor(backing, offset = 0, length = backing.length) {
    this.backing = backing; this.offset = offset; this.length = length;
  }
  static from(v) {
    if (v instanceof PSString) return v;
    if (typeof v === 'string') {
      const b = new Uint8Array(v.length);
      for (let i = 0; i < v.length; i++) b[i] = v.charCodeAt(i) & 0xff;
      return new PSString(b);
    }
    if (v instanceof Uint8Array) return new PSString(v);
    if (Array.isArray(v)) return new PSString(Uint8Array.from(v));
    throw new TypeError('PSString.from: unsupported value');
  }
  get(i) { return this.backing[this.offset + i]; }
  put(i, byte) { this.backing[this.offset + i] = byte & 0xff; }
  getInterval(o, l) { return new PSString(this.backing, this.offset + o, l); }   // ALIAS, no copy
  toJSString() {
    let s = '';
    for (let i = 0; i < this.length; i++) s += String.fromCharCode(this.backing[this.offset + i]);
    return s;
  }
}

// A PSArray is a window over a JS array of PSObjects.
export class PSArray {
  constructor(backing, offset = 0, length = backing.length) {
    this.backing = backing; this.offset = offset; this.length = length;
  }
  get(i) { return this.backing[this.offset + i]; }
  put(i, obj) { this.backing[this.offset + i] = obj; }
  getInterval(o, l) { return new PSArray(this.backing, this.offset + o, l); }    // ALIAS, no copy
  *[Symbol.iterator]() { for (let i = 0; i < this.length; i++) yield this.get(i); }
}

// A PSDict maps PostScript keys (names/numbers/strings/booleans, or any other
// object by identity) to PSObjects. Numbers compare by value (1 and 1.0 hit the
// same entry), as PostScript requires.
export class PSDict {
  constructor() { this.map = new Map(); }
  get size() { return this.map.size; }
  get(k) { const e = this.map.get(dictKey(k)); return e ? e.value : undefined; }
  put(k, v) { this.map.set(dictKey(k), { key: k, value: v }); }
  knows(k) { return this.map.has(dictKey(k)); }
  undef(k) { return this.map.delete(dictKey(k)); }
  keys() { return Array.from(this.map.values(), (e) => e.key); }
  *entries() { for (const e of this.map.values()) yield [e.key, e.value]; }
}
let _identityCounter = 0;
const _identityIds = new WeakMap();
function dictKey(o) {
  switch (o.type) {
    case T.INTEGER: case T.REAL: return 'd' + o.value;        // numeric equality
    case T.NAME: return 'n' + o.value;
    case T.BOOLEAN: return 'b' + (o.value ? 1 : 0);
    case T.STRING: return 's' + o.value.toJSString();
    default: {
      let id = _identityIds.get(o);
      if (id === undefined) { id = ++_identityCounter; _identityIds.set(o, id); }
      return 'o' + id;
    }
  }
}

// --- the tagged object ------------------------------------------------------
export class PSObject {
  constructor(type, value, executable = false, access = ACCESS.UNLIMITED) {
    this.type = type; this.value = value;
    this.executable = executable; this.access = access;
  }
  get isExecutable() { return this.executable; }
  get isLiteralName() { return this.type === T.NAME && !this.executable; }
  get isExecutableName() { return this.type === T.NAME && this.executable; }
  get isNumber() { return this.type === T.INTEGER || this.type === T.REAL; }
  asNumber() { return this.value; }   // int/real coercion helper

  toString() {
    switch (this.type) {
      case T.NAME: return (this.executable ? '' : '/') + nameString(this.value);
      case T.STRING: return '(' + this.value.toJSString() + ')';
      case T.ARRAY: {
        const inner = Array.from(this.value).map(String).join(' ');
        return this.executable ? `{${inner}}` : `[${inner}]`;
      }
      case T.OPERATOR: return '--' + this.value.name + '--';
      case T.FONTID: return '/' + (this.value && this.value.name ? this.value.name : 'Font');
      case T.MARK: return 'mark';
      case T.NULL: return 'null';
      default: return String(this.value);
    }
  }
}

const MARK_SYM = Symbol('mark');
export const MARK = new PSObject(T.MARK, MARK_SYM);
export const NULL = new PSObject(T.NULL, null);
export const TRUE = new PSObject(T.BOOLEAN, true);
export const FALSE = new PSObject(T.BOOLEAN, false);

// Factories. `executable` distinguishes literal `/name` from executable `name`,
// and literal `[..]` arrays from executable `{..}` procedures.
export const PS = Object.freeze({
  int: (n) => new PSObject(T.INTEGER, n, false),
  real: (x) => new PSObject(T.REAL, x, false),
  bool: (b) => (b ? TRUE : FALSE),
  name: (str, executable = false) => new PSObject(T.NAME, internName(str), executable),
  string: (v) => new PSObject(T.STRING, PSString.from(v), false),
  array: (items, executable = false) =>
    new PSObject(T.ARRAY, items instanceof PSArray ? items : new PSArray(items), executable),
  dict: (d) => new PSObject(T.DICT, d instanceof PSDict ? d : new PSDict(), false),
  op: (name, fn) => new PSObject(T.OPERATOR, { name, fn }, true),
});
