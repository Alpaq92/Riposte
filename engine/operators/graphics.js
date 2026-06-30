// engine/operators/graphics.js — graphics state, colour, and minimal text ops.
import { PS, T, PSObject, nameString } from '../object.js';
import { PSError } from '../errors.js';
import { gray, rgb, cmyk, hsb, toRGBA } from '../graphics/paint.js';
import { multiply, transformPoint } from '../graphics/matrix.js';
import { fontFromName, stringWidth } from '../graphics/font.js';
import { PSPath } from '../graphics/path.js';
import { runCharstring } from '../font/type1-charstring.js';

function setColor(vm, paint) { vm.gstate.fillPaint = paint; vm.gstate.strokePaint = paint; }

// Glyph-space -> device sink: map each outline point by the glyph->device matrix
// and append it to a device-space path the driver can fill. Shared by the
// Type 1 (cubic) and TrueType (quadratic-upgraded-to-cubic) renderers.
function deviceSink(g2d, path) {
  return {
    moveTo(x, y) { const p = transformPoint(g2d, x, y); path.moveTo(p[0], p[1]); },
    lineTo(x, y) { const p = transformPoint(g2d, x, y); path.lineTo(p[0], p[1]); },
    curveTo(x1, y1, x2, y2, x3, y3) {
      const a = transformPoint(g2d, x1, y1), b = transformPoint(g2d, x2, y2), c = transformPoint(g2d, x3, y3);
      path.curveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
    },
    close() { path.close(); },
  };
}

// glyph -> device matrix at the current pen: FontMatrix·size, then pen, then CTM.
function glyphToDevice(vm, fm, size, pen) {
  return multiply([fm[0] * size, fm[1] * size, fm[2] * size, fm[3] * size, pen, vm.gstate.cpy], vm.gstate.ctm);
}

const DEFAULT_FONT_MATRIX = [0.001, 0, 0, 0.001, 0, 0];   // Type 1 default (1000-em)

// Shared outline-font render loop: lay out `text` glyph by glyph, fill each
// glyph's outline, and advance the pen. `glyph(code, sink)` emits the glyph's
// outline (in font units) to the sink and returns its advance width (font units).
function renderOutlineFont(vm, text, fd, glyph) {
  const size = fd.size, fm = fd.fontMatrix || DEFAULT_FONT_MATRIX;
  const color = toRGBA(vm.gstate.fillPaint);
  let pen = vm.gstate.cpx;
  for (let ci = 0; ci < text.length; ci++) {
    const path = new PSPath();
    const width = glyph(text.charCodeAt(ci), deviceSink(glyphToDevice(vm, fm, size, pen), path));
    if (path.segs.length) vm.driver.fill(path, 'nonzero', color);
    pen += width * fm[0] * size;
  }
  vm.gstate.cpx = pen;
}

// Embedded Type 1: interpret each glyph's charstring; a missing glyph emits
// nothing and advances a half em.
function renderType1(vm, text, fd) {
  const em = 1 / (fd.fontMatrix || DEFAULT_FONT_MATRIX)[0];
  renderOutlineFont(vm, text, fd, (code, sink) => {
    const name = fd.encoding ? fd.encoding[code] : undefined;
    const cs = (name != null && fd.charstrings.get(name)) || fd.charstrings.get(code);
    if (!cs) return 0.5 * em;
    return runCharstring(cs, { subrs: fd.subrs || [], sink }).width;
  });
}

// Embedded TrueType: map char -> glyph id via the cmap, emit its outline
// (quadratics already upgraded to cubics by the parser), advance by hmtx.
function renderTrueType(vm, text, fd) {
  renderOutlineFont(vm, text, fd, (code, sink) => {
    const gid = fd.cmapLookup(code);
    fd.glyphOutline(gid, sink);
    return fd.advanceWidth(gid);
  });
}

