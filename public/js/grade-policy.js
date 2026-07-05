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
  var PRODUCTION_PREFIXES = { dictate: 1, reverse: 1 };

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

  function hasProductionSuccess(rows) {
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i]; if (!r) continue;
      if (r.kind === "review" && Number(r.grade) >= 3 && isProductionChannel(r.channel)) return true;
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
    if (skipped) return { grade: 1, applied: false, reason: "skip" };   // R17-B: отказ не смягчается
    if (!isProductionChannel(channel)) return { grade: 1, applied: false, reason: "receptive-fail" };
    var rows = (input && input.rows) || [];
    if (hasMemoryState(input && input.prevState) && hasReceptiveEvidence(rows) && !hasProductionSuccess(rows)) {
      return { grade: 2, applied: true, reason: "production-fail-receptive-strong" };
    }
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
    decideGrade: decideGrade,
    policyMeta: policyMeta,
  };
});
