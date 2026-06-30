import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const smoke = readFileSync(join(here, 'fixtures', 'smoke.ps'), 'utf8');

// --- a tiny pure-JS DOM shim so the renderer can run under node:test ---------
function stubCtx() {
  return new Proxy({}, {
    get: (t, p) => (p in t ? t[p] : () => {}),   // any method -> no-op
    set: (t, p, v) => { t[p] = v; return true; },
  });
}
function makeEl(tag) {
  return {
    tagName: tag, className: '', dataset: {}, style: {}, children: [],
    appendChild(c) { this.children.push(c); return c; },
    set innerHTML(v) { if (v === '') this.children = []; },
    get innerHTML() { return ''; },
    getContext() { return stubCtx(); },
    scrollIntoView() { this._scrolled = true; },
    querySelectorAll(sel) {
      return sel === '.doc-page' ? this.children.filter((c) => c.className === 'doc-page') : [];
    },
    querySelector(sel) {
      const m = /\[data-page="(\d+)"\]/.exec(sel);
      return m ? this.children.find((c) => c.dataset.page === m[1]) || null : null;
    },
  };
}
function installFakeDom() { globalThis.document = { createElement: (t) => makeEl(t) }; }

test('embed: load builds .doc-page[data-page] structure', async () => {
  installFakeDom();
  const { default: PostScriptRenderer } = await import('../embed/postscript-renderer.js');
  const r = new PostScriptRenderer();
  const container = document.createElement('div');
  await r.load(smoke, container);

  assert.equal(container.children.length, 2);
  assert.equal(container.children[0].className, 'doc-page');
  assert.equal(container.children[0].dataset.page, '1');
  assert.equal(container.children[1].dataset.page, '2');

  const canvas = container.children[0].children[0];
  assert.equal(canvas.tagName, 'canvas');
  assert.equal(canvas.width, 612);
  assert.equal(canvas.height, 792);

  assert.equal(r.getPageWidth(), 612);
  assert.equal(r.getPageHeight(), 792);
  assert.equal(r.getPageCount(), 2);

  r.setScale(1.5);
  assert.equal(container.children[0].style.zoom, '1.5');
});

test('embed: scrollToPage targets the data-page element', async () => {
  installFakeDom();
  const { default: PostScriptRenderer } = await import('../embed/postscript-renderer.js');
  const r = new PostScriptRenderer();
  const container = document.createElement('div');
  await r.load(smoke, container);
  r.scrollToPage(2);
  assert.equal(container.children[1]._scrolled, true);
});

test('embed: getPageText extracts a page’s text; destroy clears', async () => {
  installFakeDom();
  const { default: PostScriptRenderer } = await import('../embed/postscript-renderer.js');
  const r = new PostScriptRenderer();
  const container = document.createElement('div');
  await r.load(smoke, container);
  assert.match(r.getPageText(1), /Riposte PostScript smoke test/);
  r.destroy();
  assert.equal(container.children.length, 0);
  assert.equal(r.getPageCount(), 0);
});

test('embed: registration maps .ps/.eps to a lazy postscript loader', async () => {
  const { EXT_MAP, RENDERER_LOADERS } = await import('../embed/register.js');
  assert.equal(EXT_MAP.ps, 'postscript');
  assert.equal(EXT_MAP.eps, 'postscript');
  assert.equal(typeof RENDERER_LOADERS.postscript, 'function');
});
