"use strict";
// O-033, owner-approved 2026-09-28: the stored transliteration is a cache; what leaves the app
// (DOCX, Anki, mentor context) is derived from the niqqud at export time in the selected profile,
// and a hand-edited cell is exported as written.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { exportTranslit, exportProfile } = require("../db/premium/translitExport");
const { transliterateWithProfile: T } = require("../db/premium/translit");
const AnkiSrsExport = require("../public/db/anki-srs-export.js");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const niqqud = "הוּא לֹא יוֹצֵא לְסִיבּוּב";
const stale = "hu' lo' yotse' lsibuv"; // what the pre-3.11.678 engine stored

test("an export writes the selected profile from the niqqud, not the cached column", () => {
  for (const profile of ["learner-latin", "sbl", "ru-phonetic"]) {
    assert.equal(exportTranslit({ he_niqqud: niqqud, translit: stale }, profile), T(niqqud, profile), profile);
  }
  assert.equal(exportTranslit({ hebrew_niqqud: niqqud, translit: stale }, "learner-latin"), T(niqqud, "learner-latin"), "bundle row shape");
  assert.equal(exportProfile("nonsense"), "learner-latin");
});

test("a hand-edited cell is exported as written, in every row shape", () => {
  assert.equal(exportTranslit({ he_niqqud: niqqud, translit: "my own", edit_meta_json: '{"edited":{"translit":true}}' }, "learner-latin"), "my own");
  assert.equal(exportTranslit({ hebrew_niqqud: niqqud, translit: "my own", edit_meta: { edited: { translit: true } } }, "sbl"), "my own");
  assert.equal(exportTranslit({ he_niqqud: "", translit: "no niqqud" }, "sbl"), "no niqqud");
});

test("Anki sentence cards take the caller's derived transliteration", () => {
  const sents = [{ id: "s1", he_plain: "הוא", he_niqqud: niqqud, translit: stale, ru: "он" }];
  const withFn = AnkiSrsExport.sentenceGroup(sents, { translitFor: (s) => exportTranslit(s, "ru-phonetic") });
  const without = AnkiSrsExport.sentenceGroup(sents, {});
  const idx = withFn.fieldNames.indexOf("Translit");
  assert.equal(withFn.notes[0].fields[idx], T(niqqud, "ru-phonetic"));
  assert.equal(without.notes[0].fields[idx], stale, "no function: stored column as before");
});

test("DOCX, Anki and the mentor are wired to the export transliteration", () => {
  const server = read("server.js"), html = read("public/index.html"), agent = read("db/agentSentenceRepo.js");
  assert.match(server, /cell\(exportTranslit\(r, docxTranslitProfile\)\)/);
  assert.equal((html.match(/body: JSON\.stringify\(\{ text, sentences, notes, translit_profile: /g) || []).length, 2, "both DOCX callers send the profile");
  assert.match(html, /sentenceGroup\(sents, \{ noteBySid, audioBySid, translitFor,/);
  assert.match(agent, /translit: exportTranslit\(row, DEFAULT_PROFILE\)/);
});
