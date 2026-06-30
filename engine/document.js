// engine/document.js
// The page-renderer API — the surface the standalone UI and any host embed
// both consume. A Document is parsed from source (DSC), split into pages, and
// rendered one page at a time to any Driver. UI-agnostic: no DOM here.
import { parseDSC } from './dsc.js';
import { renderToDriver } from './graphics/render.js';
import { SVGDriver } from './graphics/svg-driver.js';
import { Driver } from './graphics/driver.js';

const DEFAULT_BBOX = [0, 0, 612, 792];

export function loadDocument(source) {
  const dsc = parseDSC(source);
  const pages = computePages(source, dsc);
  return { source, dsc, pages, pageCount: pages.length };
}

function computePages(source, dsc) {
  if (!dsc.pageMarkers.length) {
    return [{ label: '1', ordinal: 1, prolog: '', content: source }];
  }
  const prolog = source.slice(0, dsc.pageMarkers[0].index);   // defs + setup shared by all pages
  const pages = [];
  for (let i = 0; i < dsc.pageMarkers.length; i++) {
    const start = dsc.pageMarkers[i].index;
    const end = i + 1 < dsc.pageMarkers.length
      ? dsc.pageMarkers[i + 1].index
      : (dsc.trailerIndex >= 0 ? dsc.trailerIndex : source.length);
    pages.push({ label: dsc.pageMarkers[i].label, ordinal: i + 1, prolog, content: source.slice(start, end) });
  }
  return pages;
}

/** Bounding box [llx, lly, urx, ury] for a page (the document bbox, or Letter). */
export function pageBBox(doc, _i = 0) { return doc.dsc.boundingBox || DEFAULT_BBOX; }

export function pageSize(doc, i = 0) {
  const [, , urx, ury] = pageBBox(doc, i);
  return { width: urx, height: ury };
}

/** Render page `i` to a Driver. opts: { width, height, scale, out }. Returns the VM. */
export function renderPageToDriver(doc, i, driver, opts = {}) {
  const page = doc.pages[i];
  if (!page) throw new RangeError(`page ${i} out of range (0..${doc.pageCount - 1})`);
  const { width, height } = pageSize(doc, i);
  const src = page.prolog + '\n' + page.content;
  return renderToDriver(src, driver, { width, height, scale: 1, ...opts });
}

export function renderPageToSVG(doc, i, opts = {}) {
  const driver = new SVGDriver();
  renderPageToDriver(doc, i, driver, opts);
  return driver.toSVG();
}

// Collect the text drawn by `show` on a page (basic text extraction).
class TextDriver extends Driver {
  constructor() { super(); this.runs = []; }
  showText(text) { this.runs.push(text); }
}
export function extractText(doc, i) {
  const d = new TextDriver();
  renderPageToDriver(doc, i, d, {});
  return d.runs.join(' ');
}
