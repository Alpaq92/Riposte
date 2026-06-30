// engine/font/type1-crypt.js
// Type 1 font encryption (Adobe Type 1 Font Format, ch. 7). The same cipher is
// used for the `eexec` section (R = 55665, skip 4) and for individual
// charstrings (R = 4330, skip = lenIV, default 4).
const C1 = 52845, C2 = 22719;

export function decrypt(cipher, R, skip) {
  const out = new Uint8Array(cipher.length);
  let r = R & 0xffff;
  for (let i = 0; i < cipher.length; i++) {
    const c = cipher[i];
    out[i] = c ^ (r >> 8);
    r = (((c + r) * C1 + C2) & 0xffff) >>> 0;
  }
  return out.subarray(skip);
}

// Encrypt `plain` (which already includes `skip` lead bytes). Used to build test
// fixtures and, later, to round-trip font programs.
export function encrypt(plain, R) {
  const out = new Uint8Array(plain.length);
  let r = R & 0xffff;
  for (let i = 0; i < plain.length; i++) {
    const c = (plain[i] ^ (r >> 8)) & 0xff;
    out[i] = c;
    r = (((c + r) * C1 + C2) & 0xffff) >>> 0;
  }
  return out;
}
