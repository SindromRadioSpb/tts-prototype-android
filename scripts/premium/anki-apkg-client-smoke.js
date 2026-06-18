"use strict";
// ── smoke:anki-apkg-client — client builder gate + server/client PARITY (⑤ Anki-sync brick A2) ──────────
// Builds the same deck with the CLIENT builder (public/db/anki-apkg.js → sql.js + jszip) and the SERVER
// builder (lib/ankiApkg.js → sqlite3 + archiver), then asserts the two are LOGICALLY IDENTICAL (same
// guids/flds/csum/counts/col-JSON) — proving the shared core keeps them from drifting — and that the
// client output is a valid legacy Anki collection. Runs headless (sql.js works in Node). Run: npm run smoke:anki-apkg-client

const initSqlJs = require("sql.js");
const JSZip = require("jszip");
const AnkiApkg = require("../../public/db/anki-apkg.js");
const serverLib = require("../../lib/ankiApkg.js");

let passed = 0, failed = 0;
function ok(name, cond, extra) { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.log("  ✗ " + name + (extra ? "  — " + extra : "")); } }

const FIELD_NAMES = ["UID", "Prompt", "Answer", "Hebrew", "HebrewNiqqud", "Russian", "Root", "Binyan", "PealimId", "Context"];
const TEMPLATES = [{ Name: "SRS Card", Front: "<div>{{Prompt}}</div>", Back: "{{Prompt}}<hr>{{Answer}}<div>{{Hebrew}}</div><div>{{Context}}</div>" }];
const CSS = ".card{font-family:Arial;}";
function spec() {
  return {
    deckName: "LinguistPro::SRS::A2", modelName: "LinguistPro SRS Card v1", fieldNames: FIELD_NAMES, templates: TEMPLATES, css: CSS,
    notes: [
      { fields: ["1001", "дом", "בַּיִת", "בית", "בַּיִת", "дом", "בית", "", "1234", "זה הבית שלי · это мой дом"], tags: ["lp", "lp_srs", "lp_srs_card_1001"] },
      { fields: ["1002", "<b>писать</b>", "כָּתַב", "כתב", "כָּתַב", "писать", "כתב", "paal", "5678", ""], tags: ["lp"] },
      { fields: ["1003", "царь", "מֶלֶךְ", "מלך", "מֶלֶךְ", "царь", "מלך", "", "", ""], tags: [] },
    ],
  };
}

async function openCollection(SQL, bytesZip) {
  const zip = await JSZip.loadAsync(bytesZip);
  const hasCol = !!zip.file("collection.anki2");
  const hasMedia = !!zip.file("media");
  const dbBytes = hasCol ? await zip.file("collection.anki2").async("uint8array") : null;
  const db = dbBytes ? new SQL.Database(dbBytes) : null;
  return { db, hasCol, hasMedia };
}
function rows(db, sql) { const r = db.exec(sql); return r.length ? r[0].values : []; }

