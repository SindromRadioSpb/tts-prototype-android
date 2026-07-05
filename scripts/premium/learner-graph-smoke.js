#!/usr/bin/env node
"use strict";
// smoke:learner-graph — CLG-P5 gate (AI_MENTOR_RECON §9 CLG-P5): Learner Graph API отдаёт
// ТО ЖЕ, что видит Зал локально, по общим осям (память srs_projections + manual-ось §4.7):
//   • /due: правило Зала (srs_due<=now AND status!='ignore') — паритет множества с локальным;
//   • /known: server manual-axis == локальная (marks-LWW), scheduled-флаг честен;
//   • /weak: lapses-first, ignore исключён;
//   • /context: counts (log_rows == локальному, due_now == |/due|, manual-разбивка) —
//     R11 honest count: context никогда не over-claim-ит vs /due.
// Один браузер-девайс (реальный OPFS) → sync → сравнение API против локальных примитивов.
// Run: node scripts/premium/learner-graph-smoke.js   (or npm run smoke:learner-graph)

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3289, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-bootstrap-secret-0123456789abcdef";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(dataDir) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO, env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return;
  c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(srv, ms = 30000) {
  const s = Date.now();
  while (Date.now() - s < ms) {
    if (srv.logs.some((l) => l.includes("EADDRINUSE"))) return false;
    try {
      const r = await fetch(BASE + "/healthz");
      if (r.status === 200) { const j = await r.json(); if (j.db && j.db.ready && j.migrations && j.migrations.ready) return true; }
    } catch (_) {}
    await sleep(200);
  }
  return false;
}

