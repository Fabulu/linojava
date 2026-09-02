import { dispatchIsoKernel, DONE, FAIL } from "./isokernel-abi.js";
import { linkProject } from "./linker.js";
import { loadProject } from "./project-loader.js";
import { lowerOperands } from "./operands.js";
import { canonicalCodeName } from "./programme.js";

const SYNC_MACHINE = "machine.stack=s;machine.depth=d;machine.pc=pc;machine.A=A;machine.B=B;machine.C=C;machine.D=D;machine.E=E;machine.X=X;machine.halted=halted;";

function finishRunner(status, count) {
  return `outputStatus=${JSON.stringify(status)};outputInstructions=${count};break runner;`;
}

const REFRESH_MEMORY = "m=machine.memory;md=machine.noctisDataView;if(!md||md.buffer!==m.buffer||md.byteOffset!==m.byteOffset||md.byteLength!==m.byteLength){md=new DataView(m.buffer,m.byteOffset,m.byteLength);machine.noctisDataView=md;}";

function expression(operand) {
  switch (operand.kind) {
    case "immediate": return String(operand.value | 0);
    case "register": return operand.name;
    case "stack": return `(s[(d - 1 - ${operand.offset}) | 0] | 0)`;
    case "memory": return `(m[(${expression(operand.address)}) >>> 0] | 0)`;
    case "negate": return `(-(${expression(operand.value)}) | 0)`;
    case "arithmetic": {
      const left = expression(operand.left);
      const right = expression(operand.right);
      if (operand.operator === "add") return `((${left}) + (${right}) | 0)`;
      if (operand.operator === "subtract") return `((${left}) - (${right}) | 0)`;
      if (operand.operator === "multiply") return `Math.imul(${left}, ${right})`;
      return `idiv(${left}, ${right})`;
    }
    default: throw new TypeError(`Cannot emit operand ${operand.kind}`);
  }
}

function destination(operand, value, prefix = "") {
  if (operand.kind === "register") return `${operand.name} = (${value}) | 0;`;
  if (operand.kind === "stack") return `s[(d - 1 - ${operand.offset}) | 0] = (${value}) | 0;`;
  if (operand.kind === "memory") return `${prefix}m[(${expression(operand.address)}) >>> 0] = (${value}) | 0;`;
  throw new SyntaxError("Lino destination is not writable");
}

function updateDestination(operand, operation) {
  if (operand.kind === "register") return `${operand.name} = (${operation(operand.name)}) | 0;`;
  if (operand.kind === "stack") {
    const address = `(d - 1 - ${operand.offset}) | 0`;
    return `q = ${address}; s[q] = (${operation("s[q] | 0")}) | 0;`;
  }
  if (operand.kind === "memory") {
    return `q = (${expression(operand.address)}) >>> 0; m[q] = (${operation("m[q] | 0")}) | 0;`;
  }
  throw new SyntaxError("Lino destination is not writable");
}

function binary64Address(operand) {
  if (operand.kind !== "memory") throw new SyntaxError("Lino binary64 operand must be memory");
  return `((${expression(operand.address)}) >>> 0)`;
}

function binary64Instruction(instruction) {
  const operator = instruction.operator;
  if (operator === "+:" || operator === "-:" || operator === "*:" || operator === "/:") {
    const operation = { "+:": "+", "-:": "-", "*:": "*", "/:": "/" }[operator];
    return `q=${binary64Address(instruction.destination)};u=${binary64Address(instruction.source)};f64w(q,f64r(q)${operation}f64r(u));`;
  }
  if (operator === "=:") {
    return `q=${binary64Address(instruction.source)};${destination(instruction.destination, "f64toi(f64r(q))")}`;
  }
  if (operator === ":=") {
    return `u=${expression(instruction.source)};q=${binary64Address(instruction.destination)};f64w(q,u|0);`;
  }
  throw new SyntaxError(`Cannot emit Lino binary64 operator ${operator}`);
}

function destinationReference(operand, name) {
  if (operand.kind === "register") {
    return { setup: "", read: operand.name, write: (value) => `${operand.name} = (${value}) | 0;` };
  }
  if (operand.kind === "memory") {
    return {
      setup: `const ${name} = (${expression(operand.address)}) >>> 0;`,
      read: `m[${name}] | 0`,
      write: (value) => `m[${name}] = (${value}) | 0;`,
    };
  }
  if (operand.kind === "stack") {
    return {
      setup: `const ${name} = (d - 1 - ${operand.offset}) | 0;`,
      read: `s[${name}] | 0`,
      write: (value) => `s[${name}] = (${value}) | 0;`,
    };
  }
  throw new SyntaxError("Lino swap operand is not writable");
}

function splitMultiplyInstruction(instruction) {
  const left = destinationReference(instruction.destination, "multiplyLeft");
  const right = destinationReference(instruction.source, "multiplyRight");
  const high = instruction.operator === "*%'" ? "umulh(u,v)" : "imulh(u,v)";
  return `${left.setup} ${right.setup} u=${left.read};v=${right.read};q=Math.imul(u,v);${left.write("q")}${right.write(high)}`;
}

