import assert from "node:assert/strict";
import test from "node:test";

import { canonicalName } from "../src/compiler/lexer.js";
import {
  createNoctisIntrinsics,
  NOCTIS_INTRINSIC_IDS as IDS,
  NOCTIS_SERVICE_INTRINSIC_IDS as SERVICES,
} from "../src/intrinsics/noctis.js";

function fixture() {
  const names = [
    "UAFsrc", "UAFdst", "UAFwidth", "UAFheight", "UAFgap",
    "VHGUIsrc", "VHGUIpal", "VHGUIdst", "VHGUIrow2", "VHGUIdstp",
    "VHGUIrow2p", "VHGUIgap", "VHGUIdw", "VHGUIdh", "VHGUIsy",
    "VHGUIyacc", "VHGUIy", "PGdi", "PGval", "SADPT", "VHTmaskbase",
    "VHTcyclebase", "nw",
    "RADPT", "VHGNDblurpasses", "VHGNDblursize", "VHGNDblurp",
    "VHGNDblurcount", "VHGNDblurval", "VHGNDmushinner",
    "VHGNDmushcolmask", "VHGNDmushbase",
    "VHGNDmushoff",
    "VHTsmoothbase", "SPcpfrom", "SPcpto", "PVj", "SCcx", "SCdi",
    "SCal", "SCzf", "DBal", "CSbyte", "SGpi", "SGpf", "SGgx", "SGgy",
    "SGa", "SGb", "SGt", "DBdi", "DBcx", "DBdl",
    "EWminy", "EWmaxy", "fpart", "ipart", "PGi",
    "RPBG", "SPdi", "SPax", "SPdx", "SPcl", "SPbp", "SPsi", "PGtexoff",
    "SPtinta", "SPn", "FCW",
    "VHGNDbgsourcenative", "VHGNDpageclearptr", "VHGNDbgcachefrom",
    "VHGNDbgcacheto", "VHGNDbgcachecount", "VHGNDbgoffnative",
    "VHGNDbgdestinationnative", "BGbp", "BGcxr", "BGdx", "BGw", "BGdi",
    "BGpx", "BGi", "VHGNDbgrowbase", "VHGNDmpbase", "PJminx", "PJmaxx",
    "BXminy", "BXmaxy", "VHGNDh1", "VHGNDseed", "SUfseed", "SUfeax",
    "SUfmask", "SUfval", "SUsi",
    "mp", "rwf", "PJnrv", "PJvr", "PJvr2", "PJvr22",
    "PJdoflag", "FCWSAV", "FCWTMP", "FSW", "FCWCSAV", "FCWCHOP",
    "FI", "FA0", "FB0", "FS0", "FT0", "PGFi", "PGFj", "PGFt", "PGFu", "fw",
    "FC0", "FD0", "FJ0", "FJ1", "FJ2", "FKNsIdentitySpill1t0",
    "FKNsIdentitySpill2t0", "FKNsIdentitySpill3t0", "FKNsIdentitySpill4t0",
    "FKNsIdentitySpillAllt0", "FKIsThereIdentityK1EM50", "FKProd4Spilledt0",
    "nsicsav", "nsicchop", "nsicq0",
    "gcsav", "gcchop", "gcQ0", "gcT0", "gcK0", "gcTen0", "gcHun0",
    "gcFif0", "gcFiv0", "gcFvt0", "gcTwo0", "gcMil0", "gcCen0",
    "gcFivp0", "gcTent0", "gc41120",
    "VHSstarptr", "VHSdx0", "VHSdy0", "VHSdz0", "VHSdepth",
    "GCx", "GCy",
    "rgt", "GBbubble", "GBmag", "GBcx", "GBcy", "GBdstreg", "SAr",
    "SArs", "SAtcx", "SAtcy", "SAdif", "SAx1", "SAy1", "SAx2", "SAy2",
    "SApx", "SApy", "SAcp", "SAp0", "SAp1", "SAp2", "SAp3", "SAavg",
    "GBt", "SFMAG", "SFRX", "SFRY", "SFRZ", "SFZ2",
    "VHGNDvecindex", "VHGNDvecowner", "VHGNDmass0", "VHGNDorbit0",
    "VHGNDangle0", "VHGNDsin0", "VHGNDcos0", "VHGNDct0", "VHGNDxx0",
    "VHGNDzz0", "VHGNDso0", "VHGNDco0", "VHGNDvecx0", "VHGNDvecy0",
    "VHGNDvecz0", "nsstarray", "nspowner", "nspray", "nsporbray",
    "nsporbtlt", "nsporbecc", "nspororient", "SUsec0",
    "String", "Ink", "Text X", "Text Y", "Text Effect", "Text Display Width",
    "Text Display Height", "Text Display Origin", "Text Region", "Text Window",
    "Text Word Wrap", "Text Ghost Mode", "Text TAB Size", "Text Intercharspacing",
    "Text Interlinespacing", "Text Highlight Start", "Text Highlight Stop",
    "STD Font Alignment", "STD Font Body", "STD Font Width", "STD Font Shape",
    "Width Of Latest Form", "Height Of Latest Form", "STD HL", "STD Current character X",
    "STD Current character Y", "STD Offset to current character in string", "STD Dot X",
    "STD Dot Y", "STD Stop X", "STD Stop Y", "STD Current shape unit", "STD Dot Mask",
    "STD Window Left", "STD Window Top", "STD Window Right", "STD Window Bottom",
    "STD Prescent X", "STD Prescent offset", "STD Width Correction", "STD Height Correction",
    "Rectangle Target Layer", "Rectangle Display Alignment", "Rectangle Bounds",
    "Rectangle Gradients", "Rectangle Effect", "RECT H Start Red", "RECT H Start Green",
    "RECT H Start Blue", "RECT H Delta Red", "RECT H Delta Green", "RECT H Delta Blue",
    "RECT V Start Red", "RECT V Start Green", "RECT V Start Blue", "RECT V Delta Red",
    "RECT V Delta Green", "RECT V Delta Blue", "RECT Pixels", "RECT Scanlines",
    "RECT Display Pointer", "FX Transparent Color", "FX Filter Color", "Display Width",
    "Shadow Layer Mask",
    "TGA Target Layer", "TGA Picture Data", "TGA Display Alignment", "TGA Display Width",
    "TGA Display Height", "TGA Picture Left", "TGA Picture Top", "TGA Effect",
    "TR Bounds", "TR Picture Data", "TR Target Layer", "TR Display Alignment", "TR Effect",
    "Bit Stream Pointer", "Starting Bit Number", "Bit Field Size", "Bit Field Content",
    "LTP Pixels", "LTP Scanlines", "LTP Current Pixel", "LTP Current Scanline",
    "LTP Current Pixel Pointer", "LTP Reverse Horiz", "LTP Forward Vert",
    "LTP Bit Field Delta X", "LTP Bit Field Delta Y", "LTP ID Block Size",
    "LTP Header Data", "LTP Colormap Size", "LTP Colormap Data",
  ];
  const symbols = new Map(names.map((name, index) => [
    canonicalName(name),
    { name, value: index + 1 },
  ]));
  return {
    linked: { symbols, labels: new Map() },
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

test("surface blur service preserves the shared Lino loop", () => {
  const intrinsic = createNoctisIntrinsics();
  const { linked, machine, at } = fixture();
  const memory = machine.memory;
  linked.symbols.get(canonicalName("nw")).value = 100_000;
  linked.symbols.get(canonicalName("RADPT")).value = 20_000;
  const base = 122_556;
  const count = 321;
  const expected = new Int32Array(1_000);
  for (let index = 0; index < expected.length; index += 1) {
    expected[index] = (index * 37 + 11) & 0xff;
  }
  memory.set(expected, base);
  for (let pass = 0; pass < 2; pass += 1) {
    for (let index = 0; index < count; index += 1) {
      const first = expected[index + 320];
      expected[index] = (first & 0xc0) | (((first & 0x3f)
        + (expected[index + 321] & 0x3f)
        + (expected[index + 640] & 0x3f)
        + (expected[index + 641] & 0x3f)) >>> 2);
    }
  }
  memory[at("VHGNDblurpasses")] = 2;
  memory[at("VHGNDblursize")] = count;

  intrinsic[SERVICES.groundSurfaceBlur](machine, linked);

  assert.deepEqual(
    [...memory.subarray(base, base + count)],
    [...expected.subarray(0, count)],
  );
  assert.equal(memory[at("VHGNDblurp")], base + count);
  assert.equal(memory[at("VHGNDblurcount")], 0);
  assert.equal(memory[at("VHGNDblurpasses")], 0);
  assert.equal(memory[at("VHGNDblurval")], expected[count - 1 + 320]);
  assert.equal(machine.A, 0);
  assert.equal(machine.C, expected[count - 1 + 320] & 0xc0);
  assert.equal(machine.D, base + count - 1);
  assert.equal(machine.E, base + count - 1 + 320);
});

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
  // The native back-edge clears EBP for every destination. A carried
  // accumulator would incorrectly raise this second constant-field pixel.
  assert.equal(memory[1_200_321], 4);

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
  linked.symbols.get(canonicalName("fpart")).value = 1_500_000;
  linked.symbols.get(canonicalName("ipart")).value = 1_500_100;
  run(IDS.initializePolygonRows);
  assert.deepEqual([...memory.slice(1_500_002, 1_500_004)], [5, 5]);
  assert.deepEqual([...memory.slice(1_500_102, 1_500_104)], [311, 311]);
  assert.equal(memory[at("PGi")], 4);

  linked.symbols.get(canonicalName("RPBG")).value = 100;
  linked.symbols.get(canonicalName("SADPT")).value = 1000;
  linked.symbols.get(canonicalName("nw")).value = 1_400_000;
  const denseBase = at("nw") + at("RADPT") + 2880;
  memory[at("SUsi")] = 320;
  for (const row of [0, 320, 640, 960]) memory.fill(16, denseBase + row, denseBase + row + 4);
  run(IDS.landedDenseAverage);
  assert.equal(memory[denseBase + 320], 16);

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
  assert.deepEqual(machine.fpu, { control: 0x137f, status: 0, stack: [] });

  memory[at("VHGNDbgsourcenative")] = 1_520_000;
  memory[1_520_000] = 9;
  memory[1_520_001] = 10;
  memory[1_520_000 + 40_000] = 20;
  run(IDS.invertGroundSky);
  assert.equal(memory[1_520_000], 9);
  assert.equal(memory[1_520_001], 53);
  assert.equal(memory[1_520_000 + 40_000], 43);

  memory[at("VHGNDpageclearptr")] = 1_570_000;
  memory.fill(99, 1_570_000, 1_570_000 + 64_000);
  run(IDS.clearGroundPage);
  assert.equal(memory[1_570_000], 0);
  assert.equal(memory[1_570_000 + 63_999], 0);

  memory[at("VHGNDbgcachefrom")] = 1_650_000;
  memory[at("VHGNDbgcacheto")] = 1_650_010;
  memory[at("VHGNDbgcachecount")] = 3;
  memory.set([21, 22, 23], 1_650_000);
  run(IDS.copyGroundBackground);
  assert.deepEqual([...memory.slice(1_650_010, 1_650_013)], [21, 22, 23]);

  memory[at("VHGNDbgoffnative")] = 1_660_000;
  memory[at("VHGNDbgsourcenative")] = 1_661_000;
  memory[at("VHGNDbgdestinationnative")] = 1_662_000;
  memory.set([10, 0, 2, 250], 1_660_000);
  memory[1_661_005] = 7;
  memory[at("BGbp")] = 5;
  memory[at("BGcxr")] = 2;
  memory[at("BGdx")] = 4;
  run(IDS.drawGroundBackground);
  assert.deepEqual([...memory.slice(1_662_014, 1_662_019)], [7, 7, 7, 7, 7]);
  assert.deepEqual([...memory.slice(1_662_334, 1_662_339)], [7, 7, 7, 7, 7]);
  assert.equal(memory[at("BGbp")], 8);
  assert.equal(memory[at("BGcxr")], 0);

  memory[at("VHGNDmpbase")] = 1_680_000;
  memory.set([20, 40, 10, 60, 30, 20, 20, 40], 1_680_000);
  run(IDS.groundCachedBounds);
  assert.deepEqual(
    [memory[at("PJminx")], memory[at("PJmaxx")], memory[at("BXminy")], memory[at("BXmaxy")]],
    [10, 30, 20, 60],
  );

  machine.A = -1;
  run(IDS.groundRandomSquare);
  assert.equal(machine.A, 1);
  assert.equal(machine.D, -2);

  memory[at("VHGNDh1")] = 123;
  memory[at("VHGNDseed")] = 456;
  run(IDS.groundTileShade);
  const tileSeed = (123 + 456) | 3;
  const tileProduct = BigInt(tileSeed >>> 0) * BigInt(tileSeed >>> 0);
  const tileLow = Number(tileProduct & 0xffffffffn) | 0;
  const tileHigh = Number((tileProduct >> 32n) & 0xffffffffn) | 0;
  const tileFolded = (tileLow & 0xffffff00) | (((tileLow & 0xff) + (tileHigh & 0xff)) & 0xff);
  assert.equal(memory[at("SUfeax")], tileFolded);
  assert.equal(memory[at("SUfseed")], (tileSeed + tileFolded) | 0);
  assert.equal(memory[at("SUfval")], tileFolded & 7);

  linked.symbols.get(canonicalName("fw")).value = 1_700_000;
  memory[at("PJnrv")] = 2;
  memory.set([1, 2, 3, 4], 1_700_064);
  memory.set([5, 6, 7, 8], 1_700_072);
  memory.set([9, 10, 11, 12], 1_700_080);
  run(IDS.loadProjectedVertices);
  assert.deepEqual([...memory.slice(1_700_096, 1_700_100)], [1, 2, 3, 4]);
  assert.deepEqual([...memory.slice(1_700_112, 1_700_116)], [5, 6, 7, 8]);
  assert.deepEqual([...memory.slice(1_700_128, 1_700_132)], [9, 10, 11, 12]);
  assert.deepEqual(
    [memory[at("PJvr")], memory[at("PJvr2")], memory[at("PJvr22")]],
    [2, 2, 4],
  );

  memory.set([101, 102], 1_700_508);
  memory.set([103, 104], 1_700_516);
  memory.set([105, 106], 1_700_524);
  run(IDS.duplicateMappedInput);
  assert.deepEqual([...memory.slice(1_700_510, 1_700_512)], [101, 102]);
  assert.deepEqual([...memory.slice(1_700_518, 1_700_520)], [103, 104]);
  assert.deepEqual([...memory.slice(1_700_526, 1_700_528)], [105, 106]);

  memory.set([201, 202], 1_700_068);
  memory.set([203, 204], 1_700_076);
  memory.set([205, 206], 1_700_084);
  linked.symbols.get(canonicalName("rwf")).value = 1_701_000;
  memory[1_701_002] = 1;
  memory[at("PJdoflag")] = 2;
  run(IDS.duplicateMappedRotation);
  assert.deepEqual([...memory.slice(1_700_070, 1_700_072)], [201, 202]);
  assert.equal(memory[1_701_003], 1);
  assert.equal(memory[at("PJdoflag")], 3);

  memory[at("FCW")] = 0x103f;
  machine.fpu.control = 0x0f7f;
  run(IDS.enterFloatingPoint);
  assert.equal(memory[at("FCWSAV")], 0x0f7f);
  assert.equal(machine.fpu.control, 0x103f);
  run(IDS.leaveFloatingPoint);
  assert.equal(machine.fpu.control, 0x0f7f);
  run(IDS.loadFloatingPointControl);
  assert.equal(machine.fpu.control, 0x103f);
  run(IDS.readFloatingPointControl);
  assert.equal(memory[at("FCWTMP")], 0x107f);
  machine.fpu.status = 0x2800;
  run(IDS.readFloatingPointStatus);
  assert.equal(memory[at("FSW")], 0x2800);

  linked.symbols.get(canonicalName("FA0")).value = 1_800_000;
  linked.symbols.get(canonicalName("FS0")).value = 1_800_002;
  linked.symbols.get(canonicalName("FI")).value = 1_800_003;
  linked.symbols.get(canonicalName("FB0")).value = 1_800_004;
  const view = new DataView(memory.buffer);
  memory[at("FI")] = -123;
  run(IDS.convertIntToFloat);
  assert.equal(view.getFloat64(at("FA0") * 4, true), -123);

  view.setFloat64(at("FA0") * 4, 1.5, true);
  machine.fpu.control = 0x103f;
  run(IDS.convertFloatToIntNear);
  assert.equal(memory[at("FI")], 2);
  run(IDS.saveChopControl);
  assert.equal(memory[at("FCWCSAV")], 0x107f);
  memory[at("FCWCHOP")] = 0x1c3f;
  view.setFloat64(at("FA0") * 4, -1.9, true);
  run(IDS.convertFloatToIntChop);
  assert.equal(memory[at("FI")], -1);
  assert.equal(machine.fpu.control, 0x107f);

  view.setFloat64(at("FA0") * 4, 1 + 2 ** -25, true);
  machine.fpu.control = 0x103f;
  run(IDS.narrowFloat32);
  assert.equal(memory[at("FS0")] >>> 0, 0x3f800000);
  assert.equal(view.getFloat64(at("FA0") * 4, true), 1);
  view.setFloat64(at("FA0") * 4, -2.5, true);
  run(IDS.storeFloat32);
  view.setFloat64(at("FA0") * 4, 0, true);
  run(IDS.loadFloat32);
  assert.equal(view.getFloat64(at("FA0") * 4, true), -2.5);

  const setPair = (a, b) => {
    view.setFloat64(at("FA0") * 4, a, true);
    view.setFloat64(at("FB0") * 4, b, true);
  };
  setPair(1.5, 2.25);
  run(IDS.addFloat64);
  assert.equal(view.getFloat64(at("FA0") * 4, true), 3.75);
  setPair(5, 1.25);
  run(IDS.subtractFloat64);
  assert.equal(view.getFloat64(at("FA0") * 4, true), 3.75);
  setPair(1.5, -4);
  run(IDS.multiplyFloat64);
  assert.equal(view.getFloat64(at("FA0") * 4, true), -6);
  setPair(7.5, 2.5);
  run(IDS.divideFloat64);
  assert.equal(view.getFloat64(at("FA0") * 4, true), 3);
  view.setFloat64(at("FA0") * 4, 81, true);
  run(IDS.squareRootFloat64);
  assert.equal(view.getFloat64(at("FA0") * 4, true), 9);
  view.setFloat64(at("FA0") * 4, 0, true);
  run(IDS.negateFloat64);
  assert.equal(Object.is(view.getFloat64(at("FA0") * 4, true), -0), true);
  run(IDS.absoluteFloat64);
  assert.equal(Object.is(view.getFloat64(at("FA0") * 4, true), 0), true);
  view.setFloat64(at("FA0") * 4, Math.PI / 2, true);
  run(IDS.sineFloat64);
  assert.equal(view.getFloat64(at("FA0") * 4, true), 1);
  view.setFloat64(at("FA0") * 4, 0, true);
  run(IDS.cosineFloat64);
  assert.equal(view.getFloat64(at("FA0") * 4, true), 1);
  setPair(1, 0);
  run(IDS.atan2Float64);
  assert.equal(view.getFloat64(at("FA0") * 4, true), Math.PI / 2);
  setPair(Number.NaN, 0);
  run(IDS.compareFloat64);
  assert.equal(memory[at("FSW")], 0x4500);

  const chainSlots = [
    "FC0", "FD0", "FKNsIdentitySpill1t0", "FKNsIdentitySpill2t0",
    "FKNsIdentitySpill3t0", "FKNsIdentitySpill4t0", "FKNsIdentitySpillAllt0",
    "FKIsThereIdentityK1EM50", "FKProd4Spilledt0",
  ];
  chainSlots.forEach((name, index) => {
    linked.symbols.get(canonicalName(name)).value = 1_810_000 + index * 2;
  });
  memory[at("FJ0")] = 123456789;
  memory[at("FJ1")] = -987654321;
  memory[at("FJ2")] = 135791113;
  const chainCases = [
    [IDS.nearStarIdentity, 0xc20ed72b0c4e6ce5n],
    [IDS.nearStarIdentityPermuted, 0xc20ed72b0c4e6ce5n],
    [IDS.nearStarIdentitySpill1, 0xc20ed72b0c4e6ce5n],
    [IDS.nearStarIdentitySpill2, 0xc20ed72b0c4e6ce6n],
    [IDS.nearStarIdentitySpill3, 0xc20ed72b0c4e6ce5n],
    [IDS.nearStarIdentitySpill4, 0xc20ed72b0c4e6ce6n],
    [IDS.nearStarIdentitySpillAll, 0xc20ed72b0c4e6ce6n],
  ];
  for (const [id, expected] of chainCases) {
    run(id);
    assert.equal(view.getBigUint64(at("FA0") * 4, true), expected);
  }
  view.setFloat64(at("FKIsThereIdentityK1EM50") * 4, 1e-5, true);
  run(IDS.isThereIdentity);
  assert.equal(view.getBigUint64(at("FA0") * 4, true), 0xc20ed72b0c4e6ce7n);

  view.setFloat64(at("FA0") * 4, 1.5, true);
  view.setFloat64(at("FB0") * 4, 2, true);
  view.setFloat64(at("FC0") * 4, 3, true);
  view.setFloat64(at("FD0") * 4, 4, true);
  run(IDS.product4);
  assert.equal(view.getFloat64(at("FA0") * 4, true), 36);
  view.setFloat64(at("FA0") * 4, 1.5, true);
  run(IDS.product4Spilled);
  assert.equal(view.getFloat64(at("FA0") * 4, true), 36);

  linked.symbols.get(canonicalName("nsicq0")).value = 1_830_000;
  machine.fpu.control = 0x133f;
  run(IDS.saveNearStarChopControl);
  assert.equal(memory[at("nsicsav")], 0x137f);
  memory[at("nsicchop")] = 0x1f3f;
  run(IDS.nearStarIdentityChop16);
  assert.equal(memory[at("nsicq0")] & 0xffff, 40567);
  assert.equal(machine.fpu.control, 0x137f);

  const geometrySlots = [
    "gcQ0", "gcT0", "gcK0", "gcTen0", "gcHun0", "gcFif0", "gcFiv0",
    "gcFvt0", "gcTwo0", "gcMil0", "gcCen0", "gcFivp0", "gcTent0", "gc41120",
  ];
  geometrySlots.forEach((name, index) => {
    linked.symbols.get(canonicalName(name)).value = 1_840_000 + index * 2;
  });
  machine.fpu.control = 0x133f;
  run(IDS.enterGeometryChop);
  assert.equal(memory[at("gcsav")], 0x137f);
  memory[at("gcchop")] = 0x1f3f;
  view.setFloat64(at("gcK0") * 4, 10, true);
  view.setFloat64(at("FB0") * 4, 12.75, true);
  run(IDS.geometryKMulChop);
  assert.equal(memory[at("gcQ0")], 127);
  assert.equal(machine.fpu.control, 0x137f);

  view.setFloat64(at("FB0") * 4, 1, true);
  view.setFloat64(at("FC0") * 4, 41, true);
  run(IDS.geometryQuoMulChop);
  assert.equal(memory[at("gcQ0")], 0);
  view.setFloat64(at("FB0") * 4, 1, true);
  run(IDS.geometryQuoMulChopSpill1);
  assert.equal(memory[at("gcQ0")], 1);
  view.setFloat64(at("FB0") * 4, 1, true);
  run(IDS.geometryQuoMulChopSpill2);
  assert.equal(memory[at("gcQ0")], 1);

  view.setFloat64(at("gcFiv0") * 4, 500, true);
  memory[at("FI")] = 125;
  run(IDS.geometryRatioStore500);
  assert.equal(view.getFloat64(at("FA0") * 4, true), 0.25);
  view.setFloat64(at("gcMil0") * 4, 1_000_000, true);
  view.setFloat64(at("gcCen0") * 4, 100, true);
  memory[at("FI")] = 3;
  run(IDS.geometryPlanetRayStore);
  assert.equal(view.getFloat64(at("FA0") * 4, true), 3_000_100);

  memory[at("VHSstarptr")] = 1_870_000;
  memory.set([10, 20, 50], 1_870_000);
  linked.symbols.get(canonicalName("VHSdx0")).value = 1_870_010;
  linked.symbols.get(canonicalName("VHSdy0")).value = 1_870_012;
  linked.symbols.get(canonicalName("VHSdz0")).value = 1_870_014;
  view.setFloat64(at("VHSdx0") * 4, 0, true);
  view.setFloat64(at("VHSdy0") * 4, 0, true);
  view.setFloat64(at("VHSdz0") * 4, 0, true);
  linked.symbols.get(canonicalName("fw")).value = 1_880_000;
  run(IDS.spaceRelativeCoordinates);
  assert.deepEqual(
    [view.getFloat64((1_880_000 + 504) * 4, true), view.getFloat64((1_880_000 + 512) * 4, true), view.getFloat64((1_880_000 + 520) * 4, true)],
    [10, 20, 50],
  );
  view.setFloat64((1_880_000 + 428) * 4, 1, true);
  view.setFloat64((1_880_000 + 430) * 4, 0, true);
  view.setFloat64((1_880_000 + 436) * 4, 1, true);
  view.setFloat64((1_880_000 + 438) * 4, 0, true);
  run(IDS.spaceRotateDepth);
  assert.deepEqual(
    [view.getFloat64((1_880_000 + 64) * 4, true), view.getFloat64((1_880_000 + 72) * 4, true), view.getFloat64((1_880_000 + 80) * 4, true), memory[at("VHSdepth")]],
    [10, 20, 50, 50],
  );
  view.setFloat64((1_880_000 + 50) * 4, 100, true);
  view.setFloat64((1_880_000 + 38) * 4, 160, true);
  view.setFloat64((1_880_000 + 40) * 4, 100, true);
  run(IDS.spaceProject);
  assert.deepEqual([memory[at("GCx")], memory[at("GCy")]], [180, 140]);

  const serviceAddresses = {
    FA0: 1_900_000, FB0: 1_900_010, FS0: 1_900_020, FT0: 1_900_030,
    PGFi: 1_900_040, PGFj: 1_900_041, PGFt: 1_900_042,
    PGFu: 1_900_043, FI: 1_900_044, fw: 1_910_000,
  };
  for (const [name, location] of Object.entries(serviceAddresses)) {
    linked.symbols.get(canonicalName(name)).value = location;
  }
  memory[at("PGFi")] = 3;
  view.setFloat64((at("fw") + 6) * 4, 2.5, true);
  run(SERVICES.pgfA);
  assert.equal(view.getFloat64(at("FA0") * 4, true), 2.5);
  assert.equal(machine.A, at("fw") + 6);
  view.setFloat64(at("FA0") * 4, 10, true);
  run(SERVICES.pgfAdd);
  assert.equal(view.getFloat64(at("FA0") * 4, true), 12.5);
  view.setFloat64(at("FA0") * 4, 3, true);
  run(SERVICES.pgfReverseSubtract);
  assert.equal(view.getFloat64(at("FA0") * 4, true), -0.5);
  memory[at("PGFj")] = 4;
  run(SERVICES.pgfMove);
  assert.equal(view.getFloat64((at("fw") + 8) * 4, true), 2.5);
  memory[at("PGFi")] = 5;
  memory[at("PGFt")] = 0x3fa00000;
  run(SERVICES.pgfSetFloat32);
  assert.equal(view.getFloat64((at("fw") + 10) * 4, true), 1.25);
  view.setFloat64(at("FA0") * 4, 2.5, true);
  run(SERVICES.pgfInteger);
  assert.equal(memory[at("FI")], 2);
  memory[at("FI")] = -7;
  run(SERVICES.pgfFromInteger);
  assert.equal(view.getFloat64(at("FA0") * 4, true), -7);
});

