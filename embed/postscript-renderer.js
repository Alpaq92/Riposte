// embed/postscript-renderer.js
// A DOM renderer adapter for host viewers. Implements the common renderer
// contract (load / destroy / scrollToPage / setScale / getPageWidth /
// getPageHeight / print hooks). Each PostScript page becomes a `.doc-page`
// <div> holding an engine-rendered <canvas> (the standard DOM-page model).
//
// Wiring: register the extensions (see embed/register.js) so a host viewer
// lazy-imports this module for .ps / .eps files. The engine stays UI-agnostic;
// this adapter is the only DOM-aware piece, so multiple instances can coexist.
import { loadDocument, pageSize, renderPageToDriver, extractText } from '../engine/document.js';
import { CanvasDriver } from '../engine/graphics/canvas-driver.js';

// Decode bytes as Latin-1 (1 byte = 1 code unit) so PostScript stays byte-exact.
function bytesToLatin1(bytes) {
  let s = '';
  const CH = 8192;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return s;
}

export default class PostScriptRenderer {
  constructor() { this.doc = null; this.container = null; this.scale = 1; }

  async load(buffer, container, _viewer) {
    const source = typeof buffer === 'string'
      ? buffer
      : bytesToLatin1(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
    this.doc = loadDocument(source);
    this.container = container;
    container.innerHTML = '';

    for (let i = 0; i < this.doc.pageCount; i++) {
      const { width, height } = pageSize(this.doc, i);
      const page = document.createElement('div');
      page.className = 'doc-page';
      page.dataset.page = String(i + 1);          // scrollToPage looks this up

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));   // natural size; CSS zoom handles scale
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext('2d');
      if (ctx) renderPageToDriver(this.doc, i, new CanvasDriver(ctx));

      page.appendChild(canvas);
      container.appendChild(page);
    }
    this.setScale(this.scale);
    return { pageCount: this.doc.pageCount };
  }

  destroy() {
    if (this.container) this.container.innerHTML = '';
    this.doc = null;
    this.container = null;
  }

  scrollToPage(n) {
    const el = this.container && this.container.querySelector(`[data-page="${n}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  setScale(scale) {
    this.scale = scale;
    if (!this.container) return;
    for (const page of this.container.querySelectorAll('.doc-page')) page.style.zoom = String(scale);
  }

  getPageWidth() { return this.doc ? pageSize(this.doc, 0).width : 0; }
  getPageHeight() { return this.doc ? pageSize(this.doc, 0).height : 0; }
  getPageCount() { return this.doc ? this.doc.pageCount : 0; }
  getPageText(i) { return this.doc ? extractText(this.doc, i) : ''; }

  // Print hooks — pages are already fully rendered, so these are no-ops.
  preparePrint() {}
  cleanupAfterPrint() {}
}

PostScriptRenderer.format = 'postscript';
PostScriptRenderer.extensions = ['ps', 'eps', 'epsf'];
