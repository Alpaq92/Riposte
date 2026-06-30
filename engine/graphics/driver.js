// engine/graphics/driver.js
// The abstract rendering backend — the single seam between the (backend-
// agnostic) operator layer and a concrete target. The base class is also the
// null driver: a no-op that lets the VM run headless with no rendering.
//
// Paths arrive already in DEVICE space; colours arrive as { r, g, b, a } in
// 0..1; stroke params arrive in device units. Implement against this contract
// for Canvas (CanvasDriver), SVG (SVGDriver), or a software rasterizer.

export class Driver {
  beginPage(width, height) { this.width = width; this.height = height; }
  save() {}
  restore() {}
  fill(path, rule, color) {}            // rule: 'nonzero' | 'evenodd'
  stroke(path, params, color) {}        // params: { width, cap, join, miter, dash[], offset }
  clip(path, rule) {}
  showText(text, matrix, size, color, font) {}  // matrix: glyph-space -> device
  showPage() {}
  endPage() {}
}

export const CAP = ['butt', 'round', 'square'];
export const JOIN = ['miter', 'round', 'bevel'];
