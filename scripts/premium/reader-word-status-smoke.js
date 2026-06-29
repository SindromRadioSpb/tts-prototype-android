#!/usr/bin/env node
"use strict";
// smoke:reader-word-status — BRR Epic 4 keystone backbone gate.
// Boots library.html (real OPFS DB + migrations incl. 057_word_status), then proves the MANUAL
// reader-knowledge status store + its manual-wins overlay onto getKnownWordStates:
//   1) setWordStatus(lemmaKey, 'known') persists + getAllWordStatuses returns it;
//   2) getKnownWordStates() reflects the manual status for a lemma with NO note (mark-known-without-
//      a-flashcard — the LingQ pattern + the audit's "OPFS status store separate from notes");
//   3) manual-wins: an explicit status overrides the SRS-derived value for the same lemma;
//   4) clearing (status '') removes the row (reset to new/unseen).
// Small writes only (OPFS-headless-safe). Run: node scripts/premium/reader-word-status-smoke.js

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3297, BASE = "http://127.0.0.1:" + PORT;
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
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });

    const res = await pg.evaluate(async () => {
      const ldb = await import("/db/local-db.js");
      await ldb.initLocalDB();        // idempotent — starts the DB worker + runs migrations (incl. 057)
      const KEY = "pid:99977001";   // synthetic lemma, no note
      await ldb.setWordStatus(KEY, "known");
      const all1 = await ldb.getAllWordStatuses();
      const get1 = await ldb.getWordStatus(KEY);
      const kws1 = await ldb.getKnownWordStates();   // manual must appear even with NO note
      await ldb.setWordStatus(KEY, "l2");            // change level (upsert)
      const kws2 = await ldb.getKnownWordStates();
      await ldb.setWordStatus(KEY, "");              // clear → reset to new
      const all3 = await ldb.getAllWordStatuses();
      const kws3 = await ldb.getKnownWordStates();
      // invalid value → treated as clear (never persisted)
      await ldb.setWordStatus(KEY, "bogus");
      const all4 = await ldb.getAllWordStatuses();
      // «new» IS a storable status (so an UNCONFIDENT word can be marked purple) — must persist + overlay.
      const NKEY = "כוס#";
      await ldb.setWordStatus(NKEY, "new");
      const allN = await ldb.getAllWordStatuses();
      const kwsN = await ldb.getKnownWordStates();
      await ldb.setWordStatus(NKEY, "");   // cleanup
      // getContinueReading («Продолжить чтение» on the Corpus tab) must surface ONLY Ben-Yehuda canon
      // works (source_meta.origin='benyehuda-ingest'), NOT local Studio texts (owner 2026-06-27).
      let contCanon = null, contStudio = null;
      try {
        await ldb.createText({ id: "cont-canon-x1", text_key: "cont-canon-k1", title: "CANON WORK", source: "Project Ben-Yehuda", source_meta_json: JSON.stringify({ origin: "benyehuda-ingest" }) });
        await ldb.createText({ id: "cont-studio-x1", text_key: "cont-studio-k1", title: "STUDIO TEXT" });   // no source_meta → local
        await ldb.setProgress("cont-canon-x1", { last_row_idx: 5 });
        await ldb.setProgress("cont-studio-x1", { last_row_idx: 5 });
        const cont = await ldb.getContinueReading(50);
        const ids = (cont || []).map((c) => c.id);
        contCanon = ids.includes("cont-canon-x1");
        contStudio = ids.includes("cont-studio-x1");
        try { await ldb.deleteText("cont-canon-x1"); await ldb.deleteText("cont-studio-x1"); } catch (_) {}
      } catch (e) { contCanon = "ERR:" + e.message; }
      // C2 — SRS schedule (migration 058): a recall write persists the schedule; a PLAIN status set
      // must PRESERVE it (UPSERT, not REPLACE). getSrsSchedule returns due/interval/reps/lapses.
      let srsSet = null, srsPreserved = null, srsStatusAfter = null, srsErr = null;
      try {
        const SK = "pid:99977050";
        await ldb.setWordStatus(SK, "l2", { due: 1700000000000, interval: 3, reps: 2, lapses: 0 });
        srsSet = (await ldb.getSrsSchedule())[SK] || null;
        await ldb.setWordStatus(SK, "l3");   // plain set — MUST preserve srs_*
        srsPreserved = (await ldb.getSrsSchedule())[SK] || null;
        srsStatusAfter = (await ldb.getAllWordStatuses())[SK] || null;
        await ldb.setWordStatus(SK, "");     // cleanup
      } catch (e) { srsErr = String(e); }
      // D7 — study_day ledger (migration 059): recordRecall increments the genuine-recall count;
      // noteAvailable keeps the per-day MAX available; getStudyDays returns the raw rows (streak fold).
      // A malformed day-key must be rejected. (Far-future synthetic day; assertions rerun-tolerant.)
      let d7 = null, d7Bad = null, d7Err = null;
      try {
        const DAY = "2099-01-15";
        await ldb.noteAvailable(DAY, 8);            // session built: 8 trainable
        await ldb.recordRecall(DAY, 8);             // one genuine recall
        await ldb.recordRecall(DAY, 12);            // another (available grows to MAX 12)
        d7Bad = await ldb.recordRecall("not-a-day", 5);   // malformed → must reject
        const sdRows = await ldb.getStudyDays("2099-01-01");
        d7 = (sdRows || []).find((x) => x.day === DAY) || null;
      } catch (e) { d7Err = String(e); }
      return { set: all1[KEY], get: get1, inKws: kws1[KEY], changed: kws2[KEY], clearedAll: all3[KEY], clearedKws: kws3[KEY], bogus: all4[KEY], newSet: allN[NKEY], newKws: kwsN[NKEY], contCanon, contStudio, srsSet, srsPreserved, srsStatusAfter, srsErr, d7, d7Bad, d7Err };
    });

    eq(res.set === "known", "setWordStatus('known') must persist (getAllWordStatuses), got " + JSON.stringify(res.set));
    eq(res.get === "known", "getWordStatus must return 'known', got " + JSON.stringify(res.get));
    eq(res.inKws === "known", "manual status must overlay getKnownWordStates for a lemma with NO note (LingQ mark-known), got " + JSON.stringify(res.inKws));
    eq(res.changed === "l2", "upsert to level 'l2' must take effect in getKnownWordStates, got " + JSON.stringify(res.changed));
    eq(res.clearedAll === undefined, "clearing (status '') must DELETE the row, got " + JSON.stringify(res.clearedAll));
    eq(res.clearedKws === undefined, "cleared lemma must no longer overlay getKnownWordStates, got " + JSON.stringify(res.clearedKws));
    eq(res.bogus === undefined, "an invalid status value must be treated as clear (never persisted), got " + JSON.stringify(res.bogus));
    eq(res.newSet === "new", "setWordStatus('new') MUST persist (an unconfident word can be marked «новое»/purple), got " + JSON.stringify(res.newSet));
    eq(res.newKws === "new", "stored 'new' must overlay getKnownWordStates, got " + JSON.stringify(res.newKws));
    eq(res.contCanon === true, "getContinueReading MUST include a Ben-Yehuda canon work (origin=benyehuda-ingest), got " + JSON.stringify(res.contCanon));
    eq(res.contStudio === false, "getContinueReading MUST EXCLUDE a local Studio text (no canon origin) from the Corpus «Продолжить чтение», got " + JSON.stringify(res.contStudio));
    // C2 — SRS schedule (migration 058)
    eq(res.srsErr === null, "C2 SRS schedule path must not error (migration 058 columns), got " + JSON.stringify(res.srsErr));
    eq(res.srsSet && res.srsSet.interval === 3 && res.srsSet.reps === 2, "setWordStatus(status, sched) must persist the SRS schedule (getSrsSchedule), got " + JSON.stringify(res.srsSet));
    eq(res.srsPreserved && res.srsPreserved.interval === 3 && res.srsPreserved.reps === 2, "a PLAIN setWordStatus must PRESERVE the SRS schedule (UPSERT, not REPLACE), got " + JSON.stringify(res.srsPreserved));
    eq(res.srsStatusAfter === "l3", "the plain set must still update the status (→l3) while preserving srs, got " + JSON.stringify(res.srsStatusAfter));
    // D7 — study_day ledger (migration 059)
    eq(res.d7Err === null, "D7 study_day ledger path must not error (migration 059 table), got " + JSON.stringify(res.d7Err));
    eq(res.d7 && res.d7.recalls >= 2 && res.d7.available === 12, "recordRecall must increment recalls + noteAvailable must keep the per-day MAX available (=12), got " + JSON.stringify(res.d7));
    eq(res.d7Bad === false, "recordRecall must reject a malformed day-key (not YYYY-MM-DD), got " + JSON.stringify(res.d7Bad));
    eq(errs.length === 0, "no pageerror, got: " + errs.join(" | "));

    console.log("reader-word-status: word_status store + manual-wins overlay (no-note mark-known + upsert + clear)");
    if (failures.length) { console.error("\nFAIL (" + failures.length + "):"); for (const f of failures) console.error("  ✗ " + f); await b.close(); await stop(srv.c); process.exit(1); }
    console.log("PASS — reader-word-status smoke green");
  } finally { await b.close(); await stop(srv.c); }
})().catch((e) => { console.error("fatal", e); process.exit(1); });
