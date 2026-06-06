#!/usr/bin/env node
"use strict";

// notes-roundtrip-smoke.js — R-3.6 notes integrity.
//
// Verifies, headless (OPFS), WITHOUT network:
//   Fix 1 — lossless advanced-notes round-trip:
//     • export carries provenance (source/user_touched/gen_dedup_key) + a new
//       `occurrences` array.
//     • import preserves provenance AND restores note_occurrences (canonical
//       notes regain their position) — was dropped before (everything became
//       source='user', gen_dedup_key=NULL, position-less).
//     • re-import of the same bundle merges by gen_dedup_key (no duplicate
//       canonical note).
//   Fix 2 — autogen guard: with a user note already at a position, the auto-build
//     does NOT add an auto occurrence there (no «✍ Ваши»+«✨ Авто» dup).
//   Fix 3 — dedupeUserAutoNotes sweep: a seeded user+auto pair → dryRun reports 1;
//     run removes the user note, keeps the auto note; no pair → 0 (no-op).

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3261;
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
  catch (e) { console.error("[notes-roundtrip-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) { console.error("[notes-roundtrip-smoke] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[notes-roundtrip-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      const out = {};
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) {
        try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {}
        try { const l = await window.ensureLocalDB(); if (l && typeof l.exportBundle === "function" && typeof l.dedupeUserAutoNotes === "function") ldb = l; } catch (_) {}
        if (!ldb) await new Promise((rr) => setTimeout(rr, 500));
      }
      if (!ldb) { out.dbSkipped = true; return out; }

      const now = new Date().toISOString();
      const uuid = () => crypto.randomUUID();
      // cleanup any leftovers from a prior run
      const DK = "RT_dedup_kotev#verb";
      try {
        const ex = await ldb.dbQuery("SELECT id FROM notes_v2 WHERE gen_dedup_key = ?", [DK]);
        for (const e of (ex || [])) await ldb.deleteNoteById(e.id);
        await ldb.dbRun("DELETE FROM texts WHERE id = ?", ["RT_T"]);
        await ldb.dbRun("DELETE FROM sentences WHERE id = ?", ["RT_S"]);
      } catch (_) {}

      // ── seed: a text + sentence + a CANONICAL auto note + its occurrence ──
      await ldb.dbRun("INSERT INTO texts (id, text_key, title, source_text) VALUES (?,?,?,?)", ["RT_T", "rt_key", "RT fixture", "src"]);
      await ldb.dbRun("INSERT INTO sentences (id, text_id, order_index, he_plain, ru) VALUES (?,?,?,?,?)", ["RT_S", "RT_T", 0, "כתב", "написал"]);
      const canon = await ldb.createCanonicalNote({
        gen_dedup_key: DK, source: "auto", confidence: 0.9, model_version: "v", user_touched: 0,
        title: "כתב", body: { word: "כתב", lemma: "כתב", pos: "verb", meaning: "написал" },
      });
      await ldb.addNoteOccurrence(canon.id, { text_id: "RT_T", sentence_id: "RT_S", word_offset: 0, surface: "כתב" });

      // ── Fix 1a — export carries provenance + occurrences ──
      const bundle = await ldb.exportBundle({ textIds: ["RT_T"] });
      const adv = bundle.notes_advanced || {};
      const expNote = (adv.notes || []).find((n) => n.gen_dedup_key === DK);
      out.E_noteProvenance = !!expNote && expNote.source === "auto" && Number(expNote.user_touched) === 0 && !expNote.text_id;
      out.E_hasOccurrences = Array.isArray(adv.occurrences) && adv.occurrences.some((o) => o.note_id === canon.id && o.word_offset === 0);

      // ── Fix 1b — fresh import preserves provenance + restores occurrence ──
      // Delete the seeded note + text so import RE-CREATES them (fresh-insert path).
      await ldb.deleteNoteById(canon.id);
      await ldb.dbRun("DELETE FROM texts WHERE id = ?", ["RT_T"]);
      await ldb.dbRun("DELETE FROM sentences WHERE id = ?", ["RT_S"]);
      out.preImportCanon = (await ldb.dbQuery("SELECT COUNT(*) AS n FROM notes_v2 WHERE gen_dedup_key = ?", [DK]))[0].n;
      await ldb.importBundle(bundle, { mode: "skip" });
      const imp = (await ldb.dbQuery("SELECT id, source, user_touched, gen_dedup_key FROM notes_v2 WHERE gen_dedup_key = ?", [DK]));
      out.I_provenancePreserved = imp.length === 1 && imp[0].source === "auto" && Number(imp[0].user_touched) === 0;
      const impId = imp[0] && imp[0].id;
      const occ = impId ? (await ldb.dbQuery("SELECT COUNT(*) AS n FROM note_occurrences WHERE note_id = ?", [impId]))[0].n : 0;
      out.I_occurrenceRestored = Number(occ) >= 1;

      // ── Fix 1c — re-import merges by dedup key (no duplicate canonical note) ──
      await ldb.importBundle(bundle, { mode: "skip" });
      out.I_noDupOnReimport = (await ldb.dbQuery("SELECT COUNT(*) AS n FROM notes_v2 WHERE gen_dedup_key = ?", [DK]))[0].n === 1;

      // cleanup imported copies (could be multiple texts from re-imports)
      try {
        for (const e of (await ldb.dbQuery("SELECT id FROM notes_v2 WHERE gen_dedup_key = ?", [DK]) || [])) await ldb.deleteNoteById(e.id);
      } catch (_) {}

      // ── Fix 2 — autogen guard: user note at a position blocks the auto occ ──
      {
        const S = "RT_S2";
        try { await ldb.dbRun("INSERT INTO texts (id, text_key, title, source_text) VALUES (?,?,?,?)", ["RT_T2", "rt_key2", "RT2", "src"]); } catch (_) {}
        try { await ldb.dbRun("INSERT INTO sentences (id, text_id, order_index, he_plain, ru) VALUES (?,?,?,?,?)", [S, "RT_T2", 0, "טוב", "хорошо"]); } catch (_) {}
        // seed a USER inline word note at S:0
        await ldb.dbRun(
          `INSERT INTO notes_v2 (id,target_kind,target_id,text_id,note_type,title,body_json,source,user_touched,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [uuid(), "word", S + ":0", "RT_T2", "word_study", "", JSON.stringify({ word: "טוב" }), "user", 1, now, now]);
        out.guard_findUser = !!(await ldb.findUserWordNoteAt("RT_T2", S, 0));
        out.guard_findUserMiss = !(await ldb.findUserWordNoteAt("RT_T2", S, 5));
        // run the autogen persist with a candidate occurrence AT S:0
        const cand = { dedup_key: "RT_guard_tov#adj", confidence: 0.9, body: { word: "טוב", lemma: "טוב", pos: "adjective" },
                       occurrences: [{ text_id: "RT_T2", sentence_id: S, word_offset: 0, surface: "טוב" }] };
        const res = await window.v3NotesAutoGenPersist([cand], { source: "curated" });
        out.guard_skipped = res && res.occurrences_skipped_user >= 1 && res.occurrences_recorded === 0;
        // cleanup
        try { for (const e of (await ldb.dbQuery("SELECT id FROM notes_v2 WHERE text_id='RT_T2' OR gen_dedup_key='RT_guard_tov#adj'") || [])) await ldb.deleteNoteById(e.id); } catch (_) {}
        try { await ldb.dbRun("DELETE FROM texts WHERE id='RT_T2'"); await ldb.dbRun("DELETE FROM sentences WHERE id=?", [S]); } catch (_) {}
      }

      // ── Fix 3 — sweep: user+auto pair at the same position ──
      {
        const S = "RT_S3";
        try { await ldb.dbRun("INSERT INTO texts (id, text_key, title, source_text) VALUES (?,?,?,?)", ["RT_T3", "rt_key3", "RT3", "src"]); } catch (_) {}
        try { await ldb.dbRun("INSERT INTO sentences (id, text_id, order_index, he_plain, ru) VALUES (?,?,?,?,?)", [S, "RT_T3", 0, "רע", "плохо"]); } catch (_) {}
        const userId = uuid();
        await ldb.dbRun(
          `INSERT INTO notes_v2 (id,target_kind,target_id,text_id,note_type,title,body_json,source,user_touched,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [userId, "word", S + ":0", "RT_T3", "word_study", "", JSON.stringify({ word: "רע" }), "user", 1, now, now]);
        const cn = await ldb.createCanonicalNote({ gen_dedup_key: "RT_sweep_ra#adj", source: "auto", user_touched: 0, title: "רע", body: { word: "רע", lemma: "רע", pos: "adjective" } });
        await ldb.addNoteOccurrence(cn.id, { text_id: "RT_T3", sentence_id: S, word_offset: 0, surface: "רע" });
        const dry = await ldb.dedupeUserAutoNotes({ dryRun: true });
        out.sweep_dryPairs = dry && dry.ok && dry.pairs >= 1;
        const run = await ldb.dedupeUserAutoNotes({ dryRun: false });
        out.sweep_removed = run && run.removed >= 1;
        out.sweep_userGone = (await ldb.dbQuery("SELECT COUNT(*) AS n FROM notes_v2 WHERE id = ?", [userId]))[0].n === 0;
        out.sweep_autoKept = (await ldb.dbQuery("SELECT COUNT(*) AS n FROM notes_v2 WHERE id = ?", [cn.id]))[0].n === 1;
        const dry2 = await ldb.dedupeUserAutoNotes({ dryRun: true });
        out.sweep_noopAfter = dry2 && dry2.pairs === 0;
        // cleanup
        try { await ldb.deleteNoteById(cn.id); await ldb.dbRun("DELETE FROM texts WHERE id='RT_T3'"); await ldb.dbRun("DELETE FROM sentences WHERE id=?", [S]); } catch (_) {}
      }

      // ── R-3.7 — full-backup state round-trip (srs_cards + review_events +
      //    anki_word_exports + events + translation_overrides + text settings/progress) ──
      {
        const DK = "RT37_full_kotev#verb", TK = "rt37_key", HEH = "RT37_hehash";
        // cleanup leftovers
        try {
          for (const e of (await ldb.dbQuery("SELECT id FROM notes_v2 WHERE gen_dedup_key = ?", [DK]) || [])) await ldb.deleteNoteById(e.id);
          for (const t of (await ldb.dbQuery("SELECT id FROM texts WHERE text_key = ?", [TK]) || [])) await ldb.dbRun("DELETE FROM texts WHERE id = ?", [t.id]);
          await ldb.dbRun("DELETE FROM anki_word_exports WHERE deck_name = 'RT37'");
          await ldb.dbRun("DELETE FROM translation_overrides WHERE he_hash = ?", [HEH]);
          await ldb.dbRun("DELETE FROM events WHERE source = 'anki' AND event_type = 'srs_review' AND payload_json LIKE '%RT37%'");
        } catch (_) {}

        // seed: text (pinned + mastered + progress) + sentence + canonical note +
        // srs_card (review/reps + anki_managed) + review_event + anki_word_export +
        // anki review event + translation_override.
        await ldb.dbRun("INSERT INTO texts (id, text_key, title, source_text, is_pinned, pin_order, manual_smart_tag) VALUES (?,?,?,?,?,?,?)",
          ["RT37_T", TK, "RT37", "src", 1, 5, "mastered"]);
        await ldb.dbRun("INSERT INTO sentences (id, text_id, order_index, he_plain, ru) VALUES (?,?,?,?,?)", ["RT37_S", "RT37_T", 0, "כתב", "написал"]);
        await ldb.setProgress("RT37_T", { last_row_idx: 7, last_step_id: "step-x" });
        const note = await ldb.createCanonicalNote({ gen_dedup_key: DK, source: "auto", user_touched: 0, title: "כתב", body: { word: "כתב", lemma: "כתב", pos: "verb" } });
        await ldb.addNoteOccurrence(note.id, { text_id: "RT37_T", sentence_id: "RT37_S", word_offset: 0, surface: "כתב" });
        const card = await ldb.srs.createCardFromNote(note.id);
        await ldb.dbRun("UPDATE srs_cards SET state='review', reps=9, interval_days=30, ease_factor=2.6, due_date='2099-01-01', meta_json=? WHERE id=?",
          [JSON.stringify({ anki_managed: true, anki: { type: 2 } }), card.id]);
        await ldb.dbRun("INSERT INTO srs_review_events (id, card_id, rating, interval_before, interval_after, reviewed_at) VALUES (?,?,?,?,?,?)",
          [uuid(), card.id, 3, 10, 30, "2023-11-20T00:00:00.000Z"]);
        await ldb.recordAnkiWordExports([{ note_id: note.id, deck_name: "RT37", model_name: "M", body_json: (await ldb.dbQuery("SELECT body_json FROM notes_v2 WHERE id=?", [note.id]))[0].body_json }]);
        await ldb.dbRun("INSERT INTO events (id, ts, event_type, entity_type, entity_id, note_id, source, payload_json) VALUES (?,?,?,?,?,?,?,?)",
          [uuid(), "2023-11-20T00:00:00.000Z", "srs_review", "note", note.id, note.id, "anki", JSON.stringify({ grade: 3, tag: "RT37" })]);
        await ldb.dbRun("INSERT INTO translation_overrides (id, he_hash, he, ru, target_lang) VALUES (?,?,?,?,?)",
          [uuid(), HEH, "כתב", "написал (исправлено)", "ru"]);

        // export (full library so all state sections ride along)
        const bundle = await ldb.exportBundle({ textIds: ["RT37_T"] });
        const adv = bundle.notes_advanced || {};
        out.FS_exportV2 = adv.schema_version === 2 && /v2/.test(String(adv.format || ""));
        out.FS_exportSrs = (adv.srs_cards || []).some((c) => c.id === card.id)
          && (adv.srs_review_events || []).some((e) => e.card_id === card.id)
          && (adv.anki_word_exports || []).some((w) => w.note_id === note.id)
          && (adv.events || []).some((e) => e.note_id === note.id && e.source === "anki")
          && (adv.translation_overrides || []).some((t) => t.he_hash === HEH);
        const expText = (bundle.texts || bundle.library.texts || []).find((t) => t.text_key === TK);
        out.FS_exportText = !!expText && expText.is_pinned === 1 && expText.manual_smart_tag === "mastered"
          && expText.progress && expText.progress.last_row_idx === 7;

        // wipe the seeded entities, then import
        await ldb.deleteNoteById(note.id);                  // cascades occurrences
        try { await ldb.dbRun("DELETE FROM srs_cards WHERE id=?", [card.id]); } catch (_) {}  // cascades review_events
        await ldb.dbRun("DELETE FROM anki_word_exports WHERE note_id=?", [note.id]);
        await ldb.dbRun("DELETE FROM events WHERE note_id=?", [note.id]);
        await ldb.dbRun("DELETE FROM translation_overrides WHERE he_hash=?", [HEH]);
        await ldb.dbRun("DELETE FROM texts WHERE id='RT37_T'");
        await ldb.dbRun("DELETE FROM sentences WHERE id='RT37_S'");

        await ldb.importBundle(bundle, { mode: "skip" });

        // assertions on the restored copy (new ids)
        const nNote = (await ldb.dbQuery("SELECT id, srs_card_id FROM notes_v2 WHERE gen_dedup_key=?", [DK]))[0];
        out.FS_noteBack = !!nNote;
        const nCard = nNote ? (await ldb.dbQuery("SELECT * FROM srs_cards WHERE source_note_id=?", [nNote.id]))[0] : null;
        out.FS_cardRestored = !!nCard && nCard.state === "review" && Number(nCard.reps) === 9;
        out.FS_backlink = !!nCard && !!nNote && nNote.srs_card_id === nCard.id;
        let meta = {}; try { meta = JSON.parse(nCard.meta_json); } catch (_) {}
        out.FS_cardMeta = meta.anki_managed === true;
        out.FS_reviewEvent = !!nCard && (await ldb.dbQuery("SELECT COUNT(*) AS n FROM srs_review_events WHERE card_id=?", [nCard.id]))[0].n >= 1;
        out.FS_ankiExport = !!nNote && (await ldb.dbQuery("SELECT COUNT(*) AS n FROM anki_word_exports WHERE note_id=?", [nNote.id]))[0].n === 1;
        out.FS_event = !!nNote && (await ldb.dbQuery("SELECT COUNT(*) AS n FROM events WHERE note_id=? AND source='anki'", [nNote.id]))[0].n >= 1;
        out.FS_translation = (await ldb.dbQuery("SELECT ru FROM translation_overrides WHERE he_hash=?", [HEH]))[0]?.ru === "написал (исправлено)";
        const nText = (await ldb.dbQuery("SELECT id, is_pinned, manual_smart_tag FROM texts WHERE text_key=?", [TK]))[0];
        out.FS_textSettings = !!nText && Number(nText.is_pinned) === 1 && nText.manual_smart_tag === "mastered";
        const nProg = nText ? (await ldb.dbQuery("SELECT last_row_idx, last_step_id FROM text_progress WHERE text_id=?", [nText.id]))[0] : null;
        out.FS_progress = !!nProg && Number(nProg.last_row_idx) === 7 && nProg.last_step_id === "step-x";

        // re-import idempotency: card count for this note stays 1
        await ldb.importBundle(bundle, { mode: "skip" });
        out.FS_idempotent = nNote && (await ldb.dbQuery("SELECT COUNT(*) AS n FROM srs_cards WHERE source_note_id=?", [nNote.id]))[0].n === 1;

        // v1 back-compat: a bundle WITHOUT the new sections still imports clean
        const v1 = JSON.parse(JSON.stringify(bundle));
        v1.notes_advanced.schema_version = 1; v1.notes_advanced.format = "linguistpro-notes-advanced-v1";
        delete v1.notes_advanced.srs_cards; delete v1.notes_advanced.srs_review_events;
        delete v1.notes_advanced.anki_word_exports; delete v1.notes_advanced.events;
        delete v1.notes_advanced.translation_overrides; delete v1.notes_advanced.srs_attempts;
        delete v1.notes_advanced.srs_card_exports;
        v1.texts = (v1.texts || []).map((t) => ({ ...t, text_key: t.text_key + "_v1" }));
        let v1ok = true; try { await ldb.importBundle(v1, { mode: "skip" }); } catch (_) { v1ok = false; }
        out.FS_v1BackCompat = v1ok;

        // cleanup
        try {
          for (const e of (await ldb.dbQuery("SELECT id FROM notes_v2 WHERE gen_dedup_key = ?", [DK]) || [])) await ldb.deleteNoteById(e.id);
          for (const t of (await ldb.dbQuery("SELECT id FROM texts WHERE text_key LIKE ?", [TK + "%"]) || [])) await ldb.dbRun("DELETE FROM texts WHERE id = ?", [t.id]);
          await ldb.dbRun("DELETE FROM anki_word_exports WHERE deck_name='RT37'");
          await ldb.dbRun("DELETE FROM translation_overrides WHERE he_hash=?", [HEH]);
          await ldb.dbRun("DELETE FROM events WHERE payload_json LIKE '%RT37%'");
        } catch (_) {}
      }

      return out;
    });

    if (R.dbSkipped) {
      console.log("  · ALL cases skipped (headless OPFS unavailable)");
    } else {
      test("export: canonical note keeps provenance (source/user_touched/text_id)", R.E_noteProvenance === true);
      test("export: note_occurrences included in bundle", R.E_hasOccurrences === true);
      test("import: provenance preserved (source='auto', user_touched=0)", R.I_provenancePreserved === true, "pre=" + R.preImportCanon);
      test("import: note_occurrences restored (position regained)", R.I_occurrenceRestored === true);
      test("import: re-import merges by dedup key (no duplicate)", R.I_noDupOnReimport === true);
      test("guard: findUserWordNoteAt hit at position, miss elsewhere", R.guard_findUser === true && R.guard_findUserMiss === true);
      test("guard: auto occurrence skipped where a user note exists", R.guard_skipped === true);
      test("sweep: dry-run finds the user+auto pair", R.sweep_dryPairs === true);
      test("sweep: run removes user note, keeps auto", R.sweep_removed === true && R.sweep_userGone === true && R.sweep_autoKept === true);
      test("sweep: no-op after cleanup (0 pairs)", R.sweep_noopAfter === true);
      // R-3.7 full-backup state round-trip
      test("state: export bumped to schema_version 2", R.FS_exportV2 === true);
      test("state: export carries srs/events/anki_export/translation sections", R.FS_exportSrs === true);
      test("state: export carries text pin/smart-tag/progress", R.FS_exportText === true);
      test("state: import restores srs_card (state/reps)", R.FS_cardRestored === true);
      test("state: note↔card backlink re-linked", R.FS_backlink === true);
      test("state: card meta (anki_managed) preserved", R.FS_cardMeta === true);
      test("state: srs_review_event restored", R.FS_reviewEvent === true);
      test("state: anki_word_export restored (note_id remapped)", R.FS_ankiExport === true);
      test("state: anki review event restored (note_id remapped)", R.FS_event === true);
      test("state: translation_override restored", R.FS_translation === true);
      test("state: text pin + smart-tag restored", R.FS_textSettings === true);
      test("state: reading progress restored", R.FS_progress === true);
      test("state: re-import idempotent (no duplicate card)", R.FS_idempotent === true);
      test("state: v1 bundle (no new sections) imports clean", R.FS_v1BackCompat === true);
    }

    test("no pageerror on index.html", errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[notes-roundtrip-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
