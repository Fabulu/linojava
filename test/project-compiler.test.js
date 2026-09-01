import assert from "node:assert/strict";
import test from "node:test";
import {
  compileProject, compileLinkedProject, emitStaticRunnerModule,
} from "../src/compiler/project-compiler.js";
import { linkProject } from "../src/compiler/linker.js";
import { loadProject } from "../src/compiler/project-loader.js";

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

test("yielding host calls carry their requested browser delay", async () => {
  const program = await compileProject("sleep.lino", {
    resolveSource() { return '"programme" isocall; end;'; },
  }, {
    host: { isocall() { return { yielded: true, sleepMilliseconds: 7, success: true }; } },
  });
  assert.deepEqual(program.run(5), {
    status: "yield", instructions: 1, X: 0x646f6e65, sleepMilliseconds: 7,
  });
});

test("direct calls use an available portable service fast path", async () => {
  const source = `
    "variables" result = 0;
    "programme"
      => Fast Service;
      [result] = A;
      end;
    "service Fast Service"
      A = 1;
      A + 1;
      end;
  `;
  let calls = 0;
  const program = await compileProject("service.lino", { resolveSource() { return source; } }, {
    host: { intrinsics: { "service:fastservice"(machine) { calls += 1; machine.A = 42; } } },
  });
  assert.equal(program.run(10).status, "halted");
  assert.equal(calls, 1);
  assert.equal(program.machine.memory[program.linked.symbols.get("result").value], 42);
});

test("unsigned arithmetic, postfix NOT, and float predicates lower to JavaScript", async () => {
  const source = `
    "variables" dividend = 0ffffffffh; divisor = 2; float one = 1f; float two = 2f; result = 0;
    "programme"
      A = [dividend]; A '/ [divisor]; [result] = A;
      B = [dividend]; B '% [divisor]; B !;
      ?? [float one] < [float two] -> Good;
      fail;
    "Good"
      end;
  `;
  const program = await compileProject("unsigned.lino", { resolveSource() { return source; } });
  const result = program.run(30);
  assert.equal(result.X, 0x646f6e65);
  assert.equal(program.machine.memory[program.linked.symbols.get("result").value], 0x7fffffff);
  assert.equal(program.machine.B, -2);
});

test("split multiply writes exact low and high halves", async () => {
  const signedSource = '"variables" left = 0; right = 0; "programme" [left] *% [right]; end;';
  const signed = await compileProject("split-signed.lino", { resolveSource() { return signedSource; } });
  const signedLeft = signed.linked.symbols.get("left").value;
  const signedRight = signed.linked.symbols.get("right").value;
  signed.machine.memory[signedLeft] = -123456789;
  signed.machine.memory[signedRight] = 987654321;
  signed.run(5);
  const signedProduct = BigInt(-123456789) * BigInt(987654321);
  assert.equal(signed.machine.memory[signedLeft], Number(BigInt.asIntN(32, signedProduct)));
  assert.equal(signed.machine.memory[signedRight], Number(BigInt.asIntN(32, signedProduct >> 32n)));

  const unsignedSource = `
    "variables" left = 0; right = 0;
    "programme"
      A = right;
      [left] *%' [A];
      end;
  `;
  const unsigned = await compileProject("split-unsigned.lino", { resolveSource() { return unsignedSource; } });
  const unsignedLeft = unsigned.linked.symbols.get("left").value;
  const unsignedRight = unsigned.linked.symbols.get("right").value;
  unsigned.machine.memory[unsignedLeft] = -1;
  unsigned.machine.memory[unsignedRight] = -1;
  unsigned.run(5);
  assert.equal(unsigned.machine.memory[unsignedLeft], 1);
  assert.equal(unsigned.machine.memory[unsignedRight], -2);
});

test("binary64 arithmetic supports direct and indirect paired-unit operands", async () => {
  const cases = [
    ["+:", 1.5, 2.25, 3.75],
    ["-:", -0, 0, -0],
    ["*:", Number.MAX_VALUE, 2, Infinity],
    ["/:", 1, -Infinity, -0],
  ];
  for (const [operator, left, right, expected] of cases) {
    const source = `
      "variables" left = 0; 0; right = 0; 0;
      "programme"
        A = right;
        [left] ${operator} [A];
        end;
    `;
    const program = await compileProject("binary64.lino", { resolveSource() { return source; } });
    const view = new DataView(program.machine.memory.buffer);
    const leftAddress = program.linked.symbols.get("left").value * 4;
    const rightAddress = program.linked.symbols.get("right").value * 4;
    view.setFloat64(leftAddress, left, true);
    view.setFloat64(rightAddress, right, true);
    assert.equal(program.run(10).status, "halted");
    assert.ok(Object.is(view.getFloat64(leftAddress, true), expected));
  }

  const source = '"variables" left = 0; 0; right = 0; 0; "programme" [left] *: [right]; end;';
  const program = await compileProject("binary64-nan.lino", { resolveSource() { return source; } });
  const view = new DataView(program.machine.memory.buffer);
  view.setFloat64(program.linked.symbols.get("left").value * 4, 0, true);
  view.setFloat64(program.linked.symbols.get("right").value * 4, Infinity, true);
  program.run(5);
  assert.ok(Number.isNaN(view.getFloat64(program.linked.symbols.get("left").value * 4, true)));
});