test("greenmush stamps the Noctis framebuffer rather than workspace memory", () => {
  const intrinsic = createNoctisIntrinsics();
  const { linked, machine, at } = fixture();
  const memory = machine.memory;
  linked.symbols.get(canonicalName("nw")).value = 100_000;
  linked.symbols.get(canonicalName("RADPT")).value = 20_000;
  memory[at("VHGNDmushinner")] = 1;
  memory[at("VHGNDmushcolmask")] = 31;
  memory[at("VHGNDmushbase")] = 192;
  memory[at("GCx")] = 30;
  memory[at("GCy")] = 30;
  memory[at("SUfseed")] = 12345;

  intrinsic[IDS.landedMushroomPixels](machine, linked);

  const offset = memory[at("VHGNDmushoff")];
  const colour = memory[at("SUfval")] + 192;
  const page = 120_000;
  for (const displacement of [0, 1, -1, 320, -320, -640]) {
    assert.equal(memory[page + offset + displacement], colour);
    assert.equal(memory[20_000 + offset + displacement], 0);
  }
});

test("glass bubble truncates displacement before adding its integer centre", () => {
  const intrinsic = createNoctisIntrinsics();
  const { linked, machine, at } = fixture();
  const memory = machine.memory;
  linked.symbols.get(canonicalName("nw")).value = 0;
  memory[at("GBbubble")] = 1;
  memory[at("GBmag")] = 1061997773; // binary32 0.800000011920929
  memory[at("GBcx")] = 158;
  memory[at("GBcy")] = 100;
  memory[at("GBdstreg")] = 2;
  memory[at("rgt") + 2 * 4 + 1] = 500_000;

  intrinsic[SERVICES.glassBubble](machine, linked);

  assert.equal(memory[at("SAtcx")], 245);
  assert.equal(memory[at("SAtcy")], 100);
  assert.equal(memory[at("SAx1")], 251);
  assert.equal(memory[at("SAy1")], 106);
});

