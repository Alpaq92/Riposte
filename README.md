# Riposte

A **pure-JavaScript PostScript reader** — no plugins, no native modules, no
WebAssembly, and **zero dependencies**. Runs anywhere, in both Node and the browser,
and exposes a small page-renderer API a host viewer can embed.

Riposte is a deliberate **transplant of the best parts** of two MIT PostScript
interpreters — [Wiladams/lj2ps](https://github.com/Wiladams/lj2ps) (Lua) and
[wiladams/waavscript](https://github.com/wiladams/waavscript) (C++) — fused
into one coherent engine, with a UI built on the
[embed-pdf-viewer](https://github.com/embedpdf/embed-pdf-viewer) design, the
[GitHub Primer](https://primer.style) colour palette, and
[Phosphor](https://github.com/phosphor-icons/core) icons (all MIT). Every donor was chosen
so Riposte stays **single-license MIT** — see [Credits](#credits).

### ▶ [Live demo](https://alpaq92.github.io/Riposte/)

A PostScript playground: type a program, run it, and watch it **render to a canvas**
(shapes, fills, strokes, color, even-odd vs nonzero) alongside the text output and
operand stack — recursion, loops, dictionaries and all. Everything runs locally, in
your browser. (Run it yourself with `node tools/serve.mjs`.)

## What it does

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design. **Live today:**

- A complete **PostScript language core** — scanner, the stack machine (operand /
  execution / dictionary stacks), `def`/`bind`, the full control suite
  (`if`/`ifelse`/`for`/`repeat`/`loop`/`forall`/`exit`/`stop`/`stopped`), and the
  stack / arithmetic / relational / array / dict / string / type operator families.
- An **iterative, no-host-recursion evaluator** — deeply recursive PostScript runs on
  a heap-backed execution stack, so it can't overflow the JS call stack.
- The **graphics imaging model** — graphics state + CTM, paths (lines, Béziers, arcs),
  `gsave`/`grestore`, color (gray / RGB / CMYK), and `fill` / `eofill` / `stroke` /
  `clip` — through an abstract **`Driver`** with a **`CanvasDriver`** (browser) and a
  headless **`SVGDriver`**. The [live demo](#-live-demo) renders straight to a canvas.
- **Documents & text** — **DSC** parsing (title, bounding box, fonts, page boundaries),
  **multi-page** navigation, the **base-14 fonts** (system families + metrics, with full
  CTM-aware text placement), and a **`page-renderer` API** (`loadDocument` / `pageBBox` /
  `renderPageToSVG` / `extractText`).
- **Embeddable & file-aware** — a host-viewer **renderer adapter** (each page becomes a
  `.doc-page` canvas via the page-renderer API), and the standalone demo **opens files**
  (picker + drag-drop) with a **thumbnail** strip and **page navigation**.
- **Language completeness & export** — copy-on-write **`save`/`restore`** (correct through
  shared `getinterval` windows and nested saves), one-click **SVG export** of any page, and
  **find-in-source** in the demo.

- **Embedded fonts** — **Type 1** (`.pfb` / `.pfa`) and **TrueType** (`.ttf`) load via the
  **Font** button and render from their real glyph **outlines** (Type 1 eexec + a full
  charstring interpreter; TrueType sfnt parsing with quadratic→cubic curves). A font can
  also be defined **in-document** with `currentfile eexec` — decrypted and registered for
  `findfont` as the program streams.
- **Off-thread rendering & diff** — the playground renders each page in a **Web Worker**
  (OffscreenCanvas, with a main-thread fallback), and a **diff view** highlights the pixel
  changes between the live render and a captured reference.

**Next:** AFM font metrics, CFF/OpenType (`OTTO`) outlines (with
[opentype.js](https://github.com/opentypejs/opentype.js) (MIT) as a clean-room reference —
not a dependency), and a `pstest` conformance harness.

## Usage

```js
import { VM } from './engine/vm.js';

const vm = new VM();                 // out defaults to stdout
vm.runString('3 4 add ==');          // => 7

// recursion, headless, no stack overflow:
vm.runString('/fact { dup 1 le { pop 1 } { dup 1 sub fact mul } ifelse } def 6 fact =='); // => 720
```

Or just open the [playground](#-live-demo), or run the REPL:

```sh
node engine/repl.js
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — module map, the no-recursion
  execution model, the object model, the (planned) Driver rendering seam, and the
  **code-provenance chart**.
- [docs/TESTS.md](docs/TESTS.md) — test layout and the pure-JS, zero-dependency
  philosophy.
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — how to contribute (fork → PR), and
  the pure-JS / single-license-MIT ground rules.

## Develop

```sh
npm test                 # pure-JS test suite (node --test), no external tooling
node tools/serve.mjs     # serve the demo at http://localhost:8080
node engine/repl.js      # interactive PostScript REPL
```

No build step. Requires **Node ≥ 18** (uses the built-in test runner).

## Credits

Riposte is **single-license MIT**, and every donor was chosen to keep it that way.
Their *architecture and ideas* are ported — never their source — which is what keeps
the licence singular (see [CONTRIBUTING.md](docs/CONTRIBUTING.md#licensing--single-license-mit)).

**Interpreter design**

- **[Wiladams/lj2ps](https://github.com/Wiladams/lj2ps)** (MIT) — the closest analog
  (a PostScript interpreter in a GC'd language). The body plan: procedure-as-
  executable-array, operators-as-dictionary, `bind`, and the **Driver seam** that
  makes pure-JS rendering a drop-in.
- **[wiladams/waavscript](https://github.com/wiladams/waavscript)** (MIT) — the
  two-stage scanner and the graphics-context interface + CTM / path model.

The **iterative, no-host-recursion execution-stack evaluator** and the
signature/type-pattern operator table are original engineering.

**UI** — built on the [embed-pdf-viewer](https://github.com/embedpdf/embed-pdf-viewer)
design (CloudPDF, MIT): the toolbar / thumbnail-sidebar / viewport shell and compact 32px
controls, reimplemented clean-room in vanilla CSS, with a token-based light/dark palette
coloured from the [GitHub Primer](https://primer.style) primitives (`@primer/primitives`, MIT).

**Assets & tests** — icons are inlined [Phosphor](https://github.com/phosphor-icons/core)
SVG (MIT); language-conformance fixtures are [meientau/pstest](https://github.com/meientau/pstest)
(MIT). Non-MIT sources (the BSD/Apache/GPL interpreters, the unknown-provenance
Ghostscript tiger) were deliberately **not** used.

## License

MIT — see [LICENSE](LICENSE). Single-license: all first-party code and inlined
Phosphor icons are MIT. Donor influence is architectural; no donor source is
included.
