// Riposte playground — runs and RENDERS PostScript in the browser.
// UI rebuilt on the embed-pdf-viewer design; the engine is unchanged.
import { T } from '../engine/object.js';
import { loadDocument, pageSize, renderPageToSVG } from '../engine/document.js';
import { parseType1 } from '../engine/font/type1.js';
import { parseTrueType, isSfnt } from '../engine/font/truetype.js';
import { renderToContext, stackItems } from './render-core.js';
import { SAMPLES } from './samples.js';
import { setIcon } from './icons.js';
import { initTheme, cycleTheme, themeIcon } from './theme.js';

const $ = (sel) => document.querySelector(sel);
const editor = $('#source');
const printSource = $('#printSource');
const output = $('#output');
const stackEl = $('#stack');
const stackCount = $('#stackCount');
const statusEl = $('#status');
const canvas = $('#canvas');
const viewport = $('#viewport');
const thumbsEl = $('#thumbs');
const pageInput = $('#pageInput');
const pageTotal = $('#pageTotal');
const zoomLabel = $('#zoomLabel');
const docinfo = $('#docinfo');
const docstats = $('#docstats');
const statSep = $('#statSep');

let doc = null;
let pageIndex = 0;
let zoom = 1;
let matches = [], matchPos = -1;
let themePref = initTheme();

// --- embedded Type 1 demo font (glyph "A" = a triangle) ----------------------
const DEMO_FONT = {
  type1: true, fontName: 'DemoTriangle', fontMatrix: [0.001, 0, 0, 0.001, 0, 0],
  encoding: (() => { const e = []; e[65] = 'A'; return e; })(),
  charstrings: new Map([['A', Uint8Array.of(139, 249, 130, 13, 239, 139, 21, 247, 192, 139, 5, 251, 42, 248, 236, 5, 9, 14)]]),
  subrs: [],
};
let loadedFont = null;
function registerFonts(vm) {
  vm.registerFont('DemoTriangle', DEMO_FONT);
  if (loadedFont) vm.registerFont(loadedFont.name, loadedFont.descriptor);
}

const TYPE_ABBR = {
  [T.INTEGER]: 'int', [T.REAL]: 'real', [T.BOOLEAN]: 'bool', [T.NAME]: 'name',
  [T.STRING]: 'str', [T.ARRAY]: 'array', [T.DICT]: 'dict', [T.OPERATOR]: 'op',
  [T.MARK]: 'mark', [T.NULL]: 'null', [T.FONTID]: 'font',
};
const setStatus = (text, kind) => { statusEl.textContent = text; statusEl.className = 'status' + (kind ? ' ' + kind : ''); };
const enc = new TextEncoder();

// Render the operand stack from a serialisable item list ({type, repr}) — the
// same shape the worker posts back; `stackItems` lives in the shared render core.
function renderStackItems(items) {
  stackEl.innerHTML = '';
  const n = items.length;
  stackCount.textContent = n ? `(${n} item${n === 1 ? '' : 's'})` : '(empty)';
  if (n === 0) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = '— empty —'; stackEl.appendChild(li); return; }
  for (let i = n - 1; i >= 0; i--) {
    const it = items[i];
    const li = document.createElement('li');
    const t = document.createElement('span');
    t.className = 't'; t.textContent = TYPE_ABBR[it.type] || it.type;
    li.appendChild(t); li.appendChild(document.createTextNode(it.repr));
    stackEl.appendChild(li);
  }
}

function fitScale(pw, ph) {
  const w = viewport.clientWidth - 56, h = viewport.clientHeight - 56;
  if (w <= 0 || h <= 0) return 0.5;
  return Math.max(0.05, Math.min(w / pw, h / ph));
}

