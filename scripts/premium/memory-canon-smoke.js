#!/usr/bin/env node
"use strict";
// smoke:memory-canon — Retention program P0 gate (RETENTION_PROGRAM_RECON_2026_07_02.md §7).
// Boots library.html (real OPFS DB + migrations incl. 041_review_log) and proves the canon-log
// backbone the adversarial critique demanded:
//   A) migration 041 applied; label == REAL array index (the fictional-numbering fix, §3.6);
//   B) keyer conformance (B1): LemmaCanon.noteKey == NotesAutoGen.lemmaKey == local-db noteLemmaKey
//      on shared fixtures, and reader-morph statusKeyForCard delegate == inline fallback (bytes);
//   C) review_log append: content-deterministic ids (B5), idempotent re-append, validation
//      (id-less / bad grade / bad kind refused; seed rows carry grade NULL), replay ordering;
//   D) bundle (B6): review_log + word_status + study_day ride in notes_advanced; same-device
//      re-import is a no-op; a two-device merge unions histories with zero loss/dup, word_status
//      merges newer-wins BY COLUMN GROUP (incoming schedule-less row must NOT wipe a schedule),
//      study_day merges per-day MAX;
//   E) Pass 8/12 id-preservation fix (B5): re-importing a bundle twice does NOT duplicate
//      srs_review_events / events rows.
// Run: node scripts/premium/memory-canon-smoke.js   (or npm run smoke:memory-canon)

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3299, BASE = "http://127.0.0.1:" + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function startServer() { const c = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x))); return { c, logs }; }
async function stop(c) { if (!c || c.killed) return; c.kill("SIGTERM"); const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); }); if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" }); }
async function ready(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright"); process.exit(1); }
  const srv = startServer();
  if (!(await ready())) { console.error("server failed"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  const failures = []; const eq = (c, m) => { if (!c) failures.push(m); };
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("app.locale", "ru"); } catch (_) {} });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    // ?canon=skip — disable the first-visit shipped-canon auto-import (library-ui.js ~3132):
    // it runs importBundle concurrently on the same connection and its long-held BEGIN would
    // race our own importBundle calls ("cannot start a transaction within a transaction").
    await pg.goto(BASE + "/library.html?canon=skip", { waitUntil: "load" });

    const res = await pg.evaluate(async () => {
      const out = {};
      const ldb = await import("/db/local-db.js");
      await ldb.initLocalDB();
      const NA = window.NotesAutoGen, LC = window.LemmaCanon, RM = window.ReaderMorph;
      out.hasLC = !!LC; out.hasNA = !!(NA && NA.lemmaKey);
      const one = async (sql, p) => (await ldb.dbQuery(sql, p || []))[0];

      // ── A) migrations 041/042 + label==index ───────────────────────────────────────────
      const mig = await import("/db/migrations.js");
      out.migCount = mig.MIGRATIONS.length;
      out.mig041IsReviewLog = /CREATE TABLE IF NOT EXISTS review_log/.test(String(mig.MIGRATIONS[40] || ""));
      out.mig042IsFsrs = /srs_stability/.test(String(mig.MIGRATIONS[41] || ""));
      out.migApplied = Number((await one("SELECT MAX(version) v FROM schema_migrations")).v) || 0;
      out.rlQueryable = !!(await ldb.dbQuery("SELECT COUNT(*) c FROM review_log"));
      out.compassCacheQueryable = !!(await ldb.dbQuery("SELECT COUNT(*) c FROM room_learning_compass_cache"));
      out.wordContextQueryable = !!(await ldb.dbQuery("SELECT COUNT(*) c FROM word_context"));

      // ── B) keyer conformance (recon B1) ───────────────────────────────────────────────
      const bodies = [
        { pealim_id: 123 },
        { lemma: "שָׁלוֹם", pos: "noun" },
        { word: "דָּבָר", pos: "verb" },
        { lemma: "בַּיִת", word: "בית", pos: "noun" },
      ];
      out.keyConformance = bodies.map((body) => {
        const a = NA.lemmaKey(body), c = LC.noteKey(body), d = ldb.noteLemmaKey(body);
        return { a, ok: a === c && a === d };
      });
      out.keyPid = NA.lemmaKey(bodies[0]) === "pid:123";
      out.keyStripped = NA.lemmaKey(bodies[1]) === "שלום#noun";
      // statusKeyForCard: delegate (LemmaCanon) must equal the byte-equal inline fallback.
      const cards = [
        { card: { lemma: "דָּבָר", word: "דבר", pos: "noun" }, niqqud: "דָּבָר", surface: "דבר" },
        { card: { word: "", pos: "" }, niqqud: "חֲרִישִׁי", surface: "חרישי" },   // unconfident: niqqud-derived surface key
        { card: { pealim_id: 555, lemma: "x", pos: "verb" }, niqqud: "", surface: "x" },
      ];
      try { if (window.PealimFunctionLinks && window.PealimFunctionLinks.ensureReady) await window.PealimFunctionLinks.ensureReady(); } catch (_) {}
      cards.push({ card: { pos: "particle" }, niqqud: "", surface: "גם" });   // function word (pid via links when loaded)
      out.skDelegate = [];
      for (const f of cards) {
        const k1 = RM.statusKeyForCard(NA, f.card, f.niqqud, f.surface);
        const saved = window.LemmaCanon; try { delete window.LemmaCanon; } catch (_) { window.LemmaCanon = undefined; }
        const k2 = RM.statusKeyForCard(NA, f.card, f.niqqud, f.surface);
        window.LemmaCanon = saved;
        out.skDelegate.push({ k: k1, ok: k1 === k2 && k1 !== "" });
      }

      // ── C) review_log append: determinism, idempotency, validation ────────────────────
      const rl0 = await ldb.countReviewLog();
      const row1 = { item_key: "pid:900001", kind: "review", reviewed_at: "2099-01-01T00:00:00.000Z", grade: 3, source: "room-recall", channel: "read:mc", meta: { keyer_version: LC.KEYER_VERSION, scheduler: { scheme: "sm2-lite" } } };
      row1.id = LC.reviewId(row1);
      out.idDeterministic = LC.reviewId(row1) === row1.id && LC.reviewId({ ...row1, grade: 1 }) !== row1.id;
      const a1 = await ldb.appendReviewLog(row1);
      const a2 = await ldb.appendReviewLog(row1);   // same content id → OR IGNORE
      const rl1 = await ldb.countReviewLog();
      out.appendOnce = a1.accepted === 1 && rl1 === rl0 + 1;
      out.appendIdempotent = a2.accepted === 1 && (await ldb.countReviewLog()) === rl1;   // accepted (valid) but not duplicated
      const bad = await ldb.appendReviewLog([
        { item_key: "pid:900001", reviewed_at: "2099-01-01T00:00:00.000Z", grade: 3, source: "x" },          // no id
        { id: "app:bad1", item_key: "pid:900001", reviewed_at: "2099-01-01T00:00:01.000Z", grade: 7, source: "x" },   // grade out of range
        { id: "app:bad2", item_key: "pid:900001", kind: "bogus", reviewed_at: "2099-01-01T00:00:02.000Z", grade: 3, source: "x" },   // bad kind
      ]);
      out.badRefused = bad.refused === 3 && (await ldb.countReviewLog()) === rl1;
      const seed = { id: "seed:pid:900001", item_key: "pid:900001", kind: "seed", reviewed_at: "2098-12-31T00:00:00.000Z", grade: null, source: "seed-sm2", meta: { interval: 3, reps: 2, lapses: 0, scheme: "sm2-lite" } };
      const aSeed = await ldb.appendReviewLog(seed);
      out.seedAccepted = aSeed.accepted === 1;
      const hist = await ldb.getReviewLog("pid:900001");
      out.replayOrder = hist.length === 2 && hist[0].kind === "seed" && hist[1].kind === "review";   // reviewed_at ASC

      // ── D) bundle: sections present, same-device idempotent, two-device merge ─────────
      const DUE_MS = 4102444800000;   // 2100-01-01
      await ldb.setWordStatus("pid:900002", "l2", { due: DUE_MS, interval: 3, reps: 2, lapses: 1 }, { textKey: "tk1", sentenceId: "s1", orderIndex: 5, surface: "סורף" });
      await ldb.setWordStatus("pid:900003", "known");
      await ldb.recordRecall("2099-01-02", 4);
      const exp = await ldb.exportBundle();
      const na = exp && exp.notes_advanced;
      out.expHasSections = !!(na && Array.isArray(na.review_log) && Array.isArray(na.word_status) && Array.isArray(na.study_day));
      out.expCarriesRows = !!(na && na.review_log.some((x) => x.id === row1.id) && na.word_status.some((x) => x.lemma_key === "pid:900002" && x.srs_due) && na.study_day.some((x) => x.day === "2099-01-02"));
      const wsCount1 = Number((await one("SELECT COUNT(*) c FROM word_status")).c);
      const rlCount1 = await ldb.countReviewLog();
      const sd1 = await one("SELECT recalls, available FROM study_day WHERE day='2099-01-02'");
      await ldb.importBundle(exp, { mode: "skip" });   // same-device re-import → no-op
      out.reimportWsSame = Number((await one("SELECT COUNT(*) c FROM word_status")).c) === wsCount1;
      out.reimportRlSame = (await ldb.countReviewLog()) === rlCount1;
      const sd2 = await one("SELECT recalls, available FROM study_day WHERE day='2099-01-02'");
      out.reimportSdSame = sd2 && Number(sd2.recalls) === Number(sd1.recalls) && Number(sd2.available) === Number(sd1.available);
      out.ws2AfterReimport = await one("SELECT status, srs_due, srs_surface FROM word_status WHERE lemma_key='pid:900002'");

      // two-device merge fixture
      const rowB = { item_key: "pid:900002", kind: "review", reviewed_at: "2099-03-01T00:00:00.000Z", grade: 1, source: "room-due-queue", channel: "listen:typed", meta: {} };
      rowB.id = LC.reviewId(rowB);
      const payload2 = {
        manifest: { export_schema_version: 1 }, texts: [],
        notes_advanced: {
          schema_version: 2, notes: [],
          word_status: [
            { lemma_key: "pid:900002", status: "l4", updated_at: "2099-06-01T00:00:00.000Z", srs_due: null, srs_interval: 0, srs_reps: 0, srs_lapses: 0 },   // newer, NO schedule → status flips, schedule PRESERVED
            { lemma_key: "pid:900003", status: "l1", updated_at: "1999-01-01T00:00:00.000Z" },   // older → ignored
            { lemma_key: "pid:900004", status: "l3", updated_at: "2099-06-01T00:00:00.000Z", srs_due: "2099-02-01T00:00:00.000Z", srs_interval: 1, srs_reps: 1, srs_lapses: 0, srs_surface: "אבג" },   // fresh insert
          ],
          review_log: [row1, rowB],   // one dup + one new
          study_day: [{ day: "2099-01-02", recalls: 9, available: 2 }],   // MAX merge: recalls 9, available stays 4
        },
      };
      await ldb.importBundle(payload2, { mode: "skip" });
      const ws2 = await one("SELECT status, srs_due, srs_interval, srs_surface FROM word_status WHERE lemma_key='pid:900002'");
      out.mergeStatusFlipped = !!(ws2 && ws2.status === "l4");
      out.mergeSchedulePreserved = !!(ws2 && ws2.srs_due && Date.parse(ws2.srs_due) === DUE_MS && Number(ws2.srs_interval) === 3 && ws2.srs_surface === "סורף");
      const ws3 = await one("SELECT status FROM word_status WHERE lemma_key='pid:900003'");
      out.mergeOlderIgnored = !!(ws3 && ws3.status === "known");
      const ws4 = await one("SELECT status, srs_due FROM word_status WHERE lemma_key='pid:900004'");
      out.mergeFreshInserted = !!(ws4 && ws4.status === "l3" && ws4.srs_due);
      out.mergeRlPlusOne = (await ldb.countReviewLog()) === rlCount1 + 1;
      const sd3 = await one("SELECT recalls, available FROM study_day WHERE day='2099-01-02'");
      out.mergeSdMax = !!(sd3 && Number(sd3.recalls) === 9 && Number(sd3.available) === 4);

      // ── P2) FSRS flip: lazy-seed handover + seed-once + projections + INDEPENDENT ORACLE ─
      // Mirrors checkTrainAnswer's exact write sequence at the localDb+engine level.
      try {
        const FC = window.FsrsCore, RM2 = window.ReaderMorph;
        out.hasFC = !!(FC && FC.nextState && RM2.fsrsStep);
        const PK = "pid:990p2";
        const T = Date.parse("2099-05-01T12:00:00.000Z");
        // legacy SM2 row (scheme NULL), due 3 days ago, interval 1
        await ldb.setWordStatus(PK, "l2", { due: T - 3 * 86400000, interval: 1, reps: 1, lapses: 0 });
        const sched1 = (await ldb.getSrsSchedule())[PK];
        out.p2LegacyShape = !!(sched1 && sched1.scheme == null && sched1.interval === 1);
        // review #1 (correct) — seeds
        const st1 = RM2.fsrsStep(FC, sched1, true, T);
        out.p2Seeded = !!(st1 && st1.seeded && st1.sched.scheme === "fsrs" && st1.sched.stability > 0);
        await ldb.appendReviewLog({ id: "seed:" + PK, item_key: PK, kind: "seed", reviewed_at: new Date(T - 1).toISOString(), grade: null, source: "seed-sm2", meta: st1.seedMeta });
        const r1 = { id: "", item_key: PK, kind: "review", reviewed_at: new Date(T).toISOString(), grade: 3, source: "room-recall", channel: "read:mc", meta: { scheduler: { scheme: "fsrs" } } };
        r1.id = window.LemmaCanon.reviewId(r1);
        await ldb.appendReviewLog(r1);
        await ldb.setWordStatus(PK, "l3", st1.sched);
        const sched2 = (await ldb.getSrsSchedule())[PK];
        out.p2SchemeFlipped = !!(sched2 && sched2.scheme === "fsrs" && sched2.stability > 0 && sched2.reviewedAt === T);
        // review #2 (wrong) an hour later — resumes stored state (NO re-seed), Again → due NOW
        const st2 = RM2.fsrsStep(FC, sched2, false, T + 3600000);
        out.p2NoReseed = !!(st2 && !st2.seeded);
        out.p2AgainDueNow = !!(st2 && st2.sched.due === T + 3600000 && st2.sched.interval === 0 && st2.sched.lapses === 1);
        const r2 = { id: "", item_key: PK, kind: "review", reviewed_at: new Date(T + 3600000).toISOString(), grade: 1, source: "room-recall", channel: "read:typed", meta: { scheduler: { scheme: "fsrs" } } };
        r2.id = window.LemmaCanon.reviewId(r2);
        await ldb.appendReviewLog(r2);
        await ldb.setWordStatus(PK, "l2", st2.sched);
        // plain status set must PRESERVE the fsrs columns (UPSERT-preserve)
        await ldb.setWordStatus(PK, "l4");
        const sched3 = (await ldb.getSrsSchedule())[PK];
        out.p2PlainSetPreserves = !!(sched3 && sched3.scheme === "fsrs" && Math.abs(sched3.stability - st2.state.stability) < 1e-7);
        // INDEPENDENT ORACLE (recon B4): replay the raw log → must equal the stored state
        const oracle = FC.replay(await ldb.getReviewLog(PK));
        out.p2Oracle = !!(oracle && Math.abs(oracle.stability - sched3.stability) < 1e-7 &&
          Math.abs(oracle.difficulty - sched3.difficulty) < 1e-7 &&
          oracle.reps === sched3.reps && oracle.lapses === sched3.lapses &&
          oracle.lastReviewedAt === sched3.reviewedAt);
        await ldb.setWordStatus(PK, "");   // cleanup (log rows remain — append-only by design)
      } catch (e) { out.p2Err = String(e && e.message || e); }

      // ── E) Pass 8/12 id preservation: double re-import must not duplicate history ─────
      let sreOk = null, evOk = null, sreErr = null, sreStep = "";
      try {
        sreStep = "createNote";
        const note = await ldb.createNote({ target_kind: "word", target_id: "w-canon-1", note_type: "word_study", body: { word: "בית", lemma: "בית", pos: "noun", meaning: "дом" } });
        const nid = (note && note.id) || note;
        sreStep = "createCardFromNote";
        const card = await ldb.srs.createCardFromNote(nid);
        const cid = (card && card.id) || card;
        sreStep = "reviewCard";
        await ldb.srs.reviewCard(cid, 3);
        // Studio write path (P0): the review must land in review_log under the CANONICAL note key.
        const rlStudio = await ldb.getReviewLog("בית#noun");
        let sMeta = {}; try { sMeta = JSON.parse(rlStudio[0].meta_json || "{}"); } catch (_) {}
        out.studioLogged = rlStudio.length === 1 && rlStudio[0].source === "studio-trainer" && String(rlStudio[0].id).startsWith("sre:") && Number(rlStudio[0].grade) === 3;
        // Retention P3 — the Studio scheduler is now FSRS-6 (recon §3.5): scheme=fsrs in the log,
        // FSRS state persisted in srs_cards.meta_json.fsrs, legacy columns PROJECTED, and the
        // independent oracle holds for the Studio too (replay(log) == the card's stored DSR state).
        out.studioScheme = !!(sMeta.scheduler && sMeta.scheduler.scheme === "fsrs");
        const cardRow = await one("SELECT state, interval_days, due_date, meta_json FROM srs_cards WHERE id = ?", [cid]);
        let cMeta = {}; try { cMeta = JSON.parse(cardRow.meta_json || "{}"); } catch (_) {}
        out.studioCardFsrs = !!(cMeta.fsrs && cMeta.fsrs.stability > 0 && typeof cMeta.fsrs.difficulty === "number");
        out.studioProjected = !!(cardRow.state === "review" && cardRow.due_date && Number(cardRow.interval_days) >= 1);
        const oracleS = window.FsrsCore.replay(await ldb.getReviewLog("בית#noun"));
        out.studioOracle = !!(oracleS && cMeta.fsrs && Math.abs(oracleS.stability - cMeta.fsrs.stability) < 1e-7 &&
          Math.abs(oracleS.difficulty - cMeta.fsrs.difficulty) < 1e-7 && oracleS.reps === cMeta.fsrs.reps && oracleS.lapses === cMeta.fsrs.lapses);
        sreStep = "counts+reimport";
        const sre1 = Number((await one("SELECT COUNT(*) c FROM srs_review_events")).c);
        const ev1 = Number((await one("SELECT COUNT(*) c FROM events WHERE event_type='srs_review'")).c);
        const exp2 = await ldb.exportBundle();
        await ldb.importBundle(exp2, { mode: "skip" });
        await ldb.importBundle(exp2, { mode: "skip" });
        const sre2 = Number((await one("SELECT COUNT(*) c FROM srs_review_events")).c);
        const ev2 = Number((await one("SELECT COUNT(*) c FROM events WHERE event_type='srs_review'")).c);
        sreOk = sre2 === sre1 && sre1 >= 1;
        evOk = ev2 === ev1 && ev1 >= 1;
        out.studioLogIdempotent = (await ldb.getReviewLog("בית#noun")).length === 1;   // bundle re-imports must not duplicate the sre:-row either
      } catch (e) { sreErr = sreStep + ": " + String(e && e.message || e); }
      out.pass8NoDup = sreOk; out.pass12NoDup = evOk; out.sreErr = sreErr;

      // ── P4) Anki merge → review_log + updateSrsState recompute fan-out (recon §5) ─────
      try {
        const FC = window.FsrsCore;
        // a word tracked in the Room with a MANUAL level but NO schedule yet
        const note = await ldb.createNote({ target_kind: "word", target_id: "w-anki-1", note_type: "word_study", body: { word: "מים", lemma: "מים", pos: "noun", meaning: "вода" } });
        const nid = (note && note.id) || note;
        const KEY = ldb.noteLemmaKey({ word: "מים", lemma: "מים", pos: "noun" });   // "מים#noun"
        await ldb.setWordStatus(KEY, "l3");   // manual level, no srs schedule
        const T = Date.parse("2099-08-01T10:00:00.000Z");
        const rows = [
          { ankiReviewId: T,               localNoteId: nid, ankiCardId: 111, ts: new Date(T).toISOString(),                 ease: 3, type: 1 },   // good review → ingest
          { ankiReviewId: T + 3600000,     localNoteId: nid, ankiCardId: 111, ts: new Date(T + 3600000).toISOString(),       ease: 4, type: 2 },   // relearn easy → ingest
          { ankiReviewId: T + 7200000,     localNoteId: nid, ankiCardId: 111, ts: new Date(T + 7200000).toISOString(),       ease: 0, type: 4 },   // manual-reschedule (type 4/ease 0) → DROP
          { ankiReviewId: 9999999999999,   localNoteId: nid, ankiCardId: 111, ts: new Date(9999999999999).toISOString(),      ease: 3, type: 1 },   // far-future ts → clamp
        ];
        const ing = await ldb.ingestAnkiReviewsToLog(rows);
        out.p4Ingested = ing.ingested === 3 && ing.dropped === 1 && ing.affected === 1;
        // P3.2: setWordStatus now emits kind='mark' rows (manual-axis events) — filter them out of
        // the ANKI-row assertions (they're replay-neutral and not part of the ingest contract).
        const alog = (await ldb.getReviewLog(KEY)).filter((x) => x.kind !== "mark");
        out.p4LoggedCanon = alog.length === 3 && alog.every((x) => x.source === "anki" && String(x.id).startsWith("anki:"));
        out.p4Grades = alog.map((x) => Number(x.grade)).sort().join(",") === "3,3,4";
        let clampMeta = false; for (const x of alog) { try { const m = JSON.parse(x.meta_json || "{}"); if (m.ts_clamped) clampMeta = true; if (!(m.scheduler && m.scheduler.scheme === "anki")) out.p4SchemeBad = true; } catch (_) {} }
        out.p4Clamped = clampMeta;
        const ws = await one("SELECT status, srs_scheme, srs_stability, srs_due FROM word_status WHERE lemma_key = ?", [KEY]);
        out.p4StatusPreserved = !!(ws && ws.status === "l3");                    // srs-only writer must NOT touch the manual axis
        out.p4Recomputed = !!(ws && ws.srs_scheme === "fsrs" && Number(ws.srs_stability) > 0 && ws.srs_due);   // schedule folded from the merged log
        // INDEPENDENT ORACLE (Anki-merged): replay(review_log) == the stored word_status state
        const oracleA = FC.replay(alog);
        const sched = (await ldb.getSrsSchedule())[KEY];
        out.p4Oracle = !!(oracleA && sched && Math.abs(oracleA.stability - sched.stability) < 1e-7 &&
          Math.abs(oracleA.difficulty - sched.difficulty) < 1e-7 && oracleA.reps === sched.reps && oracleA.lapses === sched.lapses);
        // idempotent re-ingest → no dup, state unchanged
        const before = await ldb.countReviewLog();
        const ing2 = await ldb.ingestAnkiReviewsToLog(rows);
        out.p4Idempotent = ing2.ingested === 0 && (await ldb.getReviewLog(KEY)).filter((x) => x.kind !== "mark").length === 3 && (await ldb.countReviewLog()) === before;
      } catch (e) { out.p4Err = String(e && e.message || e); }

      // ── P4.1) srs-carrier row (status='') must NOT demote via manual-wins (defect fix) ──
      // An Anki-KNOWN word the Room never tracked: word_study note + srs_cards state 'review'
      // (getLearningStateOverlay → 'known'), NO word_status row. Before the fix, the Anki ingest's
      // updateSrsState INSERTed status='new', and the manual-wins overlay in getKnownWordStates
      // demoted the derived 'known' to 'new' in reading colour / coverage / i+1.
      try {
        const note2 = await ldb.createNote({ target_kind: "word", target_id: "w-anki-2", note_type: "word_study", body: { word: "ספר", lemma: "ספר", pos: "noun", meaning: "книга" } });
        const nid2 = String((note2 && note2.id) || note2);
        const KEY2 = ldb.noteLemmaKey({ word: "ספר", lemma: "ספר", pos: "noun" });   // "ספר#noun"
        await ldb.dbRun(
          `INSERT INTO srs_cards (id, entity_type, entity_id, template_id, source_note_id, state, due_date, interval_days, reps, lapses)
           VALUES ('c-p41', 'note', ?, 'tpl_ru_to_he', ?, 'review', '2099-12-01T00:00:00.000Z', 30, 5, 0)`, [nid2, nid2]);
        out.p41OverlayKnown = (await ldb.getKnownWordStates())[KEY2] === "known";   // precondition: SRS-derived state
        const T2 = Date.parse("2099-09-01T10:00:00.000Z");
        const ing41 = await ldb.ingestAnkiReviewsToLog([
          { ankiReviewId: T2, localNoteId: nid2, ankiCardId: 222, ts: new Date(T2).toISOString(), ease: 3, type: 1 },
        ]);
        out.p41Ingested = !!(ing41 && ing41.ingested === 1 && ing41.affected === 1);
        const ws41 = await one("SELECT status, srs_scheme, srs_stability, srs_due FROM word_status WHERE lemma_key = ?", [KEY2]);
        out.p41CarrierRow = !!(ws41 && String(ws41.status) === "" && ws41.srs_scheme === "fsrs" && Number(ws41.srs_stability) > 0 && ws41.srs_due);
        out.p41NoDemotion = (await ldb.getKnownWordStates())[KEY2] === "known";     // '' must NOT overlay
        // the DELIBERATE manual 'new' (purple) still wins — only the carrier is exempt
        await ldb.setWordStatus(KEY2, "new");
        out.p41ManualStillWins = (await ldb.getKnownWordStates())[KEY2] === "new";
        // clearing the manual mark deletes the row; recompute re-creates the srs-carrier ('')
        await ldb.setWordStatus(KEY2, "");
        await ldb.recomputeSrsFromLog([KEY2]);
        const ws42 = await one("SELECT status, srs_scheme FROM word_status WHERE lemma_key = ?", [KEY2]);
        out.p41RecomputeCarrier = !!(ws42 && String(ws42.status) === "" && ws42.srs_scheme === "fsrs");
        // bundle merge: an incoming ''-carrier row must never clobber a local manual mark (Pass 15
        // drops empty statuses — the cross-device face of the same demotion defect)
        await ldb.setWordStatus(KEY2, "l3");
        await ldb.importBundle({
          manifest: { export_schema_version: 1 }, texts: [],
          notes_advanced: { schema_version: 2, notes: [], review_log: [], study_day: [],
            word_status: [{ lemma_key: KEY2, status: "", updated_at: "2099-12-31T00:00:00.000Z", srs_due: "2099-12-01T00:00:00.000Z", srs_interval: 2, srs_reps: 1, srs_lapses: 0 }] },
        }, { mode: "skip" });
        const ws43 = await one("SELECT status FROM word_status WHERE lemma_key = ?", [KEY2]);
        out.p41CarrierMergeSafe = !!(ws43 && ws43.status === "l3");
      } catch (e) { out.p41Err = String(e && e.message || e); }

      // ── P7.0a — annul-семантика на КЛИЕНТЕ (TELEGRAM_P7_DECISION; блокер критики
      // wf_1bf34023: annul-до-пустого-фолда обязан ОЧИЩАТЬ клиентскую проекцию, а не
      // оставлять stale-расписание; ручная ось при этом неприкосновенна) ──────────────
      try {
        const LC2 = window.LemmaCanon, FC2 = window.FsrsCore;
        out.annulIdCanon = typeof LC2.annulId === "function"
          && LC2.annulId("app:x") === LC2.annulId("app:x")
          && LC2.annulId("app:x") !== LC2.annulId("app:y")
          && LC2.annulId("app:x").indexOf("annul:") === 0;
        // валидация: annul без цели — reject (зеркало серверного annul_without_target;
        // иначе строка вечно реджектится сервером → постоянный heal-цикл синка)
        const badAnnul = await ldb.appendReviewLog({ id: "annul:no-target", item_key: "אנול#noun", kind: "annul", reviewed_at: "2099-10-01T10:00:00.000Z", grade: null, source: "op", meta: {} });
        out.annulRefusedNoTarget = badAnnul.refused === 1 && badAnnul.accepted === 0;
        // одиночный review нового слова → carrier-строка с расписанием (precondition)
        const AK = "אנול#noun";
        const ar1 = { id: "app:annul-case-1", item_key: AK, kind: "review", reviewed_at: "2099-10-02T10:00:00.000Z", grade: 3, source: "room-recall", channel: "read:mc", meta: { keyer_version: 1 } };
        await ldb.appendReviewLog(ar1);
        await ldb.recomputeSrsFromLog([AK]);
        const aws1 = await one("SELECT status, srs_stability FROM word_status WHERE lemma_key = ?", [AK]);
        out.annulPrecondition = !!(aws1 && Number(aws1.srs_stability) > 0);
        // annul единственного review → фолд пуст → carrier-строка УДАЛЕНА (не stale)
        await ldb.appendReviewLog({ id: LC2.annulId(ar1.id), item_key: AK, kind: "annul", reviewed_at: "2099-10-03T10:00:00.000Z", grade: null, source: "agent:correction", meta: { annul_of: ar1.id } });
        const rec2 = await ldb.recomputeSrsFromLog([AK]);
        const aws2 = await one("SELECT status FROM word_status WHERE lemma_key = ?", [AK]);
        out.annulCarrierCleared = !aws2 && !!rec2 && rec2.cleared === 1;
        // слово с ручной пометкой: annul чистит ТОЛЬКО srs_* — ручная ось остаётся
        const AK2 = "אנול2#noun";
        const ar2 = { id: "app:annul-case-2", item_key: AK2, kind: "review", reviewed_at: "2099-10-02T10:00:00.000Z", grade: 3, source: "room-recall", channel: "read:mc", meta: { keyer_version: 1 } };
        await ldb.appendReviewLog(ar2);
        await ldb.recomputeSrsFromLog([AK2]);
        await ldb.setWordStatus(AK2, "l2");
        await ldb.appendReviewLog({ id: LC2.annulId(ar2.id), item_key: AK2, kind: "annul", reviewed_at: "2099-10-03T10:00:00.000Z", grade: null, source: "agent:correction", meta: { annul_of: ar2.id } });
        await ldb.recomputeSrsFromLog([AK2]);
        const aws3 = await one("SELECT status, srs_due, srs_stability, srs_scheme FROM word_status WHERE lemma_key = ?", [AK2]);
        out.annulManualKept = !!(aws3 && aws3.status === "l2" && aws3.srs_due == null && aws3.srs_stability == null && aws3.srs_scheme == null);
        // D1-фильтр: withoutAnnulled выкидывает аннулированную строку, annul-строку оставляет
        const filtered = FC2.withoutAnnulled(await ldb.getReviewLog(AK2));
        out.annulD1Filter = !filtered.some((r) => r.id === ar2.id) && filtered.some((r) => r.kind === "annul");
      } catch (e) { out.annulErr = String(e && e.message || e); }

      // ── R1 source-at-mark (ROOM_DUE_CONTINUITY §3) — updateSrsSource semantics ────────
      // fillOnly (mark path) writes ONLY a missing source (R11 do-no-harm); plain (reading-tap
      // grade) is latest-occurrence-wins like the recall canon; both are scheduled-only no-ops.
      try {
        const SRC_A = { textKey: "tkA", sentenceId: "sA", orderIndex: 1, surface: "מקורא" };
        const SRC_B = { textKey: "tkB", sentenceId: "sB", orderIndex: 2, surface: "מקורב" };
        // scheduled, no source (srs-only carrier — exactly the pre-R1 gap class)
        const RK1 = "ר1חסר#noun";
        await ldb.updateSrsState(RK1, { due: 4102444800000, interval: 3, reps: 1, lapses: 0, stability: 3, difficulty: 5, scheme: "fsrs" });
        await ldb.updateSrsSource(RK1, { ...SRC_A, fillOnly: true });
        const rw1 = await one("SELECT srs_surface, srs_sentence_id, srs_text_key, srs_order_index FROM word_status WHERE lemma_key = ?", [RK1]);
        out.r1FillWritesMissing = !!(rw1 && rw1.srs_surface === SRC_A.surface && rw1.srs_sentence_id === "sA" && rw1.srs_text_key === "tkA" && Number(rw1.srs_order_index) === 1);
        // fillOnly must NOT churn an existing (proven) source
        await ldb.updateSrsSource(RK1, { ...SRC_B, fillOnly: true });
        const rw2 = await one("SELECT srs_surface FROM word_status WHERE lemma_key = ?", [RK1]);
        out.r1FillPreservesExisting = !!(rw2 && rw2.srs_surface === SRC_A.surface);
        // plain (grade path) → latest occurrence wins
        await ldb.updateSrsSource(RK1, SRC_B);
        const rw3 = await one("SELECT srs_surface, srs_sentence_id FROM word_status WHERE lemma_key = ?", [RK1]);
        out.r1LatestWins = !!(rw3 && rw3.srs_surface === SRC_B.surface && rw3.srs_sentence_id === "sB");
        // manual-only row (no schedule) → guarded UPDATE must not write a dead source
        const RK2 = "ר1בלי#noun";
        await ldb.setWordStatus(RK2, "l1");
        await ldb.updateSrsSource(RK2, { ...SRC_A, fillOnly: true });
        const rw4 = await one("SELECT srs_surface FROM word_status WHERE lemma_key = ?", [RK2]);
        out.r1NoScheduleNoop = !!(rw4 && rw4.srs_surface == null);
        // surface is the sourced-due marker — a source without it must be refused outright
        const refused = await ldb.updateSrsSource(RK1, { textKey: "tkC", sentenceId: "sC", orderIndex: 3 });
        const rw5 = await one("SELECT srs_surface FROM word_status WHERE lemma_key = ?", [RK1]);
        out.r1RequiresSurface = refused === false && !!(rw5 && rw5.srs_surface === SRC_B.surface);
      } catch (e) { out.r1SrcErr = String(e && e.message || e); }

      // ── R2 serve-unsourced — findSentencesForWords (batched LIKE prefilter for the re-source scan)
      try {
        const tId = "r2t-1";
        await ldb.createText({ id: tId, text_key: "r2-key-live", title: "r2", source_text: "" });
        const tArc = "r2t-arc";
        await ldb.createText({ id: tArc, text_key: "r2-key-arc", title: "r2a", source_text: "" });
        await ldb.addSentence(tId, { id: tId + ":s1", he_plain: "הוא ראה בית גדול", he_niqqud: "", ru: "он увидел большой дом" });
        await ldb.addSentence(tId, { id: tId + ":s2", he_plain: "ספר על השולחן", he_niqqud: "", ru: "книга на столе" });
        await ldb.addSentence(tArc, { id: tArc + ":s1", he_plain: "בית ישן מאוד", he_niqqud: "", ru: "архив" });
        await ldb.archiveText(tArc);
        // batched: BOTH needles in ONE call; archived text's hit must NOT appear
        const found = await ldb.findSentencesForWords(["בית", "ספר"], 50);
        const ids = new Set((found || []).map((r) => String(r.id)));
        out.r2ScanFindsBoth = ids.has(tId + ":s1") && ids.has(tId + ":s2");
        out.r2ScanSkipsArchived = !ids.has(tArc + ":s1");
        out.r2ScanCarriesAnchor = (found || []).length > 0 && (found || []).every((r) => r.text_key && r.order_index != null && r.he_plain);
        // empty/blank needles → empty result, never a full-table dump
        const none = await ldb.findSentencesForWords(["", null], 50);
        out.r2ScanRefusesEmpty = Array.isArray(none) && none.length === 0;
      } catch (e) { out.r2ScanErr = String(e && e.message || e); }

      // ── R3.2 countTodayAllReviews — SAME canon as server getTodayActivity: review-kind only
      // (skip is not «сделано»), annul-excluded, since the given local midnight.
      try {
        const K32 = "היום32#noun";
        await ldb.appendReviewLog([
          { id: "r32a", item_key: K32, kind: "review", reviewed_at: "2099-12-01T10:00:00.000Z", grade: 3, source: "s", channel: "read:mc", meta: {} },
          { id: "r32b", item_key: K32, kind: "review", reviewed_at: "2099-12-01T11:00:00.000Z", grade: 1, source: "s", channel: "reverse:ma", meta: {} },
          { id: "r32c", item_key: K32, kind: "skip", reviewed_at: "2099-12-01T12:00:00.000Z", grade: 2, source: "s", channel: "read", meta: {} },
          { id: "r32d", item_key: K32, kind: "review", reviewed_at: "2099-11-30T10:00:00.000Z", grade: 3, source: "s", channel: "read:mc", meta: {} },
        ]);
        await ldb.appendReviewLog({ id: LC.annulId("r32b"), item_key: K32, kind: "annul", reviewed_at: "2099-12-01T12:30:00.000Z", grade: null, source: "op", meta: { annul_of: "r32b" } });
        out.r32TodayCount = await ldb.countTodayAllReviews("2099-12-01T00:00:00.000Z");
        // R3.3 — per-local-day buckets (headless tz = UTC → local==UTC deterministic): the same
        // fixture must land r32a on 12-01 (r32b annulled, r32c a skip) and r32d on 11-30.
        const byDay = await ldb.countReviewsByLocalDay();
        out.r33Day1 = byDay["2099-12-01"];
        out.r33Day0 = byDay["2099-11-30"];
      } catch (e) { out.r32Err = String(e && e.message || e); }

      return out;
    });

    // ── assertions ──────────────────────────────────────────────────────────────────────
    eq(res.hasLC, "LemmaCanon global missing (script tag / load order)");
    eq(res.hasNA, "NotesAutoGen missing");
    eq(res.mig041IsReviewLog, "041_review_log is not at index 40 (label==index broken)");
    eq(res.mig042IsFsrs, "042_word_status_fsrs is not at index 41 (label==index broken)");
    eq(res.migApplied === res.migCount, `applied schema version ${res.migApplied} != MIGRATIONS.length ${res.migCount}`);
    // Пин-трипваер: при ДОБАВЛЕНИИ миграции сверь «метка == реальному индексу» и подними число.
    // 2026-08-12: version 49 is the isolated, discardable B7 derived ingredient cache.
    // 2026-09-02: version 50 = 050_word_context — Trainer T2 context bank. Verified against the
    // runner's own rule (db-worker.js: version = i + 1, so label 041 sits at index 40): the new
    // table is appended at index 49 and therefore is version 50. Appending is the ONLY safe
    // placement — an insert would renumber every later migration and re-run it on live profiles.
    eq(res.migCount === 50, `MIGRATIONS.length ${res.migCount} != 50 — labels no longer equal real indexes (recon §3.6; last = 050_word_context)`);
    eq(res.rlQueryable, "review_log not queryable");
    eq(res.compassCacheQueryable, "room_learning_compass_cache not queryable");
    eq(res.wordContextQueryable, "word_context not queryable (migration 050 did not apply)");
    for (const k of res.keyConformance || []) eq(k.ok, `keyer conformance failed for ${k.a}`);
    eq(res.keyPid && res.keyStripped, "canonical key fixtures wrong");
    for (const s of res.skDelegate || []) eq(s.ok, `statusKeyForCard delegate != fallback for key ${s.k}`);
    eq(res.idDeterministic, "reviewId not content-deterministic");
    eq(res.appendOnce, "appendReviewLog first insert failed");
    eq(res.appendIdempotent, "appendReviewLog re-append duplicated");
    eq(res.badRefused, "appendReviewLog validation leaked a malformed row");
    eq(res.seedAccepted, "seed row (grade NULL) refused");
    eq(res.replayOrder, "getReviewLog replay ordering wrong");
    eq(res.expHasSections, "exportBundle missing review_log/word_status/study_day sections");
    eq(res.expCarriesRows, "exportBundle sections don't carry the seeded rows");
    eq(res.reimportWsSame && res.reimportRlSame && res.reimportSdSame, "same-device re-import was not a no-op");
    eq(res.mergeStatusFlipped, "newer status did not win on merge");
    eq(res.mergeSchedulePreserved, "incoming schedule-less row WIPED the local schedule (UPSERT-preserve regression)");
    eq(res.mergeOlderIgnored, "older incoming status overwrote a newer local one");
    eq(res.mergeFreshInserted, "fresh word_status row not inserted on merge");
    eq(res.mergeRlPlusOne, "review_log two-device merge lost or duplicated rows");
    eq(res.mergeSdMax, "study_day merge is not per-day MAX");
    eq(res.pass8NoDup === true, "srs_review_events duplicated on re-import (Pass 8)" + (res.sreErr ? " err:" + res.sreErr : ""));
    eq(res.pass12NoDup === true, "events duplicated on re-import (Pass 12)");
    eq(res.studioLogged === true, "Studio reviewCard did not land in review_log under the canonical key");
    eq(res.studioScheme === true, "P3: Studio review meta.scheduler.scheme is not 'fsrs' (FsrsCore not wired into the Studio path?)");
    eq(res.studioCardFsrs === true, "P3: Studio card did not persist FSRS state in meta_json.fsrs");
    eq(res.studioProjected === true, "P3: Studio FSRS review did not project state/due_date/interval onto the legacy columns");
    eq(res.studioOracle === true, "P3: INDEPENDENT ORACLE (Studio) failed — replay(review_log) != stored meta_json.fsrs");
    eq(res.studioLogIdempotent === true, "Studio sre:-row duplicated by bundle re-imports");
    eq(res.p4Ingested === true, "P4: Anki ingest miscounted (expected 3 ingested / 1 dropped / 1 affected)" + (res.p4Err ? " err:" + res.p4Err : ""));
    eq(res.p4LoggedCanon === true, "P4: Anki reviews not logged under the canon key with anki:-ids/source=anki");
    eq(res.p4Grades === true, "P4: Anki ease→grade mapping wrong (expected grades 3,3,4)");
    eq(res.p4Clamped === true, "P4: far-future Anki ts was not clamped (meta.ts_clamped)");
    eq(res.p4SchemeBad !== true, "P4: Anki review_log meta.scheduler.scheme is not 'anki'");
    eq(res.p4StatusPreserved === true, "P4: updateSrsState WIPED the manual status (must be srs-only)");
    eq(res.p4Recomputed === true, "P4: word state not recomputed from the merged log (scheme=fsrs / stability / due)");
    eq(res.p4Oracle === true, "P4: INDEPENDENT ORACLE (Anki-merged) failed — replay(review_log) != stored word_status state");
    eq(res.p4Idempotent === true, "P4: re-ingesting the same Anki reviews duplicated rows / changed state");
    eq(res.p41OverlayKnown === true, "P4.1: precondition failed — srs_cards 'review' did not derive 'known'" + (res.p41Err ? " err:" + res.p41Err : ""));
    eq(res.p41Ingested === true, "P4.1: single-review Anki ingest on an untracked word miscounted");
    eq(res.p41CarrierRow === true, "P4.1: updateSrsState did not create the ''-carrier row (status must be '', schedule recomputed)");
    eq(res.p41NoDemotion === true, "P4.1 DEFECT: Anki-known word demoted to 'new' via manual-wins (carrier status leaked into the overlay)");
    eq(res.p41ManualStillWins === true, "P4.1: the deliberate manual 'new' no longer wins (overlay regression)");
    eq(res.p41RecomputeCarrier === true, "P4.1: recomputeSrsFromLog did not re-create the ''-carrier after a manual clear");
    eq(res.p41CarrierMergeSafe === true, "P4.1: an incoming ''-carrier bundle row CLOBBERED a local manual mark (Pass 15 must drop it)");
    eq(res.hasFC === true, "FsrsCore/fsrsStep not loaded in library.html" + (res.p2Err ? " err:" + res.p2Err : ""));
    eq(res.p2LegacyShape === true, "legacy schedule row lost its shape");
    eq(res.p2Seeded === true, "fsrsStep did not seed a legacy row");
    eq(res.p2SchemeFlipped === true, "recall write did not flip srs_scheme to fsrs / persist DSR state");
    eq(res.p2NoReseed === true, "fsrs-owned word was RE-seeded on second review");
    eq(res.p2AgainDueNow === true, "Again did not put the word due-now with interval projection 0");
    eq(res.p2PlainSetPreserves === true, "plain status set WIPED the fsrs columns (UPSERT-preserve regression)");
    eq(res.p2Oracle === true, "INDEPENDENT ORACLE failed: replay(review_log) != stored state" + (res.p2Err ? " err:" + res.p2Err : ""));
    // P7.0a — annul-семантика на клиенте
    eq(res.annulIdCanon === true, "P7.0a: LemmaCanon.annulId missing/non-deterministic/collides" + (res.annulErr ? " err:" + res.annulErr : ""));
    eq(res.annulRefusedNoTarget === true, "P7.0a: appendReviewLog accepted an annul WITHOUT annul_of (server rejects it forever → sync heal-loop)");
    eq(res.annulPrecondition === true, "P7.0a: precondition failed — single review did not project a schedule");
    eq(res.annulCarrierCleared === true, "P7.0a BLOCKER-fix: annul-to-null must DELETE the ''-carrier row (stale schedule survived)");
    eq(res.annulManualKept === true, "P7.0a: annul must clear ONLY srs_* — manual axis lost or srs_* survived");
    // R1 source-at-mark — updateSrsSource
    eq(res.r1FillWritesMissing === true, "R1: fillOnly did not backfill a missing source on a scheduled word" + (res.r1SrcErr ? " err:" + res.r1SrcErr : ""));
    eq(res.r1FillPreservesExisting === true, "R1 DEFECT: fillOnly CHURNED an existing source (R11 do-no-harm)");
    eq(res.r1LatestWins === true, "R1: plain updateSrsSource did not apply latest-occurrence-wins (recall canon)");
    eq(res.r1NoScheduleNoop === true, "R1 DEFECT: source written onto an UNSCHEDULED word (dead pointer)");
    eq(res.r1RequiresSurface === true, "R1: a source without surface must be refused (surface IS the sourced-due marker)");
    // R2 serve-unsourced — findSentencesForWords
    eq(res.r2ScanFindsBoth === true, "R2: batched scan did not find both needles in one call" + (res.r2ScanErr ? " err:" + res.r2ScanErr : ""));
    eq(res.r2ScanSkipsArchived === true, "R2: scan returned a sentence from an ARCHIVED text");
    eq(res.r2ScanCarriesAnchor === true, "R2: scan rows lack text_key/order_index/he_plain (heal write-back needs the anchor)");
    eq(res.r2ScanRefusesEmpty === true, "R2: blank needles must return [] (never a full-table dump)");
    eq(res.r32TodayCount === 1, "R3.2: countTodayAllReviews must count ONLY today's non-annulled review-kind rows (expected 1, got " + res.r32TodayCount + ")" + (res.r32Err ? " err:" + res.r32Err : ""));
    eq(res.r33Day1 === 1 && res.r33Day0 === 1, "R3.3: countReviewsByLocalDay buckets wrong (12-01=" + res.r33Day1 + ", 11-30=" + res.r33Day0 + " — annul/skip must be excluded, days split)");
    eq(res.annulD1Filter === true, "P7.0a: FsrsCore.withoutAnnulled did not exclude the annulled row (D1 evidence poisoning)");

    // ── R3.1 zombie-mark backfill — a pre-P5.6 mark-only word (manual level, NO schedule, NO seed)
    // must be seeded by the sweep through the canonical markWordStatus path. Same-page via the
    // gate hook (cross-page OPFS navigation silently lands on the fallback VFS in headless).
    let r31 = null;
    try {
      r31 = await pg.evaluate(async () => {
        const ldb = await import("/db/local-db.js");
        await ldb.setWordStatus("זומבי31#noun", "l2");   // plain set → manual level, srs_due NULL (the zombie shape)
        const seeded = await window.__r31BackfillZombieSeeds();
        const rows = await ldb.dbQuery("SELECT srs_due FROM word_status WHERE lemma_key='זומבי31#noun'", []);
        const lg = await ldb.getReviewLog("זומבי31#noun");
        // idempotency: a second sweep must find nothing new for this word (no re-seed)
        await window.__r31BackfillZombieSeeds();
        const lg2 = await ldb.getReviewLog("זומבי31#noun");
        return {
          due: !!(rows && rows[0] && rows[0].srs_due),
          seedRow: lg.some((r) => r.kind === "seed"),
          noReseed: lg2.filter((r) => r.kind === "seed").length === 1,
          seededCount: seeded,
        };
      });
    } catch (e) { r31 = { err: String((e && e.message) || e) }; }
    eq(!!r31 && r31.due === true, "R3.1: sweep did not seed the zombie mark (srs_due still NULL)" + (r31 && r31.err ? " err:" + r31.err : ""));
    eq(!!r31 && r31.seedRow === true, "R3.1: seeded zombie lacks the canonical seed row (kind='seed')");
    eq(!!r31 && r31.noReseed === true, "R3.1: second sweep RE-SEEDED an already-scheduled word (must be idempotent)");

    // ── R4a paradigm-aware heal drain — a scheduled pid-word whose INFLECTED cell form appears in
    // a local sentence must be healed with that sentence (identity-gated; pair צריכה→pid:6018 is
    // live-proven on the shipped dict). Same-page via the gate hook (headless OPFS trap).
    let r4 = null;
    try {
      r4 = await pg.evaluate(async () => {
        const ldb = await import("/db/local-db.js");
        await ldb.initLocalDB();
        await ldb.createText({ id: "r4t-1", text_key: "r4-key-1", title: "r4", source_text: "" });
        await ldb.addSentence("r4t-1", { id: "r4t-1:s1", he_plain: "היא צריכה ספר חדש", he_niqqud: "הִיא צְרִיכָה סֵפֶר חָדָשׁ", ru: "ей нужна новая книга" });
        // due within the drain's +400d horizon (a 2100 due would fall OUTSIDE the pool)
        await ldb.updateSrsState("pid:6018", { due: Date.now() + 3600e3, interval: 3, reps: 1, lapses: 0, stability: 3, difficulty: 5, scheme: "fsrs" });
        await window.__r4HealDrain();
        const rows = await ldb.dbQuery("SELECT srs_surface, srs_sentence_id FROM word_status WHERE lemma_key = 'pid:6018'", []);
        return rows && rows[0] ? { surface: rows[0].srs_surface, sid: rows[0].srs_sentence_id } : null;
      });
    } catch (e) { r4 = { err: String((e && e.message) || e) }; }
    eq(!!r4 && r4.surface === "צריכה", "R4a: heal drain did not source the pid-word from its INFLECTED cell form (got " + (r4 && r4.surface) + ")" + (r4 && r4.err ? " err:" + r4.err : ""));
    eq(!!r4 && r4.sid === "r4t-1:s1", "R4a: healed source anchored to the wrong sentence (got " + (r4 && r4.sid) + ")");

    eq(errs.length === 0, "page errors: " + errs.join(" | "));

    const total = 79;
    if (failures.length) {
      console.error(`smoke:memory-canon FAIL (${total - failures.length}/${total})`);
      for (const f of failures) console.error("  ✗ " + f);
      console.error(JSON.stringify(res, null, 1).slice(0, 4000));
      process.exitCode = 1;
    } else {
      console.log(`smoke:memory-canon OK (${total}/${total}) — mig 041/042 · keyer conformance · content-id log · bundle 3-table merge · Pass 8/12 no-dup · P2 FSRS handover (seed-once · Again-due-now · plain-set-preserve · independent oracle) · P3 Studio→FSRS (scheme=fsrs · meta_json.fsrs · projections · Studio oracle) · P4 Anki-merge (canon-log ingest+filters · updateSrsState srs-only · recompute · Anki oracle) · P4.1 ''-carrier (no-demotion · manual-wins kept · recompute-carrier · merge-safe) · P7.0a annul (annulId-канон · reject-без-цели · annul-to-null удаляет carrier · ручная ось цела · withoutAnnulled для D1) · R1 source-at-mark (fill-only backfill · do-no-harm · latest-wins · scheduled-only · surface-required) · R2 scan (batched needles · archived-excluded · anchor-carrying · blank-refused) · R3.1 zombie-mark backfill (boot-seed · canonical seed row) · R4a paradigm-heal (inflected-cell needle · identity-gated anchor)`);
    }
  } catch (e) {
    console.error("smoke:memory-canon CRASH", e);
    process.exitCode = 1;
  } finally {
    await b.close().catch(() => {});
    await stop(srv.c);
  }
})();
