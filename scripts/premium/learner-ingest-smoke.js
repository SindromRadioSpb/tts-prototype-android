#!/usr/bin/env node
"use strict";
// smoke:learner-ingest — CLG-P2 Cloud Event Log gate (AI_MENTOR_RECON_2026_07_04.md §9 CLG-P2).
// Boots the server on a SCRATCH DATA_DIR (migrations 020+021 on a fresh DB) and proves the v3 gates:
//   • идемпотентность: replay той же пачки (idempotency_key) = stored result; та же строка под
//     другим ключом пачки = dup, 0 новых;
//   • B1 кросс-тенант: две учётки с ОДИНАКОВЫМ `seed:<item_key>` → 2 строки (PK user-scoped);
//   • B2: пачка с чужим user_id в теле → 403, 0 записей;
//   • meta-allowlist: unknown-ключ → reject строки; CONTENT-ключ (surface) → строка принята,
//     ключ вырезан из stored meta (§5 B5);
//   • канон-время: offset-форма (+03:00) → reject (B10); future-ts → clamp + ts_clamped_server;
//   • keyer: пачка с чужим keyer_version → 400 KEYER_UNSUPPORTED; строка с чужим row-keyer → reject;
//   • annul-схема (§1.3 carve-out б): без annul_of → reject, с annul_of → принят;
//   • B7: learner_events с review_answered → reject с собственной причиной; unknown type → reject;
//   • read-back /api/learner/log: только СВОИ строки, ROWID-курсор next_rid;
//   • auth: ingest без cookie → 401, без CSRF → 403;
//   • delete = forget-the-stream: cloud-строки юзера A стёрты (динамический sweep подхватил
//     новые таблицы 021 БЕЗ правки identityRepo), строки юзера B целы.
// Run: node scripts/premium/learner-ingest-smoke.js   (or npm run smoke:learner-ingest)

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3295, BASE = "http://127.0.0.1:" + PORT;
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
async function ready(ms = 30000) {
  // healthz turns 200 BEFORE async migrations finish — wait for db+migrations ready, or the
  // first login races "no such table: users".
  const s = Date.now();
  while (Date.now() - s < ms) {
    try {
      const r = await fetch(BASE + "/healthz");
      if (r.status === 200) {
        const j = await r.json();
        if (j && j.db && j.db.ready && j.migrations && j.migrations.ready) return true;
      }
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
const T = (s) => s;   // canonical UTC-Z literals below

(async () => {
  const failures = []; const eq = (c, m) => { if (!c) failures.push(m); };
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-ingest-smoke-"));
  const srv = startServer(scratch);
  const sqlite3 = require(path.join(REPO, "node_modules", "sqlite3"));
  let db2 = null;
  try {
    if (!(await ready())) { console.error("server failed\n" + srv.logs.join("")); process.exit(1); }

    // owner login (user A)
    const li = await api("POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "ingest-A" } });
    eq(li.status === 200 && li.json.ok, "login failed");
    const sc = li.res.headers.getSetCookie ? li.res.headers.getSetCookie() : [li.res.headers.get("set-cookie")];
    const cookieA = String((sc || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0];
    const csrfA = li.json.csrf, userA = li.json.user.id;

    // auth guards
    const noAuth = await api("POST", "/api/learner/ingest", { body: { idempotency_key: "x" } });
    eq(noAuth.status === 401, "ingest without cookie must 401");
    const noCsrf = await api("POST", "/api/learner/ingest", { cookie: cookieA, body: { idempotency_key: "x" } });
    eq(noCsrf.status === 403, "ingest without CSRF must 403");

    // batch 1 — clean rows (+ surface strip)
    const KEY = "שלום#noun";
    const rows1 = {
      idempotency_key: "batch-1", schema_version: 1, keyer_version: 1, source_client_version: "3.11.90-smoke",
      review_log: [
        { id: "seed:" + KEY, item_key: KEY, kind: "seed", reviewed_at: T("2026-07-01T10:00:00.000Z"), grade: null,
          source: "seed-sm2", meta: { interval: 3, reps: 2, lapses: 0, scheme: "sm2-lite", keyer_version: 1 } },
        { id: "app:r1", item_key: KEY, kind: "review", reviewed_at: T("2026-07-02T10:00:00.000Z"), grade: 3,
          source: "room-recall", channel: "read:mc",
          meta: { keyer_version: 1, scheduler: { scheme: "fsrs" }, surface: "שָׁלוֹם", text_key: "tk1",
            word_only: 1, training_stage: "l2" } },
      ],
      learner_events: [
        { id: "ev:1", type: "text_opened", created_at_client: T("2026-07-02T09:59:00.000Z"), payload: { text_key: "tk1" } },
      ],
    };
    const in1 = await api("POST", "/api/learner/ingest", { cookie: cookieA, csrf: csrfA, body: rows1 });
    eq(in1.status === 200 && in1.json.review_log.new === 2 && in1.json.learner_events.new === 1 && in1.json.review_log.rejected === 0,
      "batch-1 ingest counts wrong: " + JSON.stringify(in1.json));
    eq(in1.json.stripped_meta_keys === 1, "surface must be stripped (stripped_meta_keys=1)");

    // idempotency: same batch key → stored result replay; same rows new key → dup
    const in1r = await api("POST", "/api/learner/ingest", { cookie: cookieA, csrf: csrfA, body: rows1 });
    eq(in1r.status === 200 && in1r.json.replayed === true && in1r.json.review_log.new === 2,
      "batch replay must return the STORED result verbatim");
    const in1d = await api("POST", "/api/learner/ingest", { cookie: cookieA, csrf: csrfA, body: { ...rows1, idempotency_key: "batch-1b" } });
    eq(in1d.status === 200 && in1d.json.review_log.new === 0 && in1d.json.review_log.dup === 2 && in1d.json.learner_events.dup === 1,
      "row-level dedupe failed under a new idempotency_key");

    // validation batch — every bad row rejected with its reason; good annul accepted; future clamped
    const rows2 = {
      idempotency_key: "batch-2", schema_version: 1, keyer_version: 1,
      review_log: [
        { id: "app:bad-offset", item_key: KEY, kind: "review", reviewed_at: "2026-07-02T13:10:00+03:00", grade: 3, source: "x" },
        { id: "app:bad-meta", item_key: KEY, kind: "review", reviewed_at: T("2026-07-02T11:00:00.000Z"), grade: 3, source: "x", meta: { foo: 1 } },
        { id: "app:bad-keyer", item_key: KEY, kind: "review", reviewed_at: T("2026-07-02T11:01:00.000Z"), grade: 3, source: "x", meta: { keyer_version: 2 } },
        { id: "annul:no-target", item_key: KEY, kind: "annul", reviewed_at: T("2026-07-02T11:02:00.000Z"), grade: null, source: "op" },
        { id: "annul:ok", item_key: KEY, kind: "annul", reviewed_at: T("2026-07-02T11:03:00.000Z"), grade: null, source: "op", meta: { annul_of: "app:r1", reason: "grader_defect" } },
        { id: "app:future", item_key: KEY, kind: "review", reviewed_at: T("2099-01-01T00:00:00.000Z"), grade: 3, source: "x", meta: { keyer_version: 1 } },
      ],
      learner_events: [
        { id: "ev:bad-type", type: "bogus", created_at_client: T("2026-07-02T11:00:00.000Z") },
        { id: "ev:review-fact", type: "review_answered", created_at_client: T("2026-07-02T11:00:00.000Z") },
      ],
    };
    const in2 = await api("POST", "/api/learner/ingest", { cookie: cookieA, csrf: csrfA, body: rows2 });
    eq(in2.status === 200 && in2.json.review_log.new === 2 && in2.json.review_log.rejected === 4,
      "batch-2 review counts wrong (want 2 new [annul:ok, app:future] / 4 rejected): " + JSON.stringify(in2.json && in2.json.review_log));
    eq(in2.json.learner_events.rejected === 2 && in2.json.learner_events.new === 0, "batch-2 event rejects wrong");
    const reason = (id) => (in2.json.rejected.find((r) => r.id === id) || {}).reason || "";
    eq(reason("app:bad-offset") === "time_format", "offset time must reject with time_format");
    eq(reason("app:bad-meta").startsWith("meta_key:"), "unknown meta key must reject with meta_key:*");
    eq(reason("app:bad-keyer") === "row_keyer_version", "row keyer mismatch must reject");
    eq(reason("annul:no-target") === "annul_without_target", "annul without target must reject");
    eq(reason("ev:bad-type") === "bad_type" && reason("ev:review-fact") === "review_fact_in_events",
      "learner_events reject reasons wrong (B7)");

    // batch-level keyer quarantine
    const in3 = await api("POST", "/api/learner/ingest", { cookie: cookieA, csrf: csrfA, body: { idempotency_key: "batch-3", keyer_version: 2, review_log: [] } });
    eq(in3.status === 400 && in3.json.error === "KEYER_UNSUPPORTED", "foreign batch keyer_version must 400 KEYER_UNSUPPORTED");

    // B2 — foreign user_id in the body → 403, zero writes
    const cBefore = await api("GET", "/api/learner/counts", { cookie: cookieA });
    const inEvil = await api("POST", "/api/learner/ingest", { cookie: cookieA, csrf: csrfA, body: {
      idempotency_key: "batch-evil", user_id: "u_evil",
      review_log: [{ id: "app:evil", item_key: KEY, kind: "review", reviewed_at: T("2026-07-02T12:00:00.000Z"), grade: 3, source: "x" }],
    } });
    eq(inEvil.status === 403 && inEvil.json.error === "USER_ID_MISMATCH", "foreign body user_id must 403");
    const cAfter = await api("GET", "/api/learner/counts", { cookie: cookieA });
    eq(JSON.stringify(cBefore.json) === JSON.stringify(cAfter.json), "403 batch must write ZERO rows");

    // read-back: clamped meta visible; only own rows; cursor works
    const log1 = await api("GET", "/api/learner/log?limit=100", { cookie: cookieA });
    eq(log1.status === 200 && log1.json.rows.length === 4, "read-back must return exactly A's 4 rows");
    const fut = log1.json.rows.find((r) => r.id === "app:future");
    eq(!!fut && JSON.parse(fut.meta_json).ts_clamped_server === 1 && Date.parse(fut.reviewed_at) <= Date.now(),
      "future ts must be clamped + marked ts_clamped_server");
    const r1row = log1.json.rows.find((r) => r.id === "app:r1");
    eq(!!r1row && !("surface" in JSON.parse(r1row.meta_json)) && JSON.parse(r1row.meta_json).text_key === "tk1"
      && JSON.parse(r1row.meta_json).word_only === 1 && JSON.parse(r1row.meta_json).training_stage === "l2",
      "stored meta must strip content but retain bounded Room Training provenance");
    // ROWID cursor (v2 — the ingested_at cursor could skip rows committed after a read)
    const page1 = await api("GET", "/api/learner/log?limit=2", { cookie: cookieA });
    const page2 = await api("GET", "/api/learner/log?limit=100&after_rid=" + encodeURIComponent(page1.json.next_rid), { cookie: cookieA });
    eq(page1.json.rows.length === 2 && page2.json.rows.length >= 1 &&
       !page2.json.rows.some((r) => page1.json.rows.some((p) => p.id === r.id)),
      "rowid cursor paging broken");

    // B1 — user #2 with the SAME seed id → both rows survive (user-scoped PK).
    // No API mints a second user (owner-only bootstrap) → create user2 + session directly in the
    // scratch DB (true multi-tenant path, no test backdoors in prod code).
    const secret2 = crypto.randomBytes(32).toString("hex");
    const hash2 = crypto.createHash("sha256").update(secret2, "utf8").digest("hex");
    const dbw = new sqlite3.Database(path.join(scratch, "app.db"));
    const runw = (sql, p) => new Promise((res2, rej) => dbw.run(sql, p || [], function (e) { (e ? rej(e) : res2(this)); }));
    await runw(`INSERT INTO users (id, role, display_name) VALUES ('u_test2', 'member', 'Second')`);
    await runw(`INSERT INTO user_sessions (id, user_id, token_hash, csrf_token, expires_at) VALUES ('s_t2', 'u_test2', ?, 'csrf-t2', '2099-01-01T00:00:00.000Z')`, [hash2]);
    await new Promise((r) => dbw.close(() => r()));
    const cookieB = "lp_session=" + encodeURIComponent("s_t2." + secret2);
    const inB = await api("POST", "/api/learner/ingest", { cookie: cookieB, csrf: "csrf-t2", body: {
      idempotency_key: "batch-B1", schema_version: 1, keyer_version: 1,
      review_log: [{ id: "seed:" + KEY, item_key: KEY, kind: "seed", reviewed_at: T("2026-07-03T10:00:00.000Z"), grade: null, source: "seed-sm2", meta: { interval: 1, reps: 1, lapses: 0 } }],
    } });
    eq(inB.status === 200 && inB.json.review_log.new === 1,
      "B1 FAILED: user2's identical seed:<item_key> must be a SECOND row, not swallowed: " + JSON.stringify(inB.json));
    const logB = await api("GET", "/api/learner/log", { cookie: cookieB });
    eq(logB.status === 200 && logB.json.rows.length === 1 && logB.json.rows[0].id === "seed:" + KEY,
      "user2 read-back must see ONLY its own row");
    const logA2 = await api("GET", "/api/learner/log?limit=100", { cookie: cookieA });
    eq(logA2.json.rows.length === 4, "user A's rows must be untouched by user2's ingest");

    // delete user A = forget-the-stream over the NEW 021 tables via the dynamic sweep
    const del = await api("POST", "/api/account/delete", { cookie: cookieA, csrf: csrfA, body: { confirm: "DELETE" } });
    eq(del.status === 200 && del.json.tablesPurged.includes("review_log") && del.json.tablesPurged.includes("learner_events") && del.json.tablesPurged.includes("ingest_batches"),
      "dynamic sweep must cover the 021 tables without touching identityRepo");

    await stop(srv.c);
    db2 = new sqlite3.Database(path.join(scratch, "app.db"), sqlite3.OPEN_READONLY);
    const all = (sql, p) => new Promise((res2, rej) => db2.all(sql, p || [], (e, r) => (e ? rej(e) : res2(r))));
    const ra = await all(`SELECT COUNT(*) c FROM review_log WHERE user_id = ?`, [userA]);
    const rb = await all(`SELECT COUNT(*) c FROM review_log WHERE user_id = 'u_test2'`);
    eq(Number(ra[0].c) === 0, "user A's cloud review_log rows must be erased");
    eq(Number(rb[0].c) === 1, "user2's row must SURVIVE user A's deletion");
    const jj = await all(`SELECT user_id FROM deletion_journal`);
    eq(jj.length === 1 && jj[0].user_id === userA, "deletion_journal must record user A");
  } catch (e) {
    failures.push("CRASH: " + (e && e.stack || e));
  } finally {
    if (db2) await new Promise((r) => db2.close(() => r()));
    await stop(srv.c).catch(() => {});
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }
  const total = 24;
  if (failures.length) {
    console.error(`smoke:learner-ingest FAIL (${total - failures.length}/${total})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:learner-ingest OK (${total}/${total}) — CLG-P2: идемпотентность (batch replay + row dedup) · B1 кросс-тенантный seed → 2 строки · B2 чужой user_id → 403/0 записей · meta-allowlist (unknown reject · surface strip) · UTC-Z канон (offset reject · future clamp+mark) · keyer quarantine (batch 400 + row reject) · annul-схема · B7 review-факты вне learner_events · read-back cursor · forget-the-stream по 021-таблицам`);
  }
})();
