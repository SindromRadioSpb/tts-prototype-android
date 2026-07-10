"use strict";

// Gate: smoke:review-session — CLG-P8.3 steps 1-4 (SPEC §7 + адъюдикация §9).
// Teeth (НЕ тавтология): (1) якорное due-слово на ПОЗИЦИИ 45 (за старым MAX_DUE_FORMS=40)
// находится builder'ом — единое окно REVIEW_DUE_WINDOW доказано фикстурой, а не сравнением
// функции с собой; (2) preview-режим write-OFF не создаёт НИ challenge, НИ exposure (счётчики
// независимо по SQL); (3) leak-gate дескриптора: ни item_key, ни expected-surface до ответа;
// (4) allocation reading-first v1 фильтрует ДО селектора; (5) ON-путь: surface-провенанс,
// resume, busy на чужой surface; (6) migration 035 additive; (7) audio-токены не раскрывают assetKey.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const { initDb, getDb, closeDb } = require(path.join(ROOT, "db", "sqlite"));
const { runMigrations } = require(path.join(ROOT, "db", "migrate"));
const identity = require(path.join(ROOT, "db", "identityRepo"));
const reviewSession = require(path.join(ROOT, "agent", "reviewSession"));
const agentChallengeRepo = require(path.join(ROOT, "db", "agentChallengeRepo"));

const ITEM = "לכתוב#verb", SURFACE_FORM = "כּוֹתֵב";
const SENT_NIQQUD = "הַיֶּלֶד כּוֹתֵב מִכְתָּב", SENT_PLAIN = "הילד כותב מכתב", SENT_RU = "мальчик пишет письмо";

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); } };
const dbRun = (sql, p = []) => new Promise((res, rej) => getDb().run(sql, p, function (e) { e ? rej(e) : res(this); }));
const dbGet = (sql, p = []) => new Promise((res, rej) => getDb().get(sql, p, (e, r) => e ? rej(e) : res(r)));