test("binary64 conversion and narrowing preserve Lino edge semantics", async () => {
  const conversionSource = `
    "variables" wide = 0; 0; integer = 0;
    "programme"
      [integer] =: [wide];
      end;
  `;
  const conversions = [[2.5, 2], [3.5, 4], [-1.5, -2], [Infinity, -2147483648], [2147483647.5, -2147483648]];
  for (const [value, expected] of conversions) {
    const program = await compileProject("binary64-to-int.lino", { resolveSource() { return conversionSource; } });
    const view = new DataView(program.machine.memory.buffer);
    view.setFloat64(program.linked.symbols.get("wide").value * 4, value, true);
    program.run(5);
    assert.equal(program.machine.memory[program.linked.symbols.get("integer").value], expected);
  }

  const wideningSource = `
    "variables" wide = 0; 0; integer = 0;
    "programme"
      [wide] := [integer];
      end;
  `;
  for (const value of [-2147483648, 2147483647]) {
    const program = await compileProject("int-to-binary64.lino", { resolveSource() { return wideningSource; } });
    const view = new DataView(program.machine.memory.buffer);
    program.machine.memory[program.linked.symbols.get("integer").value] = value;
    program.run(5);
    assert.equal(view.getFloat64(program.linked.symbols.get("wide").value * 4, true), value);
  }

  const narrowSource = '"variables" wide = 0; 0; "programme" ~: [wide]; end;';
  for (const value of [1 + 2 ** -24, -0, Infinity]) {
    const program = await compileProject("binary64-narrow.lino", { resolveSource() { return narrowSource; } });
    const view = new DataView(program.machine.memory.buffer);
    const address = program.linked.symbols.get("wide").value * 4;
    view.setFloat64(address, value, true);
    program.run(5);
    assert.ok(Object.is(view.getFloat64(address, true), Math.fround(value)));
  }
});

test("static runners execute binary64 instructions identically", async () => {
  const source = `
    "variables" left = 0; 0; right = 0; 0; result = 0;
    "programme"
      [left] *: [right];
      [result] =: [left];
      end;
  `;
  const project = await loadProject("binary64-static.lino", { resolveSource() { return source; } });
  const linked = linkProject(project);
  const moduleSource = emitStaticRunnerModule(linked, {}, { regionSize: 256 });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
  const generated = await import(moduleUrl);
  const dynamic = compileLinkedProject(linked, {}, { regionSize: 256 });
  const precompiled = compileLinkedProject(linked, {}, {
    precompiledRunners: {
      create: generated.createRunners,
      instructionCount: generated.instructionCount,
      regionSize: generated.regionSize,
    },
  });
  for (const program of [dynamic, precompiled]) {
    const view = new DataView(program.machine.memory.buffer);
    view.setFloat64(linked.symbols.get("left").value * 4, 6.5, true);
    view.setFloat64(linked.symbols.get("right").value * 4, 4, true);
  }
  assert.deepEqual(precompiled.run(10), dynamic.run(10));
  assert.deepEqual(precompiled.machine.memory, dynamic.machine.memory);
  assert.equal(dynamic.machine.memory[linked.symbols.get("result").value], 26);
});

test("native fragments require explicit portable intrinsic implementations", async () => {
  const source = '"programme" { DE AD BE EF } ; end;';
  const project = await loadProject("native.lino", { resolveSource() { return source; } });
  const linked = linkProject(project);
  assert.equal(linked.nativeFragments.length, 1);
  assert.throws(() => compileLinkedProject(linked), /Missing portable Lino intrinsics/);
  const id = linked.nativeFragments[0].id;
  const program = compileLinkedProject(linked, {}, {
    intrinsics: { [id](machine) { machine.A = 42; } },
  });
  assert.equal(program.run(5).status, "halted");
  assert.equal(program.machine.A, 42);
});

test("static runner modules execute the same linked project without dynamic functions", async () => {
  const source = `
    "variables" result = 0;
    "programme"
      A = 21;
      => Double;
      [result] = A;
      end;
    "Double"
      A * 2;
      end;
  `;
  const project = await loadProject("static.lino", { resolveSource() { return source; } });
  const linked = linkProject(project);
  const moduleSource = emitStaticRunnerModule(linked, {}, { regionSize: 256 });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
  const generated = await import(moduleUrl);
  const dynamic = compileLinkedProject(linked, {}, { regionSize: 256 });
  const precompiled = compileLinkedProject(linked, {}, {
    precompiledRunners: {
      create: generated.createRunners,
      instructionCount: generated.instructionCount,
      regionSize: generated.regionSize,
    },
  });
  assert.deepEqual(precompiled.run(20), dynamic.run(20));
  const { callCode: precompiledCallCode, ...precompiledState } = precompiled.machine;
  const { callCode: dynamicCallCode, ...dynamicState } = dynamic.machine;
  assert.equal(typeof precompiledCallCode, "function");
  assert.equal(typeof dynamicCallCode, "function");
  assert.deepEqual(precompiledState, dynamicState);
});
