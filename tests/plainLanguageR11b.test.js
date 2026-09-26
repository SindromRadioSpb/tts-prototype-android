"use strict";

// R11b (UI release program, audit P1-4, P1-17): plain language on the surface. The Russian UI
// said «Library: нужно сохранить», «SRS Trainer», «Hebrew-learning IDE с offline-first
// архитектурой», and the table source read «сгенерирована из кэша (google-free, doc)» /
// «без огласовки (sidecar недоступен)» / «fallback a→b (transient)».

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const locale = (l) => { const box = { window: {} }; vm.runInNewContext(read(`public/i18n/locales/${l}.js`), box); return box.window.I18N_LOCALES[l]; };

test("the Russian UI has no Latin «Library», «SRS Trainer», «IDE» or «offline-first»", () => {
  const ru = locale("ru");
  const bad = [];
  (function walk(o, p) {
    for (const [k, v] of Object.entries(o)) {
      const key = p ? p + "." + k : k;
      if (typeof v === "string") { if (/\bLibrary\b|SRS Trainer|\bIDE\b|offline-first/.test(v) && !/\.json|library\.json/.test(v)) bad.push(key + " = " + v); }
      else if (v && typeof v === "object") walk(v, key);
    }
  })(ru, "");
  assert.deepEqual(bad, []);
  assert.equal(ru.ide.tabLibrary, "Мои материалы");   // owner 2026-09-26: Studio store = «Мои материалы»
  assert.equal(ru.classic.chipLibraryNeedSave, "Мои материалы: нужно сохранить");
});

test("the table source line is plain language; the technical ids stay out of it", () => {
  const html = read("public/index.html");
  const start = html.indexOf("function v3TableProvenanceLabel(res)");
  assert.ok(start > 0);
  const fn = html.slice(start, html.indexOf("\n    }\n", start) + 6);
  const run = (res) => {
    const T = { "classic.provCacheDoc": "из кэша этого браузера", "classic.provCacheSegment": "частично из кэша этого браузера",
      "classic.provTranslatedBy": "переведена: {name}", "classic.provFallback": "запасной перевод: {name}",
      "classic.provNoNiqqud": "без огласовки: сервис огласовки недоступен", "classic.provLocal": "локальный перевод" };
    const t = (k, p) => String(T[k] || k).replace(/\{(\w+)\}/g, (_, n) => (p && p[n]) || "");
    const box = { t, out: null };
    vm.runInNewContext(fn + "\nout = v3TableProvenanceLabel(" + JSON.stringify(res) + ");", box);
    return box.out;
  };
  assert.equal(run({ fromCache: true, provenance: { provider: "google-free", cache_level: "doc" } }), "из кэша этого браузера");
  assert.equal(run({ provenance: { provider: "gemini", actual_provider: "gemini", translator_version: "google-free-gtx-v1" } }), "переведена: Gemini");
  assert.equal(run({ provenance: { provider: "gemini", actual_provider: "google-free", fallback_reason: "transient", nikud_degraded: true } }),
    "переведена: Google Translate · запасной перевод: Google Translate · без огласовки: сервис огласовки недоступен");
  assert.match(html, /function setResultsMetaWithProvenance\(res\) \{\s*setResultsMeta\("table", v3TableProvenanceLabel\(res\)\);/);
  for (const l of ["ru", "en", "he"]) {
    const c = locale(l).classic;
    for (const k of ["provCacheDoc", "provCacheSegment", "provTranslatedBy", "provFallback", "provNoNiqqud", "provLocal"]) assert.equal(typeof c[k], "string", l + " " + k);
  }
  assert.match(locale("ru").classic.provCacheDoc, /кэш/, "classicSyncStateUi recognises a restored result by «кэш»");
});

test("the observations log records what R11b could not fix honestly", () => {
  const log = read("docs/planning/OBSERVATIONS_LOG.md");
  assert.match(log, /## O-021 ·/);
  assert.match(log, /## O-022 ·/);
});
