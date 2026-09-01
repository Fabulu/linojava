import assert from "node:assert/strict";
import test from "node:test";
import {
  compileProject, compileLinkedProject, emitStaticRunnerModule,
} from "../src/compiler/project-compiler.js";
import { linkProject } from "../src/compiler/linker.js";
import { loadProject } from "../src/compiler/project-loader.js";
import {
  createNoctisIntrinsics,
  NOCTIS_SERVICE_INTRINSIC_IDS as NOCTIS_SERVICES,
} from "../src/intrinsics/noctis.js";

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

test("static integer-to-extended service matches all shared Lino call paths", async () => {
  const source = `
    "constants" XBIAS = 16383;
    "variables"
      XIN = 0; XS = 0; XE = 0; XMH = 0; XML = 0; xtmp = 0; xiter = 0;
      selector = 0; continuation = 0; conversion pointer = XFromInt;
    "programme"
      A = [selector];
      ? A = 0 -> Call zero;
      ? A = 1 -> Call one;
      -> Call two;
    "Call zero"
      => XFromInt; [continuation] = 10; end;
    "Call one"
      => XFromInt; [continuation] = 20; end;
    "Call two"
      => XFromInt; [continuation] = 30; end;
    "Indirect conversion"
      => [conversion pointer]; [continuation] = 40; end;
    "XFromInt"
      ---->;
      => XFromInt body;
      <----;
      end;
    "XFromInt body"
      [XS] = 0;
      A = [XIN];
      ? A != 0 -> XFI nonzero;
      [XE] = 0; [XMH] = 0; [XML] = 0;
      end;
    "XFI nonzero"
      A = [XIN]; A & 80000000h;
      ? A = 0 -> XFI pos;
      [XS] = 1;
      A = 0; A - [XIN]; [xtmp] = A;
      -> XFI norm;
    "XFI pos"
      A = [XIN]; [xtmp] = A;
    "XFI norm"
      [xiter] = 0;
    "XFI shl"
      A = [xtmp]; A & 80000000h;
      ? A != 0 -> XFI done;
      A = [xtmp]; A < 1; [xtmp] = A;
      [xiter]+;
      -> XFI shl;
    "XFI done"
      A = [xtmp]; [XMH] = A;
      [XML] = 0;
      A = XBIAS; A + 31; A - [xiter]; [XE] = A;
      end;
  `;
  const project = await loadProject("xfromint-service.lino", { resolveSource() { return source; } });
  const linked = linkProject(project);
  const allIntrinsics = createNoctisIntrinsics();
  const implementation = allIntrinsics[NOCTIS_SERVICES.xFromInt];
  const intrinsics = { [NOCTIS_SERVICES.xFromInt]: implementation };
  const moduleSource = emitStaticRunnerModule(linked, intrinsics, { regionSize: 256 });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
  const generated = await import(moduleUrl);
  const fallback = compileLinkedProject(linked, {}, { regionSize: 256 });
  let serviceCalls = 0;
  const direct = compileLinkedProject(linked, {}, {
    regionSize: 256,
    intrinsics: {
      [NOCTIS_SERVICES.xFromInt](machine, directLinked) {
        serviceCalls += 1;
        implementation(machine, directLinked);
      },
    },
  });
  const precompiled = compileLinkedProject(linked, {}, {
    intrinsics,
    precompiledRunners: {
      create: generated.createRunners,
      instructionCount: generated.instructionCount,
      regionSize: generated.regionSize,
    },
  });
  const at = (name) => linked.symbols.get(name).value;
  const initialize = (program, selector, input) => {
    program.reset();
    program.machine.memory[at("selector")] = selector;
    program.machine.memory[at("xin")] = input;
    for (const name of ["xs", "xe", "xmh", "xml", "xtmp", "xiter"]) {
      program.machine.memory[at(name)] = 0x55555555;
    }
    program.machine.A = 11;
    program.machine.B = -13;
    program.machine.C = 17;
    program.machine.D = -19;
    program.machine.E = 23;
    program.machine.X = 0x6661696c;
    program.machine.stack[0] = 29;
    program.machine.stack[1] = -31;
    program.machine.depth = 2;
    program.machine.halted = false;
  };
  const state = (program) => ({
    memory: [...program.machine.memory],
    registers: [
      program.machine.A, program.machine.B, program.machine.C, program.machine.D,
      program.machine.E, program.machine.X, program.machine.depth, program.machine.halted,
    ],
    stack: [...program.machine.stack.subarray(0, program.machine.depth)],
  });
  const cases = [
    -0x80000000, -0x7fffffff, -0x40000000, -0x10000, -2, -1, 0,
    1, 2, 3, 0x7fff, 0x8000, 0xffff, 0x10000, 0x40000000, 0x7fffffff,
  ];
  let random = 0x6d2b79f5;
  for (let index = 0; index < 64; index += 1) {
    random = (Math.imul(random, 1664525) + 1013904223) | 0;
    cases.push(random);
  }

  for (let index = 0; index < cases.length; index += 1) {
    const selector = index % 3;
    for (const program of [fallback, direct, precompiled]) {
      initialize(program, selector, cases[index]);
      assert.equal(program.run(1_000).status, "halted");
    }
    assert.equal(fallback.machine.memory[at("continuation")], 10 * (selector + 1));
    assert.deepEqual(state(direct), state(fallback));
    assert.deepEqual(state(precompiled), state(fallback));
  }
  assert.equal(serviceCalls, cases.length);

  for (const label of ["indirectconversion", "xfromint"]) {
    for (const program of [fallback, direct]) {
      initialize(program, 0, -123456789);
      program.machine.pc = linked.labels.get(label);
      assert.equal(program.run(1_000).status, "halted");
    }
    assert.deepEqual(state(direct), state(fallback));
  }
  assert.equal(serviceCalls, cases.length);
  assert.equal(direct.machine.memory[at("continuation")], 0);

  const conversionHandle = linked.labels.get("xfromint") + 1;
  for (const program of [fallback, direct, precompiled]) {
    initialize(program, 0, -123456789);
    const outerPc = program.machine.pc;
    assert.ok(program.machine.callCode(conversionHandle, 1_000) > 0);
    assert.equal(program.machine.pc, outerPc);
  }
  assert.deepEqual(state(direct), state(fallback));
  assert.deepEqual(state(precompiled), state(fallback));
  assert.equal(serviceCalls, cases.length);
});

