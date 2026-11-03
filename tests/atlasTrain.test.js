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

// ---- G2: adding terms (owner 2026-11-03) ----
test("a personal term id comes from the spelling without pointing, so adding it again finds the same term", () => {
  const a = T.personalTermId("a97002", "כוח היקפי"), b = T.personalTermId("a97002", "כֹּחַ הֶיקֵּפִי");
  assert.match(a, /^a97002:term:u-[0-9a-f]{8}$/);
  assert.equal(a, b);
  assert.notEqual(a, T.personalTermId("a97002", "כוח"));
  assert.equal(T.personalTermId("a97002", "abc"), null, "no Hebrew — no term");
});

test("a term that is already in the atlas is found instead of a duplicate", () => {
  const terms = { "a97002:term:force": { lemma_he: "כוח", niqqud: "כֹּחַ", senses: [{ sense: "force", ru: "сила" }] } };
  assert.equal(T.findTermDuplicate(terms, "כֹּחַ"), "a97002:term:force");
  assert.equal(T.findTermDuplicate(terms, "כוח היקפי"), null);
});

test("a personal term: Hebrew and a meaning are required; one sense «main»", () => {
  const t = T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "כוח היקפי", niqqud: "כֹּחַ הֶיקֵּפִי", ru: " окружная сила ", scope: "section", sid: "s09-belt", block: "a97002:p197:b003" });
  assert.equal(t.id, T.personalTermId("a97002", "כוח היקפי"));
  assert.equal(t.lemma_he, "כוח היקפי");
  assert.equal(t.niqqud, "כֹּחַ הֶיקֵּפִי");
  assert.deepEqual(t.senses, [{ sense: "main", ru: "окружная сила", context: "s09-belt" }]);
  assert.equal(t.personal, true);
  assert.equal(t.scope, "section");
  assert.equal(T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "כוח", ru: "" }), null);
  assert.equal(T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "abc", ru: "x" }), null);
  assert.equal(T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "כוח", ru: "сила", scope: "x" }).scope, "atlas");
});

test("merge: the atlas term wins over a personal one with the same id; section scope stays in its section", () => {
  const official = { "a97002:term:force": { lemma_he: "כוח", senses: [{ sense: "force", ru: "сила" }] } };
  const mine = [
    T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "כוח היקפי", ru: "окружная сила", scope: "section", sid: "s09-belt" }),
    T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "רצועה", ru: "ремень", scope: "atlas", sid: "s09-belt" }),
  ];
  const s09 = T.mergeTerms(official, mine, "s09-belt"), s10 = T.mergeTerms(official, mine, "s10-spur-gears");
  assert.equal(Object.keys(s09).length, 3);
  assert.equal(Object.keys(s10).length, 2, "a section-scoped term does not reach another section");
  assert.ok(s10[mine[1].id], "an atlas-wide term reaches every section");
  const promoted = Object.assign({}, official, { [mine[0].id]: { lemma_he: "כוח היקפי", senses: [{ sense: "main", ru: "окружная сила" }] } });
  const m = T.mergeTerms(promoted, mine, "s09-belt");
  assert.equal(m[mine[0].id].personal, undefined, "after the term moved into the atlas file the atlas copy is shown");
  assert.equal(Object.keys(official).length, 1, "inputs are not changed");
});

test("export → import: the personal terms travel as lines of the atlas additions file", () => {
  const mine = [
    T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "כוח היקפי", niqqud: "כֹּחַ הֶיקֵּפִי", ru: "окружная сила", scope: "section", sid: "s09-belt" }),
    T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "רצועה", niqqud: "רְצוּעָה", ru: "ремень", scope: "atlas", sid: "s09-belt" }),
  ];
  const text = T.exportAdditions(mine);
  const lines = text.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].sections, ["s09-belt"]);
  assert.deepEqual(lines[1].sections, [], "atlas-wide: every section where it occurs");
  const back = T.parseAdditions(text);
  assert.deepEqual(back.rejected, []);
  assert.deepEqual(back.terms.map((t) => [t.id, t.scope, t.senses[0].ru]), mine.map((t) => [t.id, t.scope, t.senses[0].ru]));
});

