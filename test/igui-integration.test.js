import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { compileLinkedProject } from "../src/compiler/project-compiler.js";
import { dispatchIsoKernel, OFFSETS } from "../src/compiler/isokernel-abi.js";
import { linkProject } from "../src/compiler/linker.js";
import { loadProject } from "../src/compiler/project-loader.js";

const linoRoot = process.env.LINO_SOURCE_ROOT ?? path.resolve(process.cwd(), "..", "linoleum");
const entry = path.join(linoRoot, "examples", "iGUIcli.txt");

async function firstFile(candidates, suffixes) {
  for (const candidate of candidates) {
    for (const suffix of suffixes) {
      const filename = `${candidate}${suffix}`;
      try { return { filename, data: await fs.readFile(filename) }; } catch { /* try next */ }
    }
  }
  throw new Error(`Cannot resolve ${candidates.join(", ")}`);
}

function candidates(specifier, importer) {
  const name = specifier.replaceAll("\\", "/");
  if (name.startsWith("/")) return [path.join(linoRoot, "main", "lib", name.slice(1))];
  return [path.resolve(path.dirname(importer ?? entry), name), path.join(linoRoot, "main", "lib", name)];
}

const resolvers = {
  async resolveSource(specifier, importer) {
    const result = await firstFile(candidates(specifier, importer), ["", ".txt"]);
    return { id: result.filename, source: result.data.toString("utf8") };
  },
  async resolveStockfile(specifier, importer) {
    const result = await firstFile(candidates(specifier, importer), ["", ".tga"]);
    return { id: result.filename, data: new Uint8Array(result.data) };
  },
};

function hashUnits(units) {
  let hash = 0x811c9dc5;
  for (const value of units) {
    hash ^= value; hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

test("unmodified iGUI reaches its first real RETRACE", async (context) => {
  try { await fs.access(entry); } catch { context.skip(`Set LINO_SOURCE_ROOT to a Linoleum source tree`); return; }
  const linked = linkProject(await loadProject(entry, resolvers));
  assert.deepEqual(
    { instructions: linked.instructions.length, labels: linked.labels.size, unresolved: linked.unresolved.length },
    { instructions: 4609, labels: 714, unresolved: 0 },
  );
  assert.deepEqual(
    { initialized: linked.memoryLayout.initializedUnits, kernel: linked.memoryLayout.kernelBase, app: linked.memoryLayout.appData, ram: linked.memoryLayout.ramTop },
    { initialized: 2537, kernel: 2538, app: 35485, ram: 698841 },
  );

  const hashes = [];
  for (let pass = 0; pass < 2; pass += 1) {
    const calls = [];
    const host = {
      stockfile: linked.stockfile,
      directory: ".",
      retrace() { return true; },
      isocall(machine) {
        const base = linked.memoryLayout.kernelBase;
        calls.push([machine.memory[base + OFFSETS.DisplayCommand], machine.memory[base + OFFSETS.FileCommand]]);
        return dispatchIsoKernel(machine.memory, host, { kernelBase: base });
      },
    };
    const program = compileLinkedProject(linked, host);
    const result = program.run(2_000_000);
    assert.equal(result.status, "yield");
    assert.equal(result.X, 0x646f6e65);
    assert.equal(calls.length, 25);
    assert.deepEqual(calls.slice(0, 23), Array.from({ length: 23 }, () => [0, 14]));
    assert.deepEqual(calls.slice(23), [[0, 20], [1, 0]]);
    const display = program.machine.memory.subarray(41822, 41822 + 400 * 300);
    assert.ok(display.some((value) => value !== 0));
    hashes.push(hashUnits(display));
  }
  assert.equal(hashes[0], hashes[1]);
});
