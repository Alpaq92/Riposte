# Tests

The suite is **pure JavaScript** — `node --test` with `node:assert`, no frameworks,
no network, no native tooling. It runs anywhere Node ≥ 18 does, and the same engine
modules run unchanged in the browser.

```sh
npm test
```

**81 tests across twelve files.**

## Test files (`tests/`)

| File | Covers |
|---|---|
| `object.test.js` | The object model: int vs real tag distinction; **name interning identity**; literal vs executable name flag; **composite aliasing** — mutating a `getInterval` window is visible in the parent backing (the property PostScript requires); `mark`/`null` singletons. |
| `scanner.test.js` | The single-pass scanner: integer / real / `base#radix` / exponent / signed numbers with **try-number-then-name fallback**; literal `/name`, executable `name`, immediate `//name`; strings with nested parens, escapes and `\ddd` octal; hex strings; `{…}` captured as one **executable array**; `[] << >>` emitted as run-time tokens; comment skipping; unmatched-brace error. |
| `vm.test.js` | The VM end-to-end: arithmetic + `==` output; int/real preserved through arithmetic; `def`/`load`; `if`/`ifelse`/`for`/`repeat`/`loop`/`exit`/`forall`; **20,000-deep recursion without a JS stack overflow**; `stopped` catching both `stop` and errors; `<< >>` and `dict`/`begin`/`def`/`end`; `roll`/`index`; array & string `get`/`length`; `type`; operator redefinition. |
| `graphics.test.js` | Matrix algebra (transform / concat / rotate / inverse); CMYK & gray → RGB; arc → Bézier; and **rendering to SVG** — Y-flip device coords, `fill` vs **`eofill`** (`fill-rule`), `setrgbcolor`, gsave/grestore colour restore, stroke width tracking the CTM scale, and the full **`smoke.ps` fixture rendered end-to-end** (paths + even-odd + text). |
| `document.test.js` | **DSC parsing** (title, creator, bounding box, declared pages, fonts, page markers); the **multi-page document model** + `pageBBox`/`pageSize`; **per-page rendering** (page 1 vector, page 2 text); **`extractText`**; and **font** name→family/style mapping + monospace metrics. |
| `embed.test.js` | The **host-viewer renderer adapter** under a tiny pure-JS DOM shim: `load` builds the `.doc-page[data-page]` structure with page-sized canvases; `getPageWidth`/`getPageHeight`/`getPageCount`; `setScale` (CSS zoom); `scrollToPage`; `getPageText`; `destroy`; and the `EXT_MAP`/`RENDERER_LOADERS` registration. |
| `save.test.js` | **`save`/`restore`** (copy-on-write): rollback of array / string / dict mutations, dict-key removal, **getinterval window aliasing** (shared backing rolled back together), **nested** save/restore, and `typecheck`/no-active-save edge cases. |
| `type1.test.js` | **Type 1 fonts**: the eexec/charstring **cipher** round-trip; the **charstring interpreter** on hand-built glyphs (lines → triangle outline + advance width; `rrcurveto` → an exact cubic); and **`show` rendering an embedded glyph** to a filled outline. |
| `type1-loader.test.js` | The **font-program parser** on a synthetic Type 1 font: extracts FontName / FontMatrix / Encoding / CharStrings (decrypting back to the exact charstring), then renders it end-to-end through **`findfont` / `setfont` / `show`**. |
| `eexec.test.js` | **In-document `eexec`**: a `.ps` that defines a Type 1 font inline via `currentfile eexec` is decrypted and registered, execution **resumes after the encrypted block**, and the embedded glyph renders; plus streaming `currentfile`. |
| `truetype.test.js` | The **TrueType (sfnt) parser** on a synthetic in-memory TTF: `head`/`maxp`/`hmtx`/`loca`/`glyf`/`cmap` (format 4), `unitsPerEm`, `cmapLookup`, advance widths, a simple-glyph outline, and a quadratic→cubic curve. |
| `truetype-render.test.js` | The **TrueType render wiring**: `findfont` → `setfont` → `show` fills a glyph through the font's `cmapLookup` / `glyphOutline` / `advanceWidth`. |

## Pure-JS, zero-dependency philosophy

- Tests use only Node's **built-in** test runner and assertions — there is no test
  framework, no `package.json` dependency, nothing to install. `npm test` is just
  `node --test`.
- The engine under test touches **no browser or native APIs**, so the exact same
  modules that pass here run in a Web Worker and the browser playground (`index.html`).

## The headline test

```
deep recursion does NOT overflow the JS call stack — 20000 levels through ifelse
```

This is the proof of the architecture's central bet: because procedure calls execute
on the explicit, heap-backed **execution stack** (`engine/frames.js`) rather than the
host call stack, recursion that would kill a naive evaluator (~10k deep) runs fine.

## Planned fixtures

As the conformance harness lands, two **MIT-only** corpora plug in (already vendored on disk):

- **Language conformance** — [`tests/conformance/pstest/`](../tests/conformance/pstest)
  ([meientau/pstest](https://github.com/meientau/pstest), MIT): run its `*-test.ps`
  through the engine and diff stdout against the committed `*-expected.out` golden
  files. Running `pstest.ps` itself becomes an end-to-end engine test.
- **Graphics golden images** — [`tests/fixtures/smoke.ps`](../tests/fixtures/smoke.ps)
  (our authored MIT fixture): once the renderer exists, render **per-driver**
  (Canvas / Raster / SVG) and diff against committed PNGs/SVGs.

The famous samples (the Ghostscript tiger, golfer) are **excluded** — unknown
authorship / GPL-by-association — so the committed corpus stays single-license MIT.
See [ARCHITECTURE.md](ARCHITECTURE.md) for what each subsystem does.
