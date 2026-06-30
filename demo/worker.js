// Riposte render worker — runs the PostScript interpreter and rasterises a page
// OFF the main thread via the shared render core, then transfers the result back
// as an ImageBitmap (so the visible canvas, and pixel read-back for the diff
// view, stay on the main thread).
import { renderToContext } from './render-core.js';
import { parseType1 } from '../engine/font/type1.js';
import { parseTrueType } from '../engine/font/truetype.js';

// A loaded font's bytes are immutable, so parse once and reuse across renders
// (zoom / page nav / resize all re-send the same bytes).
let fontCache = null;
function fontDescriptor(font) {
  const key = font.kind + ':' + font.name + ':' + font.bytes.length;
  if (!fontCache || fontCache.key !== key) {
    fontCache = { key, desc: font.kind === 'truetype' ? parseTrueType(font.bytes) : parseType1(font.bytes) };
  }
  return fontCache.desc;
}

self.onmessage = (e) => {
  const { id, src, w, h, scale, demoFont, font } = e.data;
  const reply = { id, w, h };
  try {
    const off = new OffscreenCanvas(w, h);
    const r = renderToContext(off.getContext('2d'), {
      src, width: w, height: h, scale,
      registerFonts: (vm) => {
        if (demoFont) vm.registerFont(demoFont.name, demoFont.descriptor);
        if (font) vm.registerFont(font.name, fontDescriptor(font));
      },
    });
    Object.assign(reply, { ops: r.ops, output: r.output, error: r.error, stack: r.stack, ms: r.ms });
    reply.bitmap = off.transferToImageBitmap();
    self.postMessage(reply, [reply.bitmap]);
  } catch (ex) {
    reply.fatal = String((ex && ex.message) || ex);   // tell the main thread to fall back
    self.postMessage(reply);
  }
};
