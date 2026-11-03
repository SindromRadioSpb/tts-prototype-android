"use strict";
// Atlas P5 — the exam-skill trainer (plan docs/planning/ENGINEERING_ATLAS_P5_TRAINER_PLAN_2026_11_03.md).
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { parseHTML } = require("linkedom");
const T = require("../public/js/atlas-train.js");

const ALL = { he: true, niqqud: true, translit: true, ru: true, script: "lat" };

// ---- G1: translation stages ----
test("stage 0 keeps the reader's own columns", () => {
  assert.deepEqual(T.layersFor(0, ALL), ALL);
  const mine = { he: false, niqqud: true, translit: false, ru: true, script: "cyr" };
  assert.deepEqual(T.layersFor(0, mine), mine);
});

test("stages 1 and 2 hide the translation and the transliteration, keep the Hebrew columns", () => {
  for (const s of [1, 2]) {
    assert.deepEqual(T.layersFor(s, ALL), { he: true, niqqud: true, translit: false, ru: false, script: "lat" });
    assert.deepEqual(T.layersFor(s, { he: false, niqqud: true, translit: true, ru: true, script: "cyr" }),
      { he: false, niqqud: true, translit: false, ru: false, script: "cyr" });
  }
});

test("stages 1 and 2 never leave a row without Hebrew when the reader kept only the transliteration", () => {
  const onlyTranslit = { he: false, niqqud: false, translit: true, ru: true, script: "lat" };
  const l = T.layersFor(1, onlyTranslit);
  assert.equal(l.he || l.niqqud, true);
  assert.equal(l.translit, false);
});

test("stage 3 is the book: plain Hebrew only, no pointing (owner Г1)", () => {
  assert.deepEqual(T.layersFor(3, ALL), { he: true, niqqud: false, translit: false, ru: false, script: "lat" });
  assert.deepEqual(T.layersFor(3, { he: false, niqqud: true, translit: false, ru: true, script: "lat" }),
    { he: true, niqqud: false, translit: false, ru: false, script: "lat" });
});

test("gloss policy per stage", () => {
  assert.deepEqual([0, 1, 2, 3].map(T.glossPolicy), ["none", "unknown", "terms", "none"]);
});

test("the stage of a section: missing, broken or out-of-range values are stage 0", () => {
  assert.equal(T.stageOf(null, "s01"), 0);
  assert.equal(T.stageOf({}, "s01"), 0);
  assert.equal(T.stageOf({ s01: 7 }, "s01"), 0);
  assert.equal(T.stageOf({ s01: "2" }, "s01"), 2);
  assert.equal(T.stageOf({ s01: 3, s02: 1 }, "s02"), 1);
  const next = T.setStage({ s01: 1 }, "s02", 3);
  assert.deepEqual(next, { s01: 1, s02: 3 });
  assert.deepEqual(T.setStage({ s01: 1 }, "s01", 0), {}, "stage 0 is the default and is not stored");
});

test("a known word: know/known, almost-known (l4) and do-not-learn", () => {
  for (const s of ["know", "known", "l4", "ignore"]) assert.equal(T.isKnownStatus(s), true, s);
  for (const s of ["", "new", "l1", "l2", "l3", "learning", undefined]) assert.equal(T.isKnownStatus(s), false, String(s));
});

test("next-stage hint: 80% strong terms and at least 5; never past stage 3 (owner Г2)", () => {
  assert.equal(T.nextStageHint(0, { termsTotal: 5, termsStrong: 3 }), null);
  assert.deepEqual(T.nextStageHint(0, { termsTotal: 5, termsStrong: 4 }), { stage: 1, share: 0.8 });
  assert.deepEqual(T.nextStageHint(2, { termsTotal: 10, termsStrong: 10 }), { stage: 3, share: 1 });
  assert.equal(T.nextStageHint(1, { termsTotal: 4, termsStrong: 4 }), null, "too few terms to judge");
  assert.equal(T.nextStageHint(3, { termsTotal: 10, termsStrong: 10 }), null);
  assert.equal(T.nextStageHint(0, null), null);
});

// a section row as the reader renders it once the word card wrapped the Hebrew words
function sectionDom() {
  const { document } = parseHTML(`<!doctype html><html><body><div class="atlas-section">
    <div class="atlas-row" data-ref="b1" data-wg-row="1">
      <div class="atlas-he atlas-niqqud" data-col="niqqud"><span class="rm-w" data-w-offset="0">כֹּחַ</span> <span class="rm-w" data-w-offset="1">הֶיקֵּפִי</span> <span class="rm-w rm-w-l4" data-w-offset="2">גָּדוֹל</span></div>
      <div class="atlas-he" data-col="he"><span class="rm-w" data-w-offset="0">כוח</span> <span class="rm-w" data-w-offset="1">היקפי</span> <span class="rm-w" data-w-offset="2">גדול</span></div>
      <div class="atlas-ru" data-col="ru">Большая окружная сила</div>
    </div>
    <div class="atlas-row" data-ref="b2" data-wg-row="1">
      <div class="atlas-he" data-col="he"><span class="rm-w" data-w-offset="0">רצועה</span></div>
    </div>
  </div></body></html>`);
  return document.querySelector(".atlas-section");
}
const ctx = {
  terms: { "a97002:term:tangential-force": { lemma_he: "כוח היקפי", senses: [{ sense: "tf", ru: "окружная сила" }] } },
  located: (id) => (id === "b1"
    ? { he: { spans: [{ from: 0, to: 1, id: "a97002:term:tangential-force", sense: "tf" }] },
      niqqud: { spans: [{ from: 0, to: 1, id: "a97002:term:tangential-force", sense: "tf" }] }, loose: [] }
    : { he: { spans: [] }, niqqud: { spans: [] }, loose: [] }),
};
const GL = { b1: ["сила", "окружная", "большая"], b2: ["ремень"] };
const wordAt = (row, k) => { const g = GL[row.getAttribute("data-ref")]; return g && g[k] ? { gloss: g[k] } : null; };
const glossOf = (sec, ref, col, k) => sec.querySelector(`[data-ref="${ref}"] [data-col="${col}"] .rm-w[data-w-offset="${k}"]`).getAttribute("data-atlas-gloss");

