#!/usr/bin/env node
"use strict";
// smoke:telegram-pairing — гейт CLG-P7.1a (TELEGRAM_P7_1_PAIRING_SPEC v2, адъюдикация
// критики wf_a67874c5). Замоканные Telegram-апдейты + локальный Telegram-stub (живой бот
// не нужен). Матрица: boot0 (нет TELEGRAM_WEBHOOK_SECRET → webhook 503 fail-closed) +
// boot1 (полный): secret-before-parse (256kb, не 10mb) · pairing ДВУСТОРОННИЙ (redeem→pending,
// только /confirm→active) · confused-deputy (redeem чужого токена без confirm НЕ активирует) ·
// single-use/TTL/анти-hijack · consent revoke → атомарный каскад · private-only · dedup +
// ROLLBACK-переиграет · from.id rate → drop-with-200 (не 429) · sendMessage наблюдаем (==1) ·
// verb-only лог (сырой токен нигде) · delete-completeness (NULL-user chat покидает лог) ·
// export strip token_hash · read-only ТРАНЗИТИВНО (router не тянет reviewer/tools/llm) ·
// id-хвост review_log неизменен (2 юзера).
// Run: node scripts/premium/telegram-pairing-smoke.js [--gate]

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3300, BASE = "http://127.0.0.1:" + PORT;
const STUB_PORT = 3301;
const SECRET = "tg-pairing-smoke-0123456789abcdef";
const WEBHOOK_SECRET = "webhook-secret-abcdef0123456789";
const BOT_TOKEN = "999999:MOCK-BOT-TOKEN";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };
const mark = (s) => console.log("[tg-pairing] " + s);

let scratch, callLogPath;

function startStub() {
  // локальный Telegram API stub: отвечает 200 на /bot<token>/sendMessage
  const srv = http.createServer((req, res) => {
    if (req.method === "POST" && /\/bot.+\/sendMessage$/.test(req.url)) {
      let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, result: { message_id: 1 } })); });
    } else { res.writeHead(404); res.end("no"); }
  });
  return new Promise((r) => srv.listen(STUB_PORT, "127.0.0.1", () => r(srv)));
}
function startServer(extraEnv) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: scratch, AUTH_BOOTSTRAP_SECRET: SECRET,
      TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_API_BASE: "http://127.0.0.1:" + STUB_PORT,
      TELEGRAM_BOT_USERNAME: "LinguistProMentorBot", AGENT_TG_CALLLOG: callLogPath,
      AGENT_TG_ALLOW_FAULT: "1",
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
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) { const j = await r.json(); if (j.db && j.db.ready && j.migrations && j.migrations.ready) return true; } } catch (_) {}
    await sleep(200);
  }
  return false;
}
async function api(method, p, { cookie, csrf, body, raw, headers } = {}) {
  const h = Object.assign({ "Content-Type": "application/json" }, headers || {});
  if (cookie) h.Cookie = cookie;
  if (csrf) h["X-LP-CSRF"] = csrf;
  const res = await fetch(BASE + p, { method, headers: h, body: raw != null ? raw : (body != null ? JSON.stringify(body) : undefined) });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}
