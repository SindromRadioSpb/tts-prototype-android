#!/usr/bin/env node
"use strict";
// smoke:telegram-nudge-skillgap — гейт PAS-D3 reason-aware нуджей (спека PAS_SLICE_D_SPEC v2;
// BLOCKER/MAJOR-фиксы критик wf_659f597a + wf_dd4bc294). НЕЗАВИСИМЫЙ: сид профилей → sweep →
// assert reason в nudge_ledger + текст класс-A → РЕАЛЬНЫЙ бот-/review (не re-call той же fn).
//   SG  flagship (reading-strong + never-dictated + baked asset + base) → SKILL_GAP_AVAILABLE,
//       текст = ОБЩИЙ due-count + «часть можно на слух», БЕЗ HE-форм/dictate-count →
//       затем РЕАЛЬНЫЙ /review → challenge kind=dictate reason=flagship (акцептанс).
//   EX  exposed flagship-сид (критика D3-FLAGSHIP-DEFAULTS: omitted-сеты СЧИТАЮТСЯ) → DUE_READY.
//   ST  struggle flagship-сид (2 провала <24ч) → DUE_READY.
//   DH  dictate-history → DUE_READY. · RW reading-weak (good=1) → DUE_READY.
//   GAP неактивный ≥7д + flagship → RETURN_AFTER_GAP (owner-приоритет RETURN > SKILL_GAP).
//   WIN window-pin (BLOCKER wf_659f597a): flagship lapses=0 за 51 lapses-тяжёлым due (позиция
//       52 > REVIEW_DUE_WINDOW=50) → DUE_READY (нудж не обещает того, что /review не достигнет).
//   DR  state-drift: SKILL_GAP-нудж → 2 провала МЕЖДУ нуджем и /review → /review отдаёт
//       НЕ-flagship (акцептанс «честен на момент нуджа», не вечен).
//   Pure: formatSkillGapNudge N=1/2/21 (префикс-паттерн, критика L2-9 плюрализация).
// Run: node scripts/premium/telegram-nudge-skillgap-smoke.js   (exit 0 = green)

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3336, BASE = "http://127.0.0.1:" + PORT, STUB_PORT = 3337;
const SECRET = "tg-skillgap-smoke-0123456789abcd01";
const WEBHOOK_SECRET = "skillgap-webhook-secret-01234567";
const BOT_TOKEN = "777777:MOCKSG";
const ADMIN = "skillgap-admin-token-0123456789";
const PUBLIC_BASE = "https://audio.test";
const { computeDictateAssetKey } = require(path.join(REPO, "db", "premium", "ttsAssetKey"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
let _n = 0;
const eq = (c, m) => { _n++; if (!c) { failures.push(m); console.log("  ✗ " + m); } else { console.log("  ✓ " + m.slice(0, 78)); } };
const mark = (s) => console.log("[tg-skillgap] " + s);

// Asia/Jerusalem лето: 07:00 UTC = 10:00 local (morning-окно открыто); local_day = 2026-07-10.
const NOW_MORNING = Date.UTC(2026, 6, 10, 7, 0, 0);
const LOCAL_DAY = "2026-07-10";
const PAST = "2026-06-01T08:00:00.000Z";
const ACTIVE_AT = "2026-07-08T05:00:00.000Z";   // <7д до NOW_MORNING → recentlyActive
const ITEM_D = "לכתוב#verb", WRITTEN_D = "לכתוב";   // verified dictate-safe фикстура (selector-smoke)

let scratch, callLogPath, _mid = 8000, _u = 8000;
const nid = () => ++_u;

function startStub() {
  const srv = http.createServer((req, res) => {
    if (req.method === "POST" && /\/bot.+\/send(Message|Audio)$/.test(req.url)) {
      const isAudio = /sendAudio$/.test(req.url);
      let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
        const mid = ++_mid;
        try {
          const j = JSON.parse(body);
          fs.appendFileSync(callLogPath, JSON.stringify({
            method: isAudio ? "audio" : "message", chat: String(j.chat_id),
            text: j.text || j.caption || "", message_id: mid,
          }) + "\n");
        } catch (_) {}
        const result = { message_id: mid };
        if (isAudio) result.audio = { file_id: "FILEID_" + mid };
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, result }));
      });
    } else { res.writeHead(404); res.end("no"); }
  });
  return new Promise((r) => srv.listen(STUB_PORT, "127.0.0.1", () => r(srv)));
}
function startServer() {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: scratch, AUTH_BOOTSTRAP_SECRET: SECRET,
      RESEARCH_ADMIN_TOKEN: ADMIN, TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
      TELEGRAM_API_BASE: "http://127.0.0.1:" + STUB_PORT, TELEGRAM_BOT_USERNAME: "LinguistProMentorBot",
      PUBLIC_BASE_URL: PUBLIC_BASE, AGENT_REVIEW_WRITE: "1" },
      // AGENT_NUDGE_ENABLED НЕ выставлен → sweep только force (как smoke:telegram-nudge)
    stdio: ["ignore", "pipe", "pipe"] });
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
async function sweep(now) {
  const res = await fetch(BASE + "/api/nudge/sweep", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": ADMIN }, body: JSON.stringify({ now, force: true }) });
  return await res.json().catch(() => ({}));
}
async function webhook(fromId, chatId, text, updId) {
  const message = { message_id: updId, from: { id: fromId }, chat: { id: chatId, type: "private" }, text };
  const res = await fetch(BASE + "/api/telegram/webhook", { method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
    body: JSON.stringify({ update_id: updId, message }) });
  return res.status;
}
function calls() { try { return fs.readFileSync(callLogPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch (_) { return []; } }
function msgsToChat(chat) { return calls().filter((c) => c.chat === String(chat)); }
function openDb() { const s = require(path.join(REPO, "node_modules", "sqlite3")); return new s.Database(path.join(scratch, "app.db")); }
function dbRun(db, sql, p) { return new Promise((res, rej) => db.run(sql, p || [], function (e) { (e ? rej(e) : res(this)); })); }
function dbAll(db, sql, p) { return new Promise((res, rej) => db.all(sql, p || [], (e, r) => (e ? rej(e) : res(r || [])))); }
async function withDb(fn) { const db = openDb(); try { return await fn(db); } finally { await new Promise((r) => db.close(() => r())); } }
const ledgerRows = (userId) => withDb((db) => dbAll(db, `SELECT * FROM nudge_ledger WHERE user_id=?`, [userId]));
const assetPath = (key) => path.join(scratch, "audio-cache", key + ".mp3");
function writeAsset(key) { fs.mkdirSync(path.dirname(assetPath(key)), { recursive: true }); fs.writeFileSync(assetPath(key), Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00])); }
const recentIso = () => new Date(Date.now() - 3600 * 1000).toISOString();

// channel_stats из РЕАЛЬНОГО продюсера (как selector-smoke — config-string-match by construction)
const LP = require(path.join(REPO, "db", "learnerProjectionRepo"));
const csRow = (ch, grade, i) => ({ id: "csr" + i, kind: "review", grade, channel: ch, reviewed_at: PAST, meta_json: "{}" });
const CS_READING_STRONG = JSON.stringify(LP.channelStats([csRow("read:mc", 3, 1), csRow("read:mc", 3, 2)]));
const CS_READING_WEAK = JSON.stringify(LP.channelStats([csRow("read:mc", 3, 3)]));

// сид: user + active link + tg-consent + flagship-item (проекция+stats) + K filler-due + вариации
async function setupUser(label, tg, chat, opts) {
  const o = opts || {};
  const userId = "u_" + label;
  await withDb(async (db) => {
    await dbRun(db, `INSERT INTO users (id, role, display_name) VALUES (?, 'owner', ?)`, [userId, "SG" + label]);
    await dbRun(db, `INSERT INTO channel_links (id, user_id, channel, telegram_user_id, telegram_chat_id, status, consent_version, confirmed_at) VALUES (?,?,'telegram',?,?,'active','tg-v1','2026-07-07T00:00:00.000Z')`, ["cl_" + label, userId, String(tg), String(chat)]);
    await dbRun(db, `INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES (?,?,'telegram_delivery',1,'tg-v1')`, ["cr_" + label, userId]);
    if (o.flagshipItem !== false) {
      await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'seed',?,NULL,'seed-sm2',NULL,'{}',1)`, [userId, "seed:" + label, ITEM_D, PAST]);
      await dbRun(db, `INSERT INTO srs_projections (user_id,item_key,due,interval_days,reps,lapses,stability,difficulty,reviewed_at,scheme,engine,channel_stats_json) VALUES (?,?,?,1,1,?,12.0,5.0,?,'fsrs','fsrs6-core-v2',?)`,
        [userId, ITEM_D, PAST, o.flagshipLapses || 0, PAST, o.channelStats || CS_READING_STRONG]);
    }
    const K = o.fillers != null ? o.fillers : 4;
    for (let i = 0; i < K; i++)
      await dbRun(db, `INSERT INTO srs_projections (user_id,item_key,due,interval_days,reps,lapses,stability,difficulty,reviewed_at,scheme,engine) VALUES (?,?,?,1,1,?,12.0,5.0,?,'fsrs','fsrs6-core-v2')`,
        [userId, "w" + label + i + "#noun", PAST, o.fillerLapses || 0, PAST]);
    if (o.dictateHistory)
      await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'review',?,3,'agent:mentor','dictate:tg',?,1)`, [userId, "dh:" + label, ITEM_D, "2026-06-03T08:00:00.000Z", JSON.stringify({ evidence_scope: "cell" })]);
    if (o.struggle)
      for (let i = 0; i < 2; i++)
        await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'review',?,1,'room-recall','read:mc','{}',1)`, [userId, "st:" + label + ":" + i, ITEM_D, recentIso()]);
    if (o.exposed)
      await dbRun(db, `INSERT INTO tg_stimulus_exposure (user_id, item_key, exposure_kind, shown_at) VALUES (?,?,'review_prompt',?)`, [userId, ITEM_D, new Date(NOW_MORNING - 5 * 60 * 1000).toISOString()]);
    // активность (recentlyActive) — по умолчанию активен; active:false → RETURN-путь
    if (o.active !== false)
      await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version,ingested_at) VALUES (?,?,?,'review',?,3,'room-recall','read:mc','{}',1,?)`, [userId, "act:" + label, "act#" + label, ACTIVE_AT, ACTIVE_AT]);
  });
  return { userId, tg, chat };
}