test("static unsigned multiply service matches its shared Lino fallback", async () => {
  const source = `
    "constants" XM16 = 65535;
    "variables"
      xua = 0; xub = 0;
      xul0 = 0; xuh0 = 0; xul1 = 0; xuh1 = 0;
      xup0 = 0; xup1 = 0; xup2 = 0; xup3 = 0;
      xutmp = 0; xumid = 0; xulo = 0; xuhi = 0;
    "programme"
      => XMul32u;
      end;
    "XMul32u"
      A = [xua]; A & XM16; [xul0] = A;
      A = [xua]; A > 16; A & XM16; [xuh0] = A;
      A = [xub]; A & XM16; [xul1] = A;
      A = [xub]; A > 16; A & XM16; [xuh1] = A;
      A = [xul0]; A '* [xul1]; [xup0] = A;
      A = [xul0]; A '* [xuh1]; [xup1] = A;
      A = [xuh0]; A '* [xul1]; [xup2] = A;
      A = [xuh0]; A '* [xuh1]; [xup3] = A;
      A = [xup0]; A > 16; [xutmp] = A;
      A = [xup1]; A & XM16; A + [xutmp]; [xutmp] = A;
      A = [xup2]; A & XM16; A + [xutmp]; [xumid] = A;
      A = [xumid]; A & XM16; A < 16; [xutmp] = A;
      A = [xup0]; A & XM16; A | [xutmp]; [xulo] = A;
      A = [xup3];
      B = [xup1]; B > 16; A + B;
      B = [xup2]; B > 16; A + B;
      B = [xumid]; B > 16; A + B; [xuhi] = A;
      end;
  `;
  const project = await loadProject("xmul32u-service.lino", { resolveSource() { return source; } });
  const linked = linkProject(project);
  const allIntrinsics = createNoctisIntrinsics();
  const directImplementation = allIntrinsics[NOCTIS_SERVICES.xMul32u];
  const intrinsics = { [NOCTIS_SERVICES.xMul32u]: directImplementation };
  const moduleSource = emitStaticRunnerModule(linked, intrinsics, { regionSize: 256 });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
  const generated = await import(moduleUrl);
  const fallback = compileLinkedProject(linked, {}, { regionSize: 256 });
  let serviceCalls = 0;
  const direct = compileLinkedProject(linked, {}, {
    regionSize: 256,
    intrinsics: {
      [NOCTIS_SERVICES.xMul32u](machine, directLinked) {
        serviceCalls += 1;
        directImplementation(machine, directLinked);
      },
    },
  });
  const precompiled = compileLinkedProject(linked, {}, {
    intrinsics,
    precompiledRunners: {
      create: generated.createRunners,
      instructionCount: generated.instructionCount,
      regionSize: generated.regionSize,
    },
  });
  const names = [
    "xua", "xub", "xul0", "xuh0", "xul1", "xuh1", "xup0", "xup1",
    "xup2", "xup3", "xutmp", "xumid", "xulo", "xuhi",
  ];
  const pairs = [
    [0, 0], [1, -1], [-1, -1], [0x7fffffff, -0x80000000],
    [0x0000ffff, 0xffff0000], [-123456789, 987654321],
  ];
  for (const [left, right] of pairs) {
    for (const program of [fallback, direct, precompiled]) {
      program.reset();
      program.machine.memory[linked.symbols.get("xua").value] = left;
      program.machine.memory[linked.symbols.get("xub").value] = right;
      program.machine.C = -101;
      program.machine.D = 202;
      program.machine.E = -303;
      program.machine.X = 0x6661696c;
      assert.equal(program.run(100).status, "halted");
    }
    const expected = Object.fromEntries(names.map((name) => [
      name, fallback.machine.memory[linked.symbols.get(name).value],
    ]));
    for (const program of [direct, precompiled]) {
      assert.deepEqual(Object.fromEntries(names.map((name) => [
        name, program.machine.memory[linked.symbols.get(name).value],
      ])), expected);
      assert.deepEqual(
        [program.machine.A, program.machine.B, program.machine.C, program.machine.D,
          program.machine.E, program.machine.X, program.machine.depth],
        [fallback.machine.A, fallback.machine.B, fallback.machine.C, fallback.machine.D,
          fallback.machine.E, fallback.machine.X, fallback.machine.depth],
      );
    }
  }
  assert.equal(serviceCalls, pairs.length);
});

