"use strict";

// agent/grader.js — P7.0b: серверный ДЕТЕРМИНИРОВАННЫЙ грейдер (TELEGRAM_P7_DECISION
// §P7.0b; роль grader из §9-скелета). R17-B deterministic-first: LLM здесь НЕ
// импортируется и не участвует в грейде вовсе (llm-assisted feedback — advisory,
// отдельным путём, БЕЗ права на grade).
//
// G0 owner policy (2026-07-15): production families reverse/cloze/dictate are STRICT after
// normalization. The Room's reading-only tolerance lives in reader-morph.acceptReadAnswer and
// requires same-canonical-lemma proof; this server grader never grants that guarded exception to
// production. Normalization = strip niqqud + final-letter fold + spaces (db/hebrewNorm).
//
// СЛОВАРНАЯ ЛЕММА НЕ ПРИНИМАЕТСЯ (адъюдикация критики wf_ccbad91d: замер показал, что
// Зал её и не принимал — в _acceptedSkeletons(built.cz.answer, item.surface) вторым
// аргументом идёт ПОВЕРХНОСТЬ вхождения, не словарная лемма; серверный lemma-accept
// был бы НОВОЙ льготой с lemma-echo эксплойтом: леммы видны в /plan → grade-3-фрод →
// ложный production-успех навсегда отключает D1-смягчение). Ответ-лемма → near_miss
// с reason='lemma-not-form' (честный фидбек «вы написали словарную форму»).
//
// Legacy non-strict proclitic matches are measured-dangerous (20 400 dataset pairs, e.g.
// כלב→לב, מלח→לח). They remain provenance-labelled only for a non-production caller; the v2
// channel gold forbids them for reverse/cloze/dictate. Room read rejects collisions via identity.
//
// Ktiv male/haser в v1 НЕ принимается (замер: Зал не принимает; per-lemma item_key-замок
// не работает — 99.9% глагольных парадигм имеют же-парадигменные י/ו-пары клеток) —
// ktiv-кандидат = near_miss с причиной 'ktiv-candidate'; cell-level апгрейд = развилка.
//
// Грейд: correct/accepted_variant → Good(3); near_miss/wrong → ОБЩИЙ
// grade-policy.decideGrade (D1: production-провал на рецептивно-сильном → Hard(2));
// rows предварительно очищаются от аннулированных (P7.0a withoutAnnulled —
// аннулированное событие не свидетельство). empty/unsupported → gradable=false,
// grade=null: вызыватель НЕ пишет review_log (MNAR: не-ответ ≠ провал; R17-A
// «честно воздержаться»).
//
// Провенанс (7 полей владельца, «через месяц понять, почему засчитано»):
// policy_version · normalizer_version · resolver_version · expected_form_id ·
// matched_variant · decision · reason (+ скелеты для фидбека вызывателю; в
// review_log-meta их не пропустит META_ALLOW — структурная граница классов).
//
// Pure/deterministic: без БД, без IO, без Math.random/Date.now.

const path = require("path");
const hebrewNorm = require(path.join(__dirname, "..", "db", "hebrewNorm"));
const GP = require(path.join(__dirname, "..", "public", "js", "grade-policy.js"));
const FC = require(path.join(__dirname, "..", "public", "js", "fsrs-core.js"));
const LC = require(path.join(__dirname, "..", "public", "js", "lemma-canon.js"));
const keyingService = require(path.join(__dirname, "..", "db", "keyingService"));

const GRADER_VERSION = "agent-grader-v1";
const NORMALIZER_VERSION = "heb-norm-v1";
// Резолвер на грейде НЕ вызывается (v1 скелетный): версии описывают кейер, которым
// был выдан expected.item_key вызывателя; model_version: null = датасет не консультировался.
const RESOLVER_VERSION = Object.freeze({
  resolver: keyingService.RESOLVER_ID, model_version: null, keyer_version: LC.KEYER_VERSION,
});

