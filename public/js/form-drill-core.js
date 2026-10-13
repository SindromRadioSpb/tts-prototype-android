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
    // a focus (one tense, from the progress page) narrows the deck; a focus the table lacks changes nothing
    if (opts.focusGroups && opts.focusGroups.length) {
      var focus = forms.filter(function (f) { return opts.focusGroups.indexOf(f.groupKey) >= 0; });
      if (focus.length) forms = focus;
    }
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

  // Д2.2+ a round over a SET of words: each word keeps its own order (above); words whose unlearnt forms
  // were met in my texts start, then words with anything left to learn, in list order; tasks alternate between
  // words (round-robin), so a round trains the pattern across words. Options come from each word's own table.
  function buildSetDeck(items, opts) {
    opts = opts || {};
    var size = Math.max(1, Number(opts.size) || 10);
    var decks = (items || []).map(function (it, i) {
      var memory = it.memory || {}, met = new Set(it.metSlots || []);
      var d = buildDeck(it.study, { metSlots: it.metSlots, memory: memory, size: 99, focusGroups: opts.focusGroups });
      var open = d.filter(function (f) { return !mastered(memory[f.slot]); }).length;
      var head = d.length && !mastered(memory[d[0].slot]) && met.has(d[0].slot) ? 0 : open ? 1 : 2;
      return { it: it, i: i, deck: d, head: head };
    }).filter(function (x) { return x.deck.length; });
    decks.sort(function (a, b) { return a.head - b.head || a.i - b.i; });
    var out = [], pos = decks.map(function () { return 0; });
    while (out.length < size) {
      var added = false;
      for (var k = 0; k < decks.length && out.length < size; k++) {
        var x = decks[k];
        if (pos[k] < x.deck.length) { out.push({ key: x.it.key, lemma: x.it.lemma || "", study: x.it.study, target: x.deck[pos[k]++], item: x.it }); added = true; }
      }
      if (!added) break;
    }
    return out;
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

  // mode: 'choice' | 'tiles' | 'type' — right answers PRODUCED (tiles / typing) are also counted apart (prod)
  function grade(memory, slot, ok, now, mode) {
    var m = Object.assign({ seen: 0, right: 0, streak: 0, last: 0 }, memory && memory[slot]);
    m.seen++; if (ok) { m.right++; m.streak++; } else m.streak = 0;
    if (ok && (mode === "type" || mode === "tiles")) m.prod = (Number(m.prod) || 0) + 1;
    m.last = now || Date.now();
    var out = Object.assign({}, memory); out[slot] = m;
    return out;
  }
  function summary(study, memory) {
    var forms = formsOf(study), m = memory || {};
    var done = forms.filter(function (f) { return mastered(m[f.slot]); }).length;
    return { total: forms.length, mastered: done, tried: forms.filter(function (f) { return m[f.slot] && m[f.slot].seen; }).length };
  }

  // ── Д2.2+ production answers (typing / letter tiles) ─────────────────────────────────────────
  var FIN = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  function skeleton(s) {
    return strip(s).replace(/[\s־׳״'"\-]/g, "").replace(/[ךםןףץ]/g, function (c) { return FIN[c]; });
  }
  // the letters of a vocalized form with their marks: [{ch (finals folded), marks}]
  function lettersOf(he) {
    var out = [];
    String(he || "").replace(/[\s־]/g, "").split("").forEach(function (c) {
      if (/[א-ת]/.test(c)) out.push({ ch: FIN[c] || c, marks: "" });
      else if (/[֑-ׇ]/.test(c) && out.length) out[out.length - 1].marks += c;
    });
    return out;
  }
  // Plene spelling (ktiv male) is accepted by rule, not by «looks similar»: an extra ו only after a letter with
  // holam / qubutz / qamats katan (or doubling a consonantal ו), an extra י only after a hiriq (or doubling a
  // consonantal י). דִּבַּרְתִּי → דיברתי yes; דבירתי, דוברתי no.
  function insertAllowed(prev, ch) {
    if (!prev) return false;
    if (ch === "ו") return /[ׇֹֺֻ]/.test(prev.marks) || (prev.ch === "ו" && !/ֹ/.test(prev.marks));
    if (ch === "י") return /ִ/.test(prev.marks) || prev.ch === "י";
    return false;
  }
  function pleneMatch(sk, targetHe) {
    var t = lettersOf(targetHe), memo = {};
    function go(i, j, ins) {
      var k = i + "," + j + "," + ins;
      if (k in memo) return memo[k];
      var r;
      if (i === sk.length) r = j === t.length;
      else r = (j < t.length && sk[i] === t[j].ch && go(i + 1, j + 1, 0)) ||
        (!ins && j > 0 && (sk[i] === "ו" || sk[i] === "י") && insertAllowed(t[j - 1], sk[i]) && go(i + 1, j, 1));
      memo[k] = !!r; return !!r;
    }
    return go(0, 0, 0);
  }
  // A typed / tiled answer is right when its letters spell THIS cell (defective, or plene by rule). If they spell
  // another cell, that cell is named (an explained miss). niqqudAmbiguous: the same letters are also another
  // cell (כתבת = «ты (м)» and «ты (ж)») — right by letters; the vowels are shown to the learner.
  function checkTyped(target, study, typed) {
    var sk = skeleton(typed);
    if (!sk) return { ok: false, empty: true, typed: sk, other: null, niqqudAmbiguous: false };
    var hits = formsOf(study).filter(function (f) { return pleneMatch(sk, f.he); });
    var ok = pleneMatch(sk, target.he), same = function (f) { return String(f.he).replace(/\s/g, "") === String(target.he).replace(/\s/g, ""); };
    return { ok: ok, typed: sk, other: ok ? null : (hits[0] || null),
      niqqudAmbiguous: ok && hits.some(function (f) { return !same(f); }) };
  }

  // keys pressed on a Hebrew keyboard (SI-1452) while the Russian or Latin layout is on → the Hebrew letters
  var LAYOUT = {
    t: "א", c: "ב", d: "ג", s: "ד", v: "ה", u: "ו", z: "ז", j: "ח", y: "ט", h: "י", l: "ך", f: "כ", k: "ל", o: "ם",
    n: "מ", i: "ן", b: "נ", x: "ס", g: "ע", ";": "ף", p: "פ", ".": "ץ", m: "צ", e: "ק", r: "ר", a: "ש", ",": "ת",
    "е": "א", "с": "ב", "в": "ג", "ы": "ד", "м": "ה", "г": "ו", "я": "ז", "о": "ח", "н": "ט", "р": "י", "д": "ך",
    "а": "כ", "л": "ל", "щ": "ם", "т": "מ", "ш": "ן", "и": "נ", "ч": "ס", "п": "ע", "ж": "ף", "з": "פ", "ю": "ץ",
    "ь": "צ", "у": "ק", "к": "ר", "ф": "ש", "б": "ת",
  };
  function fromLayout(s) {
    s = String(s == null ? "" : s);
    if (!/[a-zа-яё]/i.test(s)) return { text: s, converted: false };
    return { text: s.toLowerCase().split("").map(function (c) { return LAYOUT[c] || c; }).join(""), converted: true };
  }

  // tiles: the letters of the form as written (finals kept) + up to `extra` decoys — letters other forms of the
  // same tense have more of (ם/ן against ת/נ…), so the tiles are not solved by the letter set alone
  function tilesFor(target, study, extra, seed) {
    extra = extra == null ? 3 : extra;
    var heLetters = function (he) { return strip(he).split("").filter(function (c) { return /[א-ת]/.test(c); }); };
    var count = function (arr) { var m = {}; arr.forEach(function (c) { m[c] = (m[c] || 0) + 1; }); return m; };
    var own = heLetters(target.he), ownC = count(own), decoys = [], skT = skeleton(target.he);
    var forms = formsOf(study);
    [forms.filter(function (f) { return f.groupKey === target.groupKey; }), forms].forEach(function (pool) {
      pool.forEach(function (f) {
        if (skeleton(f.he) === skT) return;
        var c = count(heLetters(f.he));
        Object.keys(c).forEach(function (ch) { if (decoys.length < extra && c[ch] > (ownC[ch] || 0) && decoys.indexOf(ch) < 0) decoys.push(ch); });
      });
    });
    var rnd = mulberry(seed == null ? 1 : seed);
    return own.concat(decoys).map(function (ch, i) { return { ch: ch, id: "t" + i, r: rnd() }; })
      .sort(function (a, b) { return a.r - b.r; }).map(function (x) { return { ch: x.ch, id: x.id }; });
  }

  return { MASTER_STREAK: MASTER_STREAK, formsOf: formsOf, buildDeck: buildDeck, optionsFor: optionsFor, isCorrect: isCorrect,
    grade: grade, mastered: mastered, summary: summary,
    buildSetDeck: buildSetDeck, skeleton: skeleton, checkTyped: checkTyped, fromLayout: fromLayout, tilesFor: tilesFor };
});
