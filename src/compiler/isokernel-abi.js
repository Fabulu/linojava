/**
 * The published Linoleum IsoKernel communication-area ABI.
 *
 * Values are units (32-bit cells), not byte offsets.  A-E are deliberately
 * not part of this memory object: the machine owns those registers outside
 * the communication area.
 */

export const KERNEL_UNITS = 32947;
export const ISO_KERNEL_UNITS = KERNEL_UNITS;
export const LAST_KERNEL_UNIT = KERNEL_UNITS - 1;

export const COMMANDS = Object.freeze({
  IDLE: 0,
  RETRACE: 1,
  SET_COOPERATIVE_MODE: 2,
  SET_EXCLUSIVE_MODE: 3,
  GET_CONSOLE_INPUT: 10,
  CLEAR_CONSOLE_BUFFER: 11,
  READ_POINTER: 12,
  TEST: 13,
  READ: 14,
  GET_DIR: 20,
  READ_TIME: 27,
  READ_UTC_TIME: 28,
  READ_COUNTS: 29,
  SLEEP: 35,
  K_READ: 49,
  K_WRITE: 50,
  K_DESTROY: 51,
});
export const IDLE = COMMANDS.IDLE;
export const RETRACE = COMMANDS.RETRACE;
export const SET_COOPERATIVE_MODE = COMMANDS.SET_COOPERATIVE_MODE;
export const SET_EXCLUSIVE_MODE = COMMANDS.SET_EXCLUSIVE_MODE;
export const GET_CONSOLE_INPUT = COMMANDS.GET_CONSOLE_INPUT;
export const CLEAR_CONSOLE_BUFFER = COMMANDS.CLEAR_CONSOLE_BUFFER;
export const TEST = COMMANDS.TEST;
export const READ = COMMANDS.READ;
export const GET_DIR = COMMANDS.GET_DIR;
export const READ_POINTER = COMMANDS.READ_POINTER;
export const READ_TIME = COMMANDS.READ_TIME;
export const READ_UTC_TIME = COMMANDS.READ_UTC_TIME;
export const READ_COUNTS = COMMANDS.READ_COUNTS;
export const SLEEP = COMMANDS.SLEEP;
export const K_READ = COMMANDS.K_READ;
export const K_WRITE = COMMANDS.K_WRITE;
export const K_DESTROY = COMMANDS.K_DESTROY;
export const DONE = 0x646f6e65;
export const FAIL = 0x6661696c;

// The names and offsets follow lino_kernel.h / the IsoKernel quick reference.
export const OFFSETS = Object.freeze({
  ProcessISOcall: 0, ProcessRAMtop: 1, ProcessPriority: 2, ProcessCommandLine: 3,
  DisplayCommand: 32771, DisplayStatus: 32772, DisplayOrigin: 32773,
  DisplayWidth: 32774, DisplayHeight: 32775, DisplayPhysicalWidth: 32776,
  DisplayPhysicalHeight: 32777, DisplayXPosition: 32778, DisplayYPosition: 32779,
  DisplayLiveRegion: 32780,
  PCMdataCommand: 32781, PCMdataStatus: 32782, PCMdataChannels: 32783,
  PCMdataBitsPerSample: 32784, PCMdataSamplesPerSec: 32785,
  PCMdataSilenceThreshold: 32786, PCMdataOrigin: 32787, PCMdataOffset: 32788,
  PCMdataSize: 32789,
  ConsoleCommand: 32790, ConsoleInput: 32791, ConsoleOrigin: 32792,
  PointerCommand: 32890, PointerMode: 32891, PointerStatus: 32892,
  PointerDeltaX: 32893, PointerDeltaY: 32894, PointerDeltaZ: 32895,
  PointerXCoordinate: 32896, PointerYCoordinate: 32897, PointerZCoordinate: 32898,
  FileCommand: 32899, FileStatus: 32900, BlockPointer: 32901, BlockSize: 32902,
  FileName: 32903, FileSize: 32904, FilePosition: 32905,
  SYStimeCommand: 32906, SYStimeYear: 32907, SYStimeMonth: 32908,
  SYStimeDay: 32909, SYStimeDayOfWeek: 32910, SYStimeHour: 32911,
  SYStimeMinute: 32912, SYStimeSecond: 32913, SYStimeMilliSeconds: 32914,
  SYStimeCounts: 32915, CountsPerMillisecond: 32916,
  APDCommand: 32917, APDLine: 32918, APDLines: 32919, APDStatus: 32920,
  APDXMeter: 32921, APDYMeter: 32922, APDZMeter: 32923,
  PrinterCommand: 32924, PageOrigin: 32925, PageWidth: 32926, PageHeight: 32927,
  ProcessCommand: 32928, SleepTimeout: 32929,
  NetCommand: 32930, NetStatus: 32931, Socket: 32932, HostName: 32933,
  HostAddress: 32934, Port: 32935, NetBlockPointer: 32936, NetBlockSize: 32937,
  MaxConnections: 32938, Connections: 32939, Clients: 32940,
  GlobalKCommand: 32941, GlobalKName: 32942, GlobalKData: 32943,
  ClipCommand: 32944, ClipSize: 32945, ClipString: 32946,
});

