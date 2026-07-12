#!/usr/bin/env node
"use strict";
// smoke:agent-material — гейт PAS-B2 (/api/agent/study-summary «что стоит выучить»).
//   Consent-лестница ТРОЙНАЯ (критика wf_7f300c39 BLOCKER ×3: digest = ВЕСЬ текст,
//     старые ключи обещают «не весь текст»): 401 → CSRF 403 → CLOUD_TEXTS →
//     AGENT_READ_TEXTS → AGENT_READ_TEXTS_DIGEST → 200; каждый код раздельно.
//   Cap-teeth: фикстура 60 строк → facts_used rows_sent==40 (физический cap репо);
//     pure buildSummaryPayload: learner-идентификаторы ≤30, digest-контент НЕ в system.
//   Dedupe: второй вызов from_history БЕЗ нового reserve (usage не растёт), b.kind
//     =='study_summary'; dedupe СТРОГО ПОСЛЕ consent-гейта: revoke digest → 403,
//     НЕ from_history (критика: revoke+failed-purge отдал бы контент из истории).
//   Purge fail-closed: revoke agent_read_texts → строка study_summary tombstone;
//     synthetic-строка с НЕИЗВЕСТНЫМ facts[0].kind тоже tombstone (exclusion-list
//     семантика agentRepo.purgeExplanationContent НЕ инвертирована в allow-list).
//   R17: review_log пуст; kill-switch (бут №2) → честная деградация без ledger-burn.
//   Stdout-гигиена: контент фикстуры не появляется в логах сервера.
// Run: node scripts/premium/agent-material-smoke.js   (exit 0 = green)

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3307, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-material-secret-0123456789ab";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TEXT_KEY = "own-mat-1";
const SENTINEL_HE = "הילדה שרה שיר יפה";
const SENTINEL_RU = "МАТСЕНТИНЕЛ девочка поёт красивую песню";

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