function structuredInstruction(instruction) {
  switch (instruction.op) {
    case "assign": return destination(instruction.destination, expression(instruction.source));
    case "increment": return updateDestination(instruction.destination, (left) => `((${left}) + 1)`);
    case "decrement": return updateDestination(instruction.destination, (left) => `((${left}) - 1)`);
    case "unary": return updateDestination(instruction.destination, (left) => instruction.operator === "!" ? `~(${left})` : `-(${left})`);
    case "binary":
      if (instruction.operator.endsWith(":") || instruction.operator === ":=") {
        return binary64Instruction(instruction);
      }
      if (instruction.operator === "*%" || instruction.operator === "*%'") {
        return splitMultiplyInstruction(instruction);
      }
      return updateDestination(instruction.destination, (left) => integerBinary(instruction.operator, left, expression(instruction.source)));
    case "binary64-narrow": return `q=${binary64Address(instruction.destination)};f64w(q,Math.fround(f64r(q)));`;
    case "swap": {
      const left = destinationReference(instruction.destination, "swapLeft");
      const right = destinationReference(instruction.source, "swapRight");
      return `${left.setup} ${right.setup} u = ${left.read}; v = ${right.read}; ${left.write("v")} ${right.write("u")}`;
    }
    case "nop": return "";
    default: return null;
  }
}

function integerBinary(operator, left, right) {
  if (operator === "+") return `((${left}) + (${right}))`;
  if (operator === "-") return `((${left}) - (${right}))`;
  if (operator === "*") return `Math.imul(${left}, ${right})`;
  if (operator === "'*") return `Math.imul(${left}, ${right})`;
  if (operator === "/") return `idiv(${left}, ${right})`;
  if (operator === "'/") return `udiv(${left}, ${right})`;
  if (operator === "%") return `irem(${left}, ${right})`;
  if (operator === "'%") return `urem(${left}, ${right})`;
  if (operator === "&") return `((${left}) & (${right}))`;
  if (operator === "|") return `((${left}) | (${right}))`;
  if (operator === "#") return `((${left}) ^ (${right}))`;
  if (operator === "<" || operator === "<<") return `((${left}) << ((${right}) & 31))`;
  if (operator === ">") return `((${left}) >>> ((${right}) & 31))`;
  if (operator === ">>") return `((${left}) >> ((${right}) & 31))`;
  if (operator === "<@") return `rol(${left}, ${right})`;
  if (operator === "@>") return `ror(${left}, ${right})`;
  if (operator === "++") return `fop(${left}, ${right}, 0)`;
  if (operator === "--") return `fop(${left}, ${right}, 1)`;
  if (operator === "**") return `fop(${left}, ${right}, 2)`;
  if (operator === "//") return `fop(${left}, ${right}, 3)`;
  if (operator === ",=") return `itof(${right})`;
  if (operator === "=,") return `ftoi(${right})`;
  throw new SyntaxError(`Cannot emit Lino operator ${operator}`);
}

function predicate(instruction) {
  const left = expression(instruction.left);
  const right = expression(instruction.right);
  if (instruction.floating) {
    const operator = instruction.operator === "=" ? "===" : instruction.operator;
    return `(fread(${left}) ${operator} fread(${right}))`;
  }
  if (instruction.operator === "+") return `(((${left}) & (${right})) !== 0)`;
  if (instruction.operator === "-") return `(((${left}) & (${right})) === 0)`;
  const a = instruction.unsigned ? `((${left}) >>> 0)` : `((${left}) | 0)`;
  const b = instruction.unsigned ? `((${right}) >>> 0)` : `((${right}) | 0)`;
  const operator = instruction.operator === "=" ? "===" : instruction.operator;
  return `(${a} ${operator} ${b})`;
}

function push(value) {
  return `if (d === s.length) { const n = new Int32Array(s.length * 2); n.set(s); s = n; } s[d++] = (${value}) | 0;`;
}

function returnInstruction(status, index) {
  const setStatus = status === null ? "" : `X = ${status};`;
  return `${setStatus} if (d === 0) { pc = ${index}; halted = true; ${finishRunner("halted", "executed")} } pc = (s[--d] | 0) - 1; continue runner;`;
}

function instructionPrefix(instruction, count, profile) {
  const sampled = profile ? `prof[${instruction.index}]=(prof[${instruction.index}]+1)>>>0;` : "";
  return `${sampled}${count}`;
}

