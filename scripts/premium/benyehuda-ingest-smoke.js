#!/usr/bin/env node
"use strict";

// benyehuda-ingest-smoke.js — BRR-P0-004 offline gate (no network, no sidecar).
// Exercises the pure ingestion helpers (scripts/premium/lib/benyehuda.js) with
// inline fixtures: CSV parse (quoted Hebrew, embedded comma, "" escape), genre
// clean, footer strip, source-first niqqud merge, corpus mapping (incl. the new
// Wikidata URI anchors + translated-work R1 guard), bundle v2.1 shape, and the
// R1 honesty gate over an assembled library.json (incl. shelf membership).

const by = require("./lib/benyehuda");
const corpusMeta = require("../../db/premium/corpusMeta");
const shelfMeta = require("../../db/premium/shelfMeta");

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log("[benyehuda-ingest-smoke] BRR-P0-004 ingestion pipeline (offline)");

// ── fixtures: the VERIFIED live header + tricky rows ──────────────────────────
const CSV = [
  "ID,path,title,authors,translators,author_uris,translator_uris,original_language,genre,source_edition",
  // poetry, embedded comma in title (quoted), "" escape in source_edition, Gordon → haskalah era
  '16,/p46/m16,"שיר, קצר",יהודה ליב גורדון,"",https://wikidata.org/wiki/Q1376036,"","",Translation missing: he.poetry,"מתוך ""כתבי גורדון"", דביר 1959"',
  // prose, Mendele (haskalah), no edition
  "20,/p1/m20,פרק ארוך,מנדלי מוכר ספרים,\"\",https://wikidata.org/wiki/Q310739,\"\",\"\",Translation missing: he.prose,\"\"",
  // translated from Russian (Tolstoy → Frishman), original_language=ru
  "30,/p2/m30,סיפור מתורגם,טולסטוי,דוד פרישמן,https://wikidata.org/wiki/Q7243,https://wikidata.org/wiki/Q133032,ru,Translation missing: he.prose,\"\"",
].join("\n");

// ── 1) CSV parser ─────────────────────────────────────────────────────────────
const parsed = by.parseCsv(CSV);
test("parseCsv reads the verified header", eq(parsed.header, ["ID", "path", "title", "authors", "translators", "author_uris", "translator_uris", "original_language", "genre", "source_edition"]));
test("parseCsv reads 3 data rows", parsed.rows.length === 3);
const r16 = parsed.rows[0], r20 = parsed.rows[1], r30 = parsed.rows[2];
test("quoted field with embedded comma preserved", r16.title === "שיר, קצר", r16.title);
test('escaped "" quote unescaped in source_edition', r16.source_edition === 'מתוך "כתבי גורדון", דביר 1959', r16.source_edition);
test("empty quoted field → empty string", r16.translators === "");
test("translated row keeps original_language", r30.original_language === "ru");

// ── 2) genre clean + firstQid ─────────────────────────────────────────────────
test('cleanGenre strips "Translation missing: he."', by.cleanGenre(r16.genre) === "poetry", by.cleanGenre(r16.genre));
test("cleanGenre passes through a plain token", by.cleanGenre("essay") === "essay");
test("cleanGenre empty → null", by.cleanGenre("") === null);
test("firstQid extracts the QID URL", by.firstQid(r16.author_uris) === "https://wikidata.org/wiki/Q1376036");
test("firstQid empty → null", by.firstQid("") === null);

// ── 3) footer strip ───────────────────────────────────────────────────────────
const rawTxt = [
  "לִידִידִי הָרַב",
  "שׁוּרָה שְׁנִיָּה",
  "",
  "את הטקסט לעיל הפיקו מתנדבי פרויקט בן־יהודה באינטרנט. הכל זמין תמיד בכתובת הבאה:https://benyehuda.org/read/16",
].join("\n");
const { body, footer } = by.stripFooter(rawTxt);
test("stripFooter removes the BY attribution block", !/מתנדבי/.test(body) && !/benyehuda\.org\/read/.test(body));
test("stripFooter keeps the real body", /לִידִידִי/.test(body) && /שׁוּרָה שְׁנִיָּה/.test(body));
test("stripFooter captures the footer separately", /מתנדבי/.test(footer));
// content_hash must be computed over the footer-stripped body only
const hBody = corpusMeta.computeContentHash([by.stripNiqqud(body)]);
const hWithFooter = corpusMeta.computeContentHash([by.stripNiqqud(rawTxt)]);
test("content_hash excludes the footer", hBody !== hWithFooter);

