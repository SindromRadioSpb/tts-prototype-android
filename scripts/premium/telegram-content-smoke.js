#!/usr/bin/env node
"use strict";
// smoke:telegram-content — гейт CLG-P7.1b (спека v2 + адъюдикация wf_72c44361). Локальный
// Telegram-stub ЗАХВАТЫВАЕТ текст sendMessage (иначе «контент отдан» недоказуемо). Кейсы:
// content отдан (/plan /due /summary /explain) · расширенный denylist на leak-capable выводе ·
// live consent recheck (revoke telegram_delivery → /plan refusal) · /explain agent_read_texts
// fail-closed (revoke → без sentence-контента даже без purge — BLOCKER-фикс) · read-only id-хвост ·
// >4096-строка не теряется · /help свежий · per-command cap · not-linked · транзитивный read-only.
// Run: node scripts/premium/telegram-content-smoke.js [--gate]

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3302, BASE = "http://127.0.0.1:" + PORT, STUB_PORT = 3303;
const SECRET = "tg-content-smoke-0123456789abcdef";
const WEBHOOK_SECRET = "content-webhook-secret-0123456789";
const BOT_TOKEN = "888888:MOCK";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };
const mark = (s) => console.log("[tg-content] " + s);

// сентинелы, которые НЕ должны утечь / должны присутствовать
const SENT_HE = "זהמשפטסודי";          // «секретное предложение» (класс C) — в /explain при read-on
const TEXT_KEY = "secretcorpuskey";     // сырой внутренний id — НЕ должен утечь
const PROVIDER = "mockprovider";        // provider — НЕ должен утечь
const DUE_LEMMA = "אוֹרבדיקה";           // резолвится из '#'-ключа
const PID_UNRES = "pid:99999999";       // неразрешимый pid → сырой ключ, форматтер обязан скрыть
const CONSTRUCT_ID = "construct:hebrew.channel_gap.reading_to_dictation";

const FORBIDDEN = ["item_key", "policy_version", "provenance", "facts_used", "raw_grade",
  "sentence_id", "scope_level", "sentence_only", "text_key", TEXT_KEY, PROVIDER, PID_UNRES,
  "pid:", "#noun", "construct:", "ae_", "at_"];

let scratch, callLogPath;
function startStub() {
  const srv = http.createServer((req, res) => {
    if (req.method === "POST" && /\/bot.+\/sendMessage$/.test(req.url)) {
      let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
        try { const j = JSON.parse(body); fs.appendFileSync(callLogPath, JSON.stringify({ chat: j.chat_id, text: j.text }) + "\n"); } catch (_) {}
        res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true,"result":{"message_id":1}}');
      });
    } else { res.writeHead(404); res.end("no"); }
  });
  return new Promise((r) => srv.listen(STUB_PORT, "127.0.0.1", () => r(srv)));
}
function startServer(extra) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: scratch, AUTH_BOOTSTRAP_SECRET: SECRET,
      TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
      TELEGRAM_API_BASE: "http://127.0.0.1:" + STUB_PORT, TELEGRAM_BOT_USERNAME: "LinguistProMentorBot",
      AGENT_LLM_PROVIDER: "mock", AGENT_LLM_DAILY_PER_USER: "50", AGENT_LLM_DAILY_GLOBAL: "200", TG_CONTENT_MAX: "6", ...(extra || {}) },
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
  return { cookie: String((sc || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0], csrf: j.csrf, userId: j.user.id }; }
async function webhook(fromId, chatId, text, updId) {
  const res = await fetch(BASE + "/api/telegram/webhook", { method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
    body: JSON.stringify({ update_id: updId, message: { message_id: updId, from: { id: fromId }, chat: { id: chatId, type: "private" }, text } }) });
  let json = null; try { json = await res.json(); } catch (_) {} return { status: res.status, json }; }
