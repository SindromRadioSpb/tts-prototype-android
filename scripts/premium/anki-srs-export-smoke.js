"use strict";
// ── smoke:anki-srs-export — word_study → Anki deck spec → .apkg (⑤ A2b) ────────────────────────────────
// Validates the OPFS→Anki mapping (public/db/anki-srs-export.js): field extraction from body_json,
// lemma dedup, empty-skip, then builds the deck end-to-end through the client builder (sql.js) and
// asserts a valid «LinguistPro Word v1» collection. Headless. Run: npm run smoke:anki-srs-export

const initSqlJs = require("sql.js");
const JSZip = require("jszip");
const SrsExport = require("../../public/db/anki-srs-export.js");
const AnkiApkg = require("../../public/db/anki-apkg.js");
const core = require("../../public/db/anki-apkg-core.js");

let passed = 0, failed = 0;
function ok(name, cond, extra) { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.log("  ✗ " + name + (extra ? "  — " + extra : "")); } }

function notesFixture() {
  return [
    { id: "n1", body_json: JSON.stringify({ word: "הלך", niqqud_variant: "הָלַךְ", root: "הלך", binyan: "קל", pos: "verb", meaning: "идти, ходить", pealim_id: "1234" }) },
    { id: "n2", body: { word: "בית", niqqud_variant: "בַּיִת", root: "בית", pos: "noun", meaning: "дом", pealim_id: "5678" } },
    { id: "n3", body: { word: "הלך", niqqud_variant: "הָלַךְ", root: "הלך", binyan: "קל", pos: "verb", meaning: "(дубликат)", pealim_id: "1234" } }, // dup by pealim → collapses
    { id: "n4", body: { word: "", niqqud_variant: "", meaning: "пусто" } }, // no front → skipped
    { id: "n5", body: { word: "ספר", pos: "noun", meaning: "книга" } }, // no pealim → keyed by word#pos
  ];
}

(async () => {
  console.log("smoke:anki-srs-export — word_study → .apkg\n");
  const SQL = await initSqlJs();
  const NOW = 1718600600000;

  // 1) field extraction
  const f1 = SrsExport.noteToFields(notesFixture()[0]);
  ok("parses body_json string → fields", f1.Word === "הלך" && f1.Niqqud === "הָלַךְ" && f1.Root === "הלך" && f1.Binyan === "קל" && f1.POS === "verb" && f1.Meaning === "идти, ходить" && f1.PealimId === "1234");
  const f2 = SrsExport.noteToFields(notesFixture()[1]);
  ok("accepts pre-parsed body object", f2.Word === "בית" && f2.PealimId === "5678");

  // 2) spec building: dedup + empty-skip
  const spec = SrsExport.buildWordStudySpec(notesFixture(), { deckName: "LinguistPro::Words::Test" });
  ok("model = «LinguistPro Word v1» with 8 fields", spec.modelName === "LinguistPro Word v1" && spec.fieldNames.length === 8);
  ok("dedups by pealim (הלך twice → 1) + skips empty (n4) → 3 notes", spec.notes.length === 3, "got " + spec.notes.length + " " + JSON.stringify(spec.notes.map(n => n.fields[0])));
  ok("first field is Word (Hebrew)", spec.notes[0].fields[0] === "הלך");
  ok("guid is the stable lemma-key guid", spec.notes[0].guid === core.stableGuid("word:pid:1234"));
  ok("no-pealim note keyed by word#pos", spec.notes.some(n => n.guid === core.stableGuid("word:w:ספר#noun")));
  ok("POS tag emitted", spec.notes[0].tags.includes("lp_pos_verb") && spec.notes[0].tags.includes("lp_word"));

  // 3) end-to-end → valid Anki collection via the client builder
  const bytes = await AnkiApkg.buildApkgBytes(spec, { SQL, JSZip, now: NOW, zipType: "uint8array" });
  ok("builds .apkg bytes", bytes instanceof Uint8Array && bytes.length > 0);
  const zip = await JSZip.loadAsync(bytes);
  const db = new SQL.Database(await zip.file("collection.anki2").async("uint8array"));
  const noteCount = db.exec("SELECT COUNT(*) FROM notes")[0].values[0][0];
  ok("collection has 3 notes", noteCount === 3, "got " + noteCount);
  const models = JSON.parse(db.exec("SELECT models FROM col WHERE id=1")[0].values[0][0]);
  const mid = Object.keys(models)[0];
  ok("model name persisted", models[mid].name === "LinguistPro Word v1");
  ok("model fields in order", models[mid].flds.map(x => x.name).join(",") === "Word,Niqqud,Root,Binyan,POS,Meaning,PealimId,NoteId");
  const cardCount = db.exec("SELECT COUNT(*) FROM cards")[0].values[0][0];
  ok("3 cards (1 template)", cardCount === 3);
  db.close();

  // 4) empty input → valid empty deck
  const empty = SrsExport.buildWordStudySpec([], {});
  ok("empty notes → 0-note spec (still valid model)", empty.notes.length === 0 && empty.modelName === "LinguistPro Word v1");

  console.log("\nsmoke:anki-srs-export — " + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
