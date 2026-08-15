import { canonicalName } from "../compiler/lexer.js";

const IDS = Object.freeze({
  copyRegion: "native:igui.txt:6ce302b9",
  expandIndexed: "native:vhgui.txt:b4c87005",
  scale2x: "native:vhgui.txt:ed1d5dbf",
  scaleNearest: "native:vhgui.txt:3f79795d",
  pageStore: "native:pgmem.txt:bfbf99a3",
  pageLoad: "native:pgmem.txt:adabc499",
  multiplyUnsigned: "native:mul64frag.txt:258c1fb1",
  multiplySigned: "native:mul64frag.txt:30589b54",
  foldMultiplySigned: "native:vhspace.txt:298e521b",
  maskStarPage: "native:vhstar.txt:e2a24844",
  cycleStarTexture: "native:vhstar.txt:0f6a8ebb",
  smoothStarPage: "native:vhstar.txt:e09c521e",
  copyPlanetView: "native:spncc.txt:07d4565b",
  scanNotEqual: "native:pgrast.txt:3fe9c069",
  scanEqual: "native:pgrast.txt:8bbecaca",
  fillBytes: "native:pgrast.txt:381a0272",
  traceVertical: "native:pgrast.txt:9d0db75a",
  traceSegment: "native:pgrast.txt:64cf2ec7",
  fillFlare: "native:pgrast.txt:f43d628e",
  fillHalo: "native:pgrast.txt:1211c607",
  fillHaloFallback: "native:pgrast.txt:a9310ad7",
  initializePolygonRows: "native:pgtex.txt:3f5cd065",
  terrainPixelBlock: "native:pgtex.txt:48d8d8f7",
  terrainCullPixelBlock: "native:pgtex.txt:97457ef3",
  transparentPixel: "native:pgtex.txt:7cf9c5ad",
  transparentCullPixel: "native:pgtex.txt:d7cb2f13",
  duplicateHalfScan: "native:pgtex.txt:e4dc90b9",
  resetFloatingPoint: "native:vhgame.txt:9c6ea36c",
});

function address(linked, name) {
  const symbol = linked.symbols.get(canonicalName(name));
  if (!symbol) throw new ReferenceError(`Missing Noctis Lino symbol ${name}`);
  return symbol.value >>> 0;
}

function value(memory, linked, name) {
  return memory[address(linked, name)] | 0;
}

function noctisBuffer(linked, offsetName) {
  return (address(linked, "nw") + address(linked, offsetName)) >>> 0;
}

function polygonBuffer(memory, linked, offsetName) {
  return (value(memory, linked, "PGnwbase") + address(linked, offsetName)) >>> 0;
}

function copyRegion(machine, linked) {
  const memory = machine.memory;
  let source = value(memory, linked, "UAFsrc") >>> 0;
  let destination = value(memory, linked, "UAFdst") >>> 0;
  const width = value(memory, linked, "UAFwidth") >>> 0;
  const height = value(memory, linked, "UAFheight") >>> 0;
  const gap = value(memory, linked, "UAFgap") >> 2;

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      memory[destination + column] = memory[source + column];
    }
    source = (source + width + gap) >>> 0;
    destination = (destination + width + gap) >>> 0;
  }
}

function expandIndexed(machine, linked) {
  const memory = machine.memory;
  const source = value(memory, linked, "VHGUIsrc") >>> 0;
  const palette = value(memory, linked, "VHGUIpal") >>> 0;
  const destination = value(memory, linked, "VHGUIdst") >>> 0;
  for (let pixel = 0; pixel < 64000; pixel += 1) {
    memory[destination + pixel] = memory[palette + (memory[source + pixel] & 255)];
  }
}

