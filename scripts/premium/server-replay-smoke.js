#!/usr/bin/env node
"use strict";
// smoke:server-replay — CLG-P4 gate (AI_MENTOR_RECON §9 CLG-P4): серверный FSRS-replay +
// НЕЗАВИСИМЫЙ оракул. Три реализации сверяются на committed golden-векторах replay-over-log:
//   (1) fsrs-core.js (общий движок клиента и сервера),
//   (2) живой ts-fsrs@5.4.1 reference-replay (спек-реимплементация продукт-контрактов,
//       lib/fsrs-reference-replay.js — НЕ импортирует fsrs-core),
//   (3) committed fixture replay-log-golden-v1.json (дрейф-трипваер).
// Затем e2e: boot scratch-сервера → ingest сценарных логов через API → srs_projections
// (ingest-triggered) == expected; oracle clean; TEETH: порча stored-проекции → oracle ловит →
// rebuild → clean; mark-only ключ не создаёт проекцию.
// Run: node scripts/premium/server-replay-smoke.js   (or npm run smoke:server-replay)

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3291, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-bootstrap-secret-0123456789abcdef";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FC = require(path.join(REPO, "public", "js", "fsrs-core.js"));
const { referenceReplay } = require("./lib/fsrs-reference-replay");
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "fsrs", "replay-log-golden-v1.json"), "utf8"));
// P7.0a — annul-семантика (TELEGRAM_P7_DECISION): отдельный v2-файл; v1 остаётся
// байт-стабильным (встроенное do-no-harm доказательство).
const FIXTURE2 = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "fsrs", "replay-log-golden-v2.json"), "utf8"));
const SCN = [...FIXTURE.scenarios, ...FIXTURE2.scenarios];

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
async function api(method, p, { cookie, csrf, body } = {}) {
  const h = { "Content-Type": "application/json" };
  if (cookie) h["Cookie"] = cookie;
  if (csrf) h["X-LP-CSRF"] = csrf;
  const res = await fetch(BASE + p, { method, headers: h, body: body != null ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, json, res };
}
const ordered = (rows) => rows.slice().sort((a, b) => (Date.parse(a.reviewed_at) - Date.parse(b.reviewed_at)) || (a.id < b.id ? -1 : 1));
const close = (a, b, tol) => Math.abs(Number(a) - Number(b)) < (tol || 1e-6);

(async () => {
  const failures = []; const eq = (c, m) => { if (!c) failures.push(m); };

  // ── (1)==(2)==(3): three-way parity on the committed vectors ─────────────
  for (const sc of SCN) {
    const e = sc.expected;
    const core = FC.replay(ordered(sc.rows));
    const ref = referenceReplay(sc.rows);
    if (!e) {
      // P7.0a annul-to-null: обе реализации обязаны выразить «памяти нет»
      eq(core == null || !(core.stability > 0), `[${sc.name}] fsrs-core.replay must yield NO memory (null)`);
      eq(ref == null, `[${sc.name}] reference replay must yield NO memory (null)`);
      continue;
    }
    const okCore = core && close(core.stability, e.stability) && close(core.difficulty, e.difficulty) &&
      core.reps === e.reps && core.lapses === e.lapses &&
      FC.intervalFor(core) === e.intervalDays && FC.dueAt(core) === e.dueMs;
    const okRef = ref && close(ref.stability, e.stability, 1e-9) && close(ref.difficulty, e.difficulty, 1e-9) &&
      ref.reps === e.reps && ref.lapses === e.lapses && ref.intervalDays === e.intervalDays && ref.dueMs === e.dueMs;
    eq(okCore, `[${sc.name}] fsrs-core.replay != golden: ` + JSON.stringify({ core: core && { s: core.stability, d: core.difficulty, r: core.reps, l: core.lapses, i: FC.intervalFor(core) }, e }));
    eq(okRef, `[${sc.name}] LIVE ts-fsrs reference != golden (fixture drift?)`);
  }

  // ── e2e: ingest through the API → ingest-maintained projections == expected ──
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-replay-smoke-"));
  const srv = startServer(scratch);
  try {
    if (!(await ready(srv))) { console.error("server failed (or port orphan)\n" + srv.logs.join("").slice(-2000)); process.exit(1); }
    const li = await api("POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "replay-smoke" } });
    eq(li.status === 200 && li.json.ok, "login failed");
    const sc0 = li.res.headers.getSetCookie ? li.res.headers.getSetCookie() : [li.res.headers.get("set-cookie")];
    const cookie = String((sc0 || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0];
    const csrf = li.json.csrf;

    // per-scenario namespaced keys/ids so all scenarios coexist under one user.
    // P7.0a: meta.annul_of переписывается ТЕМ ЖЕ префиксом (критика wf_1bf34023: иначе
    // v2-вектор с реальной целью сойдётся на сырых rows, но разойдётся после ingest —
    // неймспейснутый target-id не совпадёт с annul_of).
    const nsRows = (sc) => sc.rows.map((r) => {
      const out = { ...r, id: sc.name + "|" + r.id, item_key: sc.name + "|" + r.item_key };
      if (r.kind === "annul") {
        try {
          const m = JSON.parse(r.meta_json || "{}");
          if (m && m.annul_of != null) { m.annul_of = sc.name + "|" + m.annul_of; out.meta_json = JSON.stringify(m); }
        } catch (_) {}
      }
      // P7.0c: source 'agent:*' зарезервирован за серверным reviewer (новая строка из
      // клиентского батча → reject 'reserved_source'); golden-файлы не трогаем (байт-
      // стабильность = do-no-harm доказательство) — переписываем source в e2e-ноге,
      // replay от source не зависит.
      if (String(out.source || "").indexOf("agent:") === 0) out.source = "x-" + out.source.slice(6);
      return out;
    });
    for (const sc of SCN) {
      const ing = await api("POST", "/api/learner/ingest", { cookie, csrf, body: {
        idempotency_key: "replay-" + sc.name, schema_version: 1, keyer_version: 1, review_log: nsRows(sc),
      } });
      eq(ing.status === 200 && ing.json.review_log.rejected === 0,
        `[${sc.name}] ingest rejected rows: ` + JSON.stringify(ing.json && ing.json.rejected));
    }
    const proj = await api("GET", "/api/learner/projections?limit=200", { cookie });
    eq(proj.status === 200 && proj.json.ok, "projections read failed");
    const byKey = new Map((proj.json.rows || []).map((r) => [r.item_key, r]));
    let projBad = 0;
    for (const sc of SCN) {
      const e = sc.expected;
      const row = byKey.get(sc.name + "|" + sc.rows[0].item_key);
      if (!e) { if (row) { projBad++; failures.push(`[${sc.name}] projection must be absent`); } continue; }
      const ok = row && close(row.stability, e.stability) && close(row.difficulty, e.difficulty) &&
        Number(row.reps) === e.reps && Number(row.lapses) === e.lapses &&
        Number(row.interval_days) === e.intervalDays && Date.parse(row.due) === e.dueMs;
      if (!ok) { projBad++; failures.push(`[${sc.name}] server projection != expected: ` + JSON.stringify(row) + " want " + JSON.stringify(e)); }
    }
    eq(projBad === 0, `server projections diverged in ${projBad} scenarios`);

    // D1 (мигр. 025) — channel-aware агрегация: проекции несут channel_stats_json, и он
    // парсится в семьи production/receptive (сценарные строки идут с каналами read:mc и т.п.)
    const withStats = (proj.json.rows || []).filter((r) => r.channel_stats_json);
    eq(withStats.length > 0, "D1: projections must carry channel_stats_json after ingest");
    let csOK = false;
    try {
      const cs = JSON.parse(withStats[0].channel_stats_json);
      csOK = !!(cs && cs.production && cs.receptive && Number(cs.receptive.reps) >= 1);
    } catch (_) {}
    eq(csOK, "D1: channel_stats_json must parse with production/receptive families and count receptive reps");

    // mark-only key must NOT create a projection
    const mk = await api("POST", "/api/learner/ingest", { cookie, csrf, body: {
      idempotency_key: "replay-markonly", schema_version: 1, keyer_version: 1,
      review_log: [{ id: "mark:only1", item_key: "markonly|x", kind: "mark", reviewed_at: "2026-01-01T10:00:00.000Z", grade: null, source: "word-mark", meta_json: JSON.stringify({ status: "l2" }) }],
    } });
    eq(mk.status === 200 && mk.json.review_log.new === 1, "mark-only ingest failed");
    const proj2 = await api("GET", "/api/learner/projections?limit=500", { cookie });
    eq(!(proj2.json.rows || []).some((r) => r.item_key === "markonly|x"), "mark-only key must not project (manual axis is never memory)");

    // oracle: clean on the ingest-maintained state
    const or1 = await api("GET", "/api/learner/oracle", { cookie });
    eq(or1.status === 200 && or1.json.ok && or1.json.mismatched === 0 && or1.json.missing === 0 && or1.json.checked > 0,
      "oracle must be clean after ingest-maintained projections: " + JSON.stringify(or1.json));

    // TEETH: corrupt one stored projection directly → oracle catches → rebuild heals
    const sqlite3 = require(path.join(REPO, "node_modules", "sqlite3"));
    const dbw = new sqlite3.Database(path.join(scratch, "app.db"));
    await new Promise((res2, rej) => dbw.run(`UPDATE srs_projections SET stability = stability + 5 WHERE item_key LIKE 'plain-chain|%'`, (e) => (e ? rej(e) : res2())));
    await new Promise((r) => dbw.close(() => r()));
    const or2 = await api("GET", "/api/learner/oracle", { cookie });
    eq(or2.json && or2.json.mismatched >= 1, "TEETH FAILED: oracle must catch a corrupted stored projection");
    const rb = await api("POST", "/api/learner/projections/rebuild", { cookie, csrf, body: {} });
    eq(rb.status === 200 && rb.json.ok && rb.json.recomputed > 0, "rebuild failed");
    const or3 = await api("GET", "/api/learner/oracle", { cookie });
    eq(or3.json && or3.json.mismatched === 0 && or3.json.missing === 0, "oracle must be clean after rebuild");
  } catch (e) {
    failures.push("CRASH: " + (e && e.stack || e));
  } finally {
    await stop(srv.c);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }

  const shown = SCN.length * 3 + 11;   // (v1+v2)×2 parity + ×1 ingest + 9 e2e/oracle/teeth + 2 D1 channel-stats
  if (failures.length) {
    console.error(`smoke:server-replay FAIL (${shown - failures.length}/${shown})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:server-replay OK (${shown}/${shown}) — CLG-P4+P7.0a: three-way parity (fsrs-core == ts-fsrs reference == golden ×${SCN.length}, вкл. annul-семантику v2: mid-history/to-null/double/missing/before-target/seed-mark-annul-ignored/skip) · e2e ingest→projections == expected (annul-to-null → проекция удалена) · mark-only не проецируется · oracle clean · TEETH (порча → поймана → rebuild → clean)`);
  }
})();
