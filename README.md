# LinoJava

LinoJava compiles L.in.oleum programs into fast, sandboxed browser modules.
The target is a playable browser build of Noctis, not a slow source-code
interpreter.

The current vertical slice is an ahead-of-time JavaScript backend. It resolves
symbols while building, groups source instructions into basic blocks, and emits
native JavaScript arithmetic over an `Int32Array` Lino workspace. The browser
host owns display, input, audio, persistence, and other `isocall` services. A
WebAssembly backend is the next performance stage and will share the same
front-end and host contract.

## Try it

```powershell
npm test
npm run build:demo
node .\bin\linojava.js .\examples\browser_probe.lino .\examples\browser_probe.js
```

The generated ES module exports `createProgram(host)`. Its `step()` method runs
compiled blocks until the program halts, reaches a yielding host call, or hits
the supplied safety budget. The host can read and write named Lino variables
through `get()` and `set()`.

## Current language surface

- 32-bit variables, constants, workspace allocation, registers A through E
- integer load/store, assignment, add, subtract, multiply, divide, AND, OR
- labels, signed comparisons, jumps, calls, `leave`, `end`, and `isocall`
- block-level compilation with explicit 32-bit wrapping

Unsupported syntax fails at compile time. In particular, embedded native x86
byte fragments are never ignored or approximated. Noctis currently uses those
fragments heavily, so the browser port will provide portable intrinsic forms
and a WebAssembly lowering for each one before claiming game compatibility.

## Project boundaries

This is an independent implementation based on documented L.in.oleum language
behaviour and black-box compiler results. It does not copy or modify the
original WPL-licensed compiler source. The playable website lives separately
in `Fabulu/Linoctissite` and pins a known LinoJava revision.
