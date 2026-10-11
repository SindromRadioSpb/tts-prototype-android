// public/js/word-gloss.js — Ф1 слоя слов: подстрочник и лента слов (Студия + Зал).
//
// Спека: docs/planning/word-layer/F1_SPEC_2026_10_11.md. Канон: WORD_LAYER_RESEARCH_AND_PLAN_2026_10_11.md.
//
// ОДИН источник правды со словом по тапу: карточка, раскраска статусов и эта глосса читают один и
// тот же офлайн-резолвер (ReaderMorph.resolveForGloss == resolveCore). Здесь — только ПРЕДСТАВЛЕНИЕ
// уже разрешённой карточки: короткий смысл, подпись найденной формы, смысл отделённой приставки.
// Ничего не хранится: глосса — детерминированная функция (слово, огласовка, офлайн-Pealim).
//
// R1/R10: подпись формы ставится ТОЛЬКО при точном совпадении огласованной формы (или её основы
// после приставки) с клеткой найденной парадигмы; «вероятно» помечается «≈»; «нет данных» — пусто.
// Табличный билдер parity-заморожен — DOM таблицы не перестраивается: только data-атрибуты на .rm-w
// (CSS ::after) и отдельная полоса ленты над таблицей.
//
// Dual export: window.WordGloss (браузер) + module.exports (Node-тесты ядра).
(function () {
  "use strict";

  function t(key, fallback) {
    try {
      if (typeof window !== "undefined" && typeof window.t === "function") {
        var v = window.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback;
  }

  // ── normalization (== NotesAutoGen.normVowels: drop cantillation + meteg, keep vowels/dagesh) ──
  var MARK_RE = /[֑-ׇ]/;
  function stripNiqqud(s) { return String(s == null ? "" : s).replace(/[֑-ׇ]/g, "").replace(/[‌-‏‪-‮]/g, "").trim(); }
  function normVowels(s) {
    return String(s == null ? "" : s).normalize("NFC").replace(/[֑-ֽ֯‌-‏‪-‮]/g, "").replace(/[־\-]$/, "").trim();
  }
  // letter + its marks
  function clusters(s) {
    var out = [], str = String(s || "");
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (MARK_RE.test(ch) && out.length) out[out.length - 1] += ch;
      else out.push(ch);
    }
    return out;
  }
  // Form-match key: vowels + shin/sin dots kept, dagesh/rafe dropped — sources disagree on dagesh
  // (Pealim אִשְׁתִי vs text אִשְׁתִּי; gemination after a proclitic שֶׁשָּׁ…), while vowels decide the form.
  function formKey(s) { return normVowels(s).replace(/[ּֿ]/g, "").normalize("NFC"); }
  // Step 1: the matres-insensitive key (ReaderMorph.canonForm: Pealim עַכְשָׁיו = text עַכְשָׁו, וֹ/ֹ, וּ/ֻ).
  function readerMorph() {
    if (typeof window !== "undefined" && window.ReaderMorph) return window.ReaderMorph;
    try { return typeof require === "function" ? require("./reader-morph.js") : null; } catch (_) { return null; }
  }
  function cellKey(s) { var RM = readerMorph(); return RM && RM.canonForm ? RM.canonForm(s) : formKey(s); }

  // ── short sense: first sense of the Pealim meaning, parentheticals out ──────────────────────
  var GLOSS_MAX = 24;
  function clip(m, max) {
    m = String(m || "").replace(/\s+/g, " ").trim();
    if (m.length <= max) return m;
    var cut = m.lastIndexOf(" ", max);
    return (cut > 8 ? m.slice(0, cut) : m.slice(0, max)) + "…";
  }
  // First sense that still has words once parentheticals are out («(винит. падеж); ты» keeps the
  // grammatical note only when a sense is nothing but a note).
  function shortGloss(meaning) {
    // Pealim sometimes decorates a sense with a pictograph («☎️ телефон») — not part of the gloss.
    var senses = String(meaning || "").replace(/\*/g, "").replace(/[☀-➿️]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDEFF]|\uD83E[\uDD00-\uDEFF]/g, "").split(";");
    for (var i = 0; i < senses.length; i++) {
      var m = senses[i].replace(/\([^)]*\)/g, " ").replace(/\s*\(.*$/, "").split(",")[0].trim();
      if (m) return clip(m, GLOSS_MAX);
    }
    return clip(senses[0] || "", GLOSS_MAX);
  }

  // ── proclitic prefixes: a CLOSED, ordered set (ו → (כ)ש/מש → ב|ל|כ|מ → ה) ──────────────────
  var PREFIX_SEQ_RE = /^ו?(?:כש|מש|ש)?[בלכמ]?ה?$/;
  var PREFIX_KEY = { "ו": "v", "ש": "sh", "כש": "ksh", "מש": "msh", "ב": "b", "ל": "l", "כ": "k", "מ": "m" };
  var PREFIX_FB = { v: "и", sh: "что", ksh: "когда", msh: "с тех пор как", b: "в", l: "к", k: "как", m: "из" };
  function prefixGloss(cons) {
    var s = String(cons || ""), out = [], i = 0;
    if (!s || !PREFIX_SEQ_RE.test(s)) return "";
    while (i < s.length) {
      var two = s.slice(i, i + 2), key = null;
      if (two === "כש" || two === "מש") { key = PREFIX_KEY[two]; i += 2; }
      else { var one = s[i]; i += 1; if (one === "ה") continue; key = PREFIX_KEY[one]; }   // article: no gloss
      if (key) out.push(t("wordGloss.prefix." + key, PREFIX_FB[key]));
    }
    return out.join(" ");
  }

  // ── which paradigm cell IS this word (exact vocalized match, whole or after a proclitic) ─────
  // Returns { slots:[…], prefix:"<consonants>" } or null. Never guesses: no consonant-only match.
  function matchCell(paradigm, niqqud) {
    if (!paradigm || !paradigm.cells || !niqqud || !/[ְ-ׇּׁׂ]/.test(niqqud)) return null;
    var cells = paradigm.cells, keys = Object.keys(cells), index = new Map();
    for (var i = 0; i < keys.length; i++) {
      var c = cells[keys[i]]; if (!c || !c.he) continue;
      var f = cellKey(c.he);
      if (!index.has(f)) index.set(f, []);
      index.get(f).push(keys[i]);
    }
    var full = cellKey(niqqud);
    // A bare preposition is its own base form, even where Pealim spells «to me» identically (לְפִי),
    // with or without a proclitic in front (שֶׁלְּפִי).
    var prepTable = keys.every(function (k) { return /^P-/.test(k); });
    var prepBase = stripNiqqud(paradigm.lemma || "");
    if (prepTable && stripNiqqud(niqqud) === prepBase) return null;
    if (index.has(full)) return { slots: pruneSlots(index.get(full), ""), prefix: "" };
    // Split proclitics on the RAW vocalization (a word-initial וּ must stay a letter), key the rest.
    var cl = clusters(String(niqqud).normalize("NFC")), impossible = false;
    for (var k = 1; k <= 3 && k < cl.length - 1; k++) {
      var pre = stripNiqqud(cl.slice(0, k).join(""));
      if (!PREFIX_SEQ_RE.test(pre)) break;
      var rawRest = cl.slice(k).join("");
      if (prepTable && stripNiqqud(rawRest) === prepBase) return { slots: [], prefix: pre };   // keep «что +», no person
      var hit = index.get(cellKey(rawRest));
      if (hit) {
        var last = cl[k - 1] || "", merged = /^[בלכ]/.test(last) && /[ַָ]/.test(last);   // בַּבַּיִת = ב + ה
        var kept = pruneSlots(hit, merged ? pre + "ה" : pre);
        if (kept.length || !hit.some(function (h) { return FINITE_RE.test(h); })) return { slots: kept, prefix: pre };
        impossible = true;   // only «preposition + finite verb» readings: try a longer prefix, else say so
      }
    }
    return impossible ? { slots: [], prefix: "", impossible: true } : null;
  }
  // A construct cell spelled like its absolute twin adds nothing, and the article excludes construct.
  // Ф2: a preposition (ב ל כ מ) or the article never stands before a FINITE verb — בְּחָזְקָה is
  // «в силе», not «в + она была сильной»; שֶׁלְּצַעֲרִי is «к сожалению», not «к + огорчай!».
  var FINITE_RE = /^(?:passive-)?(?:PERF|IMPF|IMP)-/;
  function pruneSlots(slots, prefix) {
    var hasArticle = /ה$/.test(prefix || "");
    var noFinite = /[בלכמה]/.test(prefix || "");
    return slots.filter(function (s) {
      if (noFinite && FINITE_RE.test(s)) return false;
      if (s === "sc" && (hasArticle || slots.indexOf("s") >= 0)) return false;
      if (s === "pc" && (hasArticle || slots.indexOf("p") >= 0)) return false;
      return true;
    });
  }

  // ── grammar hint for a slot (reuses InflectionRender.slotLabel → existing notes.card.conj.* keys) ──
  var TENSE = { PERF: "past", IMPF: "future", IMP: "imperative", AP: "present" };
  var TENSE_FB = { past: "прош.", future: "буд.", imperative: "повел.", present: "наст.", passive: "страд." };
  var SILENT_BASE = { "s": 1, "ms-a": 1 };   // dictionary base form: no hint (noise)
  function slotLabelOf(slot) {
    try {
      var IR = (typeof window !== "undefined" && window.InflectionRender) ||
        (typeof require === "function" ? require("./inflection-render.js") : null);
      if (IR && IR.slotLabel) return IR.slotLabel(slot);
    } catch (_) {}
    return slot;
  }
  function slotHint(slot) {
    var s = String(slot || "");
    if (!s || SILENT_BASE[s]) return "";
    var passive = /^passive-/.test(s), bare = s.replace(/^passive-/, "");
    var m = bare.match(/^(PERF|IMPF|IMP|AP)-/);
    var voice = passive ? " " + t("wordGloss.tense.passive", TENSE_FB.passive) : "";
    if (m) {
      var tk = TENSE[m[1]];
      return slotLabelOf(bare) + ", " + t("wordGloss.tense." + tk, TENSE_FB[tk]) + voice;
    }
    if (bare === "INF-L") return slotLabelOf(bare) + voice;
    if (/^p-P-/.test(s)) return t("wordGloss.plural", "мн.") + ", " + slotLabelOf(s);
    return slotLabelOf(s);
  }
  function slotsHint(slots) {
    var seen = [], out = [];
    for (var i = 0; i < (slots || []).length && out.length < 2; i++) {
      var h = slotHint(slots[i]);
      if (h && seen.indexOf(h) < 0) { seen.push(h); out.push(h); }
    }
    return out.join(" / ");
  }

  // ── Ф2: Russian translation of the matched cell(s) (RuForms, offline pymorphy3 bake) ─────────
  function ruForms() {
    if (typeof window !== "undefined" && window.RuForms) return window.RuForms;
    try { return typeof require === "function" ? require("./ru-forms.js") : null; } catch (_) { return null; }
  }
  var FORM_MAX = 48;
  // → { text, hint } when EVERY matched slot has a form (else null: F1 meaning + hint stays).
  // Homographic cells («תִּכְתֹּב» = ты (м) напишешь / она напишет) show both, like the hint does.
  function cellForms(paradigm, slots) {
    var RF = ruForms();
    if (!RF || !RF.formFor || !slots || !slots.length) return null;
    var forms = [], hintSlots = [];
    for (var i = 0; i < slots.length; i++) {
      var f = RF.formFor(paradigm, slots[i]);
      if (!f) return null;
      if (forms.indexOf(f) < 0) forms.push(f);
      if (!RF.selfDescribing(slots[i])) hintSlots.push(slots[i]);
    }
    return { text: clip(forms.slice(0, 2).join(" / "), FORM_MAX), hint: slotsHint(hintSlots) };
  }
  // A conjunction prefix (ו «и», ש «что», כש «когда», מש) governs no case: «что она писала» reads
  // as Russian. A preposition (ב ל כ מ) does: «в + дома» keeps the «+» so the case mismatch shows.
  var CONJ_PREFIX_RE = /^ו?(?:כש|מש|ש)?ה?$/;

  // ── compose the learner-facing gloss from a resolved card (ReaderMorph.resolveCore payload) ──
  // → { prefix, meaning, hint, label, form, text } ; text = one line for the ribbon / tooltip;
  // form = true when `meaning` is the translation of THIS form («она писала»), not of the lemma.
  function isPronounSet(p) { var c = (p && p.cells) || {}; return !!(c["1s"] && c["3ms"] && !c.s && !c["P-1s"]); }
  // `guessed` (a meaning-fallback guess) is NOT shown under a word: on the Ф1 sample it produced
  // שֶׁיֵּשׁ → «радоваться», בְּבָתֵּי → «кукла». The tap card still shows it with its own badge.
  var SHOWN_LABELS = { exact: 1, likely: 1, "function": 1, context: 1 };
  function composeGloss(card, niqqud) {
    if (!card) return null;
    // Step 1: a proper name is honest information, not a gap («?» told the learner nothing).
    if (card.gateVia === "name" || (card.pos === "propernoun" && !card.meaning)) {
      var nm = t("wordGloss.name", "имя, название");
      return { prefix: "", joiner: " + ", meaning: nm, hint: "", label: "name", form: false, text: nm };
    }
    var label = card.label || "unknown";
    // curated closed-class glosses are already short and their notes matter: «(винит. падеж); ты (ж.р.)»
    var meaning = card.functionWord ? clip(card.meaning, GLOSS_MAX + 6) : shortGloss(card.meaning);
    if (!meaning || !SHOWN_LABELS[label]) return { prefix: "", joiner: " + ", meaning: "", hint: "", label: "unknown", form: false, text: "" };
    var prefix = "", hint = "", form = null, joiner = " + ";
    if (!card.functionWord && card.paradigm) {
      // Step 1: an enriched reading carries the cell it was found by (matres-insensitive lookup).
      var m = card.canon ? { slots: pruneSlots(card.canon.slots, card.canon.prefix), prefix: card.canon.prefix }
        : matchCell(card.paradigm, niqqud || card.niqqud);
      if (m && card.canon && !m.slots.length && card.canon.slots.length &&
        card.canon.slots.every(function (x) { return FINITE_RE.test(x); })) m.impossible = true;
      // The resolver's paradigm only fits as «preposition + finite verb», which Hebrew does not
      // allow: the reading itself is wrong (בְּחָזְקָה → «быть сильным»). Silence, not a wrong gloss.
      if (m && m.impossible) return { prefix: "", joiner: " + ", meaning: "", hint: "", label: "unknown", form: false, text: "" };
      if (m && isPronounSet(card.paradigm)) {
        // Pealim keeps the personal pronouns as ONE set paradigm glossed «я»: the cell IS the meaning.
        prefix = prefixGloss(m.prefix);
        meaning = slotLabelOf("P-" + m.slots[0]);
        label = "exact";
      } else if (m) {
        // An undecided homograph (label «likely») that ALSO claims a concrete form was wrong in 20
        // of 40 sampled cases (שׁוֹנֶה → «повторять», אַחֵר → «опоздать»). Under the word we stay silent;
        // the tap card keeps the reading with its own «вероятно» badge and alternatives.
        if (label === "likely" && !card.canon) return { prefix: "", joiner: " + ", meaning: "", hint: "", label: "unknown", form: false, text: "" };
        prefix = prefixGloss(m.prefix); hint = slotsHint(m.slots);
        form = cellForms(card.paradigm, m.slots);
        if (form) {
          meaning = form.text; hint = form.hint;
          if (CONJ_PREFIX_RE.test(m.prefix || "")) joiner = " ";
        }
      }
    } else if (card.functionWord && card.procliticPrefix) {
      prefix = prefixGloss(card.procliticPrefix);                                  // step-1 enrichment split
    } else if (card.functionWord && card.gateVia === "proclitic") {
      prefix = prefixGloss(stripNiqqud(niqqud || card.word || "").charAt(0));   // the gate strips one ו/ש
    }
    var shown = (label === "likely" ? "≈" : "") + meaning;
    var head = prefix ? prefix + joiner + shown : shown;
    return { prefix: prefix, joiner: joiner, meaning: shown, hint: hint, label: label, form: !!form, text: hint ? head + " · " + hint : head };
  }

  var CORE = {
    stripNiqqud: stripNiqqud, normVowels: normVowels, shortGloss: shortGloss, prefixGloss: prefixGloss,
    matchCell: matchCell, slotHint: slotHint, slotsHint: slotsHint, cellForms: cellForms, composeGloss: composeGloss, GLOSS_MAX: GLOSS_MAX,
  };

  if (typeof window === "undefined" || typeof document === "undefined") {
    if (typeof module !== "undefined" && module.exports) module.exports = CORE;
    return;
  }

  // ══ browser layer ═════════════════════════════════════════════════════════════════════════
  var GLOSS_ON = "rm-gloss-on";
  var _memo = new Map();   // surface\u0001niqqud → composed gloss (resolver output is deterministic)

  async function glossFor(surface, niqqud) {
    var key = surface + "\u0001" + niqqud;
    if (_memo.has(key)) return _memo.get(key);
    var RM = window.ReaderMorph, g = null;
    // Ф2 form translations: loaded once (≈200 KB gz); unavailable → the F1 lemma gloss, never a stall
    if (window.RuForms && !window.RuForms.isReady()) { try { await window.RuForms.ensureReady(); } catch (_) {} }
    if (RM && typeof RM.resolveForGloss === "function") {
      try { g = composeGloss(await RM.resolveForGloss(surface, niqqud), niqqud); } catch (_) { g = null; }
    }
    _memo.set(key, g);
    return g;
  }

  // The gloss column: vocalized when the table shows it, else the consonantal one — never both
  // (the same word twice would double the noise).
  function glossSpans(mount) {
    var niq = mount.querySelectorAll('#proTable tbody td[data-col="niqqud"] .rm-w');
    return Array.prototype.slice.call(niq.length ? niq : mount.querySelectorAll('#proTable tbody td[data-col="he"] .rm-w'));
  }
  function clearGloss(mount) {
    if (!mount) return;
    mount.classList.remove(GLOSS_ON);
    var done = mount.querySelectorAll(".rm-w[data-gloss], .rm-w[data-gloss-hint]");
    for (var i = 0; i < done.length; i++) {
      done[i].removeAttribute("data-gloss"); done[i].removeAttribute("data-gloss-hint"); done[i].removeAttribute("data-gloss-label");
    }
  }
  function paint(span, g) {
    if (!g || !g.meaning) { span.setAttribute("data-gloss", " "); span.setAttribute("data-gloss-label", "unknown"); return; }
    span.setAttribute("data-gloss", g.prefix ? g.prefix + g.joiner + g.meaning : g.meaning);
    if (g.hint) span.setAttribute("data-gloss-hint", g.hint);
    span.setAttribute("data-gloss-label", g.label);
  }

  var _pass = 0;
  async function applyGloss(mount) {
    if (!mount) return;
    var my = ++_pass;
    mount.classList.add(GLOSS_ON);
    var spans = glossSpans(mount), i = 0;
    while (i < spans.length) {
      var end = Math.min(i + 60, spans.length);
      for (; i < end; i++) {
        if (my !== _pass) return;   // a newer pass (re-render / toggle) owns the mount
        var sp = spans[i];
        if (sp.hasAttribute("data-gloss")) continue;
        paint(sp, await glossFor(sp.getAttribute("data-surface") || "", sp.getAttribute("data-niqqud") || ""));
      }
      await new Promise(function (r) { setTimeout(r, 0); });
    }
  }

  // ── ribbon: words of the current row ─────────────────────────────────────────────────────────
  // Placement follows the scroll model of the table container (the HOST):
  //   • the host scrolls by itself (study/media layout: pinned video above a table window) → the
  //     ribbon sits right BEFORE the host, i.e. between the video and the table;
  //   • the page scrolls (plain reading / read-aloud) → the ribbon goes AFTER the host and sticks to
  //     the bottom of the viewport while the table is on screen (the thead owns the top edge).
  // The ribbon is never inside the host: a table re-render cannot wipe it, and its own DOM churn
  // never re-triggers the row observer.
  var CURRENT_ROW = "#proTable tbody tr.row-playing, #proTable tbody tr.smk-row-active";
  var FALLBACK_ROW = "#proTable tbody tr.rm-row-current";
  var _ribbons = new WeakMap();   // mount → { el, list, host, obs, rowIdx, raf }

  function hostOf(mount) {
    if (mount.matches && mount.matches(".reader-table-wrap, #tableContainer")) return mount;
    return mount.querySelector(".reader-table-wrap, #tableContainer") || mount;
  }
  function hostScrolls(host) {
    try { var oy = getComputedStyle(host).overflowY; return oy === "auto" || oy === "scroll"; } catch (_) { return false; }
  }
  function currentRow(host) { return host.querySelector(CURRENT_ROW) || host.querySelector(FALLBACK_ROW); }
  function rowSpans(tr) {
    var niq = tr.querySelectorAll('td[data-col="niqqud"] .rm-w');
    return Array.prototype.slice.call(niq.length ? niq : tr.querySelectorAll('td[data-col="he"] .rm-w'));
  }
  function place(st) {
    var host = st.host, parent = host.parentNode;
    if (!parent) return;
    var inWindow = hostScrolls(host);
    st.el.classList.toggle("rm-ribbon--bar", !inWindow);
    var want = inWindow ? host : host.nextSibling;
    if (st.el.parentNode !== parent || st.el.nextSibling !== want) parent.insertBefore(st.el, want);
  }

  async function renderRibbon(st) {
    var tr = currentRow(st.host);
    var idx = tr ? tr.getAttribute("data-row-idx") : null;
    if (idx === st.rowIdx) return;
    st.rowIdx = idx;
    if (!tr) { st.el.hidden = true; st.list.innerHTML = ""; return; }
    place(st);
    st.el.hidden = false;
    var frag = document.createDocumentFragment();
    var chips = rowSpans(tr).map(function (sp) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "rm-ribbon-chip";
      var he = document.createElement("span"); he.className = "rm-ribbon-he"; he.lang = "he"; he.dir = "rtl";
      he.textContent = sp.getAttribute("data-niqqud") || sp.textContent;
      var gl = document.createElement("span"); gl.className = "rm-ribbon-gloss"; gl.textContent = "…";
      b.appendChild(he); b.appendChild(gl);
      // same word, same card: the tap goes to the table word (occurrence context included)
      b.addEventListener("click", function () { try { sp.click(); } catch (_) {} });
      frag.appendChild(b);
      return { b: b, gl: gl, sp: sp };
    });
    st.list.innerHTML = ""; st.list.appendChild(frag);
    st.list.scrollLeft = 0;
    for (var i = 0; i < chips.length; i++) {
      if (st.rowIdx !== idx) return;   // playback moved on while resolving
      var c = chips[i];
      var g = await glossFor(c.sp.getAttribute("data-surface") || "", c.sp.getAttribute("data-niqqud") || "");
      var has = !!(g && g.text);
      c.gl.textContent = has ? g.text : "?";
      c.b.setAttribute("data-gloss-label", has ? g.label : "unknown");
      c.b.setAttribute("aria-label", (c.sp.getAttribute("data-niqqud") || c.sp.textContent) + " — " + (has ? g.text : t("wordGloss.unknown", "нет данных")));
    }
  }

  function ensureRibbon(mount) {
    var host = hostOf(mount), st = _ribbons.get(mount);
    if (st && st.host === host && st.el.isConnected) return st;
    if (st) removeRibbon(mount);
    var el = document.createElement("div");
    el.className = "rm-ribbon"; el.hidden = true;
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", t("wordGloss.ribbon.aria", "Слова текущей строки"));
    var list = document.createElement("div"); list.className = "rm-ribbon-list"; list.dir = "rtl";
    el.appendChild(list);
    st = { el: el, list: list, host: host, obs: null, rowIdx: undefined, raf: 0 };
    if (host.parentNode) host.parentNode.insertBefore(el, host);
    var schedule = function () {
      if (st.raf) return;
      st.raf = requestAnimationFrame(function () { st.raf = 0; renderRibbon(st); });
    };
    st.obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "childList" || (m.target && m.target.tagName === "TR")) { schedule(); return; }
      }
    });
    st.obs.observe(host, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
    _ribbons.set(mount, st);
    return st;
  }
  function removeRibbon(mount) {
    var st = _ribbons.get(mount);
    if (!st) return;
    try { st.obs.disconnect(); } catch (_) {}
    if (st.raf) { try { cancelAnimationFrame(st.raf); } catch (_) {} }
    if (st.el && st.el.parentNode) st.el.parentNode.removeChild(st.el);
    _ribbons.delete(mount);
  }

  // Entry point for both surfaces, called after every table render / toggle change.
  // opts = { gloss: bool, ribbon: bool }
  async function apply(mount, opts) {
    if (!mount) return;
    opts = opts || {};
    if (opts.ribbon) { var st = ensureRibbon(mount); st.rowIdx = undefined; place(st); renderRibbon(st); }
    else removeRibbon(mount);
    if (opts.gloss) await applyGloss(mount);
    else { _pass++; clearGloss(mount); }
  }

  // Toggle storage. Studio inherits the Room value on its first read (like «Статус слов»).
  function enabled(surface, what) {
    var key = surface + ".word" + what;
    try {
      var v = localStorage.getItem(key);
      if (v === null && surface === "studio") {
        v = localStorage.getItem("room.word" + what) === "1" ? "1" : "0";
        localStorage.setItem(key, v);
      }
      return v === "1";
    } catch (_) { return false; }
  }
  function setEnabled(surface, what, v) { try { localStorage.setItem(surface + ".word" + what, v ? "1" : "0"); } catch (_) {} }

  var API = Object.assign({}, CORE, {
    apply: apply, applyGloss: applyGloss, clearGloss: clearGloss, removeRibbon: removeRibbon,
    enabled: enabled, setEnabled: setEnabled, _memo: _memo,
  });
  window.WordGloss = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
