import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalName } from "../src/compiler/lexer.js";
import { linkProject } from "../src/compiler/linker.js";
import { loadProject } from "../src/compiler/project-loader.js";
import { compileLinkedProject, emitStaticRunnerModule } from "../src/compiler/project-compiler.js";
import {
  createNoctisIntrinsics,
  NOCTIS_SERVICE_INTRINSIC_IDS as SERVICES,
} from "../src/intrinsics/noctis.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const LINO_ROOT = resolve(process.env.LINO_SOURCE_DIR ?? resolve(HERE, "../../linoleum"));
const FPSOFT = resolve(LINO_ROOT, "work/fp/fpsoft.txt");
const SCRATCH = [
  "xash", "xasl", "xasx", "xbsh", "xbsl", "xbsx", "xssh", "xssl", "xssx",
  "xase", "xbse", "xasd", "xass", "xbss", "xaso", "xasw", "xasb", "xasbit",
];
const OBSERVED = [
  "XS", "XE", "XMH", "XML", "YS", "YE", "YMH", "YML", ...SCRATCH,
  "XREJ", "XTOP", "XDEPTH", "XSTK", "XPAY", "xas test pointer", "xas test continuation",
];

function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state | 0;
  };
}

function normalized(next, zero = false) {
  if (zero) return [next() & 1, 0, 0, 0];
  return [next() & 1, 1 + (next() >>> 0) % 32766, next() | 0x80000000, next()];
}

function snapshot(program, at) {
  const { machine } = program;
  return {
    memory: Object.fromEntries(OBSERVED.map((name) => [name, machine.memory[at(name)] | 0])),
    registers: [machine.A, machine.B, machine.C, machine.D, machine.E, machine.X],
    stack: Array.from(machine.stack.slice(0, machine.depth)),
    depth: machine.depth,
    halted: machine.halted,
    pc: machine.pc,
  };
}

