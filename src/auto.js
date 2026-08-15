import { bootLinoScripts } from "./browser.js";

async function boot() {
  const instances = await bootLinoScripts({
    hostFactory: (element) => globalThis.createLinoHost?.(element) ?? {},
  });
  globalThis.linoPrograms = instances;
  globalThis.dispatchEvent(new CustomEvent("lino-programs-ready", { detail: instances }));
  return instances;
}

globalThis.linoReady = document.readyState === "loading"
  ? new Promise((resolve, reject) => {
      document.addEventListener("DOMContentLoaded", () => boot().then(resolve, reject), { once: true });
    })
  : boot();
