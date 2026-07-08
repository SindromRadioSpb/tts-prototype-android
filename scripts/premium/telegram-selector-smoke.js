#!/usr/bin/env node
"use strict";
// smoke:telegram-selector — гейт CLG-P7.2d premium modality selector. НЕЗАВИСИМЫЙ (сид РАЗНЫХ
// skill-профилей → assert выбранная модальность == политике + объяснение present/класс-безопасно +
// 2-букв due-слово НЕ выбрано dictate + provenance персистирован). Профили (отдельные users):
//   A flagship: reading-strong (net) + НИКОГДА не диктовал + asset + cloze ДОСТУПЕН → dictate
//     (gap перебивает cloze, fork#4) + reason=reading_strong_close_dictation_gap + объяснение в
//     caption + recovery-переотправка сохраняет объяснение (select_reason персистирован).
//   B struggle: reading-strong НО ≥2 провала <24ч + cloze доступен → cloze + recent_struggle_prefer_
//     cued (reverse НЕ зовём «cued» — критика R17).
//   C dictate-history: reading-strong НО уже диктовал (dictate:tg строка) → flagship НЕ фаерит →
//     dictate baseline + reason=default_dictation + БЕЗ объяснения (default_* тихо, критика R5).
//   D 2-букв: גן (pid:2656, len2, dictate-safe под старым предикатом) + asset → dictate НЕ выбран
//     (min≥3) → reverse fallback «сад» (не audio, не тихий-0).
// Класс-A: объяснение/caption/prompt НЕ содержат item_key/pid/леммы/ответа. Флаг AGENT_REVIEW_WRITE=1.

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3330, BASE = "http://127.0.0.1:" + PORT, STUB_PORT = 3331;
const SECRET = "tg-selector-smoke-0123456789abcd01";
const WEBHOOK_SECRET = "selector-webhook-secret-01234567";
const BOT_TOKEN = "999999:MOCKSEL";
const PUBLIC_BASE = "https://audio.test";                    // https base → dictate eligible
const { computeDictateAssetKey } = require(path.join(REPO, "db", "premium", "ttsAssetKey"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
let _n = 0;
const eq = (c, m) => { _n++; if (!c) { failures.push(m); console.log("  ✗ " + m); } else { console.log("  ✓ " + m.slice(0, 74)); } };
const mark = (s) => console.log("[tg-selector] " + s);

// фикстуры (verified 2026-07-08): dictate-safe len5 strictSafe + 2-букв strictSafe
const ITEM_D = "לכתוב#verb", WRITTEN_D = "לכתוב";
const ITEM_2 = "pid:2656", VOC_2 = "גַּן", GLOSS_2 = "сад";     // גן len2 dictate-safe→null post-fix; reverse strictSafe
const SURFACE = "כּוֹתֵב";                                       // AP-форма לכתוב для cloze
const SENT_NIQQUD = "הַיֶּלֶד כּוֹתֵב מִכְתָּב", SENT_PLAIN = "הילד כותב מכתב", SENT_RU = "мальчик пишет письмо";
const EXPLAIN_GAP = "знакомо при чтении";                       // сниппет flagship-объяснения
const EXPLAIN_STRUGGLE = "давалось трудно";                     // сниппет cloze-struggle-объяснения

let scratch, callLogPath, ORACLE_D = null, _mid = 5000;

function startStub() {
  const srv = http.createServer((req, res) => {
    if (req.method === "POST" && /\/bot.+\/send(Message|Audio)$/.test(req.url)) {
      const isAudio = /sendAudio$/.test(req.url);
      let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
        const mid = ++_mid;
        try {
          const j = JSON.parse(body);
          fs.appendFileSync(callLogPath, JSON.stringify({
            method: isAudio ? "audio" : "message", chat: j.chat_id,
            text: j.text || j.caption || "", audio: j.audio || null, message_id: mid,
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
function startServer(extra) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: scratch, AUTH_BOOTSTRAP_SECRET: SECRET,
      TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
      TELEGRAM_API_BASE: "http://127.0.0.1:" + STUB_PORT, TELEGRAM_BOT_USERNAME: "LinguistProMentorBot",
      PUBLIC_BASE_URL: PUBLIC_BASE, TG_CONTENT_MAX: "60", AGENT_REVIEW_WRITE: "1", ...(extra || {}) },
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
  return { userId: j.user.id, cookie: String((sc || []).find((x) => String(x).startsWith("lp_session=")) || "").split(";")[0] }; }
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
  const last = calls()[calls().length - 1] || {};
  return { sent: callCount() > before, method: last.method, text: last.text || "", audio: last.audio, messageId: last.message_id };
}
function openDb() { const s = require(path.join(REPO, "node_modules", "sqlite3")); return new s.Database(path.join(scratch, "app.db")); }
function dbRun(db, sql, p) { return new Promise((res, rej) => db.run(sql, p || [], function (e) { (e ? rej(e) : res(this)); })); }
function dbAll(db, sql, p) { return new Promise((res, rej) => db.all(sql, p || [], (e, r) => (e ? rej(e) : res(r || [])))); }
async function withDb(fn) { const db = openDb(); try { return await fn(db); } finally { await new Promise((r) => db.close(() => r())); } }

let _u = 9000; const nid = () => ++_u;
const PAST = "2026-06-01T08:00:00.000Z";
const recentIso = () => new Date(Date.now() - 3600 * 1000).toISOString();   // <24ч назад (struggle-окно)
const assetPath = (key) => path.join(scratch, "audio-cache", key + ".mp3");
function writeAsset(key) { fs.mkdirSync(path.dirname(assetPath(key)), { recursive: true }); fs.writeFileSync(assetPath(key), Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00])); }

// channel_stats ДЕРИВИРУЕТСЯ РЕАЛЬНЫМ ПРОДЮСЕРОМ (learnerProjectionRepo.channelStats — pure) из
// синтетических рецептив-строк → readingStrong проверяется против ТЕХ ЖЕ имён полей, что пишет прод-
// пайплайн (критика diff wf_8cd4658d: hand-built json не ловит рассинхрон shape — config-string-match).
const LP = require(path.join(REPO, "db", "learnerProjectionRepo"));
const csRow = (ch, grade, i) => ({ id: "csr" + i, kind: "review", grade, channel: ch, reviewed_at: PAST, meta_json: "{}" });
// reading-strong: 2 успешных рецептив-обзора (good=2, again+hard=0, last_grade=3) → flagship-eligible
const CS_READING_STRONG = JSON.stringify(LP.channelStats([csRow("read:mc", 3, 1), csRow("read:mc", 3, 2)]));
// reading-weak: один good (good=1<2) → readingStrong=false → flagship НЕ фаерит (граничный профиль F)
const CS_READING_WEAK = JSON.stringify(LP.channelStats([csRow("read:mc", 3, 3)]));

// сид одного профиля: ОТДЕЛЬНЫЙ user (webhook резолвит по channel_links, сессия не нужна — паттерн
// telegram-pairing-smoke) + link+consents(+cloud/agent-read опц.) + item(проекция+channel_stats).
async function setupUser(label, tg, chat, opts) {
  const o = opts || {};
  const U = { userId: "u_" + label };
  await withDb(async (db) => {
    await dbRun(db, `INSERT INTO users (id, role, display_name) VALUES (?, 'owner', ?)`, [U.userId, "Sel" + label]);
    await dbRun(db, `INSERT INTO channel_links (id, user_id, channel, telegram_user_id, telegram_chat_id, status, consent_version, confirmed_at) VALUES (?,?,'telegram',?,?,'active','tg-v1','2026-07-07T00:00:00.000Z')`, ["cl_" + label, U.userId, String(tg), String(chat)]);
    await dbRun(db, `INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES (?,?,'telegram_delivery',1,'tg-v1')`, ["cr_td_" + label, U.userId]);
    if (o.cloze) {
      await dbRun(db, `INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES (?,?,'cloud_texts',1,'v1')`, ["cr_ct_" + label, U.userId]);
      await dbRun(db, `INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES (?,?,'agent_read_texts',1,'v1')`, ["cr_ar_" + label, U.userId]);
      const payload = JSON.stringify({ texts: [{ text_key: "t1", title: "мой текст", rows: [
        { order_index: 0, hebrew_niqqud: SENT_NIQQUD, hebrew_plain: SENT_PLAIN, russian: SENT_RU }] }] });
      await dbRun(db, `INSERT INTO learner_artifacts (user_id, kind, artifact_key, updated_at, payload_json) VALUES (?,'text_bundle','t1',?,?)`, [U.userId, "2026-07-01T00:00:00.000Z", payload]);
    }
    const item = o.item || ITEM_D;
    await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'seed',?,NULL,'seed-sm2',NULL,'{}',1)`, [U.userId, "seed:" + label, item, PAST]);
    // channel_stats на проекции (readingStrong читает receptive) + due=PAST
    await dbRun(db, `INSERT INTO srs_projections (user_id,item_key,due,interval_days,reps,lapses,stability,difficulty,reviewed_at,scheme,engine,channel_stats_json) VALUES (?,?,?,1,1,0,12.0,5.0,?,'fsrs','fsrs6-core-v2',?)`, [U.userId, item, PAST, PAST, o.channelStats || null]);
    // dictate-history (profile C): реальная dictate:tg строка → hasDictateHistory=true
    if (o.dictateHistory) {
      await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'review',?,3,'agent:mentor','dictate:tg',?,1)`, [U.userId, "dh:" + label, item, "2026-06-03T08:00:00.000Z", JSON.stringify({ evidence_scope: "cell" })]);
    }
    // recent struggle (profile B): ≥2 провала <24ч → recentStruggleKeySet(item)
    if (o.struggle) {
      for (let i = 0; i < 2; i++)
        await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'review',?,1,'room-recall','read:mc','{}',1)`, [U.userId, "st:" + label + ":" + i, item, recentIso()]);
    }
    // profile E teeth: N filler-слов с БОЛЬШИМ числом провалов (3), чтобы item (2 провала) стоял ВНЕ
    // ранжированного топ-20 getRecentStruggles — но uncapped recentStruggleKeySet ловит его всё равно.
    for (let w = 0; w < (o.struggleFillers || 0); w++) {
      for (let i = 0; i < 3; i++)
        await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'review',?,1,'room-recall','read:mc','{}',1)`, [U.userId, "fill:" + label + ":" + w + ":" + i, "filler#" + label + "#" + w, recentIso()]);
    }
  });
  return { userId: U.userId, tg, chat, item: o.item || ITEM_D };
}
const challengeRows = (userId) => withDb((db) => dbAll(db, `SELECT * FROM agent_challenges WHERE user_id=? ORDER BY created_at`, [userId]));
async function openChallenge(userId) { const r = await challengeRows(userId); return r.filter((c) => c.status === "active" || c.status === "processing").slice(-1)[0] || null; }
async function startPrompt(P) {
  await recv(P.tg, P.chat, "/review", nid());
  let ch = null;
  for (let i = 0; i < 60; i++) { ch = await openChallenge(P.userId); if (ch && ch.telegram_prompt_message_id != null) break; await sleep(50); }
  return ch;
}