function startServer(dataDir, extraEnv) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET,
      AGENT_LLM_PROVIDER: "mock", AGENT_LLM_DAILY_PER_USER: "10", AGENT_LLM_DAILY_GLOBAL: "100",
      ...(extraEnv || {}),
    },
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
async function login() {
  const li = await api("POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "material-smoke" } });
  eq(li.status === 200 && li.json.ok, "login failed");
  const sc0 = li.res.headers.getSetCookie ? li.res.headers.getSetCookie() : [li.res.headers.get("set-cookie")];
  return { cookie: String((sc0 || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: li.json.csrf };
}

// 60 строк (cap-teeth: репо обязан срезать до 40); первая строка — сентинел.
function bundleFixture() {
  const rows = [{ order_index: 0, hebrew_plain: SENTINEL_HE, hebrew_niqqud: "", translit: "", russian: SENTINEL_RU }];
  for (let i = 1; i < 60; i++) {
    rows.push({ order_index: i, hebrew_plain: "משפט מספר " + i, hebrew_niqqud: "", translit: "", russian: "предложение " + i });
  }
  return {
    manifest: { export_schema_version: 1, app_id: "linguist-pro-web" },
    texts: [{ text_key: TEXT_KEY, title: "Smoke material text", rows, created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z" }],
  };
}

function exportRows(exp) {
  const t = exp.json && exp.json.tables ? exp.json.tables : exp.json || {};
  return (t.agent_explanations || (exp.json && exp.json.data && exp.json.data.agent_explanations) || []);
}

(async () => {
  // ── pure: buildSummaryPayload — кэпы и байт-стабильный system без контента ──
  const material = require(path.join(REPO, "agent", "material.js"));
  const digest = { title: "T", rows_total: 60, rows: [{ he: "א", ru: "а" }] };
  const many = Array.from({ length: 50 }, (_, i) => "k" + i);
  const p1 = material.buildSummaryPayload(digest, { due: many, weak: many }, "ru");
  eq(p1.due.length + p1.weak.length <= material.LEARNER_ITEMS_MAX,
    "learner identifiers must be capped at " + material.LEARNER_ITEMS_MAX + ", got " + (p1.due.length + p1.weak.length));
  const p2 = material.buildSummaryPayload({ title: "СЕКРЕТ", rows_total: 1, rows: [{ he: "סוד", ru: "тайна" }] }, { due: [], weak: [] }, "ru");
  eq(p1.system === p2.system, "system must be byte-stable (digest content lives in prompt-data only)");
  eq(!p2.system.includes("СЕКРЕТ") && !p2.system.includes("סוד"), "system must not embed digest content");
  eq(p2.prompt.includes("סוד"), "prompt-data must carry the digest rows");
  // R1-guard закреплён в system байтово
  eq(p1.system.includes("НИКОГДА не утверждай морфологию"), "ru system must carry the R1 morphology guard");
  eq(material.buildSummaryPayload(digest, { due: [], weak: [] }, "en").system.includes("NEVER assert morphology"),
    "en system must carry the R1 morphology guard");

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-material-smoke-"));
  const srv = startServer(scratch);
  try {
    if (!(await ready(srv))) { console.error("server failed\n" + srv.logs.join("").slice(-2000)); process.exit(1); }

    // ── auth/валидация ────────────────────────────────────────────────────────
    const un = await api("POST", "/api/agent/study-summary", { body: { text_key: TEXT_KEY } });
    eq(un.status === 401, "unauth must be 401, got " + un.status);
    const { cookie, csrf } = await login();
    const noCsrf = await api("POST", "/api/agent/study-summary", { cookie, body: { text_key: TEXT_KEY } });
    eq(noCsrf.status === 403, "no-CSRF must be 403, got " + noCsrf.status);
    const noKey = await api("POST", "/api/agent/study-summary", { cookie, csrf, body: {} });
    eq(noKey.status === 400 && noKey.json.error === "BAD_ANCHOR", "missing text_key must be 400 BAD_ANCHOR");

    // ── ТРОЙНАЯ consent-лестница, каждый код раздельно ───────────────────────
    const l1 = await api("POST", "/api/agent/study-summary", { cookie, csrf, body: { text_key: TEXT_KEY } });
    eq(l1.status === 403 && l1.json.error === "CLOUD_TEXTS_CONSENT_REQUIRED", "step1 must be 403 CLOUD_TEXTS, got " + (l1.json && l1.json.error));
    await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "cloud_texts", granted: true, version: "v1" } });
    const put = await api("POST", "/api/learner/artifacts/put", { cookie, csrf, body: {
      artifact_key: TEXT_KEY, updated_at: "2026-07-01T00:00:00.000Z", payload: bundleFixture(),
    } });
    eq(put.status === 200 && put.json.stored === true, "artifact put failed: " + JSON.stringify(put.json));
    const l2 = await api("POST", "/api/agent/study-summary", { cookie, csrf, body: { text_key: TEXT_KEY } });
    eq(l2.status === 403 && l2.json.error === "AGENT_READ_TEXTS_CONSENT_REQUIRED", "step2 must be 403 AGENT_READ_TEXTS, got " + (l2.json && l2.json.error));
    await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "agent_read_texts", granted: true, version: "v1" } });
    const l3 = await api("POST", "/api/agent/study-summary", { cookie, csrf, body: { text_key: TEXT_KEY } });
    eq(l3.status === 403 && l3.json.error === "AGENT_READ_TEXTS_DIGEST_CONSENT_REQUIRED",
      "step3 must be 403 AGENT_READ_TEXTS_DIGEST (свой ключ, не переиспользование!), got " + (l3.json && l3.json.error));
    await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "agent_read_texts_digest", granted: true, version: "v1" } });

    // ── happy-path + cap-teeth + провенанс ────────────────────────────────────
    const h1 = await api("POST", "/api/agent/study-summary", { cookie, csrf, body: { text_key: TEXT_KEY } });
    eq(h1.status === 200 && h1.json.ok && typeof h1.json.text === "string" && h1.json.text.length > 0,
      "happy path failed: " + JSON.stringify(h1.json && (h1.json.error || h1.json.degraded_reason)));
    eq(h1.json.kind === "study_summary" && h1.json.category === "создать материал", "kind/category must be study_summary/создать материал");
    eq(h1.json.usage && h1.json.usage.user_llm_calls === 1, "usage must show exactly 1 call, got " + JSON.stringify(h1.json.usage));
    eq(!!h1.json.explanation_id, "must persist an explanation row");
    const exp1 = await api("GET", "/api/account/export", { cookie });
    const row1 = exportRows(exp1).find((r) => String(r.sentence_id || "") === TEXT_KEY + "#summary");
    eq(!!row1, "export must contain the #summary row");
    let facts1 = [], body1 = {};
    try { facts1 = JSON.parse(row1.facts_used_json); body1 = JSON.parse(row1.body_json); } catch (_) {}
    eq(facts1[0] && facts1[0].kind === "user_text_digest" && facts1[0].scope_level === "text_digest_40",
      "facts[0] must be user_text_digest/text_digest_40, got " + JSON.stringify(facts1[0] && { kind: facts1[0].kind, scope: facts1[0].scope_level }));
    eq(facts1[0] && facts1[0].rows_sent === 40 && facts1[0].rows_total === 60,
      "cap-teeth: 60-row fixture must send EXACTLY 40 rows, got sent=" + (facts1[0] && facts1[0].rows_sent) + " total=" + (facts1[0] && facts1[0].rows_total));
    eq(body1.kind === "study_summary", "body_json.kind must be study_summary (dedupe-дискриминатор)");
    eq(!JSON.stringify(facts1).includes(SENTINEL_HE), "facts_used must NOT embed digest content (только счёт+якорь)");

    // ── dedupe: второй вызов из истории, БЕЗ нового reserve ──────────────────
    const h2 = await api("POST", "/api/agent/study-summary", { cookie, csrf, body: { text_key: TEXT_KEY } });
    eq(h2.status === 200 && h2.json.ok && h2.json.from_history === true, "second call must be from_history");
    eq(h2.json.usage && h2.json.usage.user_llm_calls === 1, "dedupe must not burn a new reserve, got " + JSON.stringify(h2.json.usage));

    // ── dedupe СТРОГО после consent-гейта: revoke digest → 403, НЕ from_history ─
    await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "agent_read_texts_digest", granted: false, version: "v1" } });
    const afterRevoke = await api("POST", "/api/agent/study-summary", { cookie, csrf, body: { text_key: TEXT_KEY } });
    eq(afterRevoke.status === 403 && afterRevoke.json.error === "AGENT_READ_TEXTS_DIGEST_CONSENT_REQUIRED",
      "after digest revoke must be 403 (dedupe must NOT serve history), got " + afterRevoke.status + "/" + (afterRevoke.json && afterRevoke.json.error));

    // ── 404: неизвестный текст ────────────────────────────────────────────────
    await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "agent_read_texts_digest", granted: true, version: "v1" } });
    const nf = await api("POST", "/api/agent/study-summary", { cookie, csrf, body: { text_key: "no-such" } });
    eq(nf.status === 404 && nf.json.error === "TEXT_NOT_IN_CLOUD", "unknown text_key must be 404 TEXT_NOT_IN_CLOUD");

    // ── purge fail-closed: synthetic-строка с НЕИЗВЕСТНЫМ kind + study_summary ─
    // Прямая вставка в app.db (sqlite3 из deps репо): будущий/неизвестный personal-kind
    // ОБЯЗАН тумбстоуниться (exclusion-list, не allow-list — критика wf_7f300c39 MAJOR ×3).
    const sqlite3 = require(path.join(REPO, "node_modules", "sqlite3"));
    const dbPath = path.join(scratch, "app.db");
    const exp2 = await api("GET", "/api/account/export", { cookie });
    const anyRow = exportRows(exp2)[0];
    eq(!!anyRow, "need at least one explanation row to learn user_id");
    const userId = anyRow ? anyRow.user_id : null;
    await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (e) => {
        if (e) return reject(e);
        db.run(`INSERT INTO agent_explanations (id, user_id, sentence_id, facts_used_json, body_json)
                VALUES ('ae_smoke_future', ?, 'future#1', '[{"kind":"future_kind","text":"ЛИЧНОЕ"}]', '{"kind":"future_kind","language":"ru","text":"ЛИЧНОЕ СОДЕРЖИМОЕ"}')`,
          [userId], (e2) => { db.close(); e2 ? reject(e2) : resolve(); });
      });
    }).catch((e) => failures.push("synthetic insert failed: " + e.message));
    const rv = await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: "agent_read_texts", granted: false, version: "v1" } });
    eq(rv.status === 200 && rv.json.ok, "agent_read_texts revoke failed");
    const exp3 = await api("GET", "/api/account/export", { cookie });
    const rows3 = exportRows(exp3);
    const sumRow = rows3.find((r) => String(r.sentence_id || "") === TEXT_KEY + "#summary");
    let sumBody = {}; try { sumBody = JSON.parse(sumRow.body_json); } catch (_) {}
    eq(!!sumRow && sumRow.facts_used_json === "[]" && sumBody.purge_reason === "consent_revoked",
      "study_summary row must be tombstoned on agent_read_texts revoke");
    const futRow = rows3.find((r) => String(r.sentence_id || "") === "future#1");
    let futBody = {}; try { futBody = JSON.parse(futRow.body_json); } catch (_) {}
    eq(!!futRow && futRow.facts_used_json === "[]" && futBody.purge_reason === "consent_revoked" && !JSON.stringify(futBody).includes("ЛИЧНОЕ"),
      "UNKNOWN facts[0].kind must be tombstoned too (fail-closed exclusion-list, не allow-list)");

    // ── R17: review_log пуст (advisory никогда не пишет память) ───────────────
    const counts = await api("GET", "/api/learner/counts", { cookie });
    eq(counts.status === 200 && Number(counts.json.review_log) === 0, "review_log must stay EMPTY (advisory, R17)");

    // ── stdout-гигиена: контент не в логах сервера ────────────────────────────
    const logStr = srv.logs.join("");
    eq(!logStr.includes(SENTINEL_HE) && !logStr.includes("МАТСЕНТИНЕЛ"), "server stdout must not leak digest content");
  } finally { await stop(srv.c); }

  // ── бут №2: kill-switch → честная деградация, ledger не жжётся ──────────────
  const scratch2 = fs.mkdtempSync(path.join(os.tmpdir(), "lp-material-smoke2-"));
  const srv2 = startServer(scratch2, { AGENT_LLM_DISABLED: "1" });
  try {
    if (!(await ready(srv2))) { console.error("server#2 failed\n" + srv2.logs.join("").slice(-2000)); process.exit(1); }
    const { cookie, csrf } = await login();
    for (const k of ["cloud_texts", "agent_read_texts", "agent_read_texts_digest"]) {
      await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: k, granted: true, version: "v1" } });
    }
    await api("POST", "/api/learner/artifacts/put", { cookie, csrf, body: {
      artifact_key: TEXT_KEY, updated_at: "2026-07-01T00:00:00.000Z", payload: bundleFixture(),
    } });
    const ks = await api("POST", "/api/agent/study-summary", { cookie, csrf, body: { text_key: TEXT_KEY } });
    eq(ks.status === 200 && ks.json.ok && ks.json.llm_used === false && ks.json.degraded_reason === "KILL_SWITCH",
      "kill-switch must degrade honestly, got " + JSON.stringify(ks.json && { ok: ks.json.ok, llm: ks.json.llm_used, r: ks.json.degraded_reason }));
    eq(ks.json.usage && ks.json.usage.user_llm_calls === 0, "kill-switch must not burn ledger, got " + JSON.stringify(ks.json.usage));
    eq(String(ks.json.text || "").includes("60"), "degraded digest must carry the deterministic rows count");
  } finally { await stop(srv2.c); }

  if (failures.length) {
    console.error("smoke:agent-material FAILED (" + failures.length + "):");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("smoke:agent-material OK (26/26) — PAS-B2: тройной consent раздельными кодами · cap 60→40 · dedupe после гейта (revoke ≠ from_history) · purge fail-closed (unknown kind tombstone) · R17 review_log пуст · kill-switch честный · stdout-гигиена");
  process.exit(0);
})().catch((e) => { console.error("smoke:agent-material crashed:", e); process.exit(1); });
