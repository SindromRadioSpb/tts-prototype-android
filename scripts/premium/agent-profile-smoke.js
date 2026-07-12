#!/usr/bin/env node
"use strict";
// smoke:agent-profile — гейт PAS-D4 (⚙ настройки наставника, спека PAS_SLICE_D_SPEC v2).
//   Pure: depth-варианты system во ВСЕХ точках потребления (explain/word/followup/plan):
//     brief ≠ detailed, каждый байт-стабилен при повторе, brief == прежняя строка
//     (регрессия-нейтральность по построению).
//   Boot: 401/CSRF · POST {language:'he'} → 400 BAD_LANGUAGE (пустышка не персистится) ·
//     goals {foo:1} → 400 BAD_GOALS · goals.depth='epic' → 400 · happy {language:'en',
//     goals:{depth:'detailed'}} → ответ+GET status отражают · ⚡дедуп-зубы: corpus-explain
//     @brief → смена depth → тот же якорь → НЕ from_history (кеш прежней глубины не
//     отдаётся); обратный повтор при том же depth → from_history (dedupe жив).
// Run: node scripts/premium/agent-profile-smoke.js   (exit 0 = green)

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3312, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-profile-secret-0123456789ab";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

function startServer(dataDir) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET,
      AGENT_LLM_PROVIDER: "mock", AGENT_LLM_DAILY_PER_USER: "10", AGENT_LLM_DAILY_GLOBAL: "100",
      CORPUS_WORKS_DEV_FALLBACK: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) { if (!c || c.killed) return; c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" }); }
async function ready(srv, ms = 30000) { const s = Date.now();
  while (Date.now() - s < ms) { if (srv.logs.some((l) => l.includes("EADDRINUSE"))) return false;
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) { const j = await r.json(); if (j.db && j.db.ready && j.migrations && j.migrations.ready) return true; } } catch (_) {}
    await sleep(200); } return false; }