export default {
  gsave(vm) { vm.gsStack.push(vm.gstate.clone()); vm.driver.save(); },
  grestore(vm) { if (vm.gsStack.length) { vm.gstate = vm.gsStack.pop(); vm.driver.restore(); } },
  grestoreall(vm) { while (vm.gsStack.length) vm.gstate = vm.gsStack.pop(); },

  setlinewidth(vm) { vm.gstate.lineWidth = vm.popNum().value; },
  currentlinewidth(vm) { vm.push(PS.real(vm.gstate.lineWidth)); },
  setlinecap(vm) { vm.gstate.lineCap = vm.popInt(); },
  currentlinecap(vm) { vm.push(PS.int(vm.gstate.lineCap)); },
  setlinejoin(vm) { vm.gstate.lineJoin = vm.popInt(); },
  currentlinejoin(vm) { vm.push(PS.int(vm.gstate.lineJoin)); },
  setmiterlimit(vm) { vm.gstate.miterLimit = vm.popNum().value; },
  currentmiterlimit(vm) { vm.push(PS.real(vm.gstate.miterLimit)); },
  setflat(vm) { vm.gstate.flatness = vm.popNum().value; },
  currentflat(vm) { vm.push(PS.real(vm.gstate.flatness)); },
  setdash(vm) {
    const off = vm.popNum().value;
    const a = vm.popType(T.ARRAY);
    vm.gstate.dashArray = Array.from(a.value).map((o) => o.value);
    vm.gstate.dashOffset = off;
  },

  setgray(vm) { setColor(vm, gray(vm.popNum().value)); },
  setrgbcolor(vm) { const b = vm.popNum().value, g = vm.popNum().value, r = vm.popNum().value; setColor(vm, rgb(r, g, b)); },
  setcmykcolor(vm) { const k = vm.popNum().value, y = vm.popNum().value, m = vm.popNum().value, c = vm.popNum().value; setColor(vm, cmyk(c, m, y, k)); },
  sethsbcolor(vm) { const b = vm.popNum().value, s = vm.popNum().value, h = vm.popNum().value; setColor(vm, hsb(h, s, b)); },

  showpage(vm) { vm.driver.showPage(); },
  erasepage() {},

  // --- fonts & text (base-14 via system families + approximate metrics) ---
  findfont(vm) {
    const name = vm.pop();
    const nm = name.type === T.NAME ? nameString(name.value)
      : name.type === T.STRING ? name.value.toJSString() : 'Helvetica';
    const registered = vm.fonts && vm.fonts.get(nm);   // e.g. a parsed embedded Type 1 font
    vm.push(new PSObject(T.FONTID, registered ? { ...registered, size: 1 } : { ...fontFromName(nm), size: 1 }, false));
  },
  definefont(vm) { const f = vm.pop(); vm.pop(); vm.push(f); },   // key font definefont -> font (stub)
  scalefont(vm) {
    const s = vm.popNum().value;
    const f = vm.pop();
    if (f.type !== T.FONTID) throw new PSError('typecheck');
    vm.push(new PSObject(T.FONTID, { ...f.value, size: f.value.size * s }, false));
  },
  setfont(vm) { const f = vm.pop(); if (f.type !== T.FONTID) throw new PSError('typecheck'); vm.gstate.font = f; },
  currentfont(vm) { vm.push(vm.gstate.font || new PSObject(T.FONTID, { ...fontFromName('Helvetica'), size: 1 }, false)); },
  show(vm) {
    const s = vm.popType(T.STRING);
    if (!vm.gstate.hasCP) throw new PSError('nocurrentpoint');
    const text = s.value.toJSString();
    const fd = vm.gstate.font ? vm.gstate.font.value : { ...fontFromName('Helvetica'), size: 12 };
    if (fd.charstrings) { renderType1(vm, text, fd); return; }     // embedded Type 1 outlines
    if (fd.truetype) { renderTrueType(vm, text, fd); return; }      // embedded TrueType outlines
    // glyph space -> device: flip y (glyphs upright in y-up user space),
    // translate to the current point, then apply the CTM.
    const m = multiply([1, 0, 0, -1, vm.gstate.cpx, vm.gstate.cpy], vm.gstate.ctm);
    vm.driver.showText(text, m, fd.size, toRGBA(vm.gstate.fillPaint), fd);
    vm.gstate.cpx += stringWidth(fd, text, fd.size);
  },
  stringwidth(vm) {
    const s = vm.popType(T.STRING);
    const fd = vm.gstate.font ? vm.gstate.font.value : { ...fontFromName('Helvetica'), size: 12 };
    vm.push(PS.real(stringWidth(fd, s.value.toJSString(), fd.size)));
    vm.push(PS.real(0));
  },
};
