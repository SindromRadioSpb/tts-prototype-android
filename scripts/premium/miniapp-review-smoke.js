"use strict";

// Gate: smoke:miniapp-review — CLG-P8.4a write-flow (SPEC §8 + §10). Hermetic temp DB,
// service-level (reviewSession.answer/skip/hint/annul → РЕАЛЬНЫЙ reviewer → РЕАЛЬНЫЙ ingest).
// Challenges создаются НАПРЯМУЮ через repo с контролируемыми caps (write-грань тестируется
// отдельно от селектора — тот гейтится своими наборами). Независимые оракулы: row-counts по
// SQL до/после; ожидаемые meta — руками из seed-плана; replay == персистированный вердикт.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const dir = path.join(ROOT, ".tmp", "miniapp-review-smoke");
fs.mkdirSync(path.join(dir, "audio-cache"), { recursive: true });
process.env.DATA_DIR = dir;                       // ДО require audioRepo (file-first hasAsset)
process.env.AGENT_REVIEW_WRITE = "1";
process.env.MINI_APP_REVIEW_WRITE = "1";

const { initDb, getDb, closeDb } = require(path.join(ROOT, "db", "sqlite"));
const { runMigrations } = require(path.join(ROOT, "db", "migrate"));
const identity = require(path.join(ROOT, "db", "identityRepo"));
const reviewSession = require(path.join(ROOT, "agent", "reviewSession"));
const agentChallengeRepo = require(path.join(ROOT, "db", "agentChallengeRepo"));
const learnerLogRepo = require(path.join(ROOT, "db", "learnerLogRepo"));
const learnerProjectionRepo = require(path.join(ROOT, "db", "learnerProjectionRepo"));
const tgReview = require(path.join(ROOT, "agent", "telegram", "review"));
const { computeAssetKey } = require(path.join(ROOT, "db", "premium", "ttsAssetKey"));

const ITEM = "לכתוב#verb", SURFACE = "כּוֹתֵב";
const BLANKED = "הַיֶּלֶד ――――― מִכְתָּב", SENT_RU = "мальчик пишет письмо";
const FULL_SENT = BLANKED.replace("―――――", SURFACE);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); } };
const dbRun = (sql, p = []) => new Promise((res, rej) => getDb().run(sql, p, function (e) { e ? rej(e) : res(this); }));
const dbGet = (sql, p = []) => new Promise((res, rej) => getDb().get(sql, p, (e, r) => e ? rej(e) : res(r)));
const rowCount = () => dbGet(`SELECT COUNT(*) c FROM review_log WHERE kind IN ('review','skip','annul')`).then((r) => r.c);

function clozeCaps(userId, over) {
  return Object.assign({
    userId, surface: "telegram_miniapp", tgUserId: "111", tgChatId: "222",
    item_key: ITEM, review_mode: "cloze:ma", prompt_kind: "cloze", evidence_scope: "cloze",
    expected_form_id: ITEM, expected_surface: SURFACE,
    anchor_text_key: "t1", anchor_order_index: 0,
    shown_stimulus: BLANKED + "\n" + SENT_RU, stimulus_source: "synced-sentence",
    stimulus_privacy_class: "C", stimulus_hash: "h", accepted_alts: [],
  }, over || {});
}
function dictateCaps(userId, over) {
  return Object.assign({
    userId, surface: "telegram_miniapp", tgUserId: "111", tgChatId: "222",
    item_key: ITEM, review_mode: "dictate:ma", prompt_kind: "dictate", evidence_scope: "cell",
    expected_form_id: ITEM, expected_surface: "כותב", shown_stimulus: "assetKeyX",
    stimulus_source: "dictate-tts", stimulus_privacy_class: "A", stimulus_hash: "h", accepted_alts: [],
  }, over || {});
}
async function freshChallenge(caps) {
  await agentChallengeRepo.cancelOpenForUser(caps.userId);
  const { challenge } = await agentChallengeRepo.createChallenge(caps);
  return challenge;
}

