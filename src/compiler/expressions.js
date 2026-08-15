import { canonicalName } from "./lexer.js";

const OPERATORS = [
  ["multiplied", "multiply"],
  ["relating", "add"],
  ["divided", "divide"],
  ["minus", "subtract"],
  ["plus", "add"],
  ["mtp", "multiply"],
  ["div", "divide"],
];

const floatBuffer = new ArrayBuffer(4);
const floatValues = new Float32Array(floatBuffer);
const floatBits = new Int32Array(floatBuffer);

function numericLiteral(text) {
  const value = text.trim();
  const hex = /^([0-9a-f]+)h$/i.exec(value);
  if (hex) return { kind: "integer", value: Number.parseInt(hex[1], 16) | 0 };
  const binary = /^([01]+)b$/i.exec(value);
  if (binary) return { kind: "integer", value: Number.parseInt(binary[1], 2) | 0 };
  const decimal = /^(\d+)(?:d)?$/i.exec(value);
  if (decimal) return { kind: "integer", value: Number.parseInt(decimal[1], 10) | 0 };
  const float = /^(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?f$/i.exec(value);
  if (float) {
    return { kind: "float", value: Math.fround(Number.parseFloat(value.slice(0, -1))) };
  }
  return null;
}

function nextOperator(text, start) {
  const lower = text.toLowerCase();
  let found = null;
  for (const [keyword, operation] of OPERATORS) {
    const index = lower.indexOf(keyword, start);
    if (index >= 0 && (!found || index < found.index || (index === found.index && keyword.length > found.keyword.length))) {
      found = { index, keyword, operation };
    }
  }
  return found;
}

function operandValue(text, resolve) {
  let operand = text.trim();
  let sign = 1;
  let unary = /^(plus|minus)\s*/i.exec(operand);
  while (unary) {
    if (unary[1].toLowerCase() === "minus") sign *= -1;
    operand = operand.slice(unary[0].length).trim();
    unary = /^(plus|minus)\s*/i.exec(operand);
  }
  const literal = numericLiteral(operand);
  if (literal !== null) {
    if (literal.kind === "float") return { kind: "float", value: Math.fround(literal.value * sign) };
    return { kind: "integer", value: sign < 0 ? (-literal.value) | 0 : literal.value };
  }

  const qualified = /^(vector|matrix|service|pragma)\s+(.+)$/i.exec(operand);
  const name = qualified ? qualified[2] : operand;
  if (!name) throw new SyntaxError(`Missing operand in expression: ${text}`);
  const resolved = resolve(canonicalName(name), {
    qualifier: qualified?.[1].toLowerCase() ?? null,
    source: name.trim(),
  });
  if (resolved === undefined || resolved === null) throw new ReferenceError(`Unknown Lino symbol: ${name.trim()}`);
  const typed = typeof resolved === "object" && resolved.kind
    ? resolved
    : { kind: "integer", value: Number(resolved) | 0 };
  if (typed.kind === "float") return { kind: "float", value: Math.fround(typed.value * sign) };
  return { kind: "integer", value: sign < 0 ? (-typed.value) | 0 : typed.value | 0 };
}

function applyOperation(left, right, operation, source) {
  if (left.kind === "float" || right.kind === "float") {
    const a = left.kind === "float" ? left.value : left.value | 0;
    const b = right.kind === "float" ? right.value : right.value | 0;
    if (operation === "divide" && b === 0) throw new RangeError(`Division by zero in Lino expression: ${source}`);
    if (operation === "add") return { kind: "float", value: Math.fround(a + b) };
    if (operation === "subtract") return { kind: "float", value: Math.fround(a - b) };
    if (operation === "multiply") return { kind: "float", value: Math.fround(a * b) };
    return { kind: "float", value: Math.fround(a / b) };
  }
  if (operation === "add") return { kind: "integer", value: (left.value + right.value) | 0 };
  if (operation === "subtract") return { kind: "integer", value: (left.value - right.value) | 0 };
  if (operation === "multiply") return { kind: "integer", value: Math.imul(left.value, right.value) | 0 };
  if (right.value === 0) throw new RangeError(`Division by zero in Lino expression: ${source}`);
  return { kind: "integer", value: (left.value / right.value) | 0 };
}

export function evaluateTypedExpression(text, resolve = () => undefined) {
  let source = text.trim();
  if (!source) throw new SyntaxError("Empty Lino expression");
  const byteSize = /(?:as\s*byte\s*size|asbytesize)\s*$/i.exec(source);
  if (byteSize) source = source.slice(0, byteSize.index).trim();

  let firstStart = 0;
  let leading = /^(plus|minus)\s*/i.exec(source.slice(firstStart));
  while (leading) {
    firstStart += leading[0].length;
    leading = /^(plus|minus)\s*/i.exec(source.slice(firstStart));
  }
  let operator = nextOperator(source, Math.max(firstStart, 1));
  let value = operandValue(operator ? source.slice(0, operator.index) : source, resolve);

  while (operator) {
    const rightStart = operator.index + operator.keyword.length;
    const following = nextOperator(source, rightStart + 1);
    const rightText = source.slice(rightStart, following?.index ?? source.length);
    const right = operandValue(rightText, resolve);
    value = applyOperation(value, right, operator.operation, text);
    operator = following;
  }
  if (byteSize) {
    if (value.kind !== "integer") throw new TypeError(`Float expression cannot use as byte size: ${text}`);
    if (value.value < 0) throw new RangeError(`Negative byte size in Lino expression: ${text}`);
    value = { kind: "integer", value: Math.ceil(value.value / 4) | 0 };
  }
  return value;
}

export function evaluateExpression(text, resolve = () => undefined) {
  const value = evaluateTypedExpression(text, resolve);
  if (value.kind === "integer") return value.value | 0;
  floatValues[0] = value.value;
  return floatBits[0];
}

export const DEFAULT_CONSTANTS = Object.freeze({
  null: 0,
  zero: 0,
  no: 0,
  off: 0,
  false: 0,
  yes: 1,
  on: 1,
  true: 1,
  undefined: 0x3f3f3f3f,
  greatestunsignedinteger: -1,
  greatestsignedinteger: 0x7fffffff,
  smallestunsignedinteger: 0,
  smallestsignedinteger: -0x80000000,
  cpuunit: 32,
  stockfile: 0,
  bytesperunit: 4,
  middle: 1048577,
  normalpriority: 2,
});

export function projectConstants(project, predefined = DEFAULT_CONSTANTS) {
  const constants = { ...predefined };
  for (const stockfile of project.stockfiles ?? []) {
    for (const symbol of stockfile.symbols ?? []) {
      constants[canonicalName(symbol)] = stockfile.offset | 0;
      constants[canonicalName(`Size of ${symbol}`)] = stockfile.data.byteLength | 0;
    }
  }
  return constants;
}

export function resolveConstants(declarations, predefined = DEFAULT_CONSTANTS) {
  const records = new Map();
  const values = new Map(Object.entries(predefined).map(([name, value]) => [canonicalName(name), value | 0]));
  const typedValues = new Map([...values].map(([name, value]) => [name, { kind: "integer", value }]));
  const resolving = [];

  for (const declaration of declarations) {
    if (declaration.period !== "constants" || declaration.type !== "declaration") continue;
    if (records.has(declaration.canonicalName) || values.has(declaration.canonicalName)) {
      throw new SyntaxError(`${declaration.sourceId}:${declaration.line}: Duplicate Lino constant ${declaration.name}`);
    }
    records.set(declaration.canonicalName, declaration);
  }

  const resolve = (name) => {
    const canonical = canonicalName(name);
    if (typedValues.has(canonical)) return typedValues.get(canonical);
    const record = records.get(canonical);
    if (!record) return undefined;
    if (resolving.includes(canonical)) {
      throw new Error(`Circular Lino constant expression: ${[...resolving, canonical].join(" -> ")}`);
    }
    resolving.push(canonical);
    try {
      const typed = evaluateTypedExpression(record.value, resolve);
      const value = typed.kind === "integer" ? typed.value | 0 : (() => {
        floatValues[0] = typed.value;
        return floatBits[0];
      })();
      typedValues.set(canonical, typed);
      values.set(canonical, value);
      return typed;
    } catch (error) {
      throw new Error(`${record.sourceId}:${record.line}: Cannot resolve constant ${record.name}: ${error.message}`, { cause: error });
    } finally {
      resolving.pop();
    }
  };

  for (const name of records.keys()) resolve(name);
  Object.defineProperty(values, "typedValues", { value: typedValues });
  return values;
}