function emitInstruction(instruction, serviceIntrinsicIds = new Set(), serviceInlines = new Map(), count = "", profile = false, branchFallthrough = true, sinkFallthroughPc = false) {
  const next = instruction.index + 1;
  const publishNext = sinkFallthroughPc ? "" : `pc = ${next};`;
  count = instructionPrefix(instruction, count, profile);
  let code;
  switch (instruction.op) {
    case "assign":
    case "increment":
    case "decrement":
    case "unary":
    case "binary":
    case "binary64-narrow":
    case "swap":
    case "nop":
      code = structuredInstruction(instruction);
      break;
    case "push": code = push(expression(instruction.source)); break;
    case "pop": code = `if (d === 0) throw new RangeError("Lino stack underflow"); u = s[--d] | 0; ${destination(instruction.destination, "u")}`; break;
    case "push-all": code = ["A", "B", "C", "D", "E"].map(push).join(" "); break;
    case "pop-all": code = ["E", "D", "C", "B", "A"].map((name) => `if (d === 0) throw new RangeError("Lino stack underflow"); ${name} = s[--d] | 0;`).join(" "); break;
    case "stack-adjust": code = instruction.direction === "+" ? `d -= ${instruction.count}; if (d < 0) throw new RangeError("Lino stack underflow");` : `for (u = 0; u < ${instruction.count}; u += 1) { ${push("0")} }`; break;
    case "call": {
      const serviceId = instruction.target.kind === "immediate" && instruction.target.symbol
        ? `service:${canonicalCodeName(instruction.target.symbol)}` : null;
      if (serviceId && serviceIntrinsicIds.has(serviceId)) {
        const inline = serviceInlines.get(serviceId);
        if (inline) return `case ${instruction.index}: { ${count} ${inline} pc=${next}; }`;
        return `case ${instruction.index}: { ${count} pc=${instruction.index}; ${SYNC_MACHINE} native(${JSON.stringify(serviceId)}, machine); ${REFRESH_MEMORY} s=machine.stack; d=machine.depth|0; A=machine.A|0; B=machine.B|0; C=machine.C|0; D=machine.D|0; E=machine.E|0; X=machine.X|0; pc=${next}; }`;
      }
      code = `${push(next + 1)} pc = (${expression(instruction.target)}) - 1; continue runner;`;
      return `case ${instruction.index}: { ${count} ${code} }`;
    }
    case "jump": return `case ${instruction.index}: { ${count} pc = (${expression(instruction.target)}) - 1; continue runner; }`;
    case "branch": {
      if (!branchFallthrough) return `case ${instruction.index}: { ${count} pc = ${predicate(instruction)} ? ((${expression(instruction.target)}) - 1) : ${next}; continue runner; }`;
      return `case ${instruction.index}: { ${count} if (${predicate(instruction)}) { pc = ((${expression(instruction.target)}) - 1); continue runner; } ${publishNext} }`;
    }
    case "branch-status": {
      const status = instruction.status === "ok" ? DONE : FAIL;
      if (!branchFallthrough) return `case ${instruction.index}: { ${count} pc = (X === ${status}) ? ((${expression(instruction.target)}) - 1) : ${next}; continue runner; }`;
      return `case ${instruction.index}: { ${count} if (X === ${status}) { pc = ((${expression(instruction.target)}) - 1); continue runner; } ${publishNext} }`;
    }
    case "loop": {
      code = updateDestination(instruction.counter, (left) => `((${left}) - 1)`);
      if (!branchFallthrough) return `case ${instruction.index}: { ${count} ${code} pc = (${expression(instruction.counter)}) !== 0 ? ((${expression(instruction.target)}) - 1) : ${next}; continue runner; }`;
      return `case ${instruction.index}: { ${count} ${code} if ((${expression(instruction.counter)}) !== 0) { pc = ((${expression(instruction.target)}) - 1); continue runner; } ${publishNext} }`;
    }
    case "isocall": return `case ${instruction.index}: { ${count} pc = ${next}; ${SYNC_MACHINE} const result = dispatch(machine); X = result?.status === ${FAIL} || result?.success === false ? ${FAIL} : ${DONE}; if (result?.yielded || result?.yield) { outputSleep=Math.max(0,Number(result?.sleepMilliseconds??result?.delay??0)||0); ${finishRunner("yield", "executed")} } }`;
    case "intrinsic": return `case ${instruction.index}: { ${count} pc=${instruction.index}; ${SYNC_MACHINE} native(${JSON.stringify(instruction.intrinsicId)}, machine); ${REFRESH_MEMORY} s=machine.stack; d=machine.depth|0; A=machine.A|0; B=machine.B|0; C=machine.C|0; D=machine.D|0; E=machine.E|0; X=machine.X|0; pc=${next}; }`;
    case "end": return `case ${instruction.index}: { ${count} ${returnInstruction(DONE, instruction.index)} }`;
    case "fail": return `case ${instruction.index}: { ${count} ${returnInstruction(FAIL, instruction.index)} }`;
    case "leave": return `case ${instruction.index}: { ${count} ${returnInstruction(null, instruction.index)} }`;
    default: throw new SyntaxError(`Cannot emit Lino instruction ${instruction.op}`);
  }
  return `case ${instruction.index}: { ${count} ${code} ${publishNext} }`;
}