test("import rejects a line with a reason instead of taking it half-way", () => {
  const ok = T.exportAdditions([T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "רצועה", ru: "ремень", scope: "atlas" })]).trim();
  const bad = [
    "{not json",
    JSON.stringify({ id: "x:term:u-00000000", lemma_he: "רצועה", senses: [{ sense: "main", ru: "ремень" }] }),
    JSON.stringify({ id: T.personalTermId("a97002", "רצועה"), lemma_he: "רצועה", niqqud: "כֹּחַ", senses: [{ sense: "main", ru: "ремень" }] }),
    JSON.stringify({ id: T.personalTermId("a97002", "רצועה"), lemma_he: "רצועה", senses: [{ sense: "main", ru: "" }] }),
  ];
  const r = T.parseAdditions([ok].concat(bad).join("\n"));
  assert.equal(r.terms.length, 1);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["json", "id", "niqqud", "ru"]);
});

test("the place of a personal term is found in the text; a personal term never becomes a loose «terms of this paragraph»", () => {
  const RM = require("../public/js/reader-morph.js");
  const W = require("../public/js/atlas-words.js");
  const section = { id: "s09-belt", content_pack_sha256: "a".repeat(64), pages: [{ page: 197, items: [
    { id: "b1", type: "block", he: "הכוח ההיקפי פועל על הרצועה", he_niqqud: "", ru: "Окружная сила действует на ремень", terms: ["a97002:term:belt#belt"] },
    { id: "b2", type: "block", he: "גלגל מניע", ru: "Ведущий шкив" }] }],
    terms: { "a97002:term:belt": { lemma_he: "רצועה", senses: [{ sense: "belt", ru: "ремень" }] } } };
  const ctx = W.sectionContext("a97002", section, RM);
  const mine = T.makePersonalTerm({ atlasId: "a97002", lemmaHe: "כוח היקפי", ru: "окружная сила", scope: "section", sid: "s09-belt" });
  ctx.setPersonal(T.mergeTerms({}, [mine], "s09-belt"));
  const loc = ctx.located("b1");
  assert.deepEqual(loc.he.spans.map((s) => [s.from, s.to, s.id]), [[0, 1, mine.id], [4, 4, "a97002:term:belt"]]);
  assert.deepEqual(ctx.located("b2").loose, []);
  const occ = W.occurrence(ctx, "b1", 1, "ההיקפי", "he");
  assert.deepEqual(occ.atlas_term, { id: mine.id, sense: "main" });
  const top = W.cardTop(occ, ctx, { kicker: "Термин атласа", mine: "Мой термин" });
  assert.equal(top.kicker, "Мой термин");
  assert.deepEqual(top.lines, ["окружная сила"]);
  ctx.setPersonal({});
  assert.deepEqual(ctx.located("b1").he.spans.map((s) => s.id), ["a97002:term:belt"], "removing a personal term clears its place");
});

test("the word card shows a surface's actions, with or without a term above", () => {
  const RM = require("../public/js/reader-morph.js");
  const withTerm = RM.surfaceTopHtml({ kicker: "Мой термин", title: "כוח היקפי", lines: ["окружная сила"], actions: [{ id: "edit", label: "Изменить" }] }, "ltr");
  assert.match(withTerm, /class="rm-surface-top"/);
  assert.match(withTerm, /data-rm-surface-action="edit"/);
  const onlyActions = RM.surfaceTopHtml({ title: "", actions: [{ id: "add", label: "Добавить в термины <b>" }] }, "ltr");
  assert.match(onlyActions, /data-rm-surface-action="add"/);
  assert.match(onlyActions, /&lt;b&gt;/, "labels are escaped");
  assert.equal(RM.surfaceTopHtml({ title: "" }, "ltr"), "");
  assert.equal(RM.surfaceTopHtml(null, "ltr"), "");
});

