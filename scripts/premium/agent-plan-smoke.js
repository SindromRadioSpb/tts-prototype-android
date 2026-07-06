#!/usr/bin/env node
"use strict";
// smoke:agent-plan — гейт CLG-P6 слайса 1 (AI_MENTOR_RECON §9 «принятый план» 4.6):
// сценарий /plan + tool router + cost ledger.
//   1) 401/CSRF на /api/agent/*;
//   2) R11 honest counts: числа плана == /api/learner/due (плану нельзя over-claim);
//   3) R17-A agent-message gate: каждая секция несёт category из 5 канонических;
//   4) D1-диагностика: слово «узнаёт при чтении, проваливает диктант» → секция
//      production_gap с recommended_channel=dictate;
//   5) MNAR: /plan НЕ пишет в review_log (counts до == после);
//   6) §11 pre-call reserve: per-user лимит → деградация с текстом (R16 LLM-less);
//      ПАРАЛЛЕЛЬНЫЙ burst на последний кредит → ровно один llm_used (атомарность);
//   7) kill-switch (второй бут с AGENT_LLM_DISABLED=1) → план полезен без LLM;
//   8) tool router (pure): user_id в аргументах → reject; record_review_answer/
//      synthesize_audio → TOOL_DISABLED (skeleton, не тихий no-op);
//   9) stdout-гигиена: sentinel item_key НЕ появляется в логах сервера (класс D);
//  10) export-sweep: agent_tasks + llm_usage_ledger в /api/account/export (§10).
// Run: node scripts/premium/agent-plan-smoke.js [--gate]

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3297, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-agent-secret-0123456789abcdef";
const SENTINEL = "agentsentinel";   // префикс item_key: не должен утечь в stdout сервера
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