function scale2x(machine, linked) {
  const memory = machine.memory;
  let source = value(memory, linked, "VHGUIsrc") >>> 0;
  let backdrop0 = value(memory, linked, "VHGUIdst") >>> 0;
  let backdrop1 = value(memory, linked, "VHGUIrow2") >>> 0;
  let primary0 = value(memory, linked, "VHGUIdstp") >>> 0;
  let primary1 = value(memory, linked, "VHGUIrow2p") >>> 0;
  const rowGap = value(memory, linked, "VHGUIgap") >> 2;

  for (let row = 0; row < 200; row += 1) {
    for (let column = 0; column < 320; column += 1) {
      const pixel = memory[source++];
      const offset = column << 1;
      memory[backdrop0 + offset] = pixel;
      memory[backdrop0 + offset + 1] = pixel;
      memory[backdrop1 + offset] = pixel;
      memory[backdrop1 + offset + 1] = pixel;
      memory[primary0 + offset] = pixel;
      memory[primary0 + offset + 1] = pixel;
      memory[primary1 + offset] = pixel;
      memory[primary1 + offset + 1] = pixel;
    }
    backdrop0 = (backdrop0 + 640 + rowGap) >>> 0;
    backdrop1 = (backdrop1 + 640 + rowGap) >>> 0;
    primary0 = (primary0 + 640 + rowGap) >>> 0;
    primary1 = (primary1 + 640 + rowGap) >>> 0;
  }
}

function scaleNearest(machine, linked) {
  const memory = machine.memory;
  const width = value(memory, linked, "VHGUIdw") | 0;
  const height = value(memory, linked, "VHGUIdh") | 0;
  const source = value(memory, linked, "VHGUIsrc") >>> 0;
  let destination = value(memory, linked, "VHGUIdst") >>> 0;
  const rowGap = value(memory, linked, "VHGUIgap") >> 2;
  const syAddress = address(linked, "VHGUIsy");
  const yaccAddress = address(linked, "VHGUIyacc");
  const yAddress = address(linked, "VHGUIy");
  let sourceY = memory[syAddress] | 0;
  let yAccumulator = memory[yaccAddress] | 0;
  let y = memory[yAddress] | 0;

  while (y < height) {
    let sourcePixel = (source + Math.imul(sourceY, 320)) >>> 0;
    let xAccumulator = 0;
    for (let x = 0; x < width; x += 1) {
      memory[destination++] = memory[sourcePixel];
      xAccumulator = (xAccumulator + 320) | 0;
      while (xAccumulator >= width) {
        xAccumulator = (xAccumulator - width) | 0;
        sourcePixel = (sourcePixel + 1) >>> 0;
      }
    }
    destination = (destination + rowGap) >>> 0;
    yAccumulator = (yAccumulator + 200) | 0;
    if (yAccumulator >= height) {
      yAccumulator = (yAccumulator - height) | 0;
      sourceY = (sourceY + 1) | 0;
    }
    memory[yaccAddress] = yAccumulator;
    y = (y + 1) | 0;
    memory[yAddress] = y;
  }
  memory[syAddress] = sourceY;
}

function pageStore(machine, linked) {
  const memory = machine.memory;
  const page = noctisBuffer(linked, "SADPT");
  const offset = value(memory, linked, "PGdi") & 0xffff;
  memory[page + offset] = value(memory, linked, "PGval") & 0xff;
}

function pageLoad(machine, linked) {
  const memory = machine.memory;
  const page = noctisBuffer(linked, "SADPT");
  const offset = value(memory, linked, "PGdi") & 0xffff;
  memory[address(linked, "PGval")] = memory[page + offset] & 0xff;
}

function multiplyUnsigned(machine) {
  const product = BigInt(machine.A >>> 0) * BigInt(machine.B >>> 0);
  machine.A = Number(product & 0xffffffffn) | 0;
  machine.D = Number((product >> 32n) & 0xffffffffn) | 0;
}

function multiplySigned(machine) {
  const product = BigInt.asUintN(64, BigInt(machine.A | 0) * BigInt(machine.B | 0));
  machine.A = Number(product & 0xffffffffn) | 0;
  machine.D = Number((product >> 32n) & 0xffffffffn) | 0;
}

function maskStarPage(machine, linked) {
  const memory = machine.memory;
  const base = value(memory, linked, "VHTmaskbase") >>> 0;
  for (let index = 0; index < 58240; index += 1) {
    memory[base + index] = (memory[base + index] & 0x3f) + 0x40;
  }
}