test("body-vector cache invalidates when a system changes at the same clock time", () => {
  const intrinsic = createNoctisIntrinsics();
  const { linked, machine, at } = fixture();
  const memory = machine.memory;
  const view = new DataView(memory.buffer);
  [
    "VHGNDvecindex", "VHGNDvecowner", "VHGNDmass0", "VHGNDorbit0",
    "VHGNDangle0", "VHGNDsin0", "VHGNDcos0", "VHGNDct0", "VHGNDxx0",
    "VHGNDzz0", "VHGNDso0", "VHGNDco0", "VHGNDvecx0", "VHGNDvecy0",
    "VHGNDvecz0", "nsstarray", "nspowner", "nspray", "nsporbray",
    "nsporbtlt", "nsporbecc", "nspororient", "SUsec0",
  ].forEach((name, index) => {
    linked.symbols.get(canonicalName(name)).value = 10_000 + index * 100;
  });
  memory[at("VHGNDvecindex")] = 0;
  memory[at("nspowner")] = -1;
  view.setFloat32(at("nsstarray") * 4, 1_000, true);
  view.setFloat64(at("SUsec0") * 4, 12345, true);
  view.setFloat64(at("nsporbray") * 4, 5_000, true);
  view.setFloat64(at("nsporbtlt") * 4, 10, true);
  view.setFloat64(at("nsporbecc") * 4, 1, true);
  view.setFloat64(at("nspororient") * 4, 0.25, true);

  intrinsic[SERVICES.bodyVector](machine, linked);
  const firstX = view.getFloat64(at("VHGNDvecx0") * 4, true);
  view.setFloat64(at("nsporbray") * 4, 7_000, true);
  intrinsic[SERVICES.bodyVector](machine, linked);
  const secondX = view.getFloat64(at("VHGNDvecx0") * 4, true);

  assert.notEqual(secondX, firstX);
  assert.equal(view.getFloat64(at("VHGNDorbit0") * 4, true), 7_000);
});