(async () => {
  // ── pure: копия SKILL_GAP (плюрализация префикс-паттерном; класс A) ──────────
  const format = require(path.join(REPO, "agent", "telegram", "format.js"));
  const c1 = format.formatSkillGapNudge(1, "ru"), c2 = format.formatSkillGapNudge(2, "ru"), c21 = format.formatSkillGapNudge(21, "ru");
  eq(c1.includes(": 1 —") && c1.includes("можно проверить на слух") && !c1.includes("часть"), "copy N=1: своя форма без «часть»");
  eq(c2.includes(": 2 —") && c2.includes("часть можно проверить на слух"), "copy N=2: префикс-паттерн + «часть»");
  eq(c21.includes(": 21 —"), "copy N=21: без склонения (префикс-паттерн)");
  eq(format.formatSkillGapNudge(3, "en").includes("Ready to review: 3"), "copy en");

  // ── независимый bake-оракул assetKey (как selector-smoke) ─────────────────────
  const bake = require(path.join(REPO, "scripts", "premium", "bake-dictate-audio.js"));
  const oracle = await bake.assetKeyForItem(ITEM_D);
  if (!oracle || !/^[a-f0-9]{64}$/.test(oracle.assetKey)) { console.error("oracle assetKey failed"); process.exit(1); }

  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-tg-skillgap-"));
  callLogPath = path.join(scratch, "calls.log");
  const stub = await startStub();
  const srv = startServer();
  try {
    if (!(await ready(srv))) { console.error("server failed\n" + srv.logs.join("").slice(-1500)); process.exit(1); }
    writeAsset(oracle.assetKey);

    const SG = await setupUser("SG", 81001, 82001, {});
    const EX = await setupUser("EX", 81002, 82002, { exposed: true });
    const ST = await setupUser("ST", 81003, 82003, { struggle: true });
    const DH = await setupUser("DH", 81004, 82004, { dictateHistory: true });
    const RW = await setupUser("RW", 81005, 82005, { channelStats: CS_READING_WEAK });
    const GAP = await setupUser("GAP", 81006, 82006, { active: false });
    // WIN: flagship (lapses=0) за 51 lapses-тяжёлым filler → позиция 52 в lapses DESC → вне окна 50
    const WIN = await setupUser("WIN", 81007, 82007, { fillers: 51, fillerLapses: 5 });
    const DR = await setupUser("DR", 81008, 82008, {});

    mark("force-sweep @ morning (все профили одним тиком)");
    const sw = await sweep(NOW_MORNING);
    eq(sw.ok === true && sw.sent >= 8, "sweep обработал всех и отправил 8 нуджей, got " + JSON.stringify(sw));

    // ── SG: SKILL_GAP_AVAILABLE + честная копия класса A ─────────────────────────
    const lSG = await ledgerRows(SG.userId);
    eq(lSG.length === 1 && lSG[0].reason === "SKILL_GAP_AVAILABLE", "SG: ledger reason=SKILL_GAP_AVAILABLE, got " + JSON.stringify(lSG.map((x) => x.reason)));
    const mSG = msgsToChat(SG.chat)[0] || { text: "" };
    eq(mSG.text.includes(": 5 —") && mSG.text.includes("часть можно проверить на слух"), "SG: текст = ОБЩИЙ due-count 5 (1 flagship + 4 filler), got «" + mSG.text + "»");
    eq(!mSG.text.includes(WRITTEN_D) && !mSG.text.includes("#verb") && !mSG.text.includes("pid:"), "SG: класс A — без HE-написания/item_key");
    eq(!mSG.text.includes(": 1 —"), "SG: НЕ dictate-count (1), а общий due (класс A: профиль не раскрывается)");

    // ── SG-акцептанс: РЕАЛЬНЫЙ бот-/review → dictate flagship (не re-call fn) ────
    mark("SG: реальный /review после нуджа");
    await webhook(SG.tg, SG.chat, "/review", nid());
    let chSG = null;
    for (let i = 0; i < 60; i++) {
      const rows = await withDb((db) => dbAll(db, `SELECT * FROM agent_challenges WHERE user_id=?`, [SG.userId]));
      chSG = rows[rows.length - 1] || null;
      if (chSG && chSG.telegram_prompt_message_id != null) break;
      await sleep(50);
    }
    eq(chSG && chSG.prompt_kind === "dictate" && chSG.select_reason === "reading_strong_close_dictation_gap",
      "SG: /review создал dictate-challenge reason=flagship (нудж↔selector согласны), got " + JSON.stringify(chSG && { k: chSG.prompt_kind, r: chSG.select_reason }));

    // ── контр-профили: flagship-условия нарушены → честный DUE_READY ────────────
    for (const [P, label, why] of [[EX, "EX", "exposed"], [ST, "ST", "struggle"], [DH, "DH", "dictate-history"], [RW, "RW", "reading-weak"]]) {
      const l = await ledgerRows(P.userId);
      eq(l.length === 1 && l[0].reason === "DUE_READY", label + " (" + why + "): reason=DUE_READY (flagship честно не обещан), got " + JSON.stringify(l.map((x) => x.reason)));
    }

    // ── GAP: приоритет RETURN_AFTER_GAP > SKILL_GAP (owner 2026-07-09) ──────────
    const lGAP = await ledgerRows(GAP.userId);
    eq(lGAP.length === 1 && lGAP[0].reason === "RETURN_AFTER_GAP", "GAP: неактивный ≥7д с flagship-словом → RETURN_AFTER_GAP (мягкий возврат), got " + JSON.stringify(lGAP.map((x) => x.reason)));
    const mGAP = msgsToChat(GAP.chat)[0] || { text: "" };
    eq(!/\d/.test(mGAP.text), "GAP: guilt-free без count");

    // ── WIN: window-pin — flagship на позиции 52 вне окна 50 → DUE_READY ────────
    const lWIN = await ledgerRows(WIN.userId);
    eq(lWIN.length === 1 && lWIN[0].reason === "DUE_READY", "WIN: flagship за окном REVIEW_DUE_WINDOW → DUE_READY (нудж не обещает недостижимое), got " + JSON.stringify(lWIN.map((x) => x.reason)));

    // ── DR: state-drift — SKILL_GAP-нудж, затем 2 провала ДО /review ────────────
    const lDR = await ledgerRows(DR.userId);
    eq(lDR.length === 1 && lDR[0].reason === "SKILL_GAP_AVAILABLE", "DR: нудж был SKILL_GAP (на момент отправки честен)");
    await withDb(async (db) => {
      for (let i = 0; i < 2; i++)
        await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'review',?,1,'room-recall','read:mc','{}',1)`, [DR.userId, "drift:" + i, ITEM_D, recentIso()]);
    });
    await webhook(DR.tg, DR.chat, "/review", nid());
    let chDR = null;
    for (let i = 0; i < 60; i++) {
      const rows = await withDb((db) => dbAll(db, `SELECT * FROM agent_challenges WHERE user_id=?`, [DR.userId]));
      chDR = rows[rows.length - 1] || null;
      if (chDR) break;
      await sleep(50);
    }
    eq(chDR && chDR.select_reason !== "reading_strong_close_dictation_gap",
      "DR: после drift /review отдал НЕ-flagship (акцептанс честен «на момент нуджа», не вечен), got " + JSON.stringify(chDR && chDR.select_reason));
  } finally { await stop(srv.c); stub.close(); }

  if (failures.length) {
    console.error("\nsmoke:telegram-nudge-skillgap FAILED (" + failures.length + "/" + _n + "):");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("\nsmoke:telegram-nudge-skillgap OK (" + _n + "/" + _n + ") — PAS-D3: SKILL_GAP по реальному flagship-пути (окно/сеты по построению) · реальный /review-акцептанс · exposed/struggle/history/weak → DUE_READY · RETURN-приоритет · window-pin 51+ · state-drift · копия N=1/2/21 класс A");
  process.exit(0);
})().catch((e) => { console.error("smoke:telegram-nudge-skillgap crashed:", e && e.message); process.exit(1); });
