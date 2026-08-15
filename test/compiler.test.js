import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compile, inspect } from "../src/compiler.js";

async function loadGenerated(source) {
  const encoded = Buffer.from(compile(source), "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

test("compiles blocks and runs a yielding Lino programme", async () => {
  const source = await readFile(new URL("../examples/browser_probe.lino", import.meta.url), "utf8");
  const report = inspect(source);
  assert.ok(report.blocks >= 5);
  assert.deepEqual(report.symbols, ["player_x", "player_y", "input_x", "input_y", "frame"]);

  const generated = await loadGenerated(source);
  const program = generated.createProgram({ isocall: () => true });
  program.set("input_x", 3);
  program.set("input_y", -2);
  assert.equal(program.step().status, "yield");
  assert.equal(program.get("player_x"), 157);
  assert.equal(program.get("player_y"), 90);
  assert.equal(program.get("frame"), 1);
});

test("rejects native byte fragments instead of silently changing them", () => {
  const source = '"programme" "start" { 90 } end;';
  assert.throws(() => compile(source), /portable intrinsic/);
});
