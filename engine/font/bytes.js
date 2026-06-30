// engine/font/bytes.js — byte helpers shared by the font parsers and the demo:
// latin1 string <-> Uint8Array, Uint8Array concatenation, and input coercion.
export const toBytes = (str) => {
  const b = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 0xff;
  return b;
};

export const latin1 = (b) => {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  return s;
};

export function concatBytes(parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Normalise string / ArrayBuffer / Uint8Array to a Uint8Array.
export const coerceBytes = (input) =>
  (typeof input === 'string' ? toBytes(input) : input instanceof Uint8Array ? input : new Uint8Array(input));
