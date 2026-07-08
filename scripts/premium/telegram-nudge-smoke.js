#!/usr/bin/env node
"use strict";
// smoke:telegram-nudge — гейт CLG-P7.3a proactive Telegram-нудж. НЕЗАВИСИМЫЙ: конструирует состояние
// (K due by construction) → assert поведение sweep == политике. Покрывает критику wf_f60b0e58 (3
// BLOCKER + MAJOR): claim-before-send/dedup (2 sweep → 1 send) · кросс-канальный бюджет (push claim
// блокирует Telegram) · quiet-hours через полночь + окно · honest count == K · класс-A (нудж без
// слов/форм/id) · flag-off · enabled/telegram_enabled/consent-гейты · GDPR delete чистит ОБЕ таблицы
// · /stop//resume · revoke чистит ledger · fail-closed. Sweep триггерится /api/nudge/sweep (admin,
// injectable now+force). Флаг AGENT_NUDGE_ENABLED НЕ выставлен → тестируем и flag-off, и force-путь.

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3334, BASE = "http://127.0.0.1:" + PORT, STUB_PORT = 3335;
const SECRET = "tg-nudge-smoke-0123456789abcdef01";
const WEBHOOK_SECRET = "nudge-webhook-secret-0123456789a";
const BOT_TOKEN = "666666:MOCKNUDGE";
const ADMIN = "nudge-admin-token-0123456789";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
let _n = 0;
const eq = (c, m) => { _n++; if (!c) { failures.push(m); console.log("  ✗ " + m); } else { console.log("  ✓ " + m.slice(0, 76)); } };
const mark = (s) => console.log("[tg-nudge] " + s);

// Asia/Jerusalem лето (IDT, UTC+3): 07:00 UTC = 10:00 local (окно morning открыто); 00:00 UTC = 03:00
// local (quiet 22–8); 05:00 UTC = 08:00 local (до окна 9). local_day = 2026-07-10.
const NOW_MORNING = Date.UTC(2026, 6, 10, 7, 0, 0);
const NOW_NIGHT = Date.UTC(2026, 6, 10, 0, 0, 0);
const NOW_EARLY = Date.UTC(2026, 6, 10, 5, 0, 0);
const LOCAL_DAY = "2026-07-10";
const HEB = "שלום";   // сентинел: ивритское слово НЕ должно попасть в нудж (класс A)