function cycleStarTexture(machine, linked) {
  const memory = machine.memory;
  const base = value(memory, linked, "VHTcyclebase") >>> 0;
  for (let index = 0; index < 64800; index += 1) {
    const pixel = memory[base + index] & 0xff;
    memory[base + index] = (pixel & 0xc0) | ((pixel + 1) & 0x3f);
  }
}

function smoothStarPage(machine, linked) {
  const memory = machine.memory;
  const base = value(memory, linked, "VHTsmoothbase") >>> 0;
  let accumulator = 0;
  for (let index = 0; index < 56960; index += 1) {
    const destination = base + 320 + index;
    for (let column = 0; column < 4; column += 1) {
      const pointer = destination + column;
      const sum = (memory[pointer - 320] & 0xff)
        + (memory[pointer] & 0xff)
        + (memory[pointer + 320] & 0xff)
        + (memory[pointer + 640] & 0xff);
      accumulator = (accumulator + ((sum & 0xfc) >>> 2)) & 0xff;
    }
    accumulator >>>= 2;
    memory[destination] = accumulator;
  }
}

function copyPlanetView(machine, linked) {
  const memory = machine.memory;
  const source = value(memory, linked, "SPcpfrom") >>> 0;
  const destination = value(memory, linked, "SPcpto") >>> 0;
  const count = value(memory, linked, "PVj") >>> 0;
  for (let index = 0; index < count; index += 1) {
    memory[destination + index] = memory[source + index];
  }
}

function scanPage(machine, linked, repeatEqual) {
  const memory = machine.memory;
  const page = noctisBuffer(linked, "SADPT");
  let count = value(memory, linked, "SCcx") >>> 0;
  let offset = value(memory, linked, "SCdi") & 0xffff;
  const expected = value(memory, linked, "SCal") | 0;
  let sample = 0;
  let equal = false;
  do {
    sample = memory[page + offset] & 0xff;
    count = (count - 1) >>> 0;
    offset = (offset + 1) & 0xffff;
    equal = sample === expected;
  } while (count !== 0 && equal === repeatEqual);
  memory[address(linked, "PGdi")] = (offset - 1) & 0xffff;
  memory[address(linked, "PGval")] = sample;
  memory[address(linked, "SCzf")] = equal ? 1 : 0;
  memory[address(linked, "SCdi")] = offset;
  memory[address(linked, "SCcx")] = count | 0;
}

function scanNotEqual(machine, linked) {
  scanPage(machine, linked, false);
}

function scanEqual(machine, linked) {
  scanPage(machine, linked, true);
}

function fillBytes(machine, linked) {
  const memory = machine.memory;
  const page = noctisBuffer(linked, "SADPT");
  let offset = value(memory, linked, "SCdi") & 0xffff;
  const count = value(memory, linked, "SCcx") >>> 0;
  const byte = value(memory, linked, "DBal") & 0xff;
  const census = address(linked, "CSbyte");
  memory[census] = (memory[census] + count) | 0;
  for (let index = 0; index < count; index += 1) {
    memory[page + offset] = byte;
    offset = (offset + 1) & 0xffff;
  }
  memory[address(linked, "SCdi")] = offset;
  memory[address(linked, "SCcx")] = 0;
  memory[address(linked, "PGdi")] = (offset - 1) & 0xffff;
  memory[address(linked, "PGval")] = byte;
}

function traceVertical(machine, linked) {
  const memory = machine.memory;
  const page = noctisBuffer(linked, "SADPT");
  let offset = value(memory, linked, "SGpi") & 0xffff;
  const limit = value(memory, linked, "SGpf") >>> 0;
  do {
    memory[page + offset] = 0xff;
    offset = (offset + 320) & 0xffff;
  } while ((offset >>> 0) < limit);
  memory[address(linked, "SGpi")] = offset;
  memory[address(linked, "PGdi")] = (offset - 320) & 0xffff;
  memory[address(linked, "PGval")] = 0xff;
}

