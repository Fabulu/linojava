# LinoJava architecture

## Product decision

LinoJava is an optimized JavaScript implementation of the L.in.oleum machine.
It compiles Lino into JavaScript ahead of execution; it does not redispatch each
source operation through a JavaScript interpreter, emulate x86, or rewrite a
Lino application by hand.

A web author can place Lino source directly on a page:

```html
<script type="text/lino" src="game.txt"></script>
<script type="module" src="./linojava/auto.js"></script>
```

The browser loader fetches and compiles the source, caches generated JavaScript
by a source and compiler-options hash in IndexedDB, creates the Lino machine,
and announces the running instance with `lino-ready` and
`lino-programs-ready` events. A deployment can precompile the same source for a
faster first load without changing its semantics or host API.

Ad hoc module loading uses a `blob:` URL and therefore requires `blob:` in the
site's `script-src` Content Security Policy. A strict-CSP deployment uses the
same compiler at build time and serves the generated ES module statically. The
cache identity includes the emitter revision and verifies the complete source
payload even when the browser lacks SHA-256 support.

## Compiler and machine

The present vertical slice resolves declarations and labels, lowers Lino blocks
to JavaScript, stores workspace in `Int32Array`, keeps A through E as local
32-bit values, and preserves program state across snapshots. Local Lino loops
execute as native JavaScript loops, sequential blocks fall through without a
new dispatcher pass, and returns use a growable typed stack.

The production compiler is being expanded into these layers:

```text
project loader -> lexer/parser -> linker/layout -> control-flow IR
               -> JavaScript optimizer/emitter -> browser Lino machine
```

The project loader must recursively resolve `libraries` and `stockfile`
periods. The parser must support Lino's whitespace-insensitive names, braced
data, constructor expressions, vectors, services, computed addresses, signed
and unsigned operations, and its shared call/data stack. The linker lays out
initialized data, the IsoKernel communication area, and application workspace
in one `ArrayBuffer` with signed, unsigned, floating-point, and byte views.

`end`, `fail`, and `leave` retain their distinct return status semantics.
IsoKernel call success is independent from whether the browser scheduler yields
the machine. Unknown native fragments are diagnostics or hard errors; exact
portable JavaScript intrinsics replace the known historical kernels.

## Browser boundary

Lino draws its own framebuffer and the real iGUI. The host presents that memory
to Canvas or WebGL and supplies IsoKernel services for input, display, time,
sleep, audio, persistence, and a browser-backed virtual filesystem. HTML and
CSS may frame a bring-up build but cannot substitute for Lino-rendered chrome.

The public APIs are:

- `compile(source, options)` for static JavaScript module generation;
- `compileInBrowser(source, options)` for cached ad hoc compilation;
- `createProgramFromSource(source, host, options)`;
- `createProgramFromElement(element, host, options)`;
- `bootLinoScripts(options)` for all `text/lino` elements on a page.

## Performance design

The first recon measured the original `switch(pc)` engine at roughly 65 to 71
ms per ten million warmed blocks and an equivalent direct JavaScript loop at 29
to 32 ms. LinoJava therefore forms bounded JavaScript regions, uses local
fallthrough and loops where control flow is statically safe, retains a fallback
dispatcher at region boundaries, and will selectively inline small leaf
routines. Large applications are split before browser parser and JIT limits.

Direct addresses become constant typed-array indices. Integer operations use
32-bit JavaScript coercions and `Math.imul`; exact float stages use typed views
and `Math.fround`. Bulk memory and rendering kernels use exact JavaScript
intrinsics over typed arrays. Workers and `OffscreenCanvas` may isolate the
whole machine for responsiveness, but unordered instruction-level parallelism
is not permitted.

## First complete product wave

The first complete browser wave ends at the actual iGUI, not the temporary
probe. It must compile and link unmodified `examples/iGUIcli.txt`, its iGUI and
`/gen` library closure, and stockfile assets; execute `Initialize Integrated
GUI` through the first RETRACE; present deterministic Lino-drawn chrome; and
accept a mapped pointer click that changes the Lino framebuffer. Analysis of
the full Noctis entry must enumerate every unresolved intrinsic instead of
stopping at the first native fragment.
