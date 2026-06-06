#!/usr/bin/env node
"use strict";

// anki-wordcard-smoke.js — R-1 (Anki card content v2: rich WORD cards).
//
// Verifies the PURE field assembly + conjugation HTML for the new word-card
// export WITHOUT a live Anki (serviceWorkers blocked, no AnkiConnect):
//   • v3AnkiBuildWordCardFields (pure) populates every field; Conjugation is
//     trusted self-HTML containing .v3-conj- markup + the highlighted cell and
//     NO onclick= (stripped for Anki); Example = the learner's own sentence.
//   • verb (full paradigm) + noun (s/p) cases render a table; a function word
//     with no paradigm yields Conjugation='' (R1 — never fabricate).
//   • the resolve path (saveLemmaInflection → getCanonicalWordNotesForText →
//     v3AnkiResolveParadigm) returns a POS-compatible paradigm + text example.
//   • the model's templates reference only fields that exist (no "missing
//     field" AnkiConnect error) and the builder returns exactly those fields.
//
// Headless OPFS init is best-effort — if it can't initialize, DB cases SKIP
// (the pure-builder cases still run, since they need no DB).

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3257;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (c) => logs.push("[out] " + String(c).trim()));
  child.stderr.on("data", (c) => logs.push("[err] " + String(c).trim()));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const tm = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(tm); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGKILL");
}
async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[anki-wordcard-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) { console.error("[anki-wordcard-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[anki-wordcard-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      const out = {};
      out.hasBuild = typeof window.v3AnkiBuildWordCardFields === "function";
      out.hasConj = typeof window.v3AnkiConjHtml === "function";
      out.hasResolve = typeof window.v3AnkiResolveParadigm === "function";
      out.hasSpec = typeof window.v3AnkiWordModelSpec === "function";
      if (!out.hasBuild || !out.hasSpec) return out;

      // ── R-3.0a identity tag: lp_note_<localNoteId> stamped per word card ──
      out.hasTags = typeof window.v3AnkiWordCardTags === "function";
      if (out.hasTags) {
        const tg = window.v3AnkiWordCardTags("550e8400-e29b-41d4-a716-446655440000", "lp_text_t1", "My Title");
        out.tag_lpNote = tg.includes("lp_note_550e8400-e29b-41d4-a716-446655440000");
        out.tag_core = tg.includes("linguistpro") && tg.includes("lp_word") && tg.includes("lp_text_t1");
        out.tag_noEmpty = tg.every((x) => x !== "");                 // empty entries filtered
        out.tag_oneLpNote = tg.filter((x) => x.indexOf("lp_note_") === 0).length === 1;
        const tg2 = window.v3AnkiWordCardTags("", "lp_text_t1", ""); // no id, no title
        out.tag_noIdNoTag = !tg2.some((x) => x.indexOf("lp_note_") === 0) && tg2.includes("untitled");
      }

      // ── Pure-builder cases (no DB) ──────────────────────────────────────
      const verbParadigm = {
        kind: "verb", pos: "verb", binyan: "paal", root: "כתב", lemma: "כתב", pealim_id: "P1",
        cells: {
          "AP-ms": { he: "כּוֹתֵב", translit: "kotev", translit_html: "ko<b class=\"v3-conj-stress\">tev</b>" },
          "AP-fs": { he: "כּוֹתֶבֶת", translit: "kotevet", translit_html: "ko<b class=\"v3-conj-stress\">te</b>vet" },
          "PERF-3ms": { he: "כָּתַב", translit: "katav", translit_html: "ka<b class=\"v3-conj-stress\">tav</b>" },
        },
      };
      const verbNote = { body_json: JSON.stringify({
        word: "כותב", niqqud_variant: "כּוֹתֵב", root: "כתב", lemma: "כתב",
        pos: "verb", binyan: "paal", meaning: "пишет", mnemonic: "корень К-Т-В",
      }) };
      const exampleHe = "אֲנִי כּוֹתֵב מִכְתָּב";
      const exampleRu = "Я пишу письмо";
      const exampleStr = exampleHe + " — " + exampleRu;
      const fA = window.v3AnkiBuildWordCardFields(verbNote, { paradigm: verbParadigm, example: exampleStr });
      out.A_fieldsPopulated = !!(fA.Word && fA.Niqqud && fA.Russian && fA.Root && fA.Binyan && fA.POS && fA.Mnemonic);
      out.A_conjMarkup = /v3-conj-/.test(fA.Conjugation);
      out.A_highlight = /v3-conj-cell-hl/.test(fA.Conjugation);
      out.A_noOnclick = !/onclick=/.test(fA.Conjugation);
      out.A_stressRed = /v3-conj-stress/.test(fA.Conjugation);
      out.A_example = fA.Example === exampleStr;       // no &<> → escape is identity
      out.A_translit = fA.Translit === "kotev";        // from the highlighted cell
      out.A_audioEmpty = fA.Audio === "";
      out.A_fields = fA;

      // Noun (s/p) — declines, highlighted singular.
      const nounParadigm = {
        kind: "noun", pos: "noun", binyan: "", root: "ספר", lemma: "סֵפֶר", pealim_id: "P2",
        cells: {
          "s": { he: "סֵפֶר", translit: "sefer", translit_html: "se<b class=\"v3-conj-stress\">fer</b>" },
          "p": { he: "סְפָרִים", translit: "sfarim", translit_html: "sfa<b class=\"v3-conj-stress\">rim</b>" },
        },
      };
      const nounNote = { body_json: JSON.stringify({
        word: "ספר", niqqud_variant: "סֵפֶר", root: "ספר", lemma: "סֵפֶר",
        pos: "noun", binyan: "", meaning: "книга", mnemonic: "",
      }) };
      const fC = window.v3AnkiBuildWordCardFields(nounNote, { paradigm: nounParadigm, example: "" });
      out.C_conjMarkup = /v3-conj-/.test(fC.Conjugation);
      out.C_highlight = /v3-conj-cell-hl/.test(fC.Conjugation);
      out.C_exampleEmpty = fC.Example === "";
      out.C_mnemonicEmpty = fC.Mnemonic === "";

      // Function word — no paradigm → Conjugation omitted (R1).
      const funcNote = { body_json: JSON.stringify({
        word: "כבר", niqqud_variant: "כְּבָר", root: "", lemma: "כבר",
        pos: "adverb", binyan: "", meaning: "уже", mnemonic: "",
      }) };
      const fD = window.v3AnkiBuildWordCardFields(funcNote, { paradigm: null, example: "" });
      out.D_noTable = fD.Conjugation === "";
      out.D_wordPopulated = fD.Word === "כבר" && fD.Russian === "уже";

      // Escaping: a meaning with HTML-special chars is escaped, table is not.
      const xssNote = { body_json: JSON.stringify({ word: "<b>", niqqud_variant: "", meaning: "a & b <c>", pos: "noun" }) };
      const fX = window.v3AnkiBuildWordCardFields(xssNote, { paradigm: null, example: "x <y> & z" });
      out.X_escWord = fX.Word === "&lt;b&gt;";
      out.X_escMeaning = fX.Russian === "a &amp; b &lt;c&gt;";
      out.X_escExample = fX.Example === "x &lt;y&gt; &amp; z";

      // ── R-1.5/1.7 audio + stacked example: headword [sound:], example = he line /
      //    ru line / ▶ on its own line (no dash). ──
      const fAud = window.v3AnkiBuildWordCardFields(verbNote, {
        paradigm: verbParadigm, exampleHe, exampleRu,
        headwordAudioFile: "lp_head.mp3", exampleAudioFile: "lp_ex.mp3",
      });
      out.Aud_headSound = fAud.Audio === "[sound:lp_head.mp3]";
      out.Aud_exStacked = /<div dir="rtl"[^>]*>אֲנִי כּוֹתֵב מִכְתָּב<\/div>/.test(fAud.Example)
        && /<div dir="ltr"[^>]*>Я пишу письмо<\/div>/.test(fAud.Example)
        && !/ — /.test(fAud.Example)                       // dash dropped
        && /<br>\[sound:lp_ex\.mp3\]$/.test(fAud.Example);  // ▶ on its own third line
      // No audio files → Audio empty (front uses the {{tts}} fallback), example clean.
      out.Aud_noneEmpty = fA.Audio === "" && !/\[sound:/.test(fA.Example);

      // ── Model spec: every template field-ref exists; builder keys == fields ─
      const spec = window.v3AnkiWordModelSpec();
      const refs = new Set();
      const re = /\{\{[#\/^]?([A-Za-z0-9_]+)\}\}/g;
      let m;
      const tpl = String(spec.front || "") + "\n" + String(spec.back || "");
      while ((m = re.exec(tpl)) !== null) { if (m[1] !== "FrontSide") refs.add(m[1]); }
      const fieldSet = new Set(spec.fields);
      out.specRefsCovered = [...refs].every((rf) => fieldSet.has(rf));
      out.specRefsMissing = [...refs].filter((rf) => !fieldSet.has(rf));
      const builderKeys = Object.keys(fA).sort().join(",");
      out.specBuilderKeysMatch = builderKeys === [...spec.fields].sort().join(",");
      out.specHasConjRef = refs.has("Conjugation") && /v3-conj-cell-hl/.test(spec.css) && /#D55E00/.test(spec.css);
      // R-1.5 hybrid audio: file when present, else device {{tts}} on the Hebrew Word.
      out.specTtsFallback = /\{\{tts /.test(spec.front) && /\{\{\^Audio\}\}/.test(spec.front) && /\{\{tts he_IL:Word\}\}/.test(spec.front);

      // ── R-2: live upsert/dedup logic via a FAKE AnkiConnect (no running Anki) ──
      // The __v3AnkiConnectMock seam lets us drive canAddNotes/addNotes/findNotes/
      // updateNoteFields/changeDeck deterministically and assert the branch logic.
      const makeMock = (cfg) => {
        const calls = [];
        const fn = async (action, params) => {
          calls.push({ action, params: params || {} });
          if (Object.prototype.hasOwnProperty.call(cfg, action)) {
            return (typeof cfg[action] === "function") ? cfg[action](params || {}) : cfg[action];
          }
          if (action === "canAddNotes") return ((params && params.notes) || []).map(() => true);
          if (action === "addNotes") return ((params && params.notes) || []).map((_, i) => 1000 + i);
          if (action === "findNotes") return [];
          if (action === "notesInfo") return ((params && params.notes) || []).map((id) => ({ noteId: id, cards: [id * 10] }));
          return null;
        };
        fn._calls = calls;
        return fn;
      };
      const buildNotes = (n) => Array.from({ length: n }, (_, i) => ({
        deckName: "D", modelName: "M",
        fields: { Word: "w" + i, Audio: "[sound:lp_" + i + ".mp3]" },
        options: {}, tags: ["linguistpro", "lp_word"],
      }));

      // U1 — mix: 1 new + 2 existing → 1 created, 2 updated-in-place (+audio) + changeDeck.
      {
        const mock = makeMock({ canAddNotes: [true, false, false], addNotes: (p) => p.notes.map((_, i) => 2000 + i), findNotes: () => [555] });
        window.__v3AnkiConnectMock = mock;
        const r = await window.v3AnkiUpsertWordNotes(buildNotes(3), "D");
        window.__v3AnkiConnectMock = null;
        const upd = mock._calls.filter((c) => c.action === "updateNoteFields");
        out.U1_created = r.created === 1;
        out.U1_updated = r.updated === 2;
        out.U1_updateCalled = upd.length === 2;
        out.U1_updateHasAudio = upd.length > 0 && /\[sound:/.test(JSON.stringify(upd[0].params.note.fields));
        out.U1_changeDeck = mock._calls.some((c) => c.action === "changeDeck");
        out.U1_addCalled = mock._calls.some((c) => c.action === "addNotes");
      }
      // U2 — all existing → updated only, nothing created.
      {
        const mock = makeMock({ canAddNotes: [false, false], findNotes: () => [777] });
        window.__v3AnkiConnectMock = mock;
        const r = await window.v3AnkiUpsertWordNotes(buildNotes(2), "D");
        window.__v3AnkiConnectMock = null;
        out.U2_ok = r.created === 0 && r.updated === 2;
      }
      // U3 — all new → created only, no updateNoteFields.
      {
        const mock = makeMock({ canAddNotes: [true, true], addNotes: (p) => p.notes.map((_, i) => i + 1) });
        window.__v3AnkiConnectMock = mock;
        const r = await window.v3AnkiUpsertWordNotes(buildNotes(2), "D");
        window.__v3AnkiConnectMock = null;
        out.U3_ok = r.created === 2 && !mock._calls.some((c) => c.action === "updateNoteFields");
      }
      // D1 — dedup index-bug regression: all-duplicate freshOnly batch recreates N (was 0).
      {
        const mock = makeMock({ canAddNotes: [false, false, false], addNotes: (p) => p.notes.map((_, i) => 9000 + i) });
        window.__v3AnkiConnectMock = mock;
        const r = await window.v3AnkiAddNotesWithDedup(buildNotes(3), "D", { freshOnly: true }, { frontField: "Word" });
        window.__v3AnkiConnectMock = null;
        out.D1_recreated = r.created === 3; // idx bug → 0 before the note-object fix
      }

      // ── DB / resolve path (best-effort) ─────────────────────────────────
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) {
        try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {}
        try { const l = await window.ensureLocalDB(); if (l && typeof l.getCanonicalWordNotesForText === "function") ldb = l; } catch (_) {}
        if (!ldb) await new Promise((r) => setTimeout(r, 500));
      }
      if (!ldb) { out.dbSkipped = true; return out; }

      const T = "T_ANKIWC";
      const PEALIM_MODEL = "pealim-infl-v12"; // MUST equal V3_PEALIM_INFL_MODEL in index.html
      try {
        const old = await ldb.dbQuery("SELECT DISTINCT note_id FROM note_occurrences WHERE text_id = ?", [T]);
        for (const o of (old || [])) { try { await ldb.deleteNoteById(o.note_id); } catch (_) {} }
        await ldb.dbRun("DELETE FROM sentences WHERE id = ?", ["S_ANKIWC"]);
        await ldb.dbRun("DELETE FROM texts WHERE id = ?", [T]);
        await ldb.dbRun("DELETE FROM lemma_inflection WHERE lemma = ? AND model_version = ?", ["כתב", PEALIM_MODEL]);
      } catch (_) {}

      await ldb.dbRun("INSERT INTO texts (id, text_key, title, source_text) VALUES (?,?,?,?)",
        [T, "tk_ankiwc", "Anki WC fixture", "src"]);
      await ldb.dbRun("INSERT INTO sentences (id, text_id, order_index, he_plain, he_niqqud, ru) VALUES (?,?,?,?,?,?)",
        ["S_ANKIWC", T, 0, "אני כותב מכתב", "אֲנִי כּוֹתֵב מִכְתָּב", "Я пишу письмо"]);
      await ldb.saveLemmaInflection("כתב", "paal", "verb", "verb", PEALIM_MODEL, verbParadigm, "pealim", "P1");

      const note = await ldb.createCanonicalNote({
        gen_dedup_key: "pid:ANKIWC_kotev", source: "auto", confidence: 0.9, model_version: "v", user_touched: 0,
        title: "כותב",
        body: { word: "כותב", niqqud_variant: "כּוֹתֵב", root: "כתב", lemma: "כתב", pos: "verb", binyan: "paal", meaning: "пишет", mnemonic: "корень К-Т-В" },
      });
      await ldb.addNoteOccurrence(note.id, { text_id: T, sentence_id: "S_ANKIWC", word_offset: 0, surface: "כותב" });

      const rows = await ldb.getCanonicalWordNotesForText(T);
      out.dbRowCount = (rows || []).length;
      const row = (rows || [])[0];
      out.dbHasRow = !!row;
      out.dbExample = row && /Я пишу письмо/.test(String(row.example || ""));
      let bodyParsed = {}; try { bodyParsed = JSON.parse(row.body_json); } catch (_) {}
      const resolved = await window.v3AnkiResolveParadigm(bodyParsed);
      out.dbResolved = !!(resolved && resolved.cells && Object.keys(resolved.cells).length);
      const fDb = window.v3AnkiBuildWordCardFields(row, { paradigm: resolved, example: row.example, exampleHe: row.example_he, exampleRu: row.example_ru });
      out.dbConjNonEmpty = /v3-conj-cell-hl/.test(fDb.Conjugation) && !/onclick=/.test(fDb.Conjugation);
      out.dbExampleInCard = /Я пишу письмо/.test(fDb.Example);
      // R-1.5 — read-fn exposes example_audio_key (string; '' here since no sentence audio seeded).
      out.dbExampleAudioKeyField = row && typeof row.example_audio_key === "string";

      // cleanup
      try { await ldb.deleteNoteById(note.id); } catch (_) {}
      try {
        await ldb.dbRun("DELETE FROM sentences WHERE id = ?", ["S_ANKIWC"]);
        await ldb.dbRun("DELETE FROM texts WHERE id = ?", [T]);
        await ldb.dbRun("DELETE FROM lemma_inflection WHERE lemma = ? AND model_version = ?", ["כתב", PEALIM_MODEL]);
      } catch (_) {}
      return out;
    });

    test("window exports present (build/conj/resolve/spec)", R.hasBuild && R.hasConj && R.hasResolve && R.hasSpec,
      JSON.stringify({ b: R.hasBuild, c: R.hasConj, r: R.hasResolve, s: R.hasSpec }));

    // R-3.0a identity tag
    test("tags: v3AnkiWordCardTags exported", R.hasTags === true);
    test("tags: stamps lp_note_<localNoteId>", R.tag_lpNote === true);
    test("tags: keeps core tags (linguistpro/lp_word/lp_text_)", R.tag_core === true);
    test("tags: no empty tag entries", R.tag_noEmpty === true);
    test("tags: exactly one lp_note_ tag", R.tag_oneLpNote === true);
    test("tags: no id → no lp_note_ tag + untitled fallback", R.tag_noIdNoTag === true);

    // verb pure-builder
    test("verb: all card fields populated", R.A_fieldsPopulated === true, JSON.stringify(R.A_fields));
    test("verb: Conjugation has .v3-conj- markup", R.A_conjMarkup === true);
    test("verb: highlighted cell (.v3-conj-cell-hl)", R.A_highlight === true);
    test("verb: NO onclick= in Conjugation (stripped for Anki)", R.A_noOnclick === true);
    test("verb: stress markup preserved (.v3-conj-stress)", R.A_stressRed === true);
    test("verb: Example = the learner's own sentence", R.A_example === true);
    test("verb: Translit taken from the highlighted cell", R.A_translit === true, R.A_fields && R.A_fields.Translit);
    test("verb: Audio empty when no file (front uses {{tts}} fallback)", R.A_audioEmpty === true);

    // R-1.5 audio
    test("audio: headword file → Audio=[sound:..]", R.Aud_headSound === true);
    test("audio: stacked example (he / ru / ▶, no dash)", R.Aud_exStacked === true);
    test("audio: no files → Audio='' + clean Example", R.Aud_noneEmpty === true);

    // noun
    test("noun: Conjugation table renders", R.C_conjMarkup === true);
    test("noun: singular form highlighted", R.C_highlight === true);
    test("noun: empty Example/Mnemonic stay empty", R.C_exampleEmpty === true && R.C_mnemonicEmpty === true);

    // function word
    test("function word: Conjugation='' (R1 — no fabricated table)", R.D_noTable === true);
    test("function word: Word/meaning still populated", R.D_wordPopulated === true);

    // escaping
    test("escaping: Word/meaning/example HTML-escaped", R.X_escWord && R.X_escMeaning && R.X_escExample,
      JSON.stringify({ w: R.X_escWord, m: R.X_escMeaning, e: R.X_escExample }));

    // model spec
    test("model: every template field-ref exists in the model", R.specRefsCovered === true, JSON.stringify(R.specRefsMissing));
    test("model: builder returns exactly the model's fields", R.specBuilderKeysMatch === true);
    test("model: Conjugation field + inlined conj CSS (hl + stress #D55E00)", R.specHasConjRef === true);
    test("model: hybrid audio front ({{^Audio}} → {{tts he_IL:Word}})", R.specTtsFallback === true);

    // R-2 live upsert/dedup (mocked AnkiConnect)
    test("upsert: mix → 1 created + 2 updated", R.U1_created === true && R.U1_updated === true);
    test("upsert: existing cards updated in place (updateNoteFields ×2)", R.U1_updateCalled === true);
    test("upsert: updated card carries the audio [sound:]", R.U1_updateHasAudio === true);
    test("upsert: updated cards moved to target deck (changeDeck)", R.U1_changeDeck === true);
    test("upsert: all-existing → updated only (0 created)", R.U2_ok === true);
    test("upsert: all-new → created only (no updateNoteFields)", R.U3_ok === true);
    test("dedup: all-duplicate freshOnly recreates N (idx-bug regression)", R.D1_recreated === true);

    // DB resolve path
    if (R.dbSkipped) console.log("  · DB/resolve cases skipped (headless OPFS)");
    else {
      test("resolve: getCanonicalWordNotesForText returns the note", R.dbHasRow === true && R.dbRowCount === 1, String(R.dbRowCount));
      test("resolve: example pulled from the learner's text", R.dbExample === true);
      test("resolve: paradigm resolved (POS-compatible, by root)", R.dbResolved === true);
      test("resolve: built card has table (hl) + no onclick", R.dbConjNonEmpty === true);
      test("resolve: example carried into the card", R.dbExampleInCard === true);
      test("resolve: read-fn exposes example_audio_key", R.dbExampleAudioKeyField === true);
    }

    test("no pageerror on index.html", errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[anki-wordcard-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
