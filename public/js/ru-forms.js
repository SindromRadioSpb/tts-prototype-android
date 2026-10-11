// public/js/ru-forms.js — Ф2 слоя слов: русский перевод КАЖДОЙ формы парадигмы Pealim, без ИИ.
//
// Спека: docs/planning/word-layer/F2_SPEC_2026_10_11.md. Данные: public/data/inflection/ru-forms-v1.json.gz
// (офлайн-сборка scripts/word-layer/f2-ru-forms-bake.py через pymorphy3). В файле только СЛОВОФОРМЫ
// (≈200 КБ gz): «писала», «буду», «мой». Фразу («она писала», «я буду писать», «моя книга») собирает
// compose() по клетке. Паритет с полными фразами сборки — tests/ruForms.test.js (оракул из Python).
//
// R1/R10: формы нет — null (а не догадка). Тогда подпись остаётся как в Ф1: смысл леммы + «она, прош.».
// Страдательные клетки — только от чисто совершенного глагола («был ограничен»); наст. время
// совершенного вида («сделать») формы не имеет.
//
// Dual export: window.RuForms (браузер) + module.exports (Node).
(function () {
  "use strict";

  var MODEL = "ru-forms-v1";
  var URL = "/data/inflection/" + MODEL + ".json.gz";

  var PRON = { "1s": "я", "1p": "мы", "2ms": "ты", "2fs": "ты", "2mp": "вы", "2fp": "вы", "3ms": "он", "3fs": "она", "3p": "они", "3mp": "они", "3fp": "они" };
  var POSS = { "1s": "мой", "1p": "наш", "2ms": "твой", "2fs": "твой", "2mp": "ваш", "2fp": "ваш", "3ms": "его", "3fs": "её", "3mp": "их", "3fp": "их" };
  // мой/твой/наш/ваш agree with the noun (m, f, n, plural); его/её/их do not.
  var POSS_AGREE = {
    "мой": { m: "мой", f: "моя", n: "моё", p: "мои" }, "твой": { m: "твой", f: "твоя", n: "твоё", p: "твои" },
    "наш": { m: "наш", f: "наша", n: "наше", p: "наши" }, "ваш": { m: "ваш", f: "ваша", n: "ваше", p: "ваши" },
  };
  var CELL_RE = /^(passive-)?(PERF|IMPF|IMP|AP|INF)-?(\w+)?$/;
  var GN4 = { ms: 1, fs: 1, mp: 1, fp: 1 };   // present (participle) cells: gender × number, no person
  var P6 = ["1s", "2s", "3s", "1p", "2p", "3p"];

  function gnum(pn) { return /p$/.test(pn) ? 2 : (pn.indexOf("f") >= 0 ? 1 : 0); }   // [m sg, f sg, pl]
  function p6(pn) { return P6.indexOf(pn.charAt(0) + (/p$/.test(pn) ? "p" : "s")); }
  function tl(t) { return t ? " " + t : ""; }
  function at(arr, i) { return (arr && arr[i]) || ""; }

  // Compose the Russian translation of one paradigm cell. data = the whole loaded file
  // ({budu, byl, copulas, forms}); c = data.forms[pealim_id]. → string | null.
  function compose(data, c, slot) {
    if (!data || !c || !slot) return null;
    var s = String(slot);
    if (c.n) return composeNoun(c, s);
    if (c.A) {
      var am = /^(m|f)(s|p)-a$/.exec(s);
      if (!am) return null;
      var a = at(c.A, am[2] === "p" ? 2 : (am[1] === "f" ? 1 : 0));
      return a ? a + tl(c.t) : null;
    }
    var m = CELL_RE.exec(s);
    if (!m) return null;
    var passive = !!m[1], T = m[2], pn = m[3] || "";
    if (T === "AP" ? !GN4[pn] : (T !== "INF" && !PRON[pn])) return null;
    if (T === "IMP" && pn.charAt(0) !== "2") return null;
    if (c.c) return composeCopula(data, c, passive, T, pn);
    return composeVerb(data, c, passive, T, pn);
  }

  function composeVerb(data, c, passive, T, pn) {
    var t = tl(c.t), w;
    if (passive) {
      if (!c.s || (T !== "PERF" && T !== "IMPF" && T !== "AP")) return null;
      if (T === "AP") { w = at(c.S, gnum(pn)); return w ? w + t : null; }
      w = at(c.s, gnum(pn));
      if (!w) return null;
      var aux = T === "PERF" ? at(data.byl, gnum(pn)) : at(data.budu, p6(pn));
      return PRON[pn] + " " + aux + " " + w + t;
    }
    if (T === "INF") return c.i + t;
    if (T === "PERF") { w = at(c.P, gnum(pn)); return w ? PRON[pn] + " " + w + (pn === "1s" ? "(а)" : "") + t : null; }
    if (T === "IMPF") {
      if (c.a === "i" && !c.F) return PRON[pn] + " " + at(data.budu, p6(pn)) + " " + c.i + t;   // F: «быть» → «они будут»
      w = at(c.F, p6(pn)); return w ? PRON[pn] + " " + w + t : null;
    }
    if (T === "IMP") { w = at(c.I, /p$/.test(pn) ? 1 : 0); return w ? w + t + "!" : null; }
    if (T === "AP") {
      if (c.a !== "i") return null;   // a perfective verb has no present
      w = at(c.R, /p$/.test(pn) ? 1 : 0);
      return w ? w + t + (pn.indexOf("f") >= 0 ? " (ж.)" : "") : null;
    }
    return null;
  }

  function composeCopula(data, c, passive, T, pn) {
    if (passive) return null;
    if (T === "INF") return c.i;
    if (!c.q) return null;
    var cf = (data.copulas || {})[c.c], i = gnum(pn), r = tl(c.t);
    if (!cf) return null;
    if (T === "PERF") return PRON[pn] + " " + at(cf.P, i) + " " + c.q[i] + r;
    if (T === "IMPF") return PRON[pn] + " " + at(cf.F, p6(pn)) + " " + c.q[i] + r;
    if (T === "IMP") return at(cf.I, /p$/.test(pn) ? 1 : 0) + " " + c.q[i] + r + "!";
    if (T === "AP") return c.N[i] + r;
    return null;
  }

  function composeNoun(c, s) {
    var plural = s.charAt(0) === "p";
    var base = at(c.n, plural ? 1 : 0);
    if (!base) return null;
    if (s === "s" || s === "p" || s === "sc" || s === "pc") return base;
    var pm = /^[sp]-P-(\w+)$/.exec(s);
    if (!pm || !POSS[pm[1]]) return null;
    var poss = POSS[pm[1]], ag = POSS_AGREE[poss];
    if (ag) poss = ag[(plural || c.g === "p") ? "p" : (c.g || "m")] || poss;
    return poss + " " + base;
  }

  // Slots whose Russian form says by itself what the grammar hint would say (person, tense,
  // number, owner). Construct cells (sc/pc) are NOT among them: their form equals the absolute one,
  // so the gloss keeps the «сопр.» hint.
  function selfDescribing(slot) { return !/^(sc|pc)$/.test(String(slot || "")); }

  // ── loading ───────────────────────────────────────────────────────────────────────────────────
  var _data = null, _ready = null;
  function setData(d) { _data = d && d.forms ? d : null; return _data; }
  function ensureReady() {
    if (_data) return Promise.resolve(_data);
    if (_ready) return _ready;
    _ready = (async function () {
      var res = await fetch(URL);
      if (!res || !res.ok) throw new Error("ru-forms " + (res && res.status));
      var d;
      if (typeof DecompressionStream === "function" && res.body) {
        d = JSON.parse(await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text());
      } else d = await res.json();
      if (!setData(d)) throw new Error("ru-forms malformed");
      return _data;
    })().catch(function (e) { _ready = null; throw e; });
    return _ready;
  }
  function isReady() { return !!_data; }
  // Synchronous lookup for renderers (the morph card is an HTML string): null until loaded.
  function formFor(paradigm, slot) {
    if (!_data || !paradigm || paradigm.pealim_id == null) return null;
    var c = _data.forms[String(paradigm.pealim_id)];
    if (!c || (paradigm.cells && !paradigm.cells[slot])) return null;
    return compose(_data, c, slot);
  }

  var API = {
    MODEL: MODEL, compose: compose, selfDescribing: selfDescribing,
    setData: setData, ensureReady: ensureReady, isReady: isReady, formFor: formFor,
  };
  if (typeof window !== "undefined") window.RuForms = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
