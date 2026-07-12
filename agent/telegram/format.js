"use strict";

// agent/telegram/format.js — CLG-P7.1b Telegram-safe форматирование (спека v2 §3 + адъюдикация).
// Инварианты (критика wf_72c44361):
//   • plain-text, БЕЗ parse_mode (api.sendMessage не ставит) → Telegram не рендерит Markdown/HTML
//     → экранирование не требуется структурно;
//   • splitMessage ЖЁСТКО режет любой сегмент >LIMIT по символьной границе (не только по \n) —
//     иначе одна длинная строка молча трункируется api.slice (критика: content-loss);
//   • форматтеры строят текст ТОЛЬКО из белого списка user-facing полей — НИКОГДА JSON.stringify
//     объекта; сырые id (item_key/pid:/text_key/sentence_id/'ae_'/'at_'/provider/model/construct-id)
//     в вывод не попадают by construction (лемма/титул/счётчик — да);
//   • displayForItemKey-результат, совпадающий с item_key ИЛИ матчащий /^pid:/, = «скрыть»
//     (сырой ключ никогда);
//   • ru/en по языку профиля (критика: смешанный язык).

const LIMIT = 4096;

// Разбиение: сначала по \n\n/\n границам ≤LIMIT; любой сегмент, всё ещё >LIMIT (одна длинная
// строка без переносов), режется по символам. Конкатенация частей == источнику (ничего не теряем).
function splitMessage(text, limit = LIMIT) {
  const s = String(text == null ? "" : text);
  if (s.length <= limit) return s.length ? [s] : [];
  const parts = [];
  let buf = "";
  for (const line of s.split("\n")) {
    const piece = buf ? buf + "\n" + line : line;
    if (piece.length <= limit) { buf = piece; continue; }
    if (buf) { parts.push(buf); buf = ""; }
    if (line.length <= limit) { buf = line; continue; }
    // одна строка длиннее лимита → жёсткая символьная нарезка
    for (let i = 0; i < line.length; i += limit) parts.push(line.slice(i, i + limit));
  }
  if (buf) parts.push(buf);
  return parts;
}

