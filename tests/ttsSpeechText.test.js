"use strict";

// Знаки кантилляции/ударения (U+0591–U+05AF) Google TTS читает по буквам: Накдан ставит ole
// (U+05AB) в אָמַ֫רְתִּי, אֶ֫פֶס — и слово звучит побуквенно (замер 2026-09-26: אֶ֫פֶס 1.47 с
// против 0.87 с без знака). В речь уходит текст без этих знаков, огласовка остаётся.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const RANGE = "[\\u0591-\\u05AF]";

async function readerCore() {
  return import("data:text/javascript;base64," + Buffer.from(read("public/js/reader-core.js")).toString("base64"));
}

test("server, Room and Studio strip the same cantillation range before speech", () => {
  for (const f of ["server.js", "public/js/reader-core.js", "public/index.html"]) {
    assert.ok(read(f).includes("TTS_CANTILLATION_RE = /" + RANGE + "/g"), f + " defines the shared range");
  }
  const server = read("server.js");
  assert.equal((server.match(/const cleanText = ttsSpeechText\(text\);/g) || []).length, 3,
    "ensureAudioAsset, ensureAudioAssetWithTiming and /api/tts all synthesize the stripped text");
});

test("row speech text drops the stress mark but keeps niqqud", async () => {
  const core = await readerCore();
  const row = { he: "מה אמרת להם?", he_niqqud: "מָה אָמַ֫רְתָּ לָהֶם?" };
  assert.equal(core.getRowTtsTextForRow(row), "מָה אָמַרְתָּ לָהֶם?");
  assert.equal(core.getRowTtsTextForRow({ he_niqqud: "אֶ֫פֶס" }), "אֶפֶס");
  assert.equal(core.getRowTtsTextForRow({ he_niqqud: "שָׁלוֹם" }), "שָׁלוֹם", "plain niqqud text is untouched → old keys stay valid");
  assert.equal(core.rowSpeechHasCantillation(row), true);
  assert.equal(core.rowSpeechHasCantillation({ he_niqqud: "שָׁלוֹם" }), false);
});

test("a stored clip of a cantillated row is not replayed when fresh speech is possible", () => {
  const src = read("public/js/reader-core.js");
  assert.match(src, /const staleSpeech = !cachedOnly && !!gcpKeyOf\(\) && rowSpeechHasCantillation\(row\);/);
  assert.match(src, /const assetKey = staleSpeech \? "" : String\(row\._v3_audioAssetKey/);
  assert.match(read("public/index.html"), /if \(rowSpeechHasCantillation\(row\)\) return false;/);
});
