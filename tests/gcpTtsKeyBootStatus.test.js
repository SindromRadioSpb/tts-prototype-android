"use strict";

// 2026-09-26 (владелец): после перезагрузки статус GCP TTS писал «Ключ не задан», хотя ключ
// лежал в localStorage и озвучка работала. Первичный gcpTtsKeyGroupSync() выполняется в том же
// <script> раньше объявления `const GCP_TTS_KEY_LS_KEY` — обращение из TDZ бросало
// ReferenceError, а try/catch в gcpTtsKeyGet() превращал его в "".

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8").replace(/\r\n/g, "\n");

test("the key slot name has no temporal dead zone at the early boot sync", () => {
  const earlySync = html.indexOf("    // Initial sync after page setup runs.\n    try { gcpTtsKeyGroupSync(); } catch (_) {}");
  const decl = html.indexOf("function gcpTtsKeyStorageName()");
  assert.ok(earlySync > 0 && decl > earlySync, "the early sync still precedes the declarations — the case this guards");
  assert.doesNotMatch(html, /const GCP_TTS_KEY_LS_KEY/, "a const slot name would be in TDZ at the early sync");
});

test("status called before the declarations are reached still sees the stored key", () => {
  const start = html.indexOf("    function gcpTtsKeyStorageName()");
  const end = html.indexOf("    function gcpTtsKeyGroupSync()");
  const block = html.slice(start, end);
  const el = { style: {}, textContent: "" };
  const sandbox = {
    localStorage: { getItem: (k) => (k === "v3.gcpTtsApiKey" ? "AIzaSyTESTKEY0123456789abcd" : null) },
    document: { getElementById: () => el },
    t: (k) => (k === "classic.gcpTtsKeyStoredStatus" ? "OK:" : "EMPTY"),
    result: null,
  };
  // The call comes FIRST in the script, exactly like the early boot sync.
  vm.runInNewContext("gcpTtsKeyStatusRefresh();\n" + block, sandbox);
  assert.match(el.textContent, /^OK: AIzaSyTE…abcd$/);
});