export const COMMAND_OFFSETS = Object.freeze({
  Display: OFFSETS.DisplayCommand, PCMdata: OFFSETS.PCMdataCommand,
  Console: OFFSETS.ConsoleCommand, Pointer: OFFSETS.PointerCommand,
  File: OFFSETS.FileCommand, SYStime: OFFSETS.SYStimeCommand,
  Timer: OFFSETS.SYStimeCommand, APD: OFFSETS.APDCommand,
  Printer: OFFSETS.PrinterCommand, Process: OFFSETS.ProcessCommand,
  Net: OFFSETS.NetCommand, Network: OFFSETS.NetCommand,
  GlobalK: OFFSETS.GlobalKCommand, Clip: OFFSETS.ClipCommand,
});
export const KERNEL_LAYOUT = OFFSETS;

export const ABI_CONSTANTS = Object.freeze({
  force888: 1, force565: 2, disablehpt: 4, disablepd: 8,
  network: 1, audioplayback: 2, printer: 4,
  idle: 0, retrace: 1, setcooperativemode: 2, setexclusivemode: 3,
  getdataoffset: 4, playonce: 5, playcontinuously: 6, pause: 7, unpause: 8, stop: 9,
  getconsoleinput: 10, clearconsolebuffer: 11, readpointer: 12, test: 13, read: 14,
  write: 15, setsize: 16, destroy: 17, run: 18, setdir: 19, getdir: 20,
  mkdir: 21, rmdir: 22, getfirstfile: 23, getnextfile: 24, getfirstdir: 25,
  getnextdir: 26, readtime: 27, readutctime: 28, readcounts: 29, queryapdlines: 30,
  readapdline: 31, printpage: 32, endprocess: 33, failprocess: 34, sleep: 35,
  gethostbyname: 36, gethostbyaddr: 37, getpeerbysocket: 38, cancelrequest: 39,
  netopen: 40, netclose: 41, netconnect: 42, netlisten: 43, netsend: 44,
  netrecv: 45, netisreadable: 46, netiswritable: 47, netisexcepted: 48,
  kread: 49, kwrite: 50, kdestroy: 51, getclipsize: 52, readclip: 53, writeclip: 54,
  cooperative: 0, exclusive: 1, active: 2, middle: 1048577,
  verylowpriority: 0, lowpriority: 1, normalpriority: 2, highpriority: 3, veryhighpriority: 4,
  wholedisplay: 0, voidregion: -1, pcmready: 1, pcmpaused: 2,
  bycoordinate: 0, bydelta: 1, pdpresent: 1, pdinsight: 2,
  pdleftbuttondown: 4, pdrightbuttondown: 8, pdmiddlebuttondown: 16,
  paused: 2, fileready: 1, fileerror: 2, error: 2, permittoread: 4, permittowrite: 8,
  stockfile: 0, stdin: -1, stdout: -2, stderr: -3,
  ready: 1, godeaf: 2, netsuccess: 4, netfailure: 8,
  releasenumber: 114, cpuunit: 32, bytesperunit: 4,
  no: 0, off: 0, null: 0, zero: 0, false: 0, inactive: 0,
  on: 1, yes: 1, true: 1, undefined: 0x3f3f3f3f,
  greatestunsignedinteger: -1, greatestsignedinteger: 0x7fffffff,
  smallestunsignedinteger: 0, smallestsignedinteger: -0x80000000,
  done: DONE, fail: FAIL,
});

