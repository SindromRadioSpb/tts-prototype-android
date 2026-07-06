#!/usr/bin/env node
"use strict";
// smoke:agent-explain-burst — P6.3 real-provider boundary для /explain (owner brief
// 2026-07-06). В отличие от smoke:agent-explain (provider=mock), здесь сервер бутится с
// AGENT_LLM_PROVIDER=gemini и preload-шимом (lib/agent-provider-shim.js через NODE_OPTIONS),
// т.е. гейт проходит РЕАЛЬНЫЙ путь agent/llm.js:generateGemini (retry/санитизация/лимиты).
//   1) provider-error hygiene: провайдер бросает ошибку, НАРОЧНО содержащую полный prompt
//      и API-ключ → /explain отвечает 200 честной деградацией; ни prompt, ни предложение,
//      ни ключ не появляются в stdout/ответе; failed вызов ОСВОБОЖДАЕТ бюджет (нет burn);
//   2) burst на последний кредит: 2 параллельных /explain → ровно ОДИН provider-call
//      (call-log шима), ровно один llm_used, второй — честный USER_LIMIT с полезным
//      fallback-текстом; ledger без двойного burn;
//   3) исчерпанный лимит: следующий вызов деградирует БЕЗ похода в провайдер;
//   4) нет грязных ledger-строк: в export нет status='reserved';
//   5) обе explanations записаны с facts_used (успешная и деградированная);
//   6) kill-switch (бут №2): provider не вызывается вовсе, ledger не растёт.
// Run: node scripts/premium/agent-explain-burst-smoke.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const SHIM = path.join(REPO, "scripts", "premium", "lib", "agent-provider-shim.js").replace(/\\/g, "/");
const PORT = 3305, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-burst-secret-0123456789abcdef";
const FAKE_KEY = "AIzaFAKEKEYSENTINEL0123456789";
const FAIL_MARKER = "שגיאהמרקר";
const SENT_OK = "הילד קורא ספר גדול";
const SENT_FAIL = "משפט עם " + FAIL_MARKER + " בפנים";
const KEY_OK = "burst-ok", KEY_FAIL = "burst-fail";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

