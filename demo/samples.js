// Built-in sample programs for the Riposte playground.
// Graphical samples draw in the 612 x 792 page space; compute samples emit text.
import { encrypt } from '../engine/font/type1-crypt.js';
import { toBytes, concatBytes } from '../engine/font/bytes.js';

// Build a Type 1 font DEFINED INLINE in the program: its Private/CharStrings are
// eexec-encrypted (emitted as hex so the sample stays pasteable text) and read
// at run time via `currentfile eexec`. Glyph "A" is the triangle charstring
// shared with the engine's font tests.
const _hex = (b) => { let s = ''; for (let i = 0; i < b.length; i++) { s += b[i].toString(16).padStart(2, '0'); if ((i + 1) % 32 === 0) s += '\n'; } return s; };
function buildEexecFont() {
  const tri = Uint8Array.of(139, 249, 130, 13, 239, 139, 21, 247, 192, 139, 5, 251, 42, 248, 236, 5, 9, 14);
  const csEnc = encrypt(concatBytes([Uint8Array.of(0, 0, 0, 0), tri]), 4330);
  const priv = concatBytes([
    Uint8Array.of(0, 0, 0, 0),
    toBytes('dup /Private 3 dict dup begin\n/lenIV 4 def\n/CharStrings 1 dict dup begin\n/A ' + csEnc.length + ' RD '),
    csEnc, toBytes(' ND\nend end\nreadonly put\n')]);
  return `%!PS-AdobeFont-1.0: InlineDemo
% This font is DEFINED INLINE: the encrypted block below is read straight from
% the program by "currentfile eexec" and decrypted at run time (no font file).
/FontName /InlineDemo def
/FontMatrix [0.001 0 0 0.001 0 0] def
/Encoding 256 array
dup 65 /A put
def
currentfile eexec
${_hex(encrypt(priv, 55665))}
0000000000000000000000000000000000000000000000000000000000000000
cleartomark
% --- ordinary PostScript that USES the font defined just above ---
/InlineDemo findfont 220 scalefont setfont
0.35 0.30 0.85 setrgbcolor
90 430 moveto (AAA) show
0.95 0.75 0.10 setrgbcolor
130 170 moveto (AA) show
showpage`;
}

export const SAMPLES = [
  {
    name: 'Shapes',
    code: `% blue rectangle
0.20 0.45 0.90 setrgbcolor
80 600 moveto 240 600 lineto 240 700 lineto 80 700 lineto closepath fill
% red circle (CMYK)
0 1 1 0 setcmykcolor
440 650 60 0 360 arc fill
% green bezier
0 0.6 0.3 setrgbcolor 6 setlinewidth 1 setlinecap
90 360 moveto 200 520 380 200 520 380 curveto stroke
% dashed rule
0 setgray 3 setlinewidth [16 8] 0 setdash
90 300 moveto 520 300 lineto stroke
showpage`,
  },

  {
    name: 'Star (eofill)',
    code: `% a pentagram filled even-odd leaves a hollow centre;
% nonzero fill would fill it solid.
306 400 translate
0.95 0.75 0.10 setrgbcolor
newpath
0 150 moveto -88 -121 lineto 142 46 lineto -142 46 lineto 88 -121 lineto
closepath eofill
showpage`,
  },

  {
    name: 'Spiral fan',
    code: `% rotate inside a for-loop — gsave/grestore per spoke
0.7 setlinewidth 0.25 0.5 1 setrgbcolor
306 400 translate
0 8 360 {
  gsave rotate 0 0 moveto 250 0 lineto stroke grestore
} for
showpage`,
  },

  {
    name: 'Text',
    code: `/Helvetica findfont 40 scalefont setfont
0 setgray
80 600 moveto (Hello, Riposte) show
0.20 0.45 0.90 setrgbcolor
80 540 moveto (PostScript in pure JS) show
showpage`,
  },

  { name: 'Arithmetic', code: '3 4 add ==' },

  { name: 'Factorial', code: '/fact { dup 1 le { pop 1 } { dup 1 sub fact mul } ifelse } def\n6 fact ==' },

  { name: 'Sum 1..100', code: '0 1 1 100 { add } for ==' },

  {
    name: 'Deep recursion',
    code: `% 20000-deep recursion through ifelse — proof there is no JS stack
% overflow (procedure calls run on a heap-backed execution stack).
/count { dup 0 gt { 1 sub count } { } ifelse } def
20000 count                     % recurse 20000 deep; leaves 0
dup (bottomed out at ) print == % print one copy to the Output panel; keep one
/Helvetica findfont 24 scalefont setfont
0.20 0.45 0.90 setrgbcolor
90 640 moveto (Deep recursion: 20000 levels) show
0 setgray
90 600 moveto (through ifelse, no JS stack overflow.) show
90 560 moveto (Bottomed out at: ) show
20 string cvs show
showpage`,
  },

  { name: 'Dictionaries', code: '/d 3 dict def\nd /pi 3.14159 put\nd /pi get ==' },

  { name: 'Stack ops', code: '1 2 3 pstack' },

  {
    name: 'Embedded font',
    code: `% A built-in synthetic Type 1 font: glyph "A" is a triangle, rendered from
% charstring OUTLINES (not a system font). Load a real .pfb via the Font button.
/DemoTriangle findfont 220 scalefont setfont
0.20 0.45 0.90 setrgbcolor
90 430 moveto (AAA) show
0.95 0.75 0.10 setrgbcolor
130 170 moveto (AA) show
showpage`,
  },

  { name: 'Inline font (eexec)', code: buildEexecFont() },

  {
    name: 'Two pages',
    code: `%!PS-Adobe-3.0
%%Title: Two-page demo
%%BoundingBox: 0 0 612 792
%%Pages: 2
%%DocumentFonts: Helvetica Times-Roman
%%EndComments
%%Page: 1 1
0.20 0.45 0.90 setrgbcolor
106 560 moveto 506 560 lineto 506 640 lineto 106 640 lineto closepath fill
/Helvetica findfont 40 scalefont setfont 0 setgray
150 400 moveto (Page one) show
showpage
%%Page: 2 2
0 1 1 0 setcmykcolor
306 500 90 0 360 arc fill
/Times-Roman findfont 40 scalefont setfont 0 setgray
150 300 moveto (Page two) show
showpage
%%Trailer
%%EOF`,
  },
];
