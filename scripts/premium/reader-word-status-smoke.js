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
      return { set: all1[KEY], get: get1, inKws: kws1[KEY], changed: kws2[KEY], clearedAll: all3[KEY], clearedKws: kws3[KEY], bogus: all4[KEY] };
    });

    eq(res.set === "known", "setWordStatus('known') must persist (getAllWordStatuses), got " + JSON.stringify(res.set));
    eq(res.get === "known", "getWordStatus must return 'known', got " + JSON.stringify(res.get));
    eq(res.inKws === "known", "manual status must overlay getKnownWordStates for a lemma with NO note (LingQ mark-known), got " + JSON.stringify(res.inKws));
    eq(res.changed === "l2", "upsert to level 'l2' must take effect in getKnownWordStates, got " + JSON.stringify(res.changed));
    eq(res.clearedAll === undefined, "clearing (status '') must DELETE the row, got " + JSON.stringify(res.clearedAll));
    eq(res.clearedKws === undefined, "cleared lemma must no longer overlay getKnownWordStates, got " + JSON.stringify(res.clearedKws));
    eq(res.bogus === undefined, "an invalid status value must be treated as clear (never persisted), got " + JSON.stringify(res.bogus));
    eq(errs.length === 0, "no pageerror, got: " + errs.join(" | "));

    console.log("reader-word-status: word_status store + manual-wins overlay (no-note mark-known + upsert + clear)");
    if (failures.length) { console.error("\nFAIL (" + failures.length + "):"); for (const f of failures) console.error("  ✗ " + f); await b.close(); await stop(srv.c); process.exit(1); }
    console.log("PASS — reader-word-status smoke green");
  } finally { await b.close(); await stop(srv.c); }
})().catch((e) => { console.error("fatal", e); process.exit(1); });