test("standard text publishes the source glyph-loop scratch state", () => {
  const intrinsic = createNoctisIntrinsics();
  const { linked, machine, at } = fixture();
  const memory = machine.memory;
  memory[at("String")] = 100_000;
  memory[100_000] = 65;
  memory[100_001] = 0;
  memory[at("Text Display Origin")] = 200_000;
  memory[at("Text Display Width")] = 10;
  memory[at("Text Display Height")] = 10;
  memory[at("Text X")] = 1;
  memory[at("Text Y")] = 1;
  memory[at("STD Font Alignment")] = 16;
  memory[at("STD Font Body")] = 2;
  memory[at("STD Font Width")] = 2;
  memory[at("STD Font Shape")] = 300_000;

  intrinsic[SERVICES.standardText](machine, linked);

  assert.equal(memory[at("STD Dot X")], 3);
  assert.equal(memory[at("STD Dot Y")], 3);
  assert.equal(memory[at("STD Stop X")], 3);
  assert.equal(memory[at("STD Stop Y")], 3);
  assert.equal(memory[at("STD Current shape unit")], 300_097);
});

test("TGA loader preserves the source bitfield and scan cursors", () => {
  const intrinsic = createNoctisIntrinsics();
  const { linked, machine, at } = fixture();
  const memory = machine.memory;
  const tgaNames = [
    "TGA Target Layer", "TGA Picture Data", "TGA Display Alignment", "TGA Display Width",
    "TGA Display Height", "TGA Picture Left", "TGA Picture Top", "TGA Effect",
    "Bit Stream Pointer", "Starting Bit Number", "Bit Field Size", "Bit Field Content",
    "LTP Pixels", "LTP Scanlines", "LTP Current Pixel", "LTP Current Scanline",
    "LTP Current Pixel Pointer", "LTP Reverse Horiz", "LTP Forward Vert",
    "LTP Bit Field Delta X", "LTP Bit Field Delta Y", "LTP ID Block Size",
    "LTP Header Data", "LTP Colormap Size", "LTP Colormap Data",
  ];
  tgaNames.forEach((name, index) => {
    linked.symbols.get(canonicalName(name)).value = 10_000 + index * 100;
  });
  linked.labels.set(canonicalName("FX Raw"), 0);
  linked.labels.set(canonicalName("FX Shadow"), 1);
  const data = 300_000;
  const target = 400_000;
  const bytes = new Uint8Array(memory.buffer, data * 4, 21);
  bytes.fill(0);
  bytes[2] = 2;
  bytes[12] = 1;
  bytes[14] = 1;
  bytes[16] = 24;
  bytes[18] = 3;
  bytes[19] = 2;
  bytes[20] = 1;
  memory[at("TGA Target Layer")] = target;
  memory[at("TGA Picture Data")] = data;
  memory[at("TGA Display Alignment")] = 10;
  memory[at("TGA Display Width")] = 10;
  memory[at("TGA Display Height")] = 10;
  memory[at("TGA Picture Left")] = 2;
  memory[at("TGA Picture Top")] = 3;
  memory[at("TGA Effect")] = 1;

  intrinsic[SERVICES.loadTgaPicture](machine, linked);

  assert.equal(memory[target + 32], 0x010203);
  assert.equal(memory[at("Bit Field Content")], 0x010203);
  assert.equal(memory[at("LTP Pixels")], 1);
  assert.equal(memory[at("LTP Scanlines")], 1);
  assert.equal(memory[at("LTP Current Pixel")], 3);
  assert.equal(memory[at("LTP Current Scanline")], 4);
  assert.equal(memory[at("LTP Current Pixel Pointer")], target + 42);

  memory[target + 32] = 0x40302010;
  memory[at("Shadow Layer Mask")] = 0x01000000;
  memory[at("TGA Effect")] = 2;
  intrinsic[SERVICES.loadTgaPicture](machine, linked);
  assert.equal(memory[target + 32], 0x412f1e0d);
});