(async () => {
  const dbPath = path.join(dir, "app.db");
  for (const suf of ["", "-wal", "-shm"]) { try { fs.unlinkSync(dbPath + suf); } catch (_) {} }
  await initDb(dbPath);
  await runMigrations({ migrationsDir: path.join(ROOT, "migrations") });

  const cols = await new Promise((r) => getDb().all("PRAGMA table_info(agent_challenges)", [], (e, rows) => r((rows || []).map((c) => c.name))));
  ok("036: hint_kind/result_decision/result_grade", ["hint_kind", "result_decision", "result_grade"].every((c) => cols.includes(c)));

  const owner = await identity.ensureOwnerUser();
  const userId = owner.id;
  const past = "2026-06-01T08:00:00.000Z";
  for (const [k, v] of [["cloud_texts", "v1"], ["agent_read_texts", "v1"], ["telegram_delivery", "tg-v1"]])
    await dbRun(`INSERT INTO consent_records (id,user_id,consent_key,granted,consent_version) VALUES (?,?,?,1,?)`, ["cr_" + k, userId, k, v]);
  await dbRun(`INSERT INTO channel_links (id,user_id,channel,telegram_user_id,telegram_chat_id,status,consent_version,confirmed_at) VALUES ('cl_mr',?,'telegram','111','222','active','tg-v1',?)`, [userId, past]);
  await dbRun(`INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json) VALUES (?,?,?,'seed',?,NULL,'seed-sm2',NULL,'{}')`, [userId, "seed:" + ITEM, ITEM, past]);
  await dbRun(`INSERT INTO srs_projections (user_id,item_key,due,interval_days,reps,lapses,stability,difficulty,reviewed_at,scheme,engine) VALUES (?,?,?,1,1,0,12.0,5.0,?,'fsrs','fsrs6')`, [userId, ITEM, past, past]);
  const payload = JSON.stringify({ texts: [{ text_key: "t1", title: "т", rows: [{ order_index: 0, hebrew_niqqud: FULL_SENT, hebrew_plain: FULL_SENT, russian: SENT_RU }] }] });
  await dbRun(`INSERT INTO learner_artifacts (user_id,kind,artifact_key,updated_at,payload_json) VALUES (?,'text_bundle','t1',?,?)`, [userId, past, payload]);

  const S = "telegram_miniapp";

  // ── 1) happy cloze answer: одна строка, канон-провенанс, reveal, вердикт персистирован ──
  let ch = await freshChallenge(clozeCaps(userId));
  const tiles = require(path.join(ROOT, "agent", "reviewSession"));   // same module (alias)
  const desc = (await reviewSession.start({ userId, surface: S, mode: "all_due", lng: "ru" }));
  {
    // owner А2: тайлы = СКЕЛЕТ-буквы (без огласовок) + 3 дистрактора, шафл
    const RM = require(path.join(ROOT, "public", "js", "reader-morph.js"));
    const skel = Array.from(RM.stripNiqqud(SURFACE));
    const tl = desc && desc.descriptor && desc.descriptor.stimulus.tiles;
    ok("tiles: skeleton+3 distractors, no niqqud marks", Array.isArray(tl) && tl.length === skel.length + 3 &&
      !/[֑-ׇ]/.test(tl.join("")) && skel.every((ch) => tl.includes(ch)));
  }
  const c0 = await rowCount();
  let r = await reviewSession.answer({ userId, surface: S, challengeId: ch.challenge_id, clientNonce: "nonceA111", answer: "כותב", inputMode: "tiles" });
  ok("answer: recorded correct", !!(r && r.ok && r.recorded && r.decision === "correct"));
  ok("answer: exactly one new row", (await rowCount()) === c0 + 1);
  const row1 = await dbGet(`SELECT * FROM review_log WHERE user_id=? AND kind='review' AND channel='cloze:ma'`, [userId]);
  const meta1 = JSON.parse(row1.meta_json);
  ok("row: channel cloze:ma + scope cloze + challenge_id + input_mode=tiles",
    meta1.evidence_scope === "cloze" && meta1.challenge_id === ch.challenge_id && meta1.input_mode === "tiles");
  ok("reveal: full sentence with target restored", !!(r.reveal && r.reveal.sentence_he === FULL_SENT && r.reveal.sentence_ru === SENT_RU));
  const chDone = await dbGet(`SELECT * FROM agent_challenges WHERE challenge_id=?`, [ch.challenge_id]);
  ok("verdict persisted in complete()", chDone.status === "completed" && chDone.result_decision === "correct" && Number(chDone.result_grade) >= 3);

  // ── 2) lost-response replay: тот же nonce → реконструкция, ноль новых строк ──
  r = await reviewSession.answer({ userId, surface: S, challengeId: ch.challenge_id, clientNonce: "nonceA111", answer: "כותב" });
  ok("replay: reconstructed verdict, no reveal", !!(r && r.ok && r.replayed && r.decision === "correct" && r.reveal === null));
  ok("replay: zero new rows", (await rowCount()) === c0 + 1);
  // чужой nonce на completed → CHALLENGE_CLOSED
  r = await reviewSession.answer({ userId, surface: S, challengeId: ch.challenge_id, clientNonce: "nonceB222", answer: "x" });
  ok("closed + foreign nonce → CHALLENGE_CLOSED", !!(r && r.ok === false && r.error === "CHALLENGE_CLOSED"));

  // ── 3) surface-binding: бот-challenge не отвечаем из miniapp ──
  ch = await freshChallenge(clozeCaps(userId, { surface: "telegram_bot", review_mode: "cloze:tg" }));
  const c1 = await rowCount();
  r = await reviewSession.answer({ userId, surface: S, challengeId: ch.challenge_id, clientNonce: "nonceC333", answer: "כותב" });
  ok("bot-surface challenge → CHALLENGE_SURFACE_MISMATCH, zero-write", !!(r && r.error === "CHALLENGE_SURFACE_MISMATCH") && (await rowCount()) === c1);
  const chBot = await dbGet(`SELECT status FROM agent_challenges WHERE challenge_id=?`, [ch.challenge_id]);
  ok("bot-surface challenge untouched (active)", chBot.status === "active");

  // ── 4) бот НЕ редоставляет :ma-challenge (гвард startReview) ──
  ch = await freshChallenge(clozeCaps(userId));   // surface=miniapp
  const sr = await tgReview.startReview({ userId, tgUserId: "111", chatId: "222" });
  ok("bot startReview on :ma challenge → busy note, no delivery", !!(sr && sr.served === false && sr.note));
  const chMa = await dbGet(`SELECT status, telegram_prompt_message_id FROM agent_challenges WHERE challenge_id=?`, [ch.challenge_id]);
  ok("bot guard: :ma challenge untouched (no prompt id)", chMa.status === "active" && chMa.telegram_prompt_message_id == null);

  // ── 5) RETRY_WITH_ORIGINAL: processing с чужим attempt ──
  await agentChallengeRepo.claimForAttempt(userId, ch.challenge_id, "maSOMEOTHERATTEMPT0000000000000000000000");
  r = await reviewSession.answer({ userId, surface: S, challengeId: ch.challenge_id, clientNonce: "nonceD444", answer: "כותב" });
  ok("processing + foreign attempt → RETRY_WITH_ORIGINAL", !!(r && r.error === "RETRY_WITH_ORIGINAL"));
  await agentChallengeRepo.cancelOpenForUser(userId);

  // ── 6) hint context (dictate): payload-first, демоция ТОЛЬКО при hint ──
  ch = await freshChallenge(dictateCaps(userId));
  let h = await reviewSession.hint({ userId, surface: S, challengeId: ch.challenge_id, kind: "context" });
  ok("hint context: payload (gloss|masked) served", !!(h && h.ok && (h.gloss || h.masked_he)));
  ok("hint context: masked, not full sentence", !h.masked_he || h.masked_he.indexOf(SURFACE) === -1);
  const chH = await dbGet(`SELECT hint_used_at, hint_kind FROM agent_challenges WHERE challenge_id=?`, [ch.challenge_id]);
  ok("hint latched server-side", !!chH.hint_used_at && chH.hint_kind === "context");
  h = await reviewSession.hint({ userId, surface: S, challengeId: ch.challenge_id, kind: "context" });
  ok("repeat hint: idempotent re-resolution", !!(h && h.ok));
  r = await reviewSession.answer({ userId, surface: S, challengeId: ch.challenge_id, clientNonce: "nonceE555", answer: "כותב" });
  const rowH = await dbGet(`SELECT meta_json FROM review_log WHERE user_id=? AND channel='dictate:ma' ORDER BY ingested_at DESC LIMIT 1`, [userId]);
  const metaH = JSON.parse(rowH.meta_json);
  ok("hinted dictate → evidence_scope context_supported + hint_kind in canon",
    !!(r && r.ok && r.recorded) && metaH.evidence_scope === "context_supported" && metaH.hint_kind === "context");
  // потребители grade-policy: hinted-успех НЕ production-доказательство
  const GP = require(path.join(ROOT, "public", "js", "grade-policy.js"));
  ok("grade-policy: hinted row is context-supported (no production latch)",
    GP.isContextSupportedRow({ meta_json: rowH.meta_json }) === true &&
    GP.hasProductionSuccess([{ kind: "review", grade: 3, channel: "dictate:ma", meta_json: rowH.meta_json }]) === false);

  // ── 7) non-hinted dictate → scope cell (канон не размывается) ──
  ch = await freshChallenge(dictateCaps(userId));
  r = await reviewSession.answer({ userId, surface: S, challengeId: ch.challenge_id, clientNonce: "nonceF666", answer: "כותב" });
  const rowC = await dbGet(`SELECT meta_json FROM review_log WHERE user_id=? AND channel='dictate:ma' ORDER BY ingested_at DESC LIMIT 1`, [userId]);
  ok("non-hinted dictate → scope cell", !!(r && r.ok) && JSON.parse(rowC.meta_json).evidence_scope === "cell");

  // ── 8) hint-гарды ──
  ch = await freshChallenge(dictateCaps(userId));
  h = await reviewSession.hint({ userId, surface: S, challengeId: ch.challenge_id, kind: "sentence_audio" });
  ok("hint kind mismatch (audio on dictate) → HINT_KIND_MISMATCH", !!(h && h.error === "HINT_KIND_MISMATCH"));
  await agentChallengeRepo.claimForAttempt(userId, ch.challenge_id, "maCLAIMEDATTEMPT111111111111111111111111");
  h = await reviewSession.hint({ userId, surface: S, challengeId: ch.challenge_id, kind: "context" });
  ok("hint after claim → HINT_TOO_LATE", !!(h && h.error === "HINT_TOO_LATE"));
  await agentChallengeRepo.cancelOpenForUser(userId);
  ch = await freshChallenge(clozeCaps(userId, { surface: "telegram_bot", review_mode: "cloze:tg" }));
  h = await reviewSession.hint({ userId, surface: S, challengeId: ch.challenge_id, kind: "sentence_audio" });
  ok("hint on bot-surface → HINT_NOT_AVAILABLE", !!(h && h.error === "HINT_NOT_AVAILABLE"));
  await agentChallengeRepo.cancelOpenForUser(userId);

  // ── 9) sentence_audio hint (cloze): class-C токен по запечённому ассету предложения ──
  const assetKey = computeAssetKey({ text: FULL_SENT, ttsProfile: { language: "he-IL", voiceName: "he-IL-Wavenet-A", speakingRate: 1.0, pitch: 0.0 }, assetType: "row" });
  fs.writeFileSync(path.join(dir, "audio-cache", assetKey + ".mp3"), Buffer.from("fake-mp3"));
  ch = await freshChallenge(clozeCaps(userId));
  h = await reviewSession.hint({ userId, surface: S, challengeId: ch.challenge_id, kind: "sentence_audio" });
  ok("sentence_audio hint: token served (asset exists)", !!(h && h.ok && h.audio_token));
  const tokRec = h && h.audio_token ? reviewSession.resolveAudioToken(h.audio_token) : null;
  ok("sentence_audio token: classC + user-bound + challenge-bound",
    !!tokRec && tokRec.classC === true && tokRec.userId === userId && tokRec.challengeId === ch.challenge_id);
  // scope у cloze НЕ демоцируется sentence_audio-хинтом, но hint_kind в каноне
  r = await reviewSession.answer({ userId, surface: S, challengeId: ch.challenge_id, clientNonce: "nonceG777", answer: "כותב" });
  const rowA = await dbGet(`SELECT meta_json FROM review_log WHERE user_id=? AND channel='cloze:ma' ORDER BY ingested_at DESC LIMIT 1`, [userId]);
  const metaA = JSON.parse(rowA.meta_json);
  ok("audio-hinted cloze: scope stays cloze, hint_kind audited", metaA.evidence_scope === "cloze" && metaA.hint_kind === "sentence_audio");
  ok("terminal closed its tokens", reviewSession.resolveAudioToken(h.audio_token) === null);

  // ── 10) released (MNAR): без reveal, challenge жив, ретрай новым nonce → одна строка ──
  ch = await freshChallenge(clozeCaps(userId));
  const c2 = await rowCount();
  r = await reviewSession.answer({ userId, surface: S, challengeId: ch.challenge_id, clientNonce: "nonceH888", answer: "abc" });
  ok("MNAR answer: recorded:false, NO reveal", !!(r && r.ok && r.recorded === false && r.reveal == null));
  ok("MNAR: zero rows, challenge alive", (await rowCount()) === c2 && (await dbGet(`SELECT status FROM agent_challenges WHERE challenge_id=?`, [ch.challenge_id])).status === "active");
  r = await reviewSession.answer({ userId, surface: S, challengeId: ch.challenge_id, clientNonce: "nonceI999", answer: "כותב" });
  ok("retry with NEW nonce after release → one row", !!(r && r.ok && r.recorded) && (await rowCount()) === c2 + 1);

  // ── 11) skip: строка kind=skip, терминал ──
  ch = await freshChallenge(clozeCaps(userId));
  r = await reviewSession.skip({ userId, surface: S, challengeId: ch.challenge_id, clientNonce: "nonceJ000" });
  const rowS = await dbGet(`SELECT kind FROM review_log WHERE user_id=? ORDER BY ingested_at DESC LIMIT 1`, [userId]);
  ok("skip: recorded row kind=skip + terminal", !!(r && r.ok && r.recorded) && rowS.kind === "skip");

  // ── 12) annul-гард ──
  r = await reviewSession.annul({ userId, surface: S, reviewRowId: row1.id, reason: "user_undo" });
  ok("annul own :ma row → ok", !!(r && r.ok && r.recorded));
  // :tg-строка (бот): сеем challenge bot-surface + строку с его challenge_id
  const chTg = await freshChallenge(clozeCaps(userId, { surface: "telegram_bot", review_mode: "cloze:tg" }));
  await dbRun(`INSERT INTO review_log (user_id,id,item_key,kind,reviewed_at,grade,source,channel,meta_json) VALUES (?,?,?,'review',?,3,'agent:review','cloze:tg',?)`,
    [userId, "tgrow1", ITEM, new Date().toISOString(), JSON.stringify({ challenge_id: chTg.challenge_id, evidence_scope: "cloze", keyer_version: 1 })]);
  await learnerProjectionRepo.recomputeForKeys(userId, [ITEM]);   // прямой INSERT мимо ingest → выровнять проекцию (оракул ниже)
  r = await reviewSession.annul({ userId, surface: S, reviewRowId: "tgrow1", reason: "user_undo" });
  ok("annul bot-surface row → MINIAPP_ANNUL_NOT_ALLOWED", !!(r && r.error === "MINIAPP_ANNUL_NOT_ALLOWED"));
  await agentChallengeRepo.cancelOpenForUser(userId);

  // ── 13) write-off (флаги) ──
  delete process.env.MINI_APP_REVIEW_WRITE;
  ch = await freshChallenge(clozeCaps(userId));
  const c3 = await rowCount();
  r = await reviewSession.answer({ userId, surface: S, challengeId: ch.challenge_id, clientNonce: "nonceK111", answer: "כותב" });
  ok("MINI_APP_REVIEW_WRITE off → 403-код, zero-write", !!(r && r.error === "MINIAPP_REVIEW_WRITE_OFF") && (await rowCount()) === c3);
  process.env.MINI_APP_REVIEW_WRITE = "1";
  delete process.env.AGENT_REVIEW_WRITE;
  r = await reviewSession.annul({ userId, surface: S, reviewRowId: row1.id, reason: "x" });
  ok("AGENT_REVIEW_WRITE off → annul тоже заперт (двойной гейт)", !!(r && r.error === "MINIAPP_REVIEW_WRITE_OFF"));
  process.env.AGENT_REVIEW_WRITE = "1";

  // ── 14) down-sync источник + оракул ──
  const log = await learnerLogRepo.readLog(userId, { afterRid: 0, limit: 100 });
  const maRows = (log.rows || log || []).filter((x) => String(x.channel || "").endsWith(":ma"));
  ok("down-sync: :ma rows visible via readLog (rowid cursor)", maRows.length >= 3);
  const oracle = await learnerProjectionRepo.oracle(userId, {});
  ok("oracle clean: state == replay(log)", !!oracle && oracle.checked > 0 && oracle.mismatched === 0 && oracle.missing === 0);

  await closeDb();
  console.log(`\nsmoke:miniapp-review — ${pass}/${pass + fail} passed`);
  if (fail) { console.error(`FAILED: ${fail}`); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error("FATAL", e && e.stack || e); process.exit(1); });