async function api(method, p, { cookie, csrf, body } = {}) {
  const h = { "Content-Type": "application/json" };
  if (cookie) h["Cookie"] = cookie;
  if (csrf) h["X-LP-CSRF"] = csrf;
  const res = await fetch(BASE + p, { method, headers: h, body: body != null ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}
async function login() {
  const res = await fetch(BASE + "/api/auth/bootstrap-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: SECRET, deviceLabel: "profile-smoke" }) });
  const j = await res.json(); const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")];
  return { cookie: String((sc || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: j.csrf };
}

// корпус-фикстура (форма works-файла — образец agent-explain-corpus-smoke)
const WORK_ID = "77001";
const SENT = "הַיֶּלֶד קוֹרֵא סֵפֶר";
function worksFixture() {
  const rows = [{ order_index: 0, hebrew_niqqud: SENT, hebrew_plain: "הילד קורא ספר", translit: null, russian: "мальчик читает книгу" }];
  const textKey = crypto.createHash("sha256").update(rows.map((r) => r.hebrew_plain).join("\n"), "utf8").digest("hex");
  return { textKey, body: { library: { texts: [{ text_key: textKey, title: "בדיקה",
    rows, source_meta: { origin: "benyehuda-ingest", corpus: { schema: 1, byehuda_id: WORK_ID, author: "בודק", era: "tehiya", provenance: { source: "Project Ben-Yehuda", license: "public-domain" } } } }] } } };
}

(async () => {
  // ── pure: depth-варианты system во всех точках потребления ───────────────────
  const explainer = require(path.join(REPO, "agent", "explainer.js"));
  const pf = (depth) => explainer.buildFollowupPayload({ language: "ru", depth, sentence: "ש", question: "q" });
  eq(pf("brief").system !== pf("detailed").system, "followup: brief ≠ detailed system");
  eq(pf("brief").system === pf("brief").system && pf("detailed").system === pf("detailed").system, "followup: каждый depth байт-стабилен");
  eq(pf("brief").system.includes("1–4 короткими тёплыми фразами"), "followup brief == прежняя length-клауза (регрессия-нейтрален)");
  eq(pf("detailed").system.includes("2–6"), "followup detailed несёт свою length-клаузу");
  eq(!pf("detailed").system.includes("1–4"), "followup detailed: ЗАМЕНА клаузы, не аппенд (критика L2-14)");

  // ════ Boot ════
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-profile-smoke-"));
  const fx = worksFixture();
  const worksDir = path.join(scratch, "benyehuda", "works");
  fs.mkdirSync(worksDir, { recursive: true });
  fs.writeFileSync(path.join(worksDir, WORK_ID + ".json"), JSON.stringify(fx.body));

  const srv = startServer(scratch);
  try {
    if (!(await ready(srv))) { console.error("server failed\n" + srv.logs.join("").slice(-2000)); process.exit(1); }
    const un = await api("POST", "/api/agent/profile", { body: { language: "en" } });
    eq(un.status === 401, "unauth profile must be 401");
    const { cookie, csrf } = await login();
    const noCsrf = await api("POST", "/api/agent/profile", { cookie, body: { language: "en" } });
    eq(noCsrf.status === 403, "no-CSRF profile must be 403");

    // валидация (пустышки и мусор не персистятся)
    const badL = await api("POST", "/api/agent/profile", { cookie, csrf, body: { language: "he" } });
    eq(badL.status === 400 && badL.json.error === "BAD_LANGUAGE", "language 'he' must be 400 BAD_LANGUAGE (переключатель-пустышка запрещён)");
    const badG = await api("POST", "/api/agent/profile", { cookie, csrf, body: { goals: { foo: 1 } } });
    eq(badG.status === 400 && badG.json.error === "BAD_GOALS", "unknown goals key must be 400 BAD_GOALS");
    const badD = await api("POST", "/api/agent/profile", { cookie, csrf, body: { goals: { depth: "epic" } } });
    eq(badD.status === 400 && badD.json.error === "BAD_GOALS", "invalid depth must be 400");

    // happy + read-back
    const ok1 = await api("POST", "/api/agent/profile", { cookie, csrf, body: { language: "en", goals: { depth: "detailed" } } });
    eq(ok1.status === 200 && ok1.json.ok && ok1.json.profile.language === "en" && ok1.json.profile.depth === "detailed",
      "happy save must echo language+depth, got " + JSON.stringify(ok1.json && ok1.json.profile));
    const st = await api("GET", "/api/agent/status", { cookie });
    eq(st.json.profile && st.json.profile.language === "en" && st.json.profile.depth === "detailed",
      "GET status must reflect saved profile (read-back), got " + JSON.stringify(st.json && st.json.profile));

    // ── дедуп-зубы: смена depth инвалидирует same-day кеш ────────────────────────
    await api("POST", "/api/agent/profile", { cookie, csrf, body: { language: "ru", goals: { depth: "brief" } } });
    const anchor = { scope_level: "sentence_only", source: "corpus", work_id: WORK_ID, text_key: fx.textKey, order_index: 0 };
    const e1 = await api("POST", "/api/agent/explain", { cookie, csrf, body: anchor });
    eq(e1.status === 200 && e1.json.ok && !e1.json.from_history, "explain #1 @brief must be fresh, got " + JSON.stringify(e1.json && e1.json.error));
    const e2 = await api("POST", "/api/agent/explain", { cookie, csrf, body: anchor });
    eq(e2.status === 200 && e2.json.from_history === true, "explain #2 @brief must dedupe (from_history)");
    await api("POST", "/api/agent/profile", { cookie, csrf, body: { goals: { depth: "detailed" } } });
    const e3 = await api("POST", "/api/agent/explain", { cookie, csrf, body: anchor });
    eq(e3.status === 200 && e3.json.ok && !e3.json.from_history,
      "explain #3 @detailed must NOT serve the brief cache (критика D4-DEPTH-DEDUPE-KEY), got from_history=" + (e3.json && e3.json.from_history));
    const e4 = await api("POST", "/api/agent/explain", { cookie, csrf, body: anchor });
    eq(e4.status === 200 && e4.json.from_history === true, "explain #4 @detailed must dedupe against the detailed row");
  } finally { await stop(srv.c); }

  if (failures.length) {
    console.error("\nsmoke:agent-profile FAILED (" + failures.length + "):");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("smoke:agent-profile OK — pure depth-варианты (5) + boot (валидации/happy/read-back/depth-aware dedupe)");
  process.exit(0);
})().catch((e) => { console.error("smoke:agent-profile crashed:", e && e.message); process.exit(1); });