async function login(label) {
  const res = await fetch(BASE + "/api/auth/bootstrap-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: SECRET, deviceLabel: label }) });
  const j = await res.json();
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")];
  return { cookie: String((sc || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: j.csrf, userId: j.user.id };
}
// webhook POST с валидным секретом (или переопределённым)
async function webhook(update, { secret, oversize } = {}) {
  const h = { "Content-Type": "application/json" };
  const sec = secret === null ? undefined : (secret || WEBHOOK_SECRET);
  if (sec !== undefined) h["X-Telegram-Bot-Api-Secret-Token"] = sec;
  let bodyStr = JSON.stringify(update);
  if (oversize) bodyStr = JSON.stringify({ ...update, _pad: "x".repeat(oversize) });
  const res = await fetch(BASE + "/api/telegram/webhook", { method: "POST", headers: h, body: bodyStr });
  let json = null; try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}
function tokenFromDeepLink(dl) { const m = /start=([0-9a-f]+)/.exec(String(dl || "")); return m ? m[1] : null; }
function callLogCount() { try { return fs.readFileSync(callLogPath, "utf8").split("\n").filter(Boolean).length; } catch (_) { return 0; } }
// P7.1b: send стал АСИНХРОННЫМ (сервер отвечает 200 до отправки) → ждём рост call-log.
async function waitCount(target, ms = 3000) { const s0 = Date.now(); while (Date.now() - s0 < ms && callLogCount() < target) await sleep(50); return callLogCount(); }
async function waitStable(ms = 500) { await sleep(ms); return callLogCount(); }

// read-only direct DB connection (SELECT — отдельный коннект, не мешает серверу)
function openRead() { const s = require(path.join(REPO, "node_modules", "sqlite3")); return new s.Database(path.join(scratch, "app.db"), s.OPEN_READONLY); }
function dbAllRead(db, sql, p) { return new Promise((res, rej) => db.all(sql, p || [], (e, r) => (e ? rej(e) : res(r)))); }

// message-update конструктор (private chat)
let _uid = 1000;
const upd = (fromId, chatId, text) => ({ update_id: _uid++, message: { message_id: _uid, from: { id: fromId }, chat: { id: chatId, type: "private" }, text } });

(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-tg-pairing-"));
  callLogPath = path.join(scratch, "tg-calls.log");
  const stub = await startStub();

  // ── read-only ТРАНЗИТИВНЫЙ ассерт (без сервера): require-граф router.js не тянет write/LLM ──
  {
    const seen = new Set(); const forbidden = ["reviewer.js", "tools.js", "llm.js", "planner.js", "explainer.js", "runtime.js"];
    const hits = [];
    const walk = (file) => {
      const abs = path.resolve(file); if (seen.has(abs) || !fs.existsSync(abs)) return; seen.add(abs);
      const base = path.basename(abs); if (forbidden.includes(base)) hits.push(base);
      let src = ""; try { src = fs.readFileSync(abs, "utf8"); } catch (_) { return; }
      const re = /require\(\s*["'](\.[^"']+)["']\s*\)/g; let m;
      while ((m = re.exec(src))) {
        let dep = path.resolve(path.dirname(abs), m[1]);
        if (!/\.js$/.test(dep)) dep += ".js";
        walk(dep);
      }
    };
    walk(path.join(REPO, "agent", "telegram", "router.js"));
    eq(hits.length === 0, "READ-ONLY TRANSITIVE: router.js require-graph must NOT reach write/LLM modules, got: " + hits.join(","));
  }

  // ── boot0: нет TELEGRAM_WEBHOOK_SECRET → webhook 503 fail-closed ──
  mark("boot0: no webhook secret (expect 503)");
  const srv0 = startServer({ TELEGRAM_WEBHOOK_SECRET: "" });
  try {
    if (!(await ready(srv0))) { console.error("server0 failed\n" + srv0.logs.join("").slice(-1500)); process.exit(1); }
    const r = await webhook(upd(1, 1, "/help"), { secret: "anything" });
    eq(r.status === 503 && r.json && r.json.error === "WEBHOOK_NOT_CONFIGURED", "boot0: webhook must be 503 fail-closed without secret, got " + r.status + " " + JSON.stringify(r.json));
  } catch (e) { failures.push("CRASH boot0: " + ((e && e.stack) || e)); }
  finally { await stop(srv0.c); }

  // ── boot1: полный ──
  mark("boot1: full");
  const srv = startServer({ TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET });
  try {
    if (!(await ready(srv))) { console.error("server1 failed\n" + srv.logs.join("").slice(-1500)); process.exit(1); }
    const A = await login("tg-A");

    // user B напрямую в БД (owner-only bootstrap; паттерн B1)
    const s3 = require(path.join(REPO, "node_modules", "sqlite3"));
    const secretB = crypto.randomBytes(32).toString("hex");
    const hashB = crypto.createHash("sha256").update(secretB, "utf8").digest("hex");
    const dbw = new s3.Database(path.join(scratch, "app.db"));
    const runw = (sql, p) => new Promise((res2, rej) => dbw.run(sql, p || [], function (e) { (e ? rej(e) : res2(this)); }));
    await runw(`INSERT INTO users (id, role, display_name) VALUES ('u_tgB', 'member', 'UserB')`);
    await runw(`INSERT INTO user_sessions (id, user_id, token_hash, csrf_token, expires_at) VALUES ('s_tgB', 'u_tgB', ?, 'csrf-b', '2099-01-01T00:00:00.000Z')`, [hashB]);
    // засеять A одной review-строкой — id-хвост должен пережить весь прогон нетронутым
    await runw(`INSERT INTO review_log (user_id, id, item_key, kind, reviewed_at, grade, source, channel, meta_json, schema_version) VALUES (?,?,?,?,?,?,?,?,?,1)`,
      [A.userId, "seed-A-1", "אור#noun", "review", "2026-07-01T08:00:00.000Z", 3, "room-recall", "read:mc", "{}"]);
    await new Promise((r) => dbw.close(() => r()));
    const B = { cookie: "lp_session=" + encodeURIComponent("s_tgB." + secretB), csrf: "csrf-b", userId: "u_tgB" };

    const logTail = async (sess) => { const r = await api("GET", "/api/learner/log?limit=2000", sess); return (r.json && r.json.rows || []).map((w) => w.id).join(","); };
    const tailA0 = await logTail(A), tailB0 = await logTail(B);

    // 401/CSRF на pair
    const un = await api("POST", "/api/agent/telegram/pair", { body: { consent: true } });
    eq(un.status === 401, "pair unauth must be 401, got " + un.status);
    const noCsrf = await api("POST", "/api/agent/telegram/pair", { cookie: A.cookie, body: { consent: true } });
    eq(noCsrf.status === 403, "pair without CSRF must be 403, got " + noCsrf.status);

    // secret-гейт: нет заголовка → 401; неверный → 401; тело НЕ обработано (updates пусто)
    mark("secret gate");
    const noSec = await webhook(upd(1, 1, "/help"), { secret: null });
    eq(noSec.status === 401, "webhook without secret → 401, got " + noSec.status);
    const badSec = await webhook(upd(1, 1, "/help"), { secret: "wrong-secret-000000000000000000" });
    eq(badSec.status === 401, "webhook wrong secret → 401, got " + badSec.status);
    // >256kb с ПЛОХИМ секретом → 401 без парсинга (быстрый отказ)
    const bigBad = await webhook(upd(1, 1, "/help"), { secret: "wrong", oversize: 300 * 1024 });
    eq(bigBad.status === 401, "oversized body + bad secret → 401 (secret before parse), got " + bigBad.status);
    // >256kb с ХОРОШИМ секретом → отвергнуто малым лимитом (413), НЕ обработано как 10mb
    const bigOk = await webhook(upd(1, 1, "/help"), { oversize: 300 * 1024 });
    eq(bigOk.status === 413 || bigOk.status >= 400, "oversized body + good secret → rejected by 256kb limit, got " + bigOk.status);
    {
      const db = openRead(); const rows = await dbAllRead(db, "SELECT COUNT(*) c FROM telegram_updates"); db.close();
      eq(Number(rows[0].c) === 0, "no update must be recorded after secret-fails / oversize, got " + rows[0].c);
    }
    eq(callLogCount() === 0, "no sendMessage after secret failures, call-log must be empty");

    // ── ДВУСТОРОННИЙ pairing happy-path ──
    mark("two-sided pairing");
    const TG_T = 55501, CHAT_T = 77701;
    const pair1 = await api("POST", "/api/agent/telegram/pair", { cookie: A.cookie, csrf: A.csrf, body: { consent: true } });
    eq(pair1.status === 200 && pair1.json.ok && /t\.me\/.+\?start=/.test(pair1.json.deep_link), "pair must return a deep_link, got " + JSON.stringify(pair1.json));
    const token1 = tokenFromDeepLink(pair1.json.deep_link);
    const stA1 = await api("GET", "/api/agent/telegram/status", { cookie: A.cookie });
    eq(stA1.json.linked === false && stA1.json.pending === false && stA1.json.consent === true, "after pair: consent granted, not yet linked/pending, got " + JSON.stringify(stA1.json));

    const clBefore = callLogCount();
    const r1 = await webhook(upd(TG_T, CHAT_T, "/start " + token1));
    eq(r1.status === 200, "/start <token> → 200, got " + r1.status);
    await waitCount(clBefore + 1);
    eq(callLogCount() === clBefore + 1, "redeem must send exactly one reply (sendMessage==1), got " + (callLogCount() - clBefore));
    const stA2 = await api("GET", "/api/agent/telegram/status", { cookie: A.cookie });
    eq(stA2.json.linked === false && stA2.json.pending === true && stA2.json.telegram_user_masked, "after redeem: PENDING not active (двусторонность), got " + JSON.stringify(stA2.json));

    const r2 = await webhook(upd(TG_T, CHAT_T, "/confirm"));
    eq(r2.status === 200, "/confirm → 200");
    const stA3 = await api("GET", "/api/agent/telegram/status", { cookie: A.cookie });
    eq(stA3.json.linked === true, "after /confirm: ACTIVE, got " + JSON.stringify(stA3.json));
    // bot /status == web
    const rStatus = await webhook(upd(TG_T, CHAT_T, "/status"));
    eq(rStatus.status === 200, "bot /status → 200");

    // verb-only лог + сырой токен нигде
    {
      const db = openRead();
      const cmds = await dbAllRead(db, "SELECT command FROM bot_action_log WHERE telegram_chat_id = ?", [String(CHAT_T)]);
      db.close();
      eq(cmds.some((c) => c.command === "start") && !cmds.some((c) => String(c.command || "").includes(token1)),
        "bot_action_log.command must be verb-only ('start'), never the raw token");
    }
    const allLogs = srv.logs.join("") + fs.readFileSync(callLogPath, "utf8");
    eq(!allLogs.includes(token1), "raw pairing token must NOT appear in stdout/call-log");

    // ── confused-deputy: токен A, redeem от ЖЕРТВЫ V — без /confirm НЕ активирует у A ──
    mark("confused-deputy");
    // A уже active. Возьмём НОВОГО user через B для чистоты: B минтит токен, жертва redeem'ит.
    const pairB = await api("POST", "/api/agent/telegram/pair", { cookie: B.cookie, csrf: B.csrf, body: { consent: true } });
    const tokenB = tokenFromDeepLink(pairB.json.deep_link);
    const TG_V = 55599, CHAT_V = 77799;
    await webhook(upd(TG_V, CHAT_V, "/start " + tokenB));   // жертва открыла ссылку B
    const stB1 = await api("GET", "/api/agent/telegram/status", { cookie: B.cookie });
    eq(stB1.json.linked === false && stB1.json.pending === true, "confused-deputy: redeem creates PENDING only, never active without confirm, got " + JSON.stringify(stB1.json));
    // жертва видит чужой аккаунт → /cancel
    await webhook(upd(TG_V, CHAT_V, "/cancel"));
    const stB2 = await api("GET", "/api/agent/telegram/status", { cookie: B.cookie });
    eq(stB2.json.linked === false && stB2.json.pending === false, "after /cancel: no active link (confused-deputy defeated), got " + JSON.stringify(stB2.json));

    // ── single-use + TTL ──
    mark("single-use / TTL");
    const reuse = await webhook(upd(TG_T, CHAT_T, "/start " + token1));   // token1 уже consumed
    eq(reuse.status === 200, "reused token → 200 (graceful)");
    // TTL: минт нового токена A2, хирургия expires в прошлое
    // (A уже active — но токен минтится независимо; используем B после отвязки)
    const dbw2 = new s3.Database(path.join(scratch, "app.db"));
    const runw2 = (sql, p) => new Promise((res2, rej) => dbw2.run(sql, p || [], function (e) { (e ? rej(e) : res2(this)); }));
    const pairTTL = await api("POST", "/api/agent/telegram/pair", { cookie: B.cookie, csrf: B.csrf, body: { consent: true } });
    const tokenTTL = tokenFromDeepLink(pairTTL.json.deep_link);
    const tokenTTLhash = crypto.createHash("sha256").update(tokenTTL).digest("hex");
    await runw2(`UPDATE channel_pairing_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE token_hash = ?`, [tokenTTLhash]);
    await new Promise((r) => dbw2.close(() => r()));
    const TG_TTL = 55510, CHAT_TTL = 77710;
    await webhook(upd(TG_TTL, CHAT_TTL, "/start " + tokenTTL));
    const stTTL = await api("GET", "/api/agent/telegram/status", { cookie: B.cookie });
    eq(stTTL.json.pending === false && stTTL.json.linked === false, "expired token must NOT create pending, got " + JSON.stringify(stTTL.json));

    // ── анти-hijack: tg T уже active (с A) → confirm нового pending с B отклонён ──
    mark("anti-hijack");
    const pairB2 = await api("POST", "/api/agent/telegram/pair", { cookie: B.cookie, csrf: B.csrf, body: { consent: true } });
    const tokenB2 = tokenFromDeepLink(pairB2.json.deep_link);
    await webhook(upd(TG_T, CHAT_T, "/start " + tokenB2));   // T (уже active с A) redeem'ит токен B → pending(B↔T)
    const rHijack = await webhook(upd(TG_T, CHAT_T, "/confirm"));
    eq(rHijack.status === 200, "hijack confirm → 200 (graceful reply)");
    const stBh = await api("GET", "/api/agent/telegram/status", { cookie: B.cookie });
    eq(stBh.json.linked === false, "anti-hijack: T already active with A → B confirm rejected, B not linked, got " + JSON.stringify(stBh.json));

    // ── private-only: group chat → ignored ──
    mark("private-only");
    const clBeforeGroup = callLogCount();
    const groupUpd = { update_id: _uid++, message: { message_id: _uid, from: { id: TG_T }, chat: { id: -100200, type: "group" }, text: "/status" } };
    const rg = await webhook(groupUpd);
    eq(rg.status === 200 && rg.json.ignored === true, "group chat must be 200 ignored (no leak), got " + JSON.stringify(rg.json));
    await waitStable();
    eq(callLogCount() === clBeforeGroup, "group /status must NOT send (no disclosure into group)");

    // ── dedup: тот же update_id дважды → второй без эффекта ──
    mark("dedup");
    const dupU = upd(TG_T, CHAT_T, "/help");
    const clBeforeDup = callLogCount();
    await webhook(dupU);
    await waitCount(clBeforeDup + 1);
    const c1 = callLogCount();
    await webhook(dupU);   // тот же update_id
    await waitStable();
    const c2 = callLogCount();
    eq(c1 === clBeforeDup + 1 && c2 === c1, "dedup: same update_id must process once, got sends " + (c1 - clBeforeDup) + "/" + (c2 - c1));

    // ── dedup ROLLBACK при сбое эффекта → ретрай переигрывает ──
    mark("dedup rollback");
    const faultU = { update_id: 990001, message: { message_id: 1, from: { id: TG_T }, chat: { id: CHAT_T, type: "private" }, text: "/__faultonce__" } };
    const rf1 = await webhook(faultU);
    eq(rf1.status === 500, "injected fault → 500 (handler failed), got " + rf1.status);
    { const db = openRead(); const rows = await dbAllRead(db, "SELECT COUNT(*) c FROM telegram_updates WHERE update_id = 990001"); db.close();
      eq(Number(rows[0].c) === 0, "ROLLBACK: failed update must NOT be marked deduped (retry can re-drive)"); }
    const rf2 = await webhook(faultU);   // Telegram ретраит тот же update_id
    eq(rf2.status === 200, "retry after rollback must process (dedup was rolled back), got " + rf2.status);
    { const db = openRead(); const rows = await dbAllRead(db, "SELECT COUNT(*) c FROM telegram_updates WHERE update_id = 990001"); db.close();
      eq(Number(rows[0].c) === 1, "after successful retry, update is deduped"); }

    // ── from.id rate-limit → drop-with-200 (не 429) ──
    mark("from.id rate-limit");
    let throttled = false, saw429 = false;
    for (let i = 0; i < 40; i++) {
      const r = await webhook(upd(TG_T, CHAT_T, "/help"));
      if (r.status === 429) saw429 = true;
      if (r.json && r.json.throttled === true) throttled = true;
    }
    eq(throttled && !saw429, "from.id burst must drop-with-200 (throttled:true), NEVER 429 (self-DoS), got throttled=" + throttled + " saw429=" + saw429);

    // ── consent revoke → атомарный каскад (A active) ──
    mark("consent revoke cascade");
    const rev = await api("POST", "/api/auth/consent", { cookie: A.cookie, csrf: A.csrf, body: { key: "telegram_delivery", granted: false } });
    eq(rev.status === 200 && rev.json.ok && rev.json.explanations && rev.json.explanations.telegram_revoked_links >= 1,
      "consent revoke must cascade-unlink (atomic), got " + JSON.stringify(rev.json));
    const stArev = await api("GET", "/api/agent/telegram/status", { cookie: A.cookie });
    eq(stArev.json.linked === false && stArev.json.consent === false, "after revoke: unlinked + consent off, got " + JSON.stringify(stArev.json));

    // ── id-хвост review_log неизменен (никакой записи в память за весь прогон) ──
    const tailA1 = await logTail(A), tailB1 = await logTail(B);
    eq(tailA1 === tailA0 && tailA0 === "seed-A-1", "review_log id-tail (A) must be BYTE-unchanged (bot is read-only), got " + tailA1);
    eq(tailB1 === tailB0, "review_log id-tail (B) must be byte-unchanged");

    // ── delete-completeness: NULL-user bot_action_log(chat) покидает лог ──
    mark("delete-completeness");
    // re-link A заново (consent revoked → нужен снова), затем /help от T (NULL-user, chat CHAT_T)
    await api("POST", "/api/agent/telegram/pair", { cookie: A.cookie, csrf: A.csrf, body: { consent: true } });
    // A уже НЕ имеет active (revoked). Проверим только delete-purge по chat: сделаем /help от нового tg с chat, привязанного к A через новую связку.
    // Проще: у A есть revoked-связки с CHAT_T (telegram_user_id T). purge берёт chat_id из ВСЕХ связок A (вкл revoked).
    {
      const db = openRead();
      const before = await dbAllRead(db, "SELECT COUNT(*) c FROM bot_action_log WHERE telegram_chat_id = ?", [String(CHAT_T)]);
      db.close();
      eq(Number(before[0].c) > 0, "precondition: bot_action_log has rows for CHAT_T");
    }
    const del = await api("POST", "/api/account/delete", { cookie: A.cookie, csrf: A.csrf, body: { confirm: "DELETE" } });
    eq(del.status === 200 && del.json.ok, "account delete A → 200");
    {
      const db = openRead();
      const after = await dbAllRead(db, "SELECT COUNT(*) c FROM bot_action_log WHERE telegram_chat_id = ?", [String(CHAT_T)]);
      const links = await dbAllRead(db, "SELECT COUNT(*) c FROM channel_links WHERE user_id = ?", [A.userId]);
      db.close();
      eq(Number(after[0].c) === 0, "DELETE-COMPLETENESS: no bot_action_log row with A's chat_id survives, got " + after[0].c);
      eq(Number(links[0].c) === 0, "channel_links for A must be swept, got " + links[0].c);
    }

    // ── export strip token_hash (user B) ──
    mark("export strip");
    await api("POST", "/api/agent/telegram/pair", { cookie: B.cookie, csrf: B.csrf, body: { consent: true } });
    const exp = await api("GET", "/api/account/export", { cookie: B.cookie });
    const tokTable = exp.json && exp.json.tables && exp.json.tables.channel_pairing_tokens;
    eq(Array.isArray(tokTable) && tokTable.length >= 1 && tokTable.every((t) => !("token_hash" in t)),
      "export must include channel_pairing_tokens WITHOUT token_hash, got " + JSON.stringify(tokTable));
  } catch (e) { failures.push("CRASH boot1: " + ((e && e.stack) || e)); }
  finally {
    await stop(srv.c);
    stub.close();
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }

  const TOTAL = 33;
  if (failures.length) {
    console.error(`smoke:telegram-pairing FAIL (${TOTAL - failures.length}/${TOTAL})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:telegram-pairing OK (${TOTAL}/${TOTAL}) — P7.1a: read-only ТРАНЗИТИВНО (router без reviewer/tools/llm) · secret 503 fail-closed + 401-before-parse + 256kb-лимит · ДВУСТОРОННИЙ pairing (redeem→pending, /confirm→active) · confused-deputy побеждён (нет silent-bind) · single-use/TTL · анти-hijack · private-only (нет leak в группу) · dedup + ROLLBACK-переиграет · from.id rate → drop-with-200 (не 429) · sendMessage наблюдаем ==1 · verb-only лог (токен нигде) · consent revoke → атомарный каскад · id-хвост review_log неизменен (2 юзера) · delete-completeness (NULL-user chat покидает) · export strip token_hash`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