test("static restoring-root service matches all shared Lino call paths", async () => {
  const source = `
    "constants" XBIAS = 16383; XM16 = 65535;
    "variables"
      XS = 0; XE = 0; XMH = 0; XML = 0; xtmp = 0;
      srd0 = 0; srd1 = 0; srd2 = 0; srd3 = 0;
      sqrh = 0; sqrl = 0; sqmh = 0; sqml = 0; sqcarry = 0; sqstep = 0;
      srm0 = 0; srm1 = 0; srm2 = 0; srm3 = 0;
      selector = 0; continuation = 0; root pointer = XRootCore;
    "programme"
      A = [selector];
      ? A = 0 -> Call zero;
      ? A = 1 -> Call one;
      -> Call two;
    "Call zero"
      => XRootCore; [continuation] = 10; end;
    "Call one"
      => XRootCore; [continuation] = 20; end;
    "Call two"
      => XRootCore; [continuation] = 30; end;
    "Indirect root"
      => [root pointer]; [continuation] = 40; end;
    "XRootCore"
      A = [XE]; A - XBIAS; [xtmp] = A;
      A = [xtmp]; A & 1;
      ? A = 0 -> XRoot even;
      [srd0] = 0; [srd1] = 0;
      A = [XML]; [srd2] = A;
      A = [XMH]; [srd3] = A;
      A = [xtmp]; A - 1; [xtmp] = A;
      -> XRoot radicand ready;
    "XRoot even"
      [srd0] = 0;
      A = [XML]; A < 31; [srd1] = A;
      A = [XML]; A > 1; [srd2] = A;
      A = [XMH]; A < 31; B = [srd2]; A | B; [srd2] = A;
      A = [XMH]; A > 1; [srd3] = A;
    "XRoot radicand ready"
      [sqrh] = 0; [sqrl] = 0;
      [srm0] = 0; [srm1] = 0; [srm2] = 0;
      [sqstep] = srd3; A = [srd3]; [sqmh] = A; [srd3] = 0;
      [sqml] = 16;
    "XRoot restoring loop"
      A = [sqmh]; E = A;
      A < 2; [sqmh] = A;
      A = E; A > 30; E = A;
      A = [srm2]; A < 2; B = [srm1]; B > 30; A | B; [srm2] = A;
      A = [srm1]; A < 2; B = [srm0]; B > 30; A | B; [srm1] = A;
      A = [srm0]; A < 2; B = E; A | B; [srm0] = A;
      A = [sqrl]; A > 31; E = A;
      A = [sqrh]; A < 1; B = E; A | B; [sqrh] = A;
      A = [sqrl]; A < 1; [sqrl] = A;
      A = [sqrh]; A > 31; [sqcarry] = A;
      A = [sqrh]; A < 1; B = [sqrl]; B > 31; A | B; C = A;
      A = [sqrl]; A < 1; A | 1; D = A;
      A = [srm2]; B = [sqcarry];
      ? A '> B -> XRoot restoring accept;
      ? A '< B -> XRoot restoring next;
      A = [srm1]; B = C;
      ? A '> B -> XRoot restoring accept;
      ? A '< B -> XRoot restoring next;
      A = [srm0]; B = D;
      ? A '< B -> XRoot restoring next;
    "XRoot restoring accept"
      A = [srm0]; B = D;
      ? A '< B -> XRoot restoring low borrow;
      E = 0; -> XRoot restoring low subtract;
    "XRoot restoring low borrow"
      E = 1;
    "XRoot restoring low subtract"
      A = [srm0]; A - D; [srm0] = A;
      A = [srm1]; B = C;
      ? A '> B -> XRoot restoring middle no borrow;
      ? A '< B -> XRoot restoring middle borrow;
      ? E = 0 -> XRoot restoring middle no borrow;
    "XRoot restoring middle borrow"
      A = [srm1]; A - C; A - E; [srm1] = A;
      E = 1; -> XRoot restoring high subtract;
    "XRoot restoring middle no borrow"
      A = [srm1]; A - C; A - E; [srm1] = A;
      E = 0;
    "XRoot restoring high subtract"
      A = [srm2]; A - [sqcarry]; A - E; [srm2] = A;
      [sqrl]+;
      ? [sqrl] != 0 -> XRoot restoring next;
      [sqrh]+;
    "XRoot restoring next"
      [sqml]-;
      ? [sqml] != 0 -> XRoot restoring loop;
      [sqstep]-;
      ? [sqstep] < srd0 -> XRoot restoring complete;
      B = [sqstep]; A = [B]; [sqmh] = A;
      A = 0; [B] = A; [sqml] = 16;
      -> XRoot restoring loop;
    "XRoot restoring complete"
      E = 0;
      A = [sqrl]; A & XM16;
      ? A != 0 -> XRoot residual compatible;
      [srm1]-;
      ? [srm1] != 0FFFFFFFFh -> XRoot residual compatible;
      [srm2]-;
      ? [srm2] != 0FFFFFFFFh -> XRoot residual compatible;
      E = 0FFFFFFFFh;
    "XRoot residual compatible"
      A = E; [srm3] = A;
      ? E != 0 -> XRoot increment;
      ? [srm2] != 0 -> XRoot increment;
      A = [srm1]; B = [sqrh];
      ? A '> B -> XRoot increment;
      ? A '< B -> XRoot done;
      A = [srm0]; B = [sqrl];
      ? A '> B -> XRoot increment;
      -> XRoot done;
    "XRoot increment"
      [sqrl]+;
      ? [sqrl] != 0 -> XRoot done;
      [sqrh]+;
      ? [sqrh] != 0 -> XRoot overflow;
      -> XRoot done;
    "XRoot overflow"
      [XMH] = 80000000h; [XML] = 0; [xtmp]+;
      -> XRoot finish;
    "XRoot done"
      A = [sqrh]; [XMH] = A;
      A = [sqrl]; [XML] = A;
    "XRoot finish"
      A = [xtmp]; A / 2; A + XBIAS; [XE] = A;
      [XS] = 0;
      end;
  `;
  const project = await loadProject("xrootcore-service.lino", { resolveSource() { return source; } });
  const linked = linkProject(project);
  const allIntrinsics = createNoctisIntrinsics();
  const implementation = allIntrinsics[NOCTIS_SERVICES.xRootCore];
  const intrinsics = { [NOCTIS_SERVICES.xRootCore]: implementation };
  const moduleSource = emitStaticRunnerModule(linked, intrinsics, { regionSize: 256 });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
  const generated = await import(moduleUrl);
  const fallback = compileLinkedProject(linked, {}, { regionSize: 256 });
  let serviceCalls = 0;
  const direct = compileLinkedProject(linked, {}, {
    regionSize: 256,
    intrinsics: {
      [NOCTIS_SERVICES.xRootCore](machine, directLinked) {
        serviceCalls += 1;
        implementation(machine, directLinked);
      },
    },
  });
  const precompiled = compileLinkedProject(linked, {}, {
    intrinsics,
    precompiledRunners: {
      create: generated.createRunners,
      instructionCount: generated.instructionCount,
      regionSize: generated.regionSize,
    },
  });
  const at = (name) => linked.symbols.get(name).value;
  const initialize = (program, selector, exponent, high, low) => {
    program.reset();
    program.machine.memory[at("selector")] = selector;
    program.machine.memory[at("xs")] = selector & 1;
    program.machine.memory[at("xe")] = exponent;
    program.machine.memory[at("xmh")] = high;
    program.machine.memory[at("xml")] = low;
    for (const name of [
      "xtmp", "srd0", "srd1", "srd2", "srd3", "sqrh", "sqrl", "sqmh",
      "sqml", "sqcarry", "sqstep", "srm0", "srm1", "srm2", "srm3",
    ]) program.machine.memory[at(name)] = 0x55555555;
    program.machine.A = 11;
    program.machine.B = 13;
    program.machine.C = 17;
    program.machine.D = 19;
    program.machine.E = 23;
    program.machine.X = 0x6661696c;
    program.machine.depth = 0;
  };
  const state = (program) => ({
    memory: [...program.machine.memory],
    registers: [
      program.machine.A, program.machine.B, program.machine.C, program.machine.D,
      program.machine.E, program.machine.X, program.machine.depth, program.machine.halted,
    ],
    stack: [...program.machine.stack.subarray(0, program.machine.depth)],
  });
  const cases = [
    [15309, 0x80000000, 0], [15309, 0xffffffff, -1],
    [15360, 0x80000000, 0], [16382, 0x80000000, 0],
    [16383, 0x80000000, 0], [16384, 0x80000000, 0],
    [16384, 0xffffffff, -1], [17406, 0xffffffff, -1],
  ];
  let random = 0x6d2b79f5;
  for (let index = 0; index < 128; index += 1) {
    random = (Math.imul(random, 1664525) + 1013904223) | 0;
    const high = random | 0x80000000;
    random = (Math.imul(random, 1664525) + 1013904223) | 0;
    cases.push([15309 + (index % (17406 - 15309 + 1)), high, random]);
  }

  for (let index = 0; index < cases.length; index += 1) {
    const [exponent, high, low] = cases[index];
    const selector = index % 3;
    for (const program of [fallback, direct, precompiled]) {
      initialize(program, selector, exponent, high, low);
      assert.equal(program.run(10_000).status, "halted");
    }
    assert.equal(fallback.machine.memory[at("continuation")], 10 * (selector + 1));
    assert.deepEqual(state(direct), state(fallback));
    assert.deepEqual(state(precompiled), state(fallback));
  }
  assert.equal(serviceCalls, cases.length);

  for (const label of ["indirectroot", "xrootcore"]) {
    for (const program of [fallback, direct]) {
      initialize(program, 0, 16384, 0xd413cccf, -411462895);
      program.machine.pc = linked.labels.get(label);
      assert.equal(program.run(10_000).status, "halted");
    }
    assert.deepEqual(state(direct), state(fallback));
  }
  assert.equal(serviceCalls, cases.length);
  assert.equal(direct.machine.memory[at("continuation")], 0);

  const rootHandle = linked.labels.get("xrootcore") + 1;
  for (const program of [fallback, direct, precompiled]) {
    initialize(program, 0, 16384, 0xd413cccf, -411462895);
    const outerPc = program.machine.pc;
    assert.ok(program.machine.callCode(rootHandle, 10_000) > 0);
    assert.equal(program.machine.pc, outerPc);
  }
  assert.deepEqual(state(direct), state(fallback));
  assert.deepEqual(state(precompiled), state(fallback));
  assert.equal(serviceCalls, cases.length);
});

