"use strict";

// Final-review minor: the voice provider list showed «Browser fallback (low quality)» (and
// «Online TTS», «Hebrew Local Piper …») in English inside the Russian and Hebrew UI.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

test("voice provider options are localized in ru, en and he", () => {
  const html = read("public/index.html");
  const select = html.match(/<select id="ttsProviderSelect">([\s\S]*?)<\/select>/)[1];
  for (const [value, key] of [["online_tts", "ttsOptOnline"], ["hebrew_phonikud_piper", "ttsOptPiper"], ["local_neural_tts_piper", "ttsOptWasm"], ["system_fallback", "ttsOptBrowser"]]) {
    assert.match(select, new RegExp(`<option value="${value}"[^>]*data-i18n="classic\.${key}"`), value);
  }
  assert.doesNotMatch(html, /setResultsMeta\("audio", "Browser fallback \(low quality\)"\)/);
  for (const l of ["ru", "en", "he"]) {
    const box = { window: {} };
    vm.runInNewContext(read(`public/i18n/locales/${l}.js`), box);
    const c = box.window.I18N_LOCALES[l].classic;
    for (const k of ["ttsOptOnline", "ttsOptPiper", "ttsOptWasm", "ttsOptBrowser"]) assert.equal(typeof c[k], "string", l + " " + k);
  }
});
