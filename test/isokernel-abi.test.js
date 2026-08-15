import test from "node:test";
import assert from "node:assert/strict";
import {
  KERNEL_UNITS, OFFSETS, COMMAND_OFFSETS, READ, GET_DIR, RETRACE,
  createIsoKernelMemory, dispatchIsoKernel,
} from "../src/compiler/isokernel-abi.js";

test("published IsoKernel layout and bring-up dispatcher", () => {
  assert.equal(KERNEL_UNITS, 32947);
  assert.equal(OFFSETS.ClipString, 32946);
  assert.deepEqual(COMMAND_OFFSETS, { Display: 32771, PCMdata: 32781, Console: 32790, Pointer: 32890, File: 32899, SYStime: 32906, Timer: 32906, APD: 32917, Printer: 32924, Process: 32928, Net: 32930, Network: 32930, GlobalK: 32941, Clip: 32944 });
  const memory = createIsoKernelMemory({ BlockPointer: 100, BlockSize: 3, FilePosition: 1, FileCommand: READ });
  const result = dispatchIsoKernel(memory, { stockfile: Uint8Array.from([7, 8, 9]) });
  assert.equal(result.status, 0x646f6e65);
  assert.deepEqual(Array.from(new Uint8Array(memory.buffer).slice(400, 403)), [8, 9, 0]);
  assert.equal(memory[OFFSETS.FileCommand], 0);
  memory[OFFSETS.FileCommand] = GET_DIR;
  memory[OFFSETS.FileName] = 100;
  memory[OFFSETS.BlockSize] = 4;
  dispatchIsoKernel(memory, { directory: ["A", "B"] });
  assert.deepEqual(Array.from(memory.slice(100, 104)), [65, 0, 66, 0]);
  memory[OFFSETS.DisplayCommand] = RETRACE;
  assert.equal(dispatchIsoKernel(memory, { retrace: () => true }).yielded, true);
  assert.equal(memory[OFFSETS.DisplayCommand], 0);
});
