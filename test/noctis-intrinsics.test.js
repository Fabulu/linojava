import assert from "node:assert/strict";
import test from "node:test";

import { canonicalName } from "../src/compiler/lexer.js";
import { createNoctisIntrinsics, NOCTIS_INTRINSIC_IDS as IDS } from "../src/intrinsics/noctis.js";

function fixture() {
  const names = [
    "UAFsrc", "UAFdst", "UAFwidth", "UAFheight", "UAFgap",
    "VHGUIsrc", "VHGUIpal", "VHGUIdst", "VHGUIrow2", "VHGUIdstp",
    "VHGUIrow2p", "VHGUIgap", "VHGUIdw", "VHGUIdh", "VHGUIsy",
    "VHGUIyacc", "VHGUIy", "PGdi", "PGval", "SADPT", "VHTmaskbase",
    "VHTcyclebase", "nw",
    "VHTsmoothbase", "SPcpfrom", "SPcpto", "PVj", "SCcx", "SCdi",
    "SCal", "SCzf", "DBal", "CSbyte", "SGpi", "SGpf", "SGgx", "SGgy",
    "SGa", "SGb", "SGt", "DBdi", "DBcx", "DBdl",
    "EWminy", "EWmaxy", "PGfpartbase", "PGipartbase", "PGi", "PGnwbase",
    "RPBG", "SPdi", "SPax", "SPdx", "SPcl", "SPbp", "SPsi", "PGtexoff",
    "SPtinta", "SPn", "FCW",
  ];
  const symbols = new Map(names.map((name, index) => [
    canonicalName(name),
    { name, value: index + 1 },
  ]));
  return {
    linked: { symbols },
    machine: {
      memory: new Int32Array(2_000_000),
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0,
      X: 0,
    },
    at(name) { return symbols.get(canonicalName(name)).value; },
  };
}