function startServer(dataDir, callLog, extraEnv) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET,
      NODE_OPTIONS: '--require "' + SHIM + '"',
      AGENT_SMOKE_CALLLOG: callLog, AGENT_SMOKE_FAIL_MARKER: FAIL_MARKER, AGENT_SMOKE_DELAY_MS: "300",
      AGENT_LLM_PROVIDER: "gemini", AGENT_GEMINI_API_KEY: FAKE_KEY,
      AGENT_LLM_DAILY_PER_USER: "1", AGENT_LLM_DAILY_GLOBAL: "100",
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
  const li = await api("POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "burst-smoke" } });
  eq(li.status === 200 && li.json.ok, "login failed");
  const sc0 = li.res.headers.getSetCookie ? li.res.headers.getSetCookie() : [li.res.headers.get("set-cookie")];
  return { cookie: String((sc0 || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: li.json.csrf };
}
const bundle = (key, sentence) => ({
  manifest: { export_schema_version: 1 },
  texts: [{ text_key: key, title: "b", rows: [{ order_index: 0, hebrew_plain: sentence, russian: "перевод-запас" }],
    created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z" }],
});
const explainBody = (key) => ({ text_key: key, order_index: 0, scope_level: "sentence_only" });
const callCount = (log) => { try { return fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).length; } catch (_) { return 0; } };

(async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-burst-smoke-"));
  const callLog = path.join(scratch, "provider-calls.log");
  const srv = startServer(scratch, callLog);
  try {
    if (!(await ready(srv))) { console.error("server failed (or port orphan :" + PORT + ")\n" + srv.logs.join("").slice(-2000)); process.exit(1); }
    const { cookie, csrf } = await login();
    for (const k of ["cloud_texts", "agent_read_texts"]) {
      const r = await api("POST", "/api/auth/consent", { cookie, csrf, body: { key: k, granted: true, version: "v1" } });
      eq(r.status === 200 && r.json.ok, "consent " + k + " failed");
    }
    for (const [k, s] of [[KEY_OK, SENT_OK], [KEY_FAIL, SENT_FAIL]]) {
      const p = await api("POST", "/api/learner/artifacts/put", { cookie, csrf, body: { artifact_key: k, updated_at: "2026-07-01T00:00:00.000Z", payload: bundle(k, s) } });
      eq(p.status === 200 && p.json.stored === true, "artifact put " + k + " failed");
    }

    // ── 1) provider-error hygiene: ошибка провайдера несёт prompt+key — сервер санитизирует ─
    const ef = await api("POST", "/api/agent/explain", { cookie, csrf, body: explainBody(KEY_FAIL) });
    eq(ef.status === 200 && ef.json.ok && ef.json.llm_used === false && ef.json.degraded_reason === "403",
      "provider 403: explain must degrade honestly with the raw status code, got " + JSON.stringify(ef.json && { u: ef.json.llm_used, d: ef.json.degraded_reason }));
    eq(!!ef.json.text && ef.json.text.includes("перевод-запас"),
      "provider 403: fallback must still be useful (translation present)");
    eq(!JSON.stringify(ef.json).includes(FAKE_KEY), "provider error must NOT leak the API key into the response");
    eq(callCount(callLog) === 1, "provider must have been called exactly once so far (403 is not retried), got " + callCount(callLog));
    const u0 = await api("GET", "/api/agent/status", { cookie });
    eq(u0.json.usage.user_llm_calls === 0,
      "FAILED provider call must FREE the budget (status='failed' doesn't count), got " + JSON.stringify(u0.json.usage));

    // ── 2) burst на последний кредит (лимит 1/день): ровно один провайдер-вызов ─
    const [ba, bb] = await Promise.all([
      api("POST", "/api/agent/explain", { cookie, csrf, body: explainBody(KEY_OK) }),
      api("POST", "/api/agent/explain", { cookie, csrf, body: explainBody(KEY_OK) }),
    ]);
    const winners = [ba, bb].filter((r) => r.json && r.json.llm_used === true);
    const losers = [ba, bb].filter((r) => r.json && r.json.llm_used === false && r.json.degraded_reason === "USER_LIMIT" && r.json.text);
    eq(winners.length === 1 && losers.length === 1,
      "burst on the last credit: exactly one llm_used + one USER_LIMIT-with-text, got winners=" + winners.length + " losers=" + losers.length);
    eq(winners.length === 1 && winners[0].json.provider === "gemini" && !!winners[0].json.explanation_id,
      "winner must carry provider=gemini + explanation_id");
    eq(callCount(callLog) === 2,
      "burst: the loser must NEVER reach the provider (2 total calls incl. the 403 one), got " + callCount(callLog));
    const u1 = await api("GET", "/api/agent/status", { cookie });
    eq(u1.json.usage.user_llm_calls === 1, "no double burn: exactly 1 counted call, got " + JSON.stringify(u1.json.usage));

    // ── 3) исчерпанный лимит: деградация БЕЗ похода в провайдер ─
    const e3 = await api("POST", "/api/agent/explain", { cookie, csrf, body: explainBody(KEY_OK) });
    eq(e3.status === 200 && e3.json.llm_used === false && e3.json.degraded_reason === "USER_LIMIT",
      "over-limit explain must degrade USER_LIMIT");
    eq(callCount(callLog) === 2, "over-limit call must not reach the provider, got " + callCount(callLog));

    // ── 4/5) ledger чист + обе explanations с facts_used ─
    const exp = await api("GET", "/api/account/export", { cookie });
    const ledger = (exp.json && exp.json.tables && exp.json.tables.llm_usage_ledger) || [];
    eq(ledger.length >= 2 && ledger.every((r) => r.status === "final" || r.status === "failed"),
      "no dirty ledger rows: every row final|failed, got " + JSON.stringify(ledger.map((r) => r.status)));
    const expl = (exp.json && exp.json.tables && exp.json.tables.agent_explanations) || [];
    eq(expl.length >= 3 && expl.every((r) => { try { return JSON.parse(r.facts_used_json).length >= 2; } catch (_) { return false; } }),
      "every explanation (winner + degraded ones) must carry facts_used provenance, got " + expl.length);

    // ── stdout-гигиена при провайдер-ошибке с prompt+key внутри ─
    const all = srv.logs.join("");
    eq(!all.includes(FAIL_MARKER) && !all.includes(FAKE_KEY) && !all.includes(SENT_OK.split(" ")[1]) && !all.includes("PROVIDER SAYS"),
      "provider-error hygiene: prompt/sentence/key/raw provider message must NOT reach stdout/stderr");
  } catch (e) {
    failures.push("CRASH boot1: " + ((e && e.stack) || e));
  } finally {
    await stop(srv.c);
  }

  // ── 6) kill-switch: провайдер не вызывается, ledger не растёт ─
  const callLog2 = path.join(scratch, "provider-calls-2.log");
  const srv2 = startServer(scratch, callLog2, { AGENT_LLM_DISABLED: "1" });
  try {
    if (!(await ready(srv2))) { console.error("server #2 failed\n" + srv2.logs.join("").slice(-2000)); process.exit(1); }
    const { cookie, csrf } = await login();
    const st0 = await api("GET", "/api/agent/status", { cookie });
    const used0 = st0.json.usage.user_llm_calls;
    const ek = await api("POST", "/api/agent/explain", { cookie, csrf, body: explainBody(KEY_OK) });
    eq(ek.status === 200 && ek.json.ok && ek.json.degraded_reason === "KILL_SWITCH" && !!ek.json.text,
      "kill-switch: explain must degrade honestly with useful text");
    eq(callCount(callLog2) === 0, "kill-switch: provider must NOT be called at all, got " + callCount(callLog2));
    const st1 = await api("GET", "/api/agent/status", { cookie });
    eq(st1.json.usage.user_llm_calls === used0, "kill-switch: ledger must not grow");
  } catch (e) {
    failures.push("CRASH boot2: " + ((e && e.stack) || e));
  } finally {
    await stop(srv2.c);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }

  const TOTAL = 19;
  if (failures.length) {
    console.error(`smoke:agent-explain-burst FAIL (${TOTAL - failures.length}/${TOTAL})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:agent-explain-burst OK (${TOTAL}/${TOTAL}) — P6.3 real-provider boundary: burst на последний кредит → ровно 1 provider-call/1 llm_used/1 честный USER_LIMIT · failed provider call освобождает бюджет · over-limit не ходит в провайдер · ledger без reserved-грязи · обе explanations с facts_used · provider-error с prompt+key внутри полностью санитизирован (stdout+ответ) · kill-switch = 0 provider-calls`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