const keyNames = [
  ..."abcdefghijklmnopqrstuvwxyz".split("").map((key) => `key${key}`),
  ..."0123456789".split("").map((key) => `key${key}`),
  ...Array.from({ length: 24 }, (_, index) => `keyf${index + 1}`),
  "keybackspace", "keytab", "keyreturn", "keyescape", "keyspacebar",
  "keyinsert", "keydelete", "keyhome", "keyend", "keypgup", "keypgdn",
  "keyup", "keydown", "keyleft", "keyright",
  ...Array.from({ length: 10 }, (_, index) => `key${index}n`),
  "keyslash", "keyasterisk", "keyhyphen", "keycross", "keydot",
  "keyshift", "keycontrol", "keyalternate", "keypause", "keynumlock",
  "keycapslock", "keyscrolllock", "keyunclassified",
];
export const KEY_OFFSETS = Object.freeze(Object.fromEntries(
  keyNames.map((name, index) => [name, 32792 + index]),
));
const workspaceEntries = [
  ["isokernel", 0], ["ramtop", 1], ["priority", 2], ["commandline", 3],
  ["displaycommand", 32771], ["displaystatus", 32772], ["displayorigin", 32773],
  ["displaywidth", 32774], ["displayheight", 32775], ["displayphysicalwidth", 32776],
  ["displayphysicalheight", 32777], ["displayxposition", 32778], ["displayyposition", 32779],
  ["displayliveregion", 32780], ["pcmdatacommand", 32781], ["pcmdatastatus", 32782],
  ["pcmdatachannels", 32783], ["pcmdatabitspersample", 32784], ["pcmdatasamplespersec", 32785],
  ["pcmdatasilencethreshold", 32786], ["pcmdataorigin", 32787], ["pcmdataoffset", 32788],
  ["pcmdatasize", 32789], ["consolecommand", 32790], ["consoleinput", 32791],
  ...keyNames.map((name, index) => [name, 32792 + index]),
  ["pointercommand", 32890], ["pointermode", 32891], ["pointerstatus", 32892],
  ["pointerdeltax", 32893], ["pointerdeltay", 32894], ["pointerdeltaz", 32895],
  ["pointerxcoordinate", 32896], ["pointerycoordinate", 32897], ["pointerzcoordinate", 32898],
  ["filecommand", 32899], ["filestatus", 32900], ["blockpointer", 32901],
  ["blocksize", 32902], ["filename", 32903], ["filesize", 32904], ["fileposition", 32905],
  ["timercommand", 32906], ["year", 32907], ["month", 32908], ["day", 32909],
  ["dayofweek", 32910], ["hour", 32911], ["minute", 32912], ["second", 32913],
  ["milliseconds", 32914], ["counts", 32915], ["countspermillisecond", 32916],
  ["apdcommand", 32917], ["apdline", 32918], ["apdlines", 32919], ["apdstatus", 32920],
  ["apdxmeter", 32921], ["apdymeter", 32922], ["apdzmeter", 32923],
  ["printercommand", 32924], ["pageorigin", 32925], ["pagewidth", 32926], ["pageheight", 32927],
  ["processcommand", 32928], ["sleeptimeout", 32929], ["netcommand", 32930],
  ["netstatus", 32931], ["socket", 32932], ["hostname", 32933], ["hostaddress", 32934],
  ["port", 32935], ["netblockpointer", 32936], ["netblocksize", 32937],
  ["maxconnections", 32938], ["connections", 32939], ["clients", 32940],
  ["globalkcommand", 32941], ["globalkname", 32942], ["globalkdata", 32943],
  ["clipcommand", 32944], ["clipsize", 32945], ["clipstring", 32946], ["appdata", 32947],
];
export const ABI_WORKSPACE = Object.freeze(Object.fromEntries(workspaceEntries));

const COMMAND_SLOTS = Object.freeze(Object.values(COMMAND_OFFSETS).filter((v, i, a) => a.indexOf(v) === i));

export function createIsoKernelMemory(initial = {}) {
  const memory = new Int32Array(KERNEL_UNITS);
  memory[OFFSETS.ProcessRAMtop] = KERNEL_UNITS;
  memory[OFFSETS.FileName] = 0;
  memory[OFFSETS.CountsPerMillisecond] = 1000;
  for (const [name, value] of Object.entries(initial)) {
    const offset = OFFSETS[name] ?? (typeof name === "number" ? name : undefined);
    if (offset !== undefined) memory[offset] = value | 0;
  }
  return memory;
}

function bytesFrom(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value ?? []);
}