// Run one page's PostScript onto an already-sized canvas at `scale` via the
// shared render core. `capture` collects == / print output.
function runPageToCanvas(targetCanvas, pageIdx, scale, capture) {
  const page = doc.pages[pageIdx];
  return renderToContext(targetCanvas.getContext('2d'), {
    src: page.prolog + '\n' + page.content,
    width: targetCanvas.width, height: targetCanvas.height, scale,
    registerFonts, capture,
  });
}

let lastScale = 1;
function renderPage() {
  if (!doc) return;
  pageIndex = Math.max(0, Math.min(pageIndex, doc.pageCount - 1));
  const { width: pw, height: ph } = pageSize(doc);
  const scale = fitScale(pw, ph) * zoom;
  lastScale = scale;
  canvas.width = Math.max(1, Math.round(pw * scale));
  canvas.height = Math.max(1, Math.round(ph * scale));
  const page = doc.pages[pageIndex];
  if (workerOK) renderViaWorker(page.prolog + '\n' + page.content, scale);
  else paintMainThread(scale);
}

// Percentage of the page that carries marks (non-transparent pixels) — a quick
// sense of how much was drawn. Reads the buffer the caller already grabbed, so
// the canvas isn't read back twice per render.
function inkCoverage(data) {
  let ink = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 8) ink++;
  return Math.round(100 * ink / (data.length / 4));
}

// Apply a finished render (from the worker or main thread): text output, operand
// stack, status, the statusbar stats, and the diff overlay. One canvas read-back
// feeds both the ink stat and the diff.
function applyRenderResult(r) {
  output.textContent = r.output || '(no text output — use == or print to emit)';
  renderStackItems(r.stack);
  setStatus(r.error ? 'error: ' + r.error : 'ok', r.error ? 'error' : 'ok');
  updateChrome();
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const bytes = enc.encode(editor.value).length;
  const size = bytes >= 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes + ' B';
  docstats.textContent = `${size} · ${r.ops} op${r.ops === 1 ? '' : 's'} · ${r.ms} ms · ${inkCoverage(pixels.data)}% ink`;
  docstats.title = r.viaWorker ? 'rendered off the main thread in a Web Worker' : 'rendered on the main thread';
  statSep.hidden = false;
  paintDiffIfOn(pixels);
}

function paintMainThread(scale) {
  applyRenderResult({ ...runPageToCanvas(canvas, pageIndex, scale, true), viaWorker: false });
}

// --- render worker: interpret + raster off the main thread, draw back the
// resulting ImageBitmap. Falls back to main-thread rendering on any failure. ---
let worker = null, workerOK = false, jobId = 0, pendingJob = 0, workerTimer = null;
const fontPayload = () => (loadedFont ? { name: loadedFont.name, kind: loadedFont.kind, bytes: loadedFont.bytes } : null);

function renderViaWorker(src, scale) {
  const id = ++jobId; pendingJob = id;
  clearTimeout(workerTimer);
  workerTimer = setTimeout(() => { if (pendingJob === id) { workerOK = false; paintMainThread(scale); } }, 3000);
  worker.postMessage({ id, src, w: canvas.width, h: canvas.height, scale, demoFont: { name: 'DemoTriangle', descriptor: DEMO_FONT }, font: fontPayload() });
}

function onWorkerMessage(e) {
  const m = e.data;
  if (m.id !== pendingJob) { if (m.bitmap && m.bitmap.close) m.bitmap.close(); return; }   // a stale job
  clearTimeout(workerTimer);
  if (m.fatal) { workerOK = false; paintMainThread(lastScale); return; }                     // worker died -> fall back
  if (m.bitmap) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(m.bitmap, 0, 0);
    if (m.bitmap.close) m.bitmap.close();
  }
  applyRenderResult({ output: m.output, error: m.error, stack: m.stack, ms: m.ms, ops: m.ops, viaWorker: true });
}

function initWorker() {
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
    if (typeof new OffscreenCanvas(1, 1).transferToImageBitmap !== 'function') return;
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = onWorkerMessage;
    worker.onerror = () => { workerOK = false; paintMainThread(lastScale); };
    workerOK = true;
  } catch { worker = null; workerOK = false; }
}

