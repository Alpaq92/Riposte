// engine/graphics/render.js
// Run a PostScript program against a Driver. Sets the base CTM that maps
// PostScript's y-up, bottom-left user space to the device's y-down, top-left
// space (the Y-flip), scaled by `scale`.
import { VM } from '../vm.js';
import { SVGDriver } from './svg-driver.js';

export function renderToDriver(src, driver, { width = 612, height = 792, scale = 1, out } = {}) {
  const vm = new VM({ driver, out });
  vm.gstate.ctm = [scale, 0, 0, -scale, 0, height];
  driver.beginPage(width, height);
  vm.runString(src);
  driver.endPage();
  return vm;
}

export function renderToSVG(src, opts = {}) {
  const driver = new SVGDriver();
  renderToDriver(src, driver, opts);
  return driver.toSVG();
}