const STR = {
  ru: {
    planEmpty: "На сегодня план пуст — загляни в читальный зал.",
    planMin: "мин", due: "К повторению", dueEmpty: "Сейчас повторять нечего — всё в графике.",
    summaryTitle: "Над чем работаешь", summaryEmpty: "Пока не накоплено — конструкции появятся из планов и объяснений.",
    explainEmpty: "Объяснений пока нет.", explainPurged: "(очищено по отзыву согласия)",
    explainNoAccess: "Объяснения недоступны: доступ наставника к текстам отключён. Включи его на сайте.",
    refused: "Канал отключён. Подключи Telegram заново на сайте.",
    times: "раз",
    // ── P7.2a reverse:tg ──
    revPromptHead: "Проверим активное припоминание.\nНапиши на иврите слово со значением:",
    revPromptFoot: "(ответь на это сообщение · «не знаю» · «не сейчас»)",
    revPlaceholder: "ивритское слово / не знаю / не сейчас",
    revUnavailable: "Тренировка пока недоступна.",
    revBusy: "У тебя уже есть активное задание в другом чате.",
    revNothing: "Сейчас нечего проверять активным припоминанием — загляни в читальный зал.",
    vDeclined: "Тренировку отложил, расписание не изменилось.",
    vCorrect: "✅ Верно. Слово подтверждено в самостоятельном воспроизведении.",
    vSoft: "Почти — в чтении слово знакомо, прогресс не обнуляю, но верну его раньше.",
    vWrong: "Не засчитано.", vExpected: "Ожидалось", vSkip: "Отмечено «не знаю».",
    vSkipSoft: "Отмечено «не знаю». В чтении знакомо — верну слово раньше.",
    vUnclear: "Не разобрал ответ — можно ответить ещё раз.",
    vError: "Не получилось записать — попробуй позже.",
    // ── P7.2b cloze ──
    czPromptHead: "Впиши пропущенное слово (из твоего текста):",
    czPromptFoot: "(ответь словом на пропуск · «не знаю» · «не сейчас»)",
    czPlaceholder: "слово на пропуск / не знаю / не сейчас",
    czCorrect: "✅ Верно — слово подходит по контексту.",
    czWrong: "Не засчитано.", czMissed: "Пропущено",
    // ── P7.2c dictate ──
    diPromptHead: "🎧 Прослушай аудио и напиши это слово на иврите:",
    diPromptFoot: "(ответь на это сообщение · «не знаю» · «не сейчас»)",
    diPlaceholder: "ивритское слово / не знаю / не сейчас",
    diCorrect: "✅ Верно — слово записано правильно на слух.",
    diNear: "Почти — по звучанию написание неоднозначно, ошибку не засчитываю.",
    diWrong: "Не засчитано.",
    // ── P7.3a proactive nudge (класс A — только счётчик, никаких слов/форм) ──
    nudgeDue: "Готово к повторению: ", nudgeDueTail: ". Короткая тренировка (~2 мин) — напиши /review",
    nudgeStop: "Напоминания в Telegram отключены. Команды и тренировки по запросу (/review) остаются доступны.",
    nudgeResume: "Напоминания в Telegram снова включены.",
    // ── P7.3c backoff / mute / notoday (класс A; RETURN_AFTER_GAP БЕЗ count/guilt) ──
    nudgeReturn: "Когда будет удобно, у тебя есть короткая тренировка на пару минут — /review",
    muteOkA: "Напоминания в Telegram отключены на ", muteOkB: " дн. Вернуть — /resume. Тренировки по запросу (/review) работают.",
    muteBad: "Формат: /mute 1..30 (число дней). Например: /mute 3.",
    notodayAck: "Понял — сегодня больше не напомню. Вернусь завтра.",
    notodayDone: "На сегодня напоминаний больше нет — вернусь завтра.",
  },
  en: {
    planEmpty: "Nothing planned today — open the reading room.",
    planMin: "min", due: "To review", dueEmpty: "Nothing to review right now — all on schedule.",
    summaryTitle: "What you’re working on", summaryEmpty: "Nothing yet — constructions come from plans and explanations.",
    explainEmpty: "No explanations yet.", explainPurged: "(cleared after consent withdrawal)",
    explainNoAccess: "Explanations unavailable: mentor’s text access is off. Turn it on the website.",
    refused: "Channel disconnected. Reconnect Telegram on the website.",
    times: "×",
    revPromptHead: "Active recall check.\nWrite in Hebrew the word meaning:",
    revPromptFoot: "(reply to this message · “I don’t know” · “not now”)",
    revPlaceholder: "Hebrew word / I don’t know / not now",
    revUnavailable: "Review is not available yet.",
    revBusy: "You already have an active task in another chat.",
    revNothing: "Nothing to actively recall right now — open the reading room.",
    vDeclined: "Postponed — schedule unchanged.",
    vCorrect: "✅ Correct. Confirmed by your own production.",
    vSoft: "Almost — the word is familiar in reading, no reset, but I’ll bring it back sooner.",
    vWrong: "Not counted.", vExpected: "Expected", vSkip: "Marked “I don’t know”.",
    vSkipSoft: "Marked “I don’t know”. Familiar in reading — I’ll bring it back sooner.",
    vUnclear: "Couldn’t read the answer — you can reply again.",
    vError: "Couldn’t save — try again later.",
    czPromptHead: "Fill in the missing word (from your text):",
    czPromptFoot: "(reply with the missing word · “I don’t know” · “not now”)",
    czPlaceholder: "missing word / I don’t know / not now",
    czCorrect: "✅ Correct — the word fits the context.",
    czWrong: "Not counted.", czMissed: "Missing",
    diPromptHead: "🎧 Listen to the audio and write this word in Hebrew:",
    diPromptFoot: "(reply to this message · “I don’t know” · “not now”)",
    diPlaceholder: "Hebrew word / I don’t know / not now",
    diCorrect: "✅ Correct — spelled right from listening.",
    diNear: "Almost — the sound doesn’t pin the spelling, so I won’t count it as a mistake.",
    diWrong: "Not counted.",
    nudgeDue: "Ready to review: ", nudgeDueTail: ". A short session (~2 min) — send /review",
    nudgeStop: "Telegram reminders are off. Commands and on-demand practice (/review) still work.",
    nudgeResume: "Telegram reminders are back on.",
    nudgeReturn: "Whenever it suits you, there's a short couple-minute session — send /review",
    muteOkA: "Telegram reminders paused for ", muteOkB: " day(s). Resume with /resume. On-demand practice (/review) still works.",
    muteBad: "Format: /mute 1..30 (number of days). E.g. /mute 3.",
    notodayAck: "Got it — no more reminders today. Back tomorrow.",
    notodayDone: "No more reminders today — back tomorrow.",
  },
};
function L(lang) { return STR[lang === "en" ? "en" : "ru"]; }