test("TGA region tiling batches raw one-pixel GUI fills", () => {
  const intrinsic = createNoctisIntrinsics();
  const { linked, machine, at } = fixture();
  const memory = machine.memory;
  linked.labels.set(canonicalName("FX Raw"), 0);
  const data = 300_000;
  const target = 400_000;
  const bounds = 500_000;
  const bytes = new Uint8Array(memory.buffer, data * 4, 24);
  bytes.fill(0);
  bytes[2] = 2;
  bytes[12] = 2;
  bytes[14] = 1;
  bytes[16] = 24;
  bytes.set([3, 2, 1, 6, 5, 4], 18);
  memory.set([1, 1, 5, 2], bounds);
  memory[at("TR Bounds")] = bounds;
  memory[at("TR Picture Data")] = data;
  memory[at("TR Target Layer")] = target;
  memory[at("TR Display Alignment")] = 8;
  memory[at("TR Effect")] = 1;
  memory[at("TGA Picture Left")] = 77;
  memory[at("TGA Picture Top")] = 88;

  intrinsic[SERVICES.tileRegion](machine, linked);

  assert.deepEqual([...memory.slice(target + 9, target + 14)],
    [0x010203, 0x040506, 0x010203, 0x040506, 0x010203]);
  assert.deepEqual([...memory.slice(target + 17, target + 22)],
    [0x010203, 0x040506, 0x010203, 0x040506, 0x010203]);
  assert.equal(memory[at("TGA Picture Left")], 77);
  assert.equal(memory[at("TGA Picture Top")], 88);
});