function fallsThrough(instruction, serviceIntrinsicIds) {
  if (instruction.op === "call") {
    const serviceId = instruction.target.kind === "immediate" && instruction.target.symbol
      ? `service:${canonicalCodeName(instruction.target.symbol)}` : null;
    return serviceId !== null && serviceIntrinsicIds.has(serviceId);
  }
  return !new Set([
    "jump", "branch", "branch-status", "loop", "isocall", "end", "fail", "leave",
  ]).has(instruction.op);
}

function budgetCounts(linked, instructions, serviceIntrinsicIds) {
  const starts = new Set([instructions[0]?.index]);
  const present = new Set(instructions.map((instruction) => instruction.index));
  for (const target of linked.labels.values()) if (present.has(target)) starts.add(target);
  for (const instruction of instructions) {
    if (!fallsThrough(instruction, serviceIntrinsicIds) && present.has(instruction.index + 1)) {
      starts.add(instruction.index + 1);
    }
  }
  starts.delete(undefined);
  const ordered = [...starts].sort((left, right) => left - right);
  const counts = new Map();
  for (let index = 0; index < ordered.length; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1] ?? (instructions.at(-1).index + 1);
    const length = end - start;
    counts.set(start, `if(executed!==0&&executed+${length}>maxInstructions){pc=${start};${finishRunner("budget", "executed")}}executed+=${length};`);
  }
  return counts;
}

function structuredSelfBackedges(linked, instructions, serviceIntrinsicIds, counts, labels) {
  if (labels === undefined) return new Map();
  if (!Array.isArray(labels) && !(labels instanceof Set)) {
    throw new TypeError("structuredSelfBackedgeLabels must be an array or Set");
  }
  const present = new Map(instructions.map((instruction, index) => [instruction.index, index]));
  const blocks = new Map();
  for (const requested of labels) {
    const name = canonicalCodeName(String(requested));
    const start = linked.labels.get(name);
    if (start === undefined) throw new SyntaxError(`Unknown structured self-backedge label ${requested}`);
    const position = present.get(start);
    if (position === undefined) continue;
    const body = [];
    for (let offset = position; offset < instructions.length; offset += 1) {
      const instruction = instructions[offset];
      if (offset !== position && counts.has(instruction.index)) {
        throw new SyntaxError(`Structured self-backedge ${requested} contains an interior entry at ${instruction.index}`);
      }
      body.push(instruction);
      if (!fallsThrough(instruction, serviceIntrinsicIds)) break;
    }
    const terminal = body.at(-1);
    if (!terminal || fallsThrough(terminal, serviceIntrinsicIds)) {
      throw new SyntaxError(`Structured self-backedge ${requested} crosses its generated runner region`);
    }
    if (terminal.op !== "branch" || terminal.target.kind !== "immediate"
        || ((terminal.target.value | 0) - 1) !== start) {
      throw new SyntaxError(`Structured self-backedge ${requested} does not end in a direct branch to itself`);
    }
    for (const instruction of body.slice(0, -1)) {
      if (structuredInstruction(instruction) === null) {
        throw new SyntaxError(`Structured self-backedge ${requested} contains unsupported ${instruction.op}`);
      }
    }
    blocks.set(start, body);
  }
  return blocks;
}

function selectedCountedSelfBackedges(linked, selfBackedges, labels) {
  if (labels === undefined) return new Map();
  if (!Array.isArray(labels) && !(labels instanceof Set)) {
    throw new TypeError("countedSelfBackedgeLabels must be an array or Set");
  }
  const counted = new Map();
  for (const requested of labels) {
    const start = linked.labels.get(canonicalCodeName(String(requested)));
    if (start === undefined) throw new SyntaxError(`Unknown counted self-backedge label ${requested}`);
    const body = selfBackedges.get(start);
    if (!body) continue;
    const descriptor = countedSelfBackedge(body);
    if (descriptor) counted.set(start, descriptor);
  }
  return counted;
}

function directMemoryAddress(operand) {
  if (operand?.kind !== "memory" || operand.address.kind !== "immediate") return null;
  return operand.address.value >>> 0;
}

function registerWrite(instruction) {
  if (!new Set(["assign", "increment", "decrement", "unary", "binary"]).has(instruction.op)) {
    return null;
  }
  return instruction.destination.kind === "register" ? instruction.destination.name : null;
}

function memoryWrite(instruction) {
  if (!new Set(["assign", "increment", "decrement", "unary", "binary"]).has(instruction.op)) {
    return null;
  }
  return instruction.destination.kind === "memory" ? instruction.destination : null;
}

function affineAddress(operand) {
  if (operand.kind === "register") return { register: operand.name, offset: 0 };
  if (operand.kind !== "arithmetic") return null;
  if (operand.operator === "add" && operand.left.kind === "register"
      && operand.right.kind === "immediate") {
    return { register: operand.left.name, offset: operand.right.value | 0 };
  }
  if (operand.operator === "subtract" && operand.left.kind === "register"
      && operand.right.kind === "immediate") {
    return { register: operand.left.name, offset: -(operand.right.value | 0) };
  }
  return null;
}