const HEB_ANY_RE = /[֐-׿]/;
const NON_HEB_LETTER_RE = /[^א-ת\s]/g;

// Нормализация ответа/ожидаемого: hebrewNorm (нику́д + конечные буквы + пробелы),
// затем строб всего, что не ивритская буква (пунктуация/эмодзи/латиница; внутренние
// пробелы сохраняются: «שלום!» == «שלום»).
function normalizeAnswer(s) {
  const n = hebrewNorm.normalizeHebrew(String(s == null ? "" : s));
  return n.replace(NON_HEB_LETTER_RE, "").trim().replace(/\s+/g, " ");
}

// Legacy non-strict helper: one leading ו/ה/ב/כ/ל/ש/מ at length >2. G0 production
// channels never reach this tolerance; Room read uses a separate resolver-backed guard.
function stripProclitic(s) {
  return (s && s.length > 2 && /^[והבכלשמ]/.test(s)) ? s.slice(1) : s;
}

// Принятые скелеты: только форма; non-strict legacy caller may add its one-prefix variant.
// Lemma is not an implicit alternative. strict production means no proclitic variant at all.
function acceptedSkeletons(expected, strict) {
  const map = new Map();
  const n = normalizeAnswer(expected && expected.form);
  if (n) {
    map.set(n, "form");
    if (!strict) {
      const p = stripProclitic(n);
      if (p !== n && !map.has(p)) map.set(p, "form_proclitic");
    }
  }
  return map;
}

// Ограниченный Левенштейн ≤1 (одна замена/вставка/удаление) — для near_miss.
function withinLev1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let diff = 0;
    for (let i = 0; i < la; i++) if (a[i] !== b[i]) { if (++diff > 1) return false; }
    return diff === 1;
  }
  const long = la > lb ? a : b, short = la > lb ? b : a;
  let i = 0, j = 0, skipped = false;
  while (i < long.length && j < short.length) {
    if (long[i] === short[j]) { i++; j++; continue; }
    if (skipped) return false;
    skipped = true; i++;
  }
  return true;
}

// Ktiv-кандидат: скелеты различаются ТОЛЬКО составом י/ו (matres lectionis) —
// строб всех י/ו уравнивает. Только УТОЧНЯЕТ причину провала (успеха не даёт),
// поэтому широкое правило безопасно.
function isKtivCandidate(a, b) {
  if (a === b) return false;
  const strip = (s) => s.replace(/[יו]/g, "");
  const sa = strip(a), sb = strip(b);
  return sa === sb && sa.length > 0;
}

