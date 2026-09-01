import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { linkProject } from "../src/compiler/linker.js";
import { loadProject } from "../src/compiler/project-loader.js";
import { emitStaticRunnerModule } from "../src/compiler/project-compiler.js";

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

test("current shared Noctis and NIVGEN closures emit static runners", {
  skip: !existsSync(GAME_ENTRY) && `No sibling Linoleum checkout at ${LINO_ROOT}`,
}, async () => {
  const game = await loadClosure(GAME_ENTRY);
  assert.equal(game.modules.length, 74);
  assert.equal(game.stockfiles.length, 23);
  await instantiateStaticRunners(linkProject(game));

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