(async () => {
  console.log("smoke:anki-apkg-client — client .apkg builder + server/client parity\n");
  const SQL = await initSqlJs();
  const NOW = 1718600500000; // fixed → ids deterministic so server & client outputs are directly comparable

  // 1) client build is a valid Anki collection
  const clientZip = await AnkiApkg.buildApkgBytes(spec(), { SQL, JSZip, now: NOW, zipType: "uint8array" });
  ok("client build returns bytes (Uint8Array)", clientZip instanceof Uint8Array && clientZip.length > 0, "len=" + (clientZip && clientZip.length));
  const C = await openCollection(SQL, clientZip);
  ok("client: zip has collection.anki2 + media", C.hasCol && C.hasMedia);
  const cCol = rows(C.db, "SELECT ver, models, decks, conf FROM col WHERE id=1")[0];
  ok("client: col.ver === 11", cCol && cCol[0] === 11, cCol && "ver=" + cCol[0]);
  const cModels = JSON.parse(cCol[1]); const cMid = Object.keys(cModels)[0];
  ok("client: model name + 10 fields", cModels[cMid].name === "LinguistPro SRS Card v1" && cModels[cMid].flds.length === 10);
  const cNotes = rows(C.db, "SELECT guid, flds, sfld, csum FROM notes ORDER BY id");
  ok("client: 3 notes", cNotes.length === 3, "got " + cNotes.length);
  ok("client: csum(first note) correct", cNotes[0][3] === AnkiApkg.core.fieldChecksum("1001"));
  const specNotes = spec().notes;
  // sfld has Anki's `integer` affinity → a numeric first field stores as a number (real card UIDs are
  // UUID strings, so they stay text); compare type-tolerantly.
  ok("client: sfld === stripHtmlMedia(first field) for every note", cNotes.every((r, i) => String(r[2]) === AnkiApkg.core.stripHtmlMedia(specNotes[i].fields[0])));
  ok("client: stable guid", cNotes[0][0] === AnkiApkg.core.stableGuid("1001"));
  // HTML first field genuinely strips in the client build (sfld + csum from stripped text)
  const htmlSpec = { deckName: "d", modelName: "m", fieldNames: ["A", "B"], templates: [{ Name: "T", Front: "{{A}}", Back: "{{B}}" }], css: "", notes: [{ fields: ["<b>царь</b>[sound:x.mp3]", "y"] }] };
  const hz = await AnkiApkg.buildApkgBytes(htmlSpec, { SQL, JSZip, now: NOW, zipType: "uint8array" });
  const H = await openCollection(SQL, hz);
  const hNote = rows(H.db, "SELECT sfld, csum FROM notes")[0];
  ok("client: HTML first field → sfld stripped to 'царь'", hNote[0] === "царь", "sfld=" + hNote[0]);
  ok("client: csum from stripped HTML first field", hNote[1] === AnkiApkg.core.fieldChecksum("<b>царь</b>[sound:x.mp3]"));
  try { H.db.close(); } catch (_) {}
  const cCards = rows(C.db, "SELECT id FROM cards");
  ok("client: 3 cards (1 template each), all NEW", cCards.length === 3);

  // 2) server build of the SAME spec + same NOW
  const serverZip = await serverLib.buildApkg(spec(), { now: NOW });
  const S = await openCollection(SQL, serverZip);
  const sNotes = rows(S.db, "SELECT guid, flds, sfld, csum FROM notes ORDER BY id");
  const sCards = rows(S.db, "SELECT id FROM cards ORDER BY id");
  const sCol = rows(S.db, "SELECT ver, models, decks FROM col WHERE id=1")[0];

  // 3) PARITY — the two builders are logically identical
  ok("parity: same note count", cNotes.length === sNotes.length);
  ok("parity: identical note guids", JSON.stringify(cNotes.map((r) => r[0])) === JSON.stringify(sNotes.map((r) => r[0])));
  ok("parity: identical note flds", JSON.stringify(cNotes.map((r) => r[1])) === JSON.stringify(sNotes.map((r) => r[1])));
  ok("parity: identical note csum", JSON.stringify(cNotes.map((r) => r[3])) === JSON.stringify(sNotes.map((r) => r[3])));
  ok("parity: identical card count", cCards.length === sCards.length);
  ok("parity: identical col.ver", cCol[0] === sCol[0]);
  ok("parity: identical models JSON", cCol[1] === sCol[1]);
  ok("parity: identical decks JSON", cCol[2] === sCol[2]);

  // 4) idempotency: rebuild client → same guids (re-import updates, not duplicates)
  const clientZip2 = await AnkiApkg.buildApkgBytes(spec(), { SQL, JSZip, now: NOW + 999, zipType: "uint8array" });
  const C2 = await openCollection(SQL, clientZip2);
  const c2Guids = rows(C2.db, "SELECT guid FROM notes ORDER BY id").map((r) => r[0]);
  ok("client idempotent: guids stable across rebuilds", JSON.stringify(c2Guids) === JSON.stringify(cNotes.map((r) => r[0])));

  // 5) empty deck still valid
  const emptyZip = await AnkiApkg.buildApkgBytes(Object.assign(spec(), { notes: [] }), { SQL, JSZip, now: NOW, zipType: "uint8array" });
  const E = await openCollection(SQL, emptyZip);
  ok("client: empty deck builds valid collection (0 notes)", rows(E.db, "SELECT COUNT(*) FROM notes")[0][0] === 0);

  // 6) MULTI-MODEL «both» — words + sentences models + decks in ONE .apkg (the unify case)
  const multiSpec = { groups: [
    { deckName: "LinguistPro::Words", modelName: "LinguistPro Word v2", fieldNames: ["Word", "Russian"], templates: [{ Name: "w", Front: "{{Word}}", Back: "{{Russian}}" }], css: "", notes: [{ fields: ["שלום", "мир"] }, { fields: ["בית", "дом"] }] },
    { deckName: "LinguistPro::SRS", modelName: "LinguistPro SRS Card v1", fieldNames: ["Hebrew", "Russian"], templates: [{ Name: "s", Front: "{{Hebrew}}", Back: "{{Russian}}" }], css: "", notes: [{ fields: ["זה הבית שלי", "это мой дом"] }] },
  ] };
  const mz = await AnkiApkg.buildApkgBytes(multiSpec, { SQL, JSZip, now: NOW, zipType: "uint8array" });
  const M = await openCollection(SQL, mz);
  const mModels = JSON.parse(rows(M.db, "SELECT models FROM col WHERE id=1")[0][0]);
  ok("multi: 2 distinct models in one collection", Object.keys(mModels).length === 2);
  ok("multi: both model names present", Object.values(mModels).map((m) => m.name).sort().join("|") === "LinguistPro SRS Card v1|LinguistPro Word v2");
  const mDecks = JSON.parse(rows(M.db, "SELECT decks FROM col WHERE id=1")[0][0]);
  ok("multi: Default + 2 group decks", Object.keys(mDecks).length === 3);
  const mNotes = rows(M.db, "SELECT mid FROM notes ORDER BY id");
  ok("multi: 3 notes across 2 models", mNotes.length === 3 && new Set(mNotes.map((r) => r[0])).size === 2);
  const midSet = new Set(Object.keys(mModels).map(Number));
  ok("multi: every note.mid exists in models", mNotes.every((r) => midSet.has(r[0])));
  const mCards = rows(M.db, "SELECT did FROM cards");
  ok("multi: cards reference 2 distinct decks", new Set(mCards.map((r) => r[0])).size === 2);
  ok("multi: each model's did maps to a real deck", Object.values(mModels).every((m) => mDecks[String(m.did)]));

  [C, S, C2, E, M].forEach((x) => { try { x.db && x.db.close(); } catch (_) {} });
  console.log("\nsmoke:anki-apkg-client — " + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