// ── основной вход ────────────────────────────────────────────────────────────
// gradeAnswer({ expected: {form, lemma?, item_key?}, answer, channel, prevState, rows })
// → { decision, gradable, correct, grade, provenance, feedback }
function gradeAnswer(input) {
  const expected = (input && input.expected) || {};
  const rawAnswer = input && input.answer != null ? String(input.answer) : "";
  const channel = input ? input.channel : null;

  const prov = {
    policy_version: GRADER_VERSION,
    normalizer_version: NORMALIZER_VERSION,
    resolver_version: RESOLVER_VERSION,
    expected_form_id: expected.item_key != null ? String(expected.item_key) : null,
    matched_variant: null,
    decision: null,
    reason: null,
  };
  const out = (decision, gradable, correct, grade, reason, extra) => {
    prov.decision = decision;
    prov.reason = reason;
    return Object.assign({ decision, gradable, correct, grade, provenance: prov }, extra || {});
  };

  // Явный отказ («Не знаю» в P7.2) — НЕ уклонение: kind='skip', grade 1, R17-B «отказ
  // не смягчается» (критика: без этого пользователь уклонялся бы от lapse не-ответом).
  if (input && input.skipped) {
    const d = decideBinary(false, channel, input, true);
    return out("skip", true, false, d.grade, "explicit-skip", { policy: d });
  }

  // Owner G0-P (2026-07-15): every production family is strict. reverse asks for the declared
  // lemma, cloze for the source surface, dictate for the written cell; a stripped/swapped prefix
  // is a production miss. Only the reading trainer may use resolver-guarded tolerance.
  const strict = /^(reverse|cloze|dictate)(:|$)/.test(String(channel || ""));
  const accepted = acceptedSkeletons(expected, strict);
  if (!accepted.size) return out("unsupported", false, null, null, "no-expected-form");

  const ans = normalizeAnswer(rawAnswer);
  if (!ans) {
    // сырой ответ был, но без единой ивритской буквы → unsupported (не «пусто»)
    if (String(rawAnswer).trim() && !HEB_ANY_RE.test(rawAnswer)) {
      return out("unsupported", false, null, null, "no-hebrew-in-answer");
    }
    return out("empty", false, null, null, "empty-after-normalization");
  }

  // Exact normalized form is correct. A legacy non-strict caller may reach a provenance-labelled
  // accepted_variant; owner-approved production channels are strict and cannot reach it.
  const ansP = stripProclitic(ans);
  const exact = accepted.get(ans);
  // strict production: a stripped/swapped proclitic is near_miss/wrong, never accepted_variant.
  const viaStrip = (!strict && ansP !== ans) ? accepted.get(ansP) : undefined;
  if (exact === "form") {
    prov.matched_variant = "form";
    const d = decideBinary(true, channel, input);
    return out("correct", true, true, d.grade, "skeleton-match", { policy: d });
  }
  if (exact === "form_proclitic" || viaStrip) {
    prov.matched_variant = exact === "form_proclitic" ? "form_proclitic"
      : (viaStrip === "form" ? "answer_proclitic" : "proclitic_swap");
    const d = decideBinary(true, channel, input);
    return out("accepted_variant", true, true, d.grade, "proclitic-match", { policy: d });
  }

  // провалы: уточнение причины (фидбек), исход — через общий D1-путь
  const skeletons = [...accepted.keys()];
  const formSkel = skeletons.find((k) => accepted.get(k) === "form") || skeletons[0];
  let reason = "no-match";
  // лемма-эхо: ответ = словарная лемма, а не форма (честный фидбек; НЕ успех —
  // lemma-echo эксплойт закрыт; Зал такие ответы тоже проваливает)
  const lemmaN = normalizeAnswer(expected && expected.lemma);
  if (lemmaN && (ans === lemmaN || ansP === lemmaN || ans === stripProclitic(lemmaN))) reason = "lemma-not-form";
  else if (isKtivCandidate(ans, formSkel)) reason = "ktiv-candidate";
  else if (skeletons.some((k) => withinLev1(ans, k))) reason = "lev1";
  const decision = reason === "no-match" ? "wrong" : "near_miss";
  const d = decideBinary(false, channel, input);
  return out(decision, true, false, d.grade, reason, {
    policy: d,
    feedback: { expected_skeleton: formSkel, answer_skeleton: ans },
  });
}

// Единый бинарный грейд-шаг: ОБЩИЙ grade-policy (correct→3; провал→D1 Hard/Again;
// skip→1 без смягчения); rows = ПОЛНЫЙ per-item лог (ВСЕ kinds, включая annul —
// иначе withoutAnnulled no-op и аннулированное свидетельство воскресает, P7.0a).
function decideBinary(correct, channel, input, skipped) {
  const rows = FC.withoutAnnulled((input && input.rows) || []);
  const d = GP.decideGrade({
    correct, skipped: !!skipped, channel,
    prevState: input ? input.prevState : null, rows,
  });
  return {
    grade: d.grade, applied: d.applied, reason: d.reason,
    grade_policy: d.applied ? GP.POLICY_VERSION : null,
    grader: "deterministic",
  };
}

module.exports = {
  GRADER_VERSION, NORMALIZER_VERSION, RESOLVER_VERSION,
  gradeAnswer, normalizeAnswer, acceptedSkeletons, stripProclitic, withinLev1, isKtivCandidate,
};
