// Лестница повторов для кусков учебной таблицы + честный диагноз «вкладка была в фоне».
//
// Два замера 2026-09-11 у владельца:
//  • у распознавания лестница с ожиданием (4/12/30 с) доводила прогон до конца при 503,
//    а таблица повторяла кусок ДВАЖДЫ ПОДРЯД без паузы — разовая перегрузка стоила куска;
//  • Chrome замораживает фоновую вкладку примерно через 5 минут и убивает висящий запрос.
//    «Сеть подвела» — неверный диагноз: ждать по часам бессмысленно, пока вкладка в фоне.
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ChunkRetry = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  var DELAYS_MS = [4000, 12000, 30000];
  var ATTEMPTS = DELAYS_MS.length + 1;

  function isNetworkFailure(error) {
    if (!error) return false;
    if (Number(error.httpStatus) > 0) return false;
    return /failed to fetch|networkerror|load failed|network request failed|aborted/i.test(String(error.message || "")) ||
      error.name === "TypeError" || error.name === "AbortError" || !error.httpStatus;
  }
  function classCodeOf(error, context) {
    var status = Number(error && error.httpStatus) || 0;
    if (error && error.raw && error.raw.retryable === false) return "NOT_RETRYABLE";
    if (status === 429) return "RATE_LIMITED";
    if (status === 401 || status === 403) return "AUTH";
    if (error && error.jsonDamaged) return "JSON_DAMAGED";
    if (status === 503) return "PROVIDER_OVERLOADED";
    if (status >= 500) return "SERVER_ERROR";
    if (isNetworkFailure(error)) return context && context.hiddenDuringRequest ? "TAB_BACKGROUNDED" : "NETWORK";
    return status >= 400 ? "NOT_RETRYABLE" : "UNKNOWN";
  }
  // Бюджет повторов НЕ один на все беды: полная лестница положена тому, кто сам говорит
  // «вернитесь позже» (503) или чей обрыв внешний (сеть, замороженная вкладка). Повреждённый
  // разбор лечится дроблением куска, а обычная 500 — это, как правило, не «занято»: за ними
  // сохраняется исторический ОДИН повтор, потому что каждая попытка — ОПЛАЧЕННЫЙ вызов.
  function budgetFor(code) {
    if (code === "JSON_DAMAGED" || code === "SERVER_ERROR") return 1;
    return DELAYS_MS.length;
  }
  // Вердикт одной попытки: код, можно ли повторять, сколько ждать и нужно ли сперва дождаться
  // переднего плана. Последняя ступень лестницы обязана быть достижимой (урок ASR 2026-09-11).
  function classify(error, context) {
    var ctx = context || {}, attempt = Math.max(1, Number(ctx.attempt) || 1);
    var code = classCodeOf(error, ctx);
    var hard = code === "RATE_LIMITED" || code === "AUTH" || code === "NOT_RETRYABLE";
    var needsForeground = code === "TAB_BACKGROUNDED";
    var budget = budgetFor(code);
    var attemptsLeft = attempt <= budget;
    var waitMs = code === "JSON_DAMAGED" || needsForeground ? 0 : (attemptsLeft ? DELAYS_MS[attempt - 1] : null);
    return { code: code, retryable: !hard && attemptsLeft, waitMs: attemptsLeft ? waitMs : null,
      needsForeground: needsForeground, attempt: attempt, attempts: budget + 1 };
  }

  // Наблюдатель за вкладкой: помнит, была ли вкладка скрыта ХОТЯ БЫ раз за время запроса —
  // вернувшийся на передний план человек не отменяет того, что заморозка уже случилась.
  function createTabWatch(documentLike) {
    var doc = documentLike || (typeof document !== "undefined" ? document : null);
    var hidden = false, listening = false;
    function onChange() { if (doc && (doc.hidden === true || doc.visibilityState === "hidden")) hidden = true; }
    function listen() {
      if (listening || !doc || typeof doc.addEventListener !== "function") return;
      doc.addEventListener("visibilitychange", onChange); listening = true;
    }
    return {
      begin: function () { hidden = doc ? (doc.hidden === true || doc.visibilityState === "hidden") : false; listen(); },
      sawHidden: function () { return hidden; },
      stop: function () {
        if (!listening || !doc || typeof doc.removeEventListener !== "function") return;
        doc.removeEventListener("visibilitychange", onChange); listening = false;
      },
    };
  }
  function waitForForeground(documentLike) {
    var doc = documentLike || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.addEventListener !== "function") return Promise.resolve();
    if (doc.hidden !== true && doc.visibilityState !== "hidden") return Promise.resolve();
    return new Promise(function (resolve) {
      function onChange() {
        if (doc.hidden === true || doc.visibilityState === "hidden") return;
        doc.removeEventListener("visibilitychange", onChange); resolve();
      }
      doc.addEventListener("visibilitychange", onChange);
    });
  }

  return { DELAYS_MS: DELAYS_MS, ATTEMPTS: ATTEMPTS, budgetFor: budgetFor, classify: classify,
    createTabWatch: createTabWatch, waitForForeground: waitForForeground };
});
