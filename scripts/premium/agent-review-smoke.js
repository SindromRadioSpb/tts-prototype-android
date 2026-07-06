#!/usr/bin/env node
"use strict";
// smoke:agent-review — гейт P7.0c (TELEGRAM_P7_DECISION §P7.0c v2, адъюдикация критики
// wf_28ac3c6e): активация record_review_answer — полный write-цикл БЕЗ Telegram.
// Матрица двух бутов:
//   OFF: полноценный валидный grade-запрос → 403 FEATURE_FLAG_OFF И лог байт-неизменен
//        (флаг, проверенный ПОСЛЕ записи, гейт бы поймал);
//   ON:  401/CSRF · correct через ШТАТНЫЙ ingest (source='agent:review', провенанс-meta,
//        id==пересчитанный reviewId) · проекция в том же запросе · идемпотентность
//        attempt_id (replayed, counts неизменны) · '#'-ключи НЕ грузят pealim-датасет ·
//        wrong→Again(1) · skip→kind='skip' · MNAR (empty/не-иврит; log-хвост по ids) ·
//        ktiv-male → recorded:false (write-gate, ложный lapse не минтится) · реджекты
//        (production-lock/канал/args-whitelist/attempt_id/длина/UNKNOWN_ITEM/sent:/
//        EXPECTED_UNRESOLVED вкл. skip-путь) · reserved_source (новая agent:-строка из
//        клиентского батча → reject; echo существующей → dup) · annul: byte-снимок
//        проекции ДО ошибочного грейда == ПОСЛЕ annul (движко-независимо) + контракты
//        минтера (missing/foreign/sent:/annul-of-annul/reason/24ч) + double-annul
//        идемпотентен + annul-to-null удаляет проекцию · oracle clean · stdout-гигиена ·
//   Браузер-нога (паттерн cloud-sync-smoke; грейды минтятся в Node-ноге ДО открытия
//   страницы — браузерные акты только login+fullSync+чтение, act-retry-safe):
//        agent-строки доезжают в ЛОКАЛЬНЫЙ OPFS review_log · «Зал видит» (локальный
//        sched == FC.replay(локальный лог) == серверная проекция) · annul-to-null →
//        clearSrsState (srs_due NULL, ручная ось цела).
// Run: node scripts/premium/agent-review-smoke.js [--gate]

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3298, BASE = "http://127.0.0.1:" + PORT;
const SECRET = "smoke-agent-review-0123456789abcdef";
const LC = require(path.join(REPO, "public", "js", "lemma-canon.js"));

// Сентинелы: уникальные ивритские строки — не должны утечь в stdout сервера (класс C/D).
const KEY_A = "שלוםבדיקה#noun";
const KEY_KTIV = "דבר#verb";
const KEY_C = "ספרבדיקה#noun";
const KEY_D = "עולםבדיקה#noun";
const KEY_PID = "pid:99999999";
const SENT_KEY = "sent:בדיקה#3";
const ANSWER_WRONG = "זיוףבדיקה";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };
// [phase]-маркеры: «завис ли смок» диагностируется по последнему маркеру, не по CPU
// (урок feedback_smoke_hang_env_diagnosis).
const mark = (s) => console.log("[agent-review] " + s);
const withTimeout = (p, ms, label) => Promise.race([p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(label + " timeout " + ms + "ms")), ms))]);