// лемма для показа: скрыть, если резолвер вернул сырой ключ (item_key) или 'pid:N'
function showLemma(lemma, itemKey) {
  const s = String(lemma == null ? "" : lemma).trim();
  if (!s) return null;
  if (s === String(itemKey || "")) return null;
  if (/^pid:/.test(s)) return null;
  if (/#/.test(s) && s === String(itemKey || "")) return null;
  return s;
}

// ── /plan: секции title + леммы + est_minutes (+ LLM-проза если была) ─────────
function formatPlan(planResult, lang) {
  const t = L(lang);
  const plan = (planResult && planResult.plan) || {};
  const useRu = lang !== "en";
  const lines = [];
  if (planResult && planResult.llm_used && planResult.text) lines.push(String(planResult.text).trim());
  const sections = Array.isArray(plan.sections) ? plan.sections : [];
  for (const s of sections) {
    const title = useRu ? (s.title_ru || s.title_en) : (s.title_en || s.title_ru);
    if (!title) continue;
    const lemmas = (Array.isArray(s.items) ? s.items : [])
      .map((x) => showLemma(x && x.lemma, x && x.item_key)).filter(Boolean);
    lines.push("• " + String(title) + (lemmas.length ? ": " + lemmas.join(" · ") : ""));
    for (const c of (Array.isArray(s.constructs) ? s.constructs : [])) {
      const ct = useRu ? (c.title_ru || c.title_en) : (c.title_en || c.title_ru);
      if (ct) lines.push("  ⚙ " + String(ct));
    }
  }
  if (plan.est_minutes) lines.push("≈ " + plan.est_minutes + " " + t.planMin);
  const body = lines.join("\n").trim();
  return body || t.planEmpty;
}

// ── /due: «К повторению: N» + леммы (displayForItemKey уже резолвлен вызывателем) ─
function formatDue(items, lang) {
  const t = L(lang);
  const list = (Array.isArray(items) ? items : [])
    .map((x) => showLemma(x && x.lemma, x && x.item_key)).filter(Boolean);
  if (!list.length) return t.dueEmpty;
  return t.due + ": " + list.length + "\n" + list.map((w) => "• " + w).join("\n");
}

// ── /summary: титулы конструкций + счётчики (реестровые титулы, класс A) ───────
function formatSummary(summary, lang) {
  const t = L(lang);
  const useRu = lang !== "en";
  const cons = (summary && Array.isArray(summary.constructs)) ? summary.constructs : [];
  if (!cons.length) return t.summaryEmpty;
  const lines = [t.summaryTitle + ":"];
  for (const c of cons) {
    const title = useRu ? (c.title_ru || c.title_en) : (c.title_en || c.title_ru);
    if (!title) continue;
    lines.push("• " + String(title) + " (" + (Number(c.count) || 0) + " " + t.times + ")");
  }
  return lines.join("\n");
}

// ── /explain: лента объяснений (purge-aware; agent_read_texts гейтит контент) ──
// readAllowed=false → НИКАКОГО текста/предложения, только «доступ отключён» (fail-closed,
// независимо от purge). Никогда не выводим anchor.text_key/sentence_id (сырые id).
function formatExplain(listResult, lang, readAllowed) {
  const t = L(lang);
  if (!readAllowed) return t.explainNoAccess;
  const items = (listResult && Array.isArray(listResult.explanations)) ? listResult.explanations : [];
  if (!items.length) return t.explainEmpty;
  const lines = [];
  for (const x of items) {
    if (x.purged) { lines.push("• " + t.explainPurged); continue; }
    const he = x.sentence_he ? String(x.sentence_he).trim() : null;
    const body = x.text ? String(x.text).trim() : null;
    if (he) lines.push("• " + he);
    if (body) lines.push(he ? "  " + body : "• " + body);
  }
  return lines.length ? lines.join("\n") : t.explainEmpty;
}

// ── P7.2a reverse:tg prompt + verdict (безопасно: expected только на wrong; НИКАКИХ id/провенанса) ─
function formatReversePrompt(gloss, lang) {
  const t = L(lang);
  return t.revPromptHead + "\n\n«" + String(gloss || "").trim() + "»\n\n" + t.revPromptFoot;
}
function reversePlaceholder(lang) { return L(lang).revPlaceholder; }
// cloze: body = класс-C блок (blanked предложение + перевод), уже собран в review._capsFor
function formatClozePrompt(body, lang) {
  const t = L(lang);
  return t.czPromptHead + "\n\n" + String(body || "").trim() + "\n\n" + t.czPromptFoot;
}
function clozePlaceholder(lang) { return L(lang).czPlaceholder; }
// dictate: аудио САМО = стимул; caption = только инструкция (никакого текста слова — иначе не диктант)
function formatDictatePrompt(lang) {
  const t = L(lang);
  return t.diPromptHead + "\n\n" + t.diPromptFoot;
}
function dictatePlaceholder(lang) { return L(lang).diPlaceholder; }

// ── P7.2d premium selector — объяснение выбора модальности (класс A, детерминированное) ──────────
// R17: детерминированный СЕЛЕКТОР выбрал модальность И код-причину (chal.select_reason); здесь —
// СТАТИЧНАЯ строка по (reason × kind), НИКОГДА LLM/item_key/лемма/ответ. Показываем ТОЛЬКО для skill-
// driven причин (flagship gap + cloze-на-struggle) — default_* без строки (премиум = редко+точно,
// критика R5). Fail-safe: любой (reason×kind) вне таблицы → "" (не только неизвестный reason).
// Язык — как весь format.js: ru/en (he→ru surface-wide, избегаем mixed-language, критика wf_72c44361).
const SELECT_EXPLAIN = {
  reading_strong_close_dictation_gap: {
    dictate: {
      ru: "Это слово тебе уже знакомо при чтении — проверим, сможешь ли записать его на слух.",
      en: "You already recognize this word in reading — let's see if you can write it from listening.",
    },
  },
  recent_struggle_prefer_cued: {
    cloze: {
      ru: "Недавно это слово давалось трудно — потренируем его в контексте твоего текста.",
      en: "This word was tricky recently — let's practice it in the context of your text.",
    },
  },
};
function selectExplanation(reason, kind, lang) {
  const byKind = SELECT_EXPLAIN[String(reason || "")];
  if (!byKind) return "";
  const s = byKind[String(kind || "")];
  if (!s) return "";
  return (lang === "en" ? s.en : s.ru) || "";
}
// PAS-D2a — «цель сессии»: деривится ИЗ select_reason (персистирован в challenge →
// консистентна на первой доставке И recovery по построению; селектор не тронут).
// ТОЛЬКО default_*-причины (skill-driven reasons уже несут цель своей explain-строкой —
// дубль на 380px запрещён, критика L2-16). БЕЗ чисел (унифицированные счётчики R3.x не лгут).
const GOAL_DUE_BACKLOG = {
  ru: "📚 Цель: разобрать очередь повторения.",
  en: "📚 Goal: work through the review queue.",
};
function goalLine(reason, lang) {
  if (!/^default_/.test(String(reason || ""))) return "";
  return (lang === "en" ? GOAL_DUE_BACKLOG.en : GOAL_DUE_BACKLOG.ru) || "";
}
// префикс prompt объяснением (пустое → goal-строка default_*-причин; иначе prompt как есть)
function withExplanation(promptText, reason, kind, lang) {
  const ex = selectExplanation(reason, kind, lang) || goalLine(reason, lang);
  return ex ? ex + "\n\n" + String(promptText || "") : String(promptText || "");
}
// P7.3a proactive due-нудж: класс A — ТОЛЬКО честный счётчик (== due-кольцу), НИКОГДА слова/формы/id.
function formatDueNudge(count, lang) { const t = L(lang); return t.nudgeDue + Number(count) + t.nudgeDueTail; }
function nudgeStopText(lang) { return L(lang).nudgeStop; }
function nudgeResumeText(lang) { return L(lang).nudgeResume; }
// P7.3c: RETURN_AFTER_GAP — БЕЗ count, guilt-free (запрещено «пропустил»/«давно не»).
function formatReturnNudge(lang) { return L(lang).nudgeReturn; }
function formatMuteOk(days, lang) { const t = L(lang); return t.muteOkA + Number(days) + t.muteOkB; }
function muteBadText(lang) { return L(lang).muteBad; }
function notodayText(lang, alreadyDone) { const t = L(lang); return alreadyDone ? t.notodayDone : t.notodayAck; }
function reviewUnavailable(lang) { return L(lang).revUnavailable; }
function reviewBusy(lang) { return L(lang).revBusy; }
function reviewNothing(lang) { return L(lang).revNothing; }
function verdictDeclined(lang) { return L(lang).vDeclined; }

// verdictFromResult(reviewerResult, {expected, isDontKnow, lang}) → безопасная строка.
// Из reviewer-результата берём ТОЛЬКО decision/grade/recorded/ktiv_gate — никогда item_key/
// challenge_id/sense_id/provenance. expected (display-форма) показываем ЛИШЬ на wrong (обучающая ОС).
function verdictFromResult(r, opts) {
  const o = opts || {}; const t = L(o.lang);
  if (!r || r.ok === false) return t.vError;
  const soft = r.grade === 2;                 // D1-смягчение применилось
  if (r.recorded !== true) {
    // dictate_gate ДО ktiv_gate: на диктанте ktiv-вариант (male/haser) — тоже неоднозначность ЗВУКА
    // (не «верно по смыслу»), поэтому honest diNear, НЕ ложное «✅ подтверждено» (критика wf_596df7f6).
    if (r.dictate_gate) {                        // dictate near_miss: звук не задал написание → не lapse, не успех
      const exp0 = String(o.expected || "").trim();
      return t.diNear + (exp0 ? " " + t.vExpected + ": «" + exp0 + "»." : "");
    }
    if (r.ktiv_gate) return t.vCorrect;        // cloze/reverse: ktiv-вариант ЛЕММЫ — верный по смыслу
    return t.vUnclear;                          // MNAR: empty/unsupported
  }
  if (r.decision === "skip" || o.isDontKnow) return soft ? t.vSkipSoft : t.vSkip;
  if (r.decision === "correct" || r.decision === "accepted_variant") {
    return o.isCloze ? t.czCorrect : (o.isDictate ? t.diCorrect : t.vCorrect);
  }
  // wrong / near_miss → показать ожидаемую форму (класс-безопасно: это правильный ответ, не id).
  // cloze: «Пропущено: <поверхность>»; dictate: «Ожидалось: <написание>»; reverse: «Ожидалось: <лемма>».
  const exp = String(o.expected || "").trim();
  if (o.isCloze) {
    const tail = exp ? " " + t.czMissed + ": «" + exp + "»." : "";
    return (soft ? t.vSoft : t.czWrong) + tail;
  }
  const tail = exp ? " " + t.vExpected + ": «" + exp + "»." : "";
  if (o.isDictate) return (soft ? t.vSoft : t.diWrong) + tail;
  return (soft ? t.vSoft : t.vWrong) + tail;
}

module.exports = {
  splitMessage, formatPlan, formatDue, formatSummary, formatExplain, showLemma,
  refusedText: (lang) => L(lang).refused, LIMIT,
  formatReversePrompt, reversePlaceholder, formatClozePrompt, clozePlaceholder,
  formatDictatePrompt, dictatePlaceholder, selectExplanation, withExplanation, goalLine,
  formatDueNudge, nudgeStopText, nudgeResumeText, formatReturnNudge, formatMuteOk, muteBadText, notodayText,
  reviewUnavailable, reviewBusy, reviewNothing, verdictDeclined, verdictFromResult,
};