function safeCountedOperand(operand) {
  if (!operand) return false;
  if (operand.kind === "immediate" || operand.kind === "register" || operand.kind === "stack") {
    return true;
  }
  if (operand.kind === "memory") return safeCountedOperand(operand.address);
  if (operand.kind === "negate") return safeCountedOperand(operand.value);
  if (operand.kind !== "arithmetic"
      || !new Set(["add", "subtract", "multiply"]).has(operand.operator)) return false;
  return safeCountedOperand(operand.left) && safeCountedOperand(operand.right);
}

function safeCountedDestination(operand) {
  return operand.kind !== "memory" || safeCountedOperand(operand.address);
}

function safeCountedInstruction(instruction) {
  if (instruction.op === "nop") return true;
  if (instruction.op === "assign") {
    return safeCountedDestination(instruction.destination)
      && safeCountedOperand(instruction.source);
  }
  if (instruction.op === "increment" || instruction.op === "decrement") {
    return safeCountedDestination(instruction.destination);
  }
  if (instruction.op !== "binary"
      || !new Set(["+", "-", "*", "'*", "&", "|", "#", "<", "<<", ">", ">>", "<@", "@>"])
        .has(instruction.operator)) return false;
  return safeCountedDestination(instruction.destination)
    && safeCountedOperand(instruction.source);
}

function countedSelfBackedge(body) {
  if (body.length < 3) return null;
  const decrement = body.at(-3);
  const load = body.at(-2);
  const terminal = body.at(-1);
  const counterAddress = directMemoryAddress(decrement.destination);
  if (decrement.op !== "decrement" || counterAddress === null
      || load.op !== "assign" || load.destination.kind !== "register"
      || load.destination.name !== "A" || directMemoryAddress(load.source) !== counterAddress
      || terminal.op !== "branch" || terminal.floating || terminal.unsigned
      || terminal.operator !== "!=" || terminal.left.kind !== "register"
      || terminal.left.name !== "A" || terminal.right.kind !== "immediate"
      || (terminal.right.value | 0) !== 0) {
    return null;
  }

  const core = body.slice(0, -3);
  if (!core.every(safeCountedInstruction)) return null;
  const spans = new Map();
  for (let position = 0; position < core.length; position += 1) {
    const operand = memoryWrite(core[position]);
    if (!operand) continue;
    const direct = directMemoryAddress(operand);
    if (direct !== null) {
      if (direct === counterAddress) return null;
      continue;
    }
    const affine = affineAddress(operand.address);
    if (!affine || affine.register === "A" || affine.offset < 0) return null;
    const span = spans.get(affine.register) ?? { offsets: [], lastWrite: -1, delta: 0 };
    span.offsets.push(affine.offset);
    span.lastWrite = position;
    spans.set(affine.register, span);
  }

  for (const [register, span] of spans) {
    for (let position = 0; position < core.length; position += 1) {
      if (registerWrite(core[position]) !== register) continue;
      const instruction = core[position];
      const increment = instruction.op === "increment" ? 1
        : instruction.op === "binary" && instruction.operator === "+"
          && instruction.source.kind === "immediate" ? instruction.source.value | 0 : 0;
      if (position <= span.lastWrite || increment <= 0 || span.delta !== 0) return null;
      span.delta = increment;
    }
  }
  return { counterAddress, core, spans };
}

function countedProfile(body, iterations) {
  return body.map((instruction) => (
    `prof[${instruction.index}]=(prof[${instruction.index}]+${iterations})>>>0;`
  )).join("");
}

