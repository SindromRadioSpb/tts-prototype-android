#!/usr/bin/env node
"use strict";
// smoke:telegram-dictate — гейт CLG-P7.2c (dictate:tg, аудио-диктант). НЕЗАВИСИМЫЙ ОРАКУЛ (не тавтология):
//   • assetKey считается ГЕЙТОМ через РЕАЛЬНЫЙ bake-путь (bake-dictate-audio.assetKeyForItem) в ЭТОМ
//     процессе; СЕРВЕР считает свой при выборе — гейт assert'ит, что ПОДАННЫЙ (в sendAudio-URL) ключ
//     БАЙТ-РАВЕН оракульному (config-string-match by construction, две независимые стороны);
//   • ассет сеётся ФАЙЛОМ на том (audio-cache/<key>.mp3 — ПРОД-путь upload'а), НЕ INSERT audio_assets
//     → проверяет file-first hasAsset (иначе вечный тихий-0).
// Кейсы: dictate выбран ТОЛЬКО при файле-ассете (+ served-key==oracle, expected=написание, evidence_
// scope='cell', privacy=A) · correct-on-written · dictate near_miss → recorded:false (звук не задал
// написание) · file_id url→кеш→file_id · D-4 latch: dictate-успех → dictate-провал = Again(1), НО
// reverse-провал после = Hard(2) (dictate не сертифицирует reverse) · нет файла → fallback reverse
// (не тихий 0) · омофон-лемма → dictate НЕ выбран. Флаг AGENT_REVIEW_WRITE=1.

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3326, BASE = "http://127.0.0.1:" + PORT, STUB_PORT = 3327;
const SECRET = "tg-dictate-smoke-0123456789abcd01";
const WEBHOOK_SECRET = "dictate-webhook-secret-0123456789";
const BOT_TOKEN = "888888:MOCKDICT";
const PUBLIC_BASE = "https://audio.test";                   // https base → dictate eligible (keyless URL)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
let _n = 0;
const eq = (c, m) => { _n++; if (!c) { failures.push(m); console.log("  ✗ " + m); } else { console.log("  ✓ " + m.slice(0, 74)); } };
const mark = (s) => console.log("[tg-dictate] " + s);

// dictate-безопасная лемма (омофон-фильтр OK) = ТАКЖЕ reverse-strictSafe → один item ведёт D-4 контраст.
const ITEM_D = "לכתוב#verb", WRITTEN_D = "לכתוב", GLOSS_D = "писать";
const ITEM_H = "לעשות#verb";                                 // омофон (dictateFormForItemKey → null)
const WRONG = "משהו";                                        // явно неверный ответ (не lev1/ktiv/lemma)
const NEAR = "הלכתוב";                                       // lev1-проклитика: near_miss (не ktiv)
const KTIV = "לכתב";                                         // haser-вариант לכתוב: ktiv-candidate near_miss

let scratch, callLogPath, ORACLE = null, _mid = 4000;

// стаб Telegram: sendMessage И sendAudio. Лог method/text/audio/message_id → гейт наблюдает вызовы.
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
        if (isAudio) result.audio = { file_id: "FILEID_" + mid };   // выдаём file_id для кеш-теста
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
function lastCall() { const c = calls(); return c[c.length - 1] || {}; }
function audioCalls() { return calls().filter((c) => c.method === "audio"); }
async function recv(fromId, chatId, text, id, replyTo) {
  const before = callCount();
  await webhook(fromId, chatId, text, id, replyTo);
  for (let i = 0; i < 60 && callCount() === before; i++) await sleep(50);
  const last = lastCall();
  return { sent: callCount() > before, method: last.method, text: last.text || "", audio: last.audio, messageId: last.message_id };
}
function openDb() { const s = require(path.join(REPO, "node_modules", "sqlite3")); return new s.Database(path.join(scratch, "app.db")); }
function dbRun(db, sql, p) { return new Promise((res, rej) => db.run(sql, p || [], function (e) { (e ? rej(e) : res(this)); })); }
function dbAll(db, sql, p) { return new Promise((res, rej) => db.all(sql, p || [], (e, r) => (e ? rej(e) : res(r || [])))); }
async function withDb(fn) { const db = openDb(); try { return await fn(db); } finally { await new Promise((r) => db.close(() => r())); } }

const TG = 74001, CHAT = 84001;
let _u = 8000; const nid = () => ++_u;

const PAST = "2026-06-01T08:00:00.000Z", FUTURE = "2031-01-01T00:00:00.000Z";
const assetPath = (key) => path.join(scratch, "audio-cache", key + ".mp3");
function writeAsset(key) { fs.mkdirSync(path.dirname(assetPath(key)), { recursive: true }); fs.writeFileSync(assetPath(key), Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00])); }
function removeAsset(key) { try { fs.unlinkSync(assetPath(key)); } catch (_) {} }

