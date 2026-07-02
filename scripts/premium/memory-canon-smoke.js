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
        out.studioLogged = rlStudio.length === 1 && rlStudio[0].source === "studio-trainer" && String(rlStudio[0].id).startsWith("sre:") && Number(rlStudio[0].grade) === 3;
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

      return out;
    });

    // ── assertions ──────────────────────────────────────────────────────────────────────
    eq(res.hasLC, "LemmaCanon global missing (script tag / load order)");
    eq(res.hasNA, "NotesAutoGen missing");
    eq(res.mig041IsReviewLog, "041_review_log is not at index 40 (label==index broken)");
    eq(res.mig042IsFsrs, "042_word_status_fsrs is not at index 41 (label==index broken)");
    eq(res.migApplied === res.migCount, `applied schema version ${res.migApplied} != MIGRATIONS.length ${res.migCount}`);
    eq(res.migCount === 42, `MIGRATIONS.length ${res.migCount} != 42 — labels no longer equal real indexes (recon §3.6)`);
    eq(res.rlQueryable, "review_log not queryable");
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
    eq(res.studioLogIdempotent === true, "Studio sre:-row duplicated by bundle re-imports");
    eq(res.hasFC === true, "FsrsCore/fsrsStep not loaded in library.html" + (res.p2Err ? " err:" + res.p2Err : ""));
    eq(res.p2LegacyShape === true, "legacy schedule row lost its shape");
    eq(res.p2Seeded === true, "fsrsStep did not seed a legacy row");
    eq(res.p2SchemeFlipped === true, "recall write did not flip srs_scheme to fsrs / persist DSR state");
    eq(res.p2NoReseed === true, "fsrs-owned word was RE-seeded on second review");
    eq(res.p2AgainDueNow === true, "Again did not put the word due-now with interval projection 0");
    eq(res.p2PlainSetPreserves === true, "plain status set WIPED the fsrs columns (UPSERT-preserve regression)");
    eq(res.p2Oracle === true, "INDEPENDENT ORACLE failed: replay(review_log) != stored state" + (res.p2Err ? " err:" + res.p2Err : ""));
    eq(errs.length === 0, "page errors: " + errs.join(" | "));

    const total = 37;
    if (failures.length) {
      console.error(`smoke:memory-canon FAIL (${total - failures.length}/${total})`);
      for (const f of failures) console.error("  ✗ " + f);
      console.error(JSON.stringify(res, null, 1).slice(0, 4000));
      process.exitCode = 1;
    } else {
      console.log(`smoke:memory-canon OK (${total}/${total}) — mig 041/042 · keyer conformance · content-id log · bundle 3-table merge · Pass 8/12 no-dup · P2 FSRS handover (seed-once · Again-due-now · plain-set-preserve · independent oracle replay==stored)`);
    }
  } catch (e) {
    console.error("smoke:memory-canon CRASH", e);
    process.exitCode = 1;
  } finally {
    await b.close().catch(() => {});
    await stop(srv.c);
  }
})();
