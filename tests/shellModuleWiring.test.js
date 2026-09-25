"use strict";
// A module can pass every node test and still be dead in the product: node tests require() it
// directly, while the browser only ever sees what a shell loads. media-stream-store.js shipped
// that way -- four consumers called window.MediaStreamStore and no shell ever loaded the file, so
// every path that writes media bytes failed at the write step with MEDIA_STREAM_STORE_UNAVAILABLE.
// This gate compares what modules DEMAND of the window against what the shells actually provide.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const JS_DIR = path.join(ROOT, "public", "js");

const SHELLS = ["public/index.html", "public/library.html", "public/mediatheque.html"];
// global -> the file that defines it
const PROVIDERS = {
  SubtitleRowLanguage: "subtitle-row-language.js",
  SubtitleTimingStatus: "subtitle-timing-status.js",
  MediaStreamStore: "media-stream-store.js",
  SubtitleMaterialCore: "subtitle-material-core.js",
  MediaBundleCore: "media-bundle-core.js",
  SubtitleMaterialVocalization: "subtitle-material-vocalization.js",
  LocalTranslit: "local-translit-bundle.js",
  TablePresets: "table-presets.js",
};

function consumersOf(global, providerFile) {
  const pattern = new RegExp("window\\." + global + "\\b");
  return fs.readdirSync(JS_DIR)
    .filter((name) => name.endsWith(".js") && name !== providerFile)
    .filter((name) => pattern.test(fs.readFileSync(path.join(JS_DIR, name), "utf8")));
}

for (const [global, providerFile] of Object.entries(PROVIDERS)) {
  test(`every shell loading a window.${global} consumer also loads ${providerFile}`, () => {
    const consumers = consumersOf(global, providerFile);
    assert.ok(consumers.length > 0, `no consumer of window.${global} found — update this gate`);
    for (const shell of SHELLS) {
      let html;
      try { html = read(shell); } catch (_) { continue; }
      const loaded = consumers.filter((name) => html.includes("/js/" + name));
      if (!loaded.length) continue;
      assert.ok(html.includes("/js/" + providerFile),
        `${shell} loads ${loaded.join(", ")} but never loads ${providerFile}`);
    }
  });

  test(`${providerFile} is requested and precached under one identical key`, () => {
    const urlOf = (html) => {
      const match = html.match(new RegExp("/js/" + providerFile.replace(".", "\\.") + "(\\?v=\\d+)?"));
      return match ? match[0] : null;
    };
    const urls = new Set();
    for (const shell of SHELLS) {
      let html;
      try { html = read(shell); } catch (_) { continue; }
      const url = urlOf(html);
      if (url) urls.add(url);
    }
    assert.equal(urls.size, 1, `shells must request one identical ${providerFile} URL, got ${[...urls].join(" | ")}`);
    const url = [...urls][0];
    // A precache key that differs by one character installs a second copy and serves a stale one.
    assert.ok(read("public/sw.js").includes(JSON.stringify(url)),
      `the service worker must precache exactly ${url}`);
  });
}

// Third-party runtimes are referenced as bare globals, not window properties, so the scan above
// cannot see them. media-stream-store.js shipped needing `hashwasm` while no shell served it:
// the store loaded, then failed at the first byte with HASH_RUNTIME_UNAVAILABLE.
const BARE_GLOBAL_PROVIDERS = {
  hashwasm: "/vendor/hash-wasm/sha256.umd.min.js",
};

for (const [global, providerUrl] of Object.entries(BARE_GLOBAL_PROVIDERS)) {
  test(`every shell loading a module that needs the ${global} runtime also serves it`, () => {
    const pattern = new RegExp("(?<!\\.)\\b" + global + "\\b");
    const consumers = fs.readdirSync(JS_DIR)
      .filter((name) => name.endsWith(".js"))
      .filter((name) => pattern.test(fs.readFileSync(path.join(JS_DIR, name), "utf8")));
    assert.ok(consumers.length > 0, `no module needs ${global} — update this gate`);
    for (const shell of SHELLS) {
      let html;
      try { html = read(shell); } catch (_) { continue; }
      const loaded = consumers.filter((name) => html.includes("/js/" + name));
      if (!loaded.length) continue;
      assert.ok(html.includes(providerUrl),
        `${shell} loads ${loaded.join(", ")} which need ${global}, but never loads ${providerUrl}`);
    }
    // Offline is where a missing runtime hurts most: the write path is exactly the one a user
    // runs on a phone with no network, so the worker must hold it too.
    assert.ok(read("public/sw.js").includes(JSON.stringify(providerUrl)),
      `the service worker must precache ${providerUrl}`);
    assert.ok(read("server.js").includes(providerUrl),
      `the server must serve ${providerUrl}`);
  });
}