(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-tg-selector-"));
  callLogPath = path.join(scratch, "calls.log");

  // независимый оракул assetKey для לכתוב (bake-путь) + прямой computeDictateAssetKey для גן (2-букв)
  const bake = require(path.join(REPO, "scripts", "premium", "bake-dictate-audio.js"));
  ORACLE_D = await bake.assetKeyForItem(ITEM_D);
  if (!ORACLE_D || !/^[a-f0-9]{64}$/.test(ORACLE_D.assetKey)) { console.error("oracle assetKey (לכתוב) failed"); process.exit(1); }
  const ASSET_2 = computeDictateAssetKey(VOC_2);               // גן ассет (существует, но min≥3 не выберет)
  eq(await bake.assetKeyForItem(ITEM_2) === null, "bake-оракул: 2-букв גן → null (min≥3 by construction, сервер==bake)");

  const stub = await startStub();
  const srv = startServer();
  try {
    if (!(await ready(srv))) { console.error("server failed\n" + srv.logs.join("").slice(-1500)); process.exit(1); }

    const A = await setupUser("A", 91001, 92001, { item: ITEM_D, channelStats: CS_READING_STRONG, cloze: true });
    const B = await setupUser("B", 91002, 92002, { item: ITEM_D, channelStats: CS_READING_STRONG, cloze: true, struggle: true });
    const C = await setupUser("C", 91003, 92003, { item: ITEM_D, channelStats: CS_READING_STRONG, dictateHistory: true });
    const D = await setupUser("D", 91004, 92004, { item: ITEM_2 });
    // E: uncapped-struggle teeth — item struggling (2 fails) + 22 filler-слов (3 fails каждое) → item вне
    //    ранжированного топ-20, но uncapped struggleSet ловит → flagship suppressed (default_dictation).
    const E = await setupUser("E", 91005, 92005, { item: ITEM_D, channelStats: CS_READING_STRONG, struggle: true, struggleFillers: 22 });
    // F: reading-weak boundary — good=1 (<2) → readingStrong=false → flagship НЕ фаерит.
    const F = await setupUser("F", 91006, 92006, { item: ITEM_D, channelStats: CS_READING_WEAK });
    writeAsset(ORACLE_D.assetKey);                              // ассет לכתוב (A/B/C/E/F-годен)
    writeAsset(ASSET_2);                                        // ассет גן ЕСТЬ → доказываем, что блокирует ДЛИНА, не отсутствие ассета

    // ── A) FLAGSHIP: reading-strong + never-dictated + cloze доступен → DICTATE (gap перебивает cloze) ──
    mark("A flagship: reading→dictation gap dictate перебивает доступный cloze");
    const chA = await startPrompt(A);
    eq(chA && chA.prompt_kind === "dictate" && chA.review_mode === "dictate:tg", "A: dictate выбран (gap), НЕ cloze — хотя cloze доступен (fork#4)");
    eq(chA && chA.select_reason === "reading_strong_close_dictation_gap", "A: select_reason=reading_strong_close_dictation_gap персистирован");
    const cA = calls()[calls().length - 1] || {};
    eq(cA.method === "audio", "A: доставлено sendAudio (dictate)");
    eq(cA.text.includes(EXPLAIN_GAP), "A: caption содержит flagship-объяснение «…" + EXPLAIN_GAP + "…»");
    eq(!cA.text.includes(WRITTEN_D) && !cA.text.includes("#verb") && !cA.text.includes("pid:"), "A: класс-A — объяснение/caption без написания/item_key/pid");

    // A-recovery: повторный /review при открытом challenge → переотправка СОХРАНЯЕТ объяснение (persist)
    mark("A recovery: select_reason персистирован → объяснение и на переотправке");
    const rc = await recv(A.tg, A.chat, "/review", nid());
    eq(rc.method === "audio" && rc.text.includes(EXPLAIN_GAP), "A: recovery-переотправка тоже несёт объяснение (chal.select_reason, не эфемерный pick)");

    // ── B) recent-struggle → cloze (context-cued) + struggle-объяснение (reverse НЕ «cued») ──
    mark("B struggle → cloze cued + recent_struggle_prefer_cued");
    const chB = await startPrompt(B);
    eq(chB && chB.prompt_kind === "cloze", "B: struggle-слово (reading-strong) → cloze (context-cued), flagship guard сработал");
    eq(chB && chB.select_reason === "recent_struggle_prefer_cued", "B: select_reason=recent_struggle_prefer_cued");
    const cB = calls()[calls().length - 1] || {};
    eq(cB.text.includes(EXPLAIN_STRUGGLE), "B: cloze-prompt содержит struggle-объяснение «…" + EXPLAIN_STRUGGLE + "…»");
    eq(cB.text.includes("―") && !cB.text.includes(SURFACE), "B: cloze prompt = пропуск, поверхность скрыта (класс-C)");

    // ── C) dictate-history → flagship НЕ фаерит → dictate baseline default_dictation БЕЗ объяснения ──
    mark("C dictate-history → flagship suppressed → default_dictation (тихо)");
    const chC = await startPrompt(C);
    eq(chC && chC.prompt_kind === "dictate", "C: dictate выбран (baseline, cloze недоступен)");
    eq(chC && chC.select_reason === "default_dictation", "C: reason=default_dictation (НЕ gap — hasDictateHistory уважён, без dictate-loop)");
    const cC = calls()[calls().length - 1] || {};
    eq(cC.method === "audio" && !cC.text.includes(EXPLAIN_GAP), "C: default_dictation → БЕЗ объяснения (default_* тихо, критика R5)");

    // ── D) 2-букв גן + asset → dictate НЕ выбран (min≥3) → reverse fallback «сад» (не audio, не тихий-0) ──
    mark("D 2-букв גן → dictate НЕ выбран (min≥3) → reverse fallback");
    const chD = await startPrompt(D);
    eq(chD && chD.prompt_kind === "reverse", "D: 2-букв → reverse fallback (НЕ dictate, хотя ассет ЕСТЬ — блокирует ДЛИНА)");
    const cD = calls()[calls().length - 1] || {};
    eq(cD.method === "message" && cD.method !== "audio", "D: доставлено sendMessage (не audio)");
    eq(cD.text.includes(GLOSS_2), "D: reverse gloss «" + GLOSS_2 + "» (честный fallback, не тихий-0)");
    eq(!cD.text.includes("pid:") && !cD.text.includes("#"), "D: класс-A — prompt без item_key/pid");

    // ── E) uncapped struggle teeth: item вне ранжированного топ-20, но struggleSet ловит → НЕ flagship ──
    mark("E uncapped struggle: item за топ-20 всё равно suppress flagship");
    const chE = await startPrompt(E);
    eq(chE && chE.prompt_kind === "dictate" && chE.select_reason === "default_dictation",
      "E: item в struggleSet (22 filler'а с бОльшим #провалов) → flagship suppressed → default_dictation (uncapped, НЕ ranked top-20)");
    const cE = calls()[calls().length - 1] || {};
    eq(cE.method === "audio" && !cE.text.includes(EXPLAIN_GAP), "E: без flagship-объяснения (уважён uncapped struggle)");

    // ── F) reading-weak boundary: good=1 (<2) → readingStrong false → flagship НЕ фаерит ──
    mark("F reading-weak boundary: good=1 → НЕ flagship");
    const chF = await startPrompt(F);
    eq(chF && chF.prompt_kind === "dictate" && chF.select_reason === "default_dictation",
      "F: good=1 (<2) → readingStrong false → flagship suppressed → default_dictation (граница good≥2)");
    const cF = calls()[calls().length - 1] || {};
    eq(!cF.text.includes(EXPLAIN_GAP), "F: reading-weak → без flagship-объяснения (не over-claim «знаком при чтении»)");

    // ── non-leak: getDue БЕЗ withChannelStats (HTTP /api/learner/due) НЕ отдаёт channel_stats ──
    mark("non-leak: /api/learner/due (getDue без флага) без channel_stats");
    const owner = await login("owner-nonleak");
    await withDb(async (db) => {
      await dbRun(db, `INSERT OR IGNORE INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'seed',?,NULL,'seed-sm2',NULL,'{}',1)`, [owner.userId, "seed:owner", ITEM_D, PAST]);
      await dbRun(db, `INSERT OR REPLACE INTO srs_projections (user_id,item_key,due,interval_days,reps,lapses,stability,difficulty,reviewed_at,scheme,engine,channel_stats_json) VALUES (?,?,?,1,1,0,12.0,5.0,?,'fsrs','fsrs6-core-v2',?)`, [owner.userId, ITEM_D, PAST, PAST, CS_READING_STRONG]);
    });
    const dueRes = await fetch(BASE + "/api/learner/due?limit=5", { headers: { Cookie: owner.cookie } });
    const dueJson = await dueRes.json().catch(() => ({}));
    const dueRows = (dueJson && dueJson.rows) || [];
    eq(dueRes.status === 200 && dueRows.length >= 1, "non-leak: /api/learner/due 200 + due-строка есть");
    eq(dueRows.every((r) => !("channel_stats" in r)), "non-leak: HTTP due-строки БЕЗ channel_stats (флаг не передан → не течёт в HTTP/LLM-tool)");

    // ── stdout-гигиена: сырых ответов нет; объяснение — статичная строка, не LLM ──
    eq(!srv.logs.join("").includes("pid:2656"), "item_key НЕ в server stdout");
  } catch (e) { failures.push("CRASH: " + ((e && e.stack) || e)); console.log(e && e.stack); }
  finally { await stop(srv.c); stub.close(); try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {} }

  const TOTAL = _n;
  if (failures.length) {
    console.error(`\nsmoke:telegram-selector FAIL (${TOTAL - failures.length}/${TOTAL})`);
    process.exitCode = 1;
  } else {
    console.log(`\nsmoke:telegram-selector OK (${TOTAL}/${TOTAL}) — P7.2d premium selector: flagship reading→dictation gap перебивает доступный cloze (fork#4) + объяснение в caption + recovery сохраняет объяснение (select_reason персистирован) · struggle→cloze cued (reverse НЕ «cued») · dictate-history→default_dictation тихо · 2-букв גן→reverse fallback (min≥3, не тихий-0) · E uncapped-struggle teeth (item вне топ-20 всё равно suppress) · F reading-weak boundary (good≥2) · non-leak (HTTP due без channel_stats) · channel_stats из РЕАЛЬНОГО продюсера · класс-A (без item_key/pid/леммы/ответа)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
