# LinoJava development waves

LinoJava is a real portable implementation of the L.in.oleum machine, built to
run the current Lino Noctis port in a browser. It is not a line-by-line source
interpreter and it is not a JavaScript rewrite of the game. The compiler keeps
Lino's workspace, registers, calls, control flow, integer wrapping, and host
boundary intact while lowering executable work to optimized browser code.

Development proceeds in meaningful product waves. A wave must unlock part of
the real compiler, iGUI, renderer, game, or browser host. Tiny maintenance edits
do not need the full ceremony.

## Wave loop

1. Run targeted reconnaissance against the current LinoJava implementation and
   the exact Lino sources that the wave intends to unlock. Record concrete
   syntax, data flow, browser constraints, and measured hot paths.
2. Have an architect consolidate that evidence into one bounded design. The
   design names the semantic invariants, interfaces, risks, smallest useful
   implementation, and acceptance checks before broad edits begin.
3. Implement the product slice with one owner. Prefer portable compiler and
   runtime mechanisms over game-specific JavaScript.
4. Review the finished diff for Lino semantic fidelity, browser safety,
   licensing boundaries, and accidental interpreter overhead.
5. Run focused tests for the changed language/runtime behavior and one actual
   browser or compiled-program smoke. Add broader tests only when the change
   truly crosses broad components.
6. Commit and push a stable wave. Publish Linoctis to Cloudflare when the wave
   creates a player-visible improvement; do not deploy every internal edit.

Reconnaissance, architecture, review, QA, and tests are iteration scaffolding,
not separate open-ended projects. Each role ends with decisions or defects that
the implementation owner can act on.

## Execution architecture

The shared front end resolves Lino programs into typed symbols, initialized
workspace, and an explicit control-flow graph. Execution backends consume that
same representation:

- Ahead-of-time JavaScript compiles whole basic blocks and is the portable
  execution backend for the complete game and renderer.
- Browser services such as display, input, audio, time, persistence, and files
  remain explicit host calls.
- Historical native x86 fragments require named portable intrinsics with exact
  semantics. They must never be ignored or approximated.

The browser host loads a compiled portable Lino image, exposes the same machine
state to persistence and debugging, and lets the Lino program draw and operate
the real iGUI. Temporary HTML and CSS chrome is not the final interface.

## Performance and fidelity gates

Every performance claim compares the same program, state, scene, resolution,
detail, and simulated tick behavior. Useful measurements include compile time,
frame time, host-call time, workspace traffic, block dispatches, and renderer
hot-path time. A faster result that changes visible buffers, machine state, RNG
consumption, or gameplay cadence is a regression.

Wave checks should normally include:

- exact final workspace and registers for a focused compiled Lino program;
- matching yield, call, return, and host-call order across execution backends;
- one timed hot loop large enough to expose dispatch or memory overhead;
- one browser smoke through the actual Linoctis host when that path changed.

The long-term gate is full Noctis at smooth presentation speed without reducing
the original workload. Ahead-of-time compilation must remove instruction-level
dispatch from renderer hot paths, and repeated native kernels may be compiled
or intrinsified only behind exact behavioral contracts. WebAssembly is optional
future research, not a product requirement or an excuse to delay JavaScript.
