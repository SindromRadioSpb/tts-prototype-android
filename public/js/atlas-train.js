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

  return { STAGES: STAGES, stageOf: stageOf, setStage: setStage, layersFor: layersFor, glossPolicy: glossPolicy,
    isKnownStatus: isKnownStatus, nextStageHint: nextStageHint, paintStage: paintStage,
    HINT_SHARE: HINT_SHARE, HINT_MIN_TERMS: HINT_MIN_TERMS };
});
