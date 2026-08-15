import { evaluateExpression } from "./expressions.js";
import { canonicalName } from "./lexer.js";

const STRING_ESCAPES = Object.freeze({
  cr: 13,
  lf: 10,
  cs: 125,
  ta: 9,
  us: 95,
});

export function encodeLinoString(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    throw new SyntaxError(`Invalid Lino braced string: ${text}`);
  }
  const body = trimmed.slice(1, -1);
  const units = [];
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    const code = character.charCodeAt(0);
    if (code <= 32) continue;
    if (character === "_") {
      units.push(32);
      continue;
    }
    if (character === "\\") {
      const tag = body.slice(index + 1, index + 3).toLowerCase();
      if (Object.hasOwn(STRING_ESCAPES, tag)) {
        units.push(STRING_ESCAPES[tag]);
        index += 2;
      } else if (body[index + 1] === "\\") {
        units.push(92);
        index += 1;
      } else {
        units.push(92);
      }
      continue;
    }
    units.push(code & 255);
  }
  units.push(0);
  return units;
}

function valueUnits(value, resolve) {
  const text = value.trim();
  const repeated = /^(.*?)\s*\*{3}\s*(.+)$/.exec(text);
  if (repeated) {
    if (repeated[1].trim().startsWith("{")) {
      throw new SyntaxError(`Lino strings cannot use repetition: ${text}`);
    }
    const count = evaluateExpression(repeated[2], resolve);
    if (count < 0) throw new RangeError(`Negative Lino repetition count: ${text}`);
    const item = valueUnits(repeated[1], resolve);
    if (item.relocation) {
      return { units: Array.from({ length: count }, () => 0), relocation: { ...item.relocation, count } };
    }
    const units = [];
    for (let index = 0; index < count; index += 1) units.push(...item.units);
    return { units, relocation: null };
  }
  if (text.startsWith("{") && text.endsWith("}")) {
    return { units: encodeLinoString(text), relocation: null };
  }
  try {
    return { units: [evaluateExpression(text, resolve)], relocation: null };
  } catch (error) {
    if (error instanceof ReferenceError) return { units: [0], relocation: { expression: text, count: 1 } };
    throw error;
  }
}

function relocationKind(expression, options) {
  if (/^service\s+/i.test(expression)) return "code";
  const canonical = canonicalName(expression.replace(/^(vector|matrix|array|service|pragma)\s+/i, ""));
  if (options.codeLabels?.has(canonical)) return "code";
  if (options.workspaceSymbols?.has(canonical)) return "workspace";
  return "data";
}

export function buildInitializedData(declarations, constants, options = {}) {
  const values = [];
  const symbols = new Map();
  const symbolKinds = new Map();
  const relocations = [];
  let activeBase = 0;

  const resolve = (name, details) => {
    if (constants.has(name)) return constants.typedValues?.get(name) ?? constants.get(name);
    if (symbols.has(name)) return symbols.get(name);
    return options.resolveSymbol?.(name, details);
  };

  for (const declaration of declarations) {
    if (declaration.period !== "variables") continue;
    if (declaration.type === "mode") {
      if (declaration.mode !== "units") {
        throw new SyntaxError(`${declaration.sourceId}:${declaration.line}: Data mode '${declaration.mode}' needs its portable packer`);
      }
      continue;
    }
    if (declaration.type === "align") {
      throw new SyntaxError(`${declaration.sourceId}:${declaration.line}: align at needs the packed-data linker`);
    }
    if (declaration.type === "extend") {
      const extent = evaluateExpression(declaration.value, resolve);
      const target = activeBase + extent;
      if (target < values.length) {
        throw new RangeError(`${declaration.sourceId}:${declaration.line}: extend upto moves backward`);
      }
      while (values.length < target) values.push(0);
      continue;
    }

    if (declaration.type === "declaration" && declaration.name !== null) {
      if (symbols.has(declaration.canonicalName) || constants.has(declaration.canonicalName)) {
        throw new SyntaxError(`${declaration.sourceId}:${declaration.line}: Duplicate Lino symbol ${declaration.name}`);
      }
      activeBase = values.length;
      symbols.set(declaration.canonicalName, activeBase);
      symbolKinds.set(declaration.canonicalName, declaration.qualifier);
    }

    const emitted = valueUnits(declaration.value, resolve);
    const start = values.length;
    values.push(...emitted.units.map((value) => value | 0));
    if (emitted.relocation) {
      relocations.push({
        index: start,
        expression: emitted.relocation.expression,
        count: emitted.relocation.count,
        kind: relocationKind(emitted.relocation.expression, options),
        sourceId: declaration.sourceId,
        line: declaration.line,
      });
    }
  }

  const unresolved = [];
  for (const relocation of relocations) {
    try {
      const value = evaluateExpression(relocation.expression, resolve);
      for (let offset = 0; offset < relocation.count; offset += 1) values[relocation.index + offset] = value;
    } catch (error) {
      if (!(error instanceof ReferenceError)) throw error;
      unresolved.push({ ...relocation, message: error.message });
    }
  }

  return {
    values: Int32Array.from(values),
    symbols,
    symbolKinds,
    relocations,
    unresolved,
  };
}

export function measureWorkspace(declarations, constants, options = {}) {
  const symbols = new Map();
  let units = 0;
  const base = options.base ?? 0;
  const resolve = (name) => constants.typedValues?.get(name) ?? constants.get(name) ?? symbols.get(name);
  for (const declaration of declarations) {
    if (declaration.period !== "workspace") continue;
    if (declaration.type === "mode") {
      if (declaration.mode !== "units") {
        throw new SyntaxError(`${declaration.sourceId}:${declaration.line}: Workspace mode '${declaration.mode}' is not unit-addressable`);
      }
      continue;
    }
    if (declaration.type === "align") {
      throw new SyntaxError(`${declaration.sourceId}:${declaration.line}: Workspace align at is not implemented`);
    }
    if (declaration.type !== "declaration" && declaration.type !== "continuation") {
      throw new SyntaxError(`${declaration.sourceId}:${declaration.line}: Invalid workspace entry`);
    }
    if (declaration.type === "declaration" && declaration.name !== null) {
      if (symbols.has(declaration.canonicalName) || constants.has(declaration.canonicalName)) {
        throw new SyntaxError(`${declaration.sourceId}:${declaration.line}: Duplicate Lino symbol ${declaration.name}`);
      }
      symbols.set(declaration.canonicalName, base + units);
    }
    const size = evaluateExpression(declaration.value, resolve);
    if (size < 0) throw new RangeError(`${declaration.sourceId}:${declaration.line}: Negative workspace size`);
    units += size;
    if (!Number.isSafeInteger(units)) throw new RangeError(`${declaration.sourceId}:${declaration.line}: Workspace is too large`);
  }
  return { base, units, symbols };
}