async function seedItem(db, userId, itemKey, due) {
  await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'seed',?,NULL,'seed-sm2',NULL,'{}',1)`, [userId, "seed:" + itemKey, itemKey, PAST]);
  await dbRun(db, `INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json,schema_version) VALUES (?,?,?,'review',?,3,'room-recall','read:mc','{}',1)`, [userId, "rd:" + itemKey, itemKey, "2026-06-02T08:00:00.000Z"]);
  await dbRun(db, `INSERT INTO srs_projections (user_id,item_key,due,interval_days,reps,lapses,stability,difficulty,reviewed_at,scheme,engine) VALUES (?,?,?,1,1,0,12.0,5.0,?,'fsrs','fsrs6-core-v2')`, [userId, itemKey, due, PAST]);
}
async function seedUser(userId) {
  await withDb(async (db) => {
    await dbRun(db, `INSERT INTO channel_links (id, user_id, channel, telegram_user_id, telegram_chat_id, status, consent_version, confirmed_at) VALUES ('cl_D',?,'telegram',?,?,'active','tg-v1','2026-07-07T00:00:00.000Z')`, [userId, String(TG), String(CHAT)]);
    await dbRun(db, `INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES ('cr_td_D',?,'telegram_delivery',1,'tg-v1')`, [userId]);
    // НЕТ cloud_texts/agent_read_texts → cloze недоступен → dictate/reverse конкурируют (dictate-first)
    await seedItem(db, userId, ITEM_D, PAST);       // dictate-safe + reverse-strictSafe, due
    await seedItem(db, userId, ITEM_H, FUTURE);     // омофон, НЕ due в потоках A–E (включим в F)
  });
}
const resetState = () => withDb(async (db) => { await dbRun(db, `DELETE FROM tg_stimulus_exposure`); await dbRun(db, `UPDATE srs_projections SET due=? WHERE item_key=?`, [PAST, ITEM_D]); });
const setDue = (item, due) => withDb((db) => dbRun(db, `UPDATE srs_projections SET due=? WHERE item_key=?`, [due, item]));
const challengeRows = (userId) => withDb((db) => dbAll(db, `SELECT * FROM agent_challenges WHERE user_id=? ORDER BY created_at`, [userId]));
const reviewRows = (userId) => withDb((db) => dbAll(db, `SELECT * FROM review_log WHERE user_id=? AND source LIKE 'agent:%' ORDER BY reviewed_at`, [userId]));
const fileCacheRows = () => withDb((db) => dbAll(db, `SELECT * FROM telegram_file_cache`, []));
async function openChallenge(userId) { const r = await challengeRows(userId); return r.filter((c) => c.status === "active" || c.status === "processing").slice(-1)[0] || null; }
async function startPrompt(userId) {
  await recv(TG, CHAT, "/review", nid());
  let ch = null;
  for (let i = 0; i < 60; i++) { ch = await openChallenge(userId); if (ch && ch.telegram_prompt_message_id != null) break; await sleep(50); }
  return ch;
}

(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-tg-dictate-"));
  callLogPath = path.join(scratch, "calls.log");

  // ── НЕЗАВИСИМЫЙ ОРАКУЛ: assetKey из РЕАЛЬНОГО bake-пути (в ЭТОМ процессе, отдельно от сервера) ──
  const bake = require(path.join(REPO, "scripts", "premium", "bake-dictate-audio.js"));
  ORACLE = await bake.assetKeyForItem(ITEM_D);
  if (!ORACLE || !/^[a-f0-9]{64}$/.test(ORACLE.assetKey)) { console.error("oracle assetKey failed"); process.exit(1); }
  mark("oracle assetKey (bake-path) = " + ORACLE.assetKey.slice(0, 16) + "…  written=" + ORACLE.written);
  eq(ORACLE.written === WRITTEN_D, "oracle written form = " + WRITTEN_D + " (консонантная лемма)");

  const stub = await startStub();
  const srv = startServer();
  try {
    if (!(await ready(srv))) { console.error("server failed\n" + srv.logs.join("").slice(-1500)); process.exit(1); }
    const U = await login("dictate-U"); await seedUser(U.userId);
    writeAsset(ORACLE.assetKey);                                // сеем ассет ФАЙЛОМ (прод-путь upload'а)

    // ── 1) dictate выбран при файле-ассете; served-key == oracle; caps (класс A, evidence_scope=cell) ──
    mark("dictate selected (file asset) + served-key == oracle");
    const ch1 = await startPrompt(U.userId);
    eq(ch1 && ch1.prompt_kind === "dictate" && ch1.review_mode === "dictate:tg", "dictate challenge (prompt_kind=dictate, dictate:tg)");
    eq(ch1 && ch1.item_key === ITEM_D, "item_key parity (та же проекция)");
    eq(ch1 && ch1.expected_surface === WRITTEN_D, "expected_surface = ПИСЬМЕННАЯ форма «" + WRITTEN_D + "»");
    eq(ch1 && ch1.evidence_scope === "cell", "evidence_scope='cell' (D-4 unsupported production, ЛИТЕРАЛ)");
    eq(ch1 && ch1.stimulus_privacy_class === "A" && ch1.shown_stimulus === ORACLE.assetKey, "shown_stimulus=assetKey, класс A");
    eq(ch1 && ch1.anchor_text_key === null, "no class-C anchor (dictate = класс A)");
    const ac1 = audioCalls();
    eq(ac1.length === 1 && ac1[0].method === "audio", "доставлено через sendAudio (не sendMessage)");
    const servedKey = String((ac1[0] || {}).audio || "").split("/api/audio/")[1] || "";
    eq(servedKey === ORACLE.assetKey, "ПОДАННЫЙ assetKey (sendAudio URL) БАЙТ-РАВЕН оракульному (bake==сервер by construction)");
    eq(!String(ac1[0].text || "").includes(WRITTEN_D), "caption НЕ содержит написание слова (аудио = стимул, не текст)");
    const mid1 = ch1.telegram_prompt_message_id;

    // ── 2) correct-on-written → grade 3, dictate:tg, evidence_scope=cell; class A НЕ чистится ──
    mark("correct-on-written + privacy=A survives complete");
    const a1 = await recv(TG, CHAT, WRITTEN_D, nid(), mid1);
    eq(a1.sent && a1.text.includes("Верно"), "верное написание → ✅");
    let rv = await reviewRows(U.userId);
    eq(rv.length === 1 && Number(rv[0].grade) === 3 && rv[0].channel === "dictate:tg", "one review, grade 3, dictate:tg");
    eq(JSON.parse(rv[0].meta_json || "{}").evidence_scope === "cell", "meta evidence_scope='cell'");
    let chDone = (await challengeRows(U.userId)).slice(-1)[0];
    eq(chDone.status === "completed" && chDone.shown_stimulus === ORACLE.assetKey, "class A: shown_stimulus=assetKey ВЫЖИВАЕТ complete (не purge)");
    eq((await fileCacheRows()).some((r) => r.asset_key === ORACLE.assetKey), "file_id закеширован после доставки по URL");

    // ── 3) file_id reuse: 2-я доставка → sendAudio по file_id (без URL) ──
    mark("file_id reuse (url → cache → file_id)");
    await resetState();
    const ac_before = audioCalls().length;
    const ch3 = await startPrompt(U.userId);
    const ac3 = audioCalls();
    eq(ac3.length === ac_before + 1, "2-я доставка = ещё один sendAudio");
    const a3audio = String((ac3[ac3.length - 1] || {}).audio || "");
    eq(a3audio.startsWith("FILEID_") && !a3audio.includes("/api/audio/"), "2-я доставка по file_id (кеш hit, без повторной URL-загрузки)");
    // закрыть challenge (correct) → 2-й dictate-успех (для D-4 latch ниже)
    await recv(TG, CHAT, WRITTEN_D, nid(), ch3.telegram_prompt_message_id);

    // ── 4a) dictate near_miss (lev1) → recorded:false + ТЕРМИНАЛЕН (no reveal-then-retry) ──
    mark("dictate near_miss (lev1) → recorded:false + terminal (no reveal-retry)");
    await resetState();
    const ch4 = await startPrompt(U.userId);
    const nBefore = (await reviewRows(U.userId)).length;
    const a4 = await recv(TG, CHAT, NEAR, nid(), ch4.telegram_prompt_message_id);
    eq((await reviewRows(U.userId)).length === nBefore, "dictate near_miss НЕ пишет строку (recorded:false)");
    eq(a4.sent && !a4.text.includes("✅"), "near_miss verdict (не ✅ correct)");
    const ch4after = (await challengeRows(U.userId)).find((c) => c.challenge_id === ch4.challenge_id);
    eq(ch4after && ch4after.status !== "active" && ch4after.status !== "processing", "near_miss ТЕРМИНАЛЕН (challenge закрыт, не answerable)");
    // reveal-then-retry: ответить РАСКРЫТЫМ верным написанием на ТОТ ЖЕ prompt → НЕ должно записаться
    await recv(TG, CHAT, WRITTEN_D, nid(), ch4.telegram_prompt_message_id);
    eq((await reviewRows(U.userId)).length === nBefore, "reveal-then-retry заблокирован (нет ложного grade-3 «доказал production»)");

    // ── 4b) dictate ktiv-вариант (haser) → diNear, НЕ ложное «✅ подтверждено» ──
    mark("dictate ktiv variant → diNear (not false vCorrect)");
    await resetState();
    const ch4k = await startPrompt(U.userId);
    const nK = (await reviewRows(U.userId)).length;
    const aK = await recv(TG, CHAT, KTIV, nid(), ch4k.telegram_prompt_message_id);
    eq((await reviewRows(U.userId)).length === nK, "dictate ktiv → recorded:false (не ложный lapse)");
    eq(aK.sent && !aK.text.includes("подтверждено") && aK.text.includes("Почти"), "dictate ktiv verdict = diNear «Почти…», НЕ ложное «✅ подтверждено»");

    // ── 5) D-4 latch: после dictate-успехов dictate-ПРОВАЛ = Again(1) ──
    mark("D-4 latch: dictate success → dictate fail = Again(1)");
    await resetState();
    const ch5 = await startPrompt(U.userId);
    const a5 = await recv(TG, CHAT, WRONG, nid(), ch5.telegram_prompt_message_id);
    const r5 = (await reviewRows(U.userId)).slice(-1)[0];
    eq(r5 && r5.channel === "dictate:tg" && Number(r5.grade) === 1, "dictate fail after dictate success → Again(1) (hasProvenProduction dictate latched)");

    // ── 6) D-4 контраст: НЕТ ассета → fallback reverse (не тихий 0), reverse-провал = Hard(2) ──
    mark("D-4 contrast: no asset → reverse fallback → reverse fail = Hard(2)");
    removeAsset(ORACLE.assetKey);
    await resetState();
    const pF = await recv(TG, CHAT, "/review", nid());
    eq(pF.sent && pF.method === "message" && pF.text.includes(GLOSS_D), "no asset → fallback REVERSE («" + GLOSS_D + "»), не тихий 0, не audio");
    const chR = await openChallenge(U.userId);
    eq(chR && chR.prompt_kind === "reverse", "fallback challenge = reverse (не dictate)");
    const aR = await recv(TG, CHAT, WRONG, nid(), chR.telegram_prompt_message_id);
    const rR = (await reviewRows(U.userId)).slice(-1)[0];
    eq(rR && rR.channel === "reverse:tg" && Number(rR.grade) === 2, "reverse fail ПОСЛЕ dictate-успеха = Hard(2) (dictate НЕ сертифицирует reverse — D-4)");

    // ── 7) омофон-лемма → dictate НЕ выбран (eligibility-фильтр до asset-check) ──
    mark("homophone lemma → dictate NOT selected");
    writeAsset(ORACLE.assetKey);                               // ассет ITEM_D снова есть — но ITEM_D не due
    await setDue(ITEM_D, FUTURE); await setDue(ITEM_H, PAST);  // due = ТОЛЬКО омофон
    await withDb((db) => dbRun(db, `DELETE FROM tg_stimulus_exposure`));
    const acBeforeH = audioCalls().length;
    const pH = await recv(TG, CHAT, "/review", nid());
    eq(audioCalls().length === acBeforeH, "омофон-only due → НЕТ sendAudio (dictate отфильтрован омофон-фильтром)");
    eq(!(pH.method === "audio"), "омофон не доставлен как dictate (reverse/nothing, не audio)");

    // ── 8) stdout-гигиена: сырое слово-стимул не в stdout как утечка (класс A ассет — ок; PII нет) ──
    eq(!srv.logs.join("").includes(WRONG), "user raw answer NOT in server stdout");
  } catch (e) { failures.push("CRASH: " + ((e && e.stack) || e)); console.log(e && e.stack); }
  finally { await stop(srv.c); stub.close(); try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {} }

  const TOTAL = _n;
  if (failures.length) {
    console.error(`\nsmoke:telegram-dictate FAIL (${TOTAL - failures.length}/${TOTAL})`);
    process.exitCode = 1;
  } else {
    console.log(`\nsmoke:telegram-dictate OK (${TOTAL}/${TOTAL}) — P7.2c dictate:tg: dictate выбран ТОЛЬКО при файле-ассете (served-key==oracle by construction, expected=написание, evidence_scope=cell, класс A) · correct-on-written + class-A survives complete · file_id url→кеш→file_id · dictate near_miss recorded:false · D-4 latch (dictate-успех→dictate-провал Again, reverse-провал Hard) · нет ассета→fallback reverse (не тихий 0) · омофон→dictate НЕ выбран`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
