// engine/graphics/matrix.js
// 6-element affine matrices [a b c d e f] in PostScript order, using the
// row-vector convention: a point maps as
//   x' = a*x + c*y + e,   y' = b*x + d*y + f
// Concatenation `m1 then m2` is the matrix product m1 × m2 (see multiply).

export const identity = () => [1, 0, 0, 1, 0, 0];

export function multiply(m1, m2) {            // apply m1, then m2
  const [a, b, c, d, e, f] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a * a2 + b * c2,
    a * b2 + b * d2,
    c * a2 + d * c2,
    c * b2 + d * d2,
    e * a2 + f * c2 + e2,
    e * b2 + f * d2 + f2,
  ];
}

export function transformPoint(m, x, y) {     // full affine (with translation)
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function dtransform(m, dx, dy) {        // linear part only (no translation)
  return [m[0] * dx + m[2] * dy, m[1] * dx + m[3] * dy];
}

export function determinant(m) { return m[0] * m[3] - m[1] * m[2]; }

export function inverse(m) {
  const det = determinant(m);
  if (det === 0) return null;
  const [a, b, c, d, e, f] = m;
  const id = 1 / det;
  return [
    d * id,
    -b * id,
    -c * id,
    a * id,
    (c * f - d * e) * id,
    (b * e - a * f) * id,
  ];
}

// Concatenate a primitive transform onto a CTM (CTM' such that a point is first
// transformed by the primitive, then by the old CTM).
export const translate = (ctm, tx, ty) => multiply([1, 0, 0, 1, tx, ty], ctm);
export const scale = (ctm, sx, sy) => multiply([sx, 0, 0, sy, 0, 0], ctm);
export function rotate(ctm, deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return multiply([c, s, -s, c, 0, 0], ctm);
}

// Average scale factor of a matrix (sqrt|det|) — used to map a user-space line
// width / dash length to device space.
export const scaleFactor = (m) => Math.sqrt(Math.abs(determinant(m)));