function traceSegment(machine, linked) {
  const memory = machine.memory;
  const page = noctisBuffer(linked, "SADPT");
  let globalX = value(memory, linked, "SGgx") | 0;
  let globalY = value(memory, linked, "SGgy") | 0;
  const xStep = value(memory, linked, "SGa") | 0;
  const yStep = value(memory, linked, "SGb") | 0;
  const limit = value(memory, linked, "SGt") >>> 0;
  let offset = 0;
  do {
    const row = Math.imul(globalY >> 16, 320) & 0xffff;
    const column = (globalX >> 16) & 0xffff;
    offset = (row + column + 4) & 0xffff;
    memory[page + offset] = 0xff;
    globalX = (globalX + xStep) | 0;
    globalY = (globalY + yStep) | 0;
  } while ((globalX >>> 0) < limit);
  memory[address(linked, "SGgx")] = globalX;
  memory[address(linked, "SGgy")] = globalY;
  memory[address(linked, "PGdi")] = offset;
  memory[address(linked, "PGval")] = 0xff;
}

function finishRasterFill(memory, linked, offset, byte) {
  memory[address(linked, "DBdi")] = offset;
  memory[address(linked, "DBcx")] = 0;
  memory[address(linked, "PGdi")] = (offset - 1) & 0xffff;
  memory[address(linked, "PGval")] = byte;
}

function addRasterCensus(memory, linked, count) {
  const census = address(linked, "CSbyte");
  memory[census] = (memory[census] + count) | 0;
}

function fillFlare(machine, linked) {
  const memory = machine.memory;
  const page = noctisBuffer(linked, "SADPT");
  let offset = value(memory, linked, "DBdi") & 0xffff;
  const count = value(memory, linked, "DBcx") >>> 0;
  const delta = value(memory, linked, "DBdl") & 0xff;
  addRasterCensus(memory, linked, count);
  let byte = 0;
  for (let index = 0; index < count; index += 1) {
    byte = (((memory[page + ((offset - 1) & 0xffff)] & 0x3f) + delta) & 0xff);
    if (byte >= 62) byte = 62;
    memory[page + offset] = byte;
    offset = (offset + 1) & 0xffff;
  }
  finishRasterFill(memory, linked, offset, byte);
}

function fillHalo(machine, linked) {
  const memory = machine.memory;
  const page = noctisBuffer(linked, "SADPT");
  let offset = value(memory, linked, "DBdi") & 0xffff;
  let count = value(memory, linked, "DBcx") >>> 0;
  addRasterCensus(memory, linked, count);
  let byte = 0;
  while (count !== 0) {
    byte = memory[page + offset] & 0xff;
    if (byte === 0xff) {
      byte = (memory[page + ((offset - 321) & 0xffff)] & 0x3f) | 0x40;
    } else {
      byte = ((((byte & 0x3f) | 0x40) + count) & 0xff);
      if (byte >= 0x80) byte = 0x7f;
    }
    memory[page + offset] = byte;
    offset = (offset + 1) & 0xffff;
    count = (count - 1) >>> 0;
  }
  finishRasterFill(memory, linked, offset, byte);
}

function fillHaloFallback(machine, linked) {
  const memory = machine.memory;
  const page = noctisBuffer(linked, "SADPT");
  let offset = value(memory, linked, "DBdi") & 0xffff;
  let count = value(memory, linked, "DBcx") >>> 0;
  addRasterCensus(memory, linked, count);
  let byte = 0;
  while (count !== 0) {
    byte = memory[page + ((offset - 321) & 0xffff)] & 0xff;
    if (byte === 0xff) byte = (memory[page + ((offset - 642) & 0xffff)] & 0x3f) | 0x40;
    memory[page + offset] = byte;
    offset = (offset + 1) & 0xffff;
    count = (count - 1) >>> 0;
  }
  finishRasterFill(memory, linked, offset, byte);
}

function initializePolygonRows(machine, linked) {
  const memory = machine.memory;
  let row = value(memory, linked, "EWminy") | 0;
  const maximum = value(memory, linked, "EWmaxy") | 0;
  const fractions = value(memory, linked, "PGfpartbase") >>> 0;
  const integers = value(memory, linked, "PGipartbase") >>> 0;
  do {
    memory[fractions + row] = 5;
    memory[integers + row] = 311;
    row = (row + 1) | 0;
  } while (row <= maximum);
  memory[address(linked, "PGi")] = row;
}

