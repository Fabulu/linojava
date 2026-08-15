#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compile, inspect } from "../src/compiler.js";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("Usage: linojava <input.lino> <output.js>");
  process.exitCode = 2;
} else {
  try {
    const source = await readFile(resolve(input), "utf8");
    const moduleSource = compile(source);
    await writeFile(resolve(output), moduleSource, "utf8");
    const report = inspect(source);
    console.log(`Compiled ${input}: ${report.blocks} blocks, ${report.memoryUnits} units -> ${output}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
