// public/js/reader-morph.js — BRR-P1-011 · Reading-Room light morphology-on-tap.
//
// The learner layer for the Reading Room (library.html): tap a Hebrew word in the
// embedded reader -> a LIGHT card with root . binyan . POS . Russian gloss . HONEST
// provenance . direct Pealim link. The #1 project moat (deep morphology inside
// reading) finally lands in the Room — offline-first, no Studio chrome dragged in.
//
// ── Parity-safe ────────────────────────────────────────────────────────────
// reader-core.buildBilingualTableHtml is byte-parity-gated (smoke:reader-parity).
// This module NEVER touches that builder: word-wrapping is a Room-only POST-render
// DOM transform applied AFTER reader-core.openText paints the table. The pure HTML
// builder stays byte-identical -> the parity golden is untouched.
//
// ── Offline resolver spine (validated against the real 9279-paradigm dataset) ──
// The honesty-graded resolver (NotesAutoGen.resolveContentUnit) keys on the VOCALIZED
// form via formFirstResolve/formIdx — the decisive homograph signal — and works with
// an empty-POS unit. Baked corpus rows carry he_niqqud, so the spine is:
//   tokenize(he)+align(he_niqqud) -> {surface, niqqud}
//   -> pickBaseParadigm + resolveContentUnit  (against InflectionDict's 9279 paradigms)
//   -> enrich binyan/pos/url from the pealim_id->paradigm map.
// No Dicta and no MorphProvider in v1 (they are opt-in upgrades). R1: form-first never
// fabricates — ambiguous/unknown -> honest "подобрано" / "не определено офлайн".
//
// Dual export: window.ReaderMorph (browser) + module.exports (Node tests). The pure
// core (tokenize / alignSurfaceNiqqud / resolveCore / provenanceLabel) has NO DOM /
// window / network deps so tests/premium/readerMorph.test.js can run it in Node
// against the shipped dataset.

