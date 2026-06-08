"use strict";

// scripts/premium/lib/benyehuda.js — BRR-P0-004 pure helpers (no I/O, no sidecar).
//
// The orchestrator (scripts/premium/ingest-benyehuda.js) does the I/O (fetch CSV
// + txt, call translateTable, write ZIP). Everything DETERMINISTIC and testable
// lives here so smoke:benyehuda-ingest can exercise it with inline fixtures and
// zero network. Reuses the shipped contracts (corpusMeta / shelfMeta / translit)
// — all pure Node modules.
//
// Verified live pseudocatalogue.csv header (github.com/projectbenyehuda/
// public_domain_dump master, 2026-03 release):
//   ID,path,title,authors,translators,author_uris,translator_uris,
//   original_language,genre,source_edition
// Path scheme: txt{path}.txt (path like /p46/m16). Public URL: benyehuda.org/read/<ID>.

const corpusMeta = require("../../../db/premium/corpusMeta");
const shelfMeta = require("../../../db/premium/shelfMeta");
const { transliterateWithProfile } = require("../../../db/premium/translit");

// Canonical Hebrew niqqud + cantillation range — identical to the rest of the
// codebase (corpusMeta.js:89, build-notes-from-bundle.js:57). Reused, not reinvented.
const NIQQUD_RE = /[֑-ׇ]/g;

function nfc(s) { return String(s == null ? "" : s).normalize("NFC"); }
function hasNiqqud(s) { NIQQUD_RE.lastIndex = 0; return NIQQUD_RE.test(String(s == null ? "" : s)); }
function stripNiqqud(s) { return nfc(s).replace(NIQQUD_RE, "").trim(); }
function cleanField(v) { const s = v == null ? "" : String(v).trim(); return s.length ? s : null; }

// ── RFC-4180 CSV parser ──────────────────────────────────────────────────────
// No csv dependency in the repo (deps = adm-zip/archiver/jszip only); the dump's
// CSV is well-formed RFC-4180. Handles double-quoted fields, embedded commas,
// escaped "" quotes, embedded newlines inside quotes, and UTF-8 Hebrew. Strips a
// leading UTF-8 BOM. Returns { header: string[], rows: Array<Object> } keyed by header.
function parseCsv(text) {
  let src = String(text == null ? "" : text);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1); // strip BOM
  const records = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  let i = 0;
  const n = src.length;
  let started = false; // whether the current record has any content yet
  while (i < n) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; started = true; i++; continue; }
    if (c === ",") { record.push(field); field = ""; started = true; i++; continue; }
    if (c === "\r") { i++; continue; } // normalize CRLF → LF
    if (c === "\n") {
      record.push(field); field = "";
      // drop a fully-empty trailing line
      if (started || record.length > 1 || record[0] !== "") records.push(record);
      record = []; started = false; i++; continue;
    }
    field += c; started = true; i++;
  }
  // flush last field/record (file may not end with newline)
  if (started || field.length || record.length) { record.push(field); records.push(record); }
  if (!records.length) return { header: [], rows: [] };
  const header = records[0].map((h) => String(h || "").trim());
  const rows = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    if (rec.length === 1 && rec[0] === "") continue; // skip blank lines
    const obj = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = rec[c] != null ? rec[c] : "";
    rows.push(obj);
  }
  return { header, rows };
}

// ── genre cleaner ────────────────────────────────────────────────────────────
// The dump's `genre` column is an i18n MISS: literal "Translation missing: he.poetry".
// The real token is the suffix after "he.". Pass-through other values; null when empty.
const GENRE_MISS_RE = /^Translation missing:\s*he\.(.+)$/i;
function cleanGenre(raw) {
  const s = cleanField(raw);
  if (!s) return null;
  const m = GENRE_MISS_RE.exec(s);
  return m ? m[1].trim() : s;
}

