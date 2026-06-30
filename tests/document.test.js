import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseDSC } from '../engine/dsc.js';
import { loadDocument, pageBBox, pageSize, renderPageToSVG, extractText } from '../engine/document.js';
import { fontFromName, stringWidth } from '../engine/graphics/font.js';

const here = dirname(fileURLToPath(import.meta.url));
const smoke = readFileSync(join(here, 'fixtures', 'smoke.ps'), 'utf8');

test('DSC: parses title, bbox, pages and page markers', () => {
  const dsc = parseDSC(smoke);
  assert.equal(dsc.title, 'Riposte imaging-model smoke test');
  assert.equal(dsc.creator, 'Riposte project');
  assert.deepEqual(dsc.boundingBox, [0, 0, 612, 792]);
  assert.equal(dsc.pagesDeclared, 2);
  assert.deepEqual(dsc.fonts, ['Helvetica', 'Times-Roman']);
  assert.equal(dsc.pageMarkers.length, 2);
  assert.deepEqual(dsc.pageMarkers.map((p) => p.label), ['1', '2']);
});

test('document: two pages, bbox-derived size', () => {
  const doc = loadDocument(smoke);
  assert.equal(doc.pageCount, 2);
  assert.deepEqual(pageBBox(doc), [0, 0, 612, 792]);
  assert.deepEqual(pageSize(doc), { width: 612, height: 792 });
});

test('document: a source with no %%Page is a single page', () => {
  const doc = loadDocument('0 0 moveto 10 10 lineto stroke showpage');
  assert.equal(doc.pageCount, 1);
});

test('render: page 1 is vector (no text), page 2 has text', () => {
  const doc = loadDocument(smoke);
  const p1 = renderPageToSVG(doc, 0);
  const p2 = renderPageToSVG(doc, 1);
  assert.ok(p1.includes('<path'), 'page 1 has paths');
  assert.ok(!p1.includes('<text'), 'page 1 has no text');
  assert.match(p1, /fill-rule="evenodd"/);     // the pentagram lives on page 1
  assert.ok(p2.includes('<text'), 'page 2 has text');
});

test('extractText: reads the text drawn on page 2', () => {
  const doc = loadDocument(smoke);
  const text = extractText(doc, 1);
  assert.match(text, /Riposte PostScript smoke test/);
  assert.match(text, /transformed text/);
});

test('font: name -> family / style mapping', () => {
  assert.equal(fontFromName('Helvetica').family, 'sans-serif');
  assert.equal(fontFromName('Times-Roman').family, 'serif');
  assert.equal(fontFromName('Courier').mono, true);
  const hbo = fontFromName('Helvetica-BoldOblique');
  assert.equal(hbo.bold, true);
  assert.equal(hbo.italic, true);
});

test('font: monospace stringWidth is exact (0.6 em per char)', () => {
  const f = fontFromName('Courier');
  assert.equal(stringWidth(f, 'abcd', 10), 24);  // 4 * 0.6 * 10
});