test("Noctis integer and framebuffer intrinsics preserve the native kernels", () => {
  const intrinsic = createNoctisIntrinsics();
  const { linked, machine, at } = fixture();
  const memory = machine.memory;
  const run = (id) => intrinsic[id](machine, linked);
  linked.symbols.get(canonicalName("nw")).value = 0;

  memory[at("UAFsrc")] = 100;
  memory[at("UAFdst")] = 102;
  memory[at("UAFwidth")] = 4;
  memory[at("UAFheight")] = 1;
  memory[at("UAFgap")] = 0;
  memory.set([1, 2, 3, 4], 100);
  run(IDS.copyRegion);
  assert.deepEqual([...memory.slice(102, 106)], [1, 2, 1, 2]);

  machine.A = -1;
  machine.B = 2;
  run(IDS.multiplyUnsigned);
  assert.equal(machine.A >>> 0, 0xfffffffe);
  assert.equal(machine.D >>> 0, 1);
  machine.A = -3;
  machine.B = 5;
  run(IDS.multiplySigned);
  assert.equal(machine.A, -15);
  assert.equal(machine.D, -1);

  linked.symbols.get(canonicalName("SADPT")).value = 200;
  memory[at("PGdi")] = 0x10003;
  memory[at("PGval")] = 0x123;
  run(IDS.pageStore);
  assert.equal(memory[203], 0x23);
  memory[203] = 0x1ab;
  run(IDS.pageLoad);
  assert.equal(memory[at("PGval")], 0xab);

  memory[at("VHGUIsrc")] = 1_000;
  memory[at("VHGUIpal")] = 70_000;
  memory[at("VHGUIdst")] = 80_000;
  for (let index = 0; index < 256; index += 1) memory[70_000 + index] = index * 3;
  memory[1_000] = 257;
  memory[1_000 + 63_999] = 255;
  run(IDS.expandIndexed);
  assert.equal(memory[80_000], 3);
  assert.equal(memory[80_000 + 63_999], 765);

  memory[at("VHGUIsrc")] = 150_000;
  memory[at("VHGUIdst")] = 220_000;
  memory[at("VHGUIrow2")] = 220_700;
  memory[at("VHGUIdstp")] = 500_000;
  memory[at("VHGUIrow2p")] = 500_700;
  memory[at("VHGUIgap")] = 760 * 4;
  memory[150_000] = 0x112233;
  memory[150_000 + 319] = 0x445566;
  memory[150_000 + 320] = 0x778899;
  run(IDS.scale2x);
  assert.deepEqual([...memory.slice(220_000, 220_002)], [0x112233, 0x112233]);
  assert.deepEqual([...memory.slice(220_638, 220_640)], [0x445566, 0x445566]);
  assert.deepEqual([...memory.slice(220_700, 220_702)], [0x112233, 0x112233]);
  assert.deepEqual([...memory.slice(221_400, 221_402)], [0x778899, 0x778899]);
  assert.deepEqual([...memory.slice(500_000, 500_002)], [0x112233, 0x112233]);

  memory[at("VHTmaskbase")] = 900_000;
  memory[900_000] = 0xff;
  memory[900_000 + 58_239] = 0x82;
  run(IDS.maskStarPage);
  assert.equal(memory[900_000], 0x7f);
  assert.equal(memory[900_000 + 58_239], 0x42);

  memory[at("VHTcyclebase")] = 1_000_000;
  memory[1_000_000] = 0x7f;
  memory[1_000_000 + 64_799] = 0xc0;
  run(IDS.cycleStarTexture);
  assert.equal(memory[1_000_000], 0x40);
  assert.equal(memory[1_000_000 + 64_799], 0xc1);

  memory[at("SPcpfrom")] = 1_100_000;
  memory[at("SPcpto")] = 1_100_002;
  memory[at("PVj")] = 4;
  memory.set([8, 9, 10, 11], 1_100_000);
  run(IDS.copyPlanetView);
  assert.deepEqual([...memory.slice(1_100_002, 1_100_006)], [8, 9, 8, 9]);

  memory[at("VHTsmoothbase")] = 1_200_000;
  memory.fill(4, 1_200_000, 1_200_000 + 58_000);
  run(IDS.smoothStarPage);
  assert.equal(memory[1_200_320], 4);
  assert.equal(memory[1_200_321], 5);

  linked.symbols.get(canonicalName("SADPT")).value = 1_300_000;
  memory.set([1, 2, 3, 3], 1_300_010);
  memory[at("SCdi")] = 10;
  memory[at("SCcx")] = 4;
  memory[at("SCal")] = 3;
  run(IDS.scanNotEqual);
  assert.equal(memory[at("SCdi")], 13);
  assert.equal(memory[at("SCcx")], 1);
  assert.equal(memory[at("SCzf")], 1);
  assert.equal(memory[at("PGdi")], 12);

  memory[at("SCdi")] = 12;
  memory[at("SCcx")] = 2;
  run(IDS.scanEqual);
  assert.equal(memory[at("SCdi")], 14);
  assert.equal(memory[at("SCcx")], 0);
  assert.equal(memory[at("SCzf")], 1);

  memory[at("SCdi")] = 0xffff;
  memory[at("SCcx")] = 2;
  memory[at("DBal")] = 0x1aa;
  run(IDS.fillBytes);
  assert.equal(memory[1_300_000 + 0xffff], 0xaa);
  assert.equal(memory[1_300_000], 0xaa);
  assert.equal(memory[at("SCdi")], 1);
  assert.equal(memory[at("PGdi")], 0);

  memory[at("SGpi")] = 5;
  memory[at("SGpf")] = 646;
  run(IDS.traceVertical);
  assert.equal(memory[1_300_005], 0xff);
  assert.equal(memory[1_300_325], 0xff);
  assert.equal(memory[1_300_645], 0xff);
  assert.equal(memory[at("SGpi")], 965);

  memory[at("DBdi")] = 1000;
  memory[at("DBcx")] = 2;
  memory[at("DBdl")] = 10;
  memory[1_300_999] = 60;
  run(IDS.fillFlare);
  assert.deepEqual([...memory.slice(1_301_000, 1_301_002)], [62, 62]);

  memory[at("DBdi")] = 2000;
  memory[at("DBcx")] = 2;
  memory[1_302_000] = 0xff;
  memory[1_302_001] = 4;
  memory[1_301_679] = 7;
  run(IDS.fillHalo);
  assert.equal(memory[1_302_000], 0x47);
  assert.equal(memory[1_302_001], 0x45);

  memory[at("DBdi")] = 3000;
  memory[at("DBcx")] = 1;
  memory[1_302_679] = 0xff;
  memory[1_302_358] = 9;
  run(IDS.fillHaloFallback);
  assert.equal(memory[1_303_000], 0x49);

  memory[at("EWminy")] = 2;
  memory[at("EWmaxy")] = 3;
  memory[at("PGfpartbase")] = 1_500_000;
  memory[at("PGipartbase")] = 1_500_100;
  run(IDS.initializePolygonRows);
  assert.deepEqual([...memory.slice(1_500_002, 1_500_004)], [5, 5]);
  assert.deepEqual([...memory.slice(1_500_102, 1_500_104)], [311, 311]);
  assert.equal(memory[at("PGi")], 4);

  linked.symbols.get(canonicalName("RPBG")).value = 100;
  linked.symbols.get(canonicalName("SADPT")).value = 1000;
  memory[at("PGnwbase")] = 1_400_000;
  memory[at("SPdi")] = 0;
  memory[at("SPax")] = 0x0100;
  memory[at("SPdx")] = 0x0200;
  memory[at("SPcl")] = 2;
  memory[at("SPbp")] = 0x0100;
  memory[at("SPsi")] = 0;
  memory[at("PGtexoff")] = 0;
  memory[at("SPtinta")] = 5;
  memory[1_400_100 + 0x0201] = 10;
  memory[1_400_100 + 0x0202] = 20;
  run(IDS.terrainPixelBlock);
  assert.deepEqual([...memory.slice(1_401_004, 1_401_006)], [15, 25]);
  assert.equal(memory[at("SPdi")], 2);
  assert.equal(memory[at("SPax")], 0x0300);

  memory[at("SPdi")] = 10;
  memory[at("SPax")] = 0x0100;
  memory[at("SPdx")] = 0x0200;
  memory[at("SPcl")] = 1;
  run(IDS.terrainCullPixelBlock);
  assert.deepEqual([...memory.slice(1_401_014, 1_401_016)], [15, 15]);

  memory[at("SPdi")] = 20;
  memory[at("SPax")] = 0x0100;
  memory[at("SPdx")] = 0x0200;
  memory[1_401_024] = 250;
  run(IDS.transparentPixel);
  assert.equal(memory[1_401_024], 4);

  memory[at("SPdi")] = 30;
  memory[at("SPax")] = 0x0100;
  memory[at("SPdx")] = 0x0200;
  memory[1_401_035] = 250;
  run(IDS.transparentCullPixel);
  assert.deepEqual([...memory.slice(1_401_034, 1_401_036)], [4, 4]);

  memory[at("SPdi")] = 400;
  memory[at("SPn")] = 2;
  memory[1_401_084] = 12;
  memory[1_401_085] = 13;
  run(IDS.duplicateHalfScan);
  assert.deepEqual([...memory.slice(1_401_404, 1_401_406)], [12, 13]);
  assert.deepEqual([...memory.slice(1_401_724, 1_401_726)], [12, 13]);

  memory[at("FCW")] = 0x137f;
  run(IDS.resetFloatingPoint);
  assert.deepEqual(machine.fpu, { control: 0x137f, stack: [] });
});