test("rectangle restores its source pixel counter after each scanline", () => {
  const intrinsic = createNoctisIntrinsics();
  const { linked, machine, at } = fixture();
  const memory = machine.memory;
  const view = new DataView(memory.buffer);
  const bounds = 200_000;
  const gradients = 300_000;
  const target = 400_000;
  linked.labels.set(canonicalName("FX Raw"), 0);
  memory.set([1, 2, 3, 2], bounds);
  for (let index = 0; index < 9; index += 1) view.setFloat32((gradients + index) * 4, 0.5, true);
  memory[at("Rectangle Target Layer")] = target;
  memory[at("Rectangle Bounds")] = bounds;
  memory[at("Rectangle Gradients")] = gradients;
  memory[at("Rectangle Display Alignment")] = 10;
  memory[at("Rectangle Effect")] = 1;
  memory[at("Display Width")] = 10;

  intrinsic[SERVICES.rectangle](machine, linked);

  assert.deepEqual([...memory.slice(target + 21, target + 24)], [0x808080, 0x808080, 0x808080]);
  assert.equal(memory[at("RECT Pixels")], 3);
  assert.equal(memory[at("RECT Scanlines")], 0);
});

test("mapped UV stepping keeps wide temporaries out of camera slots", () => {
  const fixed = new Map(Object.entries({
    fw: 10_000,
    fsz: 15,
    fsx: 13,
    fsy: 14,
    fsk1: 9,
    fsk2: 10,
    fsk3: 11,
    fsk4: 12,
    fstx: 16,
    fsty: 17,
    fsuno: 18,
    fsw0: 248,
    fsw1: 249,
    fsw2: 250,
    fsw3: 251,
    fs0: 520,
    spun: 521,
    spvn: 522,
  }).map(([name, value]) => [canonicalName(name), { name, value }]));
  let nextAddress = 600;
  const linked = {
    labels: new Map(),
    symbols: {
      get(name) {
        const key = canonicalName(name);
        if (!fixed.has(key)) fixed.set(key, { name, value: nextAddress++ });
        return fixed.get(key);
      },
    },
  };
  const machine = {
    memory: new Int32Array(20_000),
    A: 0, B: 0, C: 0, D: 0, E: 0, X: 0,
    fpu: { control: 0x037f, status: 0, stack: [] },
  };
  const memory = machine.memory;
  const view = new DataView(memory.buffer);
  const at = (name) => linked.symbols.get(canonicalName(name)).value;
  const write = (slot, value) => view.setFloat64((at("fw") + slot * 2) * 4, value, true);
  const read = (slot) => view.getFloat64((at("fw") + slot * 2) * 4, true);
  write(at("FSZ"), 10);
  write(at("FSX"), 20);
  write(at("FSY"), 30);
  write(at("FSK1"), 3);
  write(at("FSK2"), 4);
  write(at("FSK3"), 2);
  write(at("FSUNO"), 1);
  write(at("FSTX"), 256);
  write(at("FSTY"), 128);
  const cameraSentinels = [11.25, 210, 77.5, 100];
  cameraSentinels.forEach((value, index) => write(24 + index, value));

  createNoctisIntrinsics()[IDS.terrainUvNext](machine, linked);

  assert.deepEqual([read(24), read(25), read(26), read(27)], cameraSentinels);
  assert.equal(read(at("FSW0")), 12);
  assert.equal(read(at("FSW1")), 23);
  assert.equal(read(at("FSW2")), 34);
  assert.equal(view.getFloat32(at("FS0") * 4, true), Math.fround(1 / 12));
  assert.equal(memory[at("SPun")], 491);
  assert.equal(memory[at("SPvn")], 363);
});
