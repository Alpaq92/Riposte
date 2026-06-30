// engine/errors.js
// PostScript-level errors. `psname` is the PostScript error name (e.g.
// 'typecheck', 'undefined', 'stackunderflow') used by errordict later.
export class PSError extends Error {
  constructor(name, detail) {
    super(detail ? `${name}: ${detail}` : name);
    this.psname = name;
    this.detail = detail || null;
  }
}