test("stage 1: every unknown word gets its in-context gloss, a known word does not", () => {
  const sec = sectionDom();
  const r = T.paintStage(sec, 1, ctx, wordAt);
  assert.equal(glossOf(sec, "b1", "niqqud", 0), "сила");
  assert.equal(glossOf(sec, "b1", "he", 1), "окружная");
  assert.equal(glossOf(sec, "b1", "niqqud", 2), null, "l4 is almost known: no gloss");
  assert.equal(glossOf(sec, "b2", "he", 0), "ремень");
  assert.equal(r.painted > 0, true);
  assert.equal(sec.classList.contains("atlas-stage-1"), true);
});

test("stage 2: only the words of a term, its reviewed sense once on the first word", () => {
  const sec = sectionDom();
  T.paintStage(sec, 2, ctx, wordAt);
  assert.equal(glossOf(sec, "b1", "niqqud", 0), "окружная сила");
  assert.equal(glossOf(sec, "b1", "niqqud", 1), "", "second word of the term: marked, no repeated meaning");
  assert.equal(glossOf(sec, "b1", "niqqud", 2), null);
  assert.equal(glossOf(sec, "b2", "he", 0), null);
});

test("stage 3 and stage 0 leave no gloss; changing stage removes the previous one", () => {
  const sec = sectionDom();
  T.paintStage(sec, 1, ctx, wordAt);
  T.paintStage(sec, 3, ctx, wordAt);
  assert.equal(sec.querySelectorAll("[data-atlas-gloss]").length, 0);
  assert.equal(sec.classList.contains("atlas-stage-3"), true);
  assert.equal(sec.classList.contains("atlas-stage-1"), false);
  T.paintStage(sec, 0, ctx, wordAt);
  assert.equal(sec.className.includes("atlas-stage-"), false);
});

test("stage 1 without the in-context layer reports it instead of painting nothing silently", () => {
  const sec = sectionDom();
  const r = T.paintStage(sec, 1, ctx, () => null);
  assert.equal(r.painted, 0);
  assert.equal(r.missing, true);
});

test("the stylesheet hides the gloss of a known word even when its status arrives after painting", () => {
  const css = fs.readFileSync(path.join(__dirname, "../public/css/atlas-reader.css"), "utf8");
  for (const c of ["rm-w-known", "rm-w-l4", "rm-w-ignore"]) assert.match(css, new RegExp("atlas-stage-1 \\.rm-w\\." + c + "\\[data-atlas-gloss\\]::before"), c);
});

// ---- G1: the «Тренировать» panel ----
test("the train panel: four stages, the current one checked, a choice reported and described", () => {
  const { document, window } = parseHTML("<!doctype html><html><body><div class=\"atlas-root\"><div id=\"bar\"></div></div></body></html>");
  global.window = global.window || window;
  const UI = require("../public/js/atlas-train-ui.js");
  const chosen = [];
  const p = UI.panel(document, { T: (k, fb) => fb, stage: 1, onStage: (n) => chosen.push(n) });
  document.getElementById("bar").append(p.btn, p.panel);
  assert.ok(p.panel.hasAttribute("hidden"));
  p.btn.dispatchEvent(new window.Event("click"));
  assert.ok(!p.panel.hasAttribute("hidden"));
  assert.equal(p.btn.getAttribute("aria-expanded"), "true");
  const chips = p.panel.querySelectorAll("[data-stage]");
  assert.equal(chips.length, 4);
  assert.equal(p.panel.querySelector('[data-stage="1"]').getAttribute("aria-checked"), "true");
  const desc1 = p.panel.querySelector(".atlas-stage-desc").textContent;
  p.panel.querySelector('[data-stage="3"]').dispatchEvent(new window.Event("click"));
  assert.deepEqual(chosen, [3]);
  assert.equal(p.panel.querySelector('[data-stage="3"]').getAttribute("aria-checked"), "true");
  assert.equal(p.panel.querySelector('[data-stage="1"]').getAttribute("aria-checked"), "false");
  assert.notEqual(p.panel.querySelector(".atlas-stage-desc").textContent, desc1);
  p.note("Для этого раздела подстрочника нет.");
  assert.ok(!p.panel.querySelector(".atlas-train-note").hidden);
  p.note(null);
  assert.ok(p.panel.querySelector(".atlas-train-note").hidden);
  const esc = new window.Event("keydown"); esc.key = "Escape"; p.panel.dispatchEvent(esc);
  assert.ok(p.panel.hasAttribute("hidden"));
});

test("the next-stage hint offers one button and changes nothing by itself (owner Г2)", () => {
  const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
  const UI = require("../public/js/atlas-train-ui.js");
  const chosen = [];
  const p = UI.panel(document, { T: (k, fb) => fb, stage: 0, onStage: (n) => chosen.push(n) });
  p.hint({ stage: 1, share: 0.85 });
  const box = p.panel.querySelector(".atlas-stage-hint");
  assert.ok(!box.hidden);
  assert.match(box.textContent, /85/);
  assert.deepEqual(chosen, []);
  box.querySelector("button").dispatchEvent(new window.Event("click"));
  assert.deepEqual(chosen, [1]);
  p.hint(null);
  assert.ok(box.hidden);
});
