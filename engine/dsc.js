// engine/dsc.js
// Document Structuring Conventions (DSC) parser. Reads the `%%` comments that
// describe a PostScript document — title, bounding box, page boundaries, fonts
// — feeding the page model (engine/document.js) and the Properties view.

const line = (re, src) => { const m = re.exec(src); return m ? m[1].trim() : null; };

export function parseDSC(source) {
  const dsc = {
    title: line(/^%%Title:\s*(.*)$/m, source),
    creator: line(/^%%Creator:\s*(.*)$/m, source),
    creationDate: line(/^%%CreationDate:\s*(.*)$/m, source),
    forJob: line(/^%%For:\s*(.*)$/m, source),
    languageLevel: line(/^%%LanguageLevel:\s*(.*)$/m, source),
    boundingBox: null,
    pagesDeclared: null,
    media: line(/^%%DocumentMedia:\s*(.*)$/m, source),
    fonts: [],
    pageMarkers: [],
    trailerIndex: -1,
  };

  const bb = /^%%BoundingBox:\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/m.exec(source);
  if (bb) dsc.boundingBox = [parseFloat(bb[1]), parseFloat(bb[2]), parseFloat(bb[3]), parseFloat(bb[4])];

  const pg = /^%%Pages:\s*(\d+)/m.exec(source);
  if (pg) dsc.pagesDeclared = parseInt(pg[1], 10);

  const fonts = line(/^%%DocumentFonts:\s*(.*)$/m, source);
  if (fonts && fonts !== '(atend)') dsc.fonts = fonts.split(/\s+/).filter(Boolean);

  // page boundaries (line-anchored, with char offsets)
  const pageRe = /^%%Page:\s*(.*)$/gm;
  let m;
  while ((m = pageRe.exec(source))) {
    const raw = m[1].trim().split(/\s+/);
    const label = raw[0] || String(dsc.pageMarkers.length + 1);
    const ordinal = parseInt(raw[1] ?? raw[0], 10) || dsc.pageMarkers.length + 1;
    dsc.pageMarkers.push({ label, ordinal, index: m.index });
  }

  const tr = /^%%Trailer\b/m.exec(source);
  if (tr) dsc.trailerIndex = tr.index;

  return dsc;
}
