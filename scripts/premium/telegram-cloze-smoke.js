#!/usr/bin/env node
"use strict";
// smoke:telegram-cloze — гейт CLG-P7.2b (cloze:tg, context-cloze + expected=surface, класс-C). Сидит
// СИНХРОНИЗИРОВАННЫЙ артефакт с вокализованным предложением, содержащим форму due-леммы (surface≠lemma),
// + двойной consent (cloud_texts+agent_read_texts). Проверяет: cloze выбран, prompt≠answer, expected=
// поверхность (correct-on-surface / wrong-on-lemma), item_key-parity, класс-C purge на complete/revoke,
// double-consent recheck, evidence_scope=cloze, D1, discriminated fallback. Флаг AGENT_REVIEW_WRITE=1.

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3322, BASE = "http://127.0.0.1:" + PORT, STUB_PORT = 3323;
const SECRET = "tg-cloze-smoke-0123456789abcdef01";
const WEBHOOK_SECRET = "cloze-webhook-secret-01234567890";
const BOT_TOKEN = "777777:MOCK";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
let _n = 0;
const eq = (c, m) => { _n++; if (!c) { failures.push(m); console.log("  ✗ " + m); } else { console.log("  ✓ " + m.slice(0, 74)); } };
const mark = (s) => console.log("[tg-cloze] " + s);

// strict-safe due-лемма + её вокализованная форма-вхождение (surface ≠ lemma)
const ITEM = "לכתוב#verb", LEMMA = "לכתוב", SURFACE = "כּוֹתֵב";      // כּוֹתֵב = AP-ms (unambiguous voc)
const SENT_NIQQUD = "הַיֶּלֶד כּוֹתֵב מִכְתָּב";                        // «мальчик пишет письмо»
const SENT_PLAIN = "הילד כותב מכתב";
const SENT_RU = "мальчик пишет письмо";
const CLASSC_MARK = "הַיֶּלֶד";   // сентинел класса C (первое слово) — не должен утечь

let scratch, callLogPath, _mid = 2000;
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
      TG_CONTENT_MAX: "60", AGENT_REVIEW_WRITE: "1", ...(extra || {}) },
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
  await webhook(fromId, chatId, text, id, replyTo);
  for (let i = 0; i < 60 && callCount() === before; i++) await sleep(50);
  const c = calls(); const last = c[c.length - 1] || {};
  return { sent: callCount() > before, text: callCount() > before ? (last.text || "") : "", messageId: last.message_id };
}
function openDb() { const s = require(path.join(REPO, "node_modules", "sqlite3")); return new s.Database(path.join(scratch, "app.db")); }
function dbRun(db, sql, p) { return new Promise((res, rej) => db.run(sql, p || [], function (e) { (e ? rej(e) : res(this)); })); }
function dbAll(db, sql, p) { return new Promise((res, rej) => db.all(sql, p || [], (e, r) => (e ? rej(e) : res(r || [])))); }
async function withDb(fn) { const db = openDb(); try { return await fn(db); } finally { await new Promise((r) => db.close(() => r())); } }

const TG = 73001, CHAT = 83001;
let _u = 7000; const nid = () => ++_u;

