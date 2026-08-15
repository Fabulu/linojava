import { canonicalName } from "./lexer.js";

const TERMINATORS = new Set(["end", "fail", "leave", "isocall", "nop"]);
const BINARY_OPERATORS = [
  "++", "--", "**", "//", ",=", "=,", "<>", "<<", ">>", "<@", "@>",
  "'*", "'/", "'%",
  "+", "-", "*", "/", "%", "&", "|", "#", "<", ">",
];

function location(item, message) {
  return new SyntaxError(`${item.sourceId}:${item.line}: ${message}: ${item.text}`);
}

export function canonicalCodeName(value) {
  return canonicalName(String(value).replace(/^(?:shared|service)\s+/i, ""));
}

function splitArrow(text, item) {
  const index = text.indexOf("->");
  if (index < 0) throw location(item, "Conditional instruction has no target");
  return [text.slice(0, index).trim(), text.slice(index + 2).trim()];
}

function leadingOperand(text, item) {
  const source = text.trimStart();
  if (source.startsWith("[")) {
    const end = source.indexOf("]");
    if (end < 0) throw location(item, "Unclosed memory operand");
    return [source.slice(0, end + 1), source.slice(end + 1).trim()];
  }
  const stack = /^\$:\s*\d+/i.exec(source);
  if (stack) return [stack[0], source.slice(stack[0].length).trim()];
  const register = /^[a-e](?![a-z0-9_])/i.exec(source);
  if (register) return [register[0], source.slice(register[0].length).trim()];
  throw location(item, "Expected a register, memory, or stack operand");
}

function parseMutation(text, item) {
  if (text.startsWith("!")) {
    const [destination, rest] = leadingOperand(text.slice(1), item);
    if (rest) throw location(item, "Unexpected text after unary NOT");
    return { op: "unary", operator: "!", destination };
  }
  const [destination, rest] = leadingOperand(text, item);
  if (!rest) throw location(item, "Incomplete instruction");
  if (rest === "+" || rest === "-") return { op: rest === "+" ? "increment" : "decrement", destination };
  if (rest === "+-") return { op: "unary", operator: "+-", destination };
  for (const operator of BINARY_OPERATORS) {
    if (rest.startsWith(operator)) {
      const source = rest.slice(operator.length).trim();
      if (!source) throw location(item, `Operator ${operator} has no source`);
      return { op: operator === "<>" ? "swap" : "binary", operator, destination, source };
    }
  }
  if (rest.startsWith("=")) {
    const source = rest.slice(1).trim();
    if (!source) throw location(item, "Assignment has no source");
    return { op: "assign", destination, source };
  }
  throw location(item, "Unknown programme instruction");
}

function parsePredicate(text, item) {
  const floating = text.startsWith("??");
  const [condition, target] = splitArrow(text.slice(floating ? 2 : 1).trim(), item);
  if (!target) throw location(item, "Predicate has no branch target");
  if (/^(ok|failed)$/i.test(condition)) {
    return { op: "branch-status", status: condition.toLowerCase(), target };
  }
  const [left, rest] = leadingOperand(condition, item);
  const match = /^(?:(')\s*)?(>=|<=|!=|=|>|<|\+|-)\s*(.+)$/s.exec(rest);
  if (!match) throw location(item, "Unknown predicate");
  return {
    op: "branch",
    left,
    unsigned: Boolean(match[1]),
    operator: match[2],
    right: match[3].trim(),
    target,
    floating,
  };
}

export function parseProgrammeStatement(item) {
  const text = item.text.trim();
  const lower = text.toLowerCase();
  if (text.includes("{") || text.includes("}")) {
    throw location(item, "Native programme fragment needs a portable intrinsic");
  }
  if (TERMINATORS.has(lower)) return { op: lower };
  if (text === "---->") return { op: "push-all" };
  if (text === "<----") return { op: "pop-all" };
  if (lower === "stack") return { op: "nop" };
  if (text.startsWith("?")) return parsePredicate(text, item);
  if (text.startsWith("=>")) return { op: "call", target: text.slice(2).trim() };
  if (text.startsWith("->")) return { op: "jump", target: text.slice(2).trim() };

  const loop = /^(.*?)\s*\^\s*(.+)$/s.exec(text);
  if (loop) return { op: "loop", counter: loop[1].trim(), target: loop[2].trim() };
  if (/^\$\s*[+-]/.test(text)) {
    const match = /^\$\s*([+-])\s*(\d+)$/i.exec(text);
    if (!match) throw location(item, "Invalid stack adjustment");
    return { op: "stack-adjust", direction: match[1], count: Number(match[2]) };
  }
  const push = /^(.*?)\s*-->$/s.exec(text);
  if (push) return { op: "push", source: push[1].trim() };
  const popPrefix = /^<--\s*(.+)$/s.exec(text);
  if (popPrefix) return { op: "pop", destination: popPrefix[1].trim() };
  const popSuffix = /^(.*?)\s*<--$/s.exec(text);
  if (popSuffix) return { op: "pop", destination: popSuffix[1].trim() };
  const postfixNot = /^(.*?)\s+!$/.exec(text);
  if (postfixNot) return { op: "unary", operator: "!", destination: postfixNot[1].trim() };
  return parseMutation(text, item);
}

export function collectProgramme(project) {
  const instructions = [];
  const labels = new Map();
  const aliases = [];
  let entry = null;

  for (const module of project.modules) {
    const moduleStart = instructions.length;
    let pendingLabels = [];
    for (const period of module.periods.filter((candidate) => candidate.name === "programme")) {
      for (const item of period.items) {
        if (item.type === "label") {
          pendingLabels.push({
            name: item.text,
            canonicalName: canonicalCodeName(item.text),
            qualifier: /^\s*service\s+/i.test(item.text) ? "service" : null,
            sourceId: item.sourceId,
            line: item.line,
          });
          continue;
        }
        if (item.type !== "statement") continue;
        const index = instructions.length;
        for (const label of pendingLabels) {
          if (labels.has(label.canonicalName)) {
            throw new SyntaxError(`${label.sourceId}:${label.line}: Duplicate programme label ${label.name}`);
          }
          labels.set(label.canonicalName, index);
          aliases.push({ ...label, instruction: index });
        }
        pendingLabels = [];
        instructions.push({
          ...parseProgrammeStatement(item),
          index,
          sourceId: item.sourceId,
          line: item.line,
          text: item.text,
          moduleId: module.id,
        });
      }
    }
    if (pendingLabels.length) {
      throw new SyntaxError(`${pendingLabels[0].sourceId}:${pendingLabels[0].line}: Programme label has no instruction`);
    }
    if (module.id === project.entry) entry = moduleStart;
  }
  if (entry === null) throw new Error(`Root module ${project.entry} has no programme period`);
  return { instructions, labels, aliases, entry };
}
