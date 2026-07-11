#!/usr/bin/env node
"use strict";
// smoke:agent-explain-word — гейт PAS-A4 («объяснить это слово в этом предложении»).
//   Pure-ассерты buildWordPromptPayload (capture-mock беззуб — критика r11): displayed-чтение
//     карточки в prompt-данных, diverges выставлен сервером, system-промпт без интерполяций.
//   HTTP: corpus word happy без consent (kind='word', usage) · displayed при расхождении с
//     резолвером → readings_diverge=true · BAD_WORD (латиница) → 400 · личный путь 403 без
//     consent · word-dedupe (то же слово = from_history; ДРУГОЕ слово того же предложения =
//     новый вызов) · sentence-dedupe НЕ отравлен word-строкой · история kind='word' ·
//     kill-switch → честный resolver-фолбэк.
// Run: node scripts/premium/agent-explain-word-smoke.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3327, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-word-explain-secret-0123456789ab";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WORK_ID = "90000078";
const KEY_A = "d".repeat(64);
const SENT_A = "הילד קורא ספר גדול";
const RU_A = "мальчик читает большую книгу";

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

function worksFixture() {
  return { library: { schema_version: 1, texts: [{
    text_id: "by-" + WORK_ID, text_key: KEY_A, title: "עבודה",
    source_meta: { origin: "benyehuda-ingest", corpus: { schema: 1, byehuda_id: WORK_ID, provenance: { license: "public-domain" } } },
    rows: [{ row_id: "r0", order_index: 0, hebrew_plain: SENT_A, hebrew_niqqud: "", translit: "", russian: RU_A }],
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
  const res = await fetch(BASE + "/api/auth/bootstrap-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: SECRET, deviceLabel: "word-smoke" }) });
  const json = await res.json();
  eq(res.status === 200 && json.ok, "login failed");
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")];
  return { cookie: String((sc || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: json.csrf };
}
const wordBody = (over) => ({ source: "corpus", work_id: WORK_ID, text_key: KEY_A, order_index: 0, surface: "קורא", ...(over || {}) });

(async () => {
  // ── pure: payload-строитель (независимо от HTTP/mock) ─────────────────────────
  const ex = require(path.join(REPO, "agent", "explainer.js"));
  const disp = { lemma: "קרא", root: "קרא", binyan: "paal", pos: "verb", meaning: "читать", provenance: "dicta-context" };
  const pl = ex.buildWordPromptPayload({ language: "ru", surface: "קורא", displayed: disp, resolver: { root: "אחר" }, diverges: true, sentence: SENT_A, translation: RU_A, learner: { due: true } });
  eq(pl.displayed_reading && pl.displayed_reading.root === "קרא" && pl.displayed_reading.provenance === "dicta-context",
    "pure: displayed-чтение карточки обязано попасть в prompt-данные как есть");
  eq(pl.readings_diverge === true && pl.server_resolver.root === "אחר", "pure: diverges-флаг и вторичный server_resolver в данных");
  eq(ex.sanitizeDisplayed({ provenance: "evil", lemma: "x".repeat(999) }).provenance === "offline",
    "pure: sanitize нормализует провенанс и режет длины");
  eq(ex.sanitizeDisplayed({}) === null && ex.sanitizeDisplayed(null) === null, "pure: пустой displayed → null");

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-word-explain-"));
  const worksDir = path.join(scratch, "benyehuda", "works");
  fs.mkdirSync(worksDir, { recursive: true });
  fs.writeFileSync(path.join(worksDir, WORK_ID + ".json"), JSON.stringify(worksFixture()));

  let srv = startServer(scratch);
  try {
    if (!(await ready(srv))) { console.error("server failed\n" + srv.logs.join("").slice(-2000)); process.exit(1); }
    const { cookie, csrf } = await login();

    // corpus word happy (без consent-строк)
    const w1 = await api("POST", "/api/agent/explain-word", { cookie, csrf, body: wordBody({ displayed: disp }) });
    eq(w1.status === 200 && w1.json.ok === true && w1.json.kind === "word" && w1.json.word === "קורא",
      "corpus word-explain must be 200 kind=word, got " + w1.status + "/" + JSON.stringify(w1.json && w1.json.error));
    eq(!!w1.json.text && w1.json.usage && w1.json.usage.user_llm_calls >= 1, "word-explain must carry text+usage");
    eq(w1.json.source === "corpus" && w1.json.anchor && w1.json.anchor.work_id === WORK_ID, "word-explain anchor must be corpus-shaped");

    // BAD_WORD
    const wBad = await api("POST", "/api/agent/explain-word", { cookie, csrf, body: wordBody({ surface: "latin" }) });
    eq(wBad.status === 400 && wBad.json.error === "BAD_WORD", "non-hebrew surface must be 400 BAD_WORD");

    // личный путь без consent → 403 (гейты не смешаны)
    const wOwn = await api("POST", "/api/agent/explain-word", { cookie, csrf, body: { text_key: "own-w-1", order_index: 0, surface: "קורא" } });
    eq(wOwn.status === 403 && wOwn.json.error === "CLOUD_TEXTS_CONSENT_REQUIRED", "personal word-explain must 403 without consent");

    // word-dedupe: то же слово → from_history без нового вызова; другое слово → новый вызов
    const used1 = w1.json.usage.user_llm_calls;
    const w1b = await api("POST", "/api/agent/explain-word", { cookie, csrf, body: wordBody() });
    eq(w1b.status === 200 && w1b.json.from_history === true && w1b.json.usage.user_llm_calls === used1,
      "same word same day must serve from history without a new reserve");
    const w2 = await api("POST", "/api/agent/explain-word", { cookie, csrf, body: wordBody({ surface: "ספר" }) });
    eq(w2.status === 200 && w2.json.from_history !== true && w2.json.usage.user_llm_calls === used1 + 1,
      "a DIFFERENT word of the same sentence must be a fresh call (dedupe keyed by word)");

    // sentence-dedupe не отравлен word-строками: sentence-explain того же ряда — свежий вызов
    const s1 = await api("POST", "/api/agent/explain", { cookie, csrf, body: { scope_level: "sentence_only", source: "corpus", work_id: WORK_ID, text_key: KEY_A, order_index: 0 } });
    eq(s1.status === 200 && s1.json.from_history !== true && s1.json.text !== w1.json.text,
      "sentence-explain must NOT be served from a word-explanation row (kind filter)");

    // история: kind='word' у word-строк
    const hist = await api("GET", "/api/agent/explanations?limit=10", { cookie });
    const wordItems = (hist.json.explanations || []).filter((i) => i.kind === "word");
    eq(wordItems.length >= 2, "history must mark word items with kind='word', got " + wordItems.length);

    await stop(srv.c); srv = null;

    // kill-switch: resolver-фолбэк (слово знакомо датасету → факты без LLM)
    srv = startServer(scratch, { AGENT_LLM_DISABLED: "1" });
    if (!(await ready(srv))) { console.error("kill-switch boot failed"); process.exit(1); }
    const s2 = await login();
    const wK = await api("POST", "/api/agent/explain-word", { cookie: s2.cookie, csrf: s2.csrf, body: wordBody({ surface: "גדול" }) });
    eq(wK.status === 200 && wK.json.ok === true && wK.json.llm_used === false && wK.json.degraded_reason === "KILL_SWITCH" && !!wK.json.text,
      "kill-switch word-explain must degrade to resolver facts, got " + JSON.stringify(wK.json && { ok: wK.json.ok, d: wK.json.degraded_reason }));
  } catch (e) {
    failures.push("CRASH: " + (e && e.stack || e));
  } finally {
    if (srv) await stop(srv.c).catch(() => {});
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }

  const total = 15;
  if (failures.length) {
    console.error(`smoke:agent-explain-word FAIL (${total - failures.length}/${total})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`smoke:agent-explain-word OK (${total}/${total}) — PAS-A4: pure payload (displayed primary + diverges) · corpus happy · BAD_WORD · личный 403 · word-dedupe по слову · sentence-dedupe не отравлен · история kind=word · kill-switch resolver-фолбэк`);
  process.exit(0);
})();