(function () {
  "use strict";

  // ── Hebrew tokenization ────────────────────────────────────────────────────
  // Word char = Hebrew letter incl. final forms (U+05D0..05EA) + niqqud/accents
  // (U+0591..05BD, 05BF, 05C1, 05C2, 05C4, 05C5, 05C7) + geresh/gershayim (U+05F3,
  // 05F4, intra-word in acronyms). DELIBERATELY EXCLUDED as separators: maqaf U+05BE,
  // paseq U+05C0, sof-pasuq U+05C3, nun-hafukha U+05C6 — so each member of a compound
  // is its own tappable token. Numeric check (not a regex range) so maqaf can't sneak in.
  function isWordChar(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0x05d0 && c <= 0x05ea) ||   // letters
           (c >= 0x0591 && c <= 0x05bd) ||   // accents + niqqud (excl. maqaf 0x05BE)
           c === 0x05bf ||                    // rafe
           c === 0x05c1 || c === 0x05c2 ||    // shin/sin dot (excl. paseq 0x05C0)
           c === 0x05c4 || c === 0x05c5 ||    // upper/lower dot (excl. sof-pasuq 0x05C3)
           c === 0x05c7 ||                    // qamats qatan (excl. nun-hafukha 0x05C6)
           c === 0x05f3 || c === 0x05f4;      // geresh / gershayim
  }
  // Skeleton stripper — IDENTICAL range to notes-autogen.stripNiqqud (U+0591..05C7) so
  // surface skeletons match the resolver's formIdx / alias keys exactly.
  var NIQQUD_RE = /[֑-ׇ]/g;

  function stripNiqqud(s) { return String(s == null ? "" : s).replace(NIQQUD_RE, "").trim(); }

  // -> [{ text, start, end, isWord }] spanning the WHOLE string (words + separators),
  // so a caller can rebuild innerHTML losslessly (wrap words, keep separators verbatim).
  function tokenize(str) {
    str = String(str == null ? "" : str);
    var toks = [], i = 0, n = str.length;
    while (i < n) {
      var isW = isWordChar(str[i]);
      var j = i + 1;
      while (j < n && isWordChar(str[j]) === isW) j++;
      toks.push({ text: str.slice(i, j), start: i, end: j, isWord: isW });
      i = j;
    }
    return toks;
  }

  // Just the word strings (skeleton tokenization), in order.
  function words(str) {
    var out = [];
    var toks = tokenize(str);
    for (var i = 0; i < toks.length; i++) if (toks[i].isWord) out.push(toks[i].text);
    return out;
  }

  // Pair each consonantal HE word with its vocalized form from he_niqqud. Same words,
  // same order; align by index, with a small look-ahead recovery (<=3) keyed on the
  // consonantal skeleton when niqqud tokenization drifts. Missing niqqud -> "" (the
  // resolver degrades to surface-alias lookup, honestly lower-confidence).
  function alignSurfaceNiqqud(heStr, niqqudStr) {
    var he = words(heStr);
    var nq = words(niqqudStr);
    var out = [], j = 0;
    for (var i = 0; i < he.length; i++) {
      var s = he[i], paired = "";
      if (j < nq.length && stripNiqqud(nq[j]) === s) { paired = nq[j]; j++; }
      else {
        var k = j;
        while (k < nq.length && k < j + 3 && stripNiqqud(nq[k]) !== s) k++;
        if (k < nq.length && k < j + 3 && stripNiqqud(nq[k]) === s) { paired = nq[k]; j = k + 1; }
      }
      out.push({ surface: s, niqqud: paired });
    }
    return out;
  }

  // ── Provenance label (R1 honesty) ──────────────────────────────────────────
  // Maps the resolver's channel/confidence/status to one of a SMALL set of honest
  // buckets. The card renders the bucket as a badge; "exact" is the only one that
  // claims certainty, and it is reserved for the decisive form-first / formHit cases.
  //   exact     — vocalized form IS a paradigm cell (form-first) or paradigm+formHit
  //   likely    — paradigm hit with a real gloss but no decisive form match
  //   guessed   — heuristic gloss-fallback (real gloss, but could be a homograph)
  //   function  — closed-class / function word (no triliteral root by design)
  //   unknown   — not resolved offline (honest empty; offer online refine)
  function _functionPos() {
    try { if (typeof window !== "undefined" && window.NotesAutoGen) return window.NotesAutoGen.FUNCTION_POS; } catch (_) {}
    try { if (typeof module !== "undefined" && module.exports) return require("./notes-autogen.js").FUNCTION_POS; } catch (_) {}
    return null;
  }
  function provenanceLabel(r, pos) {
    if (!r) return "unknown";
    if (r.channel === "form-first") return "exact";
    if (r.channel === "paradigm" && r.confidence >= 0.85) return "exact";
    var FN = _functionPos();
    if (FN && pos && FN.has(pos) && !r.meaning) return "function";
    if (r.meaning && r.confidence >= 0.65 && r.status === "ok") return "likely";
    if (r.meaning) return "guessed";
    return "unknown";
  }

  // ── Pure resolver core (Node-testable) ─────────────────────────────────────
  // eng = { NA, maps, lookup, pidMap }. NA = NotesAutoGen API; maps = buildResolverMaps
  // output; lookup(key,binyan) = InflectionDict.lookup-equivalent; pidMap = pealim_id ->
  // paradigm. Returns the light-card payload. R1: meaning/root are honest-empty when
  // the resolver can't decide.
  // Definite-article variant: a Hebrew word's most common proclitic is the definite
  // article ה (U+05D4), which geminates the next consonant with a dagesh (הַשַּׁחַר).
  // The resolver's own proclitic-strip keeps that dagesh, so the bare form misses the
  // paradigm cell. This strips ה + its vowels AND drops the gemination dagesh on the
  // first remaining consonant (הַשַּׁחַר -> שַׁחַר) so form-first can match. Returns "" when
  // the word does not begin with ה. (ו/ב/כ/ל proclitics are already handled by the
  // resolver's own strip; ה is the one needing dagesh removal.)
  function articleStrippedForm(niqqud) {
    var s = String(niqqud || "");
    if (s.charCodeAt(0) !== 0x05d4) return "";              // must start with ה
    var i = 1;
    while (i < s.length && s.charCodeAt(i) >= 0x0591 && s.charCodeAt(i) <= 0x05c7) i++;
    if (i >= s.length) return "";
    var rest = s.slice(i).replace(/^([א-ת])([֑-ׇ]*)/, function (_, cons, marks) {
      return cons + marks.replace(/ּ/, "");           // drop the article's gemination dagesh
    });
    return rest && rest !== s ? rest : "";
  }
  function _channelRank(ch) { return ch === "form-first" ? 3 : ch === "paradigm" ? 2 : ch === "meaning-fallback" ? 1 : 0; }

  async function _resolveVariant(eng, surface, niqqud) {
    var u = { pos: "", binyan: "", lemma: "", stem: "", root: null, niqqud: niqqud || "", sampleWord: surface, kind: null };
    var base = await eng.NA.pickBaseParadigm(u, eng.lookup);  // may be null for empty-POS units
    var r = eng.NA.resolveContentUnit(eng.maps, u, base);
    return { r: r, base: base };
  }

  // Resolve the tapped word. Tries the surface form and (for ה-prefixed words) an
  // article-stripped variant, keeping whichever resolves MOST decisively (form-first >
  // paradigm > meaning-fallback). The CARD still shows the original tapped form; only
  // root/gloss/binyan/pos come from the winning variant. R1: a variant is preferred
  // ONLY when it is strictly more decisive, so it can upgrade precision (e.g. correctly
  // read "the dawn"), never fabricate or override a confident base reading.
  async function resolveCore(eng, surfaceOrig, niqqudOrig) {
    var pidMap = eng.pidMap;
    var n0 = String(niqqudOrig || "");
    var cands = [{ surface: stripNiqqud(n0) || surfaceOrig, niqqud: n0 }];
    var alt = articleStrippedForm(n0);
    if (alt) cands.push({ surface: stripNiqqud(alt), niqqud: alt });
    var best = null;
    for (var i = 0; i < cands.length; i++) {
      var got = await _resolveVariant(eng, cands[i].surface, cands[i].niqqud);
      if (!best) { best = got; continue; }
      var ra = _channelRank(got.r.channel), rb = _channelRank(best.r.channel);
      if (ra > rb || (ra === rb && got.r.confidence > best.r.confidence)) best = got;
    }
    var r = best.r, base = best.base;
    var par = (r.pealim_id && pidMap) ? pidMap.get(String(r.pealim_id)) : null;
    par = par || base || null;
    var root = r.trueRoot || (par && par.root) || null;
    var binyan = (par && par.binyan) || (base && base.binyan) || "";
    var pos = (par && par.pos) || (base && base.pos) || "";
    var meaning = r.meaning || (par && par.meaning) || "";
    var pealim_id = r.pealim_id || (par && par.pealim_id ? String(par.pealim_id) : "");
    var pealim_url = (par && par.pealim_url) || "";
    return {
      word: surfaceOrig || stripNiqqud(n0), niqqud: n0,
      root: root, binyan: binyan, pos: pos, meaning: meaning,
      pealim_id: pealim_id, pealim_url: pealim_url,
      channel: r.channel, confidence: r.confidence, status: r.status,
      label: provenanceLabel(r, pos),
    };
  }

  // ── Browser engine (lazy) ──────────────────────────────────────────────────
  var _eng = null, _engPromise = null;

  // First-tap init: load + decompress the offline Pealim dataset (3.3 MB gz) ONCE,
  // build the resolver maps + pealim_id index, expose a sync paradigm lookup. Kept
  // resident for the session (NOT ensureImported — that releases the in-memory
  // paradigms the maps need). Heavy but one-time; the card shows a loading state.
  function ensureEngine() {
    if (_eng) return Promise.resolve(_eng);
    if (_engPromise) return _engPromise;
    _engPromise = (async function () {
      var NA = window.NotesAutoGen, ID = window.InflectionDict;
      if (!NA || !ID) throw new Error("morph engine scripts not loaded");
      var ds = await ID.ensureReady();
      if (!ds || !Array.isArray(ds.paradigms) || !ds.index) throw new Error("inflection dataset unavailable");
      var maps = NA.buildResolverMaps(ds.paradigms);
      var pidMap = new Map();
      for (var i = 0; i < ds.paradigms.length; i++) {
        var p = ds.paradigms[i];
        if (p && p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p);
      }
      var index = ds.index, paradigms = ds.paradigms;
      var lookup = function (k, b) { var ix = index[String(k) + " " + String(b || "")]; return (ix != null && paradigms[ix]) ? paradigms[ix] : null; };
      // warm function-word links (small, optional, graceful)
      try { if (window.PealimFunctionLinks) window.PealimFunctionLinks.ensureReady(); } catch (_) {}
      _eng = { NA: NA, maps: maps, pidMap: pidMap, lookup: lookup };
      return _eng;
    })().catch(function (e) { _engPromise = null; throw e; });
    return _engPromise;
  }

  // Browser resolve: ensureEngine -> resolveCore -> function-word enrichment (R1 premium
  // profile + direct dict link for closed-class words, layered AFTER the parity core).
  async function resolveWordLight(surface, niqqud) {
    surface = stripNiqqud(surface);
    if (!surface) return null;
    var eng = await ensureEngine();
    var card = await resolveCore(eng, surface, niqqud);
    if (!card.pealim_url && window.PealimFunctionLinks) {
      try {
        var fl = window.PealimFunctionLinks.lookup(surface, card.pos || "", { lemma: surface });
        if (fl && fl.id != null) {
          card.pealim_id = String(fl.id);
          card.pealim_url = "https://www.pealim.com/ru/dict/" + encodeURIComponent(fl.id) + "/";
          if (fl.pos && (!card.pos || card.label === "unknown")) { card.pos = fl.pos; card.label = "function"; }
        }
      } catch (_) {}
    }
    card.pealim_direct = !!card.pealim_url;
    if (!card.pealim_url) {
      // honest search fallback — labelled as search, never a fake direct page.
      card.pealim_url = "https://www.pealim.com/ru/search/?q=" + encodeURIComponent(surface);
      card.pealim_direct = false;
    }
    return card;
  }

  // ── DOM: post-render word-wrap (Room-only; builder untouched) ───────────────
  var WRAP_FLAG = "data-rm-wrapped";

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // Rebuild a cell's innerHTML wrapping each word token in a tappable span, keeping
  // separators verbatim. data-surface/data-niqqud make spans self-contained (no
  // per-row state). value is taken from the DATA MODEL so display text is exact.
  // niqqudForCell: aligned [{surface,niqqud}] for a he cell, or null for a niqqud cell
  // (whose own tokens already carry the vowels).
  function wrapCellHtml(value, niqqudForCell) {
    var toks = tokenize(value);
    var wIdx = 0, html = "";
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (!tk.isWord) { html += escapeHtml(tk.text); continue; }
      var surface, niqqud;
      if (niqqudForCell) { var pair = niqqudForCell[wIdx] || {}; surface = pair.surface || tk.text; niqqud = pair.niqqud || ""; }
      else { surface = stripNiqqud(tk.text); niqqud = tk.text; }
      wIdx++;
      html += '<span class="rm-w" role="button" tabindex="0"' +
        ' data-surface="' + escapeHtml(surface) + '"' +
        ' data-niqqud="' + escapeHtml(niqqud) + '">' + escapeHtml(tk.text) + "</span>";
    }
    return html;
  }

  function wrapMount(mount, getRow) {
    if (!mount) return;
    var cells = mount.querySelectorAll('#proTable tbody td[data-col="he"], #proTable tbody td[data-col="niqqud"]');
    for (var i = 0; i < cells.length; i++) {
      var td = cells[i];
      if (td.getAttribute(WRAP_FLAG)) continue;
      var tr = td.closest("tr[data-row-idx]");
      var rowIdx = tr ? Number(tr.getAttribute("data-row-idx")) : NaN;
      var row = (typeof getRow === "function" && Number.isFinite(rowIdx)) ? getRow(rowIdx) : null;
      if (!row) continue;
      var col = td.getAttribute("data-col");
      if (col === "he") {
        var aligned = alignSurfaceNiqqud(String(row.he || ""), String(row.he_niqqud || ""));
        td.innerHTML = wrapCellHtml(String(row.he || ""), aligned);
      } else { // niqqud cell — tokens are self-vocalized
        td.innerHTML = wrapCellHtml(String(row.he_niqqud || ""), null);
      }
      td.setAttribute(WRAP_FLAG, "1");
    }
  }

  // ── DOM: bottom-sheet card ─────────────────────────────────────────────────
  var _sheet = null, _activeSpan = null;
  function tt(key, fallback) { try { if (typeof window !== "undefined" && typeof window.t === "function") { var v = window.t(key); if (v && v !== key) return v; } } catch (_) {} return fallback; }

  var LABEL_TEXT = {
    exact: ["room.morph.prov.exact", "точно"],
    likely: ["room.morph.prov.likely", "вероятно"],
    guessed: ["room.morph.prov.guessed", "подобрано"],
    "function": ["room.morph.prov.function", "служебное слово"],
    unknown: ["room.morph.prov.unknown", "не определено офлайн"],
  };
  var POS_TEXT = {
    verb: ["room.morph.pos.verb", "глагол"], noun: ["room.morph.pos.noun", "существительное"],
    adjective: ["room.morph.pos.adjective", "прилагательное"], preposition: ["room.morph.pos.preposition", "предлог"],
    adverb: ["room.morph.pos.adverb", "наречие"], pronoun: ["room.morph.pos.pronoun", "местоимение"],
    conjunction: ["room.morph.pos.conjunction", "союз"], numeral: ["room.morph.pos.numeral", "числительное"],
    interjection: ["room.morph.pos.interjection", "междометие"], particle: ["room.morph.pos.particle", "частица"],
    negation: ["room.morph.pos.negation", "отрицание"],
  };

  function ensureSheet() {
    if (_sheet) return _sheet;
    var el = document.createElement("div");
    el.className = "rm-sheet";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "false");
    el.hidden = true;
    el.innerHTML =
      '<div class="rm-sheet-backdrop" data-rm-close="1"></div>' +
      '<div class="rm-sheet-card" dir="rtl">' +
      '  <button type="button" class="rm-sheet-x" data-rm-close="1" aria-label="' + escapeHtml(tt("room.morph.close", "Закрыть")) + '">✕</button>' +
      '  <div class="rm-sheet-body"></div>' +
      "</div>";
    document.body.appendChild(el);
    el.addEventListener("click", function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute("data-rm-close")) closeSheet(); });
    _sheet = el;
    return el;
  }

  function closeSheet() {
    if (_sheet) { _sheet.hidden = true; _sheet.classList.remove("rm-open"); }
    if (_activeSpan) { _activeSpan.classList.remove("rm-w-active"); _activeSpan = null; }
  }

  function renderCardHtml(card) {
    if (!card) return '<div class="rm-card-empty">' + escapeHtml(tt("room.morph.empty", "Слово не распознано.")) + "</div>";
    var label = LABEL_TEXT[card.label] || LABEL_TEXT.unknown;
    var rows = "";
    var add = function (k, v, he) { if (v) rows += '<div class="rm-row"><span class="rm-k">' + escapeHtml(k) + '</span><span class="rm-v"' + (he ? ' lang="he"' : "") + ">" + escapeHtml(v) + "</span></div>"; };
    add(tt("room.morph.root", "корень"), card.root, true);
    if (card.binyan) add(tt("room.morph.binyan", "биньян"), card.binyan, false);
    if (card.pos) { var pt = POS_TEXT[card.pos]; add(tt("room.morph.posLabel", "часть речи"), pt ? tt(pt[0], pt[1]) : card.pos, false); }
    var head =
      '<div class="rm-head">' +
      '<span class="rm-word" lang="he">' + escapeHtml(card.niqqud || card.word) + "</span>" +
      '<span class="rm-prov rm-prov-' + escapeHtml(card.label) + '">' + escapeHtml(tt(label[0], label[1])) + "</span>" +
      "</div>";
    var meaning = card.meaning
      ? '<div class="rm-meaning" dir="ltr">' + escapeHtml(card.meaning) + "</div>"
      : '<div class="rm-meaning rm-meaning-empty" dir="ltr">' + escapeHtml(tt("room.morph.noGloss", "Перевод не найден офлайн.")) + "</div>";
    var linkLabel = card.pealim_direct ? tt("room.morph.pealimPage", "Открыть на Pealim") : tt("room.morph.pealimSearch", "Искать на Pealim");
    var link = card.pealim_url
      ? '<a class="rm-link" href="' + escapeHtml(card.pealim_url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(linkLabel) + " ↗</a>"
      : "";
    return head + meaning + '<div class="rm-rows">' + rows + "</div>" + '<div class="rm-actions">' + link + "</div>";
  }

  function openCardLoading() {
    var el = ensureSheet();
    el.querySelector(".rm-sheet-body").innerHTML = '<div class="rm-loading">' + escapeHtml(tt("room.morph.loading", "Анализ…")) + "</div>";
    el.hidden = false; el.classList.add("rm-open");
  }
  function openCard(card) {
    var el = ensureSheet();
    el.querySelector(".rm-sheet-body").innerHTML = renderCardHtml(card);
    el.hidden = false; el.classList.add("rm-open");
  }

  // ── Public: attach the learner layer to a painted reader mount ──────────────
  //   attach(mount, { getRow })  — getRow(rowIdx) -> row model (he, he_niqqud).
  // Returns { detach, refresh }. Idempotent per cell (WRAP_FLAG).
  function attach(mount, opts) {
    opts = opts || {};
    if (!mount) return { detach: function () {}, refresh: function () {} };
    var getRow = typeof opts.getRow === "function" ? opts.getRow : function () { return null; };

    var refresh = function () { try { wrapMount(mount, getRow); } catch (_) {} };
    refresh();

    var onActivate = async function (span) {
      if (_activeSpan) _activeSpan.classList.remove("rm-w-active");
      _activeSpan = span; span.classList.add("rm-w-active");
      var surface = span.getAttribute("data-surface") || span.textContent || "";
      var niqqud = span.getAttribute("data-niqqud") || "";
      openCardLoading();
      try { var card = await resolveWordLight(surface, niqqud); if (_activeSpan === span) openCard(card); }
      catch (e) { if (_activeSpan === span) openCard(null); }
    };

    var onClick = function (e) {
      var span = e.target && e.target.closest ? e.target.closest(".rm-w") : null;
      if (span && mount.contains(span)) { e.preventDefault(); e.stopPropagation(); onActivate(span); }
    };
    var onKey = function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var span = e.target && e.target.closest ? e.target.closest(".rm-w") : null;
      if (span && mount.contains(span)) { e.preventDefault(); e.stopPropagation(); onActivate(span); }
    };
    var onDocKey = function (e) { if (e.key === "Escape") closeSheet(); };

    // Capture phase so a word tap is handled BEFORE reader-core's row-audio delegate.
    mount.addEventListener("click", onClick, true);
    mount.addEventListener("keydown", onKey);
    document.addEventListener("keydown", onDocKey);

    return {
      refresh: refresh,
      detach: function () {
        mount.removeEventListener("click", onClick, true);
        mount.removeEventListener("keydown", onKey);
        document.removeEventListener("keydown", onDocKey);
        closeSheet();
      },
    };
  }

  var API = {
    // pure core (Node-testable)
    tokenize: tokenize, words: words, alignSurfaceNiqqud: alignSurfaceNiqqud,
    stripNiqqud: stripNiqqud, provenanceLabel: provenanceLabel, resolveCore: resolveCore,
    wrapCellHtml: wrapCellHtml, isWordChar: isWordChar,
    // browser
    ensureEngine: ensureEngine, resolveWordLight: resolveWordLight, attach: attach,
    closeSheet: closeSheet,
  };

  if (typeof window !== "undefined") window.ReaderMorph = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
