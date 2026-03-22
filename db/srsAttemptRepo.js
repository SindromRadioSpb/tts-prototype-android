"use strict";

const crypto = require("crypto");

const { getDb } = require("./sqlite");
const { getCardSnapshotById } = require("./srsRepo");
const { normalizeHebrew } = require("./hebrewNorm");

function uuidv4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeLatinLike(value) {
  return normalizeWhitespace(String(value || "").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ""));
}

function normalizeAnswerByLang(value, lang) {
  const v = String(value || "");
  if (String(lang || "").toLowerCase() === "he") {
    return normalizeWhitespace(normalizeHebrew(v).replace(/[^\p{Script=Hebrew}\p{N}\s]+/gu, ""));
  }
  return normalizeLatinLike(v);
}

function tokenizeForCloze(value, lang) {
  const normalized = normalizeAnswerByLang(value, lang);
  return normalized.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function selectClozeToken(value, lang) {
  const raw = normalizeWhitespace(String(value || ""));
  if (!raw) return { prompt: "", answer: "", index: -1 };

  const rawTokens = raw.split(/\s+/).filter(Boolean);
  if (!rawTokens.length) return { prompt: raw, answer: "", index: -1 };

  let bestIndex = 0;
  let bestLength = 0;
  for (let i = 0; i < rawTokens.length; i += 1) {
    const candidateNorm = tokenizeForCloze(rawTokens[i], lang).join(" ");
    const score = candidateNorm.length;
    if (score > bestLength) {
      bestLength = score;
      bestIndex = i;
    }
  }

  const answer = rawTokens[bestIndex] || "";
  const masked = rawTokens.map((item, idx) => (idx === bestIndex ? "____" : item)).join(" ");
  return { prompt: masked, answer, index: bestIndex };
}

function buildTrainerPayload(snapshot, mode = "reveal") {
  const s = snapshot && snapshot.sentence ? snapshot.sentence : {};
  const card = snapshot && snapshot.card ? snapshot.card : {};
  const template = card && card.template ? card.template : {};
  const code = String(template.code || "ru_to_he");
  const normalizedMode = String(mode || "reveal").trim().toLowerCase();

  let promptText = "";
  let promptLang = template.promptLang || "ru";
  let answerText = "";
  let answerLang = template.answerLang || "he";
  let supportText = "";
  let cloze = null;

  if (code === "he_to_ru") {
    promptText = s.heNiqqud || s.hePlain || "";
    promptLang = "he";
    answerText = s.ru || "";
    answerLang = "ru";
    supportText = s.translit || "";
  } else if (code === "audio_to_he") {
    promptText = s.audioAssetKey || "";
    promptLang = "audio";
    answerText = s.heNiqqud || s.hePlain || "";
    answerLang = "he";
    supportText = s.ru || "";
  } else {
    promptText = s.ru || "";
    promptLang = "ru";
    answerText = s.heNiqqud || s.hePlain || "";
    answerLang = "he";
    supportText = s.translit || "";
  }

  if (normalizedMode === "listening") {
    promptText = s.audioAssetKey || promptText;
    promptLang = s.audioAssetKey ? "audio" : promptLang;
  }

  if (normalizedMode === "cloze") {
    cloze = selectClozeToken(answerText, answerLang);
    promptText = cloze.prompt || answerText;
  }

  return {
    mode: normalizedMode,
    templateCode: code,
    promptText,
    promptLang,
    answerText,
    answerLang,
    supportText,
    audioAssetKey: s.audioAssetKey || "",
    cloze,
  };
}

function evaluateAttempt(snapshot, { attemptType, answer }) {
  const payload = buildTrainerPayload(snapshot, attemptType);
  const mode = String(attemptType || "typing").trim().toLowerCase();
  if (!["typing", "listening", "cloze"].includes(mode)) throw new Error("BAD_ATTEMPT_TYPE");

  const userAnswer = normalizeWhitespace(answer);
  if (!userAnswer) throw new Error("BAD_ATTEMPT_ANSWER");

  const expectedRaw = mode === "cloze" ? (payload.cloze && payload.cloze.answer) || "" : payload.answerText;
  const normalizedUser = normalizeAnswerByLang(userAnswer, payload.answerLang);
  const normalizedExpected = normalizeAnswerByLang(expectedRaw, payload.answerLang);

  return {
    mode,
    payload,
    userAnswer,
    normalizedUser,
    normalizedExpected,
    isCorrect: !!normalizedUser && normalizedUser === normalizedExpected,
  };
}

async function logAttempt({
  sessionId = null,
  cardId,
  attemptType,
  userAnswer,
  normalizedAnswer,
  normalizedExpected,
  isCorrect,
  latencyMs = null,
  meta = {},
}) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  await dbRun(
    db,
    `
    INSERT INTO srs_attempts (
      id, session_id, card_id, attempt_type, user_answer,
      normalized_answer, normalized_expected, is_correct, latency_ms, meta_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
    `,
    [
      uuidv4(),
      sessionId ? String(sessionId) : null,
      String(cardId),
      String(attemptType),
      userAnswer == null ? null : String(userAnswer),
      normalizedAnswer == null ? null : String(normalizedAnswer),
      normalizedExpected == null ? null : String(normalizedExpected),
      isCorrect ? 1 : 0,
      latencyMs == null ? null : Math.max(0, Number(latencyMs) || 0),
      JSON.stringify(meta && typeof meta === "object" ? meta : {}),
    ]
  );
}

async function checkAttempt({ sessionId = null, cardId, attemptType, answer, latencyMs = null }) {
  const snapshot = await getCardSnapshotById(cardId);
  if (!snapshot || !snapshot.card) throw new Error("CARD_NOT_FOUND");

  const evaluated = evaluateAttempt(snapshot, { attemptType, answer });
  await logAttempt({
    sessionId,
    cardId,
    attemptType: evaluated.mode,
    userAnswer: evaluated.userAnswer,
    normalizedAnswer: evaluated.normalizedUser,
    normalizedExpected: evaluated.normalizedExpected,
    isCorrect: evaluated.isCorrect,
    latencyMs,
    meta: {
      templateCode: evaluated.payload.templateCode,
      promptLang: evaluated.payload.promptLang,
      answerLang: evaluated.payload.answerLang,
      clozeIndex: evaluated.payload.cloze ? evaluated.payload.cloze.index : null,
    },
  });

  return {
    ok: true,
    cardId: snapshot.card.id,
    attemptType: evaluated.mode,
    isCorrect: evaluated.isCorrect,
    normalizedAnswer: evaluated.normalizedUser,
    normalizedExpected: evaluated.normalizedExpected,
    trainer: {
      mode: evaluated.payload.mode,
      templateCode: evaluated.payload.templateCode,
      promptText: evaluated.payload.promptText,
      promptLang: evaluated.payload.promptLang,
      answerLang: evaluated.payload.answerLang,
      supportText: evaluated.payload.supportText,
      audioAssetKey: evaluated.payload.audioAssetKey,
      clozePrompt: evaluated.payload.cloze ? evaluated.payload.cloze.prompt : null,
    },
  };
}

module.exports = {
  buildTrainerPayload,
  checkAttempt,
  logAttempt,
  normalizeAnswerByLang,
};