function startServer(dataDir, extraEnv) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AUTH_BOOTSTRAP_SECRET: SECRET, ...(extraEnv || {}) },
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
async function login(label) {
  const li = await api("POST", "/api/auth/bootstrap-login", { body: { secret: SECRET, deviceLabel: label } });
  eq(li.status === 200 && li.json.ok, "login failed (" + label + ")");
  const sc0 = li.res.headers.getSetCookie ? li.res.headers.getSetCookie() : [li.res.headers.get("set-cookie")];
  return { cookie: String((sc0 || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: li.json.csrf };
}
async function logIds(sess) {
  const r = await api("GET", "/api/learner/log?limit=2000", sess);
  return (r.json && r.json.rows || []).map((w) => w.id).join(",");
}
async function serverRow(sess, id) {
  const r = await api("GET", "/api/learner/log?limit=2000", sess);
  return (r.json && r.json.rows || []).find((w) => w.id === id) || null;
}
async function projOf(sess, key) {
  const r = await api("GET", "/api/learner/projections?limit=2000", sess);
  const row = (r.json && r.json.rows || []).find((w) => w.item_key === key) || null;
  if (!row) return null;
  // byte-снимок ПОЛЕЙ состояния (computed_at/engine намеренно вне сравнения)
  return JSON.stringify({ due: row.due, reps: row.reps, lapses: row.lapses,
    stability: row.stability, difficulty: row.difficulty, reviewed_at: row.reviewed_at });
}
const rev = (id, key, at, grade, channel, extraMeta) => ({
  id, item_key: key, kind: "review", reviewed_at: at, grade, source: "room-recall", channel,
  meta_json: JSON.stringify({ keyer_version: 1, ...(extraMeta || {}) }),
});

(async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-agent-review-"));

  // ── boot OFF: флаг не задан → инструмент выключен, лог неприкосновенен ──────
  delete process.env.AGENT_REVIEW_WRITE;   // защита от унаследованного env
  mark("boot OFF: starting server");
  const srv1 = startServer(scratch);
  try {
    if (!(await ready(srv1))) { console.error("server(OFF) failed (or port orphan :" + PORT + ")\n" + srv1.logs.join("").slice(-2000)); process.exit(1); }
    mark("boot OFF: ready");
    const sess = await login("review-smoke-off");
    const ing = await api("POST", "/api/learner/ingest", { ...sess, body: {
      idempotency_key: "arv-seed-a", schema_version: 1, keyer_version: 1,
      review_log: [
        rev("a1", KEY_A, "2026-06-20T08:00:00.000Z", 3, "read:mc"),
        rev("a2", KEY_A, "2026-06-25T08:00:00.000Z", 3, "read:mc"),
      ],
    } });
    eq(ing.status === 200 && ing.json.review_log.rejected === 0, "OFF: seed ingest must be clean: " + JSON.stringify(ing.json && ing.json.review_log));
    const before = await logIds(sess);
    const off = await api("POST", "/api/agent/review", { ...sess, body: {
      item_key: KEY_A, answer: "שלוםבדיקה", channel: "read:agent", attempt_id: "att-off-000001",
    } });
    eq(off.status === 403 && off.json && off.json.error === "TOOL_DISABLED" && off.json.reason === "FEATURE_FLAG_OFF",
      "OFF: full valid grade must be 403 FEATURE_FLAG_OFF, got " + off.status + " " + JSON.stringify(off.json));
    eq((await logIds(sess)) === before, "OFF: review_log must be BYTE-unchanged after a flag-off attempt");
    const st = await api("GET", "/api/agent/status", sess);
    eq(st.json && (st.json.tools || []).some((t) => t.name === "record_review_answer" && !t.enabled && t.disabled_reason === "FEATURE_FLAG_OFF"),
      "OFF: status must list record_review_answer disabled with FEATURE_FLAG_OFF");
  } catch (e) { failures.push("CRASH boot OFF: " + ((e && e.stack) || e)); }
  finally { await stop(srv1.c); }

  // ── boot ON: полный цикл ────────────────────────────────────────────────────
  mark("boot ON: starting server");
  const srv = startServer(scratch, { AGENT_REVIEW_WRITE: "1" });
  let pw = null, browser = null;
  try {
    if (!(await ready(srv))) { console.error("server(ON) failed\n" + srv.logs.join("").slice(-2000)); process.exit(1); }

    mark("boot ON: ready");
    const un = await api("POST", "/api/agent/review", { body: {} });
    eq(un.status === 401, "ON: unauth must be 401, got " + un.status);
    const sess = await login("review-smoke-on");
    const noCsrf = await api("POST", "/api/agent/review", { cookie: sess.cookie, body: {} });
    eq(noCsrf.status === 403, "ON: no-CSRF must be 403, got " + noCsrf.status);
    const st = await api("GET", "/api/agent/status", sess);
    eq(st.json && (st.json.tools || []).some((t) => t.name === "record_review_answer" && t.enabled === true),
      "ON: status must list record_review_answer enabled");

    const ing2 = await api("POST", "/api/learner/ingest", { ...sess, body: {
      idempotency_key: "arv-seed-rest", schema_version: 1, keyer_version: 1,
      review_log: [
        rev("k1", KEY_KTIV, "2026-06-22T08:00:00.000Z", 3, "read:mc"),
        { id: "c-mark", item_key: KEY_C, kind: "mark", reviewed_at: "2026-06-22T09:00:00.000Z", grade: null,
          source: "word-mark", meta_json: JSON.stringify({ keyer_version: 1, status: "l2" }) },
        rev("d1", KEY_D, "2026-06-23T08:00:00.000Z", 3, "read:mc"),
        rev("s1", SENT_KEY, "2026-06-24T08:00:00.000Z", 3, "read:mc"),
        rev("p1", KEY_PID, "2026-06-24T09:00:00.000Z", 3, "read:mc"),
      ],
    } });
    eq(ing2.status === 200 && ing2.json.review_log.rejected === 0, "ON: seed ingest must be clean: " + JSON.stringify(ing2.json && ing2.json.review_log));

    mark("grade: correct");
    // correct → запись через штатный ingest + проекция в том же запросе
    const corr = await api("POST", "/api/agent/review", { ...sess, body: {
      item_key: KEY_A, answer: "שלוםבדיקה!", channel: "read:agent", attempt_id: "att-a-corr-0001",
    } });
    eq(corr.status === 200 && corr.json.ok && corr.json.recorded === true && corr.json.decision === "correct" && corr.json.grade === 3 && !!corr.json.row_id,
      "correct must record grade 3, got " + JSON.stringify(corr.json));
    const corrRow = await serverRow(sess, corr.json.row_id);
    let corrMeta = {}; try { corrMeta = JSON.parse(corrRow.meta_json); } catch (_) {}
    eq(!!corrRow && corrRow.source === "agent:review" && corrRow.channel === "read:agent" && corrRow.kind === "review",
      "server row must carry source=agent:review/channel/kind, got " + JSON.stringify(corrRow && { s: corrRow.source, c: corrRow.channel, k: corrRow.kind }));
    eq(["policy_version", "normalizer_version", "resolver_version", "expected_form_id", "decision", "reason", "grader", "keyer_version"]
        .every((k) => k in corrMeta) && corrMeta.expected_form_id === KEY_A && corrMeta.grader === "deterministic"
        && !("answer" in corrMeta) && !("surface" in corrMeta),
      "grader provenance must live in server meta (and NO raw answer), got " + corrRow.meta_json);
    eq(LC.reviewId({ item_key: corrRow.item_key, reviewed_at: corrRow.reviewed_at, grade: corrRow.grade, source: corrRow.source, channel: corrRow.channel }) === corr.json.row_id,
      "row id must equal content-recomputed LemmaCanon.reviewId");
    const s1 = await projOf(sess, KEY_A);
    eq(!!s1 && JSON.parse(s1).reps === 3, "projection must be recomputed IN the same request (2 seeded + 1 agent = reps 3), got " + s1);

    mark("idempotency replay");
    // идемпотентность попытки: тот же attempt_id → replayed, лог неизменен
    const idsBeforeReplay = await logIds(sess);
    const corr2 = await api("POST", "/api/agent/review", { ...sess, body: {
      item_key: KEY_A, answer: "שלוםבדיקה!", channel: "read:agent", attempt_id: "att-a-corr-0001",
    } });
    eq(corr2.status === 200 && corr2.json.recorded === true && corr2.json.replayed === true,
      "same attempt_id must REPLAY, not double-write, got " + JSON.stringify(corr2.json));
    eq((await logIds(sess)) === idsBeforeReplay, "replayed attempt must leave the log byte-unchanged");

    // R16: '#'-ключи не грузят pealim-датасет (write-path без 306MB бандла)
    const ks = await api("GET", "/api/learner/keying/status", sess);
    eq(ks.json && ks.json.loaded === false, "grading '#'-keys must NOT load the pealim dataset, got " + JSON.stringify(ks.json && ks.json.loaded));

    mark("grade: wrong");
    // wrong → Again(1) рецептивный lapse; снимок S2 ≠ S1
    const wrong = await api("POST", "/api/agent/review", { ...sess, body: {
      item_key: KEY_A, answer: ANSWER_WRONG, channel: "read:agent", attempt_id: "att-a-wrong-0001",
    } });
    eq(wrong.status === 200 && wrong.json.recorded === true && wrong.json.decision === "wrong" && wrong.json.grade === 1,
      "wrong must record Again(1), got " + JSON.stringify(wrong.json));
    const s2 = await projOf(sess, KEY_A);
    eq(!!s2 && s2 !== s1, "projection must move after the wrong grade");

    mark("MNAR abstains");
    // MNAR: empty / не-иврит → recorded:false, лог-хвост (ids) байт-неизменен
    const idsBeforeMnar = await logIds(sess);
    const mnar1 = await api("POST", "/api/agent/review", { ...sess, body: {
      item_key: KEY_A, answer: "abv 123", channel: "read:agent", attempt_id: "att-a-mnar-0001",
    } });
    eq(mnar1.status === 200 && mnar1.json.recorded === false && mnar1.json.decision === "unsupported",
      "non-Hebrew answer must abstain (unsupported), got " + JSON.stringify(mnar1.json));
    const mnar2 = await api("POST", "/api/agent/review", { ...sess, body: {
      item_key: KEY_A, answer: "", channel: "read:agent", attempt_id: "att-a-mnar-0002",
    } });
    eq(mnar2.status === 200 && mnar2.json.recorded === false && mnar2.json.decision === "empty",
      "empty answer must abstain (empty), got " + JSON.stringify(mnar2.json));
    eq((await logIds(sess)) === idsBeforeMnar, "MNAR: log id-list must be byte-unchanged after abstains");

    // ktiv-male → write-gate: вердикт честный, запись НЕ минтится (ложный lapse запрещён)
    const ktiv = await api("POST", "/api/agent/review", { ...sess, body: {
      item_key: KEY_KTIV, answer: "דיבר", channel: "read:agent", attempt_id: "att-k-ktiv-0001",
    } });
    eq(ktiv.status === 200 && ktiv.json.recorded === false && ktiv.json.reason === "ktiv-candidate" && ktiv.json.ktiv_gate === true,
      "ktiv-male answer must hit the write-gate (recorded:false), got " + JSON.stringify(ktiv.json));
    eq((await logIds(sess)) === idsBeforeMnar, "ktiv gate must write NOTHING");

    // skip → kind='skip', grade 1
    const skip = await api("POST", "/api/agent/review", { ...sess, body: {
      item_key: KEY_KTIV, skipped: true, channel: "read:agent", attempt_id: "att-k-skip-0001",
    } });
    eq(skip.status === 200 && skip.json.recorded === true && skip.json.decision === "skip" && skip.json.grade === 1,
      "explicit skip must record Again(1), got " + JSON.stringify(skip.json));
    const skipRow = await serverRow(sess, skip.json.row_id);
    eq(!!skipRow && skipRow.kind === "skip", "skip row must be kind='skip'");

    mark("contract rejects");
    // реджекты контракта — каждый с кодом; лог-хвост потом сверяется разом
    const idsBeforeRejects = await logIds(sess);
    const rj = async (body, wantStatus, wantErr) => {
      const r = await api("POST", "/api/agent/review", { ...sess, body });
      eq(r.status === wantStatus && r.json && r.json.error === wantErr,
        wantErr + ": want " + wantStatus + ", got " + r.status + " " + JSON.stringify(r.json));
    };
    await rj({ item_key: KEY_A, answer: "שלוםבדיקה", channel: "dictate:agent", attempt_id: "att-rej-00001" }, 400, "PRODUCTION_CHANNEL_LOCKED");
    await rj({ item_key: KEY_A, answer: "שלוםבדיקה", channel: "reverse:agent", attempt_id: "att-rej-00002" }, 400, "PRODUCTION_CHANNEL_LOCKED");
    await rj({ item_key: KEY_A, answer: "שלוםבדיקה", channel: "reading:tap", attempt_id: "att-rej-00003" }, 400, "BAD_CHANNEL");
    await rj({ item_key: KEY_A, answer: "שלוםבדיקה", channel: "read", attempt_id: "att-rej-00004" }, 400, "BAD_CHANNEL");
    await rj({ item_key: KEY_A, answer: "שלוםבדיקה", channel: "read:agent", attempt_id: "att-rej-00005", expected: { form: "x" } }, 400, "UNKNOWN_ARG");
    await rj({ item_key: KEY_A, answer: "שלוםבדיקה", skipped: true, channel: "read:agent", attempt_id: "att-rej-00006" }, 400, "SKIP_WITH_ANSWER");
    await rj({ item_key: KEY_A, answer: "שלוםבדיקה", channel: "read:agent", attempt_id: "x" }, 400, "BAD_ATTEMPT_ID");
    await rj({ item_key: KEY_A, answer: "ש".repeat(401), channel: "read:agent", attempt_id: "att-rej-00007" }, 400, "ANSWER_TOO_LONG");
    await rj({ item_key: "לאקיים#noun", answer: "שלום", channel: "read:agent", attempt_id: "att-rej-00008" }, 404, "UNKNOWN_ITEM");
    await rj({ item_key: SENT_KEY, answer: "שלום", channel: "read:agent", attempt_id: "att-rej-00009" }, 400, "SENT_ITEM_UNSUPPORTED");
    // EXPECTED_UNRESOLVED: у pid:99999999 ЕСТЬ лог-строка (UNKNOWN_ITEM не срабатывает),
    // но displayForItemKey честно фолбэчит сырым ключом → reject, и на skip-пути тоже.
    await rj({ item_key: KEY_PID, answer: "שלום", channel: "read:agent", attempt_id: "att-rej-00010" }, 400, "EXPECTED_UNRESOLVED");
    await rj({ item_key: KEY_PID, skipped: true, channel: "read:agent", attempt_id: "att-rej-00011" }, 400, "EXPECTED_UNRESOLVED");
    eq((await logIds(sess)) === idsBeforeRejects, "rejects must write NOTHING (log id-list byte-unchanged)");

    mark("reserved_source");
    // reserved_source: клиентский батч не может минтить НОВЫЕ agent:-строки; echo — dup
    const forged = await api("POST", "/api/learner/ingest", { ...sess, body: {
      idempotency_key: "arv-forged", schema_version: 1, keyer_version: 1,
      review_log: [{ id: "forged-1", item_key: KEY_A, kind: "review", reviewed_at: new Date().toISOString(),
        grade: 3, source: "agent:review", channel: "read:agent", meta_json: JSON.stringify({ keyer_version: 1 }) }],
    } });
    eq(forged.status === 200 && forged.json.review_log.rejected === 1
        && (forged.json.rejected || []).some((x) => x.reason === "reserved_source"),
      "NEW client row with source=agent:* must be rejected as reserved_source, got " + JSON.stringify(forged.json && forged.json.review_log));
    const echo = await api("POST", "/api/learner/ingest", { ...sess, body: {
      idempotency_key: "arv-echo", schema_version: 1, keyer_version: 1,
      review_log: [{ id: corrRow.id, item_key: corrRow.item_key, kind: corrRow.kind, reviewed_at: corrRow.reviewed_at,
        grade: corrRow.grade, source: corrRow.source, channel: corrRow.channel, meta_json: corrRow.meta_json }],
    } });
    eq(echo.status === 200 && echo.json.review_log.dup === 1 && echo.json.review_log.rejected === 0,
      "echo of an EXISTING agent row (cloud-sync up-leg) must be dup, got " + JSON.stringify(echo.json && echo.json.review_log));

    mark("annul happy-path");
    // annul ошибочного грейда: движко-независимый byte-снимок S1 восстанавливается
    const an = await api("POST", "/api/agent/review", { ...sess, body: { annul_of: wrong.json.row_id, reason: "grader-error" } });
    eq(an.status === 200 && an.json.ok && an.json.recorded === true && an.json.row_id === LC.annulId(wrong.json.row_id) && an.json.item_key === KEY_A,
      "annul must record with LemmaCanon.annulId + target's item_key, got " + JSON.stringify(an.json));
    const anRow = await serverRow(sess, an.json.row_id);
    let anMeta = {}; try { anMeta = JSON.parse(anRow.meta_json); } catch (_) {}
    eq(!!anRow && anRow.kind === "annul" && anRow.source === "agent:correction" && anMeta.annul_of === wrong.json.row_id && anMeta.reason === "grader-error",
      "annul row must carry annul_of + mandatory reason, got " + (anRow && anRow.meta_json));
    const sAfterAnnul = await projOf(sess, KEY_A);
    eq(sAfterAnnul === s1, "PROJECTION RESTORE: state after annul must byte-equal the pre-wrong snapshot; want " + s1 + " got " + sAfterAnnul);

    // double-annul: тот же annul_of → replayed, лог неизменен
    const idsBeforeDouble = await logIds(sess);
    const an2 = await api("POST", "/api/agent/review", { ...sess, body: { annul_of: wrong.json.row_id, reason: "grader-error" } });
    eq(an2.status === 200 && an2.json.recorded === true && an2.json.replayed === true && (await logIds(sess)) === idsBeforeDouble,
      "double-annul must replay idempotently, got " + JSON.stringify(an2.json));

    // annul-реджекты
    const rjA = async (body, wantStatus, wantErr) => {
      const r = await api("POST", "/api/agent/review", { ...sess, body });
      eq(r.status === wantStatus && r.json && r.json.error === wantErr,
        wantErr + ": want " + wantStatus + ", got " + r.status + " " + JSON.stringify(r.json));
    };
    await rjA({ annul_of: "no-such-row", reason: "x" }, 404, "ANNUL_TARGET_NOT_FOUND");
    await rjA({ annul_of: "a1", reason: "x" }, 400, "ANNUL_FOREIGN_SOURCE");          // строка Зала — не агентская
    await rjA({ annul_of: "s1", reason: "x" }, 400, "ANNUL_SENT_TARGET");             // sent:-цель
    await rjA({ annul_of: an.json.row_id, reason: "x" }, 400, "ANNUL_TARGET_NOT_ANNULLABLE"); // annul-of-annul
    await rjA({ annul_of: wrong.json.row_id }, 400, "BAD_ANNUL_REASON");              // без reason
    await rjA({ annul_of: wrong.json.row_id, reason: "x", item_key: KEY_A }, 400, "AMBIGUOUS_MODE");

    mark("annul-to-null");
    // annul-to-null: mark-only слово + агентский грейд + annul → проекция УДАЛЕНА
    const cGrade = await api("POST", "/api/agent/review", { ...sess, body: {
      item_key: KEY_C, answer: "ספרבדיקה", channel: "read:agent", attempt_id: "att-c-corr-0001",
    } });
    eq(cGrade.status === 200 && cGrade.json.recorded === true && (await projOf(sess, KEY_C)) !== null,
      "KEY_C agent grade must create a projection");
    const cAnnul = await api("POST", "/api/agent/review", { ...sess, body: { annul_of: cGrade.json.row_id, reason: "grader-error" } });
    eq(cAnnul.status === 200 && cAnnul.json.recorded === true && (await projOf(sess, KEY_C)) === null,
      "annul-to-null must DELETE the server projection (mark-only fold has no memory)");

    // ANNUL_TARGET_TOO_OLD: хирургия reviewed_at −48ч (direct-DB, паттерн mentor-home) + rebuild
    const dGrade = await api("POST", "/api/agent/review", { ...sess, body: {
      item_key: KEY_D, answer: "עולםבדיקה", channel: "read:agent", attempt_id: "att-d-corr-0001",
    } });
    eq(dGrade.status === 200 && dGrade.json.recorded === true, "KEY_D grade failed: " + JSON.stringify(dGrade.json));
    mark("surgery -48h on " + dGrade.json.row_id);
    // resolve сразу после UPDATE; close — fire-and-forget (sqlite3.close на живом
    // втором процессе может не отдать колбэк — не виснем на нём).
    await withTimeout(new Promise((resolve, reject) => {
      const sqlite3 = require(path.join(REPO, "node_modules", "sqlite3"));
      const db = new sqlite3.Database(path.join(scratch, "app.db"), sqlite3.OPEN_READWRITE, (e) => {
        if (e) return reject(e);
        db.run("PRAGMA busy_timeout=5000", () => {
          const oldAt = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
          db.run("UPDATE review_log SET reviewed_at = ? WHERE id = ?", [oldAt, dGrade.json.row_id], (e2) => {
            if (e2) reject(e2); else resolve();
            try { db.close(() => {}); } catch (_) {}
          });
        });
      });
    }), 15000, "sqlite-surgery");
    mark("surgery done → rebuild");
    await api("POST", "/api/learner/projections/rebuild", { ...sess, body: {} });   // консистентность после хирургии
    await rjA({ annul_of: dGrade.json.row_id, reason: "late" }, 400, "ANNUL_TARGET_TOO_OLD");

    mark("oracle");
    // oracle clean + наблюдаемость annul
    const oracle = await api("GET", "/api/learner/oracle", sess);
    eq(oracle.status === 200 && oracle.json.mismatched === 0 && oracle.json.missing === 0,
      "oracle must be clean after the full cycle, got " + JSON.stringify(oracle.json));
    eq(oracle.json.annul_rows === 2, "oracle.annul_rows must be 2 (KEY_A wrong + KEY_C), got " + oracle.json.annul_rows);

    // stdout-гигиена: сентинел-ключ и сентинел-ответ не утекли в логи сервера
    const logsAll = srv.logs.join("");
    eq(!logsAll.includes("שלוםבדיקה") && !logsAll.includes(ANSWER_WRONG),
      "class C/D hygiene: sentinel item_key/answer must NOT appear in server stdout/stderr");

    // ── браузер-нога: down-sync agent-строк в OPFS + «Зал видит» ──────────────
    mark("browser leg: launching chromium");
    try { pw = require("playwright"); } catch (_) { failures.push("no playwright for the browser leg"); }
    if (pw) {
      browser = await withTimeout(pw.chromium.launch(), 90000, "chromium-launch");
      mark("browser leg: chromium up");
      const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
      // acts идемпотентны (login+fullSync+чтение) → ретрай всего акта на свежей странице
      // (wa-sqlite headless OOB-трап, feedback_headless_opfs)
      const act = async (fn, args, tries = 4) => {
        for (let i = 0; i < tries; i++) {
          const pg = await ctx.newPage();
          const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
          await pg.goto(BASE + "/library.html?canon=skip&nocloudauto=1", { waitUntil: "load" });
          const healthy = await pg.evaluate(async () => {
            try {
              const ldb = await import("/db/local-db.js");
              await ldb.initLocalDB(); window.__ldb = ldb;
              const r = await ldb.dbQuery("SELECT 1 AS x"); return !!(r && r[0] && Number(r[0].x) === 1);
            } catch (_) { return false; }
          });
          if (!healthy) { await pg.close().catch(() => {}); await sleep(600); continue; }
          let res = null;
          try { res = await pg.evaluate(fn, args); } catch (e) { res = { __crash: String(e) }; }
          const oob = errs.some((e) => e.includes("memory access out of bounds"));
          await pg.close().catch(() => {});
          if (res && !res.__crash && !oob) return res;
          await sleep(600);
        }
        throw new Error("browser act died in every attempt");
      };
      const bRes = await act(async ({ SECRET, KEY_A, KEY_C, corrId, annulId }) => {
        const ldb = window.__ldb, CS = window.CloudSync, FC = window.FsrsCore;
        const out = {};
        out.login = (await CS.login(SECRET, "device-review")).ok === true;
        const s = await CS.fullSync(ldb);
        out.sync = s.ok === true;
        const rowsA = await ldb.getReviewLog(KEY_A);
        out.hasAgentRow = rowsA.some((w) => w.id === corrId && w.source === "agent:review");
        out.hasAnnulRow = rowsA.some((w) => w.id === annulId && w.kind === "annul");
        const st = FC.replay(rowsA);
        const sched = (await ldb.getSrsSchedule())[KEY_A];
        out.localOracle = !!(st && sched && Math.abs(st.stability - sched.stability) < 1e-7);
        let srv = {}; try { srv = await (await fetch("/api/learner/projections?limit=2000", { credentials: "same-origin" })).json(); } catch (_) {}
        const pA = (srv.rows || []).find((w) => w.item_key === KEY_A);
        out.serverParity = !!(pA && st && Math.abs(Number(pA.stability) - st.stability) < 1e-7);
        // annul-to-null: у KEY_C расписания НЕТ (clearSrsState), ручная ось l2 цела
        out.cSched = (await ldb.getSrsSchedule())[KEY_C] || null;
        const cRow = await ldb.dbQuery("SELECT status, srs_due, srs_scheme FROM word_status WHERE lemma_key = ?", [KEY_C]);
        out.cStatus = cRow && cRow[0] ? cRow[0].status : null;
        out.cSrsDue = cRow && cRow[0] ? cRow[0].srs_due : "missing-row";
        return out;
      }, { SECRET, KEY_A, KEY_C, corrId: corr.json.row_id, annulId: an.json.row_id });
      mark("browser leg: act done");
      eq(bRes.login && bRes.sync, "browser: login/fullSync failed: " + JSON.stringify(bRes));
      eq(bRes.hasAgentRow, "DOWN-SYNC: agent review row must land in the LOCAL OPFS log");
      eq(bRes.hasAnnulRow, "DOWN-SYNC: agent annul row must land in the LOCAL OPFS log");
      eq(bRes.localOracle, "Room must SEE the agent grade: local sched == FC.replay(local log)");
      eq(bRes.serverParity, "local replay must equal the SERVER projection (three-surface parity)");
      eq(bRes.cSched === null && (bRes.cSrsDue == null || bRes.cSrsDue === "missing-row"),
        "annul-to-null must clear the LOCAL schedule (clearSrsState), got " + JSON.stringify({ sched: bRes.cSched, due: bRes.cSrsDue }));
      eq(bRes.cStatus === "l2" || bRes.cSrsDue === "missing-row",
        "manual axis (l2 mark) must survive clearSrsState, got " + JSON.stringify(bRes.cStatus));
      await ctx.close();
    }
  } catch (e) { failures.push("CRASH boot ON: " + ((e && e.stack) || e)); }
  finally {
    if (browser) await browser.close().catch(() => {});
    await stop(srv.c);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }

  const TOTAL = 66;
  if (failures.length) {
    console.error(`smoke:agent-review FAIL (${TOTAL - failures.length}/${TOTAL})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:agent-review OK (${TOTAL}/${TOTAL}) — P7.0c: flag-off = 403 + zero-write · штатный ingest (source='agent:review', провенанс-meta, id==reviewId) · проекция в том же запросе · attempt_id идемпотентен (replayed) · '#'-ключи без датасета · wrong/skip/MNAR (ids-хвост) · ktiv write-gate (ложный lapse не минтится) · production-lock + контракт-реджекты · reserved_source (fake reject / echo dup) · annul: byte-restore проекции + минтер-контракты + 24ч + double-annul replay + annul-to-null удаляет проекцию · oracle clean (annul_rows=2) · stdout-гигиена · браузер-нога: OPFS down-sync + Зал видит (local==replay==server) + clearSrsState при annul-to-null (ручная ось цела)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
