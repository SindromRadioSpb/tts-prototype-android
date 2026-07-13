#!/usr/bin/env node
"use strict";
// smoke:agent-byok — гейт PAS-F1 BYOK-расширения (спека PAS_F1_BYOK_EXTENSION_HANDOFF v2
// после критики wf_59ca6197).
//   Pure: llm.generate mock-прецеденс (mock ВСЕГДА выигрывает — герметичность; R16-02/R11-2) ·
//     [mock-byok]-маркер ТОЛЬКО в prose (R11-1) · BYOKFAIL-триггер (R11-3) ·
//     литералы localStorage БАЙТ-РАВНЫ library-ui.js/studio-agent.js (UX-6).
//   Boot #1 (mock): 400-луп BYOK_INVALID по ВСЕМ 10 LLM-endpoint'ам (byok:{} — деградат
//     НИКОГДА не проваливается на серверный путь, R16-04/R11-5) · happy byok prose
//     (next-text: [mock-byok], key_source, квота НЕ тратится, ledger kind=llm_call_byok) ·
//     серверная регрессия без byok · byok json-сценарий (comprehension: маркер не ломает
//     JSON) · персистящий путь (corpus-explain с sentinel-ключом) ДО байт-скана БД (R16-05) ·
//     BYOK_FAILED (BYOKFAIL-ключ → 502, квота цела, ledger failed, серверный путь жив —
//     анти-заимствование в обе стороны) · roleplay cap-skip (ROLEPLAY_DAILY=2: byok-ходы
//     НЕ инкрементят scenarioCallsToday, R11-7) · malformed-JSON с sentinel-ключом →
//     400 И sentinel НЕ в stdout/stderr (BLOCKER F1-R16-01) · sentinel не в БД.
//   Boot #2 (kill-switch): byok-запрос → честный отказ, ledger пуст (kill глушит всё).
// Run: node scripts/premium/agent-byok-smoke.js   (exit 0 = green)

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3313, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-byok-secret-0123456789abcd";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
let _n = 0;
const eq = (c, m) => { _n++; if (!c) { failures.push(m); console.log("  ✗ " + m); } else { console.log("  ✓ " + m.slice(0, 80)); } };

const SENTINEL_KEY = "BYOKSENTINEL" + "x".repeat(28);          // 40 симв., валидный формат openrouter
const GOOD_KEY = "GOODBYOKKEY" + "y".repeat(29);
const FAIL_KEY = "BYOKFAIL" + "z".repeat(32);                  // mock-триггер {ok:false}

function startServer(dataDir, extraEnv) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET,
      AGENT_LLM_PROVIDER: "mock", AGENT_LLM_DAILY_PER_USER: "20", AGENT_LLM_DAILY_GLOBAL: "100",
      ROLEPLAY_DAILY: "2", CORPUS_WORKS_DEV_FALLBACK: "", ...(extraEnv || {}) },
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
async function api(method, p, { cookie, csrf, body, rawBody } = {}) {
  const h = { "Content-Type": "application/json" };
  if (cookie) h["Cookie"] = cookie;
  if (csrf) h["X-LP-CSRF"] = csrf;
  const res = await fetch(BASE + p, { method, headers: h, body: rawBody != null ? rawBody : (body != null ? JSON.stringify(body) : undefined) });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}