test("static HUD lamp smoother service matches all shared Lino call paths", async () => {
  const padding = "0;".repeat(4_000);
  const source = `
    "variables"
      nw = 0; RADPT = 0;
      VHGNDsmoothcx = 0; VHGNDsmoothcy = 0; VHGNDsmoothx = 0; VHGNDsmoothy = 0;
      VHGNDsmoothpx = 0; VHGNDsmoothpy = 0; VHGNDsmoothsum = 0;
      VHGNDsmoothavg = 0; VHGNDsmoothptr = 0;
      selector = 0; continuation = 0; smooth pointer = VHGND HUD lamp smooth;
      page = 0; ${padding}
    "programme"
      A = [selector];
      ? A = 0 -> Call zero;
      ? A = 1 -> Call one;
      ? A = 2 -> Call two;
      -> Call three;
    "Call zero"
      => VHGND HUD lamp smooth; [continuation] = 10; end;
    "Call one"
      => VHGND HUD lamp smooth; [continuation] = 20; end;
    "Call two"
      => VHGND HUD lamp smooth; [continuation] = 30; end;
    "Call three"
      => VHGND HUD lamp smooth; [continuation] = 40; end;
    "Indirect root"
      => [smooth pointer]; [continuation] = 50; end;
    "VHGND HUD lamp smooth"
      A = [VHGNDsmoothcy]; A - 5; [VHGNDsmoothy] = A; [VHGNDsmoothpy] = 0; [VHGNDsmoothpy] - 5;
    "VHGND HUD lamp smooth row"
      A = [VHGNDsmoothcx]; A - 5; [VHGNDsmoothx] = A; [VHGNDsmoothpx] = 0; [VHGNDsmoothpx] - 5;
    "VHGND HUD lamp smooth pixel"
      A = [VHGNDsmoothpx]; C = A; A '* C; [VHGNDsmoothsum] = A;
      A = [VHGNDsmoothpy]; C = A; A '* C; C = [VHGNDsmoothsum]; A + C;
      ? A >= 25 -> VHGND HUD lamp smooth next;
      A = [VHGNDsmoothy]; A '* 320; A + [VHGNDsmoothx]; A + RADPT; A + nw;
      [VHGNDsmoothptr] = A; D = A; A = [D]; A & 63; [VHGNDsmoothsum] = A;
      D+; A = [D]; A & 63; C = [VHGNDsmoothsum]; C + A; [VHGNDsmoothsum] = C;
      A = [VHGNDsmoothptr]; A + 320; D = A; A = [D]; A & 63;
      C = [VHGNDsmoothsum]; C + A; [VHGNDsmoothsum] = C;
      D+; A = [D]; A & 63; C = [VHGNDsmoothsum]; C + A; C / 4; [VHGNDsmoothavg] = C;
      D = [VHGNDsmoothptr]; A = [D]; A & 192; A + [VHGNDsmoothavg]; [D] = A;
      D+; A = [D]; A & 192; A + [VHGNDsmoothavg]; [D] = A;
      A = [VHGNDsmoothptr]; A + 320; D = A; A = [D]; A & 192; A + [VHGNDsmoothavg]; [D] = A;
      D+; A = [D]; A & 192; A + [VHGNDsmoothavg]; [D] = A;
    "VHGND HUD lamp smooth next"
      [VHGNDsmoothx]+; [VHGNDsmoothpx]+;
      A = [VHGNDsmoothpx]; ? A <= 5 -> VHGND HUD lamp smooth pixel;
      [VHGNDsmoothy]+; [VHGNDsmoothpy]+;
      A = [VHGNDsmoothpy]; ? A <= 5 -> VHGND HUD lamp smooth row;
      end;
  `;
  const project = await loadProject("hud-smoother-service.lino", { resolveSource() { return source; } });
  const linked = linkProject(project);
  const allIntrinsics = createNoctisIntrinsics();
  const implementation = allIntrinsics[NOCTIS_SERVICES.groundHudLampSmooth];
  const intrinsics = { [NOCTIS_SERVICES.groundHudLampSmooth]: implementation };
  const moduleSource = emitStaticRunnerModule(linked, intrinsics, { regionSize: 256 });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
  const generated = await import(moduleUrl);
  const fallback = compileLinkedProject(linked, {}, { regionSize: 256 });
  let serviceCalls = 0;
  const direct = compileLinkedProject(linked, {}, {
    regionSize: 256,
    intrinsics: {
      [NOCTIS_SERVICES.groundHudLampSmooth](machine, directLinked) {
        serviceCalls += 1;
        implementation(machine, directLinked);
      },
    },
  });
  const precompiled = compileLinkedProject(linked, {}, {
    intrinsics,
    precompiledRunners: {
      create: generated.createRunners,
      instructionCount: generated.instructionCount,
      regionSize: generated.regionSize,
    },
  });
  const at = (name) => linked.symbols.get(name).value;
  const first = 300;
  const last = 3_300;
  const initialize = (program, selector) => {
    program.reset();
    let random = (0x6d2b79f5 ^ selector) | 0;
    for (let index = first; index < last; index += 1) {
      let pixel;
      if (selector === 0) pixel = 0x55;
      else if (selector === 1) pixel = (((index / 320) | 0) + index) & 1 ? 0xff : 0;
      else if (selector === 2) pixel = ((index * 73 + 63) & 63) | (((index >>> 3) & 3) << 6);
      else {
        random = (Math.imul(random, 1664525) + 1013904223) | 0;
        pixel = random & 255;
      }
      program.machine.memory[index] = pixel;
    }
    program.machine.memory[first - 1] = 0x12345678;
    program.machine.memory[last] = -0x1234567;
    program.machine.memory[at("selector")] = selector;
    program.machine.memory[at("vhgndsmoothcx")] = 5;
    program.machine.memory[at("vhgndsmoothcy")] = 5;
    program.machine.A = 11;
    program.machine.B = 13;
    program.machine.C = 17;
    program.machine.D = 19;
    program.machine.E = 23;
    program.machine.X = 29;
    program.machine.stack[0] = 31;
    program.machine.stack[1] = 37;
    program.machine.stack[2] = 41;
    program.machine.depth = 3;
  };
  const state = (program) => ({
    memory: [...program.machine.memory],
    registers: [
      program.machine.A, program.machine.B, program.machine.C, program.machine.D,
      program.machine.E, program.machine.X, program.machine.depth,
    ],
    stack: [...program.machine.stack.subarray(0, 3)],
  });

  for (let selector = 0; selector < 4; selector += 1) {
    for (const program of [fallback, direct, precompiled]) {
      initialize(program, selector);
      assert.equal(program.run(6_000).status, "halted");
    }
    assert.equal(fallback.machine.memory[at("continuation")], 10 * (selector + 1));
    assert.deepEqual(state(direct), state(fallback));
    assert.deepEqual(state(precompiled), state(fallback));
    assert.equal(fallback.machine.memory[first - 1], 0x12345678);
    assert.equal(fallback.machine.memory[last], -0x1234567);
    assert.equal(fallback.machine.memory[at("vhgndsmoothcx")], 5);
    assert.equal(fallback.machine.memory[at("vhgndsmoothcy")], 5);
    assert.ok(fallback.machine.memory[at("vhgndsmoothptr")] > 0);
  }
  assert.equal(serviceCalls, 4);

  for (const label of ["indirectroot", "vhgndhudlampsmooth"]) {
    for (const program of [fallback, direct]) {
      initialize(program, 3);
      program.machine.pc = linked.labels.get(label);
      assert.equal(program.run(6_000).status, "halted");
    }
    assert.deepEqual(state(direct), state(fallback));
  }
  assert.equal(serviceCalls, 4);
  assert.equal(direct.machine.memory[at("continuation")], 0);
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