// --- diff view: compare the live render against a captured reference frame ----
let diffRef = null, diffOn = false;
function setDiffRef() {
  const ctx = canvas.getContext('2d');
  diffRef = { w: canvas.width, h: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data.slice(0) };
  setStatus(`diff reference captured (${canvas.width}×${canvas.height})`, 'ok');
}
function paintDiffIfOn(pixels) {
  if (!diffOn || !diffRef) return;
  const ctx = canvas.getContext('2d');
  if (canvas.width !== diffRef.w || canvas.height !== diffRef.h) {
    setStatus(`diff: reference is ${diffRef.w}×${diffRef.h} — press “Set ref” at this zoom`, 'error');
    return;
  }
  const a = pixels.data, b = diffRef.data, out = ctx.createImageData(canvas.width, canvas.height), o = out.data;
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]);
    if (d > 24) { o[i] = 224; o[i + 1] = 36; o[i + 2] = 140; o[i + 3] = 255; changed++; }   // changed -> magenta
    else { o[i] = o[i + 1] = o[i + 2] = 230; o[i + 3] = 255; }                               // unchanged -> grey
  }
  ctx.putImageData(out, 0, 0);
  const px = a.length / 4;
  setStatus(`diff vs reference: ${changed} px changed (${(100 * changed / px).toFixed(2)}%)`, 'ok');
}

function updateChrome() {
  pageInput.value = String(pageIndex + 1);
  pageTotal.textContent = '/ ' + doc.pageCount;
  $('#prevPage').disabled = pageIndex <= 0;
  $('#nextPage').disabled = pageIndex >= doc.pageCount - 1;
  zoomLabel.textContent = Math.round(zoom * 100) + '%';
  thumbsEl.querySelectorAll('.thumb').forEach((t, i) => t.classList.toggle('is-current', i === pageIndex));
  document.querySelectorAll('#outline .ol-page').forEach((p, i) => p.classList.toggle('is-current', i === pageIndex));

  const d = doc.dsc, bits = [];
  if (d.title) bits.push(d.title);
  bits.push(`${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'}`);
  const { width: pgw, height: pgh } = pageSize(doc);
  bits.push(`${pgw}×${pgh} pt`);
  if (d.fonts.length) bits.push('fonts: ' + d.fonts.join(', '));
  if (loadedFont) bits.push('loaded: ' + loadedFont.name);
  docinfo.textContent = bits.join('  ·  ');
}

function buildThumbs() {
  thumbsEl.innerHTML = '';
  if (!doc) return;
  const { width: pw, height: ph } = pageSize(doc);
  const tscale = 120 / pw;
  for (let i = 0; i < doc.pageCount; i++) {
    const tc = document.createElement('canvas');
    tc.className = 'thumb';
    tc.width = Math.max(1, Math.round(pw * tscale));
    tc.height = Math.max(1, Math.round(ph * tscale));
    tc.title = 'Page ' + (i + 1);
    runPageToCanvas(tc, i, tscale, false);
    tc.addEventListener('click', () => { pageIndex = i; renderPage(); });
    thumbsEl.appendChild(tc);
  }
}