(async () => {
  const failures = []; const eq = (c, m) => { if (!c) failures.push(m); };
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright"); process.exit(1); }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-graph-smoke-"));
  const srv = startServer(scratch);
  const b = await pw.chromium.launch();

  // Runtime-relative but PRECOMPUTED timestamps (act-retry re-runs the body — ids must not drift)
  const NOW = Date.now();
  const ARGS = {
    SECRET,
    T_SEED: new Date(NOW - 40 * 86400000).toISOString(),
    T_AGAIN: new Date(NOW - 30 * 86400000).toISOString(),   // Again → due immediately (30d ago) → DUE now
    T_EASY: new Date(NOW - 3600000).toISOString(),          // Easy init → due ~+8d → NOT due now
    NOW,
  };

  try {
    if (!(await ready(srv))) { console.error("server failed (or port orphan)\n" + srv.logs.join("").slice(-2000)); process.exit(1); }
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const openOn = async (label) => {
      const pg = await ctx.newPage();
      const errs = [];
      pg.on("pageerror", (e) => errs.push(String(e)));
      await pg.goto(BASE + "/library.html?canon=skip&nocloudauto=1", { waitUntil: "load" });
      const healthy = await pg.evaluate(async () => {
        try { const ldb = await import("/db/local-db.js"); await ldb.initLocalDB(); window.__ldb = ldb; const r = await ldb.dbQuery("SELECT 1 AS x"); return !!(r && r[0]); } catch (_) { return false; }
      });
      return { pg, errs, healthy };
    };
    const act = async (label, fn, args, tries = 4) => {
      for (let i = 0; i < tries; i++) {
        const { pg, errs, healthy } = await openOn(label + (i ? "#" + i : ""));
        if (!healthy) { await pg.close().catch(() => {}); await sleep(600); continue; }
        let res = null;
        try { res = await pg.evaluate(fn, args); } catch (e) { res = { __crash: String(e) }; }
        const alive = await pg.evaluate(async () => { try { const r = await window.__ldb.dbQuery("SELECT 1 AS x"); return !!(r && r[0]); } catch (_) { return false; } }).catch(() => false);
        if (alive && !errs.some((e) => e.includes("memory access out of bounds")) && res && !res.__crash) { await pg.close().catch(() => {}); return res; }
        await pg.close().catch(() => {});
        await sleep(600);
      }
      throw new Error("act[" + label + "] failed every attempt");
    };

    const res = await act("G", async (A) => {
      const ldb = window.__ldb, LC = window.LemmaCanon, CS = window.CloudSync;
      const out = {};
      out.login = (await CS.login(A.SECRET, "graph-smoke")).ok === true;
      const W1 = "שלום#noun", W2 = "ספר#noun", W3 = "מים#noun", W4 = "דבר#noun";
      const seed = (key, at, interval) => {
        const meta = { interval, reps: 1, lapses: 0, scheme: "sm2-lite", keyer_version: 1 };
        return ldb.appendReviewLog({ id: LC.seedId(key, meta), item_key: key, kind: "seed", reviewed_at: at, grade: null, source: "seed-sm2", meta });
      };
      const rev = (key, at, grade) => {
        const row = { item_key: key, kind: "review", reviewed_at: at, grade, source: "room-recall", channel: "read:mc", meta: { keyer_version: 1, scheduler: { scheme: "fsrs" } } };
        row.id = LC.reviewId(row);
        return ldb.appendReviewLog(row);
      };
      // W1: seed + Again 30д назад → due СЕЙЧАС, lapses 1; manual l2
      await seed(W1, A.T_SEED, 3); await rev(W1, A.T_AGAIN, 1); await ldb.setWordStatus(W1, "l2");
      // W2: та же история → due сейчас, но manual IGNORE → исключён из due/weak
      await seed(W2, A.T_SEED, 3); await rev(W2, A.T_AGAIN, 1); await ldb.setWordStatus(W2, "ignore");
      // W3: Easy час назад → due в будущем; manual-ось пуста
      await rev(W3, A.T_EASY, 4);
      // W4: только manual 'known', расписания нет
      await ldb.setWordStatus(W4, "known");
      // материализуем ЛОКАЛЬНЫЕ проекции (в живом потоке это делает recall-путь/down-sync;
      // фикстура пишет лог напрямую → честно пересчитываем как P4.1-recompute)
      await ldb.recomputeSrsFromLog([W1, W2, W3]);
      const s = await CS.fullSync(ldb);
      out.sync = s.ok === true && s.counts && s.counts.local === s.counts.cloud;

      const j = async (p) => await fetch(p, { credentials: "same-origin" }).then((r) => r.json());
      out.due = await j("/api/learner/due?limit=50");
      out.known = await j("/api/learner/known");
      out.weak = await j("/api/learner/weak?limit=10");
      out.ctx = await j("/api/learner/context");

      // локальная сторона для паритета: правило Зала (srs_due<=now && status!='ignore')
      const sched = await ldb.getSrsSchedule();
      const statuses = await ldb.getAllWordStatuses();
      out.localDue = Object.entries(sched).filter(([k, v]) => v.due <= A.NOW + 60000 && (statuses[k] || "") !== "ignore").map(([k]) => k).sort();
      out.localStatuses = statuses;
      out.localLog = await ldb.countReviewLog();
      out.keys = { W1, W2, W3, W4 };
      return out;
    }, ARGS);

    eq(res.login && res.sync, "login/sync failed: " + JSON.stringify(res.sync));
    const { W1, W2, W3, W4 } = res.keys;
    const dueKeys = (res.due.rows || []).map((r) => r.item_key).sort();
    eq(res.due.ok && JSON.stringify(dueKeys) === JSON.stringify(res.localDue),
      "PARITY FAILED: /due != локальное правило Зала: api=" + JSON.stringify(dueKeys) + " local=" + JSON.stringify(res.localDue));
    eq(dueKeys.includes(W1) && !dueKeys.includes(W2) && !dueKeys.includes(W3) && !dueKeys.includes(W4),
      "/due membership wrong: " + JSON.stringify(dueKeys));
    const dueW1 = (res.due.rows || []).find((r) => r.item_key === W1);
    eq(dueW1 && dueW1.status === "l2" && Number(dueW1.lapses) === 1, "/due row must carry manual status + lapses");

    const kw = res.known.words || {};
    eq(kw[W1] && kw[W1].status === "l2" && kw[W1].scheduled === true, "/known W1 wrong: " + JSON.stringify(kw[W1]));
    eq(kw[W2] && kw[W2].status === "ignore", "/known W2 must be ignore");
    eq(kw[W3] && kw[W3].status === "" && kw[W3].scheduled === true, "/known W3 must be scheduled-without-manual");
    eq(kw[W4] && kw[W4].status === "known" && kw[W4].scheduled === false, "/known W4 must be manual-known unscheduled");
    // паритет manual-оси: серверная = локальная (по всем ключам с локальным статусом)
    let manualPar = true;
    for (const [k, st] of Object.entries(res.localStatuses)) {
      if (!kw[k] || kw[k].status !== st) { manualPar = false; failures.push("manual-axis parity broke at " + k + ": api=" + JSON.stringify(kw[k]) + " local=" + st); }
    }
    eq(manualPar, "manual-axis parity failed");

    const weakKeys = (res.weak.rows || []).map((r) => r.item_key);
    eq(res.weak.ok && weakKeys[0] === W1 && !weakKeys.includes(W2), "/weak must rank W1 first and exclude ignore: " + JSON.stringify(weakKeys));

    eq(res.ctx.ok && res.ctx.counts.log_rows === res.localLog, "/context log_rows != local countReviewLog");
    eq(res.ctx.counts.due_now === dueKeys.length, "R11 honest count: context.due_now must equal |/due|");
    eq(res.ctx.counts.scheduled === 3, "/context scheduled must be 3 (W1,W2,W3): " + res.ctx.counts.scheduled);
    eq(res.ctx.manual.l2 === 1 && res.ctx.manual.ignore === 1 && res.ctx.manual.known === 1, "/context manual breakdown wrong: " + JSON.stringify(res.ctx.manual));
    eq(Array.isArray(res.ctx.weak_sample) && res.ctx.weak_sample.length >= 1 && res.ctx.due_sample.length === dueKeys.length,
      "/context samples wrong");

    await ctx.close();
  } catch (e) {
    failures.push("CRASH: " + (e && e.stack || e));
  } finally {
    await b.close().catch(() => {});
    await stop(srv.c);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }
  const total = 14;
  if (failures.length) {
    console.error(`smoke:learner-graph FAIL (${total - failures.length}/${total})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:learner-graph OK (${total}/${total}) — CLG-P5: /due паритет с правилом Зала (ignore исключён, manual+lapses в строке) · /known == локальная manual-ось (LWW) + честный scheduled-флаг · /weak lapses-first без ignore · /context honest counts (due_now == |/due|, log_rows == локальному, manual-разбивка)`);
  }
})();