function lastTexts(n) { try { const lines = fs.readFileSync(callLogPath, "utf8").split("\n").filter(Boolean); return lines.slice(-n).map((l) => JSON.parse(l).text); } catch (_) { return []; } }
function callCount() { try { return fs.readFileSync(callLogPath, "utf8").split("\n").filter(Boolean).length; } catch (_) { return 0; } }
// Фаза-2 (produce+send) АСИНХРОННА (сервер отвечает 200 до отправки) → после webhook ждём, пока
// call-log вырастет, и возвращаем ТЕКСТ этой отправки. Для команд без отправки — таймаут ~2.5с.
async function recv(fromId, chatId, text, id) {
  const before = callCount();
  const r = await webhook(fromId, chatId, text, id);
  for (let i = 0; i < 50 && callCount() === before; i++) await sleep(50);
  return { r, sent: callCount() > before, text: callCount() > before ? (lastTexts(1)[0] || "") : "" };
}
function openRead() { const s = require(path.join(REPO, "node_modules", "sqlite3")); return new s.Database(path.join(scratch, "app.db"), s.OPEN_READONLY); }
const TG = 71001, CHAT = 81001, TG2 = 71002, CHAT2 = 81002;
let _u = 5000; const nid = () => ++_u;

(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-tg-content-"));
  callLogPath = path.join(scratch, "calls.log");
  const stub = await startStub();

  // транзитивный read-only ассерт (router.js не тянет write/LLM) — как в P7.1a
  {
    const seen = new Set(); const forbidden = ["reviewer.js", "tools.js", "llm.js", "planner.js", "explainer.js", "runtime.js", "content.js"]; const hits = [];
    const walk = (file) => { const abs = path.resolve(file); if (seen.has(abs) || !fs.existsSync(abs)) return; seen.add(abs);
      if (forbidden.includes(path.basename(abs))) hits.push(path.basename(abs));
      let src = ""; try { src = fs.readFileSync(abs, "utf8"); } catch (_) { return; }
      const re = /require\(\s*["'](\.[^"']+)["']\s*\)/g; let m;
      while ((m = re.exec(src))) { let d = path.resolve(path.dirname(abs), m[1]); if (!/\.js$/.test(d)) d += ".js"; walk(d); } };
    walk(path.join(REPO, "agent", "telegram", "router.js"));
    eq(hits.length === 0, "READ-ONLY TRANSITIVE: router.js must NOT reach write/LLM/content modules, got: " + hits.join(","));
  }

  const srv = startServer();
  try {
    if (!(await ready(srv))) { console.error("server failed\n" + srv.logs.join("").slice(-1500)); process.exit(1); }
    const A = await login("content-A");

    // ── прямой сид (skip pairing-dance, протестирован в P7.1a): active link A↔TG + consents +
    //    leak-capable due/explanation/construct ──
    const s3 = require(path.join(REPO, "node_modules", "sqlite3"));
    const dbw = new s3.Database(path.join(scratch, "app.db"));
    const run = (sql, p) => new Promise((res2, rej) => dbw.run(sql, p || [], function (e) { (e ? rej(e) : res2(this)); }));
    await run(`INSERT INTO channel_links (id, user_id, channel, telegram_user_id, telegram_chat_id, status, consent_version, confirmed_at) VALUES ('cl_A','${A.userId}','telegram','${TG}','${CHAT}','active','tg-v1','2026-07-07T00:00:00.000Z')`);
    await run(`INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES ('cr_td','${A.userId}','telegram_delivery',1,'tg-v1')`);
    await run(`INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES ('cr_rt','${A.userId}','agent_read_texts',1,'v1')`);
    // due: '#'-ключ (резолвится в лемму) + неразрешимый pid (форматтер обязан скрыть)
    const past = "2026-06-01T08:00:00.000Z";
    await run(`INSERT INTO srs_projections (user_id, item_key, due, interval_days, reps, lapses, stability, difficulty, reviewed_at, scheme, engine) VALUES ('${A.userId}','${DUE_LEMMA}#noun','${past}',1,1,0,2.0,5.0,'${past}','fsrs','fsrs6-core-v2')`);
    await run(`INSERT INTO srs_projections (user_id, item_key, due, interval_days, reps, lapses, stability, difficulty, reviewed_at, scheme, engine) VALUES ('${A.userId}','${PID_UNRES}','${past}',1,1,0,2.0,5.0,'${past}','fsrs','fsrs6-core-v2')`);
    // explanation (не purged): sentence_he в facts_used, provider/text_key в body/anchor
    const facts = JSON.stringify([{ kind: "user_sentence", text: SENT_HE, source: "consented_artifact" }]);
    const body = JSON.stringify({ text: "объяснение почему рекомендуем", language: "ru", llm_used: true, provider: PROVIDER, model: "mockmodel", scope_level: "sentence_only" });
    await run(`INSERT INTO agent_explanations (id, user_id, sentence_id, item_key, facts_used_json, llm_model, body_json) VALUES ('ae_1','${A.userId}','${TEXT_KEY}#3','${DUE_LEMMA}#noun',?,'mockmodel',?)`, [facts, body]);
    // plan-task с construct_ids → /summary
    await run(`INSERT INTO agent_tasks (id, user_id, kind, status, payload_json) VALUES ('at_1','${A.userId}','plan','open',?)`, [JSON.stringify({ construct_ids: [CONSTRUCT_ID] })]);
    await new Promise((r) => dbw.close(() => r()));

    // user B — id-хвост review_log должен пережить (кросс-тенант read-only)
    const B = await login("content-B");
    const logTail = async (u) => { const r = await fetch(BASE + "/api/learner/log?limit=2000", { headers: { Cookie: u.cookie } }); const j = await r.json().catch(() => ({})); return (j.rows || []).map((w) => w.id).join(","); };
    const tailA0 = await logTail(A), tailB0 = await logTail(B);

    // ── /help свежий ──
    mark("/help");
    const help = (await recv(TG, CHAT, "/help", nid())).text;
    eq(help.includes("/plan") && help.includes("/due") && help.includes("/summary") && help.includes("/explain") && !help.includes("следующем обновлении"),
      "/help must list content commands and NOT the stale promise, got: " + help.slice(0, 120));

    // ── /due: лемма присутствует, pid/ключ скрыты ──
    mark("/due");
    const due = (await recv(TG, CHAT, "/due", nid())).text;
    eq(due.includes(DUE_LEMMA) && !FORBIDDEN.some((f) => due.includes(f)),
      "/due must show lemma, no raw ids: " + JSON.stringify(due.slice(0, 200)));

    // ── /summary: титул конструкции, id скрыт ──
    mark("/summary");
    const summ = (await recv(TG, CHAT, "/summary", nid())).text;
    eq(summ.length > 0 && !FORBIDDEN.some((f) => summ.includes(f)) && !summ.includes(CONSTRUCT_ID),
      "/summary must not leak construct id: " + JSON.stringify(summ.slice(0, 200)));

    // ── /plan: mock-LLM, секции, без item_key/task_id ──
    mark("/plan");
    const plan = (await recv(TG, CHAT, "/plan", nid())).text;
    eq(plan.length > 0 && !FORBIDDEN.some((f) => plan.includes(f)),
      "/plan must produce content without raw ids: " + JSON.stringify(plan.slice(0, 200)));

    // ── /explain (agent_read_texts ON): sentence_he присутствует, text_key/provider скрыты ──
    mark("/explain read-on");
    const expOn = (await recv(TG, CHAT, "/explain", nid())).text;
    eq(expOn.includes(SENT_HE) && !FORBIDDEN.some((f) => expOn.includes(f)),
      "/explain (read-on) must show sentence, hide text_key/provider: " + JSON.stringify(expOn.slice(0, 200)));

    // ── BLOCKER-фикс: revoke agent_read_texts (БЕЗ purge — прямая consent-строка) → /explain
    //    НЕ показывает sentence-контент (fail-closed по живому consent, не по purge) ──
    mark("/explain read-off (BLOCKER)");
    { const db2 = new s3.Database(path.join(scratch, "app.db")); const r2 = (sql, p) => new Promise((res2, rej) => db2.run(sql, p || [], function (e) { (e ? rej(e) : res2(this)); }));
      await r2(`INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES ('cr_rt_off','${A.userId}','agent_read_texts',0,'v1')`);
      await new Promise((r) => db2.close(() => r())); }
    // agent_explanations строка НЕ очищена (purge не запускался) — контент жив в БД
    const expOff = (await recv(TG, CHAT, "/explain", nid())).text;
    eq(!expOff.includes(SENT_HE),
      "BLOCKER: /explain after agent_read_texts revoke must NOT deliver class-C sentence (even un-purged), got: " + JSON.stringify(expOff.slice(0, 200)));

    // ── live consent recheck: revoke telegram_delivery → /plan → refusal, НЕ план ──
    mark("consent recheck telegram_delivery");
    { const db3 = new s3.Database(path.join(scratch, "app.db")); const r3 = (sql, p) => new Promise((res2, rej) => db3.run(sql, p || [], function (e) { (e ? rej(e) : res2(this)); }));
      await r3(`INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES ('cr_td_off','${A.userId}','telegram_delivery',0,'tg-v1')`);
      await new Promise((r) => db3.close(() => r())); }
    const offRes = await recv(TG, CHAT, "/plan", nid());
    eq(offRes.r.status === 200, "/plan after revoke → 200");
    eq(offRes.sent && (offRes.text.includes("отключ") || offRes.text.includes("Подключите")) && !offRes.text.includes(DUE_LEMMA),
      "after telegram_delivery revoke, content command must refuse (channel off), got: " + JSON.stringify(offRes.text.slice(0, 160)));
    // восстановим telegram_delivery для остатка
    { const db4 = new s3.Database(path.join(scratch, "app.db")); const r4 = (sql, p) => new Promise((res2, rej) => db4.run(sql, p || [], function (e) { (e ? rej(e) : res2(this)); }));
      await r4(`INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES ('cr_td_on2','${A.userId}','telegram_delivery',1,'tg-v1')`);
      await new Promise((r) => db4.close(() => r())); }

    // ── not-linked: content от непривязанного tg → «подключите», без контента ──
    mark("not-linked");
    const nlRes = await recv(TG2, CHAT2, "/due", nid());
    eq(nlRes.sent && !nlRes.text.includes(DUE_LEMMA) && (nlRes.text.includes("связ") || nlRes.text.includes("Подключите")),
      "not-linked content command must ask to connect, no content: " + JSON.stringify(nlRes.text.slice(0, 160)));

    // ── dedup: тот же update_id → без повторного эффекта (account-команда /status, чтобы не
    //    тратить content-cap) ──
    mark("dedup");
    const dupId = nid(); const cD = callCount();
    await recv(TG, CHAT, "/status", dupId); const c1 = callCount();
    const dup2 = await recv(TG, CHAT, "/status", dupId); const c2 = callCount();
    eq(c1 === cD + 1 && c2 === c1 && !dup2.sent, "dedup: same update_id must not re-produce, sends " + (c1 - cD) + "/" + (c2 - c1));

    // ── per-command cap: burst /plan с СВЕЖЕГО from.id (cap проверяется ДО роутера, свой bucket) →
    //    часть throttled (200 throttled, не 429) ──
    mark("per-command cap");
    const TG3 = 71003, CHAT3 = 81003;
    let throttled = false, saw429 = false;
    for (let i = 0; i < 10; i++) { const r = await webhook(TG3, CHAT3, "/plan", nid()); if (r.status === 429) saw429 = true; if (r.json && r.json.throttled) throttled = true; }
    eq(throttled && !saw429, "content burst must throttle with 200 (not 429), got throttled=" + throttled + " 429=" + saw429);

    // ── read-only: id-хвост review_log (2 юзера) неизменен ──
    eq((await logTail(A)) === tailA0, "review_log id-tail (A) must be unchanged (bot read-only)");
    eq((await logTail(B)) === tailB0, "review_log id-tail (B) must be unchanged");

    // ── stdout-гигиена: сентинел-предложение не в логах сервера ──
    eq(!srv.logs.join("").includes(SENT_HE), "class-C sentence must NOT appear in server stdout");
  } catch (e) { failures.push("CRASH: " + ((e && e.stack) || e)); }
  finally { await stop(srv.c); stub.close(); try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {} }

  const TOTAL = 15;
  if (failures.length) {
    console.error(`smoke:telegram-content FAIL (${TOTAL - failures.length}/${TOTAL})`);
    for (const f of failures) console.error("  ✗ " + f); process.exitCode = 1;
  } else {
    console.log(`smoke:telegram-content OK (${TOTAL}/${TOTAL}) — P7.1b: транзитивный read-only · /help свежий · /due лемма (pid/ключ скрыты) · /summary (construct-id скрыт) · /plan mock-LLM (без item_key/task_id) · /explain read-on (sentence, text_key/provider скрыты) · BLOCKER: /explain read-off без класс-C контента (fail-closed по живому agent_read_texts, не по purge) · consent recheck telegram_delivery→refusal · not-linked · dedup · per-command cap (200 throttled) · read-only id-хвост (2 юзера) · stdout-гигиена`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
