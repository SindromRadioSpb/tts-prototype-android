#!/usr/bin/env node
"use strict";
// smoke:agent-next-text — гейт PAS-D1 (next-text, спека PAS_SLICE_D_SPEC v2).
//   Pure: catalogVersion == regex по library-ui.js (BLOCKER-фикс version-pin: совпадение
//     по построению; в модуле НЕТ захардкоженного 'corpus-index-v<N>') · buildNextTextPayload
//     (system байт-стабилен per language; клиентские числа/kind/кавета строго в data;
//     frontier помечен device_profile; R1-guard в system).
//   agent_ux валидатор (learnerLogRepo): happy-row → принят; free-text feature /
//     bad action / latency_ms вне clamp → rejected по значению (payload_value:*).
//   Boot #1 (mock): 401/CSRF · UNKNOWN_WORK/BAD_COV/BAD_KIND/BAD_FRONTIER · happy на
//     реальном work_id из corpus-index (grounding: серверный title, zone=classifyZone(cov),
//     frontier_provenance=device_profile; ledger ровно 1; ничего не персистится) ·
//     events-only ingest agent_ux до таблицы · glue-регион log-hygiene.
//   Boot #2 (kill-switch): explain → 503 KILL_SWITCH БЕЗ резерва (usage 0).
// Run: node scripts/premium/agent-next-text-smoke.js   (exit 0 = green)

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3311, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-nexttext-secret-0123456789";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const li = await api("POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "nexttext-smoke" } });
  eq(li.status === 200 && li.json.ok, "login failed");
  const sc0 = li.res.headers.getSetCookie ? li.res.headers.getSetCookie() : [li.res.headers.get("set-cookie")];
  return { cookie: String((sc0 || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: li.json.csrf };
}

(async () => {
  // ── pure: версия каталога — по построению (BLOCKER-фикс критики) ─────────────
  const nt = require(path.join(REPO, "agent", "nextText.js"));
  const libSrc = fs.readFileSync(path.join(REPO, "public", "js", "library-ui.js"), "utf8");
  const vm = libSrc.match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/);
  eq(!!vm, "library-ui.js must carry CORPUS_CATALOG_VERSION");
  eq(nt.catalogVersion() === Number(vm[1]),
    "server catalogVersion() must equal the client constant BY CONSTRUCTION, got " + nt.catalogVersion() + " vs " + vm[1]);
  const ntSrc = fs.readFileSync(path.join(REPO, "agent", "nextText.js"), "utf8");
  eq(!/corpus-index-v\d/.test(ntSrc), "agent/nextText.js must NOT hardcode a versioned index filename");
  const indexFile = path.join(REPO, "public", "data", "benyehuda", "corpus-index-v" + vm[1] + ".json");
  eq(fs.existsSync(indexFile), "resolved corpus-index file must exist: " + indexFile);
  const ready0 = (JSON.parse(fs.readFileSync(indexFile, "utf8")).ready || [])[0];
  eq(!!(ready0 && ready0.id), "corpus-index must have a first ready card");

  // pure: payload — system байт-стабилен per language; вариативное строго в data
  const card = { title: "טקסט", author: "מחבר", era: "revival", genre: "prose", segments: 20 };
  const base = { language: "ru", card, zone: "in", cov: 0.82, loadFlag: false, kind: "next", frontier: [{ pid: 5, lemma: "ספר", meaning: "книга" }], learner: { due_now: 3, weak_count: 1 } };
  const p1 = nt.buildNextTextPayload(base);
  const p2 = nt.buildNextTextPayload({ ...base, cov: 0.11, kind: "challenge", loadFlag: true, card: { ...card, title: "אחר" } });
  eq(p1.system === p2.system, "system must be byte-stable per language (kind/load/cov live in data)");
  eq(p1.system !== nt.buildNextTextPayload({ ...base, language: "en" }).system, "en system must differ from ru");
  eq(p1.system.includes("НИКОГДА не утверждай морфологию"), "ru system must carry the R1 guard");
  eq(nt.buildNextTextPayload({ ...base, language: "en" }).system.includes("NEVER assert morphology"), "en system must carry the R1 guard");
  eq(p2.prompt.includes('"kind":"challenge"') && p2.prompt.includes("load_caveat"), "kind/load-кавета must live in data");
  eq(!p1.prompt.includes("load_caveat"), "no load_caveat when load_flag=false");
  eq(p1.prompt.includes("coverage_device_profile") && p1.prompt.includes("frontier_device_profile"),
    "client numbers/frontier must be framed with device_profile provenance in data");

  // ── agent_ux: по-значению валидация (unit, без сервера) ─────────────────────
  const llr = require(path.join(REPO, "db", "learnerLogRepo.js"));
  const nowMs = Date.now();
  const mkUx = (payload) => ({ id: "ux-" + Math.random(), type: "agent_ux", created_at_client: new Date().toISOString(), payload });
  eq(llr.validateLearnerEvent(mkUx({ feature: "next_text", action: "offered", latency_ms: 120 }), nowMs).ok === true,
    "valid agent_ux row must pass");
  eq(llr.validateLearnerEvent(mkUx({ feature: "мой личный текст утёк", action: "offered" }), nowMs).reason === "payload_value:feature",
    "free-text feature must be rejected BY VALUE");
  eq(llr.validateLearnerEvent(mkUx({ feature: "next_text", action: "hacked" }), nowMs).reason === "payload_value:action",
    "unknown action must be rejected");
  eq(llr.validateLearnerEvent(mkUx({ feature: "next_text", action: "offered", latency_ms: 999999999 }), nowMs).reason === "payload_value:latency_ms",
    "latency_ms out of clamp must be rejected");
  eq(llr.validateLearnerEvent({ id: "x", type: "review_answered", created_at_client: new Date().toISOString(), payload: {} }, nowMs).reason === "review_fact_in_events",
    "forbidden review types must stay forbidden");

  // glue-регион log-hygiene
  const serverSrc = fs.readFileSync(path.join(REPO, "server.js"), "utf8");
  const mStart = serverSrc.indexOf("CLG-P6 — Agent Runtime");
  const mEnd = serverSrc.indexOf("CLG-P8.1 — Telegram Mini App");
  const mN = serverSrc.indexOf('"/api/agent/next-text/explain"');
  eq(mStart > 0 && mEnd > mStart && mN > mStart && mN < mEnd, "next-text glue must live INSIDE the log-hygiene scanned region");

  // ════ Boot #1 (mock) ════
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-nexttext-smoke-"));
  const srv = startServer(scratch);
  try {
    if (!(await ready(srv))) { console.error("server failed\n" + srv.logs.join("").slice(-2000)); process.exit(1); }

    const un = await api("POST", "/api/agent/next-text/explain", { body: { pick: {} } });
    eq(un.status === 401, "unauth explain must be 401");
    const { cookie, csrf } = await login();
    const noCsrf = await api("POST", "/api/agent/next-text/explain", { cookie, body: { pick: {} } });
    eq(noCsrf.status === 403, "no-CSRF explain must be 403");

    // валидации входа
    const badW = await api("POST", "/api/agent/next-text/explain", { cookie, csrf, body: { pick: { work_id: "99999999", cov: 0.8, kind: "next", frontier_pids: [] } } });
    eq(badW.status === 400 && badW.json.error === "UNKNOWN_WORK", "unknown work must be 400 UNKNOWN_WORK");
    const badC = await api("POST", "/api/agent/next-text/explain", { cookie, csrf, body: { pick: { work_id: String(ready0.id), cov: 1.5, kind: "next", frontier_pids: [] } } });
    eq(badC.status === 400 && badC.json.error === "BAD_COV", "cov=1.5 must be 400 BAD_COV (reject, not clamp)");
    const badK = await api("POST", "/api/agent/next-text/explain", { cookie, csrf, body: { pick: { work_id: String(ready0.id), cov: 0.8, kind: "coldstart", frontier_pids: [] } } });
    eq(badK.status === 400 && badK.json.error === "BAD_KIND", "kind=coldstart must be 400 BAD_KIND (без LLM-кнопки)");
    const badF = await api("POST", "/api/agent/next-text/explain", { cookie, csrf, body: { pick: { work_id: String(ready0.id), cov: 0.8, kind: "next", frontier_pids: [1, 2, 3, 4, 5, 6, 7, 8, 9] } } });
    eq(badF.status === 400 && badF.json.error === "BAD_FRONTIER", ">8 frontier pids must be 400 BAD_FRONTIER");
    const badF2 = await api("POST", "/api/agent/next-text/explain", { cookie, csrf, body: { pick: { work_id: String(ready0.id), cov: 0.8, kind: "next", frontier_pids: [-5] } } });
    eq(badF2.status === 400 && badF2.json.error === "BAD_FRONTIER", "negative pid must be 400 BAD_FRONTIER");

    // happy: реальный work_id; zone — серверная деривация (0.8 → in)
    const hp = await api("POST", "/api/agent/next-text/explain", { cookie, csrf, body: { pick: { work_id: String(ready0.id), cov: 0.8, load_flag: false, kind: "next", frontier_pids: [1, 2] } } });
    eq(hp.status === 200 && hp.json.ok && hp.json.advisory === true, "happy explain failed: " + JSON.stringify(hp.json && hp.json.error));
    eq(hp.json.grounding && hp.json.grounding.title === ready0.title, "grounding.title must come from the SERVER index");
    eq(hp.json.grounding && hp.json.grounding.zone === "in", "zone must be derived SERVER-side (0.8 → in)");
    eq(hp.json.grounding && hp.json.grounding.frontier_provenance === "device_profile", "frontier must be marked device_profile");
    eq(hp.json.llm_used !== false && typeof hp.json.text === "string" && hp.json.text.length > 0, "advisory text must come from mock LLM");
    eq(hp.json.usage && hp.json.usage.user_llm_calls === 1, "explain must burn exactly 1 call, got " + JSON.stringify(hp.json.usage));

    // ничего не персистится
    const exp = await api("GET", "/api/account/export", { cookie });
    const tables = (exp.json && exp.json.tables) || exp.json || {};
    const expl = tables.agent_explanations || (exp.json && exp.json.data && exp.json.data.agent_explanations) || [];
    eq(expl.length === 0, "next-text must NOT write agent_explanations");

    // events-only ingest: agent_ux до таблицы (substrate D0.2)
    const ing = await api("POST", "/api/learner/ingest", { cookie, csrf, body: {
      idempotency_key: "nexttext-smoke-ux", schema_version: 1,
      learner_events: [
        { id: "ux-ok-1", type: "agent_ux", created_at_client: new Date().toISOString(), payload: { feature: "next_text", action: "offered" } },
        { id: "ux-bad-1", type: "agent_ux", created_at_client: new Date().toISOString(), payload: { feature: "свободный текст", action: "offered" } },
      ],
    } });
    eq(ing.status === 200 && ing.json.learner_events && ing.json.learner_events.new === 1 && ing.json.learner_events.rejected === 1,
      "events-only batch: valid agent_ux row in, free-text feature rejected; got " + JSON.stringify(ing.json && ing.json.learner_events));
    const exp2 = await api("GET", "/api/account/export", { cookie });
    const tables2 = (exp2.json && exp2.json.tables) || exp2.json || {};
    const evs = tables2.learner_events || (exp2.json && exp2.json.data && exp2.json.data.learner_events) || [];
    eq(evs.length === 1 && String(evs[0].type) === "agent_ux", "exactly the valid agent_ux event must land in learner_events");
  } finally { await stop(srv.c); }

  // ════ Boot #2: kill-switch → честный 503 БЕЗ резерва ════
  const scratch2 = fs.mkdtempSync(path.join(os.tmpdir(), "lp-nexttext-smoke2-"));
  const srv2 = startServer(scratch2, { AGENT_LLM_DISABLED: "1" });
  try {
    if (!(await ready(srv2))) { console.error("server2 failed\n" + srv2.logs.join("").slice(-2000)); process.exit(1); }
    const { cookie, csrf } = await login();
    const r = await api("POST", "/api/agent/next-text/explain", { cookie, csrf, body: { pick: { work_id: String(ready0.id), cov: 0.8, kind: "next", frontier_pids: [] } } });
    eq(r.status === 503 && r.json.error === "KILL_SWITCH", "kill-switch must be honest 503 KILL_SWITCH, got " + r.status + "/" + (r.json && r.json.error));
    eq(r.json.usage && r.json.usage.user_llm_calls === 0, "kill-switch must not burn the ledger");
  } finally { await stop(srv2.c); }

  if (failures.length) {
    console.error("\nsmoke:agent-next-text FAILED (" + failures.length + "):");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("smoke:agent-next-text OK — pure version-by-construction/payload + agent_ux value-validation + boot1 (валидации/happy grounding/no-persist/events-only ingest) + boot2 (kill-switch 503)");
  process.exit(0);
})().catch((e) => { console.error("smoke:agent-next-text crashed:", e && e.message); process.exit(1); });