function texturePixel(memory, texture, textureOffset, u, v) {
  const index = (((v & 0xff00) | ((u >>> 8) & 0xff)) + textureOffset) >>> 0;
  return memory[texture + index] & 0xff;
}

function terrainPixelBlock(machine, linked) {
  const memory = machine.memory;
  const texture = polygonBuffer(memory, linked, "RPBG");
  const page = polygonBuffer(memory, linked, "SADPT");
  const diAddress = address(linked, "SPdi");
  const uAddress = address(linked, "SPax");
  const vAddress = address(linked, "SPdx");
  const countAddress = address(linked, "SPcl");
  let offset = memory[diAddress] & 0xffff;
  let u = memory[uAddress] & 0xffff;
  let v = memory[vAddress] & 0xffff;
  let count = memory[countAddress] >>> 0;
  const du = value(memory, linked, "SPbp") | 0;
  const dv = value(memory, linked, "SPsi") | 0;
  const textureOffset = value(memory, linked, "PGtexoff") | 0;
  const tint = value(memory, linked, "SPtinta") | 0;
  while (count !== 0) {
    offset = (offset + 1) & 0xffff;
    const pixel = (texturePixel(memory, texture, textureOffset, u, v) + tint) & 0xff;
    u = (u + du) & 0xffff;
    memory[page + ((offset + 3) & 0xffff)] = pixel;
    v = (v + dv) & 0xffff;
    count = (count - 1) >>> 0;
  }
  memory[diAddress] = offset;
  memory[uAddress] = u;
  memory[vAddress] = v;
  memory[countAddress] = 0;
}

function terrainCullPixelBlock(machine, linked) {
  const memory = machine.memory;
  const texture = polygonBuffer(memory, linked, "RPBG");
  const page = polygonBuffer(memory, linked, "SADPT");
  const diAddress = address(linked, "SPdi");
  const uAddress = address(linked, "SPax");
  const vAddress = address(linked, "SPdx");
  const countAddress = address(linked, "SPcl");
  let offset = memory[diAddress] & 0xffff;
  let u = memory[uAddress] & 0xffff;
  let v = memory[vAddress] & 0xffff;
  let count = memory[countAddress] >>> 0;
  const du = value(memory, linked, "SPbp") | 0;
  const dv = value(memory, linked, "SPsi") | 0;
  const textureOffset = value(memory, linked, "PGtexoff") | 0;
  const tint = value(memory, linked, "SPtinta") | 0;
  while (count !== 0) {
    offset = (offset + 2) & 0xffff;
    const pixel = (texturePixel(memory, texture, textureOffset, u, v) + tint) & 0xff;
    u = (u + du) & 0xffff;
    memory[page + ((offset + 2) & 0xffff)] = pixel;
    memory[page + ((offset + 3) & 0xffff)] = pixel;
    v = (v + dv) & 0xffff;
    count = (count - 1) >>> 0;
  }
  memory[diAddress] = offset;
  memory[uAddress] = u;
  memory[vAddress] = v;
  memory[countAddress] = 0;
}

function transparentPixel(machine, linked) {
  const memory = machine.memory;
  const texture = polygonBuffer(memory, linked, "RPBG");
  const page = polygonBuffer(memory, linked, "SADPT");
  const diAddress = address(linked, "SPdi");
  const uAddress = address(linked, "SPax");
  const vAddress = address(linked, "SPdx");
  const offset = ((memory[diAddress] & 0xffff) + 1) & 0xffff;
  let u = memory[uAddress] & 0xffff;
  let v = memory[vAddress] & 0xffff;
  const destination = (offset + 3) & 0xffff;
  const pixel = ((memory[page + destination] & 0xff)
    + texturePixel(memory, texture, value(memory, linked, "PGtexoff") | 0, u, v)) & 0xff;
  u = (u + value(memory, linked, "SPbp")) & 0xffff;
  v = (v + value(memory, linked, "SPsi")) & 0xffff;
  memory[page + destination] = pixel;
  memory[diAddress] = offset;
  memory[uAddress] = u;
  memory[vAddress] = v;
}