// ── 4) auto-select classifier ─────────────────────────────────────────────────
const cPoemShort = by.classifyWork({ genre: r16.genre, author: r16.authors, shape: { lineCount: 12, charCount: 300 } });
test("short poetry → accessible/poetic/lines", cPoemShort.track === "accessible" && cPoemShort.register === "poetic" && cPoemShort.segmentation === "lines");
test("Gordon → haskalah era", cPoemShort.era === "haskalah");
const cProse = by.classifyWork({ genre: r20.genre, author: r20.authors, shape: { lineCount: 200, charCount: 12000 } });
test("long prose → literary/sentences", cProse.track === "literary" && cProse.register === "literary" && cProse.segmentation === "sentences");
test("Mendele → haskalah era", cProse.era === "haskalah");
const cUnknownAuthor = by.classifyWork({ genre: "Translation missing: he.prose", author: "מחבר לא ידוע", shape: { lineCount: 50, charCount: 4000 } });
test("unknown author → era null (honest, validator warns not errors)", cUnknownAuthor.era === null);

// ── 5) source-first niqqud merge (R1) ─────────────────────────────────────────
const stubTranslit = (s, p) => (p === "sbl" ? "sbl(" + s + ")" : "ru(" + s + ")");
const translated = [
  // source vocalized → keep authentic niqqud, recompute translit from source
  { he: "שָׁלוֹם", he_niqqud: "machine-niqqud", translit: "machine-sbl", translit_ru: "machine-ru", ru: "мир" },
  // source plain → keep pipeline Dicta niqqud + its translits
  { he: "בית", he_niqqud: "בַּיִת", translit: "bayit", translit_ru: "байт", ru: "дом" },
];
const rows = by.buildBundleRows(translated, { transliterate: stubTranslit });
test("vocalized row keeps AUTHENTIC source niqqud", rows[0].hebrew_niqqud === "שָׁלוֹם", rows[0].hebrew_niqqud);
test("vocalized row recomputes translit from source", rows[0].translit === "sbl(שָׁלוֹם)" && rows[0].translit_ru === "ru(שָׁלוֹם)");
test("vocalized row hebrew_plain is niqqud-stripped", rows[0].hebrew_plain === "שלום", rows[0].hebrew_plain);
test("plain row keeps Dicta niqqud", rows[1].hebrew_niqqud === "בַּיִת");
test("plain row keeps Dicta translits", rows[1].translit === "bayit" && rows[1].translit_ru === "байт");
test("plain row hebrew_plain unchanged", rows[1].hebrew_plain === "בית");
test("bundle row has the canonical export field names", eq(Object.keys(rows[0]).sort(), ["audio_asset_key", "edit_meta", "hebrew_niqqud", "hebrew_plain", "note", "note_updated_at", "order_index", "row_id", "russian", "translit", "translit_ru"]));
// real translit module is actually wired (no stub) → non-empty for vocalized text
const realRows = by.buildBundleRows([{ he: "שָׁלוֹם", he_niqqud: "", ru: "мир" }]);
test("real transliterateWithProfile produces a non-empty translit", typeof realRows[0].translit === "string" && realRows[0].translit.length > 0, realRows[0].translit);

// ── 6) corpus mapping (CSV row → buildCorpus) ─────────────────────────────────
const corp16 = by.corpusFromRow(r16, { ...cPoemShort, content_hash: hBody, audio_status: "none" });
test("byehuda_id ← ID", corp16.byehuda_id === "16");
test("author ← authors (raw Hebrew display)", corp16.author === "יהודה ליב גורדון");
test("author_uri ← author_uris QID", corp16.author_uri === "https://wikidata.org/wiki/Q1376036");
test("genre cleaned in corpus", corp16.genre === "poetry");
test("provenance.url = benyehuda.org/read/<ID>", corp16.provenance.url === "https://benyehuda.org/read/16");
test("source_edition composed into attribution", /Издание: מתוך "כתבי גורдон"/.test(corp16.attribution) || /Издание: מתוך/.test(corp16.attribution), corp16.attribution);
test("audio_status honest 'none' (text-only pilot)", corp16.audio_status === "none");
test("review_status honest default 'machine'", corp16.review_status === "machine");
test("author_slug null (no latin in CSV; never fabricated)", corp16.author_slug === null);
test("track/register/era from classifier", corp16.track === "accessible" && corp16.register === "poetic" && corp16.era === "haskalah");
test("corpus16 validates clean (R1 gate)", corpusMeta.validateCorpus(corp16).ok);

