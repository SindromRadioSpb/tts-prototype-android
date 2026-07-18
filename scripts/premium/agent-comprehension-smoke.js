#!/usr/bin/env node
"use strict";
// smoke:agent-comprehension — гейт PAS-A3 («проверь меня по абзацу», CORPUS-ONLY advisory).
//   Pure validateComprehension: дубли опций → null · correct_index вне 0..3 → null ·
//     >2 вопросов → усечение · caps строк · невалидный JSON → null (честно, без ретраев).
//   HTTP: happy на mock-json (advisory:true, вопросы валидны, usage) · личный источник →
//     400 CORPUS_ONLY · неизвестный work → 404 · kill-switch → 503 LLM_UNAVAILABLE ·
//     MNAR: review_log ПУСТ после квиза (advisory никогда не пишет память — R17).
// Run: node scripts/premium/agent-comprehension-smoke.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3331, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-comp-secret-0123456789abcdefgh";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WORK_ID = "90000080";
const KEY_A = "f".repeat(64);

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

function worksFixture() {
  const rows = [];
  for (let i = 0; i < 7; i++) rows.push({ row_id: "r" + i, order_index: i, hebrew_plain: "משפט מספר " + (i + 1), hebrew_niqqud: "", translit: "", russian: "предложение " + (i + 1) });
  return { library: { schema_version: 1, texts: [{
    text_id: "by-" + WORK_ID, text_key: KEY_A, title: "עבודה",
    source_meta: { origin: "benyehuda-ingest", corpus: { schema: 1, byehuda_id: WORK_ID, provenance: { license: "public-domain" } } },
    rows,
  }] }, _reniqqud: {} };
}
function startServer(dataDir, extraEnv) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET,
      AGENT_LLM_PROVIDER: "mock", AGENT_LLM_DAILY_PER_USER: "10", AGENT_LLM_DAILY_GLOBAL: "100",
      CORPUS_WORKS_DEV_FALLBACK: "", AGENT_LLM_DISABLED: "", ...(extraEnv || {}) },
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
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) { const j = await r.json(); if (j.db && j.db.ready && j.migrations && j.migrations.ready) return true; } } catch (_) {}
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
  return { status: res.status, json };
}
async function login() {
  const res = await fetch(BASE + "/api/auth/bootstrap-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: SECRET, deviceLabel: "comp-smoke" }) });
  const json = await res.json();
  eq(res.status === 200 && json.ok, "login failed");
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")];
  return { cookie: String((sc || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: json.csrf };
}

(async () => {
  // ── pure: validateComprehension ──────────────────────────────────────────────
  const ex = require(path.join(REPO, "agent", "explainer.js"));
  const goodQ = { question: "Вопрос?", options: ["а", "б", "в", "г"], correct_index: 2 };
  eq(Array.isArray(ex.validateComprehension(JSON.stringify({ questions: [goodQ] }))), "pure: валидный JSON проходит");
  eq(ex.validateComprehension(JSON.stringify({ questions: [{ ...goodQ, options: ["а", "а", "в", "г"] }] })) === null, "pure: дубли опций → null");
  eq(ex.validateComprehension(JSON.stringify({ questions: [{ ...goodQ, correct_index: 4 }] })) === null, "pure: correct_index вне 0..3 → null");
  eq(ex.validateComprehension(JSON.stringify({ questions: [{ ...goodQ, options: ["а", "б", "в"] }] })) === null, "pure: ≠4 опций → null");
  eq(ex.validateComprehension("не json") === null && ex.validateComprehension(JSON.stringify({})) === null, "pure: мусор/пусто → null");
  eq(ex.validateComprehension(JSON.stringify({ questions: [goodQ, goodQ, goodQ] })).length === 2, "pure: >2 вопросов усечены до 2");
  const longQ = { question: "х".repeat(500), options: ["а", "б", "в", "г"], correct_index: 0 };
  eq(ex.validateComprehension(JSON.stringify({ questions: [longQ] }))[0].question.length <= 200, "pure: cap длины вопроса");

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-comp-"));
  const worksDir = path.join(scratch, "benyehuda", "works");
  fs.mkdirSync(worksDir, { recursive: true });
  fs.writeFileSync(path.join(worksDir, WORK_ID + ".json"), JSON.stringify(worksFixture()));

  let srv = startServer(scratch);
  try {
    if (!(await ready(srv))) { console.error("server failed\n" + srv.logs.join("").slice(-2000)); process.exit(1); }
    const { cookie, csrf } = await login();

    const happy = await api("POST", "/api/agent/comprehension", { cookie, csrf, body: { source: "corpus", work_id: WORK_ID, text_key: KEY_A, order_index: 1 } });
    eq(happy.status === 200 && happy.json.ok === true && happy.json.advisory === true, "happy comprehension must be 200 advisory, got " + happy.status + "/" + (happy.json && happy.json.error));
    eq(Array.isArray(happy.json.questions) && happy.json.questions.length >= 1 &&
       happy.json.questions.every((q) => q.options.length === 4 && q.correct_index >= 0 && q.correct_index <= 3),
      "questions must be schema-valid");
    eq(Array.isArray(happy.json.passage_rows) && happy.json.passage_rows.length === 5 && happy.json.passage_rows[0] === 1,
      "passage window must be 5 rows from the anchor");
    eq(happy.json.usage && happy.json.usage.user_llm_calls >= 1, "usage must be visible");

    // ЛИЧНЫЙ текст (решение владельца 2026-07-12: scope sentence_window_5 за двойным consent)
    const pNoC = await api("POST", "/api/agent/comprehension", { cookie, csrf, body: { text_key: "own-comp-1", order_index: 0 } });
    eq(pNoC.status === 403 && pNoC.json.error === "CLOUD_TEXTS_CONSENT_REQUIRED",
      "personal comprehension without consent must be 403 (double-consent gate), got " + pNoC.status + "/" + (pNoC.json && pNoC.json.error));
    for (const k of ["cloud_texts", "agent_read_texts"]) {
      const c = await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: k, granted: true, version: k === "cloud_texts" ? require("../../public/js/cloud-sync.js").CLOUD_TEXTS_CONSENT_VERSION : "v1" } });
      eq(c.status === 200, k + " grant failed");
    }
    const ownRows = [];
    for (let i = 0; i < 7; i++) ownRows.push({ order_index: i, hebrew_plain: "משפט אישי " + (i + 1), hebrew_niqqud: "", translit: "", russian: "личное предложение " + (i + 1) });
    const put = await api("POST", "/api/learner/artifacts/put", { cookie, csrf, body: {
      artifact_key: "own-comp-1", updated_at: "2026-07-01T00:00:00.000Z",
      payload: { manifest: { export_schema_version: 1 }, texts: [{ text_key: "own-comp-1", title: "own", rows: ownRows }] },
    } });
    eq(put.status === 200, "personal artifact put failed");
    const pOk = await api("POST", "/api/agent/comprehension", { cookie, csrf, body: { text_key: "own-comp-1", order_index: 1 } });
    eq(pOk.status === 200 && pOk.json.ok === true && pOk.json.advisory === true,
      "personal comprehension with consents must be 200 advisory, got " + pOk.status + "/" + (pOk.json && pOk.json.error));
    eq(Array.isArray(pOk.json.passage_rows) && pOk.json.passage_rows.length === 5 && pOk.json.passage_rows[0] === 1,
      "personal window must be PHYSICALLY capped at 5 rows from the anchor (scope sentence_window_5)");
    const pTail = await api("POST", "/api/agent/comprehension", { cookie, csrf, body: { text_key: "own-comp-1", order_index: 5 } });
    eq(pTail.status === 200 && pTail.json.passage_rows.length === 2, "personal window at tail must honestly shrink (2 rows)");

    const noWork = await api("POST", "/api/agent/comprehension", { cookie, csrf, body: { source: "corpus", work_id: "90000081", text_key: KEY_A, order_index: 0 } });
    eq(noWork.status === 404, "unknown work must be 404");

    // MNAR/R17: advisory-квиз НЕ пишет память
    const sqlite3 = require(path.join(REPO, "node_modules", "sqlite3"));
    const db = new sqlite3.Database(path.join(scratch, "app.db"), sqlite3.OPEN_READONLY);
    const cnt = await new Promise((r) => db.get("SELECT COUNT(*) c FROM review_log", [], (e, row) => r(row ? row.c : -1)));
    await new Promise((r) => db.close(() => r()));
    eq(cnt === 0, "review_log must stay EMPTY after comprehension (advisory, R17), got " + cnt);

    await stop(srv.c); srv = null;
    srv = startServer(scratch, { AGENT_LLM_DISABLED: "1" });
    if (!(await ready(srv))) { console.error("kill-switch boot failed"); process.exit(1); }
    const s2 = await login();
    const k = await api("POST", "/api/agent/comprehension", { cookie: s2.cookie, csrf: s2.csrf, body: { source: "corpus", work_id: WORK_ID, text_key: KEY_A, order_index: 0 } });
    eq(k.status === 503 && k.json.error === "LLM_UNAVAILABLE", "kill-switch must be honest 503 (no fake questions)");
  } catch (e) {
    failures.push("CRASH: " + (e && e.stack || e));
  } finally {
    if (srv) await stop(srv.c).catch(() => {});
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }

  const total = 20;
  if (failures.length) {
    console.error(`smoke:agent-comprehension FAIL (${total - failures.length}/${total})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`smoke:agent-comprehension OK (${total}/${total}) — PAS-A3: pure-валидация (дубли/индексы/caps) · corpus happy advisory+окно-5 · ЛИЧНЫЙ текст: 403 без consent → happy с consent + физический cap 5 + честный хвост (owner 2026-07-12, scope sentence_window_5) · 404 · review_log пуст (R17) · kill-switch честный`);
  process.exit(0);
})();
