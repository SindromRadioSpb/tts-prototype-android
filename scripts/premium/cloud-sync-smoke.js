#!/usr/bin/env node
"use strict";
// smoke:cloud-sync — CLG-P3 Browser Sync Bridge gate (AI_MENTOR_RECON_2026_07_04.md §9 CLG-P3).
// Node-unit: D3 seedId (детерминизм + stable-key-order) · replay multi-seed earliest-wins ·
// annul-нейтральность. Browser (playwright, THREE isolated contexts = три устройства одного
// владельца против одного scratch-сервера):
//   A: локальные seed+review → fullSync (cutover full-scan verify) → server==local, повторный
//      sync идемпотентен, surface вырезан на сервере, но ЦЕЛ локально (§5 B5);
//   B (second-device onboarding, ДИВЕРГЕНТНЫЙ до-sync профиль): свой content-hash seed того же
//      item_key + свой review + ручной статус l2 → union: обе seed-строки живы, replay(union)
//      детерминирован (earliest seed), проекция = replay (оракул), manual-ось не тронута;
//   A второй sync → подтянул строки B: checksum(A) == checksum(B) == server count;
//   C (fresh-device bootstrap, пустой OPFS): fullSync → полная реплика + replay parity с B;
//   reconcile: equal=true.
// Run: node scripts/premium/cloud-sync-smoke.js   (or npm run smoke:cloud-sync)

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3293, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-bootstrap-secret-0123456789abcdef";
const KEY = "שלום#noun";
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
    // fail fast on a port orphan: an EADDRINUSE'd child means healthz would be answered by a
    // STALE foreign server (the 2026-07-05 debugging lesson — every assert then lies)
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

  // ── Node-unit: D3 seedId + replay contracts ──────────────────────────────
  const LC = require(path.join(REPO, "public", "js", "lemma-canon.js"));
  const FC = require(path.join(REPO, "public", "js", "fsrs-core.js"));
  eq(LC.seedId(KEY, { a: 1, b: 2 }) === LC.seedId(KEY, { b: 2, a: 1 }), "seedId must be stable-key-order deterministic");
  eq(LC.seedId(KEY, { interval: 3 }) !== LC.seedId(KEY, { interval: 1 }), "different snapshots must hash to different seed ids");
  eq(/^seed:.+#[0-9a-f]{12}$/.test(LC.seedId(KEY, {})), "seedId shape wrong");
  const T1 = "2026-07-01T10:00:00.000Z", T2 = "2026-07-02T10:00:00.000Z", T3 = "2026-07-01T11:00:00.000Z", T4 = "2026-07-03T10:00:00.000Z";
  const seedRow = (at, interval) => ({ id: LC.seedId(KEY, { interval }), item_key: KEY, kind: "seed", reviewed_at: at, grade: null, source: "seed-sm2", meta_json: JSON.stringify({ interval, reps: 1, lapses: 0, scheme: "sm2-lite" }) });
  const revRow = (at, grade) => ({ id: LC.reviewId({ item_key: KEY, reviewed_at: at, grade, source: "x", channel: "" }), item_key: KEY, kind: "review", reviewed_at: at, grade, source: "x", meta_json: "{}" });
  const ordered = (rows) => rows.slice().sort((a, b) => (a.reviewed_at < b.reviewed_at ? -1 : a.reviewed_at > b.reviewed_at ? 1 : (a.id < b.id ? -1 : 1)));
  const multi = ordered([seedRow(T1, 10), revRow(T2, 3), seedRow(T3, 1), revRow(T4, 3)]);
  const single = ordered([seedRow(T1, 10), revRow(T2, 3), revRow(T4, 3)]);
  const sMulti = FC.replay(multi), sSingle = FC.replay(single);
  eq(sMulti && sSingle && Math.abs(sMulti.stability - sSingle.stability) < 1e-9 && sMulti.reps === sSingle.reps,
    "multi-seed replay must equal earliest-seed fold (later seed skipped)");
  const withAnnul = ordered([seedRow(T1, 10), revRow(T2, 3), { id: "annul:x", item_key: KEY, kind: "annul", reviewed_at: T4, grade: null, source: "op", meta_json: JSON.stringify({ annul_of: "y" }) }]);
  const noAnnul = ordered([seedRow(T1, 10), revRow(T2, 3)]);
  const sA1 = FC.replay(withAnnul), sA0 = FC.replay(noAnnul);
  eq(sA1 && sA0 && Math.abs(sA1.stability - sA0.stability) < 1e-9 && sA1.reps === sA0.reps, "annul row must be replay-neutral until CLG-P4");
  // P3.2 — mark rows (manual axis) are replay-neutral too
  const withMark = ordered([seedRow(T1, 10), revRow(T2, 3), { id: "mark:x", item_key: KEY, kind: "mark", reviewed_at: T4, grade: null, source: "word-mark", meta_json: JSON.stringify({ status: "l2" }) }]);
  const sM1 = FC.replay(withMark);
  eq(sM1 && Math.abs(sM1.stability - sA0.stability) < 1e-9 && sM1.reps === sA0.reps, "mark row must be replay-neutral (manual axis is never memory)");

  // ── Browser: three devices, one owner ────────────────────────────────────
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright"); process.exit(1); }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-cloudsync-"));
  const srv = startServer(scratch);
  const b = await pw.chromium.launch();
  try {
    if (!(await ready(srv))) { console.error("server failed (or port orphan)\n" + srv.logs.join("").slice(-2000)); process.exit(1); }

    // Devices = isolated contexts (isolated OPFS/cookies). wa-sqlite WASM crashes ("memory access
    // out of bounds") when a SECOND concurrent page holds its own OPFS handle headless → serialize:
    // at most ONE open page at a time; OPFS persists for the context's lifetime, so a device's
    // page can be closed and reopened between acts (headless-OPFS trap, feedback_headless_opfs).
    const mkDevice = async () => b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    // wa-sqlite headless flake ("memory access out of bounds"): WASM can die at boot OR mid-work,
    // after which every query silently no-ops. Every device act below is IDEMPOTENT by design
    // (content-deterministic ids + OR IGNORE + same-value marks + idempotent sync), so the harness
    // retries the WHOLE act on a fresh page (fresh WASM; OPFS persists in the context) — mirrors a
    // real-world reload. An attempt counts only if the DB is still alive AFTER the act.
    const openOn = async (ctx, label) => {
      const pg = await ctx.newPage();
      const errs = [];
      pg.on("pageerror", (e) => errs.push(String(e)));
      await pg.goto(BASE + "/library.html?canon=skip&nocloudauto=1", { waitUntil: "load" });
      const healthy = await pg.evaluate(async () => {
        try {
          const ldb = await import("/db/local-db.js");
          await ldb.initLocalDB();
          window.__ldb = ldb;
          const r = await ldb.dbQuery("SELECT 1 AS x");
          return !!(r && r[0] && Number(r[0].x) === 1);
        } catch (_) { return false; }
      });
      return { pg, errs, healthy };
    };
    const act = async (ctx, label, fn, args, tries = 4) => {
      for (let i = 0; i < tries; i++) {
        const { pg, errs, healthy } = await openOn(ctx, label + (i ? "#" + i : ""));
        if (!healthy) { await pg.close().catch(() => {}); await sleep(600); continue; }
        let res = null;
        try { res = await pg.evaluate(fn, args); } catch (e) { res = { __crash: String(e) }; }
        const alive = await pg.evaluate(async () => {
          try { const r = await window.__ldb.dbQuery("SELECT 1 AS x"); return !!(r && r[0]); } catch (_) { return false; }
        }).catch(() => false);
        const oob = errs.some((e) => e.includes("memory access out of bounds"));
        if (alive && !oob && res && !res.__crash) return { pg, res };
        await pg.close().catch(() => {});
        await sleep(600);
      }
      throw new Error("act[" + label + "]: DB died in every attempt");
    };

    // Device A — local history → first sync (cutover)
    const ctxA = await mkDevice();
    const fnA = async ({ SECRET, KEY }) => {
      const ldb = window.__ldb, LC = window.LemmaCanon, CS = window.CloudSync;
      const out = {};
      try {
      const login = await CS.login(SECRET, "device-A");
      out.login = login.ok === true;
      const seedMeta = { interval: 3, reps: 2, lapses: 0, scheme: "sm2-lite", seedAlgoVersion: 1, keyer_version: 1 };
      await ldb.appendReviewLog({ id: LC.seedId(KEY, seedMeta), item_key: KEY, kind: "seed", reviewed_at: "2026-07-01T10:00:00.000Z", grade: null, source: "seed-sm2", meta: seedMeta });
      const r1 = { item_key: KEY, kind: "review", reviewed_at: "2026-07-02T10:00:00.000Z", grade: 3, source: "room-recall", channel: "read:mc", meta: { keyer_version: 1, scheduler: { scheme: "fsrs" }, surface: "שָׁלוֹם" } };
      r1.id = LC.reviewId(r1);
      await ldb.appendReviewLog(r1);
      out.r1id = r1.id;
      // P3.2 backfill fixture: a manual status asserted BEFORE mark-emission existed (direct SQL,
      // no mark row) — the cutover backfill must mint its synthetic mark and ship it. OR IGNORE:
      // the act-retry harness may re-run this body on a fresh page over the same OPFS.
      await ldb.dbRun(`INSERT OR IGNORE INTO word_status (lemma_key, status, updated_at) VALUES ('ספר#noun', 'known', '2026-07-01T09:00:00.000Z')`);
      const s1 = await CS.fullSync(ldb);
      out.sync1 = s1.ok === true;
      out.sync1Raw = s1;
      out.cutover = (await ldb.getSyncState("cutover_ok")) === "1";
      out.backfillMark = (await ldb.getReviewLog("ספר#noun")).some((w) => w.kind === "mark" && w.source === "mark-backfill");
      const countsRes = await fetch("/api/learner/counts", { credentials: "same-origin" });
      out.countsStatus = countsRes.status;
      const countsText = await countsRes.text();
      let counts = {}; try { counts = JSON.parse(countsText); } catch (_) { out.countsBody = countsText.slice(0, 200); }
      out.serverCount = counts.review_log;
      out.localCount = await ldb.countReviewLog();
      const s2 = await CS.fullSync(ldb);
      out.sync2Idempotent = s2.ok === true && s2.up.new === 0 && s2.down.pulled === 0;
      // §5 B5: server copy has surface STRIPPED, local copy keeps it
      const srvLogRes = await fetch("/api/learner/log?limit=100", { credentials: "same-origin" });
      out.srvLogStatus = srvLogRes.status;
      const srvLogText = await srvLogRes.text();
      let srvLog = {}; try { srvLog = JSON.parse(srvLogText); } catch (_) { out.srvLogBody = srvLogText.slice(0, 200); }
      const srvR1 = (srvLog.rows || []).find((w) => w.id === r1.id);
      out.serverStripped = !!srvR1 && !("surface" in JSON.parse(srvR1.meta_json));
      const localR1 = (await ldb.getReviewLog(KEY)).find((w) => w.id === r1.id);
      out.localFull = !!localR1 && JSON.parse(localR1.meta_json).surface === "שָׁלוֹם";
      } catch (e) { out.err = String(e && e.stack || e); }
      return out;
    };
    const actA = await act(ctxA, "A", fnA, { SECRET, KEY });
    const aRes = actA.res;
    await actA.pg.close();
    if (aRes.err) failures.push("A evaluate err: " + aRes.err + " | out: " + JSON.stringify(aRes).slice(0, 600));
    eq(aRes.login, "A: login failed");
    eq(aRes.sync1, "A: first fullSync failed: " + JSON.stringify(aRes.sync1Raw) + " counts:" + aRes.countsStatus + " " + (aRes.countsBody || ""));
    eq(aRes.cutover, "A: cutover_ok not set after full-scan verify");
    eq(aRes.backfillMark, "A: cutover backfill did not mint the synthetic mark for a pre-mark manual status");
    eq(aRes.serverCount === 3 && aRes.localCount === 3, "A: server/local counts wrong (want 3 = seed+review+backfill-mark): " + JSON.stringify(aRes));
    eq(aRes.sync2Idempotent, "A: second fullSync must be a no-op");
    eq(aRes.serverStripped, "A: surface must be STRIPPED server-side");
    eq(aRes.localFull, "A: local meta must keep surface (strip is upload-only)");

    // Device B — second-device onboarding with a DIVERGENT pre-sync profile
    const ctxB = await mkDevice();
    const fnB = async ({ SECRET, KEY }) => {
      const ldb = window.__ldb, LC = window.LemmaCanon, CS = window.CloudSync, FC = window.FsrsCore;
      const out = {};
      out.login = (await CS.login(SECRET, "device-B")).ok === true;
      await ldb.setWordStatus(KEY, "l2");   // manual mark → emits a kind='mark' row (P3.2)
      const seedMetaB = { interval: 1, reps: 1, lapses: 0, scheme: "sm2-lite", seedAlgoVersion: 1, keyer_version: 1 };
      await ldb.appendReviewLog({ id: LC.seedId(KEY, seedMetaB), item_key: KEY, kind: "seed", reviewed_at: "2026-07-01T11:00:00.000Z", grade: null, source: "seed-sm2", meta: seedMetaB });
      const r2 = { item_key: KEY, kind: "review", reviewed_at: "2026-07-03T10:00:00.000Z", grade: 3, source: "reading-tap", channel: "reading:tap", meta: { keyer_version: 1, scheduler: { scheme: "fsrs" } } };
      r2.id = LC.reviewId(r2);
      await ldb.appendReviewLog(r2);
      const s = await CS.fullSync(ldb);
      out.sync = s.ok === true;
      out.localCount = await ldb.countReviewLog();                     // union: A's 3 + B's 3
      const hist = await ldb.getReviewLog(KEY);
      out.seedsInUnion = hist.filter((w) => w.kind === "seed").length; // BOTH seeds survive (D3)
      const replayState = FC.replay(hist);
      out.replayStability = replayState ? replayState.stability : null;
      const sched = (await ldb.getSrsSchedule())[KEY];
      out.oracle = !!(replayState && sched && Math.abs(replayState.stability - sched.stability) < 1e-7);
      out.manualIntact = (await ldb.getWordStatus(KEY)) === "l2";      // no remote mark for KEY → LWW keeps l2
      out.seferLww = (await ldb.getWordStatus("ספר#noun")) === "known"; // A's backfill mark → LWW applied here
      const ck = await ldb.reviewLogChecksum(LC.sha1Hex);
      out.checksum = ck.sha1; out.count = ck.count;
      return out;
    };
    const actB = await act(ctxB, "B", fnB, { SECRET, KEY });
    const bRes = actB.res;
    await actB.pg.close();
    eq(bRes.login, "B: login failed");
    eq(bRes.sync, "B: fullSync failed");
    eq(bRes.localCount === 6, "B: union must have 6 rows, got " + bRes.localCount);
    eq(bRes.seedsInUnion === 2, "D3 FAILED: both devices' seeds must survive the union, got " + bRes.seedsInUnion);
    eq(bRes.oracle, "B: projection must equal replay(union) after down-sync recompute");
    eq(bRes.manualIntact, "B: local manual l2 must survive the sync (no newer remote mark)");
    eq(bRes.seferLww, "LWW FAILED: A's backfilled 'known' mark must arrive on B");

    // Device A — act 2a: pull B's rows; checksums converge (read-only + sync → fully retry-safe)
    const fnA2a = async ({ KEY }) => {
      const ldb = window.__ldb, LC = window.LemmaCanon, CS = window.CloudSync, FC = window.FsrsCore;
      const s = await CS.fullSync(ldb);
      const ck = await ldb.reviewLogChecksum(LC.sha1Hex);
      const st = FC.replay(await ldb.getReviewLog(KEY));
      const lwwGotL2 = (await ldb.getWordStatus(KEY)) === "l2";   // B's mark arrived + applied
      const rec = await CS.reconcile(ldb);
      return { ok: s.ok === true, count: ck.count, checksum: ck.sha1,
               stability: st ? st.stability : null, lwwGotL2, reconEqual: rec.ok === true && rec.equal === true };
    };
    const actA2a = await act(ctxA, "A2a", fnA2a, { KEY });
    const aRes2 = actA2a.res;
    await actA2a.pg.close();
    eq(aRes2.ok, "A: pull sync failed");
    eq(aRes2.count === 6 && aRes2.checksum === bRes.checksum, "LOSSLESS FAILED: checksum(A) != checksum(B) after full two-way sync");
    eq(Math.abs((aRes2.stability || 0) - (bRes.replayStability || -1)) < 1e-9, "replay(union) must be identical on A and B");
    eq(aRes2.lwwGotL2, "LWW FAILED: B's l2 mark must arrive and apply on A");
    eq(aRes2.reconEqual, "reconcile must report equal");

    // Device A — act 2b: a NEWER mark (l3) travels A→others (same-value re-mark = no dup row)
    const fnA2b = async ({ KEY }) => {
      const ldb = window.__ldb, LC = window.LemmaCanon, CS = window.CloudSync;
      await ldb.setWordStatus(KEY, "l3");
      const s2 = await CS.fullSync(ldb);
      const ck2 = await ldb.reviewLogChecksum(LC.sha1Hex);
      return { ok: s2.ok === true, checksumAfter: ck2.sha1, countAfter: ck2.count };
    };
    const actA2b = await act(ctxA, "A2b", fnA2b, { KEY });
    const aRes2b = actA2b.res;
    await actA2b.pg.close();
    eq(aRes2b.ok && aRes2b.countAfter === 7, "A: the l3 mark must append exactly one row (got " + aRes2b.countAfter + ")");

    // Device B — act 2: cursor-hole HEAL (the owner's live iPhone bug: 11 rows skipped by the
    // v1 ingested_at cursor). Simulate a hole by dropping one synced row locally (harness-only
    // surgery) → fullSync must detect local≠server and auto-heal via full re-download.
    const fnB2 = async () => {
      const ldb = window.__ldb, CS = window.CloudSync;
      const del = await ldb.dbQuery("SELECT id, kind, source FROM review_log ORDER BY rowid LIMIT 1");
      await ldb.dbRun("DELETE FROM review_log WHERE rowid IN (SELECT rowid FROM review_log ORDER BY rowid LIMIT 1)");
      const before = await ldb.countReviewLog();
      const s = await CS.fullSync(ldb);
      const after = await ldb.countReviewLog();
      const rows = await ldb.dbQuery("SELECT id, kind, source, reviewed_at FROM review_log ORDER BY rowid");
      return { before, after, healed: s.healed === true, countsEqual: !!(s.counts && s.counts.local === s.counts.cloud),
               deleted: del && del[0], allRows: rows };
    };
    const actB2 = await act(ctxB, "B2", fnB2, {});
    await actB2.pg.close();
    eq(actB2.res.healed && actB2.res.countsEqual, "HEAL FAILED: count mismatch must trigger the one-shot auto-heal: " + JSON.stringify(actB2.res));
    eq(actB2.res.after === 7 && actB2.res.after > actB2.res.before, "HEAL FAILED: the dropped row must be re-downloaded (before=" + actB2.res.before + " after=" + actB2.res.after + ") deleted=" + JSON.stringify(actB2.res.deleted) + " rows=" + JSON.stringify(actB2.res.allRows));

    // Device C — fresh-device bootstrap (empty OPFS → full replica incl. the manual axis)
    const ctxC = await mkDevice();
    const fnC = async ({ SECRET, KEY }) => {
      const ldb = window.__ldb, LC = window.LemmaCanon, CS = window.CloudSync, FC = window.FsrsCore;
      const out = {};
      out.login = (await CS.login(SECRET, "device-C")).ok === true;
      const s = await CS.fullSync(ldb);
      out.sync = s.ok === true;
      const ck = await ldb.reviewLogChecksum(LC.sha1Hex);
      out.count = ck.count; out.checksum = ck.sha1;
      const st = FC.replay(await ldb.getReviewLog(KEY));
      out.stability = st ? st.stability : null;
      const sched = (await ldb.getSrsSchedule())[KEY];
      out.oracle = !!(st && sched && Math.abs(st.stability - sched.stability) < 1e-7);
      out.statusKey = await ldb.getWordStatus(KEY);              // LWW newest = A's l3
      out.statusSefer = await ldb.getWordStatus("ספר#noun");     // backfilled 'known'
      return out;
    };
    const actC = await act(ctxC, "C", fnC, { SECRET, KEY });
    const cRes = actC.res;
    const pgC = actC.pg;
    eq(cRes.login && cRes.sync, "C: bootstrap login/sync failed");
    eq(cRes.count === 7 && cRes.checksum === aRes2b.checksumAfter, "FRESH-DEVICE BOOTSTRAP FAILED: replica != union");
    eq(cRes.oracle && Math.abs((cRes.stability || 0) - (bRes.replayStability || -1)) < 1e-9, "C: replay parity + oracle failed");
    eq(cRes.statusKey === "l3" && cRes.statusSefer === "known", "C: manual axis must bootstrap via marks (want l3/known, got " + cRes.statusKey + "/" + cRes.statusSefer + ")");

    // R4 UI — the «☁» modal at 380px (light): honest connected state + counters. Screenshot for review.
    await pgC.evaluate(() => { document.getElementById("roomCloud").click(); });
    await sleep(900);   // _cloudRender fetches counts
    await pgC.screenshot({ path: ".tmp/cloud-sheet-380.png" });
    await pgC.close();

    await ctxA.close(); await ctxB.close(); await ctxC.close();
  } catch (e) {
    failures.push("CRASH: " + (e && e.stack || e));
  } finally {
    await b.close().catch(() => {});
    await stop(srv.c);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }
  const total = 32;
  if (failures.length) {
    console.error(`smoke:cloud-sync FAIL (${total - failures.length}/${total})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:cloud-sync OK (${total}/${total}) — CLG-P3.1+P3.2: D3 seedId+earliest-wins · annul/mark replay-neutral · cutover full-scan verify · идемпотентный re-sync · client-side strip · backfill-mark на cutover · second-device onboarding (union, оба seed живы, оракул) · manual-ось LWW (l2→A, l3→C, 'known' backfill→B/C) · lossless checksum A==B==C · fresh-device bootstrap (память+ось) · reconcile equal · ☁-модал скриншот 380px`);
  }
})();
