// demo/theme.js — light / dark / system theme switch (embed-pdf-viewer model).
// Sets [data-theme] on <html>; "system" follows prefers-color-scheme live.
const KEY = 'riposte-theme';
const ORDER = ['light', 'dark', 'system'];
const mql = window.matchMedia('(prefers-color-scheme: dark)');

const pref = () => localStorage.getItem(KEY) || 'system';
const resolve = (p) => (p === 'system' ? (mql.matches ? 'dark' : 'light') : p);
const apply = (p) => { document.documentElement.dataset.theme = resolve(p); };

export function initTheme() {
  apply(pref());
  mql.addEventListener('change', () => { if (pref() === 'system') apply('system'); });
  return pref();
}

export function cycleTheme() {
  const next = ORDER[(ORDER.indexOf(pref()) + 1) % ORDER.length];
  localStorage.setItem(KEY, next);
  apply(next);
  return next;
}

export const themePref = pref;
export const themeIcon = (p) => (p === 'light' ? 'sun' : p === 'dark' ? 'moon' : 'monitor');