// Outline panel: DSC document properties + a clickable page list.
function buildOutline() {
  const el = $('#outline');
  el.innerHTML = '';
  if (!doc) return;
  const d = doc.dsc;
  const section = (label) => { const h = document.createElement('div'); h.className = 'ol-section'; h.textContent = label; el.appendChild(h); };
  const row = (k, v) => {
    if (v == null || v === '') return;
    const r = document.createElement('div'); r.className = 'ol-row';
    const ke = document.createElement('span'); ke.className = 'k'; ke.textContent = k;
    const ve = document.createElement('span'); ve.className = 'v'; ve.textContent = v;
    r.append(ke, ve); el.appendChild(r);
  };
  section('Document');
  row('Title', d.title);
  row('Creator', d.creator);
  row('Created', d.creationDate);
  if (d.boundingBox) row('BoundingBox', d.boundingBox.join(' '));
  if (d.languageLevel) row('Level', d.languageLevel);
  row('Pages', String(doc.pageCount));
  if (d.fonts.length) row('Fonts', d.fonts.join(', '));
  if (loadedFont) row('Loaded font', loadedFont.name);

  section('Pages');
  for (let i = 0; i < doc.pageCount; i++) {
    const p = document.createElement('div');
    p.className = 'ol-page'; p.dataset.page = String(i);
    const lbl = doc.pages[i].label;
    p.textContent = 'Page ' + (i + 1) + (lbl && lbl !== String(i + 1) ? `  (${lbl})` : '');
    p.addEventListener('click', () => { pageIndex = i; renderPage(); });
    el.appendChild(p);
  }
}

function switchTab(name) {
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
  document.querySelectorAll('.sidebar .tab-pane').forEach((p) => { p.hidden = p.dataset.pane !== name; });
}

function run() {
  try { doc = loadDocument(editor.value); }
  catch (e) { setStatus('parse error: ' + (e.message || e), 'error'); return; }
  pageIndex = 0;
  buildThumbs();
  buildOutline();
  renderPage();
}

// --- file / font loading -----------------------------------------------------
function openFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => { editor.value = String(r.result); run(); };
  r.readAsText(file);
}
function openFontFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = new Uint8Array(r.result);
      const tt = isSfnt(data);
      const parsed = tt ? parseTrueType(data) : parseType1(data);
      const name = parsed.fontName || 'EmbeddedFont';
      const glyphs = tt ? parsed.numGlyphs : parsed.charstrings.size;
      loadedFont = { name, descriptor: parsed, kind: tt ? 'truetype' : 'type1', bytes: data };
      setStatus(`loaded ${tt ? 'TrueType' : 'Type 1'} font ${name} (${glyphs} glyphs) — /${name} findfont`, 'ok');
      run();
    } catch (e) { setStatus('font parse error: ' + (e.message || e), 'error'); }
  };
  r.readAsArrayBuffer(file);
}

// --- SVG export + find-in-source --------------------------------------------
function exportSVG() {
  if (!doc) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([renderPageToSVG(doc, pageIndex)], { type: 'image/svg+xml' }));
  a.download = `riposte-page${pageIndex + 1}.svg`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}
function runFind() {
  const term = $('#find').value;
  matches = []; matchPos = -1;
  if (term) { const src = editor.value.toLowerCase(), t = term.toLowerCase(); for (let i = src.indexOf(t); i >= 0; i = src.indexOf(t, i + Math.max(1, t.length))) matches.push(i); }
  $('#findCount').textContent = term ? `0/${matches.length}` : '';
  if (matches.length) stepFind(1);
}
function stepFind(dir) {
  if (!matches.length) return;
  matchPos = (matchPos + dir + matches.length) % matches.length;
  const start = matches[matchPos];
  editor.focus();
  editor.setSelectionRange(start, start + $('#find').value.length);
  $('#findCount').textContent = `${matchPos + 1}/${matches.length}`;
}

function buildSamples() {
  const box = $('#samples');
  for (const s of SAMPLES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = s.name;
    b.addEventListener('click', () => { editor.value = s.code; zoom = 1; run(); });
    box.appendChild(b);
  }
}

// Hide / show the bottom dock (PostScript editor + output console).
function setDock(hidden) {
  document.querySelector('.root').classList.toggle('no-dock', hidden);
  const btn = $('#toggleDock');
  setIcon(btn.querySelector('.btn-ico'), hidden ? 'caret-up' : 'caret-down');
  btn.title = hidden ? 'Show the PostScript console' : 'Hide the PostScript console';
  btn.setAttribute('aria-pressed', String(hidden));
  localStorage.setItem('riposte-dock', hidden ? 'hidden' : 'shown');
  renderPage();   // viewport grew/shrank -> refit (no-ops if no doc yet)
}

