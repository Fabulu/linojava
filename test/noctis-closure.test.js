import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { linkProject } from "../src/compiler/linker.js";
import { canonicalName } from "../src/compiler/lexer.js";
import { loadProject } from "../src/compiler/project-loader.js";
import {
  compileLinkedProject,
  emitStaticRunnerModule,
} from "../src/compiler/project-compiler.js";
import {
  createNoctisIntrinsics,
  NOCTIS_SERVICE_INTRINSIC_IDS as SERVICES,
} from "../src/intrinsics/noctis.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const LINO_ROOT = resolve(process.env.LINO_SOURCE_DIR ?? resolve(HERE, "../../linoleum"));
const GAME_ENTRY = resolve(LINO_ROOT, "work/vhgame.txt");

function candidates(specifier, importer, entry) {
  const name = specifier.replaceAll("\\", "/");
  if (importer === null || importer === undefined) return [resolve(specifier)];
  if (name.startsWith("/")) return [resolve(LINO_ROOT, "main/lib", name.slice(1))];
  const names = name.toLowerCase() === name ? [name] : [name, name.toLowerCase()];
  return names.flatMap((candidate) => [
    resolve(dirname(importer ?? entry), candidate),
    resolve(LINO_ROOT, "main/lib", candidate),
  ]);
}

async function firstFile(paths, suffixes) {
  for (const path of paths) {
    for (const suffix of suffixes) {
      const filename = `${path}${suffix}`;
      try { return { filename, data: await readFile(filename) }; } catch { /* try next */ }
    }
  }
  throw new Error(`Cannot resolve ${paths.join(", ")}`);
}

async function loadClosure(entry, entrySource = null) {
  return loadProject(entry, {
    async resolveSource(specifier, importer) {
      if (entrySource !== null && importer === null && resolve(specifier) === entry) {
        return { id: entry, source: entrySource };
      }
      const result = await firstFile(candidates(specifier, importer, entry), ["", ".txt"]);
      return { id: result.filename, source: result.data.toString("utf8") };
    },
    async resolveStockfile(specifier, importer) {
      const result = await firstFile(candidates(specifier, importer, entry), ["", ".tga"]);
      return { id: result.filename, data: new Uint8Array(result.data) };
    },
  });
}

async function instantiateStaticRunners(linked) {
  const source = emitStaticRunnerModule(linked, {}, { regionSize: 1024 });
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const generated = await import(url);
  const runners = generated.createRunners(() => {}, () => {});
  assert.equal(generated.instructionCount, linked.instructions.length);
  assert.equal(runners.length, Math.ceil(linked.instructions.length / generated.regionSize));
}

function exerciseDirectNoctisWorkspaces(linked) {
  for (const name of [
    "PJfwbase", "PGfwbase", "VHSfwbase", "PJmpbase", "PJipartbase",
    "PGipartbase", "PJrwfbase", "PGnwbase", "PGfpartbase", "VHGNDdensebase",
    "PJthird0", "PJthird1", "PGUVZ", "PGUVX", "PGUVY", "PGUVK4",
    "VHGNDnativecomplete", "VHGNDnormx", "VHGNDnormy", "VHGNDnormz",
    "VHGNDfaunamid", "VHGNDfaunabid", "VHGNDmanhattan",
  ]) {
    assert.equal(linked.symbols.has(canonicalName(name)), false, `${name} is not a source symbol`);
  }

  const machine = {
    memory: new Int32Array(linked.initialMemory),
    A: 0, B: 0, C: 0, D: 0, E: 0, X: 0,
  };
  const at = (name) => linked.symbols.get(canonicalName(name)).value;
  const intrinsics = createNoctisIntrinsics();
  const view = new DataView(machine.memory.buffer);
  const vertices = [
    [1.25, -2.5, 3.75],
    [4.5, 5.25, -6.75],
    [-7.5, 8.125, 9.5],
    [10.25, -11.5, 12.75],
  ];
  const polygon = at("vhcpoly");
  for (let vertex = 0; vertex < vertices.length; vertex += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      view.setFloat32((polygon + vertex * 3 + axis) * 4, vertices[vertex][axis], true);
    }
  }

  intrinsics[SERVICES.panelMappedQuadLoad](machine, linked);
  const fw = at("fw");
  const slots = [at("FSINX"), at("FSINY"), at("FSINZ")];
  for (let vertex = 0; vertex < vertices.length; vertex += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      assert.equal(
        view.getFloat64((fw + slots[axis] * 2 + vertex * 2) * 4, true),
        vertices[vertex][axis],
      );
    }
  }

  machine.memory[at("PJpreproject")] = 1;
  machine.memory[at("PJnrv")] = 4;
  machine.memory[at("PJdoflag")] = 0;
  intrinsics[SERVICES.polymap](machine, linked);
  assert.equal(machine.memory[at("PJgate")], 1);
  intrinsics[SERVICES.surroundingBorder](machine, linked);

  const birdRecord = at("VHGNDbirddata");
  const mammalRecord = at("VHGNDanidata");
  const bird = linked.labels.get(canonicalName("VHGND render birds")) + 1;
  const mammal = linked.labels.get(canonicalName("VHGND render animals")) + 1;
  const calls = [];
  machine.callCode = (handle) => {
    calls.push(handle);
    const record = handle === bird ? birdRecord : mammalRecord;
    machine.memory[record] = handle === bird ? 5 * 16384 : -1;
    machine.memory[record + 1] = handle === bird ? 6 * 16384 : 400 * 16384;
  };
  machine.memory[at("GRiptype")] = 3;
  machine.memory[at("VHGNDx")] = 4;
  machine.memory[at("VHGNDz")] = 3;
  machine.memory[at("VHGNDpopulation")] = 3;
  machine.memory[at("VHGNDfaunatypes")] = 1;
  machine.memory[at("VHGNDfaunatypes") + 1] = 2;
  machine.memory[at("VHGNDfaunatypes") + 2] = 5;
  machine.memory[at("VHGNDfaunatiles")] = 604;
  machine.memory[at("VHGNDfaunatiles") + 2] = 604;
  intrinsics[SERVICES.terrainTileFauna](machine, linked);
  assert.deepEqual(calls, [bird, mammal]);
  assert.equal(machine.memory[at("VHGNDfaunatiles")], 1205);
  assert.equal(machine.memory[at("VHGNDfaunatiles") + 2], 39800);
  assert.equal(machine.memory[at("VHGNDfaunaid")], 3);
  assert.equal(machine.memory[at("VHGNDmii")], 1);
  assert.equal(machine.memory[at("VHGNDbii")], 1);
  assert.equal(machine.memory[at("VHGNDanisingle")], 0);
}

