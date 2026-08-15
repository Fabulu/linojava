import assert from "node:assert/strict";
import test from "node:test";
import { groupPeriods, lexSource, periodStatements } from "../src/compiler/lexer.js";
import { inspectProject, loadProject } from "../src/compiler/project-loader.js";

test("lexes nested comments and keeps semicolons inside braced data", () => {
  const source = `
    (outer comment; (nested comment { ignored; }))
    " Li br aries " first;
    " Programme " "start" { 10; 20; } end;
  `;

  const items = lexSource(source, { sourceId: "fixture.lino" });
  const periods = groupPeriods(items);

  assert.deepEqual(periods.map((period) => period.name), ["libraries", "programme"]);
  assert.deepEqual(periodStatements(periods, "libraries").map((item) => item.text), ["first"]);
  assert.deepEqual(periodStatements(periods, "programme").map((item) => item.text), [
    "{ 10; 20; } end",
  ]);
});

test("programme labels cannot reopen periods and stray delimiters are errors", () => {
  const periods = groupPeriods(lexSource(
    '"programme" "libraries" -> libraries; "stockfile" end;',
    { sourceId: "labels.lino" },
  ));
  assert.deepEqual(periods.map((period) => period.name), ["programme"]);
  assert.throws(() => lexSource('"libraries" dependency);', { sourceId: "close.lino" }), /close\.lino:1: Unmatched closing comment/);
  assert.throws(() => lexSource('"programme" } end;', { sourceId: "brace.lino" }), /brace\.lino:1: Unmatched closing braced-data/);
});

test("loads libraries recursively in dependency order and emits each module once", async () => {
  const sources = new Map([
    ["entry", '"libraries" alpha; beta; alpha;'],
    ["alpha", '"libraries" shared;'],
    ["beta", '"libraries" shared;'],
    ["shared", '"variables" value;'],
  ]);

  const project = await loadProject("entry", {
    resolveSource(specifier) {
      return sources.get(specifier);
    },
  });

  assert.deepEqual(project.modules.map((module) => module.id), ["shared", "alpha", "beta", "entry"]);
  assert.equal(new Set(project.modules.map((module) => module.id)).size, project.modules.length);
  assert.deepEqual(project.modules.at(-1).libraries, ["alpha", "beta", "alpha"]);
});

test("module identity follows Lino case and path separator rules", async () => {
  const project = await loadProject("entry", {
    resolveSource(specifier) {
      if (specifier === "entry") return '"libraries" Region; region;';
      return { id: `LIB\\${specifier}.TXT`, source: '"variables" value = 0;' };
    },
  });
  assert.deepEqual(project.modules.map((module) => module.id), ["LIB\\Region.TXT", "entry"]);
  assert.deepEqual(project.modules.at(-1).libraries, ["LIB\\Region.TXT", "LIB\\Region.TXT"]);
});

test("collects stockfile bytes once while preserving module and asset order", async () => {
  const sources = new Map([
    ["entry", '"libraries" child; "stockfile" shared.bin; root.bin;'],
    ["child", '"stockfile" shared.bin; child.bin;'],
  ]);
  const assets = new Map([
    ["shared.bin", new Uint8Array([1, 2, 3])],
    ["child.bin", new Uint8Array([4, 5])],
    ["root.bin", new Uint8Array([6, 7]).buffer],
  ]);

  const report = await inspectProject("entry", {
    resolveSource(specifier) {
      return sources.get(specifier);
    },
    resolveStockfile(specifier) {
      return assets.get(specifier);
    },
  });

  assert.deepEqual(report.modules.map((module) => module.id), ["child", "entry"]);
  assert.deepEqual(report.stockfiles, [
    { id: "shared.bin", bytes: 3 },
    { id: "child.bin", bytes: 2 },
    { id: "root.bin", bytes: 2 },
  ]);
});

test("reports a source location when stockfiles have no resolver", async () => {
  await assert.rejects(
    () => loadProject("entry", { resolveSource: () => '"stockfile" asset.bin;' }),
    /entry:1: Project requires resolveStockfile\(specifier, importer\)/,
  );
});