// --- icons + wiring ----------------------------------------------------------
const ICONS = {
  open: 'folder-simple', font: 'text-aa', toggleThumbs: 'sidebar-simple',
  prevPage: 'caret-left', nextPage: 'caret-right',
  zoomOut: 'magnifying-glass-minus', zoomIn: 'magnifying-glass-plus', zoomFit: 'corners-out',
  findBtn: 'magnifying-glass', svg: 'download-simple', print: 'printer',
  diffRef: 'checks', diffToggle: 'square-split-horizontal',
  findPrev: 'caret-up', findNext: 'caret-down', clear: 'x',
};
for (const [id, name] of Object.entries(ICONS)) setIcon($('#' + id), name);
setIcon($('#run .btn-ico'), 'play');
function updateThemeButton() { setIcon($('#theme'), themeIcon(themePref)); $('#theme').title = `Theme: ${themePref}`; }
updateThemeButton();

const setZoom = (z) => { zoom = Math.max(0.1, Math.min(8, z)); renderPage(); };
$('#run').addEventListener('click', run);
$('#clear').addEventListener('click', () => { editor.value = ''; output.textContent = ''; stackEl.innerHTML = ''; docstats.textContent = ''; statSep.hidden = true; setStatus(''); editor.focus(); });
$('#open').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', (e) => openFile(e.target.files[0]));
$('#font').addEventListener('click', () => $('#fontfile').click());
$('#fontfile').addEventListener('change', (e) => openFontFile(e.target.files[0]));
$('#svg').addEventListener('click', exportSVG);
$('#print').addEventListener('click', () => { printSource.textContent = editor.value; window.print(); });
$('#theme').addEventListener('click', () => { themePref = cycleTheme(); updateThemeButton(); });
$('#diffRef').addEventListener('click', setDiffRef);
$('#diffToggle').addEventListener('click', (e) => {
  diffOn = !diffOn;
  e.currentTarget.setAttribute('aria-pressed', String(diffOn));
  if (diffOn && !diffRef) setDiffRef();
  renderPage();
});

$('#prevPage').addEventListener('click', () => { pageIndex--; renderPage(); });
$('#nextPage').addEventListener('click', () => { pageIndex++; renderPage(); });
pageInput.addEventListener('change', () => { const n = parseInt(pageInput.value, 10); if (!Number.isNaN(n)) { pageIndex = n - 1; renderPage(); } });
$('#zoomIn').addEventListener('click', () => setZoom(zoom * 1.25));
$('#zoomOut').addEventListener('click', () => setZoom(zoom / 1.25));
$('#zoomFit').addEventListener('click', () => setZoom(1));

$('#toggleThumbs').addEventListener('click', (e) => {
  const hidden = document.querySelector('.root').classList.toggle('no-thumbs');
  e.currentTarget.setAttribute('aria-pressed', String(!hidden));
});
$('#toggleDock').addEventListener('click', () => setDock(!document.querySelector('.root').classList.contains('no-dock')));
$('#tabPages').addEventListener('click', () => switchTab('pages'));
$('#tabOutline').addEventListener('click', () => switchTab('outline'));
$('#findBtn').addEventListener('click', () => {
  if (document.querySelector('.root').classList.contains('no-dock')) setDock(false);   // reveal the dock so the find box is visible
  $('#find').focus();
});
$('#find').addEventListener('input', runFind);
$('#find').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); } });
$('#findNext').addEventListener('click', () => stepFind(1));
$('#findPrev').addEventListener('click', () => stepFind(-1));
editor.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } });

let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderPage, 120); });

setDock(localStorage.getItem('riposte-dock') === 'hidden');   // restore console state
buildSamples();
initWorker();   // offload page rendering to a Web Worker when supported
run();   // render the default program on load