function transparentCullPixel(machine, linked) {
  const memory = machine.memory;
  const texture = polygonBuffer(memory, linked, "RPBG");
  const page = polygonBuffer(memory, linked, "SADPT");
  const diAddress = address(linked, "SPdi");
  const uAddress = address(linked, "SPax");
  const vAddress = address(linked, "SPdx");
  const offset = ((memory[diAddress] & 0xffff) + 2) & 0xffff;
  let u = memory[uAddress] & 0xffff;
  let v = memory[vAddress] & 0xffff;
  const right = (offset + 3) & 0xffff;
  const pixel = ((memory[page + right] & 0xff)
    + texturePixel(memory, texture, value(memory, linked, "PGtexoff") | 0, u, v)) & 0xff;
  u = (u + value(memory, linked, "SPbp")) & 0xffff;
  v = (v + value(memory, linked, "SPsi")) & 0xffff;
  memory[page + ((offset + 2) & 0xffff)] = pixel;
  memory[page + right] = pixel;
  memory[diAddress] = offset;
  memory[uAddress] = u;
  memory[vAddress] = v;
}

function duplicateHalfScan(machine, linked) {
  const memory = machine.memory;
  const page = polygonBuffer(memory, linked, "SADPT");
  const diAddress = address(linked, "SPdi");
  const countAddress = address(linked, "SPn");
  let offset = memory[diAddress] & 0xffff;
  let count = memory[countAddress] >>> 0;
  while (count !== 0) {
    const pixel = memory[page + ((offset - 316) & 0xffff)] & 0xff;
    memory[page + ((offset + 4) & 0xffff)] = pixel;
    memory[page + ((offset + 324) & 0xffff)] = pixel;
    offset = (offset + 1) & 0xffff;
    count = (count - 1) >>> 0;
  }
  memory[diAddress] = offset;
  memory[countAddress] = 0;
}

function resetFloatingPoint(machine, linked) {
  machine.fpu = {
    control: value(machine.memory, linked, "FCW") & 0xffff,
    stack: [],
  };
}

export const NOCTIS_INTRINSIC_IDS = IDS;

export function createNoctisIntrinsics(overrides = {}) {
  return {
    [IDS.copyRegion]: copyRegion,
    [IDS.expandIndexed]: expandIndexed,
    [IDS.scale2x]: scale2x,
    [IDS.scaleNearest]: scaleNearest,
    [IDS.pageStore]: pageStore,
    [IDS.pageLoad]: pageLoad,
    [IDS.multiplyUnsigned]: multiplyUnsigned,
    [IDS.multiplySigned]: multiplySigned,
    [IDS.foldMultiplySigned]: multiplySigned,
    [IDS.maskStarPage]: maskStarPage,
    [IDS.cycleStarTexture]: cycleStarTexture,
    [IDS.smoothStarPage]: smoothStarPage,
    [IDS.copyPlanetView]: copyPlanetView,
    [IDS.scanNotEqual]: scanNotEqual,
    [IDS.scanEqual]: scanEqual,
    [IDS.fillBytes]: fillBytes,
    [IDS.traceVertical]: traceVertical,
    [IDS.traceSegment]: traceSegment,
    [IDS.fillFlare]: fillFlare,
    [IDS.fillHalo]: fillHalo,
    [IDS.fillHaloFallback]: fillHaloFallback,
    [IDS.initializePolygonRows]: initializePolygonRows,
    [IDS.terrainPixelBlock]: terrainPixelBlock,
    [IDS.terrainCullPixelBlock]: terrainCullPixelBlock,
    [IDS.transparentPixel]: transparentPixel,
    [IDS.transparentCullPixel]: transparentCullPixel,
    [IDS.duplicateHalfScan]: duplicateHalfScan,
    [IDS.resetFloatingPoint]: resetFloatingPoint,
    ...overrides,
  };
}
