"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const Preview = require("../public/js/obsidian-lexical-preview.js");
const NotesAutoGen = require("../public/js/notes-autogen.js");

test("the shipped Pealim snapshot projects תסתכלי as להסתכל in a human-named text folder", () => {
  const snapshot = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(
    __dirname, "../public/data/inflection/pealim-infl-v12.json.gz"
  ))).toString("utf8"));
  const paradigms = snapshot.paradigms || [];
  const maps = NotesAutoGen.buildResolverMaps(paradigms);
  const byId = new Map(paradigms.map((row) => [String(row.pealim_id || ""), row]));
  const bundle = {
    library: { texts: [{
      text_id: "fcc2cd3a-025b-4277-9210-44cfad8e2bcf",
      title: "אושר כהן - כולם גנבים",
      rows: [{ row_id: "row-1", order_index: 0,
        hebrew_plain: "תסתכלי לי בעיניים בטח שוב תגלגלי",
        hebrew_niqqud: "תִּסְתַּכְּלִי לִי בָּעֵינַיִם בֶּטַח שׁוּב תְּגַלְגְּלִי",
        russian: "Посмотри мне в глаза" }]
    }] },
    notes_advanced: { notes: [], occurrences: [], sentence_morph: [{
      text_id: "fcc2cd3a-025b-4277-9210-44cfad8e2bcf", sentence_id: "row-1",
      model_version: "dicta-morph-v2", tokens: [{
        word: "תסתכלי", niqqud: "תִּסְתַּכְּלִי", lemma: "סכל", stem: "סכל",
        posDicta: "verb", binyan: "hitpael"
      }]
    }] }
  };
  const report = Preview.analyzeBundle(bundle, {
    textId: "fcc2cd3a-025b-4277-9210-44cfad8e2bcf",
    ambiguityResolver: (unit) => NotesAutoGen.formFirstResolve(maps, unit),
    pealimResolver: (id) => byId.get(String(id)) || null
  });
  const lexeme = report.lexemes.find((row) => row.pealim_id === "1352");
  assert.ok(lexeme);
  assert.equal(lexeme.headword, "לְהִסְתַּכֵּל");
  assert.equal(lexeme.root, "סכל");
  assert.match(lexeme.meaning_ru, /смотреть/);
  const plan = Preview.planObsidianPackage(report);
  assert.match(plan.text_path, /^_LinguistPro\/Тексты\/אושר כהן - כולם גנבים — [a-f0-9]{8}$/);
  assert.ok(plan.files.some((file) => file.kind === "text-lexeme" && /form_infinitive: "לְהִסְתַּכֵּל"/.test(file.content)));
});
