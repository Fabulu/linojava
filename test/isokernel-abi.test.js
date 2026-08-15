import test from "node:test";
import assert from "node:assert/strict";
import {
  KERNEL_UNITS, OFFSETS, COMMAND_OFFSETS, READ, GET_DIR, RETRACE,
  SET_COOPERATIVE_MODE, SET_EXCLUSIVE_MODE,
  GET_DATA_OFFSET, PLAY_CONTINUOUSLY, PAUSE, STOP,
  GET_CONSOLE_INPUT, CLEAR_CONSOLE_BUFFER, KEY_OFFSETS,
  READ_POINTER, READ_TIME, READ_UTC_TIME, READ_COUNTS, SLEEP,
  WRITE, SET_SIZE, DESTROY, MKDIR, K_READ, K_WRITE, K_DESTROY,
  createIsoKernelMemory, dispatchIsoKernel,
} from "../src/compiler/isokernel-abi.js";

test("published IsoKernel layout and bring-up dispatcher", () => {
  assert.equal(KERNEL_UNITS, 32947);
  assert.equal(OFFSETS.ClipString, 32946);
  assert.deepEqual(COMMAND_OFFSETS, { Display: 32771, PCMdata: 32781, Console: 32790, Pointer: 32890, File: 32899, SYStime: 32906, Timer: 32906, APD: 32917, Printer: 32924, Process: 32928, Net: 32930, Network: 32930, GlobalK: 32941, Clip: 32944 });
  const memory = createIsoKernelMemory({ BlockPointer: 100, BlockSize: 3, FilePosition: 1, FileCommand: READ });
  assert.equal(memory[OFFSETS.CountsPerMillisecond], 1000);
  let syncedDisplay;
  const result = dispatchIsoKernel(memory, {
    stockfile: Uint8Array.from([7, 8, 9]),
    syncDisplay: (display) => { syncedDisplay = display; },
  });
  assert.equal(result.status, 0x646f6e65);
  assert.deepEqual(Array.from(new Uint8Array(memory.buffer).slice(400, 403)), [8, 9, 0]);
  assert.equal(memory[OFFSETS.FileCommand], 0);
  assert.equal(syncedDisplay.width, 0);
  "DIGIMAP2.BIN\0".split("").forEach((character, index) => { memory[110 + index] = character.charCodeAt(0); });
  memory[OFFSETS.FileName] = 110;
  memory[OFFSETS.FilePosition] = 1;
  memory[OFFSETS.BlockPointer] = 130;
  memory[OFFSETS.BlockSize] = 3;
  memory[OFFSETS.FileCommand] = READ;
  dispatchIsoKernel(memory, { files: new Map([["digimap2.bin", Uint8Array.from([1, 2, 3, 4])]]) });
  assert.deepEqual(Array.from(new Uint8Array(memory.buffer).slice(520, 523)), [2, 3, 4]);
  assert.equal(memory[OFFSETS.BlockSize], 3);
  assert.equal(memory[OFFSETS.FileSize], 4);
  assert.equal(memory[OFFSETS.FileStatus], 5);
  const files = new Map();
  "SAVE.LIN\0".split("").forEach((character, index) => { memory[150 + index] = character.charCodeAt(0); });
  new Uint8Array(memory.buffer).set([10, 20, 30], 200 * 4);
  memory[OFFSETS.FileName] = 150;
  memory[OFFSETS.FilePosition] = 2;
  memory[OFFSETS.BlockPointer] = 200;
  memory[OFFSETS.BlockSize] = 3;
  memory[OFFSETS.FileCommand] = WRITE;
  dispatchIsoKernel(memory, { files });
  assert.deepEqual(Array.from(files.get("save.lin")), [0, 0, 10, 20, 30]);
  memory[OFFSETS.FileSize] = 4;
  memory[OFFSETS.FileCommand] = SET_SIZE;
  dispatchIsoKernel(memory, { files });
  assert.deepEqual(Array.from(files.get("save.lin")), [0, 0, 10, 20]);
  memory[OFFSETS.FileCommand] = DESTROY;
  assert.equal(dispatchIsoKernel(memory, { files }).success, true);
  assert.equal(files.has("save.lin"), false);
  memory[OFFSETS.FileCommand] = MKDIR;
  assert.equal(dispatchIsoKernel(memory, { files }).success, true);
  memory[OFFSETS.FileCommand] = GET_DIR;
  memory[OFFSETS.FileName] = 100;
  memory[OFFSETS.BlockSize] = 4;
  dispatchIsoKernel(memory, { directory: ["A", "B"] });
  assert.deepEqual(Array.from(memory.slice(100, 104)), [65, 0, 66, 0]);
  memory[OFFSETS.DisplayCommand] = RETRACE;
  assert.equal(dispatchIsoKernel(memory, { retrace: () => true }).yielded, true);
  assert.equal(memory[OFFSETS.DisplayCommand], 0);
  memory[OFFSETS.DisplayStatus] = 2;
  memory[OFFSETS.DisplayCommand] = SET_EXCLUSIVE_MODE;
  assert.equal(dispatchIsoKernel(memory).failed, true);
  assert.equal(memory[OFFSETS.DisplayStatus], 2);

  memory[OFFSETS.PCMdataChannels] = 2;
  memory[OFFSETS.PCMdataBitsPerSample] = 16;
  memory[OFFSETS.PCMdataSamplesPerSec] = 44100;
  memory[OFFSETS.PCMdataOrigin] = 200;
  memory[OFFSETS.PCMdataSize] = 20;
  memory[OFFSETS.PCMdataCommand] = PLAY_CONTINUOUSLY;
  let pcmRequest;
  assert.equal(dispatchIsoKernel(memory, { pcm: (request) => {
    pcmRequest = request;
    return { success: true, status: 1, offset: 3 };
  } }).success, true);
  assert.deepEqual(
    [pcmRequest.channels, pcmRequest.bitsPerSample, pcmRequest.samplesPerSecond, pcmRequest.origin, pcmRequest.size],
    [2, 16, 44100, 200, 20],
  );
  assert.equal(memory[OFFSETS.PCMdataOffset], 3);
  memory[OFFSETS.PCMdataCommand] = GET_DATA_OFFSET;
  dispatchIsoKernel(memory, { pcm: () => ({ success: true, status: 1, offset: 11 }) });
  assert.equal(memory[OFFSETS.PCMdataOffset], 11);
  memory[OFFSETS.PCMdataCommand] = PAUSE;
  dispatchIsoKernel(memory, { pcm: () => true });
  assert.equal(memory[OFFSETS.PCMdataStatus], 2);
  memory[OFFSETS.PCMdataCommand] = STOP;
  dispatchIsoKernel(memory, { pcm: () => true });
  assert.equal(memory[OFFSETS.PCMdataStatus], 1);
  memory[OFFSETS.DisplayCommand] = SET_EXCLUSIVE_MODE;
  assert.equal(dispatchIsoKernel(memory, { setDisplayMode: () => true }).success, true);
  assert.equal(memory[OFFSETS.DisplayStatus], 3);
  memory[OFFSETS.DisplayCommand] = SET_COOPERATIVE_MODE;
  assert.equal(dispatchIsoKernel(memory).success, true);
  assert.equal(memory[OFFSETS.DisplayStatus], 2);

  const consoleInput = [65, 66];
  memory[OFFSETS.ConsoleCommand] = GET_CONSOLE_INPUT;
  assert.equal(dispatchIsoKernel(memory, { consoleInput }).success, true);
  assert.equal(memory[OFFSETS.ConsoleInput], 65);
  memory[OFFSETS.ConsoleCommand] = CLEAR_CONSOLE_BUFFER;
  dispatchIsoKernel(memory, { consoleInput });
  assert.deepEqual(consoleInput, []);
  memory[OFFSETS.ConsoleCommand] = GET_CONSOLE_INPUT;
  assert.equal(dispatchIsoKernel(memory, { consoleInput }).status, 0x6661696c);

  dispatchIsoKernel(memory, { keys: { keyw: true, keyleft: true } });
  assert.equal(memory[KEY_OFFSETS.keyw], 1);
  assert.equal(memory[KEY_OFFSETS.keyleft], 1);
  dispatchIsoKernel(memory, { keys: {} });
  assert.equal(memory[KEY_OFFSETS.keyw], 0);

  memory[OFFSETS.PointerCommand] = READ_POINTER;
  memory[OFFSETS.PointerMode] = 1;
  let pointerMode = -1;
  dispatchIsoKernel(memory, { pointer: ({ mode }) => { pointerMode = mode; return { status: 5, x: 12, y: 34, deltaX: -2 }; } });
  assert.deepEqual(
    [memory[OFFSETS.PointerStatus], memory[OFFSETS.PointerXCoordinate], memory[OFFSETS.PointerYCoordinate], memory[OFFSETS.PointerDeltaX]],
    [5, 12, 34, -2],
  );
  assert.equal(pointerMode, 1);

  memory[OFFSETS.SYStimeCommand] = READ_COUNTS;
  dispatchIsoKernel(memory, { monotonicMilliseconds: () => 12.5, countsPerMillisecond: 1000 });
  assert.equal(memory[OFFSETS.SYStimeCounts], 12500);
  assert.equal(memory[OFFSETS.CountsPerMillisecond], 1000);
  const fixed = new Date("2026-08-15T12:34:56.789Z");
  memory[OFFSETS.SYStimeCommand] = READ_UTC_TIME;
  dispatchIsoKernel(memory, { date: () => fixed });
  assert.deepEqual(
    [memory[OFFSETS.SYStimeYear], memory[OFFSETS.SYStimeMonth], memory[OFFSETS.SYStimeDay], memory[OFFSETS.SYStimeHour], memory[OFFSETS.SYStimeMinute], memory[OFFSETS.SYStimeSecond], memory[OFFSETS.SYStimeMilliSeconds]],
    [2026, 8, 15, 12, 34, 56, 789],
  );
  memory[OFFSETS.SYStimeCommand] = READ_TIME;
  dispatchIsoKernel(memory, { date: () => fixed });
  assert.equal(memory[OFFSETS.SYStimeYear], fixed.getFullYear());
  memory[OFFSETS.ProcessCommand] = SLEEP;
  memory[OFFSETS.SleepTimeout] = 7;
  let slept = -1;
  const sleepResult = dispatchIsoKernel(memory, { sleep: (timeout) => { slept = timeout; } });
  assert.equal(sleepResult.yielded, true);
  assert.equal(sleepResult.sleepMilliseconds, 7);
  assert.equal(slept, 7);

  const globalK = new Map();
  memory[90] = "w".charCodeAt(0);
  memory[91] = "i".charCodeAt(0);
  memory[92] = "n".charCodeAt(0);
  memory[93] = 0;
  memory[OFFSETS.GlobalKName] = 90;
  memory[OFFSETS.GlobalKData] = 120;
  memory[120] = 42;
  memory[OFFSETS.GlobalKCommand] = K_WRITE;
  assert.equal(dispatchIsoKernel(memory, { globalK }).success, true);
  memory[120] = 0;
  memory[OFFSETS.GlobalKCommand] = K_READ;
  assert.equal(dispatchIsoKernel(memory, { globalK }).success, true);
  assert.equal(memory[120], 42);
  memory[OFFSETS.GlobalKCommand] = K_DESTROY;
  assert.equal(dispatchIsoKernel(memory, { globalK }).success, true);
  memory[OFFSETS.GlobalKCommand] = K_READ;
  assert.equal(dispatchIsoKernel(memory, { globalK }).failed, true);
});