function linoString(memory, address, limit = 1024) {
  if (address <= 0 || address >= memory.length) return "";
  let value = "";
  for (let index = 0; index < limit && address + index < memory.length; index += 1) {
    const unit = memory[address + index] | 0;
    if (unit === 0) break;
    value += String.fromCharCode(unit & 0xffff);
  }
  return value;
}

function canonicalFileName(value) {
  return String(value).replaceAll("\\", "/").toLowerCase();
}

function namedFile(host, name) {
  const direct = host.readFile?.(name);
  if (direct?.then) throw new TypeError("IsoKernel host.readFile must be synchronous");
  if (direct !== undefined && direct !== null) return bytesFrom(direct);
  const files = host.files ?? host.virtualFiles;
  if (!files) return null;
  const wanted = canonicalFileName(name);
  if (files instanceof Map) {
    if (files.has(name)) return bytesFrom(files.get(name));
    if (files.has(wanted)) return bytesFrom(files.get(wanted));
    for (const [key, value] of files) {
      if (canonicalFileName(key) === wanted) return bytesFrom(value);
    }
    return null;
  }
  if (Object.hasOwn(files, name)) return bytesFrom(files[name]);
  if (Object.hasOwn(files, wanted)) return bytesFrom(files[wanted]);
  const key = Object.keys(files).find((candidate) => canonicalFileName(candidate) === wanted);
  return key === undefined ? null : bytesFrom(files[key]);
}

const defaultGlobalKStores = new WeakMap();

function globalKStore(host) {
  if (host.globalK instanceof Map) return host.globalK;
  let store = defaultGlobalKStores.get(host);
  if (!store) {
    store = new Map();
    defaultGlobalKStores.set(host, store);
  }
  return store;
}

function globalKName(memory, address) {
  if (address < 0 || address >= memory.length) throw new RangeError("Global K name outside memory");
  let name = "";
  for (let index = 0; index < 24 && address + index < memory.length; index += 1) {
    const value = memory[address + index] | 0;
    if (value === 0) break;
    const character = String.fromCharCode(value & 0xffff);
    name += /[A-Za-z0-9]/.test(character) ? character : "_";
  }
  return name;
}