function firstMemoryDifference(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return -1;
}

function assertMachineStateEqual(actual, expected, label) {
  assert.deepEqual(
    [actual.A, actual.B, actual.C, actual.D, actual.E, actual.X, actual.depth],
    [expected.A, expected.B, expected.C, expected.D, expected.E, expected.X, expected.depth],
    `${label} terminal machine state`,
  );
  const difference = firstMemoryDifference(actual.memory, expected.memory);
  assert.equal(
    difference,
    -1,
    difference < 0 ? `${label} memory` : `${label} memory differs at word ${difference}: ${actual.memory[difference]} != ${expected.memory[difference]}`,
  );
}

function exerciseVhguiServices(linked) {
  const allIntrinsics = createNoctisIntrinsics();
  const compose = allIntrinsics[SERVICES.vhguiCompose];
  const fixed2x = allIntrinsics[SERVICES.vhguiFixed2x];
  assert.equal(typeof compose, "function");
  assert.equal(typeof fixed2x, "function");

  const fallbackIntrinsics = { ...allIntrinsics };
  delete fallbackIntrinsics[SERVICES.vhguiCompose];
  delete fallbackIntrinsics[SERVICES.vhguiFixed2x];
  let composeCalls = 0;
  let fixed2xCalls = 0;
  const directIntrinsics = {
    ...allIntrinsics,
    [SERVICES.vhguiCompose](machine, directLinked) {
      composeCalls += 1;
      compose(machine, directLinked);
    },
    [SERVICES.vhguiFixed2x](machine, directLinked) {
      fixed2xCalls += 1;
      fixed2x(machine, directLinked);
    },
  };
  const fallback = compileLinkedProject(linked, {}, { intrinsics: fallbackIntrinsics });
  const direct = compileLinkedProject(linked, {}, { intrinsics: directIntrinsics });
  const at = (name) => linked.symbols.get(canonicalName(name)).value;
  for (const program of [fallback, direct]) {
    const { machine } = program;
    machine.A = 11;
    machine.B = -22;
    machine.C = 33;
    machine.D = -44;
    machine.E = 55;
    machine.X = 0x646f6e65;
    machine.memory[at("Display Width")] = 640;
    machine.memory[at("Display Height")] = 400;
    const workArea = at("Work Area");
    machine.memory.set([0, 0, 639, 399], workArea);
    const source = at("nw") + at("RADPT");
    const palette = at("pal");
    for (let index = 0; index < 256; index += 1) {
      machine.memory[palette + index] = Math.imul(index, 0x010307) | 0;
    }
    for (let index = 0; index < 64_000; index += 1) {
      machine.memory[source + index] = (index * 37 + (index >>> 8)) & 255;
    }
  }

  const call = (program, name) => program.machine.callCode(
    linked.labels.get(canonicalName(name)) + 1,
    20_000_000,
  );
  call(fallback, "VHGUI prepare");
  call(direct, "VHGUI prepare");
  assert.equal(composeCalls, 1);
  assertMachineStateEqual(direct.machine, fallback.machine, "VHGUI compose service");

  call(fallback, "VHGUI present");
  call(direct, "VHGUI present");
  assert.equal(fixed2xCalls, 1);
  assertMachineStateEqual(direct.machine, fallback.machine, "VHGUI fixed-2x service");
}