function emitStructuredSelfBackedge(body, counts, profile, sinkFallthroughPc, counted) {
  const start = body[0].index;
  const terminal = body.at(-1);
  const loop = `selfBackedge${start}`;
  const scalarCode = body.slice(0, -1).map((instruction) => (
    `${instructionPrefix(instruction, counts.get(instruction.index) ?? "", profile)}${structuredInstruction(instruction)}`
  )).join("");
  const terminalPrefix = instructionPrefix(
    terminal, counts.get(terminal.index) ?? "", profile,
  );
  const publishBackedge = sinkFallthroughPc ? "" : `pc=${start};`;
  const scalar = `${loop}:while(true){${scalarCode}${terminalPrefix}if(${predicate(terminal)}){${publishBackedge}continue ${loop};}pc=${terminal.index + 1};break ${loop};}`;
  if (!counted) return `case ${start}: { ${scalar}continue runner; }`;

  const length = body.length;
  const suffix = String(start);
  const iterations = `countedIterations${suffix}`;
  const counter = `countedCounter${suffix}`;
  const value = `countedValue${suffix}`;
  const spanGuards = [...counted.spans].map(([register, span]) => {
    const first = Math.min(...span.offsets);
    const last = Math.max(...span.offsets);
    const begin = `counted${register}Begin${suffix}`;
    const end = `counted${register}End${suffix}`;
    return `const ${begin}=(${register}>>>0)+${first};const ${end}=(${register}>>>0)+(${iterations}-1)*${span.delta}+${last};if(${end}>4294967295||(${counter}>=${begin}&&${counter}<=${end}))break countedSelfBackedge${suffix};`;
  }).join("");
  const profileCode = profile ? countedProfile(body, iterations) : "";
  const attemptedHeaderProfile = profile
    ? `prof[${start}]=(prof[${start}]+1)>>>0;`
    : "";
  const coreCode = counted.core.map(structuredInstruction).join("");
  const countedCode = `countedSelfBackedge${suffix}:{const ${counter}=${counted.counterAddress};if(${counter}>=m.length||!Number.isFinite(maxInstructions))break countedSelfBackedge${suffix};if(executed!==0&&executed+${length}>maxInstructions){${attemptedHeaderProfile}pc=${start};${finishRunner("budget", "executed")}}const countedTrips${suffix}=m[${counter}]===0?4294967296:(m[${counter}]>>>0);const ${iterations}=Math.min(countedTrips${suffix},executed===0?Math.max(1,Math.floor(maxInstructions/${length})):Math.floor((maxInstructions-executed)/${length}));${spanGuards}${profileCode}executed+=${iterations}*${length};let ${value}=m[${counter}]|0;for(let countedIndex${suffix}=0;countedIndex${suffix}<${iterations};countedIndex${suffix}+=1){${coreCode}${value}=(${value}-1)|0;m[${counter}]=${value};A=${value};}if(${iterations}===countedTrips${suffix}){pc=${terminal.index + 1};continue runner;}${attemptedHeaderProfile}pc=${start};${finishRunner("budget", "executed")}}`;
  return `case ${start}: { ${countedCode}${scalar}continue runner; }`;
}

export function emitRunner(linked, options = {}) {
  const instructions = options.instructions ?? lowerOperands(linked);
  const serviceIntrinsicIds = options.serviceIntrinsicIds ?? new Set();
  const serviceInlines = options.serviceInlines ?? new Map();
  const counts = options.batchBudgets === false
    ? new Map(instructions.map((instruction) => [instruction.index,
      `if(executed>=maxInstructions){pc=${instruction.index};${finishRunner("budget", "executed")}}executed+=1;`]))
    : budgetCounts(linked, instructions, serviceIntrinsicIds);
  const selfBackedges = options.batchBudgets === false ? new Map() : structuredSelfBackedges(
    linked, instructions, serviceIntrinsicIds, counts, options.structuredSelfBackedgeLabels,
  );
  const countedBackedges = selectedCountedSelfBackedges(
    linked, selfBackedges, options.countedSelfBackedgeLabels,
  );
  const cases = instructions.map((instruction, index) => {
    const sinkFallthroughPc = options.sinkFallthroughPc === true
      && instructions[index + 1]?.index === instruction.index + 1;
    const body = selfBackedges.get(instruction.index);
    if (body) return emitStructuredSelfBackedge(
      body, counts, options.profileInstructions === true,
      options.sinkFallthroughPc === true, countedBackedges.get(instruction.index),
    );
    return emitInstruction(
      instruction, serviceIntrinsicIds, serviceInlines,
      counts.get(instruction.index) ?? "", options.profileInstructions === true,
      options.branchFallthrough !== false, sinkFallthroughPc,
    );
  }).join("\n");
  const defaultCase = options.transfer
    ? `default: ${finishRunner("transfer", "executed")}`
    : `default: halted=true; ${finishRunner("halted", "executed")}`;
  return `
    const fb = new ArrayBuffer(4), fi = new Int32Array(fb), ff = new Float32Array(fb);
    const idiv = (a,b) => { b |= 0; if (b === 0) throw new RangeError("Lino division by zero"); return ((a|0)/b)|0; };
    const irem = (a,b) => { b |= 0; if (b === 0) throw new RangeError("Lino division by zero"); return ((a|0)%b)|0; };
    const udiv = (a,b) => { b >>>= 0; if (b === 0) throw new RangeError("Lino division by zero"); return (((a>>>0)/b)>>>0)|0; };
    const urem = (a,b) => { b >>>= 0; if (b === 0) throw new RangeError("Lino division by zero"); return (((a>>>0)%b)>>>0)|0; };
    const rol = (a,b) => { const n=(b&31); return n===0?(a|0):((a<<n)|(a>>>(32-n))); };
    const ror = (a,b) => { const n=(b&31); return n===0?(a|0):((a>>>n)|(a<<(32-n))); };
    const umulh = (a,b) => { a>>>=0;b>>>=0;const p0=(a&65535)*(b&65535),p1=(a>>>16)*(b&65535)+(p0>>>16),p2=(a&65535)*(b>>>16)+(p1&65535);return ((a>>>16)*(b>>>16)+(p1>>>16)+(p2>>>16))|0; };
    const imulh = (a,b) => (umulh(a,b)-(a<0?(b>>>0):0)-(b<0?(a>>>0):0))|0;
    const itof = (a) => { ff[0]=Math.fround(a|0); return fi[0]|0; };
    const fread = (a) => { fi[0]=a|0; return ff[0]; };
    const ftoi = (a) => { fi[0]=a|0; const x=ff[0]; const f=Math.floor(x), r=x-f; return (r<0.5?f:r>0.5?f+1:((f&1)?f+1:f))|0; };
    const f64toi = (x) => { if(!Number.isFinite(x))return -2147483648;const f=Math.floor(x),r=x-f,n=r<0.5?f:r>0.5?f+1:((f%2)!==0?f+1:f);return n<-2147483648||n>2147483647?-2147483648:n|0; };
    const fop = (a,b,o) => { fi[0]=a|0; const x=ff[0]; fi[0]=b|0; const y=ff[0]; ff[0]=Math.fround(o===0?x+y:o===1?x-y:o===2?x*y:x/y); return fi[0]|0; };
    return function run(machine, maxInstructions = 10000000) {
      let m=machine.memory, md=machine.noctisDataView;
      if(!md||md.buffer!==m.buffer||md.byteOffset!==m.byteOffset||md.byteLength!==m.byteLength){md=new DataView(m.buffer,m.byteOffset,m.byteLength);machine.noctisDataView=md;}
      let s=machine.stack, d=machine.depth|0, pc=machine.pc|0, prof=machine.profile;
      let A=machine.A|0,B=machine.B|0,C=machine.C|0,D=machine.D|0,E=machine.E|0,X=machine.X|0;
      let halted=machine.halted, executed=0, q=0,u=0,v=0;
      let outputStatus="budget",outputInstructions=0,outputSleep=-1;
      const f64r=(a)=>md.getFloat64((a>>>0)*4,true);
      const f64w=(a,v)=>md.setFloat64((a>>>0)*4,v,true);
      if(halted){${SYNC_MACHINE}return {status:"halted",instructions:0,X};}
      runner: while(true){ switch(pc){
        ${cases}
        ${defaultCase}
      }}
      ${SYNC_MACHINE}
      return outputSleep<0?{status:outputStatus,instructions:outputInstructions,X}
        :{status:outputStatus,instructions:outputInstructions,X,sleepMilliseconds:outputSleep};
    };
  `;
}

