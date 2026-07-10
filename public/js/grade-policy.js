/* grade-policy.js — D1 channel-aware grade policy (UMD, pure). Решение владельца 2026-07-05,
 * AI_MENTOR_RECON_2026_07_04.md §14 D1 (реализация = пре-условие CLG-P6 №3).
 *
 * Продукт-правило: production-провал (диктант/reverse) на РЕЦЕПТИВНО-СИЛЬНОМ слове маппится
 * в Hard(2), не Again(1) — провал письма/производства не стирает рецептивную память, но
 * укорачивает интервал. Один item_key на лемму сохраняется (фасет модальности отклонён);
 * channel-провенанс строки + raw_grade в meta позволяют переинтерпретацию задним числом.
 *
 * Точка применения — ЗАПИСЬ (грейдер), НИКОГДА не replay: fsrs-core.replay / ts-fsrs-референс /
 * golden-вектора не знают о каналах, оракул replay(log)==stored сохраняется по построению.
 * Писатель обязан использовать ОДИН policy-грейд и для шага планировщика, и для log-строки.
 *
 * «Рецептивно-сильное» (детерминированно, из состояния + лога):
 *   (1) память существует (FSRS stability>0 / legacy-расписание), И
 *   (2) есть рецептивное свидетельство (успешный review на НЕ-production канале, либо seed —
 *       импортированная память рецептивного класса), И
 *   (3) слово ещё НЕ доказывало production-компетенцию (нет успешного production-review) —
 *       доказал и потом провалил = настоящий lapse → Again.
 *
 * R17-B: skip НЕ смягчается (явный отказ = честный no-recall); политика — часть
 * детерминированного грейдера, LLM грейд не присваивает. Pure: без DOM/DB/Date.now.
 * Общий модуль клиента и сервера (паттерн fsrs-core): browser <script> + Node require.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.GradePolicy = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var POLICY_VERSION = "d1.v1";

  // Семьи каналов: префикс до ':' (channel пишется как '<канал>[:<режим>]', см. library-ui
  // checkTrainAnswer). Production = требует ПОРОЖДЕНИЯ формы: диктант (слух→письмо) и
  // reverse (RU→HE). Всё остальное (read/listen/reading:tap/null/Studio null/anki null) —
  // рецептивный класс для целей политики.
  var PRODUCTION_PREFIXES = { dictate: 1, reverse: 1, cloze: 1 };
  // context-supported production (reverse-из-смысла, cloze-в-контексте) — доказывает ЛЕММУ/форму-в-
  // контексте, но НЕ unsupported dictate-компетенцию (owner D-1). Успех этих scope НЕ защёлкивает
  // hasProductionSuccess → не отключает будущую D1-мягкость диктанта.
  // P8.4a (+context_supported): hinted-диктант (пользователь запросил «Показать контекст» —
  // глосс+предложение до ответа) НЕ доказывает unsupported production — демоция scope пишется
  // reviewer'ом в момент record (hint_used_at на challenge-строке — один дом факта). МОДУЛЬ
  // КЛИЕНТ-ШАРЕННЫЙ: изменение требует SW CACHE_VERSION bump (stale-клиент латчил бы
  // hasProvenProduction на down-synced hinted-строках — version-skew окно до refresh).
  var CONTEXT_SUPPORTED_SCOPES = { lexeme: 1, cloze: 1, context_supported: 1 };

  function channelPrefix(channel) {
    var s = String(channel == null ? "" : channel);
    var i = s.indexOf(":");
    return (i >= 0 ? s.slice(0, i) : s).trim();
  }
  function isProductionChannel(channel) {
    return PRODUCTION_PREFIXES[channelPrefix(channel)] === 1;
  }
  function channelFamily(channel) {
    return isProductionChannel(channel) ? "production" : "receptive";
  }

  // Память существует? Принимает ОБЕ формы состояния: клиентскую sched-строку
  // ({scheme:'fsrs', stability} либо legacy SM2 {due}) и серверную проекцию ({stability}).
  // Зеркалит resume/seed-условия reader-morph.fsrsStep.
  function hasMemoryState(prev) {
    if (!prev || typeof prev !== "object") return false;
    if (typeof prev.stability === "number" && prev.stability > 0) return true;
    return prev.due != null;   // legacy SM2-строка — память есть, пусть и в старой схеме
  }

  function hasReceptiveEvidence(rows) {
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i]; if (!r) continue;
      if (r.kind === "seed") return true;   // импортированная память (Anki/SM2) = рецептивный класс
      if (r.kind === "review" && Number(r.grade) >= 3 && !isProductionChannel(r.channel)) return true;
    }
    return false;
  }

  // P7.2a (owner evidence_scope='lexeme'): читаем scope строки из meta. lexeme-успех (reverse:tg,
  // «умеет произвести ЛЕММУ из смысла») НЕ доказывает клеточную/парадигменную production-
  // компетенцию. Строки без scope (все до P7.2a) → не-lexeme → do-no-harm.
  function _rowEvidenceScope(r) {
    if (!r) return null;
    if (r.evidence_scope) return r.evidence_scope;
    var m = r.meta_json != null ? r.meta_json : r.meta;
    if (typeof m === "string") { try { m = JSON.parse(m); } catch (_) { m = null; } }
    return (m && m.evidence_scope) || null;
  }
  // context-supported (lexeme/cloze) строка НЕ доказывает unsupported production-компетенцию →
  // должна исключаться из production-статистики gap-сигнала (channelStats) ТОЖЕ, иначе planner
  // productionImbalance разойдётся с hasProductionSuccess (критика wf_cd5d049a).
  function isContextSupportedRow(r) {
    return !!(r && CONTEXT_SUPPORTED_SCOPES[_rowEvidenceScope(r)]);
  }
  function hasProductionSuccess(rows) {
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i]; if (!r) continue;
      if (r.kind === "review" && Number(r.grade) >= 3 && isProductionChannel(r.channel)) {
        // context-supported (lexeme/cloze) успех не отключает D1-Hard-смягчение для dictate (D-1)
        if (CONTEXT_SUPPORTED_SCOPES[_rowEvidenceScope(r)]) continue;
        return true;
      }
    }
    return false;
  }

  // P7.2c owner-решение D-4: latch «доказал production» — MODALITY-СЕГМЕНТИРОВАННЫЙ. dictate-успех
  // (cued аудио-фонологией) НЕ должен сертифицировать более сложный reverse (uncued смысл) → снимать
  // D1-мягкость reverse-провала. Провал на канале C смягчается, пока НЕ доказана unsupported-
  // production В ТОЙ ЖЕ семье C (не context-supported success того же префикса). context-supported
  // (lexeme/cloze) никогда не защёлкивает. Строки без scope (до P7.2a) → не-context → как раньше.
  function hasProvenProduction(rows, channel) {
    var fam = channelPrefix(channel);
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i]; if (!r) continue;
      if (r.kind !== "review" || Number(r.grade) < 3 || !isProductionChannel(r.channel)) continue;
      if (channelPrefix(r.channel) !== fam) continue;                 // другая семья → не доказывает C
      if (CONTEXT_SUPPORTED_SCOPES[_rowEvidenceScope(r)]) continue;   // context-supported не защёлкивает
      return true;
    }
    return false;
  }

  // ЕДИНАЯ точка решения грейда для бинарных (верно/неверно) каналов. Возвращает
  // { grade 1..4, applied (D1 сработал), reason }. Не для Studio-тренера (ручной 1–4 рейтинг).
  function decideGrade(input) {
    var correct = !!(input && input.correct);
    var skipped = !!(input && input.skipped);
    var channel = input ? input.channel : null;
    if (correct) return { grade: 3, applied: false, reason: "correct" };
    var isProd = isProductionChannel(channel);
    var rows = (input && input.rows) || [];
    // D-4: latch проверяется В СЕМЬЕ провалившегося канала (dictate-успех не снимает reverse-мягкость)
    var receptiveStrong = hasMemoryState(input && input.prevState) && hasReceptiveEvidence(rows) && !hasProvenProduction(rows, channel);
    if (skipped) {
      // P7.2a owner-решение #2: skip на PRODUCTION-канале при рецептивной силе идёт тем же
      // D1-путём, что production-провал (Hard) — честное «не знаю» не должно быть СТРОЖЕ ошибки.
      // Рецептивный skip (Зал/Studio) остаётся Again(1) — do-no-harm, gate-consumers-sweep.
      if (isProd && receptiveStrong) return { grade: 2, applied: true, reason: "skip-production-receptive-strong" };
      return { grade: 1, applied: false, reason: "skip" };
    }
    if (!isProd) return { grade: 1, applied: false, reason: "receptive-fail" };
    if (receptiveStrong) return { grade: 2, applied: true, reason: "production-fail-receptive-strong" };
    return { grade: 1, applied: false, reason: "production-fail" };
  }

  // meta_json-провенанс применённой политики (ключи в server META_ALLOW): raw_grade — грейд
  // ДО политики (бинарный вердикт), grade_policy — версия правила, grader — детерминированный.
  function policyMeta(decision) {
    if (!decision || !decision.applied) return {};
    return { raw_grade: 1, grade_policy: POLICY_VERSION, grader: "deterministic" };
  }

  return {
    POLICY_VERSION: POLICY_VERSION,
    channelPrefix: channelPrefix,
    channelFamily: channelFamily,
    isProductionChannel: isProductionChannel,
    hasMemoryState: hasMemoryState,
    hasReceptiveEvidence: hasReceptiveEvidence,
    hasProductionSuccess: hasProductionSuccess,
    hasProvenProduction: hasProvenProduction,
    isContextSupportedRow: isContextSupportedRow,
    decideGrade: decideGrade,
    policyMeta: policyMeta,
  };
});
