# LinoJava

LinoJava compiles L.in.oleum programs into fast, sandboxed browser modules.
The target is a playable browser build of Noctis, not a slow source-code
interpreter.

The current vertical slice is an ahead-of-time JavaScript backend. It resolves
symbols while building, groups source instructions into basic blocks, and emits
native JavaScript arithmetic over an `Int32Array` Lino workspace. The browser
host owns display, input, audio, persistence, and other `isocall` services.
JavaScript is the product backend: performance work compiles larger Lino regions
into optimized JavaScript and replaces historical native fragments with exact
portable JavaScript intrinsics instead of interpreting individual operations.

The browser loader compiles ad hoc source through a generated `blob:` module,
so sites using Content Security Policy must allow `blob:` in `script-src`.
Strict deployments can instead generate the ES module with the command-line
compiler during their build and serve that static module without `blob:`.

## Try it

```powershell
npm test
npm run build:demo
node .\bin\linojava.js .\examples\browser_probe.lino .\examples\browser_probe.js
```

The generated ES module exports `createProgram(host)`. Its `step()` method runs
compiled blocks until the program halts, reaches a yielding host call, or hits
the supplied safety budget. The host can read and write named Lino variables
through `get()` and `set()`. Versioned `snapshot()` and `restore()` methods
capture the complete workspace, registers, programme counter, and call stack
for browser persistence.

## Current language surface

- 32-bit variables, constants, workspace allocation, registers A through E
- integer load/store, assignment, add, subtract, multiply, divide, AND, OR
- labels, signed comparisons, jumps, calls, `leave`, `end`, and `isocall`
- block-level compilation with explicit 32-bit wrapping
- period-aware source lexing with nested comments and braced data
- recursive library and stockfile project loading through resolver callbacks

Unsupported syntax fails at compile time. In particular, embedded native x86
byte fragments are never ignored or approximated. Noctis currently uses those
fragments heavily, so the browser port will provide portable intrinsic forms
for each one before claiming game compatibility.

The real project compiler now resolves and executes the unmodified
`examples/iGUIcli.txt` graph from the Linoleum tree: 14 modules, 23 stockfile
assets, 4,609 programme statements, and 714 labels. It uses the documented
32-bit IsoKernel layout and reaches the first real `RETRACE` after the expected
23 stockfile reads and one directory call. The 400 by 300 Lino framebuffer is
deterministic and non-empty.

Use `compileProject(entry, resolvers, options)` for linked Lino projects. The
resolver callbacks can fetch source and stockfiles from URLs, browser `File`
objects, a virtual filesystem, or a build tool. The older `compile(source)`
entry remains available for small single-source programs. Browser presentation
of the real iGUI framebuffer and pointer-driven menu is live at
[linoctis.pages.dev](https://linoctis.pages.dev/).

The current Noctis closure loads 73 modules and lowers to 56,945 JavaScript
instructions. All ordinary statements now parse, including unsigned apostrophe
arithmetic and float predicates. Its 204 embedded native fragment occurrences
map to 202 explicit intrinsic IDs rather than hidden interpreter operations.
Portable JavaScript now implements 97 of those IDs across integer, framebuffer,
page-memory, raster, projection, x87, geometry, and conversion families. The
other 105 remain explicit runtime errors if an unported path reaches them.

A focused full-game boot advances through initialization, rendering, repeated
`RETRACE` calls, and the frame clock's real millisecond `SLEEP` contract. The
default path ran for 160 retraces without entering an unsupported intrinsic.
This is execution evidence for that path, not a claim that every game mode is
already supported. Yield results carry the requested sleep duration so browser
hosts can resume on the correct clock instead of spinning.

## Project boundaries

This is an independent implementation based on documented L.in.oleum language
behaviour and black-box compiler results. It does not copy or modify the
original WPL-licensed compiler source. The playable website lives separately
in `Fabulu/Linoctissite` and pins a known LinoJava revision.

Development uses bounded product waves with targeted reconnaissance, an
architecture consolidation, implementation, review, focused QA, and tests.
The complete iteration and performance contract is in
[DEVELOPMENT.md](DEVELOPMENT.md). The consolidated JavaScript compiler,
machine, browser-loader, and real-iGUI design is in
[ARCHITECTURE.md](ARCHITECTURE.md).
