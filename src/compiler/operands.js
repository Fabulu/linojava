import { evaluateExpression } from "./expressions.js";
import { canonicalName } from "./lexer.js";
import { canonicalCodeName } from "./programme.js";

const ADDRESS_OPERATORS = [
  ["multiplied", "multiply"], ["relating", "add"], ["divided", "divide"],
  ["minus", "subtract"], ["plus", "add"], ["mtp", "multiply"], ["div", "divide"],
];

function stripQualifier(text) {
  const match = /^(vector|matrix|array|pragma|service)\s+(.+)$/i.exec(text.trim());
  return match ? { qualifier: match[1].toLowerCase(), name: match[2].trim() } : { qualifier: null, name: text.trim() };
}

function symbolRecord(text, linked, target = false) {
  const { qualifier, name } = stripQualifier(text);
  const canonical = qualifier === "service" || target ? canonicalCodeName(name) : canonicalName(name);
  const key = qualifier === "service" || target ? `service:${canonical}` : canonical;
  return linked.symbols.get(key);
}

function staticInteger(text, linked) {
  try {
    return evaluateExpression(text, (name, details = {}) => {
      const source = details.source ?? name;
      return symbolRecord(`${details.qualifier ? `${details.qualifier} ` : ""}${source}`, linked)?.value;
    });
  } catch (error) {
    if (error instanceof ReferenceError) return null;
    throw error;
  }
}

function atom(text, linked) {
  const source = text.trim();
  if (/^[a-e]$/i.test(source)) return { kind: "register", name: source.toUpperCase() };
  const record = symbolRecord(source, linked);
  if (record) return { kind: "immediate", value: record.value | 0, symbol: record.name, symbolKind: record.kind };
  const value = staticInteger(source, linked);
  if (value !== null) return { kind: "immediate", value: value | 0 };
  return null;
}

function operatorPositions(text) {
  const positions = [];
  for (const [word, operation] of ADDRESS_OPERATORS) {
    const expression = new RegExp(`\\b${word}\\b`, "ig");
    for (let match = expression.exec(text); match; match = expression.exec(text)) {
      positions.push({ index: match.index, length: match[0].length, operation });
    }
  }
  return positions.sort((a, b) => b.index - a.index || b.length - a.length);
}

export function parseAddressExpression(text, linked) {
  const source = text.trim();
  const direct = atom(source, linked);
  if (direct) return direct;
  const unary = /^(plus|minus)\s+(.+)$/i.exec(source);
  if (unary) {
    const value = parseAddressExpression(unary[2], linked);
    return unary[1].toLowerCase() === "minus" ? { kind: "negate", value } : value;
  }
  for (const operator of operatorPositions(source)) {
    const leftText = source.slice(0, operator.index).trim();
    const rightText = source.slice(operator.index + operator.length).trim();
    if (!leftText || !rightText) continue;
    try {
      const right = atom(rightText, linked);
      if (!right) continue;
      const left = parseAddressExpression(leftText, linked);
      return { kind: "arithmetic", operator: operator.operation, left, right };
    } catch {
      // A reserved word may be part of a symbol name. Try the next split.
    }
  }
  throw new SyntaxError(`Unknown Lino operand expression: ${text}`);
}

export function parseOperand(text, linked, options = {}) {
  const source = text.trim();
  const memory = /^\[(.*)\]$/s.exec(source);
  if (memory) return { kind: "memory", address: parseAddressExpression(memory[1], linked) };
  const stack = /^\$:\s*(\d+)$/i.exec(source);
  if (stack) return { kind: "stack", offset: Number(stack[1]) };
  if (options.target) {
    const record = symbolRecord(source, linked, true);
    if (record) return { kind: "immediate", value: record.value | 0, symbol: record.name, symbolKind: "code" };
  }
  return parseAddressExpression(source, linked);
}

export function lowerOperands(linked) {
  const lower = (text, options) => parseOperand(text, linked, options);
  return linked.instructions.map((instruction) => {
    const result = { ...instruction };
    if (instruction.destination) result.destination = lower(instruction.destination);
    if (instruction.source) result.source = lower(instruction.source);
    if (instruction.left) result.left = lower(instruction.left);
    if (instruction.right) result.right = lower(instruction.right);
    if (instruction.counter) result.counter = lower(instruction.counter);
    if (instruction.target) result.target = lower(instruction.target, { target: true });
    return result;
  });
}
