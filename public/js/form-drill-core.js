// public/js/form-drill-core.js — «Мой словарь» Д2.2: тренировка форм по таблице Pealim (чистое ядро).
// Спека: docs/planning/word-layer/F4_D2_LEARNING_SPEC_2026_10_12.md.
//
// Вход — проекция таблицы InflectionRender.projectStudyForms (только реальные клетки Pealim, R1: форм не
// выдумываем). Задание: «мы · прошедшее» → выбрать форму среди форм ЭТОЙ ЖЕ таблицы (различение лица/времени,
// а не угадывание слова). Клетки с одинаковой формой (תכתוב = ты (м) и она, будущее) засчитываются обе —
// ответ по форме, а не по номеру клетки. Память — своя по клетке (lemmaKey|slot), FSRS леммы не трогается (R11).
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FormDrillCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MASTER_STREAK = 2;   // two right answers in a row = «уверенно»
  var strip = function (s) { return String(s == null ? "" : s).replace(/[֑-ׇ]/g, ""); };

  // flat list of drillable forms: {slot, he, translit, label, group, groupKey}
  function formsOf(study) {
    var out = [];
    (study && study.groups || []).forEach(function (g) {
      (g.forms || []).forEach(function (f) {
        if (!f || !f.he || !f.slot) return;
        out.push({ slot: f.slot, he: String(f.he), translit: f.translit || "", label: f.label || f.slot, group: g.label || "", groupKey: g.key || "" });
      });
    });
    return out;
  }
  function mastered(m) { return !!(m && Number(m.streak) >= MASTER_STREAK); }

  // Order: forms met in my texts (not yet mastered) → their group mates → the rest not mastered →
  // mastered ones least recently seen (a light refresh). Deterministic for a given input.
  function buildDeck(study, opts) {
    opts = opts || {};
    var forms = formsOf(study), memory = opts.memory || {}, met = new Set(opts.metSlots || []), size = Math.max(1, Number(opts.size) || 8);
    var metGroups = new Set(forms.filter(function (f) { return met.has(f.slot); }).map(function (f) { return f.groupKey; }));
    function rank(f) {
      var m = memory[f.slot], done = mastered(m);
      if (!done && met.has(f.slot)) return 0;
      if (!done && metGroups.has(f.groupKey)) return 1;
      if (!done) return 2;
      return 3;
    }
    var idx = new Map(forms.map(function (f, i) { return [f.slot, i]; }));
    var sorted = forms.slice().sort(function (a, b) {
      var ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 3) return (Number((memory[a.slot] || {}).last) || 0) - (Number((memory[b.slot] || {}).last) || 0);
      return idx.get(a.slot) - idx.get(b.slot);
    });
    return sorted.slice(0, size);
  }

  // 4 options from the same table: same group first (other persons — the discrimination being trained),
  // then the same person in other groups; never a second option equal to the answer's form.
  function optionsFor(target, study, n, seed) {
    n = n || 4;
    var forms = formsOf(study), want = strip(target.he), seen = new Set([want]);
    var person = String(target.slot).replace(/^[A-Z]+-/, "");
    var pool = forms.filter(function (f) { return f.slot !== target.slot; });
    var tiers = [
      pool.filter(function (f) { return f.groupKey === target.groupKey; }),
      pool.filter(function (f) { return f.groupKey !== target.groupKey && String(f.slot).replace(/^[A-Z]+-/, "") === person; }),
      pool,
    ];
    var picked = [];
    var rnd = mulberry(seed == null ? 1 : seed);
    tiers.forEach(function (t) {
      var shuffled = t.slice().sort(function () { return rnd() - 0.5; });
      shuffled.forEach(function (f) { if (picked.length < n - 1 && !seen.has(strip(f.he))) { seen.add(strip(f.he)); picked.push(f); } });
    });
    var opts = picked.concat([target]);
    return opts.sort(function () { return rnd() - 0.5; });
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // a chosen form is right when it IS the target's form (homograph cells count as one form)
  function isCorrect(target, chosenHe) { return strip(target.he) === strip(chosenHe) && String(target.he).replace(/\s/g, "") === String(chosenHe).replace(/\s/g, ""); }

  function grade(memory, slot, ok, now) {
    var m = Object.assign({ seen: 0, right: 0, streak: 0, last: 0 }, memory && memory[slot]);
    m.seen++; if (ok) { m.right++; m.streak++; } else m.streak = 0;
    m.last = now || Date.now();
    var out = Object.assign({}, memory); out[slot] = m;
    return out;
  }
  function summary(study, memory) {
    var forms = formsOf(study), m = memory || {};
    var done = forms.filter(function (f) { return mastered(m[f.slot]); }).length;
    return { total: forms.length, mastered: done, tried: forms.filter(function (f) { return m[f.slot] && m[f.slot].seen; }).length };
  }

  return { MASTER_STREAK: MASTER_STREAK, formsOf: formsOf, buildDeck: buildDeck, optionsFor: optionsFor, isCorrect: isCorrect,
    grade: grade, mastered: mastered, summary: summary };
});
