import { dispatchIsoKernel, DONE, FAIL } from "./isokernel-abi.js";
import { linkProject } from "./linker.js";
import { loadProject } from "./project-loader.js";
import { lowerOperands } from "./operands.js";

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

function integerBinary(operator, left, right) {
  if (operator === "+") return `((${left}) + (${right}))`;
  if (operator === "-") return `((${left}) - (${right}))`;
  if (operator === "*") return `Math.imul(${left}, ${right})`;
  if (operator === "/") return `idiv(${left}, ${right})`;
  if (operator === "%") return `irem(${left}, ${right})`;
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
  return `${setStatus} if (d === 0) { pc = ${index}; halted = true; return save("halted", executed); } pc = (s[--d] | 0) - 1; break;`;
}

function emitInstruction(instruction) {
  const next = instruction.index + 1;
  let code;
  switch (instruction.op) {
    case "assign": code = destination(instruction.destination, expression(instruction.source)); break;
    case "increment": code = updateDestination(instruction.destination, (left) => `((${left}) + 1)`); break;
    case "decrement": code = updateDestination(instruction.destination, (left) => `((${left}) - 1)`); break;
    case "unary": code = updateDestination(instruction.destination, (left) => instruction.operator === "!" ? `~(${left})` : `-(${left})`); break;
    case "binary": code = updateDestination(instruction.destination, (left) => integerBinary(instruction.operator, left, expression(instruction.source))); break;
    case "swap": {
      const left = destinationReference(instruction.destination, "swapLeft");
      const right = destinationReference(instruction.source, "swapRight");
      code = `${left.setup} ${right.setup} u = ${left.read}; v = ${right.read}; ${left.write("v")} ${right.write("u")}`;
      break;
    }
    case "push": code = push(expression(instruction.source)); break;
    case "pop": code = `if (d === 0) throw new RangeError("Lino stack underflow"); u = s[--d] | 0; ${destination(instruction.destination, "u")}`; break;
    case "push-all": code = ["A", "B", "C", "D", "E"].map(push).join(" "); break;
    case "pop-all": code = ["E", "D", "C", "B", "A"].map((name) => `if (d === 0) throw new RangeError("Lino stack underflow"); ${name} = s[--d] | 0;`).join(" "); break;
    case "stack-adjust": code = instruction.direction === "+" ? `d -= ${instruction.count}; if (d < 0) throw new RangeError("Lino stack underflow");` : `for (u = 0; u < ${instruction.count}; u += 1) { ${push("0")} }`; break;
    case "call": code = `${push(next + 1)} pc = (${expression(instruction.target)}) - 1; break;`; return `case ${instruction.index}: { ${code} }`;
    case "jump": return `case ${instruction.index}: { pc = (${expression(instruction.target)}) - 1; break; }`;
    case "branch": return `case ${instruction.index}: { pc = ${predicate(instruction)} ? ((${expression(instruction.target)}) - 1) : ${next}; break; }`;
    case "branch-status": return `case ${instruction.index}: { pc = (X === ${instruction.status === "ok" ? DONE : FAIL}) ? ((${expression(instruction.target)}) - 1) : ${next}; break; }`;
    case "loop": code = updateDestination(instruction.counter, (left) => `((${left}) - 1)`); return `case ${instruction.index}: { ${code} pc = (${expression(instruction.counter)}) !== 0 ? ((${expression(instruction.target)}) - 1) : ${next}; break; }`;
    case "isocall": return `case ${instruction.index}: { pc = ${next}; sync(); const result = dispatch(machine); X = result?.status === ${FAIL} || result?.success === false ? ${FAIL} : ${DONE}; if (result?.yielded || result?.yield) return save("yield", executed); break; }`;
    case "end": return `case ${instruction.index}: { ${returnInstruction(DONE, instruction.index)} }`;
    case "fail": return `case ${instruction.index}: { ${returnInstruction(FAIL, instruction.index)} }`;
    case "leave": return `case ${instruction.index}: { ${returnInstruction(null, instruction.index)} }`;
    case "nop": code = ""; break;
    default: throw new SyntaxError(`Cannot emit Lino instruction ${instruction.op}`);
  }
  return `case ${instruction.index}: { ${code} pc = ${next}; break; }`;
}

export function emitRunner(linked) {
  const instructions = lowerOperands(linked);
  const cases = instructions.map(emitInstruction).join("\n");
  return `
    const fb = new ArrayBuffer(4), fi = new Int32Array(fb), ff = new Float32Array(fb);
    const idiv = (a,b) => { b |= 0; if (b === 0) throw new RangeError("Lino division by zero"); return ((a|0)/b)|0; };
    const irem = (a,b) => { b |= 0; if (b === 0) throw new RangeError("Lino division by zero"); return ((a|0)%b)|0; };
    const rol = (a,b) => { const n=(b&31); return n===0?(a|0):((a<<n)|(a>>>(32-n))); };
    const ror = (a,b) => { const n=(b&31); return n===0?(a|0):((a>>>n)|(a<<(32-n))); };
    const itof = (a) => { ff[0]=Math.fround(a|0); return fi[0]|0; };
    const ftoi = (a) => { fi[0]=a|0; const x=ff[0]; const f=Math.floor(x), r=x-f; return (r<0.5?f:r>0.5?f+1:((f&1)?f+1:f))|0; };
    const fop = (a,b,o) => { fi[0]=a|0; const x=ff[0]; fi[0]=b|0; const y=ff[0]; ff[0]=Math.fround(o===0?x+y:o===1?x-y:o===2?x*y:x/y); return fi[0]|0; };
    return function run(machine, maxInstructions = 10000000) {
      let m=machine.memory, s=machine.stack, d=machine.depth|0, pc=machine.pc|0;
      let A=machine.A|0,B=machine.B|0,C=machine.C|0,D=machine.D|0,E=machine.E|0,X=machine.X|0;
      let halted=machine.halted, executed=0, q=0,u=0,v=0;
      const sync=()=>{machine.stack=s;machine.depth=d;machine.pc=pc;machine.A=A;machine.B=B;machine.C=C;machine.D=D;machine.E=E;machine.X=X;machine.halted=halted;};
      const save=(status,count)=>{sync();return {status,instructions:count,X};};
      if(halted)return save("halted",0);
      while(executed < maxInstructions){ executed += 1; switch(pc){
        ${cases}
        default: halted=true; return save("halted",executed);
      }}
      return save("budget",executed);
    };
  `;
}

export function compileLinkedProject(linked, host = {}) {
  const dispatch = (machine) => host.isocall?.(machine, linked)
    ?? dispatchIsoKernel(machine.memory, host, { kernelBase: linked.memoryLayout.kernelBase });
  const runner = new Function("dispatch", emitRunner(linked))(dispatch);
  const machine = {
    memory: new Int32Array(linked.initialMemory),
    stack: new Int32Array(1024), depth: 0,
    A: 0, B: 0, C: 0, D: 0, E: 0, X: DONE,
    pc: linked.entry, halted: false,
  };
  return {
    linked, machine,
    run(maxInstructions) { return runner(machine, maxInstructions); },
    reset() {
      machine.memory.set(linked.initialMemory); machine.stack.fill(0); machine.depth = 0;
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
  return compileLinkedProject(linked, host);
}