let scratch, callLogPath, _mid = 6000;
const FAIL_CHAT = "62009";   // sendMessage к этому чату → стаб отдаёт 500 (тест send-fail at-most-once)
function startStub() {
  const srv = http.createServer((req, res) => {
    if (req.method === "POST" && /\/bot.+\/sendMessage$/.test(req.url)) {
      let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
        let j = null; try { j = JSON.parse(body); } catch (_) {}
        if (j && String(j.chat_id) === FAIL_CHAT) { res.writeHead(500); res.end("fail"); return; }   // send-fail
        const mid = ++_mid;
        try { fs.appendFileSync(callLogPath, JSON.stringify({ chat: String(j.chat_id), text: j.text || "", message_id: mid }) + "\n"); } catch (_) {}
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, result: { message_id: mid } }));
      });
    } else { res.writeHead(404); res.end("no"); }
  });
  return new Promise((r) => srv.listen(STUB_PORT, "127.0.0.1", () => r(srv)));
}
function startServer() {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: scratch, AUTH_BOOTSTRAP_SECRET: SECRET, RESEARCH_ADMIN_TOKEN: ADMIN,
      TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
      TELEGRAM_API_BASE: "http://127.0.0.1:" + STUB_PORT, TELEGRAM_BOT_USERNAME: "LinguistProMentorBot" },
      // ⚠ AGENT_NUDGE_ENABLED НЕ выставлен → sweep без force = disabled_flag
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
async function login(label) {
  const res = await fetch(BASE + "/api/auth/bootstrap-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: SECRET, deviceLabel: label }) });
  const j = await res.json(); const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")];
  return { userId: j.user.id, cookie: String((sc || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: j.csrf }; }
async function sweep(now, force) {
  const res = await fetch(BASE + "/api/nudge/sweep", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": ADMIN }, body: JSON.stringify({ now, force: !!force }) });
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

const PAST = "2026-06-01T08:00:00.000Z";
const ACTIVE_AT = "2026-07-08T05:00:00.000Z";   // Jul8 08:00 IDT — недавняя активность (recentlyActive → DUE_READY count)
let _u = 6000; const nid = () => ++_u;

// direct-insert: user + active telegram link + consent(tg-v1) + K due-проекций + опц. prefs-строка.
async function setupUser(label, tg, chat, opts) {
  const o = opts || {};
  const userId = "u_" + label;
  await withDb(async (db) => {
    await dbRun(db, `INSERT INTO users (id, role, display_name) VALUES (?, 'owner', ?)`, [userId, "Nud" + label]);
    await dbRun(db, `INSERT INTO channel_links (id, user_id, channel, telegram_user_id, telegram_chat_id, status, consent_version, confirmed_at) VALUES (?,?,'telegram',?,?,'active','tg-v1','2026-07-07T00:00:00.000Z')`, ["cl_" + label, userId, String(tg), String(chat)]);
    // consent tg-v1 granted (или revoked при o.noConsent)
    await dbRun(db, `INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES (?,?,'telegram_delivery',?,'tg-v1')`, ["cr_" + label, userId, o.noConsent ? 0 : 1]);
    // K due-проекций (getDue вернёт K by construction → honest count)
    const K = o.due != null ? o.due : 0;
    for (let i = 0; i < K; i++)
      await dbRun(db, `INSERT INTO srs_projections (user_id,item_key,due,interval_days,reps,lapses,stability,difficulty,reviewed_at,scheme,engine) VALUES (?,?,?,1,1,0,12.0,5.0,?,'fsrs','fsrs6-core-v2')`, [userId, "w" + label + i + "#noun", PAST, PAST]);
    // опциональная prefs-строка (enabled/telegram_enabled off)
    if (o.prefs) await dbRun(db, `INSERT INTO notification_preferences (user_id, enabled, telegram_enabled, timezone) VALUES (?,?,?, 'Asia/Jerusalem')`,
      [userId, o.prefs.enabled != null ? o.prefs.enabled : 1, o.prefs.telegram_enabled != null ? o.prefs.telegram_enabled : 1]);
    // опциональный предзанятый push-claim (кросс-канал: push уже занял local_day)
    if (o.pushClaimed) await dbRun(db, `INSERT INTO nudge_ledger (user_id, local_day, channel, reason) VALUES (?,?, 'push','DUE_READY')`, [userId, LOCAL_DAY]);
    // P7.3c: недавняя активность (recentlyActive → DUE_READY count; active:false → нет → RETURN_AFTER_GAP)
    if (o.active !== false)
      await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version,ingested_at) VALUES (?,?,?,'review',?,3,'room-recall','read:mc','{}',1,?)`, [userId, "act:" + label, "act#" + label, ACTIVE_AT, ACTIVE_AT]);
    // reading-only активность (learner_events) — тест cross-surface engagement (без review_log)
    if (o.readingAt)
      await dbRun(db, `INSERT INTO learner_events (user_id,id,type,payload_json,created_at_client,schema_version,ingested_at) VALUES (?,?,'sentence_read','{}',?,1,?)`, [userId, "ev:" + label, o.readingAt, o.readingAt]);
    // backoff-состояние
    if (o.state)
      await dbRun(db, `INSERT OR REPLACE INTO nudge_state (user_id, consecutive_ignored, last_nudge_at, last_engaged_at) VALUES (?,?,?,?)`, [userId, o.state.consecutive_ignored || 0, o.state.last_nudge_at || null, o.state.last_engaged_at || null]);
  });
  return { userId, tg, chat };
}
const stateRow = (userId) => withDb((db) => dbAll(db, `SELECT * FROM nudge_state WHERE user_id=?`, [userId]));
const ledgerRows = (userId) => withDb((db) => dbAll(db, `SELECT * FROM nudge_ledger WHERE user_id=?`, [userId]));
const prefsRow = (userId) => withDb((db) => dbAll(db, `SELECT * FROM notification_preferences WHERE user_id=?`, [userId]));

(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-tg-nudge-"));
  callLogPath = path.join(scratch, "calls.log");
  const stub = await startStub();
  const srv = startServer();
  try {
    if (!(await ready(srv))) { console.error("server failed\n" + srv.logs.join("").slice(-1500)); process.exit(1); }

    const HAPPY = await setupUser("HAPPY", 61001, 62001, { due: 3 });                       // eligible → нудж
    const DUE0 = await setupUser("DUE0", 61002, 62002, { due: 0 });                          // нет due
    const DIS = await setupUser("DIS", 61003, 62003, { due: 3, prefs: { enabled: 0 } });     // глобальный opt-out
    const TGOFF = await setupUser("TGOFF", 61004, 62004, { due: 3, prefs: { telegram_enabled: 0 } }); // /stop-состояние
    const NOCONS = await setupUser("NOCONS", 61005, 62005, { due: 3, noConsent: true });      // consent revoked
    const PUSHED = await setupUser("PUSHED", 61006, 62006, { due: 3, pushClaimed: true });    // push занял день
    const FAILU = await setupUser("FAILU", 61009, 62009, { due: 3 });                          // send даёт 500 (at-most-once)

    // ── 0) DST-корректность (persistent gate, не только unit): лето IDT(+3) ≠ зима IST(+2) ──
    mark("DST: Asia/Jerusalem лето 09:30 ≠ зима 08:30 (Intl, не фикс-offset)");
    const LT = require(path.join(REPO, "db", "localtime"));
    eq(LT.localParts("Asia/Jerusalem", Date.UTC(2026, 6, 1, 6, 30)).hour === 9, "лето (июль) 06:30 UTC → 09:30 IDT");
    eq(LT.localParts("Asia/Jerusalem", Date.UTC(2026, 0, 1, 6, 30)).hour === 8, "зима (январь) 06:30 UTC → 08:30 IST (DST-сдвиг пойман)");
    eq(!LT.windowOpen(21, "morning", 22, 8), "morning-окно [9,12) — 21:00 закрыто (нет позднего «утреннего» нуджа)");

    // ── 1) flag OFF (без force) → весь sweep disabled_flag, ноль сообщений ──
    mark("flag OFF → disabled_flag (нет отправки)");
    const off = await sweep(NOW_MORNING, false);
    eq(off && off.skipped === "disabled_flag", "sweep без force при AGENT_NUDGE_ENABLED unset → skipped:disabled_flag");
    eq(calls().length === 0, "flag-off: ноль сообщений");

    // ── 2) quiet-hours через полночь (03:00 local, quiet 22–8) → все outside_window ──
    mark("quiet-hours (03:00, wrap 22–8) → outside_window");
    const night = await sweep(NOW_NIGHT, true);
    eq(night && night.ok && night.sent === 0 && night.outside_window >= 1, "03:00 (quiet) force-sweep → 0 sent (quiet-hours через полночь)");
    eq(calls().length === 0, "quiet: ноль сообщений");

    // ── 3) до окна (08:00 < morning-start 9) → outside_window ──
    mark("before window (08:00 < 09:00) → outside_window");
    const early = await sweep(NOW_EARLY, true);
    eq(early && early.sent === 0 && early.outside_window >= 1, "08:00 (до окна) → 0 sent");
    eq(calls().length === 0, "before-window: ноль сообщений");

    // ── 3b) ПОСЛЕ окна (13:00 > morning-upper 12) → outside_window (bounded window, не late-evening) ──
    mark("after window (13:00 > 12:00 upper) → outside_window");
    const late = await sweep(Date.UTC(2026, 6, 10, 10, 0, 0), true);   // 13:00 IDT
    eq(late && late.sent === 0 && late.outside_window >= 1, "13:00 (после окна [9,12)) → 0 sent (верхняя граница окна)");
    eq(calls().length === 0, "after-window: ноль сообщений");

    // ── 4) FUNCTIONAL sweep (10:00 local, окно открыто): только HAPPY eligible ──
    mark("morning window → только HAPPY нуджнут (honest count K=3, класс A)");
    const s1 = await sweep(NOW_MORNING, true);
    eq(s1 && s1.ok && s1.sent === 1, "ровно 1 нудж УСПЕШНО отправлен (только HAPPY): sent=" + (s1 && s1.sent));
    eq(s1.nothing_due >= 1 && s1.disabled >= 2 && s1.no_consent >= 1 && s1.budget >= 1 && s1.errors >= 1,
      "агрегаты: nothing_due(DUE0) · disabled(DIS+TGOFF) · no_consent(NOCONS) · budget(PUSHED) · errors(FAILU send-fail)");
    // send-fail at-most-once: FAILU send упал (500) → 0 сообщений, НО claim записан (claim-before-send) →
    // повтор НЕ пере-шлёт (потерянный нудж честнее дубля). day занят — auth2 прошёл, claim остаётся.
    eq(msgsToChat(FAILU.chat).length === 0 && (await ledgerRows(FAILU.userId)).length === 1,
      "send-fail: FAILU 0 сообщений + claim записан (at-most-once, не retry-дубль)");
    const hm = msgsToChat(HAPPY.chat);
    eq(hm.length === 1, "HAPPY получил РОВНО одно сообщение");
    eq(hm.length && hm[0].text.includes("3"), "honest count == K=3 (сконструировано by construction)");
    eq(hm.length && !hm[0].text.includes(HEB) && !hm[0].text.includes("#noun") && !hm[0].text.includes("wHAPPY"),
      "класс A: нудж БЕЗ ивритских слов/форм/item_key");
    for (const u of [DUE0, DIS, TGOFF, NOCONS, PUSHED])
      eq(msgsToChat(u.chat).length === 0, "не-eligible (" + JSON.stringify(u.chat) + ") НЕ получил нудж");
    // ledger: HAPPY занял день (telegram, DUE_READY); PUSHED остался push
    const hl = await ledgerRows(HAPPY.userId);
    eq(hl.length === 1 && hl[0].local_day === LOCAL_DAY && hl[0].channel === "telegram" && hl[0].reason === "DUE_READY",
      "HAPPY ledger: (local_day, channel=telegram, reason=DUE_READY) — детерминированный reason");

    // ── 5) claim-before-send dedup: повторный sweep того же дня → HAPPY budget, без 2-го сообщения ──
    mark("2-й sweep того же local_day → HAPPY budget (claim-before-send, at-most-once)");
    const s2 = await sweep(NOW_MORNING, true);
    eq(s2 && s2.sent === 0 && s2.budget >= 1, "повторный sweep → 0 sent (день занят): budget=" + (s2 && s2.budget));
    eq(msgsToChat(HAPPY.chat).length === 1, "HAPPY всё ещё РОВНО одно сообщение (2 sweep → 1 send)");

    // ── 6) кросс-канал: PUSHED (push уже занял день) → Telegram НЕ шлёт (единый бюджет) ──
    mark("cross-channel: push-claimed → Telegram budget skip");
    eq(msgsToChat(PUSHED.chat).length === 0, "PUSHED (push занял local_day) → Telegram НЕ нуджил (единый кросс-канальный бюджет)");

    // ── 7) /stop → telegram_enabled=0 + подтверждение; последующий sweep → HAPPY... нет, новый юзер STOPU ──
    mark("/stop → telegram_enabled=0 + подтверждение; sweep → disabled");
    const STOPU = await setupUser("STOPU", 61007, 62007, { due: 3 });
    const cBefore = calls().length;
    await webhook(STOPU.tg, STOPU.chat, "/stop", nid());
    for (let i = 0; i < 40 && calls().length === cBefore; i++) await sleep(50);
    const stopMsg = msgsToChat(STOPU.chat);
    eq(stopMsg.length === 1 && /отключен/i.test(stopMsg[0].text), "/stop → подтверждение «…отключены»");
    const pr = await prefsRow(STOPU.userId);
    eq(pr.length === 1 && Number(pr[0].telegram_enabled) === 0, "/stop записал telegram_enabled=0 (durable opt-out)");
    const s3 = await sweep(NOW_MORNING, true);
    eq(msgsToChat(STOPU.chat).length === 1, "после /stop sweep НЕ нуджит STOPU (только подтверждение осталось)");
    // /resume → telegram_enabled=1
    await webhook(STOPU.tg, STOPU.chat, "/resume", nid());
    for (let i = 0; i < 40; i++) { const p = await prefsRow(STOPU.userId); if (p[0] && Number(p[0].telegram_enabled) === 1) break; await sleep(50); }
    eq((await prefsRow(STOPU.userId))[0].telegram_enabled === 1, "/resume вернул telegram_enabled=1");

    // ── 8) revoke (/unlink) чистит nudge_ledger (backoff не переживает re-pair) ──
    mark("/unlink чистит nudge_ledger");
    const REVU = await setupUser("REVU", 61008, 62008, { due: 3, pushClaimed: true });   // есть ledger-строка
    eq((await ledgerRows(REVU.userId)).length === 1, "REVU: ledger-строка есть до unlink");
    await webhook(REVU.tg, REVU.chat, "/unlink", nid());
    for (let i = 0; i < 40 && (await ledgerRows(REVU.userId)).length > 0; i++) await sleep(50);
    eq((await ledgerRows(REVU.userId)).length === 0, "/unlink → nudge_ledger юзера очищен (re-pair начнётся чисто)");

    // ── 9) GDPR: delete чистит ОБЕ таблицы (structural user_id-sweep) ──
    mark("GDPR delete → notification_preferences + nudge_ledger == 0 строк");
    const G = await login("gdpr");
    await withDb(async (db) => {
      await dbRun(db, `INSERT OR IGNORE INTO notification_preferences (user_id, timezone) VALUES (?, 'Asia/Jerusalem')`, [G.userId]);
      await dbRun(db, `INSERT OR IGNORE INTO nudge_ledger (user_id, local_day, channel, reason) VALUES (?,'2030-06-15','telegram','DUE_READY')`, [G.userId]);
      await dbRun(db, `INSERT OR REPLACE INTO nudge_state (user_id, consecutive_ignored) VALUES (?, 3)`, [G.userId]);
    });
    eq((await prefsRow(G.userId)).length >= 1 && (await ledgerRows(G.userId)).length >= 1 && (await stateRow(G.userId)).length >= 1, "GDPR: seeded prefs+ledger+nudge_state для delete-теста");
    const del = await fetch(BASE + "/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json", "Cookie": G.cookie, "X-LP-CSRF": G.csrf }, body: JSON.stringify({ confirm: "DELETE" }) });
    const delJson = await del.json().catch(() => ({}));
    eq(del.status === 200 && delJson.ok, "account delete 200");
    eq((delJson.tablesPurged || []).includes("notification_preferences") && (delJson.tablesPurged || []).includes("nudge_ledger") && (delJson.tablesPurged || []).includes("nudge_state"),
      "delete покрыл ВСЕ новые таблицы prefs+ledger+nudge_state (structural user_id-sweep, не ручной список)");
    eq((await prefsRow(G.userId)).length === 0 && (await ledgerRows(G.userId)).length === 0 && (await stateRow(G.userId)).length === 0, "после delete: 0 строк во ВСЕХ трёх таблицах (GDPR-полнота)");

    // ═══ P7.3c: backoff · engagement(cross-surface) · RETURN_AFTER_GAP · /notoday · /mute · /resume ═══
    mark("P7.3c backoff/engagement: skip · reset(review_log) · reset(learner_events reading) · RETURN_AFTER_GAP");
    const BOFF = await setupUser("BOFF", 61010, 62010, { due: 3, state: { consecutive_ignored: 1, last_nudge_at: "2026-07-09T07:00:00.000Z" } });   // Jul9 = 1 local-день до now(Jul10) < delay 2
    const ENG = await setupUser("ENG", 61011, 62011, { due: 3, state: { consecutive_ignored: 2, last_nudge_at: "2026-07-07T07:00:00.000Z" } });   // active-seed Jul8 > Jul7 → engaged
    const ENGE = await setupUser("ENGE", 61012, 62012, { due: 3, active: false, readingAt: ACTIVE_AT, state: { consecutive_ignored: 2, last_nudge_at: "2026-07-07T07:00:00.000Z" } });  // ТОЛЬКО learner_events
    const RETU = await setupUser("RETU", 61013, 62013, { due: 3, active: false });   // нет активности → RETURN_AFTER_GAP
    const INCR = await setupUser("INCR", 61017, 62017, { due: 3, state: { consecutive_ignored: 1, last_nudge_at: "2026-07-08T07:00:00.000Z" } });   // 2 local-дня = delay 2 → eligible → send + count→2
    const INCR2 = await setupUser("INCR2", 61018, 62018, { due: 3, state: { consecutive_ignored: 2, last_nudge_at: "2026-07-08T07:00:00.000Z" } });  // count=2, delay 4, прошло 2 → skip
    const sP = await sweep(NOW_MORNING, true);
    eq(msgsToChat(BOFF.chat).length === 0 && sP.backoff >= 1, "BOFF: count=1, прошёл 1 local-день < delay 2 → backoff skip (нет нуджа)");
    eq((await stateRow(BOFF.userId))[0].consecutive_ignored === 1, "BOFF: count НЕ тронут (skip, не reset, не рост)");
    eq(msgsToChat(ENG.chat).length === 1, "ENG: engaged (review_log ingested после нуджа) → backoff reset → нуджнут");
    eq((await stateRow(ENG.userId))[0].consecutive_ignored === 0, "ENG: consecutive_ignored сброшен в 0 (engaged)");
    eq(msgsToChat(ENGE.chat).length === 1, "ENGE: engaged ТОЛЬКО learner_events (reading-only Зал) → reset → нуджнут (cross-surface fix)");
    const rMsg = msgsToChat(RETU.chat);
    eq(rMsg.length === 1 && rMsg[0].text.includes("Когда будет удобно") && !/\d/.test(rMsg[0].text), "RETU: нет активности ≥7д → RETURN_AFTER_GAP (guilt-free, БЕЗ count/цифр)");
    // ЛАДДЕР РАСТЁТ (increment-on-send) — критика: путь не покрывался, регрессия прошла бы 51/51
    eq(msgsToChat(INCR.chat).length === 1 && (await stateRow(INCR.userId))[0].consecutive_ignored === 2, "INCR: ignored, delay 2 прошёл → send + consecutive_ignored ВЫРОС 1→2 (лестница растёт, не застревает)");
    eq(msgsToChat(INCR2.chat).length === 0 && (await stateRow(INCR2.userId))[0].consecutive_ignored === 2, "INCR2: count=2 → delay 4, прошло 2 дня → backoff skip (count 2 не тронут)");

    // ── muted-skip (прямой seed muted_until в будущее — независимо от real-vs-injected времени) ──
    mark("P7.3c muted → sweep skip");
    const MUTED = await setupUser("MUTED", 61016, 62016, { due: 3 });
    await withDb((db) => dbRun(db, `INSERT INTO notification_preferences (user_id, muted_until) VALUES (?, '2027-01-01T00:00:00.000Z') ON CONFLICT(user_id) DO UPDATE SET muted_until='2027-01-01T00:00:00.000Z'`, [MUTED.userId]));
    const sM = await sweep(NOW_MORNING, true);
    eq(sM.muted >= 1 && msgsToChat(MUTED.chat).length === 0, "muted_until в будущем → sweep skip:muted (нет нуджа)");

    // ── /notoday: prefs muted_until + backoff НЕ растёт (nudge_state не тронут; явный «не сегодня» ≠ игнор) ──
    mark("P7.3c /notoday: muted_until + backoff не растёт");
    const NT = await setupUser("NT", 61014, 62014, { due: 3, state: { consecutive_ignored: 2, last_nudge_at: "2026-07-08T07:00:00.000Z" } });
    let cb = calls().length; await webhook(NT.tg, NT.chat, "/notoday", nid());
    for (let i = 0; i < 40 && calls().length === cb; i++) await sleep(50);
    eq(msgsToChat(NT.chat).length === 1 && /сегодня/i.test(msgsToChat(NT.chat)[0].text), "/notoday → подтверждение «…сегодня…»");
    eq((await prefsRow(NT.userId))[0].muted_until != null, "/notoday записал muted_until (в prefs, НЕ ledger — single-writer цел)");
    eq((await stateRow(NT.userId))[0].consecutive_ignored === 2, "/notoday НЕ вырастил backoff (2→2, не наказание за честность)");

    // ── /mute: bad-arg fail-closed reply; N → muted_until; /resume → снят → снова нуджит ──
    mark("P7.3c /mute (bad/ok) + /resume clears mute");
    const MU = await setupUser("MU", 61015, 62015, { due: 3 });
    cb = calls().length; await webhook(MU.tg, MU.chat, "/mute 99", nid());
    for (let i = 0; i < 40 && calls().length === cb; i++) await sleep(50);
    eq(/Формат/i.test(msgsToChat(MU.chat).slice(-1)[0].text) && (await prefsRow(MU.userId)).every((r) => r.muted_until == null), "/mute 99 (вне 1..30) → reply «Формат…» + НЕ записал mute (fail-closed)");
    cb = calls().length; await webhook(MU.tg, MU.chat, "/mute 5", nid());
    for (let i = 0; i < 40 && calls().length === cb; i++) await sleep(50);
    eq(/5 дн/.test(msgsToChat(MU.chat).slice(-1)[0].text) && (await prefsRow(MU.userId))[0].muted_until != null, "/mute 5 → «…на 5 дн…» + muted_until записан");
    cb = calls().length; await webhook(MU.tg, MU.chat, "/resume", nid());
    for (let i = 0; i < 40 && calls().length === cb; i++) await sleep(50);
    eq((await prefsRow(MU.userId))[0].muted_until == null, "/resume снял mute (muted_until NULL)");
    await sweep(NOW_MORNING, true);
    eq(/Готово к повторению/.test(msgsToChat(MU.chat).slice(-1)[0].text), "/resume → sweep снова нуджит (DUE_READY, active)");

    // ── mute НЕЙТРАЛЕН к backoff (критика MAJOR: last_interaction_at сбрасывал → ЧАЩЕ после mute) ──
    mark("P7.3c mute нейтрален: /mute+/resume НЕ сбрасывает backoff");
    const MC = await setupUser("MC", 61019, 62019, { due: 3, state: { consecutive_ignored: 2, last_nudge_at: "2026-07-08T07:00:00.000Z" } });
    cb = calls().length; await webhook(MC.tg, MC.chat, "/mute 3", nid());
    for (let i = 0; i < 40 && calls().length === cb; i++) await sleep(50);
    cb = calls().length; await webhook(MC.tg, MC.chat, "/resume", nid());
    for (let i = 0; i < 40 && calls().length === cb; i++) await sleep(50);
    eq((await stateRow(MC.userId))[0].consecutive_ignored === 2, "/mute+/resume НЕ трогают backoff (count 2→2; mute нейтрален — не сокращает cadence)");

    // ── 10) stdout-гигиена ──
    eq(!srv.logs.join("").includes(HEB), "ивритский сентинел НЕ в server stdout");
  } catch (e) { failures.push("CRASH: " + ((e && e.stack) || e)); console.log(e && e.stack); }
  finally { await stop(srv.c); stub.close(); try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {} }

  const TOTAL = _n;
  if (failures.length) {
    console.error(`\nsmoke:telegram-nudge FAIL (${TOTAL - failures.length}/${TOTAL})`);
    process.exitCode = 1;
  } else {
    console.log(`\nsmoke:telegram-nudge OK (${TOTAL}/${TOTAL}) — P7.3a/c proactive: flag-off · quiet-wrap+окно(bounded) · honest count==K · класс A · enabled/telegram_enabled/consent/nothing_due · claim-before-send dedup(2→1) · кросс-канал бюджет · /stop//resume · /unlink чистит ledger · GDPR обе таблицы · send-fail at-most-once · DST лето≠зима · P7.3c: backoff-skip(лестница) · engaged→reset(review_log И learner_events reading, cross-surface) · RETURN_AFTER_GAP guilt-free без count · muted→skip · /notoday(prefs, backoff не растёт) · /mute(fail-closed bad + N) · /resume clears mute`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
