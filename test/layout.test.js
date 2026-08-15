import assert from "node:assert/strict";
import test from "node:test";
import { parseDeclaration } from "../src/compiler/declarations.js";
import {
  evaluateExpression,
  projectConstants,
  resolveConstants,
} from "../src/compiler/expressions.js";
import {
  buildInitializedData,
  encodeLinoString,
  measureWorkspace,
} from "../src/compiler/memory-layout.js";

function declaration(period, text, line = 1) {
  return parseDeclaration(
    { type: "statement", text, sourceId: "layout-fixture.lino", line },
    period,
  );
}

function floatBits(value) {
  const buffer = new ArrayBuffer(4);
  new Float32Array(buffer)[0] = value;
  return new Int32Array(buffer)[0];
}

test("parses named declarations, continuations, no-label data, and extend upto", () => {
  const vector = declaration("variables", "vector velocity = 1");
  assert.equal(vector.type, "declaration");
  assert.equal(vector.qualifier, "vector");
  assert.equal(vector.canonicalName, "velocity");
  assert.equal(vector.value, "1");

  const continuation = declaration("variables", "2", 2);
  assert.deepEqual(
    { type: continuation.type, value: continuation.value, line: continuation.line },
    { type: "continuation", value: "2", line: 2 },
  );

  const noLabel = declaration("variables", "no label = 3");
  assert.equal(noLabel.name, null);
  assert.equal(noLabel.qualifier, "no-label");

  const sharedArray = declaration("variables", "shared array pixels = 0");
  assert.equal(sharedArray.qualifier, "array");
  assert.equal(sharedArray.shared, true);
  assert.equal(sharedArray.canonicalName, "pixels");

  const extension = declaration("variables", "extend upto: 8", 4);
  assert.deepEqual(
    { type: extension.type, value: extension.value, line: extension.line },
    { type: "extend", value: "8", line: 4 },
  );
});

test("evaluates integer expressions left to right and preserves float literal bits", () => {
  assert.equal(evaluateExpression("1 plus 2 multiplied 3"), 9);
  assert.equal(evaluateExpression("20 divided 3 plus 2"), 8);
  assert.equal(evaluateExpression("ffh relating 10b"), 257);
  assert.equal(evaluateExpression("1.5f"), floatBits(1.5));
  assert.equal(evaluateExpression("2.25f"), floatBits(2.25));
  assert.equal(evaluateExpression("1f div 255"), floatBits(Math.fround(1 / 255)));
  assert.equal(evaluateExpression("100000f mtp 2 div 640"), floatBits(312.5));
  assert.equal(evaluateExpression("minus minus 3"), 3);
  assert.equal(evaluateExpression("minus plus 3"), -3);
  assert.equal(evaluateExpression("3 as byte size"), 12);
});

test("resolves constants lazily, including forward references", () => {
  const declarations = [
    declaration("constants", "answer = later plus 2", 3),
    declaration("constants", "later = 40", 4),
    declaration("constants", "also = answer multiplied 2", 5),
    declaration("constants", "fraction = 1f div 255", 6),
    declaration("constants", "whole = fraction mtp 255", 7),
  ];
  const constants = resolveConstants(declarations);

  assert.equal(constants.get("answer"), 42);
  assert.equal(constants.get("later"), 40);
  assert.equal(constants.get("also"), 84);
  assert.equal(constants.get("fraction"), floatBits(Math.fround(1 / 255)));
  assert.equal(constants.get("whole"), floatBits(1));
  assert.equal(constants.get("yes"), 1);
});

test("derives stockfile offset and size constants for every alias", () => {
  const constants = projectConstants({
    stockfiles: [
      {
        offset: 12,
        data: new Uint8Array([1, 2, 3, 4]),
        symbols: ["sprites.bin", "SPRITES.BIN"],
      },
    ],
  });

  assert.equal(constants["sprites.bin"], 12);
  assert.equal(constants["sizeofsprites.bin"], 4);
  assert.equal(Object.keys(constants).filter((name) => name === "sprites.bin").length, 1);
});

test("encodes Lino braced strings, spaces, and escape units", () => {
  const encoded = encodeLinoString(String.raw`{A_B\cr\lf\cs\ta\us\\}`);
  assert.deepEqual(encoded, [65, 32, 66, 13, 10, 125, 9, 95, 92, 0]);
});

test("lays out continuations, repetitions, extend upto, and resolved relocations", () => {
  const declarations = [
    declaration("variables", "link = future", 1),
    declaration("variables", "future = 99", 2),
    declaration("variables", "2", 3),
    declaration("variables", "3 *** 2", 4),
    declaration("variables", "anchor = 7", 5),
    declaration("variables", "extend upto: 10", 6),
    declaration("variables", "11", 7),
  ];
  const layout = buildInitializedData(declarations, new Map());

  assert.deepEqual(
    [...layout.values],
    [1, 99, 2, 3, 3, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11],
  );
  assert.deepEqual(layout.symbols.get("link"), 0);
  assert.deepEqual(layout.symbols.get("future"), 1);
  assert.deepEqual(layout.symbols.get("anchor"), 5);
  assert.equal(layout.relocations.length, 1);
  assert.equal(layout.relocations[0].expression, "future");
  assert.equal(layout.unresolved.length, 0);
  assert.throws(
    () => buildInitializedData([declaration("variables", "bad = { X } *** 2")], new Map()),
    /strings cannot use repetition/,
  );
});

test("measures workspace units and symbol addresses through constants", () => {
  const declarations = [
    declaration("workspace", "scratch = slotCount plus 1"),
    declaration("workspace", "workspaceSlots = 2"),
    declaration("workspace", "tail = 4"),
  ];
  const workspace = measureWorkspace(
    declarations,
    new Map([["slotcount", 2]]),
    { base: 100 },
  );

  assert.equal(workspace.units, 9);
  assert.equal(workspace.symbols.get("scratch"), 100);
  assert.equal(workspace.symbols.get("workspaceslots"), 103);
  assert.equal(workspace.symbols.get("tail"), 105);
});

test("rejects malformed constant continuations instead of silently ignoring them", () => {
  assert.throws(() => declaration("constants", "not an assignment"), /require '='/);
});
