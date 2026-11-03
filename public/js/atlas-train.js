// Atlas P5 — the exam-skill trainer, core without the Room (plan ENGINEERING_ATLAS_P5_TRAINER_PLAN_2026_11_03.md).
// Translation stages per section: 0 full translation → 1 gloss under unknown words → 2 terms only → 3 the book (plain
// Hebrew, a tap opens the word card). A stage is a view preference of the device: nothing here writes memory.
(function (root, factory) {
  var api = factory();
  root.AtlasTrain = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var STAGES = [0, 1, 2, 3];
  var STAGE_CLASSES = STAGES.map(function (s) { return "atlas-stage-" + s; });
  var KNOWN = { know: 1, known: 1, l4: 1, ignore: 1 };
  var KNOWN_CLASSES = ["rm-w-known", "rm-w-l4", "rm-w-ignore"];
  var HINT_SHARE = 0.8, HINT_MIN_TERMS = 5;

  function stageOf(store, sid) {
    var n = store && typeof store === "object" ? Number(store[sid]) : 0;
    return STAGES.indexOf(n) >= 0 ? n : 0;
  }
  function setStage(store, sid, n) {
    var out = {};
    Object.keys(store || {}).forEach(function (k) { if (k !== sid && stageOf(store, k)) out[k] = stageOf(store, k); });
    if (STAGES.indexOf(Number(n)) > 0) out[sid] = Number(n);
    return out;
  }
  // The columns shown at a stage. The reader's saved columns are not changed: stage 0 gives them back as they were.
  function layersFor(stage, layers) {
    var l = Object.assign({}, layers || {});
    if (!stage) return l;
    if (stage === 3) return { he: true, niqqud: false, translit: false, ru: false, script: l.script };
    var out = { he: !!l.he, niqqud: !!l.niqqud, translit: false, ru: false, script: l.script };
    if (!out.he && !out.niqqud) out.niqqud = true;   // a row always keeps its Hebrew
    return out;
  }
  function glossPolicy(stage) { return stage === 1 ? "unknown" : stage === 2 ? "terms" : "none"; }
  function isKnownStatus(status) { return !!KNOWN[String(status || "")]; }
  // { stage, share } when the section's terms are strong enough for the next stage; the reader decides (owner Г2)
  function nextStageHint(stage, stats) {
    if (!stats || stage >= 3) return null;
    var total = Number(stats.termsTotal) || 0, strong = Number(stats.termsStrong) || 0;
    if (total < HINT_MIN_TERMS) return null;
    var share = strong / total;
    return share >= HINT_SHARE ? { stage: stage + 1, share: share } : null;
  }

  function knownSpan(w) {
    for (var i = 0; i < KNOWN_CLASSES.length; i++) if (w.classList.contains(KNOWN_CLASSES[i])) return true;
    return false;
  }
  // Puts the stage's gloss on the wrapped words of a section: data-atlas-gloss (CSS shows it under the word).
  // wordAt(row, k) → { gloss } from «В контексте (ИИ)»; ctx — AtlasWords.sectionContext (term places and senses).
  // → { painted, missing }: missing = stage 1 asked for glosses and the section has none.
  function paintStage(section, stage, ctx, wordAt) {
    var out = { painted: 0, missing: false };
    if (!section) return out;
    STAGE_CLASSES.forEach(function (c) { section.classList.remove(c); });
    if (stage) section.classList.add("atlas-stage-" + stage);
    var policy = glossPolicy(stage);
    section.querySelectorAll(".atlas-row[data-ref]").forEach(function (row) {
      var id = row.getAttribute("data-ref");
      var loc = policy === "terms" && ctx && typeof ctx.located === "function" ? ctx.located(id) : null;
      row.querySelectorAll("[data-col] .rm-w[data-w-offset]").forEach(function (w) {
        var k = Number(w.getAttribute("data-w-offset")), val = null;
        if (policy === "unknown" && !knownSpan(w)) {
          var g = typeof wordAt === "function" ? wordAt(row, k) : null;
          if (g && g.gloss) val = String(g.gloss);
        } else if (loc) {
          var cell = w.closest("[data-col]"), spans = (cell && cell.getAttribute("data-col") === "niqqud" ? loc.niqqud : loc.he).spans || [];
          for (var i = 0; i < spans.length; i++) {
            var sp = spans[i];
            if (k < sp.from || k > sp.to) continue;
            if (k === sp.from) {
              var term = ctx.terms && ctx.terms[sp.id], senses = (term && term.senses) || [];
              var sense = senses.filter(function (s) { return s && s.sense === sp.sense; })[0] || senses[0] || {};
              val = String(sense.ru || "");
            } else val = "";
            break;
          }
        }
        if (val === null) { if (w.hasAttribute("data-atlas-gloss")) w.removeAttribute("data-atlas-gloss"); return; }
        if (w.getAttribute("data-atlas-gloss") !== val) w.setAttribute("data-atlas-gloss", val);
        if (val) out.painted++;
      });
    });
    out.missing = policy === "unknown" && out.painted === 0;
    return out;
  }

  // ---- G2: personal terms and the atlas additions file (owner 2026-11-03) ----
  var NIQQUD = /[֑-ׇ]/g;
  function skeletonOf(s) {
    return String(s == null ? "" : s).replace(NIQQUD, "").replace(/[^א-ת]+/g, " ").trim();
  }
  // the identity of a term across spellings: pointed text drops the matres (כֹּחַ for כוח), so ו and י inside a word
  // do not count
  function looseOf(s) {
    return skeletonOf(s).split(" ").map(function (w) { return w.charAt(0) + w.slice(1).replace(/[וי]/g, ""); }).join(" ");
  }
  function fnv32(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("0000000" + h.toString(16)).slice(-8);
  }
  // 'a97002:term:u-<8 hex>' from the spelling without pointing: adding the same term again finds the same id
  function personalTermId(atlasId, lemmaHe) {
    var sk = looseOf(lemmaHe);
    return sk && atlasId ? String(atlasId) + ":term:u-" + fnv32(sk) : null;
  }
  function findTermDuplicate(terms, lemmaHe) {
    var sk = looseOf(lemmaHe);
    if (!sk) return null;
    var ids = Object.keys(terms || {});
    for (var i = 0; i < ids.length; i++) if (looseOf(terms[ids[i]] && terms[ids[i]].lemma_he) === sk) return ids[i];
    return null;
  }
  // { atlasId, lemmaHe, niqqud?, ru, scope: 'section' | 'atlas', sid, block? } → a term of the atlas shape, or null
  function makePersonalTerm(o) {
    o = o || {};
    var id = personalTermId(o.atlasId, o.lemmaHe), ru = String(o.ru || "").replace(/\s+/g, " ").trim();
    if (!id || !ru) return null;
    var pointed = String(o.niqqud || (NIQQUD.test(String(o.lemmaHe)) ? o.lemmaHe : "")).trim();
    NIQQUD.lastIndex = 0;
    return { id: id, lemma_he: skeletonOf(o.lemmaHe), niqqud: pointed, translit: "", translit_ru: "",
      senses: [{ sense: "main", ru: ru, context: String(o.sid || "") }], personal: true,
      scope: o.scope === "section" && o.sid ? "section" : "atlas", sid: String(o.sid || ""), block: String(o.block || ""),
      at: Number(o.at) || 0 };
  }
  // The terms of a section: the atlas's own, plus personal ones of this section or of the whole atlas; an atlas
  // term with the same id wins (after the owner moved a personal term into the additions file).
  function mergeTerms(sectionTerms, personal, sid) {
    var out = Object.assign({}, sectionTerms || {});
    (personal || []).forEach(function (t) {
      if (!t || !t.id || out[t.id]) return;
      if (t.scope === "section" && t.sid !== sid) return;
      out[t.id] = t;
    });
    return out;
  }
  // personal terms → lines of scripts/atlas/terms/<atlas>-additions.jsonl (sections: [] = every section where it occurs)
  function exportAdditions(personal) {
    return (personal || []).filter(Boolean).map(function (t) {
      return JSON.stringify({ id: t.id, lemma_he: t.lemma_he, niqqud: t.niqqud || "", translit: t.translit || "",
        translit_ru: t.translit_ru || "", senses: (t.senses || []).map(function (s) { return { sense: s.sense, ru: s.ru, context: s.context || "" }; }),
        sections: t.scope === "section" && t.sid ? [t.sid] : [] });
    }).join("\n") + "\n";
  }
  // a file back into personal terms; a line that does not hold is rejected with its reason, never taken half-way
  function parseAdditions(text) {
    var out = { terms: [], rejected: [] };
    String(text || "").split(/\r?\n/).forEach(function (line, i) {
      if (!line.trim()) return;
      var x;
      try { x = JSON.parse(line); } catch (_) { out.rejected.push({ line: i + 1, reason: "json" }); return; }
      var m = /^([a-z0-9]+):term:u-[0-9a-f]{8}$/.exec(String(x && x.id || ""));
      if (!m || personalTermId(m[1], x.lemma_he) !== x.id) { out.rejected.push({ line: i + 1, reason: "id" }); return; }
      if (x.niqqud && looseOf(x.niqqud) !== looseOf(x.lemma_he)) { out.rejected.push({ line: i + 1, reason: "niqqud" }); return; }
      var sense = Array.isArray(x.senses) && x.senses[0];
      if (!sense || !String(sense.ru || "").trim()) { out.rejected.push({ line: i + 1, reason: "ru" }); return; }
      var sid = Array.isArray(x.sections) && x.sections.length === 1 ? String(x.sections[0]) : "";
      var t = makePersonalTerm({ atlasId: m[1], lemmaHe: x.lemma_he, niqqud: x.niqqud, ru: sense.ru, scope: sid ? "section" : "atlas", sid: sid });
      t.senses[0].context = String(sense.context || sid);
      out.terms.push(t);
    });
    return out;
  }

  // ---- G3: section terms in SRS — the atlas's own target kind (3 of 4 terms are phrases: no lemma key exists) ----
  var TERM_KEY = /^at1:([a-z0-9]+):([a-z0-9-]+)#([A-Za-z0-9_-]+)$/;
  var STRONG_DAYS = 7;
  function termKey(atlasId, termId, sense) {
    var m = /^([a-z0-9]+):term:([a-z0-9-]+)$/.exec(String(termId || ""));
    if (!m || m[1] !== String(atlasId) || !/^[A-Za-z0-9_-]+$/.test(String(sense || ""))) return null;
    return "at1:" + m[1] + ":" + m[2] + "#" + sense;
  }
  function parseTermKey(key) {
    var m = TERM_KEY.exec(String(key || ""));
    return m ? { atlasId: m[1], termId: m[1] + ":term:" + m[2], sense: m[3] } : null;
  }
  function isTermKey(key) { return !!parseTermKey(key); }
  // The terms of an open section (ctx = AtlasWords.sectionContext with setPersonal), one item per sense, in the order
  // of their first place: { key, termId, sense, title, plain, translit, translit_ru, ru, personal, block, from, to }.
  // A link the text does not show keeps its paragraph without a word position (from/to null).
  function sectionTermItems(ctx) {
    var out = [], seen = {};
    if (!ctx || !ctx.items) return out;
    function add(id, sense, block, from, to) {
      var k = termKey(ctx.atlasId, id, sense), term = ctx.terms && ctx.terms[id];
      if (!k || seen[k] || !term) return;
      var sn = (term.senses || []).filter(function (s) { return s && s.sense === sense; })[0];
      if (!sn || !sn.ru) return;
      seen[k] = true;
      out.push({ key: k, termId: id, sense: sense, title: term.niqqud || term.lemma_he || "", plain: term.lemma_he || "",
        translit: term.translit || "", translit_ru: term.translit_ru || "", ru: sn.ru, personal: !!term.personal,
        block: block, from: from, to: to });
    }
    ctx.items.forEach(function (it, id) {
      var loc = ctx.located(id);
      if (!loc) return;
      (loc.he.spans || []).forEach(function (sp) { add(sp.id, sp.sense, id, sp.from, sp.to); });
      (loc.loose || []).forEach(function (r) { add(r.id, r.sense, id, null, null); });
    });
    return out;
  }
  // states: key → { status, due, stability } (the device's projection); → { termsTotal, termsStrong, due, fresh }
  function termStats(keys, states, nowMs) {
    var out = { termsTotal: 0, termsStrong: 0, due: 0, fresh: 0 };
    (keys || []).forEach(function (k) {
      var s = (states && states[k]) || {};
      out.termsTotal++;
      if (Number(s.stability) >= STRONG_DAYS || s.status === "l4" || s.status === "known" || s.status === "know") out.termsStrong++;
      if (s.due) { if (Number(s.due) <= nowMs) out.due++; } else out.fresh++;
    });
    return out;
  }
  // a session: due terms (oldest due first), then never reviewed ones in book order; limit n
  function sessionOrder(items, states, nowMs, n, opts) {
    var due = [], fresh = [];
    (items || []).forEach(function (it) {
      var s = (states && states[it.key]) || {};
      if (s.due) { if (Number(s.due) <= nowMs) due.push(it); } else fresh.push(it);
    });
    due.sort(function (a, b) { return Number(states[a.key].due) - Number(states[b.key].due); });
    var list = opts && opts.dueOnly ? due : due.concat(fresh);
    return list.slice(0, Math.max(0, Number(n) || 0));
  }

  // ---- G4: «Найди в книге» — the answer is where the fragment stands (section, page): data, never a model ----
  // answer { sid, page } → { section: bool, page: 'exact' | 'near' | 'wrong' } (near = ±1 page of the right section, Г3)
  function checkFind(item, answer) {
    var section = !!(item && answer && answer.sid === item.sid);
    var p = answer && answer.page != null && answer.page !== "" ? Number(answer.page) : NaN;
    var page = "wrong";
    if (section && isFinite(p)) page = p === Number(item.page) ? "exact" : Math.abs(p - Number(item.page)) === 1 ? "near" : "wrong";
    return { section: section, page: page };
  }
  // a fragment: of this section when opts.sid, never a stale one, unseen first (all seen → start again)
  function pickFind(bank, opts) {
    opts = opts || {};
    var rnd = typeof opts.rnd === "function" ? opts.rnd : Math.random;
    var seen = opts.seen || new Set(), stale = opts.stale || new Set();
    var pool = ((bank && bank.items) || []).filter(function (x) { return x && (!opts.sid || x.sid === opts.sid) && !stale.has(x.id); });
    if (!pool.length) return null;
    var fresh = pool.filter(function (x) { return !seen.has(x.id); });
    var from = fresh.length ? fresh : pool;
    return from[Math.min(from.length - 1, Math.floor(rnd() * from.length))];
  }
  function findStats(history) {
    var h = Array.isArray(history) ? history : [], n = h.length;
    if (!n) return { attempts: 0, sectionRate: 0, pageRate: 0, nearRate: 0, medianMs: 0 };
    var ms = h.map(function (x) { return Number(x.ms) || 0; }).sort(function (a, b) { return a - b; });
    var med = n % 2 ? ms[(n - 1) / 2] : (ms[n / 2 - 1] + ms[n / 2]) / 2;
    var count = function (f) { return h.filter(f).length / n; };
    return { attempts: n, sectionRate: count(function (x) { return x.section; }), pageRate: count(function (x) { return x.page === "exact"; }),
      nearRate: count(function (x) { return x.page === "near"; }), medianMs: med };
  }

  // ---- G5: «Что это за символ?» — a formula without its table: the meaning (and unit) of each symbol ----
  // Questions come from the section's own symbol tables; the other options are meanings/units of the same section.
  // opts: { rnd, lang: 'ru' | 'he' } (Hebrew options on stages 2–3, owner Г5) → [{ formulaId, page, latex, mathml,
  //   symbols: [{ latex, mathml, answer: { text, ru, he, unit }, options: { meaning: [4 texts], unit: [4] | null } }] }]
  function symbolQuestions(section, opts) {
    opts = opts || {};
    var rnd = typeof opts.rnd === "function" ? opts.rnd : Math.random, he = opts.lang === "he";
    var textOf = function (v) { return String((he && v.he) || v.ru || "").trim(); };
    var formulas = [], meanings = [], units = [];
    ((section && section.pages) || []).forEach(function (p) {
      (p.items || []).forEach(function (it) {
        if (!it || it.type !== "formula") return;
        // in Hebrew only symbols described in Hebrew: the options never mix languages
        var vars = (it.vars || []).filter(function (v) { return v && String(v.ru || "").trim() && (!he || /[א-ת]/.test(String(v.he || ""))); });
        vars.forEach(function (v) {
          var known = meanings.filter(function (m) { return m.text === textOf(v); })[0];
          if (known) { if (known.syms.indexOf(v.latex) < 0) known.syms.push(v.latex); }
          else meanings.push({ text: textOf(v), ru: String(v.ru).trim(), syms: [v.latex] });
          if (v.unit && units.indexOf(v.unit) < 0) units.push(v.unit);
        });
        if (vars.length >= 2) formulas.push({ it: it, page: p.page, vars: vars });
      });
    });
    function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function pick3(pool) { return shuffle(pool).slice(0, 3); }
    return formulas.map(function (f) {
      return { formulaId: f.it.id, page: f.page, latex: f.it.latex || "", mathml: f.it.mathml || "",
        symbols: f.vars.map(function (v) {
          var answer = { text: textOf(v), ru: String(v.ru).trim(), he: String(v.he || ""), unit: String(v.unit || "") };
          // the same symbol described otherwise elsewhere may be the same quantity: never a wrong option
          var others = meanings.filter(function (m) { return m.ru !== answer.ru && m.text !== answer.text && m.syms.indexOf(v.latex) < 0; }).map(function (m) { return m.text; });
          var otherUnits = units.filter(function (u) { return u !== answer.unit; });
          return { latex: v.latex, mathml: v.mathml || "", answer: answer,
            options: { meaning: others.length >= 3 ? shuffle(pick3(others).concat([answer.text])) : null,
              unit: answer.unit && otherUnits.length >= 3 ? shuffle(pick3(otherUnits).concat([answer.unit])) : null } };
        }).filter(function (s) { return s.options.meaning; }) };
    }).filter(function (q) { return q.symbols.length; });
  }
  // picks { meaning: text, unit } → { meaning: bool, unit: bool | null }
  function checkSymbol(sym, picks) {
    picks = picks || {};
    return { meaning: !!sym && picks.meaning === sym.answer.text,
      unit: sym && sym.options && sym.options.unit ? picks.unit === sym.answer.unit : null };
  }

  return { STAGES: STAGES, stageOf: stageOf, symbolQuestions: symbolQuestions, checkSymbol: checkSymbol, checkFind: checkFind, pickFind: pickFind, findStats: findStats,
    termKey: termKey, parseTermKey: parseTermKey, isTermKey: isTermKey, sectionTermItems: sectionTermItems,
    termStats: termStats, sessionOrder: sessionOrder, STRONG_DAYS: STRONG_DAYS, setStage: setStage, layersFor: layersFor, glossPolicy: glossPolicy,
    isKnownStatus: isKnownStatus, nextStageHint: nextStageHint, paintStage: paintStage,
    HINT_SHARE: HINT_SHARE, HINT_MIN_TERMS: HINT_MIN_TERMS,
    skeletonOf: skeletonOf, personalTermId: personalTermId, findTermDuplicate: findTermDuplicate, makePersonalTerm: makePersonalTerm,
    mergeTerms: mergeTerms, exportAdditions: exportAdditions, parseAdditions: parseAdditions };
});
