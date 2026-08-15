import { canonicalName } from "./lexer.js";

const DECLARATION_PERIODS = new Set([
  "directors",
  "constants",
  "variables",
  "workspace",
]);

function assignmentIndex(text) {
  let braceDepth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "{") braceDepth += 1;
    else if (character === "}") braceDepth -= 1;
    else if (character === "=" && braceDepth === 0) return index;
  }
  return -1;
}

function declarationTarget(text) {
  let target = text.trim();
  let shared = false;
  if (/^shared\s+/i.test(target)) {
    shared = true;
    target = target.replace(/^shared\s+/i, "").trim();
  }
  const vector = /^(vector|matrix|array)\s+(.+)$/i.exec(target);
  if (vector) {
    return { qualifier: vector[1].toLowerCase(), shared, name: vector[2].trim() };
  }
  if (canonicalName(target) === "nolabel") {
    return { qualifier: "no-label", shared, name: null };
  }
  return { qualifier: "scalar", shared, name: target };
}

export function parseDeclaration(item, periodName) {
  if (!DECLARATION_PERIODS.has(periodName)) {
    throw new TypeError(`Cannot parse a declaration from the ${periodName} period`);
  }
  const text = item.text.trim();
  const mode = /^make\s*:\s*(.+)$/i.exec(text);
  if (mode) {
    return { type: "mode", period: periodName, mode: canonicalName(mode[1]), sourceId: item.sourceId, line: item.line };
  }
  const align = /^align\s+at\s*:\s*(.+)$/i.exec(text);
  if (align) {
    return { type: "align", period: periodName, value: align[1].trim(), sourceId: item.sourceId, line: item.line };
  }
  const extend = /^extend\s+upto\s*:\s*(.+)$/i.exec(text);
  if (extend) {
    return {
      type: "extend",
      period: periodName,
      value: extend[1].trim(),
      sourceId: item.sourceId,
      line: item.line,
    };
  }

  const equals = assignmentIndex(text);
  if (equals < 0) {
    if (periodName !== "variables" && periodName !== "workspace") {
      throw new SyntaxError(`${item.sourceId}:${item.line}: ${periodName} declarations require '='`);
    }
    return {
      type: "continuation",
      period: periodName,
      value: text,
      sourceId: item.sourceId,
      line: item.line,
    };
  }

  const target = declarationTarget(text.slice(0, equals));
  const value = text.slice(equals + 1).trim();
  if (target.name !== null && !target.name) {
    throw new SyntaxError(`${item.sourceId}:${item.line}: Declaration has no name`);
  }
  if (!value) throw new SyntaxError(`${item.sourceId}:${item.line}: Declaration has no value`);
  return {
    type: "declaration",
    period: periodName,
    ...target,
    canonicalName: target.name === null ? null : canonicalName(target.name),
    value,
    sourceId: item.sourceId,
    line: item.line,
  };
}

export function collectProjectDeclarations(project) {
  const declarations = [];
  for (const module of project.modules) {
    for (const period of module.periods) {
      if (!DECLARATION_PERIODS.has(period.name)) continue;
      for (const item of period.items) {
        if (item.type !== "statement") continue;
        declarations.push(parseDeclaration(item, period.name));
      }
    }
  }
  return declarations;
}
