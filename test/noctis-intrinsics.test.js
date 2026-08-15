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
    "VHTcyclebase",
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
});