export function emitStaticRunnerModule(linked, implementations, options = {}) {
  const lowered = lowerOperands(linked);
  const regionSize = Math.max(256, options.regionSize | 0 || 2048);
  const serviceIntrinsicIds = new Set(Object.keys(implementations)
    .filter((id) => id.startsWith("service:")));
  const serviceInlines = new Map(Object.entries(implementations)
    .filter(([id, implementation]) => id.startsWith("service:")
      && typeof implementation.inline === "function")
    .map(([id, implementation]) => [id, String(implementation.inline(linked))]));
  const factories = [];
  const names = [];
  for (let start = 0; start < lowered.length; start += regionSize) {
    const name = `createRegion${start}`;
    names.push(name);
    const instructions = lowered.slice(start, Math.min(start + regionSize, lowered.length));
    const source = emitRunner(linked, {
      instructions, serviceIntrinsicIds, serviceInlines,
      batchBudgets: options.batchBudgets,
      profileInstructions: options.profileInstructions,
      branchFallthrough: options.branchFallthrough,
      sinkFallthroughPc: options.sinkFallthroughPc,
      structuredSelfBackedgeLabels: options.structuredSelfBackedgeLabels,
      countedSelfBackedgeLabels: options.countedSelfBackedgeLabels,
      transfer: true,
    });
    factories.push(`function ${name}(dispatch, native) {${source}\n}`);
  }
  return `// Generated by LinoJava. Do not edit.\n`
    + `export const regionSize = ${regionSize};\n`
    + `export const instructionCount = ${lowered.length};\n`
    + `${factories.join("\n")}\n`
    + `export function createRunners(dispatch, native) {\n`
    + `  return [${names.map((name) => `${name}(dispatch, native)`).join(",")}];\n`
    + `}\n`;
}

