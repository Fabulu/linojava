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

The project loader already resolves the unmodified `examples/iGUIcli.txt`
source graph from the Linoleum tree: 14 modules, 23 stockfile assets, and 7,200
statements. Module identity follows Lino's case-insensitive naming, so `Region`
and `region` resolve to one library. The next frontend stage links those periods
and declarations into the executable JavaScript IR; loading the graph alone is
not yet an iGUI boot. The current layout pass resolves all 117 language,
project, and stockfile constants, encodes 2,537 initialized units, and measures
663,356 application-workspace units. Its remaining 54 initialized-data
relocations are typed as 31 programme labels and 23 workspace addresses, with
no unknown data expression silently replaced by zero. Custom resolvers may
provide `moduleIdentity` and `stockfileIdentity` functions when their storage
has different alias rules.

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
