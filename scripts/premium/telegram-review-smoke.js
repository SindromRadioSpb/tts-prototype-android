#!/usr/bin/env node
"use strict";
// smoke:telegram-review — гейт CLG-P7.2a (reverse:tg + challenge-binding, owner-вариант A + критика
// wf_15f4c1ae). Локальный Telegram-stub с ИНКРЕМЕНТНЫМ message_id (иначе reply-binding недоказуем).
// Покрывает 14 owner-пунктов приёмки + база. Пишущий путь → флаг AGENT_REVIEW_WRITE=1.
// Reply-таргет читаем ИЗ БД (telegram_prompt_message_id) — фаза-2 асинхронна, call-log растёт до
// того, как setPromptMessageId закоммитил (иначе гонка). Run: node scripts/premium/telegram-review-smoke.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3312, BASE = "http://127.0.0.1:" + PORT, STUB_PORT = 3313;
const SECRET = "tg-review-smoke-0123456789abcdef0";
const WEBHOOK_SECRET = "review-webhook-secret-0123456789";
const BOT_TOKEN = "999999:MOCK";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
let _n = 0;
const eq = (c, m) => { _n++; if (!c) { failures.push(m); console.log("  ✗ " + m); } else { console.log("  ✓ " + m.slice(0, 72)); } };
const mark = (s) => console.log("[tg-review] " + s);

const ITEM = "לכתוב#verb", EXPECTED = "לכתוב", GLOSS = "писать";   // strict-safe (один сенс, без коллизии)
const NONSTRICT = "לדבר#verb";                                    // «говорить» + синонимы → НЕ strict
const RAW_SENTINEL = "לסודיזז";                                    // сырой ответ-сентинел (не должен утечь)

let scratch, callLogPath, _mid = 1000;
function startStub() {
  const srv = http.createServer((req, res) => {
    if (req.method === "POST" && /\/bot.+\/sendMessage$/.test(req.url)) {
      let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
        const mid = ++_mid;
        try { const j = JSON.parse(body); fs.appendFileSync(callLogPath, JSON.stringify({ chat: j.chat_id, text: j.text, message_id: mid }) + "\n"); } catch (_) {}
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, result: { message_id: mid } }));
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
      TG_CONTENT_MAX: "60", ...(extra || {}) },
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
async function webhook(fromId, chatId, text, updId, replyTo) {
  const message = { message_id: updId, from: { id: fromId }, chat: { id: chatId, type: "private" }, text };
  if (replyTo != null) message.reply_to_message = { message_id: replyTo };
  const res = await fetch(BASE + "/api/telegram/webhook", { method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
    body: JSON.stringify({ update_id: updId, message }) });
  let json = null; try { json = await res.json(); } catch (_) {} return { status: res.status, json }; }