function exercisePhysicalPanelGlyph(linked) {
  const intrinsics = createNoctisIntrinsics();
  const program = compileLinkedProject(linked, {}, { intrinsics });
  const { machine } = program;
  const at = (name) => linked.symbols.get(canonicalName(name)).value;
  const call = (name, budget = 20_000_000) => machine.callCode(
    linked.labels.get(canonicalName(name)) + 1,
    budget,
  );
  const view = new DataView(machine.memory.buffer);
  const slot = (name) => view.getFloat64(
    (at("fw") + at(name) * 2) * 4,
    true,
  );

  call("SP build rgt");
  call("SP riga init");
  call("PGF constants");
  call("VH view init");

  assert.equal(slot("FSINVD"), Math.fround(1 / 210));
  assert.equal(slot("FSXCO"), Math.fround(16 / 210));
  assert.equal(slot("FSYCO"), Math.fround(16 / 210));

  machine.memory[at("VHVcamxi")] = 525;
  machine.memory[at("VHVcamyi")] = 0;
  machine.memory[at("VHVcamzi")] = -740;
  machine.memory[at("VHValpha")] = 0;
  machine.memory[at("VHVbeta")] = 0;
  call("VH set view");

  const character = "S".codePointAt(0);
  const glyph = at("digimap2") + (character - 32) * 36;
  machine.memory.fill(-1, glyph, glyph + 36);
  machine.memory[at("VHPchar")] = character;
  machine.memory[at("VHPchcol")] = 152;
  machine.memory[at("VHPline")] = 0;
  machine.memory[at("VHPcx4")] = 2100;

  const framebuffer = at("nw") + at("SADPT");
  const before = machine.memory.slice(framebuffer, framebuffer + 320 * 200);
  call("VHP digit row0");
  const changed = machine.memory
    .subarray(framebuffer, framebuffer + 320 * 200)
    .reduce((count, value, index) => count + (value !== before[index] ? 1 : 0), 0);
  const texturePixels = machine.memory
    .subarray(at("nw") + at("RPSM"), at("nw") + at("RPSM") + 9216)
    .reduce((count, value) => count + ((value & 255) !== 0 ? 1 : 0), 0);
  assert.ok(texturePixels > 0, "physical panel glyph populates its mapped texture");
  assert.ok(changed > 0, "physical panel glyph reaches the destination framebuffer");
}

test("current shared Noctis and NIVGEN closures emit static runners", {
  skip: !existsSync(GAME_ENTRY) && `No sibling Linoleum checkout at ${LINO_ROOT}`,
}, async () => {
  const game = await loadClosure(GAME_ENTRY);
  assert.equal(game.modules.length, 74);
  assert.equal(game.stockfiles.length, 23);
  const linkedGame = linkProject(game);
  exerciseDirectNoctisWorkspaces(linkedGame);
  exerciseVhguiServices(linkedGame);
  exercisePhysicalPanelGlyph(linkedGame);
  await instantiateStaticRunners(linkedGame);

  let source = (await readFile(GAME_ENTRY, "utf8")).replaceAll("\r\n", "\n");
  const libraries = "vhspace; vhstar; vhground; vhcapsule;";
  const nivLibraries = "vhspace; vhstar; vhground; vhnivgen; vhcapsule;";
  const entry = "\t=> VHG run;\n\tend;";
  const nivEntry = "\t=> VHNIV run;\n\tend;";
  assert.equal(source.split(libraries).length, 2, "vhgame NIVGEN library splice remains unique");
  assert.equal(source.split(entry).length, 2, "vhgame NIVGEN entry splice remains unique");
  source = source
    .replace(libraries, nivLibraries)
    .replace("program name = { vhgame };", "program name = { nivtestmain };")
    .replace(entry, nivEntry);

  const virtualEntry = resolve(LINO_ROOT, "work/nivtestmain-linojava.txt");
  const nivgen = await loadClosure(virtualEntry, source);
  assert.equal(nivgen.modules.length, 75);
  assert.equal(nivgen.stockfiles.length, 23);
  assert.ok(nivgen.modules.some((module) => module.id.toLowerCase().endsWith("vhnivgen.txt")));
  await instantiateStaticRunners(linkProject(nivgen));
});
