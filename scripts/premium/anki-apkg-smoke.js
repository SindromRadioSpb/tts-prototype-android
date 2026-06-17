"use strict";
// ── smoke:anki-apkg — golden gate for lib/ankiApkg.js (⑤ Anki-sync brick A1) ───────────────────────────
// Builds a small deck → unzips the .apkg → opens collection.anki2 → asserts the legacy Anki schema, note
// fields/csum/sfld, GUID idempotency (stable across rebuilds), and card generation. Pure Node; no Anki.
//
// Run: npm run smoke:anki-apkg

const fs = require("fs");
const os = require("os");
const path = require("path");
const sqlite3 = require("sqlite3");
const JSZip = require("jszip");
const anki = require("../../lib/ankiApkg");

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? "  — " + extra : "")); }
}

function get(db, sql) {
  return new Promise((resolve, reject) => db.get(sql, (e, r) => (e ? reject(e) : resolve(r))));
}
function all(db, sql) {
  return new Promise((resolve, reject) => db.all(sql, (e, r) => (e ? reject(e) : resolve(r))));
}

const FIELD_NAMES = ["UID", "Prompt", "Answer", "Hebrew", "HebrewNiqqud", "Russian", "Root", "Binyan", "PealimId", "Context"];
const TEMPLATES = [{
  Name: "SRS Card",
  Front: "<div>{{Prompt}}</div>",
  Back: "{{Prompt}}<hr>{{Answer}}<div>{{Hebrew}}</div><div>{{Context}}</div>",
}];
const CSS = ".card{font-family:Arial;}";

function sampleNotes() {
  return [
    { fields: ["1001", "дом", "בַּיִת", "בית", "בַּיִת", "дом", "בית", "", "1234", "זה הבית שלי · это мой дом"], tags: ["lp", "lp_srs", "lp_srs_card_1001"] },
    { fields: ["1002", "писать", "כָּתַב", "כתב", "כָּתַב", "писать", "כתב", "paal", "5678", ""], tags: ["lp", "lp_srs", "lp_srs_card_1002"] },
    { fields: ["1003", "<b>царь</b>", "מֶלֶךְ", "מלך", "מֶלֶךְ", "царь", "מלך", "", "", ""], tags: ["lp"] },
  ];
}

function buildSpec(notes) {
  return { deckName: "LinguistPro::SRS::A1", modelName: "LinguistPro SRS Card v1", fieldNames: FIELD_NAMES, templates: TEMPLATES, css: CSS, notes };
}

async function openApkg(buf) {
  const zip = await JSZip.loadAsync(buf);
  ok("zip contains collection.anki2", !!zip.file("collection.anki2"));
  ok("zip contains media map", !!zip.file("media"));
  const mediaJson = zip.file("media") ? JSON.parse(await zip.file("media").async("string")) : null;
  ok("media map is valid JSON (empty for text-first v1)", mediaJson && typeof mediaJson === "object");
  const dbBytes = await zip.file("collection.anki2").async("nodebuffer");
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lp-apkg-smoke-")), "collection.anki2");
  fs.writeFileSync(tmp, dbBytes);
  return { db: new sqlite3.Database(tmp), tmp };
}

