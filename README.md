# Riposte

A **pure-JavaScript PostScript reader** — no plugins, no native modules, no
WebAssembly, **zero dependencies**, no build step. Runs in Node, a Web Worker, and
the browser, and exposes a small page-renderer API a host viewer can embed.

A clean-room **transplant of the best ideas** from two MIT PostScript interpreters —
[lj2ps](https://github.com/Wiladams/lj2ps) (Lua) and
[waavscript](https://github.com/wiladams/waavscript) (C++) — fused into one engine,
with a UI built on the [embed-pdf-viewer](https://github.com/embedpdf/embed-pdf-viewer)
design, the [GitHub Primer](https://primer.style) palette, and
[Phosphor](https://github.com/phosphor-icons/core) icons. Every donor is MIT, so
Riposte stays **single-license MIT** — see [Credits](#credits).

### ▶ [Live demo](https://alpaq92.github.io/Riposte/)

Type a PostScript program, run it, and watch it **render to a canvas** — shapes,
fills, strokes, colour, even-odd vs nonzero — beside the text output and operand
stack. Everything runs in your browser.

## What it does

**Live today** (see [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design):

- **Language core** — scanner, the operand / execution / dictionary stack machine,
  `def` / `bind`, the full control suite (`if` / `for` / `loop` / `forall` /
  `stopped` / …), and the stack / math / relational / array / dict / string / type
  operators.
- **No-host-recursion evaluator** — deeply recursive PostScript runs on a
  heap-backed execution stack, so it can't overflow the JS call stack.
- **Graphics** — graphics state + CTM, paths (lines, Béziers, arcs),
  `gsave` / `grestore`, gray / RGB / CMYK colour, and `fill` / `eofill` / `stroke` /
  `clip`, through an abstract **`Driver`** (a **`CanvasDriver`** and a headless
  **`SVGDriver`**).
- **Documents** — **DSC** parsing, **multi-page** navigation, base-14 fonts with
  CTM-aware text, and a **page-renderer API** (`loadDocument` / `pageBBox` /
  `renderPageToSVG` / `extractText`) a host viewer can embed.
- **Embedded fonts** — **Type 1** (`.pfb` / `.pfa`) and **TrueType** (`.ttf`) render
  from real glyph outlines; a font can also be defined **in-document** via
  `currentfile eexec`.
- **`save` / `restore`** copy-on-write (correct through shared `getinterval` windows
  and nested saves), plus one-click **SVG export**.
- **Playground extras** — open files (picker + drag-drop), thumbnails, find-in-source,
  off-thread **Web Worker** rendering (with a main-thread fallback), and a **diff view**
  that highlights pixel changes against a captured reference.

**Next:** AFM metrics, CFF/OpenType (`OTTO`) outlines
([opentype.js](https://github.com/opentypejs/opentype.js) as a clean-room reference,
not a dependency), and a `pstest` conformance harness.

## Usage

```js
import { VM } from './engine/vm.js';

const vm = new VM();                  // out defaults to stdout
vm.runString('3 4 add ==');           // => 7
vm.runString('/fact { dup 1 le { pop 1 } { dup 1 sub fact mul } ifelse } def 6 fact =='); // => 720
```

## Develop

```sh
npm test                 # pure-JS test suite (node --test) — no external tooling
node tools/serve.mjs     # serve the demo at http://localhost:8080
node engine/repl.js      # interactive PostScript REPL
```

No build step. Requires **Node ≥ 18** (built-in test runner).

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — module map, the no-recursion execution
  model, the object model, the Driver rendering seam, and the code-provenance chart.
- [TESTS.md](docs/TESTS.md) — test layout and the pure-JS, zero-dependency philosophy.
- [CONTRIBUTING.md](docs/CONTRIBUTING.md) — fork → PR, and the single-license-MIT rules.

## Credits

**Single-license MIT** — every donor's *architecture and ideas* are ported, never
their source, which is what keeps the licence singular.

- **[lj2ps](https://github.com/Wiladams/lj2ps)** (MIT) — the body plan:
  procedure-as-executable-array, operators-as-dictionary, `bind`, and the **Driver
  seam** that makes pure-JS rendering a drop-in.
- **[waavscript](https://github.com/wiladams/waavscript)** (MIT) — the two-stage
  scanner and the graphics-context + CTM / path model.
- **[embed-pdf-viewer](https://github.com/embedpdf/embed-pdf-viewer)** (MIT) — the
  toolbar / sidebar / viewport shell, reimplemented clean-room in vanilla CSS, with a
  light/dark palette from [GitHub Primer](https://primer.style) (MIT).
- **[Phosphor](https://github.com/phosphor-icons/core)** (MIT) — inlined SVG icons.
- **[meientau/pstest](https://github.com/meientau/pstest)** (MIT) — language-conformance
  fixtures.

The **no-host-recursion execution-stack evaluator** and the signature/type-pattern
operator table are original. Non-MIT sources (BSD/Apache/GPL interpreters, the
unknown-provenance Ghostscript tiger) were deliberately **not** used.

## License

MIT — see [LICENSE](LICENSE). All first-party code and inlined Phosphor icons are MIT;
donor influence is architectural, with no donor source included.