function calls() { try { return fs.readFileSync(callLogPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch (_) { return []; } }
function callCount() { return calls().length; }
async function recv(fromId, chatId, text, id, replyTo) {
  const before = callCount();
  const r = await webhook(fromId, chatId, text, id, replyTo);
  for (let i = 0; i < 60 && callCount() === before; i++) await sleep(50);
  const c = calls(); const last = c[c.length - 1] || {};
  return { r, sent: callCount() > before, text: callCount() > before ? (last.text || "") : "", messageId: last.message_id };
}
function openDb() { const s = require(path.join(REPO, "node_modules", "sqlite3")); return new s.Database(path.join(scratch, "app.db")); }
function dbRun(db, sql, p) { return new Promise((res, rej) => db.run(sql, p || [], function (e) { (e ? rej(e) : res(this)); })); }
function dbAll(db, sql, p) { return new Promise((res, rej) => db.all(sql, p || [], (e, r) => (e ? rej(e) : res(r || [])))); }
async function withDb(fn) { const db = openDb(); try { return await fn(db); } finally { await new Promise((r) => db.close(() => r())); } }

const TG = 72001, CHAT = 82001;
let _u = 6000; const nid = () => ++_u;

async function seedUser(userId) {
  await withDb(async (db) => {
    const past = "2026-06-01T08:00:00.000Z";
    await dbRun(db, `INSERT INTO channel_links (id, user_id, channel, telegram_user_id, telegram_chat_id, status, consent_version, confirmed_at) VALUES ('cl_R',?,'telegram',?,?,'active','tg-v1','2026-07-07T00:00:00.000Z')`, [userId, String(TG), String(CHAT)]);
    await dbRun(db, `INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES ('cr_td_R',?,'telegram_delivery',1,'tg-v1')`, [userId]);
    await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'seed',?,NULL,'seed-sm2',NULL,'{}',1)`, [userId, "seed:" + ITEM, ITEM, past]);
    await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'review',?,3,'room-recall','read:mc','{}',1)`, [userId, "rd:" + ITEM, ITEM, "2026-06-02T08:00:00.000Z"]);
    await dbRun(db, `INSERT INTO srs_projections (user_id,item_key,due,interval_days,reps,lapses,stability,difficulty,reviewed_at,scheme,engine) VALUES (?,?,?,1,1,0,12.0,5.0,?,'fsrs','fsrs6-core-v2')`, [userId, ITEM, past, past]);
    await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'seed',?,NULL,'seed-sm2',NULL,'{}',1)`, [userId, "seed:" + NONSTRICT, NONSTRICT, past]);
    await dbRun(db, `INSERT INTO srs_projections (user_id,item_key,due,interval_days,reps,lapses,stability,difficulty,reviewed_at,scheme,engine) VALUES (?,?,?,1,1,0,12.0,5.0,?,'fsrs','fsrs6-core-v2')`, [userId, NONSTRICT, past, past]);
  });
}
// сброс между тестами: очистить cooldown-экспозицию И вернуть ITEM в due (успешные ответы
// продвигают FSRS-расписание → слово перестаёт быть due; для след. теста нужен свежий challenge)
const resetState = () => withDb(async (db) => {
  await dbRun(db, `DELETE FROM tg_stimulus_exposure`);
  await dbRun(db, `UPDATE srs_projections SET due='2026-06-01T08:00:00.000Z' WHERE item_key=?`, [ITEM]);
});
const challengeRows = (userId) => withDb((db) => dbAll(db, `SELECT * FROM agent_challenges WHERE user_id=? ORDER BY created_at`, [userId]));
const reviewRows = (userId) => withDb((db) => dbAll(db, `SELECT * FROM review_log WHERE user_id=? AND source LIKE 'agent:%'`, [userId]));
const botCommands = () => withDb((db) => dbAll(db, `SELECT command FROM bot_action_log`, []));
async function grantTd(userId, on) { await withDb((db) => dbRun(db, `INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES (?,?,'telegram_delivery',?,'tg-v1')`, ["cr_td_" + nid(), userId, on ? 1 : 0])); }
async function openChallenge(userId) { const r = await challengeRows(userId); return r.filter((c) => c.status === "active" || c.status === "processing").slice(-1)[0] || null; }
// /review → дождаться сохранённого message_id В БД (устраняет гонку call-log/setPromptMessageId)
async function startReviewPrompt(userId) {
  const res = await recv(TG, CHAT, "/review", nid());
  let ch = null;
  for (let i = 0; i < 60; i++) { ch = await openChallenge(userId); if (ch && ch.telegram_prompt_message_id != null) break; await sleep(50); }
  return { res, ch, mid: ch && ch.telegram_prompt_message_id };
}
async function answer(text, mid) { return await recv(TG, CHAT, text, nid(), mid); }

(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-tg-review-"));
  callLogPath = path.join(scratch, "calls.log");
  const stub = await startStub();

  // ── транзитивный read-only ассерт (router.js не тянет write/LLM/review) ──
  {
    const seen = new Set(); const forbidden = ["reviewer.js", "tools.js", "llm.js", "planner.js", "review.js", "runtime.js", "agentChallengeRepo.js"]; const hits = [];
    const walk = (file) => { const abs = path.resolve(file); if (seen.has(abs) || !fs.existsSync(abs)) return; seen.add(abs);
      if (forbidden.includes(path.basename(abs))) hits.push(path.basename(abs));
      let src = ""; try { src = fs.readFileSync(abs, "utf8"); } catch (_) { return; }
      const re = /require\(\s*["'](\.[^"']+)["']\s*\)/g; let m;
      while ((m = re.exec(src))) { let d = path.resolve(path.dirname(abs), m[1]); if (!/\.js$/.test(d)) d += ".js"; walk(d); } };
    walk(path.join(REPO, "agent", "telegram", "router.js"));
    eq(hits.length === 0, "TRANSITIVE read-only: router.js must NOT reach write/review modules, got: " + hits.join(","));
  }

  // ══ ФАЗА A: флаг OFF — /review недоступен, zero-write, challenge НЕ создан ══
  mark("flag OFF");
  { const srv = startServer({ /* AGENT_REVIEW_WRITE unset */ });
    try {
      if (!(await ready(srv))) { console.error("server(off) failed\n" + srv.logs.join("").slice(-1500)); process.exit(1); }
      const U = await login("rev-off"); await seedUser(U.userId);
      const rr = await recv(TG, CHAT, "/review", nid());
      eq(rr.sent && !rr.text.includes(EXPECTED), "flag-off /review → note, no prompt with answer");
      eq((await challengeRows(U.userId)).length === 0, "flag-off: NO challenge created");
      eq((await reviewRows(U.userId)).length === 0, "flag-off: zero review write");
    } catch (e) { failures.push("CRASH(off): " + ((e && e.stack) || e)); }
    finally { await stop(srv.c); }
  }
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-tg-review-")); callLogPath = path.join(scratch, "calls.log");

  // ══ ФАЗА B: флаг ON — полный цикл ══
  mark("flag ON");
  const srv = startServer({ AGENT_REVIEW_WRITE: "1" });
  try {
    if (!(await ready(srv))) { console.error("server failed\n" + srv.logs.join("").slice(-1500)); process.exit(1); }
    const U = await login("rev-on"); await seedUser(U.userId);

    // ── 1) startReview: prompt с глоссом, БЕЗ ответа; challenge создан; message_id; strict-only ──
    mark("startReview");
    const p1 = await startReviewPrompt(U.userId);
    eq(p1.res.sent && p1.res.text.includes(GLOSS), "prompt shows RU gloss «" + GLOSS + "»");
    eq(!p1.res.text.includes(EXPECTED), "prompt does NOT contain expected HE (prompt≠answer, pt1)");
    eq(p1.ch && p1.ch.status === "active" && p1.ch.item_key === ITEM, "strict-safe item selected (NONSTRICT rejected, pt2)");
    eq(p1.mid != null, "prompt message_id saved to challenge (reply-binding ready)");
    eq(p1.ch && p1.ch.stimulus_source === "pealim-infl" && p1.ch.stimulus_source_version === "v12" && p1.ch.stimulus_privacy_class === "A", "stimulus source/version/class saved (pt14)");

    // ── 2) reply-binding: сообщение НЕ reply на prompt → НЕ review (challenge жив, без grade) ──
    mark("reply-binding");
    const free = await recv(TG, CHAT, "спасибо", nid());   // без reply_to
    eq(!/Верно|Ожидалось|засчитан/.test(free.text), "free message (not reply) → not a verdict (not a review, pt5)");
    eq((await openChallenge(U.userId)).status === "active", "challenge still active after non-reply message");
    eq((await reviewRows(U.userId)).length === 0, "non-reply message → zero write");

    // ── 3) correct: reply 'לכתוב' → ✅, review записан, challenge completed, evidence_scope=lexeme ──
    mark("correct");
    const a1 = await answer(EXPECTED, p1.mid);
    eq(a1.sent && a1.text.includes("Верно"), "correct answer → ✅ verdict");
    let rv = await reviewRows(U.userId);
    eq(rv.length === 1 && Number(rv[0].grade) === 3 && rv[0].channel === "reverse:tg", "one review row, grade 3, reverse:tg");
    const meta0 = JSON.parse(rv[0].meta_json || "{}");
    eq(meta0.evidence_scope === "lexeme" && meta0.challenge_id === p1.ch.challenge_id, "meta evidence_scope=lexeme + challenge_id (pt13)");
    eq((await challengeRows(U.userId)).slice(-1)[0].status === "completed", "challenge completed after write (completed⇒review exists, pt9)");

    // ── 4) single-use: повторный reply (другой update) на completed challenge → НЕ пишет ──
    mark("single-use");
    await answer(EXPECTED, p1.mid);
    eq((await reviewRows(U.userId)).length === 1, "second answer on completed challenge → no new write (single-use)");

    // ── 5) retry/детерминизм: тот же update_id → dedup → одна строка (pt10) ──
    mark("determinism/retry");
    await resetState();
    const p2 = await startReviewPrompt(U.userId);
    const upd = nid();
    await recv(TG, CHAT, EXPECTED, upd, p2.mid);
    const n1 = (await reviewRows(U.userId)).length;
    await webhook(TG, CHAT, EXPECTED, upd, p2.mid); await sleep(500);   // тот же update_id → dedup
    eq((await reviewRows(U.userId)).length === n1, "same update_id retry → exactly one review (deterministic, pt10)");

    // ── 6) wrong: сентинел-ответ → «Не засчитано», сырой ответ НИГДЕ не персистится (pt11) ──
    mark("wrong + raw-answer privacy");
    await resetState();
    const p3 = await startReviewPrompt(U.userId);
    const aW = await answer(RAW_SENTINEL, p3.mid);
    eq(aW.sent && aW.text.includes("Ожидалось") && aW.text.includes(EXPECTED), "wrong → «Не засчитано. Ожидалось: <expected>»");
    const rvW = await reviewRows(U.userId);
    const wrongRow = rvW.find((r) => JSON.parse(r.meta_json || "{}").decision === "wrong");
    eq(!!wrongRow && (Number(wrongRow.grade) === 2 || Number(wrongRow.grade) === 1), "wrong row written (D1: Hard/Again)");
    eq(!rvW.map((r) => r.meta_json).join(" ").includes(RAW_SENTINEL), "raw answer NOT in review_log meta (pt11)");
    const bl = (await botCommands()).map((r) => r.command).join(",");
    eq(!bl.includes(RAW_SENTINEL) && bl.includes("review-answer"), "bot_action_log.command = 'review-answer' fixed label, no raw answer (pt11)");

    // ── 7) skip vs wrong: «не знаю» → decision=skip, D1-Hard(2) на production; отличается от wrong ──
    mark("skip vs wrong (pt7)");
    await resetState();
    const p4 = await startReviewPrompt(U.userId);
    await answer("не знаю", p4.mid);
    const rvS = await reviewRows(U.userId);
    const skipRow = rvS.find((r) => r.kind === "skip" || JSON.parse(r.meta_json || "{}").decision === "skip");
    eq(!!skipRow && Number(skipRow.grade) === 2, "skip on production + receptive-strong → Hard(2) (owner #2)");
    eq(!!skipRow && JSON.parse(skipRow.meta_json || "{}").decision === "skip", "skip decision distinct from wrong (pt7)");

    // ── 8) «не сейчас» → declined, zero write ──
    mark("not-now (pt8)");
    await resetState();
    const nBefore = (await reviewRows(U.userId)).length;
    const p5 = await startReviewPrompt(U.userId);
    await answer("не сейчас", p5.mid);
    eq((await reviewRows(U.userId)).length === nBefore, "«не сейчас» → zero write (pt8)");
    eq((await challengeRows(U.userId)).slice(-1)[0].status === "declined", "«не сейчас» → challenge declined");

    // ── 9) cooldown: /due показывает форму → /review её пропускает (pt6) ──
    mark("cooldown (pt6)");
    await resetState();
    await recv(TG, CHAT, "/due", nid());
    await sleep(400);
    const pC = await recv(TG, CHAT, "/review", nid());
    eq(pC.sent && !pC.text.includes(GLOSS) && (pC.text.includes("зал") || pC.text.includes("нечего")),
      "after /due exposure, /review skips the shown form → nothing (pt6)");

    // ── 10) revoke между prompt и ответом → write заблокирован + challenge cancelled (pt12) ──
    mark("revoke mid-flight (pt12)");
    await resetState();
    const p6 = await startReviewPrompt(U.userId);
    const nR = (await reviewRows(U.userId)).length;
    await grantTd(U.userId, false);
    const aR = await answer(EXPECTED, p6.mid);
    eq((await reviewRows(U.userId)).length === nR, "revoke between prompt and answer → zero write (pt12)");
    eq(aR.sent && (aR.text.includes("отключ") || aR.text.includes("Подключи")), "revoked answer → refusal message");
    await grantTd(U.userId, true);

    // ── 11) /api/agent/review guard (BLOCKER-3): challenge_id / production → 400 ──
    mark("HTTP guard (BLOCKER-3)");
    const hdr = { "Content-Type": "application/json", Cookie: U.cookie, "X-LP-CSRF": U.csrf };
    const g1 = await fetch(BASE + "/api/agent/review", { method: "POST", headers: hdr, body: JSON.stringify({ item_key: ITEM, channel: "read:mc", answer: EXPECTED, attempt_id: "httpattempt1", challenge_id: "ch_x" }) });
    eq(g1.status === 400, "POST /api/agent/review with challenge_id → 400 (bearer-token blocked)");
    const g2 = await fetch(BASE + "/api/agent/review", { method: "POST", headers: hdr, body: JSON.stringify({ item_key: ITEM, channel: "reverse:tg", answer: EXPECTED, attempt_id: "httpattempt2" }) });
    eq(g2.status === 400, "POST /api/agent/review with production channel → 400 (production locked on HTTP)");

    // ── 12) stdout-гигиена ──
    eq(!srv.logs.join("").includes(RAW_SENTINEL), "raw answer NOT in server stdout (pt11)");
  } catch (e) { failures.push("CRASH: " + ((e && e.stack) || e)); console.log(e && e.stack); }
  finally { await stop(srv.c); stub.close(); try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {} }

  const TOTAL = _n;
  const passed = TOTAL - failures.length;
  if (failures.length) {
    console.error(`\nsmoke:telegram-review FAIL (${passed}/${TOTAL})`);
    process.exitCode = 1;
  } else {
    console.log(`\nsmoke:telegram-review OK (${TOTAL}/${TOTAL}) — P7.2a reverse:tg: транзитивный read-only · flag-off zero-write+no-challenge · startReview (RU-глосс prompt≠ответ, strict-only, message_id, stimulus-провенанс) · reply-binding (не-reply≠review) · correct (grade3, evidence_scope=lexeme, completed⇒review) · single-use · детерминизм retry (одна строка) · wrong (raw НЕ в meta/bot_log/stdout, фикс-метка) · skip→D1-Hard≠wrong · «не сейчас» declined zero-write · cooldown (/due→/review skip) · revoke mid-flight zero-write · HTTP guard challenge_id/production→400`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
