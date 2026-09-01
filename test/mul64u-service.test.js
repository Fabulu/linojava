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
const MUL64_FRAGMENT = resolve(LINO_ROOT, "work/mul64frag.txt");
const SCRATCH = [
  "m64lo", "m64hi", "mlxl", "mlxh", "mlyl", "mlyh",
  "mlp0", "mlp1", "mlp2", "mlp3", "mlmid", "mltmp",
];
const OBSERVED = [
  "m64a", "m64b", ...SCRATCH, "mul test pointer", "mul test continuation",
  "mul test canary one", "mul test canary two",
];

function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state | 0;
  };
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

function expectedProduct(left, right, signed) {
  const product = signed
    ? BigInt(left | 0) * BigInt(right | 0)
    : BigInt(left >>> 0) * BigInt(right >>> 0);
  const wrapped = BigInt.asUintN(64, product);
  return [Number(wrapped & 0xffffffffn) | 0, Number(wrapped >> 32n) | 0];
}

test("Mul64u service matches canonical shared Lino state and callers", {
  skip: !existsSync(MUL64_FRAGMENT) && `No sibling Linoleum checkout at ${LINO_ROOT}`,
}, async () => {
  const canonical = await readFile(MUL64_FRAGMENT, "utf8");
  const programme = canonical.indexOf('"programme"');
  const routineStart = canonical.indexOf('"Mul64u"', programme);
  assert.ok(programme >= 0 && routineStart > programme, "canonical Mul64u boundary");
  const source = `
    "constants" M16 = 65535;
    "variables"
      m64a = 0; m64b = 0; m64lo = 0; m64hi = 0;
      mlxl = 0; mlxh = 0; mlyl = 0; mlyh = 0;
      mlp0 = 0; mlp1 = 0; mlp2 = 0; mlp3 = 0; mlmid = 0; mltmp = 0;
      mul test pointer = 0; mul test continuation = 0;
      mul test canary one = 0; mul test canary two = 0;
    "programme"
    "mul test unsigned"
      => Mul64u; [mul test continuation] = 11; end;
    "mul test signed"
      => Mul64s; [mul test continuation] = 22; end;
    "mul test indirect"
      => [mul test pointer]; [mul test continuation] = 33; end;
    ${canonical.slice(routineStart)}
  `;
  const project = await loadProject(MUL64_FRAGMENT, { resolveSource() { return source; } });
  const linked = linkProject(project);
  const at = (name) => linked.symbols.get(canonicalName(name)).value;
  const handle = (name) => linked.labels.get(canonicalName(name)) + 1;
  const all = createNoctisIntrinsics();
  const implementation = all[SERVICES.mul64u];
  const intrinsics = { [SERVICES.mul64u]: implementation };
  const fallback = compileLinkedProject(linked, {}, { regionSize: 256 });
  let directCalls = 0;
  const direct = compileLinkedProject(linked, {}, {
    regionSize: 256,
    intrinsics: {
      [SERVICES.mul64u](machine, directLinked) {
        directCalls += 1;
        implementation(machine, directLinked);
      },
    },
  });
  const moduleSource = emitStaticRunnerModule(linked, intrinsics, { regionSize: 256 });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
  const generated = await import(moduleUrl);
  const precompiled = compileLinkedProject(linked, {}, {
    intrinsics,
    precompiledRunners: {
      create: generated.createRunners,
      instructionCount: generated.instructionCount,
      regionSize: generated.regionSize,
    },
  });

  const edges = [
    0, 1, -1, 0xffff, 0x10000, 0x7fffffff, -0x80000000, -2,
  ];
  const cases = edges.flatMap((left) => edges.map((right) => [left, right]));
  const next = generator(0x6a09e667);
  for (let index = 0; index < 512; index += 1) cases.push([next(), next()]);

  const seedProgram = (program, left, right, seed, pointer = "Mul64u") => {
    program.reset();
    const { machine } = program;
    machine.memory[at("m64a")] = left;
    machine.memory[at("m64b")] = right;
    const scratchNext = generator(seed);
    for (const name of SCRATCH) machine.memory[at(name)] = scratchNext();
    machine.memory[at("mul test pointer")] = handle(pointer);
    machine.memory[at("mul test continuation")] = -1;
    machine.memory[at("mul test canary one")] = 0x13579bdf;
    machine.memory[at("mul test canary two")] = -0x2468ace;
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
  for (const [caller, signed] of [["mul test unsigned", false], ["mul test signed", true]]) {
    for (const [left, right] of cases) {
      const seed = (0xbb67ae85 ^ ordinal) | 0;
      for (const program of [fallback, direct, precompiled]) seedProgram(program, left, right, seed);
      fallback.machine.callCode(handle(caller));
      direct.machine.callCode(handle(caller));
      precompiled.machine.callCode(handle(caller));
      const expected = snapshot(fallback, at);
      assert.deepEqual(snapshot(direct, at), expected, `${caller} direct case ${ordinal}`);
      assert.deepEqual(snapshot(precompiled, at), expected, `${caller} precompiled case ${ordinal}`);
      const [low, high] = expectedProduct(left, right, signed);
      assert.equal(expected.memory.m64lo, low, `${caller} low case ${ordinal}`);
      assert.equal(expected.memory.m64hi, high, `${caller} high case ${ordinal}`);
      ordinal += 1;
    }
  }
  assert.equal(directCalls, cases.length * 2);

  const beforeFallbackEntries = directCalls;
  for (const program of [fallback, direct]) seedProgram(program, edges[6], edges[2], 123);
  fallback.machine.callCode(handle("mul test indirect"));
  direct.machine.callCode(handle("mul test indirect"));
  assert.equal(directCalls, beforeFallbackEntries, "indirect call executes linked Lino");
  assert.deepEqual(snapshot(direct, at), snapshot(fallback, at), "indirect fallback state");

  for (const program of [fallback, direct]) seedProgram(program, edges[5], edges[7], 456);
  fallback.machine.callCode(handle("Mul64u"));
  direct.machine.callCode(handle("Mul64u"));
  assert.equal(directCalls, beforeFallbackEntries, "direct label entry executes linked Lino");
  assert.deepEqual(snapshot(direct, at), snapshot(fallback, at), "machine.callCode fallback state");
});
