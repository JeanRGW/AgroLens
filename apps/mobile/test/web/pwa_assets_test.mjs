import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const web = new URL("../../web/", import.meta.url);

test("Pages rewrites only the PWA entry point, never its boot assets", async () => {
  const redirects = await readFile(
    new URL("../../../web/public/_redirects", import.meta.url),
    "utf8",
  );
  const rules = redirects
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(/\s+/));
  const matches = (source, path) => {
    const pattern = source
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${pattern}$`).test(path);
  };
  assert.deepEqual(
    rules.find(([source]) => matches(source, "/m")),
    ["/m", "/m/", "301"],
  );
  assert.deepEqual(
    rules.find(([source]) => matches(source, "/m/")),
    ["/m/", "/m/index.html", "200"],
  );

  const worker = await readFile(new URL("sw.js", web), "utf8");
  const shell = vm.runInNewContext(
    worker.match(/const REQUIRED_SHELL = (\[[\s\S]*?\]);/)[1],
  );
  for (const asset of [...shell.filter((path) => path !== "./"), "sw.js"]) {
    const path = new URL(asset, "https://app.test/m/").pathname;
    assert.equal(
      rules.some(([source]) => matches(source, path)),
      false,
      path,
    );
  }
});

test("production CSP permits picker blob reads without enabling script eval", async () => {
  const caddyfile = await readFile(
    new URL("../../../../deploy/production/Caddyfile.example", import.meta.url),
    "utf8",
  );
  const policy = caddyfile.match(/Content-Security-Policy "([^"]+)"/)[1];
  const connect = policy
    .split(";")
    .find((part) => part.trim().startsWith("connect-src"));
  const script = policy
    .split(";")
    .find((part) => part.trim().startsWith("script-src"));
  assert.match(connect, /\bblob:/);
  assert.match(script, /'wasm-unsafe-eval'/);
  assert.doesNotMatch(script, /'unsafe-eval'|'unsafe-inline'/);
});

test("SQLite wasm exports match the generated worker", async () => {
  const module = await WebAssembly.compile(
    await readFile(new URL("sqlite3.wasm", web)),
  );
  const exports = new Set(
    WebAssembly.Module.exports(module).map((item) => item.name),
  );
  const worker = await readFile(new URL("drift_worker.js", web), "utf8");
  const required = [
    ...worker.matchAll(/wasmExports[^\n]*?\("([a-zA-Z0-9_]+)"\)/g),
  ].map((match) => match[1]);
  // These exports distinguish sqlite3 3.x from the incompatible 2.x binary.
  required.push(
    "sqlite3_initialize",
    "dart_sqlite3_bind_text",
    "dart_sqlite3_bind_blob",
  );
  for (const name of required)
    assert.ok(exports.has(name), `Missing wasm export: ${name}`);
});

async function activate(script, keys) {
  const listeners = new Map();
  const deleted = [];
  const context = vm.createContext({
    URL,
    Promise,
    console,
    caches: {
      keys: async () => keys,
      delete: async (key) => {
        deleted.push(key);
        return true;
      },
    },
    self: {
      location: { origin: "https://app.test" },
      registration: { scope: "https://app.test/m/" },
      clients: {
        claim: async () => {},
      },
      addEventListener: (name, listener) => listeners.set(name, listener),
    },
  });
  vm.runInContext(script, context);
  let pending;
  listeners.get("activate")({
    waitUntil: (promise) => {
      pending = promise;
    },
  });
  await pending;
  return { deleted, listeners };
}

test("Flutter activation removes only old Flutter caches", async () => {
  const worker = await readFile(new URL("sw.js", web), "utf8");
  const keys = [
    "agrolens-m-v2",
    "agrolens-m-v3",
    "agrolens-m-v4",
    "ngsw:/:db:control",
    "unrelated",
  ];
  const result = await activate(worker, keys);
  assert.deepEqual(result.deleted, ["agrolens-m-v2", "agrolens-m-v3"]);
});

test("Flutter does not cache API or Angular resources", async () => {
  const { listeners } = await activate(
    await readFile(new URL("sw.js", web), "utf8"),
    [],
  );
  for (const path of ["/api/uploads", "/main.js", "/uploads"]) {
    let intercepted = false;
    listeners.get("fetch")({
      request: { method: "GET", url: `https://app.test${path}` },
      respondWith: () => {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false, path);
  }
});

test("registration is external for strict script-src CSP", async () => {
  const html = await readFile(new URL("index.html", web), "utf8");
  assert.match(html, /<script src="register-sw\.js" defer><\/script>/);
  assert.doesNotMatch(html, /<script\s*>/);
  const worker = await readFile(new URL("sw.js", web), "utf8");
  assert.match(worker, /["']register-sw\.js["']/);
});

test("offline readiness is recorded only after the required shell is cached", async () => {
  const script = await readFile(new URL("sw.js", web), "utf8");
  for (const fail of [false, true]) {
    const listeners = new Map();
    const stored = [];
    const context = vm.createContext({
      URL,
      Promise,
      Response,
      caches: {
        open: async () => ({
          addAll: async () => {
            if (fail) throw new Error("Missing required asset");
          },
          add: async () => {},
          put: async (key) => stored.push(key),
        }),
      },
      self: {
        addEventListener: (name, callback) => listeners.set(name, callback),
        skipWaiting: async () => {},
      },
    });
    vm.runInContext(script, context);
    let pending;
    listeners.get("install")({
      waitUntil: (promise) => {
        pending = promise;
      },
    });
    if (fail) {
      await assert.rejects(pending, /Missing required asset/);
      assert.deepEqual(stored, []);
    } else {
      await pending;
      assert.deepEqual(stored, ["offline-ready.json"]);
    }
  }
});