async function seedUser(userId, opts) {
  const o = opts || {};
  await withDb(async (db) => {
    const past = "2026-06-01T08:00:00.000Z";
    await dbRun(db, `INSERT INTO channel_links (id, user_id, channel, telegram_user_id, telegram_chat_id, status, consent_version, confirmed_at) VALUES ('cl_C',?,'telegram',?,?,'active','tg-v1','2026-07-07T00:00:00.000Z')`, [userId, String(TG), String(CHAT)]);
    await dbRun(db, `INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES ('cr_td_C',?,'telegram_delivery',1,'tg-v1')`, [userId]);
    if (o.cloudTexts !== false) await dbRun(db, `INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES ('cr_ct',?,'cloud_texts',1,'v1')`, [userId]);
    if (o.agentRead !== false) await dbRun(db, `INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES ('cr_ar',?,'agent_read_texts',1,'v1')`, [userId]);
    // receptive-strong для ITEM
    await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'seed',?,NULL,'seed-sm2',NULL,'{}',1)`, [userId, "seed:" + ITEM, ITEM, past]);
    await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'review',?,3,'room-recall','read:mc','{}',1)`, [userId, "rd:" + ITEM, ITEM, "2026-06-02T08:00:00.000Z"]);
    await dbRun(db, `INSERT INTO srs_projections (user_id,item_key,due,interval_days,reps,lapses,stability,difficulty,reviewed_at,scheme,engine) VALUES (?,?,?,1,1,0,12.0,5.0,?,'fsrs','fsrs6-core-v2')`, [userId, ITEM, past, past]);
    // синхронизированный артефакт: текст с вокализованным предложением, содержащим форму ITEM
    const payload = JSON.stringify({ texts: [{ text_key: "t1", title: "мой текст", rows: [
      { order_index: 0, hebrew_niqqud: SENT_NIQQUD, hebrew_plain: SENT_PLAIN, russian: SENT_RU },
    ] }] });
    await dbRun(db, `INSERT INTO learner_artifacts (user_id, kind, artifact_key, updated_at, payload_json) VALUES (?,'text_bundle','t1',?,?)`, [userId, "2026-07-01T00:00:00.000Z", payload]);
  });
}
const resetState = () => withDb(async (db) => { await dbRun(db, `DELETE FROM tg_stimulus_exposure`); await dbRun(db, `UPDATE srs_projections SET due='2026-06-01T08:00:00.000Z' WHERE item_key=?`, [ITEM]); });
const challengeRows = (userId) => withDb((db) => dbAll(db, `SELECT * FROM agent_challenges WHERE user_id=? ORDER BY created_at`, [userId]));
const reviewRows = (userId) => withDb((db) => dbAll(db, `SELECT * FROM review_log WHERE user_id=? AND source LIKE 'agent:%'`, [userId]));
const botCommands = () => withDb((db) => dbAll(db, `SELECT command FROM bot_action_log`, []));
async function setConsent(userId, key, on) { await withDb((db) => dbRun(db, `INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES (?,?,?,?,?)`, ["cr_" + nid(), userId, key, on ? 1 : 0, key === "telegram_delivery" ? "tg-v1" : "v1"])); }
async function openChallenge(userId) { const r = await challengeRows(userId); return r.filter((c) => c.status === "active" || c.status === "processing").slice(-1)[0] || null; }
async function startPrompt(userId) {
  await recv(TG, CHAT, "/review", nid());
  let ch = null;
  for (let i = 0; i < 60; i++) { ch = await openChallenge(userId); if (ch && ch.telegram_prompt_message_id != null) break; await sleep(50); }
  return ch;
}

