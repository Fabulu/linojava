import { groupPeriods, lexSource, periodStatements } from "./lexer.js";
import { collectProjectDeclarations } from "./declarations.js";
import { projectConstants, resolveConstants } from "./expressions.js";
import { buildInitializedData, measureWorkspace } from "./memory-layout.js";
import { canonicalCodeName } from "./programme.js";

function normaliseSource(result, specifier) {
  if (typeof result === "string") return { id: String(specifier), source: result };
  if (!result || typeof result.source !== "string") {
    throw new TypeError(`Source resolver did not return Lino text for ${specifier}`);
  }
  return { id: String(result.id ?? specifier), source: result.source };
}

function normaliseStockfile(result, specifier) {
  if (result instanceof Uint8Array || result instanceof ArrayBuffer) {
    return { id: String(specifier), data: result instanceof Uint8Array ? result : new Uint8Array(result) };
  }
  if (!result || !(result.data instanceof Uint8Array || result.data instanceof ArrayBuffer)) {
    throw new TypeError(`Stockfile resolver did not return bytes for ${specifier}`);
  }
  return {
    id: String(result.id ?? specifier),
    data: result.data instanceof Uint8Array ? result.data : new Uint8Array(result.data),
  };
}

function cleanSpecifier(item) {
  const value = item.text.trim();
  if (!value) throw new SyntaxError(`${item.sourceId}:${item.line}: Empty project specifier`);
  return value;
}

function defaultIdentity(id) {
  const value = String(id).replaceAll("\\", "/").toLowerCase();
  const protocol = /^([a-z][a-z0-9+.-]*:\/\/)(.*)$/.exec(value);
  const prefix = protocol?.[1] ?? "";
  const path = protocol?.[2] ?? value;
  const leadingSlash = path.startsWith("/");
  const parts = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === ".." && parts.length && parts.at(-1) !== "..") parts.pop();
    else if (part !== ".." || !leadingSlash) parts.push(part);
  }
  return `${prefix}${leadingSlash ? "/" : ""}${parts.join("/")}`;
}

export async function loadProject(entry, resolvers = {}) {
  const resolveSource = resolvers.resolveSource;
  if (typeof resolveSource !== "function") {
    throw new TypeError("loadProject requires resolveSource(specifier, importer)");
  }

  const modulesById = new Map();
  const stockfilesById = new Map();
  const visiting = new Map();
  const modules = [];
  const moduleIdentity = resolvers.moduleIdentity ?? defaultIdentity;
  const stockfileIdentity = resolvers.stockfileIdentity ?? defaultIdentity;

  const visit = async (specifier, importer = null, importSite = null) => {
    let resolved;
    try {
      resolved = normaliseSource(await resolveSource(specifier, importer), specifier);
    } catch (error) {
      const location = importSite ? `${importSite.sourceId}:${importSite.line}: ` : "";
      throw new Error(`${location}Unable to resolve Lino library ${specifier}: ${error.message}`, { cause: error });
    }
    const identity = moduleIdentity(resolved.id);
    if (modulesById.has(identity)) return modulesById.get(identity);
    if (visiting.has(identity)) {
      const chain = [...visiting.values(), resolved.id].join(" -> ");
      const location = importSite ? `${importSite.sourceId}:${importSite.line}: ` : "";
      throw new Error(`${location}Circular Lino library dependency: ${chain}`);
    }

    visiting.set(identity, resolved.id);
    try {
      const items = lexSource(resolved.source, { sourceId: resolved.id });
      const periods = groupPeriods(items);
      const record = {
        id: resolved.id,
        source: resolved.source,
        items,
        periods,
        libraries: [],
        stockfiles: [],
      };

      for (const item of periodStatements(periods, "libraries")) {
        const dependency = await visit(cleanSpecifier(item), resolved.id, item);
        record.libraries.push(dependency.id);
      }

      const stockItems = periodStatements(periods, "stockfile");
      if (stockItems.length && typeof resolvers.resolveStockfile !== "function") {
        const first = stockItems[0];
        throw new TypeError(`${first.sourceId}:${first.line}: Project requires resolveStockfile(specifier, importer)`);
      }
      for (const item of stockItems) {
        const spec = cleanSpecifier(item);
        let stockfile;
        try {
          stockfile = normaliseStockfile(
            await resolvers.resolveStockfile(spec, resolved.id),
            spec,
          );
        } catch (error) {
          throw new Error(`${item.sourceId}:${item.line}: Unable to resolve stockfile ${spec}: ${error.message}`, { cause: error });
        }
        const stockIdentity = stockfileIdentity(stockfile.id);
        if (!stockfilesById.has(stockIdentity)) {
          stockfilesById.set(stockIdentity, { ...stockfile, symbols: [spec], offset: 0 });
        } else {
          const linked = stockfilesById.get(stockIdentity);
          if (!linked.symbols.some((symbol) => stockfileIdentity(symbol) === stockfileIdentity(spec))) {
            linked.symbols.push(spec);
          }
        }
        record.stockfiles.push(stockfilesById.get(stockIdentity).id);
      }

      modulesById.set(identity, record);
      modules.push(record);
      return record;
    } finally {
      visiting.delete(identity);
    }
  };

  const root = await visit(entry);
  let stockOffset = 0;
  for (const stockfile of stockfilesById.values()) {
    stockfile.offset = stockOffset;
    stockOffset += stockfile.data.byteLength;
  }
  return {
    entry: root.id,
    modules,
    stockfiles: [...stockfilesById.values()],
  };
}

export async function inspectProject(entry, resolvers) {
  const project = await loadProject(entry, resolvers);
  const declarations = collectProjectDeclarations(project);
  const constants = resolveConstants(declarations, projectConstants(project));
  const workspace = measureWorkspace(declarations, constants);
  const codeLabels = new Set(project.modules.flatMap((module) => module.periods
    .filter((period) => period.name === "programme")
    .flatMap((period) => period.items
      .filter((item) => item.type === "label")
      .map((item) => canonicalCodeName(item.text)))));
  const initialized = buildInitializedData(declarations, constants, {
    codeLabels,
    workspaceSymbols: workspace.symbols,
  });
  return {
    entry: project.entry,
    modules: project.modules.map((module) => ({
      id: module.id,
      libraries: [...module.libraries],
      stockfiles: [...module.stockfiles],
      periods: module.periods.map((period) => period.name),
      statements: module.items.filter((item) => item.type === "statement").length,
    })),
    stockfiles: project.stockfiles.map((stockfile) => ({
      id: stockfile.id,
      bytes: stockfile.data.byteLength,
      offset: stockfile.offset,
      symbols: [...stockfile.symbols],
    })),
    declarations: {
      total: declarations.length,
      named: declarations.filter((declaration) => declaration.type === "declaration" && declaration.name !== null).length,
      continuations: declarations.filter((declaration) => declaration.type === "continuation").length,
      extensions: declarations.filter((declaration) => declaration.type === "extend").length,
    },
    constants: constants.size,
    initializedData: {
      units: initialized.values.length,
      symbols: initialized.symbols.size,
      relocations: initialized.relocations.length,
      unresolved: initialized.unresolved.length,
      unresolvedByKind: Object.fromEntries(["code", "workspace", "data"].map((kind) => [
        kind,
        initialized.unresolved.filter((relocation) => relocation.kind === kind).length,
      ])),
    },
    workspace: { units: workspace.units, symbols: workspace.symbols.size },
  };
}