// ── first Wikidata QID from a (possibly multi-value) URI cell ─────────────────
function firstQid(uris) {
  const s = cleanField(uris);
  if (!s) return null;
  const m = /https?:\/\/(?:www\.)?wikidata\.org\/wiki\/Q\d+/i.exec(s);
  return m ? m[0] : null;
}

// ── Project Ben-Yehuda attribution footer stripper ────────────────────────────
// Each txt ends with a volunteer/attribution block, e.g.
//   "את הטקסט[ים] לעיל הפיקו מתנדבי פרויקט בן־יהודה … https://benyehuda.org/read/16"
// It must NOT enter the body, segments, content_hash or source_text. Cut from the
// start of the LINE that first carries an anchor to EOF. Returns { body, footer }.
const FOOTER_ANCHORS = [
  /הפיקו\s+(?:את\s+)?(?:ה?טקסט|המקור)/, // "produced the text/source"
  /מתנדבי\s+פרויקט\s+בן/,                // "volunteers of Project Ben-(Yehuda)"
  /https?:\/\/(?:www\.)?benyehuda\.org\/read\//,
];
function stripFooter(text) {
  const src = String(text == null ? "" : text).replace(/\r\n?/g, "\n");
  let cut = -1;
  for (const re of FOOTER_ANCHORS) {
    re.lastIndex = 0;
    const m = re.exec(src);
    if (m && (cut === -1 || m.index < cut)) cut = m.index;
  }
  if (cut === -1) return { body: src.trim(), footer: "" };
  // back up to the start of the line containing the anchor
  const lineStart = src.lastIndexOf("\n", cut) + 1;
  return { body: src.slice(0, lineStart).trim(), footer: src.slice(lineStart).trim() };
}