(async () => {
  console.log("smoke:anki-apkg — .apkg builder golden gate\n");

  // 0) the shared core's pure-JS SHA-1 must be byte-equal to Node crypto (Anki dupe-detection relies on
  // a correct csum). Verify across ASCII / Hebrew / Cyrillic / empty.
  const crypto = require("crypto");
  for (const s of ["1001", "", "shalom", "בַּיִת", "царь מלך", "<b>x</b>[sound:a.mp3]"]) {
    const nodeHex = crypto.createHash("sha1").update(s, "utf8").digest("hex");
    ok("pure-JS sha1Hex === crypto sha1  (" + JSON.stringify(s).slice(0, 18) + ")", anki.sha1Hex(s) === nodeHex, "got " + anki.sha1Hex(s));
  }

  // 1) build + structural assertions
  const notes = sampleNotes();
  const buf = await anki.buildApkg(buildSpec(notes));
  ok("buildApkg returns a non-empty Buffer", Buffer.isBuffer(buf) && buf.length > 0, "len=" + (buf && buf.length));

  const { db, tmp } = await openApkg(buf);
  try {
    const col = await get(db, "SELECT * FROM col WHERE id=1");
    ok("col row exists", !!col);
    ok("col.ver === 11 (legacy importable schema)", col && col.ver === 11, col && "ver=" + col.ver);
    const models = JSON.parse(col.models), decks = JSON.parse(col.decks), conf = JSON.parse(col.conf);
    const mid = Object.keys(models)[0];
    ok("model name matches", models[mid].name === "LinguistPro SRS Card v1");
    ok("model has all 10 fields in order", models[mid].flds.length === FIELD_NAMES.length && models[mid].flds.every((f, i) => f.name === FIELD_NAMES[i]));
    ok("model has 1 template with qfmt/afmt", models[mid].tmpls.length === 1 && /\{\{Prompt\}\}/.test(models[mid].tmpls[0].qfmt));
    ok("model.req references the Prompt field ord", Array.isArray(models[mid].req) && models[mid].req[0][2].includes(1));
    ok("deck name present", Object.values(decks).some((d) => d.name === "LinguistPro::SRS::A1"));
    ok("conf.curModel points at the model", String(conf.curModel) === String(mid));

    const noteRows = await all(db, "SELECT * FROM notes ORDER BY id");
    ok("note count === sample count", noteRows.length === notes.length, noteRows.length + " vs " + notes.length);
    // fields joined by \x1f, count matches
    ok("note flds use US separator with all fields", noteRows[0].flds.split("\x1f").length === FIELD_NAMES.length);
    // csum correctness for the first note (first field "1001")
    ok("note csum === fieldChecksum(firstField)", noteRows[0].csum === anki.fieldChecksum("1001"), "csum=" + noteRows[0].csum);
    // sfld strips HTML (note #3 first field is "<b>царь</b>"? no — first field is UID "1003"); test sfld strip on a html field via a direct call
    ok("stripHtmlMedia removes tags + [sound:]", anki.stripHtmlMedia("<b>x</b>[sound:a.mp3]y") === "xy");
    // guid stable + deterministic
    ok("guid is the stable guid of the first field", noteRows[0].guid === anki.stableGuid("1001"));
    ok("guids are unique across notes", new Set(noteRows.map((n) => n.guid)).size === noteRows.length);

    const cardRows = await all(db, "SELECT * FROM cards ORDER BY id");
    ok("card count === notes × templates", cardRows.length === notes.length * TEMPLATES.length);
    ok("all cards are NEW (type=0, queue=0)", cardRows.every((c) => c.type === 0 && c.queue === 0));
    ok("each card links a real note", cardRows.every((c) => noteRows.some((n) => n.id === c.nid)));
    ok("cards target the LP deck id", cardRows.every((c) => c.did === anki.LP_DECK_ID));
  } finally {
    await new Promise((r) => db.close(() => r()));
    try { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); } catch (_) {}
  }

  // 2) idempotency: rebuilding the SAME logical cards yields the SAME guids → Anki updates, not dupes
  const buf2 = await anki.buildApkg(buildSpec(sampleNotes()));
  const { db: db2, tmp: tmp2 } = await openApkg(buf2);
  try {
    const g1 = (await all(db2, "SELECT guid FROM notes ORDER BY id")).map((r) => r.guid);
    const expected = sampleNotes().map((n) => anki.stableGuid(n.fields[0]));
    ok("rebuild → identical, stable guids (idempotent re-import)", JSON.stringify(g1) === JSON.stringify(expected), JSON.stringify(g1));
  } finally {
    await new Promise((r) => db2.close(() => r()));
    try { fs.rmSync(path.dirname(tmp2), { recursive: true, force: true }); } catch (_) {}
  }

  // 3) empty deck must still build a valid collection
  const bufEmpty = await anki.buildApkg(buildSpec([]));
  const { db: db3, tmp: tmp3 } = await openApkg(bufEmpty);
  try {
    const n = await get(db3, "SELECT COUNT(*) AS c FROM notes");
    ok("empty deck builds a valid collection (0 notes)", n.c === 0);
  } finally {
    await new Promise((r) => db3.close(() => r()));
    try { fs.rmSync(path.dirname(tmp3), { recursive: true, force: true }); } catch (_) {}
  }

  console.log("\nsmoke:anki-apkg — " + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
