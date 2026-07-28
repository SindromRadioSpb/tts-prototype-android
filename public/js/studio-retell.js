// public/js/studio-retell.js
// W2-S11 «Упростить до моего уровня» — graded-пересказ (дизайн
// STUDIO_INGEST_W2_S11_GRADED_RETELL_DESIGN_2026_07_28.md; замеры
// docs/research/studio-ingest-graded-retell/2026-07-28/README.md).
// Pure-ядро — dual-export (Node-тесты); браузерная часть добавляется ниже по задачам.
(function () {
  "use strict";

  // Зеркало ingest/retell.js LEVELS — совпадение сторожит tests/studioRetell.test.js
  var LEVELS = ["A1", "A2", "B1", "B2"];
  var RETELL_LEVEL_LS_KEY = "studio.retell.level";

  // Смета (R16). Константы из замера long-probe (48 514 ток. входа ← 99 950 символов ⇒
  // ~2.06 символа/токен; выход+thinking ≈ 5К ток.; $0.30/M in, $2.50/M out; wall 26 с).
  var COST = { CHARS_PER_TOKEN: 2.06, OUT_TOKENS: 5000, USD_IN: 0.30, USD_OUT: 2.5,
               SEC_BASE: 12, SEC_PER_10K_TOKENS: 6 };

  function estimateRetellCost(chars) {
    var inTok = Math.ceil((Number(chars) || 0) / COST.CHARS_PER_TOKEN);
    var usd = (inTok * COST.USD_IN + COST.OUT_TOKENS * COST.USD_OUT) / 1e6;
    var seconds = Math.round(COST.SEC_BASE + (inTok / 10000) * COST.SEC_PER_10K_TOKENS);
    return { usd: Math.max(0.01, Math.round(usd * 100) / 100), seconds: seconds };
  }

  // Паспорт для window.v3LastImportMeta. Снимок = ТЕКСТ ПЕРЕСКАЗА (флаг edited в
  // v3AttachImportSource сравнивает поле с ним). audio/captions НЕ копируются: у пересказа
  // нет соответствия исходной записи (R11), а shared-паспорт оригинала нельзя разделять
  // (односторонняя защёлка timingDropReason — дизайн §5.3).
  function buildRetellPassport(o) {
    return {
      kind: "retell",
      source: o.originLabel || o.importSource || o.savedTitle || "",
      method: "gemini-retell",
      model: o.model,
      warnings: [],
      at: new Date().toISOString(),
      textSnapshot: o.retellText,
      retell: {
        v: 1,
        level: o.level,
        derivedFrom: {
          textId: o.savedTextId || null,
          title: o.savedTitle || null,
          importKind: o.importKind || null,
          importSource: o.importSource || null,
        },
        coverage: o.coverage || null,
      },
    };
  }

  // Токен-взвешенная агрегация знакомости. items: [{key, freq}] по КОНТЕНТ-типам текста;
  // knownMap: localDb.getKnownWordStates(); cfg: {KNOWN_STATES, classifyZone} из CorpusVocab
  // (КАНОН-определение уровня — четвёртого не вводим, дизайн §1.1). Пустой профиль/пустой
  // текст → null (честно нет цифры, а не «0%» — урок silent-empty).
  function aggregateCoverage(items, knownMap, cfg) {
    if (!Array.isArray(items) || !items.length || !knownMap || !cfg) return null;
    var anyKnown = false;
    for (var k in knownMap) { if (cfg.KNOWN_STATES[knownMap[k]]) { anyKnown = true; break; } }
    if (!anyKnown) return null;
    var tokens = 0, knownTok = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], c = Number(it.freq) || 0;
      tokens += c;
      var st = knownMap[it.key];
      if (st && cfg.KNOWN_STATES[st]) knownTok += c;
    }
    if (!tokens) return null;
    var pct = knownTok / tokens;
    return { pct: pct, zone: cfg.classifyZone(pct), tokens: tokens, knownTok: knownTok };
  }

  var API = {
    LEVELS: LEVELS, RETELL_LEVEL_LS_KEY: RETELL_LEVEL_LS_KEY,
    estimateRetellCost: estimateRetellCost,
    buildRetellPassport: buildRetellPassport,
    aggregateCoverage: aggregateCoverage,
  };
  if (typeof window !== "undefined") window.StudioRetell = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