test("the add-term form: a word grows into a phrase, the meaning follows the in-context gloss, a duplicate cannot be saved", () => {
  const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
  const UI = require("../public/js/atlas-train-ui.js");
  const words = [{ he: "הכוח", niqqud: "הַכֹּחַ" }, { he: "ההיקפי", niqqud: "הַהֶיקֵּפִי" }, { he: "פועל", niqqud: "פּוֹעֵל" }];
  const saved = [], cancelled = [];
  const f = UI.termForm(document, { T: (k, fb) => fb, words, at: 0,
    glossOf: (from, to) => (from === 0 && to === 1 ? "окружная сила" : from === 0 && to === 0 ? "сила" : ""),
    duplicateOf: (lemma) => (lemma === "פועל" ? "פּוֹעֵל — действует" : null),
    onSave: (r) => saved.push(r), onCancel: () => cancelled.push(1) });
  document.body.appendChild(f.el);
  const phrase = () => f.el.querySelector(".atlas-term-phrase").textContent;
  const ru = f.el.querySelector('input[name="ru"]'), save = f.el.querySelector("[data-term-save]");
  assert.equal(phrase(), "הַכֹּחַ");
  assert.equal(ru.value, "сила");
  f.el.querySelector('[data-extend="next"]').dispatchEvent(new window.Event("click"));
  assert.equal(phrase(), "הַכֹּחַ הַהֶיקֵּפִי");
  assert.equal(ru.value, "окружная сила", "an untouched meaning follows the phrase");
  assert.equal(f.el.querySelector('input[name="scope"][value="section"]').checked, true, "this section by default");
  save.dispatchEvent(new window.Event("click"));
  assert.deepEqual(saved, [{ from: 0, to: 1, lemmaHe: "הכוח ההיקפי", niqqud: "הַכֹּחַ הַהֶיקֵּפִי", ru: "окружная сила", scope: "section" }]);
  // the learner's own wording is kept when the phrase changes
  ru.value = "сила окружная (моё)"; ru.dispatchEvent(new window.Event("input"));
  f.el.querySelector('[data-shrink="next"]').dispatchEvent(new window.Event("click"));
  assert.equal(ru.value, "сила окружная (моё)");
  // a term the atlas already has: saving is off, the reason is shown
  const g = UI.termForm(document, { T: (k, fb) => fb, words, at: 2, glossOf: () => "действует", duplicateOf: (l) => (l === "פועל" ? "פּוֹעֵל — действует" : null), onSave: (r) => saved.push(r) });
  assert.equal(g.el.querySelector("[data-term-save]").disabled, true);
  assert.match(g.el.querySelector(".atlas-term-dup").textContent, /действует/);
  // an empty meaning cannot be saved; Cancel closes
  ru.value = " "; ru.dispatchEvent(new window.Event("input"));
  assert.equal(save.disabled, true);
  f.el.querySelector("[data-term-cancel]").dispatchEvent(new window.Event("click"));
  assert.deepEqual(cancelled, [1]);
});

// ---- G2: the atlas additions file (for everyone, after a rebuild) ----
function addSections() {
  return [
    { id: "s09-belt", content_pack_sha256: "a".repeat(64), pages: [{ page: 197, items: [
      { id: "b1", type: "block", he: "הכוח ההיקפי פועל על הרצועה", ru: "Окружная сила действует на ремень", terms: ["a97002:term:belt#belt"] },
      { id: "b2", type: "block", he: "חישוב הכוח ההיקפי", ru: "Расчёт окружной силы" }] }],
      terms: { "a97002:term:belt": { lemma_he: "רצועה", senses: [{ sense: "belt", ru: "ремень" }] } } },
    { id: "s10-spur-gears", content_pack_sha256: "b".repeat(64), pages: [{ page: 240, items: [
      { id: "c1", type: "block", he: "הכוח ההיקפי על השן", ru: "Окружная сила на зубе" }] }], terms: {} },
  ];
}
const ADD = require("../scripts/atlas/apply-term-additions.cjs");