(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-tg-cloze-"));
  callLogPath = path.join(scratch, "calls.log");
  const stub = await startStub();

  const srv = startServer();
  try {
    if (!(await ready(srv))) { console.error("server failed\n" + srv.logs.join("").slice(-1500)); process.exit(1); }
    const U = await login("cloze-U"); await seedUser(U.userId);

    // ── 1) cloze выбран при двойном consent; prompt = пропуск, surface скрыт, перевод есть; item_key-parity ──
    mark("cloze selected");
    const ch1 = await startPrompt(U.userId);
    eq(ch1 && ch1.prompt_kind === "cloze" && ch1.review_mode === "cloze:tg", "cloze challenge created (prompt_kind=cloze)");
    eq(ch1 && ch1.item_key === ITEM, "item_key parity: credited the SAME projection key (не мис-key)");
    eq(ch1 && ch1.expected_surface === SURFACE, "expected_surface = поверхность вхождения («" + SURFACE + "»)");
    eq(ch1 && ch1.evidence_scope === "cloze" && ch1.stimulus_privacy_class === "C", "evidence_scope=cloze + class C (pt7)");
    eq(ch1 && ch1.anchor_text_key === "t1" && Number(ch1.anchor_order_index) === 0, "anchor (text_key,order_index) сохранён");
    const p1 = calls()[calls().length - 1] || {};
    eq(p1.text && p1.text.includes("―") && !p1.text.includes(SURFACE), "prompt has blank «―», does NOT contain surface (prompt≠answer, pt1)");
    eq(p1.text && p1.text.includes("мальчик"), "prompt includes RU translation (context)");
    const mid1 = ch1.telegram_prompt_message_id;

    // ── 2) expected=surface: верная поверхность → correct; class-C purge на complete; scope=cloze ──
    mark("correct-on-surface + class-C purge");
    const a1 = await recv(TG, CHAT, SURFACE, nid(), mid1);
    eq(a1.sent && a1.text.includes("Верно"), "correct surface answer → ✅");
    let rv = await reviewRows(U.userId);
    eq(rv.length === 1 && Number(rv[0].grade) === 3 && rv[0].channel === "cloze:tg", "one review, grade 3, cloze:tg");
    eq(JSON.parse(rv[0].meta_json || "{}").evidence_scope === "cloze", "meta evidence_scope=cloze (pt7)");
    let ch = (await challengeRows(U.userId)).slice(-1)[0];
    eq(ch.status === "completed" && ch.shown_stimulus === null && ch.expected_surface === null && ch.anchor_text_key === null,
      "class-C purged on complete (shown_stimulus/expected_surface/anchor NULL, pt4)");

    // ── 3) expected=surface доказательство: ЛЕММА как ответ → НЕ correct (surface≠lemma) ──
    mark("wrong-on-lemma (surface≠lemma proof)");
    await resetState();
    const ch3 = await startPrompt(U.userId);
    const aL = await recv(TG, CHAT, LEMMA, nid(), ch3.telegram_prompt_message_id);
    eq(aL.sent && !aL.text.includes("Верно"), "lemma answer «" + LEMMA + "» is NOT correct (expected=surface, not lemma, pt2)");
    const wrongRow = (await reviewRows(U.userId)).find((r) => JSON.parse(r.meta_json || "{}").decision === "wrong" || JSON.parse(r.meta_json || "{}").decision === "near_miss");
    eq(!!wrongRow, "lemma-on-cloze wrote a non-correct row");

    // ── 4) cloze production D1: неверная поверхность на рецептивно-сильном → grade 2 ──
    mark("cloze production D1 (pt6)");
    eq(wrongRow && Number(wrongRow.grade) === 2, "cloze fail on receptive-strong → Hard(2) (production, pt6)");

    // ── 5) privacy: предложение пользователя (класс C) НЕ в review_log meta / bot_log / stdout ──
    mark("class-C privacy (pt5)");
    const allMeta = (await reviewRows(U.userId)).map((r) => r.meta_json).join(" ");
    const bl = (await botCommands()).map((r) => r.command).join(",");
    eq(!allMeta.includes(CLASSC_MARK) && !allMeta.includes("כותב"), "user sentence NOT in review_log meta (pt5)");
    eq(!bl.includes(CLASSC_MARK) && bl.includes("review-answer"), "bot_action_log fixed label, no class-C sentence");

    // ── 6) revoke text-consent между prompt и ответом → zero-write + cancel + class-C purge (pt4) ──
    mark("revoke mid-flight (pt4)");
    await resetState();
    const ch6 = await startPrompt(U.userId);
    const nR = (await reviewRows(U.userId)).length;
    await setConsent(U.userId, "agent_read_texts", false);   // отзыв чтения текста
    const aR = await recv(TG, CHAT, SURFACE, nid(), ch6.telegram_prompt_message_id);
    eq((await reviewRows(U.userId)).length === nR, "revoke agent_read_texts between prompt and answer → zero-write (pt4)");
    const ch6r = (await challengeRows(U.userId)).find((c) => c.challenge_id === ch6.challenge_id);
    eq(ch6r && ch6r.status === "cancelled" && ch6r.shown_stimulus === null, "cloze challenge cancelled + class-C purged on revoke (pt4)");
    await setConsent(U.userId, "agent_read_texts", true);

    // ── 7) fallback discriminated: revoke agent_read_texts → cloze недоступен → reverse (не тихий 0) ──
    mark("fallback to reverse when cloze unavailable (pt3/pt8)");
    await resetState();
    await setConsent(U.userId, "agent_read_texts", false);
    const pF = await recv(TG, CHAT, "/review", nid());
    eq(pF.sent && pF.text.includes("писать") && !pF.text.includes("―"), "no text-consent → cloze unavailable → reverse gloss «писать» (honest fallback, pt3)");
    const chF = await openChallenge(U.userId);
    eq(chF && chF.prompt_kind === "reverse", "fallback challenge is reverse, not cloze");
    await setConsent(U.userId, "agent_read_texts", true);

    // ── 8) stdout-гигиена ──
    eq(!srv.logs.join("").includes(CLASSC_MARK), "user sentence NOT in server stdout (class-C/D)");
  } catch (e) { failures.push("CRASH: " + ((e && e.stack) || e)); console.log(e && e.stack); }
  finally { await stop(srv.c); stub.close(); try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {} }

  const TOTAL = _n;
  if (failures.length) {
    console.error(`\nsmoke:telegram-cloze FAIL (${TOTAL - failures.length}/${TOTAL})`);
    process.exitCode = 1;
  } else {
    console.log(`\nsmoke:telegram-cloze OK (${TOTAL}/${TOTAL}) — P7.2b cloze:tg: cloze выбран (item_key-parity, expected=surface, anchor, evidence_scope=cloze, class C) · prompt пропуск≠surface + перевод · correct-on-surface + class-C purge на complete · wrong-on-lemma (expected=поверхность) · cloze production D1 Hard · class-C privacy (meta/bot_log/stdout) · revoke mid-flight zero-write+cancel+purge · honest fallback на reverse (не тихий 0)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