(async () => {
  delete process.env.MINI_APP_REVIEW_WRITE;
  delete process.env.PUBLIC_BASE_URL;   // dictate-tier off → фикстуре нужен только cloze

  const dir = path.join(ROOT, ".tmp", "review-session-smoke");
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, "app.db");
  for (const suf of ["", "-wal", "-shm"]) { try { fs.unlinkSync(dbPath + suf); } catch (_) {} }
  await initDb(dbPath);
  await runMigrations({ migrationsDir: path.join(ROOT, "migrations") });

  // 035 additive
  const cols = await new Promise((r) => getDb().all("PRAGMA table_info(agent_challenges)", [], (e, rows) => r((rows || []).map((c) => c.name))));
  ok("035: agent_challenges.surface", cols.includes("surface"));
  ok("035: agent_challenges.hint_used_at", cols.includes("hint_used_at"));

  const owner = await identity.ensureOwnerUser();
  const userId = owner.id;
  const past = "2026-06-01T08:00:00.000Z";

  // consents (класс C для cloze) + link (ON-путь)
  for (const [k, v] of [["cloud_texts", "v1"], ["agent_read_texts", "v1"], ["telegram_delivery", "tg-v1"]])
    await dbRun(`INSERT INTO consent_records (id,user_id,consent_key,granted,consent_version) VALUES (?,?,?,1,?)`,
      ["cr_" + k, userId, k, v]);
  await dbRun(`INSERT INTO channel_links (id,user_id,channel,telegram_user_id,telegram_chat_id,status,consent_version,confirmed_at)
    VALUES ('cl_rs',?, 'telegram','111','222','active','tg-v1',?)`, [userId, past]);

  // ITEM: lapses=0/stability=12 (НЕ almost-lapsed) + 44 junk-слова с lapses=1 → getDue-порядок
  // (lapses DESC) ставит junk первыми, ITEM = ПОЗИЦИЯ 45 (> старого cap 40) — teeth.
  await dbRun(`INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json) VALUES (?,?,?,'seed',?,NULL,'seed-sm2',NULL,'{}')`, [userId, "seed:" + ITEM, ITEM, past]);
  await dbRun(`INSERT INTO srs_projections (user_id,item_key,due,interval_days,reps,lapses,stability,difficulty,reviewed_at,scheme,engine) VALUES (?,?,?,1,1,0,12.0,5.0,?,'fsrs','fsrs6')`, [userId, ITEM, past, past]);
  for (let i = 0; i < 44; i++) {
    const k = "junk" + String(100 + i) + "#noun";
    await dbRun(`INSERT INTO srs_projections (user_id,item_key,due,interval_days,reps,lapses,stability,difficulty,reviewed_at,scheme,engine) VALUES (?,?,?,1,2,1,0.5,7.0,?,'fsrs','fsrs6')`, [userId, k, past, past]);
  }
  const payload = JSON.stringify({ texts: [{ text_key: "t1", title: "мой текст", rows: [
    { order_index: 0, hebrew_niqqud: SENT_NIQQUD, hebrew_plain: SENT_PLAIN, russian: SENT_RU }] }] });
  await dbRun(`INSERT INTO learner_artifacts (user_id,kind,artifact_key,updated_at,payload_json) VALUES (?,'text_bundle','t1',?,?)`, [userId, past, payload]);

  // ── teeth: единое окно — cloze найден на позиции 45 ──
  const pick = await reviewSession.selectEligible(userId);
  ok("window teeth: cloze found at due-position 45 (>40)", !!pick && pick.kind === "cloze" && pick.item_key === ITEM);
  ok("window teeth: blanked hides the surface", !!pick && String(pick.blanked_he || "").indexOf(SURFACE_FORM) === -1);

  // ── leak-gate дескриптора ──
  const d = reviewSession.buildDescriptor(pick, { lng: "ru", mode: "all_due", preview: true });
  const raw = JSON.stringify(d);
  ok("leak: no item_key in descriptor", raw.indexOf("item_key") === -1 && raw.indexOf(ITEM) === -1);
  ok("leak: expected surface absent pre-answer", raw.indexOf(SURFACE_FORM) === -1);
  ok("leak: blank marker present + ru translation carried", raw.indexOf("―") !== -1 && raw.indexOf(SENT_RU) !== -1);
  ok("descriptor: closed keys", JSON.stringify(Object.keys(d).sort()) === JSON.stringify(["allocation", "explain", "kind", "preview", "select_reason", "stimulus"]));

  // ── preview write-OFF: ничего не создано ──
  const before = await dbGet(`SELECT (SELECT COUNT(*) FROM agent_challenges) c, (SELECT COUNT(*) FROM tg_stimulus_exposure) e`);
  const s1 = await reviewSession.start({ userId, surface: "telegram_miniapp", mode: "all_due", lng: "ru" });
  const after = await dbGet(`SELECT (SELECT COUNT(*) FROM agent_challenges) c, (SELECT COUNT(*) FROM tg_stimulus_exposure) e`);
  ok("preview: descriptor served with preview:true", !!(s1 && s1.ok && s1.descriptor && s1.descriptor.preview === true));
  ok("preview: zero challenge rows created", before.c === after.c);
  ok("preview: zero exposure rows created", before.e === after.e);

  // ── allocation reading-first v1 + continuity-каскад (owner 2026-07-10): здоровый ITEM вне
  // rf-пула → авто-fallback в all_due СРАЗУ отдаёт работу (fallback:true — провенанс честный) ──
  const rf = await reviewSession.start({ userId, surface: "telegram_miniapp", mode: "reading_first", lng: "ru" });
  ok("allocation: rf excludes healthy ITEM → auto-fallback serves it (fallback:true)",
    !!(rf && rf.ok && rf.fallback === true && rf.descriptor && rf.descriptor.kind === "cloze"));
  ok("allocation: almostLapsed predicate (lapses/stability)", reviewSession.almostLapsed({ lapses: 1 }) && reviewSession.almostLapsed({ lapses: 0, stability: 0.4 }) && !reviewSession.almostLapsed({ lapses: 0, stability: 12 }));

  // ── ON-путь (dormant в проде): surface-провенанс + resume + busy ──
  process.env.MINI_APP_REVIEW_WRITE = "1";
  const on1 = await reviewSession.start({ userId, surface: "telegram_miniapp", mode: "all_due", lng: "ru", tgUserId: "111", tgChatId: "222" });
  const chal = await dbGet(`SELECT * FROM agent_challenges WHERE user_id=? AND status IN ('active','processing')`, [userId]);
  ok("ON: challenge created with surface=telegram_miniapp", !!(on1 && on1.challenge_id && chal && chal.surface === "telegram_miniapp"));
  ok("ON: channel suffix :ma (modality prefix preserved)", !!chal && chal.review_mode === "cloze:ma" && chal.prompt_kind === "cloze");
  ok("ON: chat ids populated from link (NOT NULL kept)", !!chal && chal.telegram_chat_id === "222" && chal.telegram_user_id === "111");
  const on2 = await reviewSession.start({ userId, surface: "telegram_miniapp", mode: "all_due", lng: "ru" });
  ok("ON: second start resumes the SAME challenge", !!(on2 && on2.resumed && on2.challenge_id === on1.challenge_id));
  await dbRun(`UPDATE agent_challenges SET surface='telegram_bot' WHERE challenge_id=?`, [on1.challenge_id]);
  const busy = await reviewSession.start({ userId, surface: "telegram_miniapp", mode: "all_due", lng: "ru" });
  ok("ON: bot-surface open challenge → honest busy (no takeover)", !!(busy && busy.busy_surface === "telegram_bot" && !busy.descriptor));
  await agentChallengeRepo.cancelOpenForUser(userId);
  delete process.env.MINI_APP_REVIEW_WRITE;

  // ── surface-валидация + audio-токены ──
  let badSurfaceThrew = false;
  try { await agentChallengeRepo.createChallenge({ userId, surface: "evil", tgUserId: "1", tgChatId: "2", item_key: ITEM, review_mode: "cloze:ma" }); }
  catch (e) { badSurfaceThrew = String(e.message).includes("BAD_CHALLENGE_SURFACE"); }
  ok("createChallenge: unknown surface rejected", badSurfaceThrew);
  // P8.4a: токен несёт привязку {assetKey, userId, challengeId, classC} (§10 п.9)
  const tok = reviewSession.mintAudioToken("someAssetKey123", { userId, challengeId: "ch_x", classC: true });
  const rec = reviewSession.resolveAudioToken(tok);
  ok("audio token: mint→resolve roundtrip (record)", !!rec && rec.assetKey === "someAssetKey123");
  ok("audio token: binding carried (userId/challengeId/classC)", !!rec && rec.userId === userId && rec.challengeId === "ch_x" && rec.classC === true);
  ok("audio token: junk token → null", reviewSession.resolveAudioToken("nope") === null);
  ok("audio token: opaque (no assetKey inside)", tok.indexOf("someAssetKey123") === -1);
  reviewSession.dropTokensForChallenge("ch_x");
  ok("audio token: dropped with its challenge", reviewSession.resolveAudioToken(tok) === null);

  await closeDb();
  console.log(`\nsmoke:review-session — ${pass}/${pass + fail} passed`);
  if (fail) { console.error(`FAILED: ${fail}`); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error("FATAL", e && e.stack || e); process.exit(1); });