async function login() {
  const res = await fetch(BASE + "/api/auth/bootstrap-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: SECRET, deviceLabel: "byok-smoke" }) });
  const j = await res.json(); const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")];
  return { cookie: String((sc || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: j.csrf };
}
function openDb(scratch) { const s = require(path.join(REPO, "node_modules", "sqlite3")); return new s.Database(path.join(scratch, "app.db")); }
function dbAll(db, sql, p) { return new Promise((res, rej) => db.all(sql, p || [], (e, r) => (e ? rej(e) : res(r || [])))); }
async function ledgerRows(scratch, kind) {
  const db = openDb(scratch);
  try { return await dbAll(db, `SELECT * FROM llm_usage_ledger WHERE kind=?`, [kind]); }
  finally { await new Promise((r) => db.close(() => r())); }
}
function scanDb(scratch, marker) {
  const needle = Buffer.from(marker, "utf8");
  for (const f of ["app.db", "app.db-wal", "app.db-shm"]) {
    const p = path.join(scratch, f);
    if (!fs.existsSync(p)) continue;
    if (fs.readFileSync(p).includes(needle)) return f;
  }
  return null;
}

// corpus-фикстура (образец agent-profile-smoke)
const WORK_ID = "88001";
const SENT = "הַיֶּלֶד קוֹרֵא סֵפֶר";
function worksFixture() {
  const rows = [
    { order_index: 0, hebrew_niqqud: SENT, hebrew_plain: "הילד קורא ספר", translit: null, russian: "мальчик читает книгу" },
    { order_index: 1, hebrew_niqqud: "הַסֵּפֶר גָּדוֹל", hebrew_plain: "הספר גדול", translit: null, russian: "книга большая" },
  ];
  const textKey = crypto.createHash("sha256").update(rows.map((r) => r.hebrew_plain).join("\n"), "utf8").digest("hex");
  return { textKey, body: { library: { texts: [{ text_key: textKey, title: "בדיקה",
    rows, source_meta: { origin: "benyehuda-ingest", corpus: { schema: 1, byehuda_id: WORK_ID, author: "בודק", era: "tehiya", provenance: { source: "Project Ben-Yehuda", license: "public-domain" } } } }] } } };
}

(async () => {
  // ── pure: mock-прецеденс + маркер + BYOKFAIL-триггер ──────────────────────────
  process.env.AGENT_LLM_PROVIDER = "mock";
  const llm = require(path.join(REPO, "agent", "llm.js"));
  const p1 = await llm.generate({ system: "s", prompt: "p", byokProvider: "gemini", byokKey: GOOD_KEY });
  eq(p1.ok && p1.provider === "mock" && p1.text.indexOf("[mock-byok] ") === 0,
    "pure: mock ВСЕГДА выигрывает диспатч (byokProvider не уводит в реальную сеть) + prose-маркер");
  const p2 = await llm.generate({ system: "s", prompt: "p", json: true, fixture: "roleplay", byokProvider: "openrouter", byokKey: GOOD_KEY });
  eq(p2.ok && p2.text.indexOf("[mock-byok]") === -1 && (() => { try { JSON.parse(p2.text); return true; } catch (_) { return false; } })(),
    "pure: json-режим БЕЗ маркера — JSON.parse жив (критика R11-1)");
  const p3 = await llm.generate({ system: "s", prompt: "p", byokProvider: "openrouter", byokKey: FAIL_KEY });
  eq(p3.ok === false && p3.error === "MOCK_BYOK_FAIL", "pure: BYOKFAIL-ключ ломает ТОЛЬКО byok-вызов (in-band триггер)");
  const p4 = await llm.generate({ system: "s", prompt: "p" });
  eq(p4.ok && p4.text.indexOf("[mock-byok]") === -1, "pure: серверный mock-путь без маркера");

  // литералы localStorage байт-равны в двух precached-файлах (критика UX-6)
  const libSrc = fs.readFileSync(path.join(REPO, "public", "js", "library-ui.js"), "utf8");
  const saSrc = fs.readFileSync(path.join(REPO, "public", "js", "studio-agent.js"), "utf8");
  for (const lit of ["'agent.byok.provider'", "'agent.byok.key'"]) {
    eq(libSrc.includes(lit) && saSrc.includes(lit), "literal " + lit + " byte-equal в library-ui и studio-agent");
  }

  // ════ Boot #1 (mock) ════
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-byok-smoke-"));
  const fx = worksFixture();
  fs.mkdirSync(path.join(scratch, "benyehuda", "works"), { recursive: true });
  fs.writeFileSync(path.join(scratch, "benyehuda", "works", WORK_ID + ".json"), JSON.stringify(fx.body));

  const srv = startServer(scratch);
  try {
    if (!(await ready(srv))) { console.error("server failed\n" + srv.logs.join("").slice(-2000)); process.exit(1); }
    const { cookie, csrf } = await login();
    const B = (extra) => ({ cookie, csrf, body: extra });
    const OR = { provider: "openrouter", key: GOOD_KEY };

    // corpus-index ready[0] для next-text
    const vm = libSrc.match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/);
    const ready0 = (JSON.parse(fs.readFileSync(path.join(REPO, "public", "data", "benyehuda", "corpus-index-v" + vm[1] + ".json"), "utf8")).ready || [])[0];
    const NT_PICK = { work_id: String(ready0.id), cov: 0.8, load_flag: false, kind: "next", frontier_pids: [] };

    // ── (R11-5) 400-луп: byok:{} → BYOK_INVALID на ВСЕХ 10 endpoint'ах ─────────
    const EPS = [
      ["/api/agent/plan", {}],
      ["/api/agent/explain", { scope_level: "sentence_only", source: "corpus", work_id: WORK_ID, text_key: fx.textKey, order_index: 0 }],
      ["/api/agent/explain/followup", { explanation_id: "x", question: "q" }],
      ["/api/agent/comprehension", { work_id: WORK_ID, text_key: fx.textKey, order_index: 0 }],
      ["/api/agent/explain-word", { source: "corpus", work_id: WORK_ID, text_key: fx.textKey, order_index: 0, surface: "ספר" }],
      ["/api/agent/study-summary", { text_key: fx.textKey }],
      ["/api/agent/draft-retell", { work_id: WORK_ID, text_key: fx.textKey, order_index: 0 }],
      ["/api/agent/roleplay/turn", { session_id: "x", message: "מה" }],
      ["/api/agent/writing/review", { targets: ["pid:1"], text: "שלום עולם" }],
      ["/api/agent/next-text/explain", { pick: NT_PICK }],
    ];
    for (const [ep, body] of EPS) {
      const r = await api("POST", ep, B({ ...body, byok: {} }));
      eq(r.status === 400 && r.json && r.json.error === "BYOK_INVALID",
        "byok:{} → 400 BYOK_INVALID на " + ep + " (не тихий серверный путь), got " + r.status + "/" + (r.json && r.json.error));
    }
    const u0 = await api("GET", "/api/agent/status", { cookie });
    eq(u0.json.usage.user_llm_calls === 0, "400-луп не потратил ни одного серверного вызова");

    // ── happy byok prose (next-text) ────────────────────────────────────────────
    const h1 = await api("POST", "/api/agent/next-text/explain", B({ pick: NT_PICK, byok: OR }));
    eq(h1.status === 200 && h1.json.ok && h1.json.key_source === "byok" && h1.json.text.indexOf("[mock-byok]") === 0,
      "happy byok: 200 + key_source=byok + mock-маркер (ключ дошёл до провайдер-ветки)");
    const u1 = await api("GET", "/api/agent/status", { cookie });
    eq(u1.json.usage.user_llm_calls === 0, "byok-вызов НЕ тратит серверную квоту");
    eq(u1.json.usage.byok_calls_today === 1, "usage.byok_calls_today отражает доставленный byok-ответ");
    let lb = await ledgerRows(scratch, "llm_call_byok");
    eq(lb.length === 1 && lb[0].status === "final" && lb[0].provider === "byok:openrouter" && lb[0].scenario === "next_text",
      "ledger: ровно 1 строка kind=llm_call_byok final byok:openrouter");

    // ── серверная регрессия: тот же запрос БЕЗ byok ────────────────────────────
    const h2 = await api("POST", "/api/agent/next-text/explain", B({ pick: NT_PICK }));
    eq(h2.status === 200 && h2.json.ok && !h2.json.key_source, "серверный путь: 200 без key_source (байт-прежнее поведение)");
    const u2 = await api("GET", "/api/agent/status", { cookie });
    eq(u2.json.usage.user_llm_calls === 1, "серверный вызов тратит квоту как раньше");

    // ── byok json-сценарий: comprehension (маркер не ломает JSON) ───────────────
    const h3 = await api("POST", "/api/agent/comprehension", B({ work_id: WORK_ID, text_key: fx.textKey, order_index: 0, byok: OR }));
    eq(h3.status === 200 && h3.json.ok && h3.json.key_source === "byok" && Array.isArray(h3.json.questions) && h3.json.questions.length >= 1,
      "byok json-сценарий: comprehension 200 + вопросы (маркер prose-only)");

    // ── персистящий путь с sentinel-ключом (R16-05) — ДО байт-скана ────────────
    const h4 = await api("POST", "/api/agent/explain", B({ scope_level: "sentence_only", source: "corpus", work_id: WORK_ID, text_key: fx.textKey, order_index: 0, byok: { provider: "openrouter", key: SENTINEL_KEY } }));
    eq(h4.status === 200 && h4.json.ok && h4.json.key_source === "byok", "byok corpus-explain (персистящий путь) 200");
    eq(h4.json.explanation_id != null, "explain персистировал объяснение");

    // ── BYOK_FAILED: анти-заимствование в обе стороны ──────────────────────────
    const f1 = await api("POST", "/api/agent/next-text/explain", B({ pick: NT_PICK, byok: { provider: "openrouter", key: FAIL_KEY } }));
    eq(f1.status === 502 && f1.json.error === "BYOK_FAILED", "BYOKFAIL-ключ → 502 BYOK_FAILED (НЕ фолбэк на серверный ключ)");
    const u3 = await api("GET", "/api/agent/status", { cookie });
    eq(u3.json.usage.user_llm_calls === 1, "byok-фейл НЕ тратит серверную квоту");
    lb = await ledgerRows(scratch, "llm_call_byok");
    eq(lb.some((r) => r.status === "failed"), "ledger несёт failed byok-строку (телеметрия честна)");
    // к этой точке final-вызовов ровно 3 (next-text + comprehension + corpus-explain); failed НЕ входит
    eq(u3.json.usage.byok_calls_today === 3, "byok_calls_today считает ТОЛЬКО final (failed не инфлирует счётчик)");
    const f2 = await api("POST", "/api/agent/next-text/explain", B({ pick: NT_PICK }));
    eq(f2.status === 200 && f2.json.ok, "серверный путь жив ПОСЛЕ byok-фейла (ничего не съедено)");

    // ── roleplay: scenario-cap только серверный путь (ROLEPLAY_DAILY=2, R11-7) ──
    const rs = await api("POST", "/api/agent/roleplay/start", B({ work_id: WORK_ID, text_key: fx.textKey, order_index: 0 }));
    eq(rs.status === 200 && rs.json.ok, "roleplay start (без LLM) ok");
    const sid = rs.json.session_id;
    const t1 = await api("POST", "/api/agent/roleplay/turn", B({ session_id: sid, message: "מה קורה" }));
    eq(t1.status === 200 && t1.json.ok && !t1.json.key_source, "turn#1 серверный (spent=1)");
    const t2 = await api("POST", "/api/agent/roleplay/turn", B({ session_id: sid, message: "עוד", byok: OR }));
    const t3 = await api("POST", "/api/agent/roleplay/turn", B({ session_id: sid, message: "עוד פעם", byok: OR }));
    eq(t2.status === 200 && t2.json.key_source === "byok" && t3.status === 200, "turn#2/#3 byok — кап скипнут");
    const t4 = await api("POST", "/api/agent/roleplay/turn", B({ session_id: sid, message: "שוב" }));
    eq(t4.status === 200 && t4.json.ok, "turn#4 серверный (spent=2 ≤ cap) — byok-ходы НЕ инкрементили scenarioCallsToday");
    const t5 = await api("POST", "/api/agent/roleplay/turn", B({ session_id: sid, message: "אחרון" }));
    eq(t5.status === 429 && t5.json.error === "ROLEPLAY_DAILY_LIMIT", "turn#5 серверный → 429 (кап жив для серверного пути)");

    // ── BLOCKER F1-R16-01: malformed JSON с ключом → 400, ключ НЕ в логах ───────
    const mj = await api("POST", "/api/agent/plan", { cookie, csrf, rawBody: '{"byok":{"provider":"openrouter","key":"' + SENTINEL_KEY + '"},,,' });
    eq(mj.status === 400, "malformed JSON → 400, got " + mj.status);
    eq(!srv.logs.join("").includes(SENTINEL_KEY), "sentinel-ключ НЕ в stdout/stderr (redacted error-handler)");

    // ── байт-скан БД: ключ нигде не персистится ─────────────────────────────────
    const hitDb = scanDb(scratch, SENTINEL_KEY);
    eq(hitDb === null, "sentinel-ключ НЕ в файле БД (включая WAL), found in " + hitDb);
  } finally { await stop(srv.c); }

  // ════ Boot #2: kill-switch глушит И byok ════
  const scratch2 = fs.mkdtempSync(path.join(os.tmpdir(), "lp-byok-smoke2-"));
  const srv2 = startServer(scratch2, { AGENT_LLM_DISABLED: "1" });
  try {
    if (!(await ready(srv2))) { console.error("server2 failed\n" + srv2.logs.join("").slice(-2000)); process.exit(1); }
    const { cookie, csrf } = await login();
    const vm = libSrc.match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/);
    const ready0 = (JSON.parse(fs.readFileSync(path.join(REPO, "public", "data", "benyehuda", "corpus-index-v" + vm[1] + ".json"), "utf8")).ready || [])[0];
    const r = await api("POST", "/api/agent/next-text/explain", { cookie, csrf, body: { pick: { work_id: String(ready0.id), cov: 0.8, kind: "next", frontier_pids: [] }, byok: { provider: "openrouter", key: GOOD_KEY } } });
    eq(r.status === 503 && r.json.error === "KILL_SWITCH", "kill-switch глушит И byok-путь (аварийный тормоз всего)");
    const lb2 = await ledgerRows(scratch2, "llm_call_byok");
    eq(lb2.length === 0, "kill-switch: ledger byok пуст");
  } finally { await stop(srv2.c); }

  if (failures.length) {
    console.error("\nsmoke:agent-byok FAILED (" + failures.length + "/" + _n + "):");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("\nsmoke:agent-byok OK (" + _n + "/" + _n + ") — PAS-F1: pure mock-прецеденс/маркер/BYOKFAIL + литералы byte-equal + 400-луп 10 endpoint'ов + happy prose/json + квота-изоляция + анти-заимствование (обе стороны) + roleplay cap-skip + malformed-JSON redaction (BLOCKER) + no-persist + kill-switch");
  process.exit(0);
})().catch((e) => { console.error("smoke:agent-byok crashed:", e && e.message); process.exit(1); });