test("an additions line becomes an atlas term with the places of its sections", () => {
  const line = { id: "a97002:term:u-0000abcd", lemma_he: "כוח היקפי", niqqud: "כֹּחַ הֶיקֵּפִי", senses: [{ sense: "main", ru: "окружная сила" }], sections: ["s09-belt"] };
  const r = ADD.applyAdditions(addSections(), [JSON.stringify(line)]);
  assert.deepEqual(r.rejected, []);
  const s09 = r.sections[0], s10 = r.sections[1];
  assert.equal(s09.terms[line.id].lemma_he, "כוח היקפי");
  assert.equal(s09.terms[line.id].source, "additions");
  assert.deepEqual(s09.pages[0].items[0].terms, ["a97002:term:belt#belt", line.id + "#main"]);
  assert.deepEqual(s09.pages[0].items[1].terms, [line.id + "#main"]);
  assert.equal(s10.terms[line.id], undefined, "a section-scoped addition stays in its section");
  assert.deepEqual(r.report, [{ id: line.id, places: 2, sections: ["s09-belt"] }]);
  // the same file again changes nothing
  const again = ADD.applyAdditions(r.sections, [JSON.stringify(line)]);
  assert.equal(JSON.stringify(again.sections), JSON.stringify(r.sections));
});

test("sections: [] puts the term into every section where it occurs", () => {
  const line = { id: "a97002:term:tangential-force", lemma_he: "כוח היקפי", senses: [{ sense: "tf", ru: "окружная сила" }], sections: [] };
  const r = ADD.applyAdditions(addSections(), [JSON.stringify(line)]);
  assert.ok(r.sections[0].terms[line.id] && r.sections[1].terms[line.id]);
  assert.deepEqual(r.report[0].sections, ["s09-belt", "s10-spur-gears"]);
});

test("an additions line that does not hold is rejected with its reason", () => {
  const sense = [{ sense: "main", ru: "x" }];
  const lines = [
    "{bad",
    JSON.stringify({ id: "a97002:term:belt", lemma_he: "רצועה", senses: sense, sections: [] }),            // the atlas has this id
    JSON.stringify({ id: "a97002:term:u-00000001", lemma_he: "רצועה", senses: sense, sections: [] }),      // the atlas has this term
    JSON.stringify({ id: "a97002:term:u-00000002", lemma_he: "גלגל שיניים", senses: sense, sections: [] }), // no place anywhere
    JSON.stringify({ id: "a97002:term:u-00000003", lemma_he: "כוח", niqqud: "רְצוּעָה", senses: sense, sections: [] }),
    JSON.stringify({ id: "a97002:term:u-00000004", lemma_he: "כוח", senses: [{ sense: "main", ru: "" }], sections: [] }),
    JSON.stringify({ id: "Bad Id", lemma_he: "כוח", senses: sense, sections: [] }),
  ];
  const r = ADD.applyAdditions(addSections(), lines);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["json", "id-taken", "duplicate", "no-place", "niqqud", "ru", "id"]);
  assert.equal(JSON.stringify(r.sections), JSON.stringify(addSections()), "a rejected line changes nothing");
});

test("a new sense of an atlas term: add_senses", () => {
  const line = { id: "a97002:term:belt", add_senses: [{ sense: "strap", ru: "лента" }], sections: ["s09-belt"] };
  const r = ADD.applyAdditions(addSections(), [JSON.stringify(line)]);
  assert.deepEqual(r.rejected, []);
  assert.deepEqual(r.sections[0].terms["a97002:term:belt"].senses.map((s) => s.sense), ["belt", "strap"]);
  const clash = ADD.applyAdditions(addSections(), [JSON.stringify({ id: "a97002:term:belt", add_senses: [{ sense: "belt", ru: "пояс" }], sections: [] })]);
  assert.deepEqual(clash.rejected.map((x) => x.reason), ["sense-taken"], "one meaning — one translation");
});
