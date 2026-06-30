import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { identity, multiply, transformPoint, translate, scale, rotate, inverse } from '../engine/graphics/matrix.js';
import { toRGBA, cmyk, rgb, gray } from '../engine/graphics/paint.js';
import { arcSegments } from '../engine/graphics/path.js';
import { renderToSVG } from '../engine/graphics/render.js';

const here = dirname(fileURLToPath(import.meta.url));

test('matrix: transformPoint and concatenation', () => {
  assert.deepEqual(transformPoint(identity(), 3, 4), [3, 4]);
  assert.deepEqual(transformPoint(translate(identity(), 10, 20), 1, 2), [11, 22]);
  assert.deepEqual(transformPoint(scale(identity(), 2, 3), 4, 5), [8, 15]);
  // translate then scale: point first translated, then scaled by the OLD ctm
  const m = scale(translate(identity(), 5, 0), 2, 2);
  assert.deepEqual(transformPoint(m, 1, 1), [7, 2]);
});

test('matrix: rotate 90° and inverse', () => {
  const [x, y] = transformPoint(rotate(identity(), 90), 1, 0);
  assert.ok(Math.abs(x - 0) < 1e-9 && Math.abs(y - 1) < 1e-9);
  const inv = inverse(scale(identity(), 2, 4));
  assert.deepEqual(transformPoint(inv, 8, 8), [4, 2]);
});

test('paint: CMYK -> RGB, and gray', () => {
  assert.deepEqual(toRGBA(cmyk(0, 1, 1, 0)), { r: 1, g: 0, b: 0, a: 1 });   // red
  assert.deepEqual(toRGBA(cmyk(1, 0, 1, 0)), { r: 0, g: 1, b: 0, a: 1 });   // green
  assert.deepEqual(toRGBA(gray(0.5)), { r: 0.5, g: 0.5, b: 0.5, a: 1 });
  assert.deepEqual(toRGBA(rgb(0.2, 0.4, 0.6)), { r: 0.2, g: 0.4, b: 0.6, a: 1 });
});

test('arc: a quarter circle starts and ends where expected', () => {
  const { start, end } = arcSegments(0, 0, 10, 0, 90, false);
  assert.ok(Math.abs(start[0] - 10) < 1e-9 && Math.abs(start[1] - 0) < 1e-9);
  assert.ok(Math.abs(end[0] - 0) < 1e-9 && Math.abs(end[1] - 10) < 1e-9);
});

test('render: a filled triangle to SVG (device coords via Y-flip)', () => {
  const svg = renderToSVG('newpath 0 0 moveto 10 0 lineto 10 10 lineto closepath fill', { width: 20, height: 20 });
  assert.match(svg, /<path d="M0 20L10 20L10 10Z" fill="#000000"\/>/);
});

test('render: even-odd fill emits fill-rule="evenodd"', () => {
  const svg = renderToSVG('newpath 0 0 moveto 5 0 lineto 5 5 lineto closepath eofill', { width: 10, height: 10 });
  assert.match(svg, /fill-rule="evenodd"/);
});

test('render: setrgbcolor is honoured', () => {
  const svg = renderToSVG('1 0 0 setrgbcolor newpath 0 0 moveto 5 0 lineto 5 5 lineto closepath fill', { width: 10, height: 10 });
  assert.match(svg, /fill="#ff0000"/);
});

test('render: gsave/grestore restores colour', () => {
  const svg = renderToSVG(
    '0.5 setgray gsave 1 0 0 setrgbcolor grestore newpath 0 0 moveto 1 0 lineto 1 1 lineto closepath fill',
    { width: 4, height: 4 },
  );
  assert.match(svg, /fill="#808080"/);   // gray 0.5, not red
});

test('render: stroke width tracks the CTM scale', () => {
  // 2 setlinewidth under a 3x scale -> device width 6
  const svg = renderToSVG('3 3 scale 2 setlinewidth newpath 0 0 moveto 5 0 lineto stroke', { width: 30, height: 30 });
  assert.match(svg, /stroke-width="6"/);
});

test('render: the MIT smoke.ps fixture renders without error', () => {
  const src = readFileSync(join(here, 'fixtures', 'smoke.ps'), 'utf8');
  const svg = renderToSVG(src, { width: 612, height: 792 });
  const paths = (svg.match(/<path /g) || []).length;
  assert.ok(paths >= 8, `expected many paths, got ${paths}`);
  assert.match(svg, /fill-rule="evenodd"/);   // the pentagram
  assert.match(svg, /<text /);                 // page 2 text
});
