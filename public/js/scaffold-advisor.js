// public/js/scaffold-advisor.js — PAS-D2b: решение «какое scaffold-предложение показать»
// (спека PAS_SLICE_D_SPEC_2026_07_12 v2). PURE, DOM-free — node-гейт smoke:scaffold-advisor.
//
// Доктрина (R5/R11): леса сходят ТОЛЬКО по предложению, НИКОГДА молча; одно предложение
// за сессию чтения; отказ/принятие запоминаются one-time ключами (ветеранов не переспрашиваем);
// undo не взводит повторный показ.
//
// Правило N (существующее W5, гейт fadeGraduationReady НЕ меняется): огласовка full→adaptive.
// Правило R (новое): перевод show→reveal — ТОЛЬКО на corpus-тексте в зоне in/easy И БЕЗ
// loadFlag (второй канал честности: matched-only «льстит» текстам с именами/архаикой —
// предложить «читать по-иврит-ски» такой текст = фрустрация вместо graduation, критика L2-7).
// Приоритет N>R.
//
// Dual export: window.ScaffoldAdvisor (browser) + module.exports (Node smoke).

(function () {
  "use strict";

  // inputs = {
  //   niqqudMode: 'full'|'adaptive'|'off', ruMode: 'show'|'reveal'|'off',
  //   fadeReady: bool,          // ReaderMorph.fadeGraduationReady(states) — считает вызывающий
  //   fadeGradOffered: bool,    // localStorage room.fadeGradOffered === '1'
  //   ruRevealOffered: bool,    // localStorage room.ruRevealOffered === '1'
  //   coverage: null | { zone, loadFlag },   // corpus-текст: coverageForWork ТЕКУЩЕГО текста
  // } → { rule: 'N' } | { rule: 'R' } | null
  function advise(inputs) {
    var i = inputs || {};
    if (i.niqqudMode === "full" && !i.fadeGradOffered && i.fadeReady === true) return { rule: "N" };
    var cov = i.coverage;
    if (i.ruMode === "show" && !i.ruRevealOffered && cov &&
        (cov.zone === "in" || cov.zone === "easy") && !cov.loadFlag) return { rule: "R" };
    return null;
  }

  var API = { advise: advise };
  if (typeof window !== "undefined") window.ScaffoldAdvisor = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
