import { collectProjectDeclarations } from "./declarations.js";
import {
  DEFAULT_CONSTANTS,
  evaluateExpression,
  projectConstants,
  resolveConstants,
} from "./expressions.js";
import { ABI_CONSTANTS, ABI_WORKSPACE, KERNEL_UNITS, OFFSETS } from "./isokernel-abi.js";
import { canonicalName } from "./lexer.js";
import { buildInitializedData, measureWorkspace } from "./memory-layout.js";
import { canonicalCodeName, collectProgramme } from "./programme.js";

function addSymbol(symbols, name, kind, value, details = {}) {
  const canonical = canonicalName(name);
  const key = kind === "code" ? `service:${canonical}` : canonical;
  const previous = symbols.get(key);
  if (previous) {
    throw new SyntaxError(`Conflicting Lino symbol ${name}`);
  }
  symbols.set(key, { kind, value: value | 0, name, ...details });
}

function resolveDirectors(declarations, constants) {
  const values = new Map();
  const resolve = (name) => constants.typedValues?.get(name) ?? constants.get(name);
  for (const declaration of declarations) {
    if (declaration.period !== "directors" || declaration.type !== "declaration") continue;
    if (declaration.value.trim().startsWith("{")) {
      values.set(declaration.canonicalName, declaration.value.trim());
    } else {
      values.set(declaration.canonicalName, evaluateExpression(declaration.value, resolve));
    }
  }
  return values;
}

function stockfileBytes(project) {
  const bytes = new Uint8Array(project.stockfiles.reduce((total, file) => total + file.data.byteLength, 0));
  for (const file of project.stockfiles) bytes.set(file.data, file.offset);
  return bytes;
}

export function linkProject(project, options = {}) {
  const declarations = collectProjectDeclarations(project);
  const predefined = { ...DEFAULT_CONSTANTS, ...ABI_CONSTANTS, ...(options.constants ?? {}) };
  const constants = resolveConstants(declarations, projectConstants(project, predefined));
  const programme = collectProgramme(project);
  const nativeFragments = programme.instructions
    .filter((instruction) => instruction.op === "intrinsic")
    .map((instruction) => ({
      id: instruction.intrinsicId,
      sourceId: instruction.sourceId,
      line: instruction.line,
      body: instruction.body,
    }));
  const relativeWorkspace = measureWorkspace(declarations, constants);
  const initialized = buildInitializedData(declarations, constants, {
    codeLabels: new Set(programme.labels.keys()),
    workspaceSymbols: relativeWorkspace.symbols,
  });

  const dataBase = 1;
  const kernelBase = dataBase + initialized.values.length;
  const appData = kernelBase + KERNEL_UNITS;
  const ramTop = appData + relativeWorkspace.units;
  const symbols = new Map();

  addSymbol(symbols, "CodeOrigin", "data", 0);
  addSymbol(symbols, "ProcessOrigin", "kernel", kernelBase + OFFSETS.ProcessISOcall);
  for (const [name, value] of constants) addSymbol(symbols, name, "constant", value);
  for (const [name, offset] of initialized.symbols) addSymbol(symbols, name, "data", dataBase + offset);
  for (const [name, offset] of Object.entries(ABI_WORKSPACE)) addSymbol(symbols, name, "kernel", kernelBase + offset);
  for (const [name, offset] of relativeWorkspace.symbols) addSymbol(symbols, name, "workspace", appData + offset);
  for (const [name, instruction] of programme.labels) addSymbol(symbols, name, "code", instruction + 1);

  const memory = new Int32Array(ramTop);
  memory[0] = 1;
  memory.set(initialized.values, dataBase);
  memory[kernelBase + OFFSETS.ProcessRAMtop] = ramTop;
  memory[kernelBase + OFFSETS.ProcessPriority] = constants.get("normalpriority") ?? 2;
  memory[kernelBase + OFFSETS.DisplayStatus] = constants.get("active") ?? 2;
  memory[kernelBase + OFFSETS.CountsPerMillisecond] = options.countsPerMillisecond ?? 1000;

  const directors = resolveDirectors(declarations, constants);
  const width = directors.get("displaywidth") ?? options.displayWidth ?? 0;
  const height = directors.get("displayheight") ?? options.displayHeight ?? 0;
  memory[kernelBase + OFFSETS.DisplayWidth] = width;
  memory[kernelBase + OFFSETS.DisplayHeight] = height;
  memory[kernelBase + OFFSETS.DisplayPhysicalWidth] = options.physicalWidth ?? width;
  memory[kernelBase + OFFSETS.DisplayPhysicalHeight] = options.physicalHeight ?? height;

  const unresolved = [];
  for (const relocation of initialized.relocations) {
    try {
      const value = evaluateExpression(relocation.expression, (name, details = {}) => {
        const wantsCode = relocation.kind === "code" || details.qualifier === "service";
        const canonical = wantsCode ? canonicalCodeName(name) : canonicalName(name);
        return symbols.get(wantsCode ? `service:${canonical}` : canonical)?.value;
      });
      for (let repeat = 0; repeat < relocation.count; repeat += 1) {
        memory[dataBase + relocation.index + repeat] = value;
      }
    } catch (error) {
      if (!(error instanceof ReferenceError)) throw error;
      unresolved.push({ ...relocation, message: error.message });
    }
  }
  if (unresolved.length && !options.allowUnresolved) {
    const examples = unresolved.slice(0, 8).map((item) => `${item.sourceId}:${item.line} ${item.expression}`).join("; ");
    throw new Error(`Unresolved Lino relocations (${unresolved.length}): ${examples}`);
  }

  return {
    project,
    declarations,
    constants,
    directors,
    instructions: programme.instructions,
    labels: programme.labels,
    aliases: programme.aliases,
    entry: programme.entry,
    symbols,
    initialMemory: memory,
    memoryLayout: {
      codeOrigin: 0,
      dataBase,
      initializedUnits: initialized.values.length,
      kernelBase,
      kernelUnits: KERNEL_UNITS,
      appData,
      workspaceUnits: relativeWorkspace.units,
      ramTop,
      displayWidth: width,
      displayHeight: height,
    },
    stockfile: stockfileBytes(project),
    relocations: initialized.relocations,
    unresolved,
    diagnostics: [],
    nativeFragments,
  };
}
