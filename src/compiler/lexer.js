export const PERIOD_NAMES = new Set([
  "libraries",
  "directors",
  "constants",
  "variables",
  "workspace",
  "stockfile",
  "programme",
]);

export function canonicalName(value) {
  return String(value).replace(/[\x00-\x20]+/g, "").toLowerCase();
}

export function lexSource(source, options = {}) {
  const items = [];
  const sourceId = options.sourceId ?? "<source>";
  let buffer = "";
  let commentDepth = 0;
  let braceDepth = 0;
  let line = 1;
  let itemLine = 1;

  const beginItem = () => {
    if (!buffer.trim()) itemLine = line;
  };
  const append = (character) => {
    beginItem();
    buffer += character;
  };
  const flushStatement = () => {
    const text = buffer.trim();
    if (text) items.push({ type: "statement", text, sourceId, line: itemLine });
    buffer = "";
    itemLine = line;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (commentDepth > 0) {
      if (character === "(") commentDepth += 1;
      if (character === ")") commentDepth -= 1;
      if (character === "\n") line += 1;
      continue;
    }

    if (braceDepth > 0) {
      append(character);
      if (character === "{") braceDepth += 1;
      if (character === "}") braceDepth -= 1;
      if (character === "\n") line += 1;
      continue;
    }

    if (character === "(") {
      commentDepth = 1;
      continue;
    }
    if (character === ")") {
      throw new SyntaxError(`${sourceId}:${line}: Unmatched closing comment delimiter`);
    }
    if (character === "{") {
      braceDepth = 1;
      append(character);
      continue;
    }
    if (character === "}") {
      throw new SyntaxError(`${sourceId}:${line}: Unmatched closing braced-data delimiter`);
    }
    if (character === '"') {
      flushStatement();
      const labelLine = line;
      let label = "";
      let closed = false;
      for (index += 1; index < source.length; index += 1) {
        const labelCharacter = source[index];
        if (labelCharacter === '"') {
          closed = true;
          break;
        }
        if (labelCharacter === "\n") line += 1;
        label += labelCharacter;
      }
      if (!closed) throw new SyntaxError(`${sourceId}:${labelLine}: Unterminated quoted label`);
      items.push({ type: "label", text: label.trim(), sourceId, line: labelLine });
      itemLine = line;
      continue;
    }
    if (character === ";") {
      flushStatement();
      continue;
    }

    append(character);
    if (character === "\n") line += 1;
  }

  if (commentDepth !== 0) throw new SyntaxError(`${sourceId}:${line}: Unterminated comment`);
  if (braceDepth !== 0) throw new SyntaxError(`${sourceId}:${line}: Unterminated braced data`);
  flushStatement();
  return items;
}

export function groupPeriods(items) {
  const periods = [];
  let current = null;

  for (const item of items) {
    const name = item.type === "label" ? canonicalName(item.text) : "";
    if (current?.name !== "programme" && PERIOD_NAMES.has(name)) {
      current = { name, sourceId: item.sourceId, line: item.line, items: [] };
      periods.push(current);
    } else if (current) {
      current.items.push(item);
    }
  }
  return periods;
}

export function periodStatements(periods, name) {
  const canonical = canonicalName(name);
  return periods
    .filter((period) => period.name === canonical)
    .flatMap((period) => period.items.filter((item) => item.type === "statement"));
}
