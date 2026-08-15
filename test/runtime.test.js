import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";

async function loadGenerated(source) {
  const encoded = Buffer.from(compile(source), "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

test("a self-loop consumes its execution budget without redispatching through switch", async () => {
  const generated = await loadGenerated(`
    "variables";
    ticks = 0;
    "programme";
    "start";
    [ticks]+;
    -> start;
  `);
  const program = generated.createProgram();

  const first = program.step(3);
  assert.deepEqual(first, { status: "budget", blocks: 3 });
  assert.equal(program.get("ticks"), 3);

  const second = program.step(2);
  assert.deepEqual(second, { status: "budget", blocks: 2 });
  assert.equal(program.get("ticks"), 5);
});

test("nested calls preserve typed return addresses through snapshot and restore", async () => {
  const generated = await loadGenerated(`
    "variables";
    value = 0;
    "programme";
    "start";
    => outer;
    "after";
    end;
    "outer";
    [value]+;
    => inner;
    "outer-return";
    leave;
    "inner";
    [value]+;
    isocall;
    "inner-return";
    leave;
  `);
  const program = generated.createProgram({ isocall: () => true });

  assert.deepEqual(program.step(), { status: "yield", blocks: 3 });
  assert.equal(program.get("value"), 2);

  const saved = program.snapshot();
  assert.deepEqual(saved.callStack, [1, 3]);
  assert.equal(saved.pc, 5);

  program.set("value", 99);
  assert.deepEqual(program.step(), { status: "halted", blocks: 3 });
  assert.equal(program.get("value"), 99);

  program.restore(saved);
  assert.equal(program.get("value"), 2);
  assert.deepEqual(program.step(), { status: "halted", blocks: 3 });
});