export function compileLinkedProject(linked, host = {}, options = {}) {
  const implementations = { ...(linked.intrinsics ?? {}), ...(options.intrinsics ?? {}), ...(host.intrinsics ?? {}) };
  const missing = linked.nativeFragments?.filter((fragment) => typeof implementations[fragment.id] !== "function") ?? [];
  if (missing.length && !options.allowMissingIntrinsics) {
    const examples = missing.slice(0, 12).map((fragment) => `${fragment.id} at ${fragment.sourceId}:${fragment.line}`).join("; ");
    throw new Error(`Missing portable Lino intrinsics (${missing.length} fragments, ${new Set(missing.map((item) => item.id)).size} unique): ${examples}`);
  }
  const dispatch = (machine) => host.isocall?.(machine, linked)
    ?? dispatchIsoKernel(machine.memory, host, { kernelBase: linked.memoryLayout.kernelBase });
  const native = (id, machine) => {
    const implementation = implementations[id];
    if (typeof implementation !== "function") throw new Error(`Missing portable Lino intrinsic ${id}`);
    return implementation(machine, linked);
  };
  const serviceIntrinsicIds = new Set(Object.keys(implementations).filter((id) => id.startsWith("service:")));
  const serviceInlines = new Map(Object.entries(implementations)
    .filter(([id, implementation]) => id.startsWith("service:") && typeof implementation.inline === "function")
    .map(([id, implementation]) => [id, String(implementation.inline(linked))]));
  const lowered = lowerOperands(linked);
  const precompiled = options.precompiledRunners;
  const regionSize = Math.max(256, precompiled?.regionSize | 0
    || options.regionSize | 0 || 2048);
  let runners;
  if (precompiled) {
    if ((precompiled.instructionCount | 0) !== lowered.length) {
      throw new Error(`Precompiled Lino instruction count mismatch: ${precompiled.instructionCount} != ${lowered.length}`);
    }
    runners = precompiled.create(dispatch, native);
  } else {
    runners = [];
    for (let start = 0; start < lowered.length; start += regionSize) {
      const instructions = lowered.slice(start, Math.min(start + regionSize, lowered.length));
      const source = emitRunner(linked, {
        instructions, serviceIntrinsicIds, serviceInlines,
        batchBudgets: options.batchBudgets, profileInstructions: options.profileInstructions,
        branchFallthrough: options.branchFallthrough,
        sinkFallthroughPc: options.sinkFallthroughPc,
        structuredSelfBackedgeLabels: options.structuredSelfBackedgeLabels,
        countedSelfBackedgeLabels: options.countedSelfBackedgeLabels,
        transfer: true,
      });
      runners.push(new Function("dispatch", "native",
        `${source}\n//# sourceURL=lino-region-${start}.js`)(dispatch, native));
    }
  }
  const machine = {
    memory: new Int32Array(linked.initialMemory),
    stack: new Int32Array(1024), depth: 0,
    A: 0, B: 0, C: 0, D: 0, E: 0, X: DONE,
    pc: linked.entry, halted: false,
    profile: options.profileInstructions ? new Uint32Array(lowered.length) : null,
  };
  machine.callCode = (handle, maxInstructions = 10000000) => {
    const target = (handle | 0) - 1;
    if (target < 0 || target >= lowered.length) {
      throw new RangeError(`Invalid nested Lino code handle ${handle}`);
    }
    const outerPc = machine.pc | 0;
    const sentinel = lowered.length;
    if (machine.depth === machine.stack.length) {
      const grown = new Int32Array(machine.stack.length * 2);
      grown.set(machine.stack);
      machine.stack = grown;
    }
    machine.stack[machine.depth++] = sentinel + 1;
    machine.pc = target;
    let executed = 0;
    while ((machine.pc | 0) !== sentinel) {
      if (executed >= maxInstructions) throw new RangeError("Nested Lino call exceeded its instruction budget");
      const region = Math.floor((machine.pc | 0) / regionSize);
      const runner = runners[region];
      if (!runner) throw new RangeError(`Nested Lino call escaped to invalid PC ${machine.pc}`);
      const result = runner(machine, maxInstructions - executed);
      executed += result.instructions;
      if (result.status === "transfer" || result.status === "budget") continue;
      throw new Error(`Nested Lino call unexpectedly ${result.status} at PC ${machine.pc}`);
    }
    machine.pc = outerPc;
    return executed;
  };
  return {
    linked, machine,
    run(maxInstructions = 10000000) {
      const limit = Math.max(0, Number(maxInstructions) || 0);
      let executed = 0;
      while (executed < limit) {
        const region = Math.floor((machine.pc | 0) / regionSize);
        const runner = runners[region];
        if (!runner) {
          machine.halted = true;
          return { status: "halted", instructions: executed, X: machine.X | 0 };
        }
        const result = runner(machine, limit - executed);
        executed += result.instructions;
        if (result.status === "transfer") continue;
        return { ...result, instructions: executed };
      }
      return { status: machine.halted ? "halted" : "budget", instructions: executed, X: machine.X | 0 };
    },
    reset() {
      machine.memory.set(linked.initialMemory); machine.stack.fill(0); machine.depth = 0;
      machine.profile?.fill(0);
      machine.A = machine.B = machine.C = machine.D = machine.E = 0; machine.X = DONE;
      machine.pc = linked.entry; machine.halted = false;
    },
  };
}

export async function compileProject(entry, resolvers, options = {}) {
  const project = await loadProject(entry, resolvers);
  const linked = linkProject(project, options);
  const host = { ...(options.host ?? {}) };
  if (host.stockfile === undefined && host.stockFile === undefined) host.stockfile = linked.stockfile;
  return compileLinkedProject(linked, host, options);
}
