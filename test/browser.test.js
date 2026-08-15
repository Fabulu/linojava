import assert from "node:assert/strict";
import test from "node:test";
import {
  bootLinoScripts,
  compileInBrowser,
  createProgramFromElement,
  createProgramFromSource,
} from "../src/browser.js";

const source = `
  "variables";
  value = 0;
  "programme";
  "fallback";
  end;
  "entry";
  [value]+;
  end;
`;

async function withNodeModuleUrlShim(callback) {
  const originalBlob = globalThis.Blob;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  globalThis.Blob = class TestBlob {
    constructor(parts) {
      this.source = parts.join("");
    }
  };
  URL.createObjectURL = (blob) => `data:text/javascript;base64,${Buffer.from(blob.source, "utf8").toString("base64")}`;
  URL.revokeObjectURL = () => {};
  try {
    return await callback();
  } finally {
    globalThis.Blob = originalBlob;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
}

function elementFor({ src = null, textContent = source, entry = "entry" } = {}) {
  const events = [];
  return {
    dataset: { entry },
    textContent,
    events,
    getAttribute(name) {
      return name === "src" ? src : null;
    },
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
  };
}

test("browser module exposes source-loader entry points", () => {
  assert.equal(typeof compileInBrowser, "function");
  assert.equal(typeof createProgramFromSource, "function");
  assert.equal(typeof createProgramFromElement, "function");
  assert.equal(typeof bootLinoScripts, "function");
});

test("source elements use inline text and data-entry to create a program", async () => {
  await withNodeModuleUrlShim(async () => {
    const element = elementFor();
    const result = await createProgramFromElement(element, {}, { cache: false });

    assert.equal(result.cached, false);
    assert.equal(result.program.step().status, "halted");
    assert.equal(result.program.get("value"), 1);
  });
});

test("source elements resolve external src against document.baseURI", async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.document = { baseURI: "https://example.test/games/index.html" };
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return { ok: true, text: async () => source };
  };
  try {
    await withNodeModuleUrlShim(async () => {
      const element = elementFor({ src: "./game.lino", textContent: "ignored" });
      const result = await createProgramFromElement(element, {}, { cache: false });
      assert.equal(result.program.step().status, "halted");
      assert.equal(result.program.get("value"), 1);
    });
  } finally {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(requested, ["https://example.test/games/game.lino"]);
});