function startServer(dataDir, extraEnv) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET,
      AGENT_LLM_PROVIDER: "mock", AGENT_LLM_DAILY_PER_USER: "3", AGENT_LLM_DAILY_GLOBAL: "100",
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
  const li = await api("POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: "agent-smoke" } });
  eq(li.status === 200 && li.json.ok, "login failed");
  const sc0 = li.res.headers.getSetCookie ? li.res.headers.getSetCookie() : [li.res.headers.get("set-cookie")];
  return { cookie: String((sc0 || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: li.json.csrf };
}

// Сеем профиль через штатный ingest: 6 просроченных + слово с D1-дисбалансом
// (рецептивные успехи + провалы диктанта). УЧЕБНОЕ время — прошлые даты (канон UTC-Z).
function seedRows() {
  const rows = [];
  const rev = (key, i, at, grade, channel) => rows.push({
    id: SENTINEL + ":" + key + ":" + i, item_key: SENTINEL + "|" + key + "#noun", kind: "review",
    reviewed_at: at, grade, source: "room-recall", channel,
    meta_json: JSON.stringify({ keyer_version: 1 }),
  });
  // 6 due-слов: одиночный Again в прошлом → due = тот момент (Again→due-now) → просрочено.
  for (let w = 1; w <= 6; w++) rev("due" + w, 1, `2026-06-2${w}T08:00:00.000Z`, 1, "read:mc");
  // D1-дисбаланс: 2 рецептивных успеха + 2 провала диктанта (память есть: последний grade 3 держит расписание).
  rev("gap", 1, "2026-06-20T08:00:00.000Z", 3, "read:mc");
  rev("gap", 2, "2026-06-22T08:00:00.000Z", 1, "dictate:typed");
  rev("gap", 3, "2026-06-24T08:00:00.000Z", 1, "dictate:tiles");
  rev("gap", 4, "2026-06-25T08:00:00.000Z", 3, "reading:tap");
  // P6.4-followup (кейс טוב): слово, проваленное СЕГОДНЯ в чтении И диктанте, — не
  // channel-gap (рецептивной силы нет) и хоронится lapses-first due-срезом; обязано
  // всплыть секцией fresh_struggles ПЕРВОЙ (учебное время — последние часы).
  const h = (n) => new Date(Date.now() - n * 3600 * 1000).toISOString();
  rev("strug", 1, h(5), 1, "read:mc");
  rev("strug", 2, h(4), 1, "read:mc");
  rev("strug", 3, h(3), 1, "dictate:typed");
  return rows;
}

(async () => {
  // ── pure: tool router (без сервера) ─────────────────────────────────────────
  const tools = require(path.join(REPO, "agent", "tools.js"));
  const names = tools.listTools().map((t) => t.name);
  for (const must of ["get_due_words", "get_weak_words", "get_learner_context", "resolve_item_key", "create_agent_task", "record_review_answer"]) {
    eq(names.includes(must), "tool registry must contain " + must);
  }
  const b2 = await tools.callTool({ userId: "u_x" }, "get_due_words", { user_id: "u_x" });
  eq(b2.ok === false && b2.error === "USER_ID_IN_ARGS", "user_id in args must be rejected even when matching (B2)");
  // P7.0c: гейты 4.8 пройдены — теперь инструмент выключает ФЛАГ (в этом процессе
  // AGENT_REVIEW_WRITE не задан → честный FEATURE_FLAG_OFF; полный цикл = smoke:agent-review).
  delete process.env.AGENT_REVIEW_WRITE;
  const rra = await tools.callTool({ userId: "u_x" }, "record_review_answer", {});
  eq(rra.ok === false && rra.error === "TOOL_DISABLED" && rra.reason === "FEATURE_FLAG_OFF",
    "record_review_answer must be DISABLED with FEATURE_FLAG_OFF when the flag is unset");
  const tts = await tools.callTool({ userId: "u_x" }, "synthesize_audio", {});
  eq(tts.ok === false && tts.error === "TOOL_DISABLED", "synthesize_audio must be disabled until TTS limits");
  const unk = await tools.callTool({ userId: "u_x" }, "drop_table", {});
  eq(unk.ok === false && unk.error === "UNKNOWN_TOOL", "unknown tool must be rejected (closed registry)");

  // ── бут №1: mock-провайдер, лимит 3/день ────────────────────────────────────
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-agent-smoke-"));
  const srv = startServer(scratch);
  try {
    if (!(await ready(srv))) { console.error("server failed (or port orphan :" + PORT + ")\n" + srv.logs.join("").slice(-2000)); process.exit(1); }

    const un1 = await api("GET", "/api/agent/status", {});
    eq(un1.status === 401, "agent/status unauth must be 401, got " + un1.status);
    const un2 = await api("POST", "/api/agent/plan", {});
    eq(un2.status === 401, "agent/plan unauth must be 401, got " + un2.status);

    const { cookie, csrf } = await login();
    const noCsrf = await api("POST", "/api/agent/plan", { cookie });
    eq(noCsrf.status === 403, "agent/plan without CSRF must be 403, got " + noCsrf.status);

    const ing = await api("POST", "/api/learner/ingest", { cookie, csrf, body: {
      idempotency_key: "agent-smoke-seed", schema_version: 1, keyer_version: 1, review_log: seedRows(),
    } });
    eq(ing.status === 200 && ing.json.review_log && ing.json.review_log.rejected === 0,
      "seed ingest must be clean: " + JSON.stringify(ing.json && ing.json.review_log));

    const dueBefore = await api("GET", "/api/learner/due?limit=200", { cookie });
    const logBefore = await api("GET", "/api/learner/counts", { cookie });

    // ── /plan №1: mock-LLM, honest counts, R17-категории, D1-секция ───────────
    const p1 = await api("POST", "/api/agent/plan", { cookie, csrf, body: {} });
    eq(p1.status === 200 && p1.json.ok, "plan #1 failed: " + JSON.stringify(p1.json));
    const plan = p1.json.plan || {};
    eq(p1.json.llm_used === true && p1.json.provider === "mock", "plan #1 must use the mock LLM");
    eq(!!p1.json.text && p1.json.text.length > 10, "plan must carry text");
    eq(plan.generated_for && plan.generated_for.due_now === (dueBefore.json.rows || []).length,
      "R11: plan.due_now must equal /api/learner/due count, got " + (plan.generated_for && plan.generated_for.due_now) + " vs " + (dueBefore.json.rows || []).length);
    const cats = new Set(p1.json.categories || []);
    eq((plan.sections || []).length >= 2 && (plan.sections || []).every((s) => cats.has(s.category)),
      "R17-A: every plan section must carry one of the 5 canonical categories");
    const gap = (plan.sections || []).find((s) => s.id === "production_gap");
    eq(!!gap && gap.recommended_channel === "dictate" && gap.items.some((x) => x.item_key.includes("|gap#")),
      "D1: recognized-but-fails-production word must land in production_gap with dictate, got " + JSON.stringify(gap && gap.items));
    // P6.4: construct-субстрат — сервер назначает id по реальным dictate-провалам сида.
    const CReg = require(path.join(REPO, "agent", "constructs.js"));
    eq(!!gap && (gap.construct_ids || []).includes("construct:hebrew.channel_gap.reading_to_dictation")
      && (gap.constructs || []).some((c) => c.id === "construct:hebrew.channel_gap.reading_to_dictation" && c.title_ru && c.title_en),
      "P6.4: production_gap section must carry construct reading_to_dictation + ru/en titles for UI, got " + JSON.stringify(gap && gap.construct_ids));
    eq(!!gap && gap.items.every((x) => !x.construct_id || CReg.isKnown(x.construct_id)),
      "P6.4: every per-item construct_id must be registry-known (server-assigned only)");
    // P6.4-followup (кейс טוב): сегодняшние провалы — ПЕРВАЯ секция, канал по факту
    // провалов (был production-провал → диктант), и слово НЕ дублируется в due-срезе.
    const fresh = (plan.sections || [])[0];
    eq(!!fresh && fresh.id === "fresh_struggles" && fresh.recommended_channel === "dictate"
      && fresh.items.some((x) => x.item_key.includes("|strug#") && x.fails_24h >= 3 && x.prod_fails_24h >= 1)
      && !!fresh.title_ru && !!fresh.title_en,
      "fresh_struggles must be the FIRST section with the today-failed word (fails+prod_fails counted), got " + JSON.stringify((plan.sections || []).map((s) => s.id)));
    const dueSec = (plan.sections || []).find((s) => s.id === "due");
    eq(!dueSec || dueSec.items.every((x) => !x.item_key.includes("|strug#")),
      "today-failed word must NOT be duplicated into the due slice");
    eq(!!p1.json.task_id, "plan must create an agent_task");

    // MNAR: план ничего не пишет в review_log.
    const logAfter = await api("GET", "/api/learner/counts", { cookie });
    eq(JSON.stringify(logBefore.json) === JSON.stringify(logAfter.json),
      "MNAR: /plan must write NOTHING to review_log, counts diverged");

    // ── лимит 3/день: №2 обычный, затем ПАРАЛЛЕЛЬНЫЙ burst за последний кредит ─
    const p2 = await api("POST", "/api/agent/plan", { cookie, csrf, body: {} });
    eq(p2.status === 200 && p2.json.llm_used === true, "plan #2 must still use LLM (2/3)");
    const [pa, pb] = await Promise.all([
      api("POST", "/api/agent/plan", { cookie, csrf, body: {} }),
      api("POST", "/api/agent/plan", { cookie, csrf, body: {} }),
    ]);
    const usedCount = [pa, pb].filter((r) => r.json && r.json.llm_used === true).length;
    const degradedCount = [pa, pb].filter((r) => r.json && r.json.llm_used === false && r.json.degraded_reason === "USER_LIMIT" && r.json.text).length;
    eq(usedCount === 1 && degradedCount === 1,
      "pre-call reserve must be ATOMIC on the last credit: exactly one llm_used, one USER_LIMIT-degraded-with-text, got used=" + usedCount + " degraded=" + degradedCount);

    const st = await api("GET", "/api/agent/status", { cookie });
    eq(st.status === 200 && st.json.usage && st.json.usage.user_llm_calls === 3,
      "status must report 3 used LLM calls, got " + JSON.stringify(st.json.usage));
    eq(st.json.tools && st.json.tools.some((t) => t.name === "record_review_answer" && !t.enabled),
      "status must honestly list disabled skeleton tools");

    const tasks = await api("GET", "/api/agent/tasks", { cookie });
    eq(tasks.status === 200 && (tasks.json.tasks || []).filter((t) => t.kind === "plan").length === 4,
      "4 plan tasks must exist (each /plan run records one)");

    // ── P7.0a — аннулированный провал не «горит сейчас» (TELEGRAM_P7_DECISION):
    // annul 2 из 3 сегодняшних провалов слова strug (осталось 1 < порога 2) →
    // слово уходит из fresh_struggles. Лимит LLM уже исчерпан — план строится
    // детерминированно (деградация не мешает секциям, R16).
    const ingAnnul = await api("POST", "/api/learner/ingest", { cookie, csrf, body: {
      idempotency_key: "agent-smoke-annul", schema_version: 1, keyer_version: 1,
      review_log: [1, 2].map((n) => ({
        id: "annul:strug:" + n, item_key: SENTINEL + "|strug#noun", kind: "annul",
        // source НЕ 'agent:*' — P7.0c резервирует префикс за серверным reviewer-путём
        // (новая agent:-строка из клиентского батча → reject 'reserved_source').
        reviewed_at: new Date().toISOString(), grade: null, source: "correction",
        meta_json: JSON.stringify({ keyer_version: 1, annul_of: SENTINEL + ":strug:" + n }),
      })),
    } });
    eq(ingAnnul.status === 200 && ingAnnul.json.review_log && ingAnnul.json.review_log.rejected === 0,
      "P7.0a: annul rows must ingest cleanly: " + JSON.stringify(ingAnnul.json && ingAnnul.json.review_log));
    const p5 = await api("POST", "/api/agent/plan", { cookie, csrf, body: {} });
    const fresh5 = ((p5.json.plan || {}).sections || []).find((s) => s.id === "fresh_struggles");
    eq(p5.status === 200 && (!fresh5 || !fresh5.items.some((x) => x.item_key.includes("|strug#"))),
      "P7.0a: annulled fails must LEAVE fresh_struggles (2 of 3 annulled → below min), got "
      + JSON.stringify(fresh5 && fresh5.items));

    // ── export-sweep (§10): новые user_id-таблицы автоматически в экспорте ─────
    const exp = await api("GET", "/api/account/export", { cookie });
    const expStr = JSON.stringify(exp.json || {});
    eq(exp.status === 200 && expStr.includes("agent_tasks") && expStr.includes("llm_usage_ledger"),
      "account export must include agent_tasks + llm_usage_ledger (dynamic sweep)");

    // ── stdout-гигиена: sentinel-ключи не утекли в логи сервера ────────────────
    eq(!srv.logs.join("").includes(SENTINEL),
      "class D hygiene: prompt/context payload (sentinel item_keys) must NOT appear in server stdout/stderr");
  } catch (e) {
    failures.push("CRASH boot1: " + ((e && e.stack) || e));
  } finally {
    await stop(srv.c);
  }

  // ── бут №2: kill-switch → план полезен без LLM (R16) ─────────────────────────
  const srv2 = startServer(scratch, { AGENT_LLM_DISABLED: "1" });
  try {
    if (!(await ready(srv2))) { console.error("server #2 failed\n" + srv2.logs.join("").slice(-2000)); process.exit(1); }
    const { cookie, csrf } = await login();
    const pk = await api("POST", "/api/agent/plan", { cookie, csrf, body: {} });
    eq(pk.status === 200 && pk.json.ok && pk.json.llm_used === false && pk.json.degraded_reason === "KILL_SWITCH",
      "kill-switch: plan must degrade honestly, got " + JSON.stringify(pk.json && { u: pk.json.llm_used, d: pk.json.degraded_reason }));
    eq(!!pk.json.text && (pk.json.plan.sections || []).length >= 2,
      "kill-switch: degraded plan must STILL be useful (text + sections) — R16 LLM-less");
    const st2 = await api("GET", "/api/agent/status", { cookie });
    eq(st2.json && st2.json.kill_switch === true, "status must report kill_switch=true");
  } catch (e) {
    failures.push("CRASH boot2: " + ((e && e.stack) || e));
  } finally {
    await stop(srv2.c);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }

  const TOTAL = 32;   // 26 слайса 1 + 2 construct-ассерта P6.4 + 2 fresh_struggles (кейс טוב) + 2 P7.0a annul
  if (failures.length) {
    console.error(`smoke:agent-plan FAIL (${TOTAL - failures.length}/${TOTAL})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:agent-plan OK (${TOTAL}/${TOTAL}) — CLG-P6 слайс 1: tool router (закрытый реестр · B2 user_id-reject · skeleton-disabled) · /plan honest counts (R11) · R17-категории · D1 production_gap · MNAR (review_log нетронут) · pre-call reserve атомарен на burst · LLM-less degradation (лимит + kill-switch) · export-sweep · stdout-гигиена класса D · P7.0a annul гасит fresh_struggles`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
