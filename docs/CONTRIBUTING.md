# Contributing to Riposte

Thanks for your interest! Riposte is a **pure-JavaScript, zero-dependency,
single-license MIT** PostScript reader — contributions should keep it that way.

## Workflow

1. **Fork** the repository and create a branch off `main`.
2. Make your change, with tests.
3. Run `npm test` — everything must pass.
4. Open a **pull request** against `main`.

## Ground rules

- **Pure JS, zero dependencies.** No native modules, no WebAssembly, no runtime or
  `package.json` dependencies. The suite runs on `node --test` alone, and the engine
  must stay runnable in Node, a Web Worker, and the browser unchanged.
- **Keep the engine UI-agnostic.** No DOM or browser globals (`document`, `window`,
  `ImageData`, `Path2D`, `OffscreenCanvas`, `fetch`, `Blob`, …) in `engine/`. Those
  belong only in `CanvasDriver` and the UI/demo layer — that's what makes Riposte
  embeddable and headless (see the portability notes in [ARCHITECTURE.md](ARCHITECTURE.md)).
- **ESM** modules; match the style, naming, and comment density of the surrounding
  code.
- **Tests required.** New behaviour needs coverage; a bug fix needs a regression
  test. See [TESTS.md](TESTS.md). Tests must be pure JS (`node:test` + `node:assert`)
  — no frameworks, no network, no native tooling.
- **No host recursion in the evaluator.** Procedure execution and control flow run on
  the explicit execution stack (`engine/frames.js`); don't reintroduce host-language
  recursion into the eval loop — deep PostScript would overflow the JS call stack.

## Licensing — single-license MIT

- The project is **MIT** and aims to stay **single-license MIT**.
- By contributing, you agree your contribution is licensed under MIT.
- **Re-implement ideas; don't paste source.** Riposte's design is influenced by
  [lj2ps](https://github.com/Wiladams/lj2ps) (MIT) and
  [waavscript](https://github.com/wiladams/waavscript) (MIT). Porting an *idea* or
  *architecture* is fine and encouraged; **copying donor source verbatim is not**.
  Write any `engine/bootstrap/*.ps` ourselves rather than lifting another project's.
- **Don't add non-MIT dependencies or assets.** Icons are inlined
  [Phosphor](https://github.com/phosphor-icons/core) SVG (MIT). Reimplementing the
  PostScript language from Adobe's published spec is fine — a specification is free
  to implement; "PostScript" is Adobe's trademark, so use nominative naming and imply
  no endorsement.

## Where things live

[ARCHITECTURE.md](ARCHITECTURE.md) has the module map, the no-recursion execution
model, and the Driver rendering seam. Start there.