/** Dispatch the documented bring-up calls. The register file is never touched. */
export function dispatchIsoKernel(memory, host = {}, options = {}) {
  const kernelBase = options.kernelBase ?? 0;
  if (!(memory instanceof Int32Array) || memory.length < kernelBase + KERNEL_UNITS) throw new TypeError("memory must contain the IsoKernel communication area");
  const at = (offset) => kernelBase + offset;
  let success = true;
  let yielded = false;
  let sleepMilliseconds = 0;
  const fileCommand = memory[at(OFFSETS.FileCommand)];
  const displayCommand = memory[at(OFFSETS.DisplayCommand)];
  const consoleCommand = memory[at(OFFSETS.ConsoleCommand)];
  const pointerCommand = memory[at(OFFSETS.PointerCommand)];
  const timerCommand = memory[at(OFFSETS.SYStimeCommand)];
  const processCommand = memory[at(OFFSETS.ProcessCommand)];
  const globalKCommand = memory[at(OFFSETS.GlobalKCommand)];
  try {
    const displaySync = host.syncDisplay?.({
      origin: memory[at(OFFSETS.DisplayOrigin)] | 0,
      width: memory[at(OFFSETS.DisplayWidth)] | 0,
      height: memory[at(OFFSETS.DisplayHeight)] | 0,
      physicalWidth: memory[at(OFFSETS.DisplayPhysicalWidth)] | 0,
      physicalHeight: memory[at(OFFSETS.DisplayPhysicalHeight)] | 0,
      x: memory[at(OFFSETS.DisplayXPosition)] | 0,
      y: memory[at(OFFSETS.DisplayYPosition)] | 0,
      status: memory[at(OFFSETS.DisplayStatus)] | 0,
    });
    if (displaySync === false || displaySync?.success === false) success = false;
    const keys = typeof host.keys === "function" ? host.keys() : host.keys;
    if (keys) {
      for (const [name, offset] of Object.entries(KEY_OFFSETS)) {
        memory[at(offset)] = keys[name] ? 1 : 0;
      }
    }
    if (displayCommand === RETRACE) {
      const result = host.retrace?.(
        memory[at(OFFSETS.DisplayOrigin)], memory[at(OFFSETS.DisplayWidth)],
        memory[at(OFFSETS.DisplayHeight)], memory,
        { liveRegion: memory[at(OFFSETS.DisplayLiveRegion)] },
      );
      yielded ||= result === true || result?.yield === true;
    } else if (displayCommand === SET_COOPERATIVE_MODE || displayCommand === SET_EXCLUSIVE_MODE) {
      const exclusive = displayCommand === SET_EXCLUSIVE_MODE;
      const request = {
        exclusive,
        width: memory[at(OFFSETS.DisplayWidth)] | 0,
        height: memory[at(OFFSETS.DisplayHeight)] | 0,
        x: memory[at(OFFSETS.DisplayXPosition)] | 0,
        y: memory[at(OFFSETS.DisplayYPosition)] | 0,
      };
      const result = host.setDisplayMode?.(exclusive ? "exclusive" : "cooperative", request);
      const accepted = result === true || result?.success === true
        || (!exclusive && result !== false && result?.success !== false);
      if (accepted) {
        if (exclusive) memory[at(OFFSETS.DisplayStatus)] |= ABI_CONSTANTS.exclusive;
        else memory[at(OFFSETS.DisplayStatus)] &= ~ABI_CONSTANTS.exclusive;
      } else {
        // Browsers cannot enter fullscreen without a live user gesture. Do
        // not claim success and leave iGUI in an imaginary OS display mode.
        memory[at(OFFSETS.DisplayStatus)] &= ~ABI_CONSTANTS.exclusive;
        success = false;
      }
    }
    if (consoleCommand === GET_CONSOLE_INPUT) {
      let input;
      if (typeof host.readConsoleInput === "function") input = host.readConsoleInput();
      else if (Array.isArray(host.consoleInput)) input = host.consoleInput.shift();
      else input = host.consoleInput;
      if (input === undefined || input === null) success = false;
      else memory[at(OFFSETS.ConsoleInput)] = Number(input) | 0;
    } else if (consoleCommand === CLEAR_CONSOLE_BUFFER) {
      host.clearConsoleInput?.();
      if (Array.isArray(host.consoleInput)) host.consoleInput.length = 0;
      memory[at(OFFSETS.ConsoleInput)] = 0;
    }
    if (fileCommand === TEST) {
      const fileName = linoString(memory, memory[at(OFFSETS.FileName)] | 0);
      const source = namedFile(host, fileName);
      memory[at(OFFSETS.FileSize)] = source?.length ?? 0;
      memory[at(OFFSETS.FileStatus)] = source === null
        ? ABI_CONSTANTS.fileerror : ABI_CONSTANTS.fileready;
    } else if (fileCommand === READ) {
      const fileNameAddress = memory[at(OFFSETS.FileName)] | 0;
      const fileName = linoString(memory, fileNameAddress);
      const source = fileNameAddress === 0
        ? bytesFrom(host.stockfile ?? host.stockFile ?? [])
        : namedFile(host, fileName);
      const position = Math.max(0, memory[at(OFFSETS.FilePosition)] | 0);
      const count = Math.max(0, memory[at(OFFSETS.BlockSize)] | 0);
      const target = memory[at(OFFSETS.BlockPointer)] | 0;
      const targetByte = target * 4;
      const allBytes = new Uint8Array(memory.buffer, memory.byteOffset, memory.byteLength);
      if (target < 0 || targetByte + count > allBytes.length) throw new RangeError("file read outside memory");
      if (source === null || position > source.length) {
        memory[at(OFFSETS.BlockSize)] = 0;
        memory[at(OFFSETS.FileSize)] = source?.length ?? 0;
        memory[at(OFFSETS.FileStatus)] = 2;
        success = false;
      } else {
        const copied = Math.min(count, source.length - position);
        allBytes.set(source.subarray(position, position + copied), targetByte);
        if (copied < count) allBytes.fill(0, targetByte + copied, targetByte + count);
        memory[at(OFFSETS.BlockSize)] = copied;
        memory[at(OFFSETS.FileSize)] = source.length;
        memory[at(OFFSETS.FileStatus)] = 1 | 4;
      }
    } else if (fileCommand === GET_DIR) {
      const entries = host.directory ?? host.getDirectory?.() ?? [];
      const text = Array.isArray(entries) ? entries.join("\0") : String(entries);
      // Passive directory operations return their name in FileName (the
      // documented 256-unit string buffer), not in BlockPointer.
      const target = memory[at(OFFSETS.FileName)] | 0;
      const count = Math.min(text.length + 1, 256);
      if (target < 0 || target + count > memory.length) throw new RangeError("directory result outside memory");
      for (let i = 0; i < count; i += 1) memory[target + i] = text.charCodeAt(i) || 0;
      memory[at(OFFSETS.FileSize)] = text.length;
      memory[at(OFFSETS.FileStatus)] = 1;
    }
    if (pointerCommand === READ_POINTER) {
      const pointer = typeof host.pointer === "function"
        ? host.pointer({ mode: memory[at(OFFSETS.PointerMode)] | 0 })
        : (host.pointer ?? {});
      memory[at(OFFSETS.PointerStatus)] = pointer.status | 0;
      memory[at(OFFSETS.PointerDeltaX)] = pointer.deltaX | 0;
      memory[at(OFFSETS.PointerDeltaY)] = pointer.deltaY | 0;
      memory[at(OFFSETS.PointerDeltaZ)] = pointer.deltaZ | 0;
      memory[at(OFFSETS.PointerXCoordinate)] = pointer.x | 0;
      memory[at(OFFSETS.PointerYCoordinate)] = pointer.y | 0;
      memory[at(OFFSETS.PointerZCoordinate)] = pointer.z | 0;
    }
    if (timerCommand === READ_COUNTS) {
      const countsPerMillisecond = Math.max(1, host.countsPerMillisecond | 0 || 1000);
      const milliseconds = Number(host.monotonicMilliseconds?.() ?? globalThis.performance?.now?.() ?? Date.now());
      memory[at(OFFSETS.CountsPerMillisecond)] = countsPerMillisecond;
      memory[at(OFFSETS.SYStimeCounts)] = Math.trunc(milliseconds * countsPerMillisecond) | 0;
    } else if (timerCommand === READ_TIME || timerCommand === READ_UTC_TIME) {
      const supplied = host.date?.(timerCommand === READ_UTC_TIME);
      const date = supplied instanceof Date ? supplied : new Date(supplied ?? Date.now());
      const utc = timerCommand === READ_UTC_TIME;
      memory[at(OFFSETS.SYStimeYear)] = utc ? date.getUTCFullYear() : date.getFullYear();
      memory[at(OFFSETS.SYStimeMonth)] = utc ? date.getUTCMonth() + 1 : date.getMonth() + 1;
      memory[at(OFFSETS.SYStimeDay)] = utc ? date.getUTCDate() : date.getDate();
      memory[at(OFFSETS.SYStimeDayOfWeek)] = utc ? date.getUTCDay() : date.getDay();
      memory[at(OFFSETS.SYStimeHour)] = utc ? date.getUTCHours() : date.getHours();
      memory[at(OFFSETS.SYStimeMinute)] = utc ? date.getUTCMinutes() : date.getMinutes();
      memory[at(OFFSETS.SYStimeSecond)] = utc ? date.getUTCSeconds() : date.getSeconds();
      memory[at(OFFSETS.SYStimeMilliSeconds)] = utc ? date.getUTCMilliseconds() : date.getMilliseconds();
    }
    if (processCommand === SLEEP) {
      const timeout = Math.max(0, memory[at(OFFSETS.SleepTimeout)] | 0);
      const result = host.sleep?.(timeout);
      sleepMilliseconds = Math.max(0, Number(result?.delay ?? result?.sleepMilliseconds ?? timeout) || 0);
      yielded ||= result === undefined || result === true || result?.yield === true;
    }
    if (globalKCommand === K_READ || globalKCommand === K_WRITE || globalKCommand === K_DESTROY) {
      const name = globalKName(memory, memory[at(OFFSETS.GlobalKName)] | 0);
      const data = memory[at(OFFSETS.GlobalKData)] | 0;
      if (data < 0 || data + 255 > memory.length) throw new RangeError("Global K data outside memory");
      const store = globalKStore(host);
      if (globalKCommand === K_READ) {
        const saved = store.get(name);
        if (!(saved instanceof Int32Array) || saved.length !== 255) success = false;
        else memory.set(saved, data);
      } else if (globalKCommand === K_WRITE) {
        store.set(name, memory.slice(data, data + 255));
      } else if (!store.delete(name)) {
        success = false;
      }
    }
  } catch { success = false; memory[at(OFFSETS.FileStatus)] = 2; }
  for (const offset of COMMAND_SLOTS) memory[at(offset)] = IDLE;
  return { success, failed: !success, yielded, sleepMilliseconds, status: success ? DONE : FAIL };
}

export const createKernelMemory = createIsoKernelMemory;
export const dispatchKernel = dispatchIsoKernel;
