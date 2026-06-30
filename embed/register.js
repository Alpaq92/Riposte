// embed/register.js — registration glue for a host viewer's renderer registry.
// Map the PostScript extensions to a format, and lazy-import the renderer only
// when a .ps / .eps is opened (so Riposte's engine isn't loaded otherwise).
export const EXT_MAP = { ps: 'postscript', eps: 'postscript', epsf: 'postscript' };

export const RENDERER_LOADERS = {
  postscript: () => import('./postscript-renderer.js'),
};

// Merge Riposte's PostScript support into a host viewer that exposes
// extension/loader maps. Adjust the property names to your viewer if they differ.
export function registerRenderer(viewer) {
  if (!viewer) return;
  Object.assign((viewer.EXT_MAP ??= {}), EXT_MAP);
  Object.assign((viewer.RENDERER_LOADERS ??= {}), RENDERER_LOADERS);
}
