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
    series: d.series || undefined, // BRR-P0-004 A — chapter membership (null for standalone)
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

// ── chaptering (BRR-P0-004 A) ─────────────────────────────────────────────────
// A long work becomes a multi-part "work" (→ its own shelf = table of contents)
// ONLY when it has CLEAR chapter structure. Empirically, Ben-Yehuda Hebrew prose
// marks chapters with a lone Hebrew-letter numeral line (א / ב / …), an Arabic/roman
// numeral line, or an asterisk separator (***) — NOT the word פרק. A long but
// UNSTRUCTURED work (an essay/story) is NOT chaptered (arbitrary splits would lie
// about structure — R7); it stays a single text unless it's huge, in which case it
// is split into neutral "Часть N" parts at paragraph boundaries to stay tractable.
const _CH_HEB_NUM = /^[א-ת](?:['׳"״]?[א-ת]){0,2}$/;           // lone Hebrew-letter numeral: א, יא, ט״ו
const _CH_HEB_TITLED = /^([א-ת](?:['׳"״]?[א-ת]){0,2})\s*[.:]\s*(.+)$/; // "א: <title>"
const _CH_ARABIC = /^\d{1,3}\s*[.:]?$/;
const _CH_ROMAN = /^[IVXLCM]{1,7}\s*[.:]?$/i;
const _CH_STARS = /^[*•־—–\-\s]{3,}$|^\*(\s*\*){0,3}$/;        // *** / * * * / — — —
function _chapterMarker(line) {
  const t = String(line == null ? "" : line).trim();
  if (!t || t.length > 48) return null;
  let m;
  if ((m = _CH_HEB_TITLED.exec(t))) return { kind: "num", label: m[1], title: m[2].trim() };
  if (_CH_HEB_NUM.test(t)) return { kind: "num", label: t, title: "" };
  if (_CH_ARABIC.test(t)) return { kind: "num", label: t.replace(/[.:]\s*$/, ""), title: "" };
  if (_CH_ROMAN.test(t)) return { kind: "num", label: t.replace(/[.:]\s*$/, ""), title: "" };
  if (_CH_STARS.test(t)) return { kind: "sep", label: "", title: "" };
  return null;
}
// Detect chapters; returns [{title, body}] (≥2) or null when not clearly structured.
function detectChapters(body) {
  const lines = String(body == null ? "" : body).replace(/\r\n?/g, "\n").split("\n");
  const numB = [], sepB = [];
  for (let i = 0; i < lines.length; i++) {
    const prevBlank = i === 0 || !lines[i - 1].trim();
    if (!prevBlank) continue; // a marker must open a block (preceded by a blank line)
    const mk = _chapterMarker(lines[i]);
    if (!mk) continue;
    (mk.kind === "sep" ? sepB : numB).push({ idx: i, ...mk });
  }
  // Prefer NUMBERED chapters (א/ב, 1/2, I/II) when present — asterisk separators are
  // usually intra-chapter scene breaks, so they're boundaries only when there is no
  // numbering at all (a work divided solely by ***).
  const bounds = numB.length >= 2 ? numB : (sepB.length >= 2 ? sepB : null);
  if (!bounds) return null;
  const out = [];
  // front-matter before the first marker (dedication/preface) — keep it (R1: lose nothing)
  const front = lines.slice(0, bounds[0].idx).join("\n").trim();
  if (stripNiqqud(front).length > 150) out.push({ title: "Вступление", body: front });
  let seq = 0;
  for (let b = 0; b < bounds.length; b++) {
    const seg = lines.slice(bounds[b].idx + 1, b + 1 < bounds.length ? bounds[b + 1].idx : lines.length).join("\n").trim();
    if (!stripNiqqud(seg).length) continue; // skip an empty separator-only segment
    seq++;
    const mk = bounds[b];
    const title = mk.title ? (mk.label ? mk.label + ". " + mk.title : mk.title)
      : (mk.kind === "sep" ? "Часть " + seq : "Глава " + (mk.label || seq));
    out.push({ title, body: seg });
  }
  return out.length >= 2 ? out : null;
}
function _splitByParagraphs(body, targetChars) {
  const paras = String(body == null ? "" : body).replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const parts = []; let cur = []; let curLen = 0;
  for (const p of paras) { cur.push(p); curLen += stripNiqqud(p).length; if (curLen >= targetChars && cur.length) { parts.push(cur.join("\n\n")); cur = []; curLen = 0; } }
  if (cur.length) parts.push(cur.join("\n\n"));
  return parts;
}
// Decide how a work is materialised. Returns { mode, chapters:[{title,body}] }.
//   mode 'chapters' — real chapter structure (→ work shelf, titled chapters)
//   mode 'parts'    — huge & unstructured (→ work shelf, neutral "Часть N")
//   mode 'single'   — one text (short, or long-but-unstructured under the ceiling)
function chapterizeWork(body, opts) {
  const o = opts || {};
  const plain = stripNiqqud(body).length;
  // Length gate (owner: chapter only LONG works) — short works stay single even if they
  // have ≥2 marker-like lines (poem stanza numerals / refrains are NOT chapters — R7).
  const minCh = o.minChapter != null ? o.minChapter : 12000;
  if (plain <= minCh) return { mode: "single", chapters: [{ title: null, body }] };
  const ch = detectChapters(body);
  if (ch && ch.length >= 2) return { mode: "chapters", chapters: ch };
  const ceiling = o.partCeiling || 50000;
  if (plain > ceiling) {
    const parts = _splitByParagraphs(body, o.partTarget || 12000);
    if (parts.length >= 2) return { mode: "parts", chapters: parts.map((b, i) => ({ title: "Часть " + (i + 1), body: b })) };
  }
  return { mode: "single", chapters: [{ title: null, body }] };
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
  detectChapters, chapterizeWork,
  corpusFromRow,
  buildBundleRows,
  buildTextItem,
  buildLibraryJson, buildManifest,
  validateLibrary,
};