// ── per-work auto-select classifier (R6/R7/R8) ────────────────────────────────
// The CSV has no track/register/era/themes — those are curatorial. For the
// AUTO-SELECT pilot we derive HONEST provisional values from genre + shape +
// author; unknown era → null (validateCorpus WARNS, never errors). Real curation
// (manifest) replaces this at bulk.
const POETRY_GENRES = new Set(["poetry", "poem", "poems", "song", "songs", "שירה", "שיר"]);
const CHILDREN_GENRES = new Set(["children", "child", "kids", "ילדים"]);
// Tiny canonical-author → era map (Hebrew-name substring match). Deliberately
// small + honest; anyone not listed gets era=null (warning, not error).
const ERA_BY_AUTHOR = [
  [/ביאליק/, "tehiya"],          // Bialik
  [/טשרניחובסקי|צ'רניחובסקי/, "tehiya"], // Chernichovsky
  [/אחד\s*העם/, "tehiya"],       // Ahad Ha'am
  [/ברדיצ'בסקי|ברדיצ׳בסקי/, "tehiya"],
  [/פרישמן/, "tehiya"],
  [/גורדון/, "haskalah"],        // Y.L. Gordon
  [/מנדלי|אברמוביץ/, "haskalah"], // Mendele
  [/סמולנסקין/, "haskalah"],
  [/מאפו/, "haskalah"],
];
function eraForAuthor(author) {
  const a = String(author || "");
  for (const [re, era] of ERA_BY_AUTHOR) { if (re.test(a)) return era; }
  return null;
}
// Decide track/register/segmentation/era from cleaned genre + measured shape.
// `shape` = { lineCount, charCount }. Short poetry/children → accessible/poetic;
// everything else → literary. Returns curatorial fields for buildCorpus + the
// segmentation hint.
function classifyWork({ genre, author, shape }) {
  const g = (cleanGenre(genre) || "").toLowerCase();
  const lineCount = (shape && shape.lineCount) || 0;
  const charCount = (shape && shape.charCount) || 0;
  const isPoetry = POETRY_GENRES.has(g);
  const isChildren = CHILDREN_GENRES.has(g);
  const short = lineCount > 0 && lineCount <= 40 && charCount <= 1800;
  const accessible = (isPoetry && short) || isChildren;
  return {
    track: accessible ? "accessible" : "literary",
    register: isPoetry ? "poetic" : "literary",
    segmentation: isPoetry ? "lines" : "sentences",
    era: eraForAuthor(author),
  };
}

// ── map one CSV row (+ derived fields) → buildCorpus input → validated corpus ──
// `derived` = { content_hash, track, register, era, themes, orig_language?, audio_status }.
// Honesty: translator set but no orig_language is REJECTED here (loudly) rather
// than letting buildCorpus default to 'he' (which validateCorpus would then error).
function corpusFromRow(csvRow, derived) {
  const d = derived || {};
  const translator = cleanField(csvRow.translators);
  let origLang = cleanField(d.orig_language) || cleanField(csvRow.original_language);
  if (translator && !origLang) {
    throw new Error(
      "byehuda_id " + (csvRow.ID || "?") + ": translated work (translators set) has no original_language — " +
      "supply orig_language in curation to avoid an R1 'orig_language=he' lie"
    );
  }
  const sourceEdition = cleanField(csvRow.source_edition);
  const input = {
    byehuda_id: cleanField(csvRow.ID),
    content_hash: cleanField(d.content_hash),
    author: cleanField(csvRow.authors),
    author_uri: firstQid(csvRow.author_uris),
    translator,
    translator_uri: firstQid(csvRow.translator_uris),
    orig_language: origLang || undefined, // undefined → buildCorpus honest 'he' default
    era: cleanField(d.era) || undefined,
    genre: cleanGenre(csvRow.genre) || undefined,
    themes: Array.isArray(d.themes) ? d.themes : [],
    register: cleanField(d.register) || undefined,
    track: cleanField(d.track) || undefined,
    difficulty: null, // BRR-P1-007
    provenance: {
      source: "Project Ben-Yehuda",
      url: csvRow.ID ? "https://benyehuda.org/read/" + cleanField(csvRow.ID) : undefined,
      license: "public-domain",
      reviewer: cleanField(d.reviewer) || undefined,
      reviewed_at: cleanField(d.reviewed_at) || undefined,
    },
    attribution: "Текст: Проект Бен-Йехуда" + (sourceEdition ? ". Издание: " + sourceEdition : ""),
    review_status: cleanField(d.review_status) || undefined, // → honest 'machine' default
    audio_status: cleanField(d.audio_status) || "none",       // text-only pilot
  };
  return corpusMeta.buildCorpus(input);
}

// ── translateTable rows → bundle rows (R1 source-first niqqud merge) ───────────
// For each row: if the SOURCE segment carried niqqud, keep the AUTHENTIC niqqud
// and recompute translit/translit_ru from it (never overwrite real vowels with a
// machine guess). If unvocalized, keep the pipeline's Dicta niqqud + its translits.
// hebrew_plain is always the niqqud-stripped source (content_hash stays
// niqqud-insensitive). `translit` is injectable for offline unit-testing.
function buildBundleRows(translatedRows, opts) {
  const o = opts || {};
  const translit = o.transliterate || transliterateWithProfile;
  const makeRowId = o.makeRowId || ((i) => "r" + i);
  return (Array.isArray(translatedRows) ? translatedRows : []).map((r, i) => {
    const srcHasNiqqud = hasNiqqud(r.he);
    let heNiqqud, tlit, tlitRu;
    if (srcHasNiqqud) {
      heNiqqud = nfc(r.he).trim();
      tlit = translit(heNiqqud, "sbl") || r.translit || "";
      tlitRu = translit(heNiqqud, "ru-phonetic") || r.translit_ru || "";
    } else {
      heNiqqud = r.he_niqqud || "";
      tlit = r.translit || "";
      tlitRu = r.translit_ru || "";
    }
    return {
      row_id: makeRowId(i),
      order_index: i,
      hebrew_plain: stripNiqqud(r.he),
      hebrew_niqqud: heNiqqud,
      translit: tlit,
      translit_ru: tlitRu,
      russian: r.ru || "",
      edit_meta: null,
      note: "",
      note_updated_at: null,
      audio_asset_key: null,
    };
  });
}

// ── assemble one bundle text item (mirrors local-db.js export shape) ───────────
function buildTextItem({ textId, textKey, title, corpus, rows, sourceText, createdAt }) {
  const ts = createdAt || "2026-06-08T00:00:00.000Z";
  const tags = [corpus && corpus.genre, corpus && corpus.era].filter(Boolean);
  return {
    text_id: textId,
    text_key: textKey,
    title: title || "",
    level: null,
    tags,
    source_label: "Project Ben-Yehuda",
    topic: null,
    source_text: sourceText || "",
    // canonical corpus home is source_meta.corpus, with a first-class top-level mirror
    source_meta: { origin: "benyehuda-ingest", imported_at: ts, corpus },
    corpus,
    table_model_meta: null,
    rows,
    text_audio_asset_key: null,
    created_at: ts,
    updated_at: ts,
    is_archived: false,
  };
}

// ── assemble library.json + manifest (the v2.1 bundle shapes the importers read) ─
function buildLibraryJson({ texts, shelves }) {
  return {
    schema_version: 1,
    corpus_meta_version: corpusMeta.CORPUS_META_VERSION,
    shelves: Array.isArray(shelves) ? shelves : [],
    texts: Array.isArray(texts) ? texts : [],
    audio_assets: [],
  };
}
function buildManifest({ textCount, rowCount, noteCount, createdAt }) {
  return {
    export_schema_version: 2,
    app_id: "linguist-pro-web",
    created_at: createdAt || "2026-06-08T00:00:00.000Z",
    partial_backup: false,
    text_count: textCount || 0,
    row_count: rowCount || 0,
    note_count: noteCount || 0,
    audio_count: 0,
    missing_audio_count: 0,
    library_json_path: "library/library.json",
    missing_audio_path: "metadata/missing_audio.json",
  };
}

// ── R1 gate over an assembled library.json (mirror build-notes-from-bundle.js) ─
// Returns { ok, errors:[{text_id|slug, errors[]}], warnings:[...], classes } —
// classes is a PASS/SUSPECT/FAIL tally for the QA report.
function validateLibrary(lib) {
  const errors = [];
  const warnings = [];
  const classes = { PASS: 0, SUSPECT: 0, FAIL: 0 };
  const texts = (lib && Array.isArray(lib.texts)) ? lib.texts : [];
  const byKey = {};
  for (const t of texts) {
    const corpus = corpusMeta.getCorpus(t);
    byKey[t.text_key] = t;
    if (!corpus) { classes.FAIL++; errors.push({ text_id: t.text_id, errors: ["no corpus metadata"] }); continue; }
    const v = corpusMeta.validateCorpus(corpus);
    if (!v.ok) { classes.FAIL++; errors.push({ text_id: t.text_id, errors: v.errors }); }
    else if (v.warnings && v.warnings.length) { classes.SUSPECT++; for (const w of v.warnings) warnings.push({ text_id: t.text_id, warning: w }); }
    else classes.PASS++;
  }
  const shelves = (lib && Array.isArray(lib.shelves)) ? lib.shelves : [];
  for (const sh of shelves) {
    const v = shelfMeta.validateShelf(sh);
    if (!v.ok) errors.push({ slug: sh && sh.slug, errors: v.errors });
    else for (const w of (v.warnings || [])) warnings.push({ slug: sh.slug, warning: w });
    for (const w of shelfMeta.validateMembership(sh, byKey)) warnings.push({ slug: sh.slug, warning: w });
  }
  return { ok: errors.length === 0, errors, warnings, classes };
}

module.exports = {
  NIQQUD_RE,
  nfc, hasNiqqud, stripNiqqud, cleanField,
  parseCsv,
  cleanGenre,
  firstQid,
  stripFooter,
  eraForAuthor, classifyWork,
  corpusFromRow,
  buildBundleRows,
  buildTextItem,
  buildLibraryJson, buildManifest,
  validateLibrary,
};