test("add/sub core services match canonical shared Lino state", {
  skip: !existsSync(FPSOFT) && `No sibling Linoleum checkout at ${LINO_ROOT}`,
}, async () => {
  const canonical = await readFile(FPSOFT, "utf8");
  const coreStart = canonical.indexOf('"XAddCore"');
  const coreEnd = canonical.indexOf("\n( ==================================================================== )", coreStart);
  assert.ok(coreStart >= 0 && coreEnd > coreStart, "canonical add/sub core boundaries");
  const source = `
    "variables"
      XS = 0; XE = 0; XMH = 0; XML = 0;
      YS = 0; YE = 0; YMH = 0; YML = 0;
      xash = 0; xasl = 0; xasx = 0;
      xbsh = 0; xbsl = 0; xbsx = 0;
      xssh = 0; xssl = 0; xssx = 0;
      xase = 0; xbse = 0; xasd = 0;
      xass = 0; xbss = 0; xaso = 0; xasw = 0; xasb = 0; xasbit = 0;
      XREJ = 0; XTOP = 0; XDEPTH = 0; XSTK = 0; XPAY = 0;
      xas test pointer = 0; xas test continuation = 0;
    "programme"
    ${canonical.slice(coreStart, coreEnd)}
    "xas test add"
      => XAddCore; [xas test continuation] = 11; end;
    "xas test sub"
      => XSubCore; [xas test continuation] = 22; end;
    "xas test indirect"
      => [xas test pointer]; [xas test continuation] = 33; end;
  `;
  const project = await loadProject(FPSOFT, { resolveSource() { return source; } });
  const linked = linkProject(project);
  const at = (name) => linked.symbols.get(canonicalName(name)).value;
  const handle = (name) => linked.labels.get(canonicalName(name)) + 1;
  const all = createNoctisIntrinsics();
  const implementations = {
    [SERVICES.xAddCore]: all[SERVICES.xAddCore],
    [SERVICES.xSubCore]: all[SERVICES.xSubCore],
  };
  const fallback = compileLinkedProject(linked, {}, { regionSize: 256 });
  let directCalls = 0;
  const direct = compileLinkedProject(linked, {}, {
    regionSize: 256,
    intrinsics: {
      [SERVICES.xAddCore](machine, directLinked) {
        directCalls += 1;
        implementations[SERVICES.xAddCore](machine, directLinked);
      },
      [SERVICES.xSubCore](machine, directLinked) {
        directCalls += 1;
        implementations[SERVICES.xSubCore](machine, directLinked);
      },
    },
  });
  const moduleSource = emitStaticRunnerModule(linked, implementations, { regionSize: 256 });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
  const generated = await import(moduleUrl);
  const precompiled = compileLinkedProject(linked, {}, {
    intrinsics: implementations,
    precompiledRunners: {
      create: generated.createRunners,
      instructionCount: generated.instructionCount,
      regionSize: generated.regionSize,
    },
  });

  const boundaries = [
    [[0, 0, 0, 0], [0, 0, 0, 0]],
    [[1, 0, 0, 0], [0, 16383, 0x80000000 | 0, 0]],
    [[0, 16383, 0x80000000 | 0, 0], [1, 0, 0, 0]],
    [[0, 16383, 0x80000000 | 0, 0], [0, 16383, 0x80000000 | 0, 0]],
    [[0, 16383, -1, -1], [0, 16383, -1, -1]],
    [[0, 20000, 0x80000000 | 0, 1], [1, 20000, 0x80000000 | 0, 0]],
    [[1, 20000, 0x80000000 | 0, 0], [0, 20000, 0x80000000 | 0, 1]],
    [[0, 20000, 0x80000000 | 0, 0], [0, 19999, -1, -1]],
    [[0, 20000, 0x80000000 | 0, 0], [0, 19998, -1, -1]],
    [[0, 20000, 0x80000000 | 0, 0], [0, 19996, -1, -1]],
    [[0, 20000, 0x80000000 | 0, 0], [0, 19992, -1, -1]],
    [[0, 20000, 0x80000000 | 0, 0], [0, 19984, -1, -1]],
    [[0, 20000, 0x80000000 | 0, 0], [0, 19968, -1, -1]],
    [[0, 20000, 0x80000000 | 0, 0], [0, 19933, -1, -1]],
    [[0, 20000, 0x80000000 | 0, 0], [0, 19932, -1, -1]],
  ];
  const next = generator(0x6a09e667);
  const cases = [...boundaries];
  for (let index = 0; index < 512; index += 1) {
    cases.push([normalized(next, index % 31 === 0), normalized(next, index % 37 === 0)]);
  }

  const seedProgram = (program, left, right, operation, seed) => {
    program.reset();
    const { machine } = program;
    ["XS", "XE", "XMH", "XML"].forEach((name, index) => { machine.memory[at(name)] = left[index]; });
    ["YS", "YE", "YMH", "YML"].forEach((name, index) => { machine.memory[at(name)] = right[index]; });
    const scratchNext = generator(seed);
    for (const name of SCRATCH) machine.memory[at(name)] = scratchNext();
    machine.memory[at("XREJ")] = 0x13579bdf;
    machine.memory[at("XTOP")] = 5;
    machine.memory[at("XDEPTH")] = 6;
    machine.memory[at("XSTK")] = -0x2468ace;
    machine.memory[at("XPAY")] = 0x10203040;
    machine.memory[at("xas test pointer")] = handle(operation === "add" ? "XAddCore" : "XSubCore");
    machine.memory[at("xas test continuation")] = -1;
    machine.A = 0x11111111;
    machine.B = 0x22222222;
    machine.C = 0x33333333;
    machine.D = 0x44444444;
    machine.E = 0x55555555;
    machine.X = 0x6661696c;
    machine.stack.set([17, -23, 42]);
    machine.depth = 3;
    machine.halted = false;
  };

  let ordinal = 0;
  for (const operation of ["add", "sub"]) {
    for (const [left, right] of cases) {
      const seed = (0xbb67ae85 ^ ordinal) | 0;
      for (const program of [fallback, direct, precompiled]) seedProgram(program, left, right, operation, seed);
      const caller = handle(operation === "add" ? "xas test add" : "xas test sub");
      fallback.machine.callCode(caller);
      direct.machine.callCode(caller);
      precompiled.machine.callCode(caller);
      const expected = snapshot(fallback, at);
      assert.deepEqual(snapshot(direct, at), expected, `${operation} direct case ${ordinal}`);
      assert.deepEqual(snapshot(precompiled, at), expected, `${operation} precompiled case ${ordinal}`);
      ordinal += 1;
    }
  }
  assert.equal(directCalls, cases.length * 2);

  seedProgram(direct, boundaries[3][0], boundaries[3][1], "add", 123);
  const beforeFallbackEntries = directCalls;
  direct.machine.callCode(handle("xas test indirect"));
  assert.equal(directCalls, beforeFallbackEntries, "indirect call executes linked Lino");
  direct.machine.callCode(handle("XAddCore"));
  assert.equal(directCalls, beforeFallbackEntries, "direct label entry executes linked Lino");

  seedProgram(fallback, boundaries[5][0], boundaries[5][1], "sub", 456);
  seedProgram(direct, boundaries[5][0], boundaries[5][1], "sub", 456);
  direct.machine.callCode(handle("XSubCore"));
  fallback.machine.callCode(handle("XSubCore"));
  assert.deepEqual(snapshot(direct, at), snapshot(fallback, at), "machine.callCode fallback state");
});
