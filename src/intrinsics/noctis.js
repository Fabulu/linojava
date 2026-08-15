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
});

function address(linked, name) {
  const symbol = linked.symbols.get(canonicalName(name));
  if (!symbol) throw new ReferenceError(`Missing Noctis Lino symbol ${name}`);
  return symbol.value >>> 0;
}

function value(memory, linked, name) {
  return memory[address(linked, name)] | 0;
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
  const page = address(linked, "SADPT");
  const offset = value(memory, linked, "PGdi") & 0xffff;
  memory[page + offset] = value(memory, linked, "PGval") & 0xff;
}

function pageLoad(machine, linked) {
  const memory = machine.memory;
  const page = address(linked, "SADPT");
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
    ...overrides,
  };
}