// translated work WITH original_language → validates (translator + orig=ru)
const corp30 = by.corpusFromRow(r30, { track: "literary", register: "literary", content_hash: hBody, audio_status: "none" });
test("translated work carries orig_language=ru", corp30.orig_language === "ru");
test("translated work carries translator + translator_uri", corp30.translator === "דוד פרישמן" && corp30.translator_uri === "https://wikidata.org/wiki/Q133032");
test("translated work validates (R1 ok)", corpusMeta.validateCorpus(corp30).ok);

// translated work WITHOUT original_language → producer throws (R1 pre-flight)
let threw = false;
try { by.corpusFromRow({ ID: "99", authors: "x", translators: "מתרגם", original_language: "", author_uris: "", translator_uris: "", genre: "", source_edition: "" }, { content_hash: hBody }); }
catch (_) { threw = true; }
test("translated work w/o orig_language → hard error (no silent 'he' lie)", threw);

// ── 7) bundle assembly + shape ────────────────────────────────────────────────
const t16 = by.buildTextItem({ textId: "t16", textKey: "key16", title: r16.title, corpus: corp16, rows, sourceText: body });
test("text item top-level corpus === source_meta.corpus", eq(t16.corpus, t16.source_meta.corpus));
test("text item tags derived from corpus", eq(t16.tags, ["poetry", "haskalah"]));
const shelf = shelfMeta.buildShelf({ slug: "pilot-accessible", title: "Доступная (пилот)", track: "accessible", era: "haskalah", genre: "poetry", editorial_intro: "Короткие стихи для начала.", items: ["key16"] });
const lib = by.buildLibraryJson({ texts: [t16], shelves: [shelf] });
test("library.json carries corpus_meta_version=1 (v2.1 marker)", lib.corpus_meta_version === 1);
test("library.json shape (schema_version/texts/shelves/audio_assets)", lib.schema_version === 1 && Array.isArray(lib.texts) && Array.isArray(lib.shelves) && Array.isArray(lib.audio_assets));
const manifest = by.buildManifest({ textCount: 1, rowCount: rows.length, noteCount: 0 });
test("manifest points at library/library.json", manifest.library_json_path === "library/library.json");

// ── 8) R1 gate over the assembled library ─────────────────────────────────────
const gate = by.validateLibrary(lib);
test("validateLibrary: clean library passes", gate.ok, JSON.stringify(gate.errors));
test("validateLibrary: classifies the text (PASS/SUSPECT)", (gate.classes.PASS + gate.classes.SUSPECT) === 1 && gate.classes.FAIL === 0);
test("validateLibrary: clean shelf membership (no dangling)", !gate.warnings.some((w) => /not found in this bundle/.test(w.warning || "")));

// a deliberately-lying corpus must FAIL the gate
const lyingText = by.buildTextItem({ textId: "tbad", textKey: "kbad", title: "x", corpus: { ...corp16, review_status: "вычитано" }, rows, sourceText: body });
const lyingLib = by.buildLibraryJson({ texts: [lyingText], shelves: [] });
const lyingGate = by.validateLibrary(lyingLib);
test("validateLibrary: lying corpus (review_status) → FAIL", lyingGate.ok === false && lyingGate.classes.FAIL >= 1);

// dangling shelf member → membership warning (not silent)
const danglingShelf = shelfMeta.buildShelf({ slug: "pilot-x", title: "x", track: "accessible", items: ["does-not-exist"], editorial_intro: "i" });
const danglingLib = by.buildLibraryJson({ texts: [t16], shelves: [danglingShelf] });
const danglingGate = by.validateLibrary(danglingLib);
test("validateLibrary: dangling shelf member → warning, still ok", danglingGate.ok && danglingGate.warnings.some((w) => /not found in this bundle/.test(w.warning || "")));

// ── summary ───────────────────────────────────────────────────────────────────
console.log("\n[benyehuda-ingest-smoke] " + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
