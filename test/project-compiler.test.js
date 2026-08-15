import assert from "node:assert/strict";
import test from "node:test";
import { compileProject } from "../src/compiler/project-compiler.js";

test("project compiler uses one shared data/call stack and preserves Lino status", async () => {
  const source = `
    "variables"
      worker pointer = service Worker;
      result = 0;
    "programme"
      A = 41;
      A -->;
      => [worker pointer];
      <-- B;
      [result] = B;
      ? ok -> Success;
      fail;
    "Success"
      end;
    "service Worker"
      C = $:1;
      C + 1;
      $:1 = C;
      end;
    "Leave Root"
      leave;
    "Fail Root"
      fail;
  `;
  const program = await compileProject("entry.lino", {
    resolveSource() { return source; },
  });

  const result = program.run(100);
  assert.equal(result.status, "halted");
  assert.equal(result.X, 0x646f6e65);
  assert.equal(program.machine.memory[program.linked.symbols.get("result").value], 42);
  assert.equal(program.machine.depth, 0);

  program.reset();
  program.machine.X = 123;
  program.machine.pc = program.linked.labels.get("leaveroot");
  assert.equal(program.run(2).X, 123);
  program.reset();
  program.machine.pc = program.linked.labels.get("failroot");
  assert.equal(program.run(2).X, 0x6661696c);
});

test("swap evaluates both destination addresses before either write", async () => {
  const source = `
    "variables" first = 9; other value = 17;
    "programme"
      A = first;
      A <> [A];
      end;
  `;
  const program = await compileProject("swap.lino", { resolveSource() { return source; } });
  program.run(10);
  assert.equal(program.machine.A, 9);
  assert.equal(program.machine.memory[program.linked.symbols.get("first").value], 1);
});

test("compileProject attaches its linked stockfile to the default host", async () => {
  const source = `
    "stockfile" asset.bin;
    "variables" destination = 0; 0;
    "programme"
      [File Position] = asset.bin;
      [Block Pointer] = destination;
      [Block Size] = Size of asset.bin;
      [File Command] = READ;
      isocall;
      end;
  `;
  const program = await compileProject("stock.lino", {
    resolveSource() { return source; },
    resolveStockfile() { return Uint8Array.from([3, 1, 4, 1, 5]); },
  });
  assert.equal(program.run(20).status, "halted");
  const address = program.linked.symbols.get("destination").value * 4;
  assert.deepEqual(
    Array.from(new Uint8Array(program.machine.memory.buffer).slice(address, address + 5)),
    [3, 1, 4, 1, 5],
  );
});
