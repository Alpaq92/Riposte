// demo/render-core.js — the one render pass shared by the main thread
// (runPageToCanvas) and the Web Worker, so the two can't drift. It takes a 2D
// context + a source string, runs the engine, and returns the UI-facing result.
import { VM } from '../engine/vm.js';
import { CanvasDriver } from '../engine/graphics/canvas-driver.js';

export const safeRepr = (o) => { try { return o.toString(); } catch { return '<' + o.type + '>'; } };
export const stackItems = (vm) => vm.ostack.map((o) => ({ type: o.type, repr: safeRepr(o) }));

// Count paint operations (fills, strokes, glyph fills, text runs) by wrapping the
// driver's paint methods for this one render.
export function countDraws(driver) {
  const counts = { ops: 0 };
  for (const m of ['fill', 'stroke', 'showText']) {
    const orig = driver[m].bind(driver);
    driver[m] = (...args) => { counts.ops++; return orig(...args); };
  }
  return counts;
}

// Interpret `src` onto a 2D context at `scale` (Y-flip baked into the base CTM).
// `registerFonts(vm)` registers any embedded/loaded fonts. Returns what the UI
// needs: { ops, output, error, stack, ms }.
export function renderToContext(ctx, { src, width, height, scale, registerFonts, capture = true }) {
  const driver = new CanvasDriver(ctx);
  const counts = countDraws(driver);
  const chunks = [];
  const vm = new VM({ driver, out: capture ? (s) => chunks.push(s) : () => {} });
  if (registerFonts) registerFonts(vm);
  vm.gstate.ctm = [scale, 0, 0, -scale, 0, height];   // Y-flip + scale
  driver.beginPage(width, height);
  const t0 = performance.now();
  let err = null;
  try { vm.runString(src); } catch (e) { err = e; }
  driver.endPage();
  return {
    ops: counts.ops,
    output: chunks.join(''),
    error: err ? (err.psname || err.message) : null,
    stack: stackItems(vm),
    ms: Math.round(performance.now() - t0),
  };
}
