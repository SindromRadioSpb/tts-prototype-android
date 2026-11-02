"use strict";
// Atlas P4 · W1 — where a block's term links sit among the words the word card wraps.
const test = require("node:test"),
  assert = require("node:assert/strict");
const RM = require("../public/js/reader-morph.js");
const W = require("../public/js/atlas-words.js");

const terms = {
  "a97002:term:butt-joint": { lemma_he: "מחבר השקה", senses: [{ sense: "butt-joint", ru: "стыковое соединение" }] },
  "a97002:term:rivet-joint": { lemma_he: "מחבר מסמרות", senses: [{ sense: "rivet-joint", ru: "заклёпочное соединение" }] },
  "a97002:term:shear-stress": { lemma_he: "מאמץ גזירה", senses: [{ sense: "shear-stress", ru: "касательное напряжение" }] },
  "a97002:term:rivet": { lemma_he: "מסמרה", senses: [{ sense: "rivet", ru: "заклёпка" }] },
  "a97002:term:bolt": { lemma_he: "בורג", senses: [{ sense: "bolt", ru: "болт" }] },
  "a97002:term:joint": { lemma_he: "מחבר", senses: [{ sense: "joint", ru: "соединение" }] },
};
const loc = (text, refs) => W.locateTerms(text, refs, terms, RM);

test("a whole term is found at the card's word offsets, with its sense", () => {
  const r = loc("מחבר השקה (Butt Joint)", ["a97002:term:butt-joint#butt-joint"]);
  assert.deepEqual(r.spans, [{ from: 0, to: 1, id: "a97002:term:butt-joint", sense: "butt-joint" }]);
  assert.deepEqual(r.loose, []);
});

test("pointed text gives the same offsets as plain text", () => {
  const plain = loc("עמידת לוח המחבר והמסמרות", ["a97002:term:rivet#rivet"]);
  const pointed = loc("עֲמִידַת לוּחַ הַמְּחַבֵּר וְהַמַּסְמְרוֹת", ["a97002:term:rivet#rivet"]);
  assert.deepEqual(pointed.spans, plain.spans);
  assert.equal(plain.spans[0].from, 3);
});

test("proclitics on any word of the term and plural endings are accepted", () => {
  // definite construct: ה on the second word
  const r = loc("חישוב מחבר המסמרות לפי תנאי חוזק", ["a97002:term:rivet-joint#rivet-joint"]);
  assert.deepEqual(r.spans.map((s) => [s.from, s.to]), [[1, 2]]);
  const p = loc("לגזירה של המסמרות", ["a97002:term:rivet#rivet"]);
  assert.deepEqual(p.spans.map((s) => [s.from, s.to]), [[2, 2]]);
});

test("only part of a term is not marked as the term — it stays a loose link", () => {
  const r = loc("קוטר מסמרה דרוש לפי תנאי חוזק לגזירה", ["a97002:term:shear-stress#shear-stress"]);
  assert.deepEqual(r.spans, []);
  assert.deepEqual(r.loose, [{ id: "a97002:term:shear-stress", sense: "shear-stress" }]);
});

test("a term absent from the text (irregular plural) is a loose link, never a guessed place", () => {
  const r = loc("חלוקת העומס בין כל הברגים", ["a97002:term:bolt#bolt"]);
  assert.deepEqual(r.spans, []);
  assert.equal(r.loose.length, 1);
});

test("every occurrence is marked; a longer term wins over a shorter one inside it", () => {
  const r = loc("מחבר מסמרות ועוד מחבר מסמרות", ["a97002:term:joint#joint", "a97002:term:rivet-joint#rivet-joint"]);
  assert.deepEqual(r.spans.map((s) => [s.from, s.to, s.id]), [
    [0, 1, "a97002:term:rivet-joint"],
    [3, 4, "a97002:term:rivet-joint"],
  ]);
  // the shorter term found no free place of its own: it is still offered as a loose link
  assert.deepEqual(r.loose, [{ id: "a97002:term:joint", sense: "joint" }]);
});

test("unknown term ids and empty input are ignored safely", () => {
  assert.deepEqual(loc("מחבר", ["a97002:term:nope#x"]), { spans: [], loose: [] });
  assert.deepEqual(loc("", ["a97002:term:joint#joint"]).spans, []);
  assert.deepEqual(W.locateTerms("מחבר", null, terms, RM), { spans: [], loose: [] });
});

test("a block's pointed line takes the places of its plain line (spelling differs, words match)", () => {
  // plain ktiv male «חיבור», pointed ktiv haser «חִבּוּר»
  const t2 = Object.assign({}, terms, { "a97002:term:lap-joint": { lemma_he: "חיבור חפיפה", senses: [{ sense: "lap-joint" }] } });
  const item = { he: "חיבור חפיפה", he_niqqud: "חִבּוּר חֲפִיפָה", terms: ["a97002:term:lap-joint#lap-joint"] };
  const r = W.locateBlock(item, t2, RM);
  assert.deepEqual(r.he.spans.map((s) => [s.from, s.to]), [[0, 1]]);
  assert.deepEqual(r.niqqud.spans, r.he.spans);
  assert.deepEqual(r.loose, []);
  // a pointed line with another word count is searched on its own
  const odd = W.locateBlock({ he: "סוג ה מחבר", he_niqqud: "סוּג הַמְּחַבֵּר", terms: ["a97002:term:joint#joint"] }, terms, RM);
  assert.deepEqual(odd.he.spans.map((s) => s.from), [2]);
  assert.deepEqual(odd.niqqud.spans.map((s) => s.from), [1]);
});

test("termAt returns the span covering a word offset", () => {
  const r = loc("חישוב מחבר המסמרות", ["a97002:term:rivet-joint#rivet-joint"]);
  assert.equal(W.termAt(r.spans, 0), null);
  assert.equal(W.termAt(r.spans, 2).id, "a97002:term:rivet-joint");
});

// ---- the verified external place of a word (owner decision E2: «внешнее место», like Physics solutions) ----
const section = {
  id: "s02-rivets", content_pack_sha256: "c".repeat(64), terms,
  pages: [{ page: 16, items: [
    { id: "a97002:p16:b001", he: "מחבר השקה (Butt Joint)", he_niqqud: "מַחְבַּר הַשָּׁקָה (Butt Joint)", ru: "Стыковое соединение", terms: ["a97002:term:butt-joint#butt-joint"] },
    { id: "a97002:p16:b002", kind: "figure_caption" },
    { id: "a97002:p16:b003", he: "חיבור חפיפה", he_niqqud: "חִבּוּר חֲפִיפָה", ru: "Соединение внахлёст" },
  ] }],
};

test("an atlas place carries its edition, block and word; it verifies only against the same edition", () => {
  const ctx = W.sectionContext("a97002", section, RM);
  assert.equal(ctx.textKey, "atlas-block-v1:a97002:s02-rivets:" + "c".repeat(64));
  assert.deepEqual(ctx.order.get("a97002:p16:b003"), 1);   // blocks with Hebrew only
  const occ = W.occurrence(ctx, "a97002:p16:b003", 0, "חבור", "niqqud");
  assert.equal(occ.source_kind, "atlas_block");
  assert.equal(occ.text_id, ctx.textKey);
  assert.equal(occ.sentence_id, "a97002:p16:b003");
  assert.equal(occ.sentence_ru, "Соединение внахлёст");
  assert.deepEqual(W.verifyOccurrence(occ, ctx), { textKey: ctx.textKey, sentenceId: "a97002:p16:b003", orderIndex: 1, surface: "חבור" });
  // the plain word at the same offset is the same place
  assert.ok(W.verifyOccurrence(W.occurrence(ctx, "a97002:p16:b003", 0, "חיבור", "he"), ctx));
  // another edition, another block or another word: no source is recorded
  const other = W.sectionContext("a97002", Object.assign({}, section, { content_pack_sha256: "d".repeat(64) }), RM);
  assert.equal(W.verifyOccurrence(occ, other), null);
  assert.equal(W.verifyOccurrence(Object.assign({}, occ, { word_offset: 1 }), ctx), null);
  assert.equal(W.verifyOccurrence(Object.assign({}, occ, { sentence_id: "a97002:p16:b001" }), ctx), null);
  assert.equal(W.verifyOccurrence(Object.assign({}, occ, { source_kind: "reviewed_solution" }), ctx), null);
  assert.equal(W.occurrence(ctx, "a97002:p16:b002", 0, "x", "he"), null);
});

test("a word of a term tells the card the reviewed term; other words tell nothing", () => {
  const ctx = W.sectionContext("a97002", section, RM);
  const occ = W.occurrence(ctx, "a97002:p16:b001", 1, "השקה", "he");
  assert.deepEqual(occ.atlas_term, { id: "a97002:term:butt-joint", sense: "butt-joint" });
  const top = W.cardTop(occ, ctx, { kicker: "Термин атласа", other: "Другие значения", script: "lat" });
  assert.equal(top.kicker, "Термин атласа");
  assert.equal(top.title, "מחבר השקה");
  assert.deepEqual(top.lines, ["стыковое соединение"]);
  assert.equal(W.cardTop(W.occurrence(ctx, "a97002:p16:b003", 0, "חיבור", "he"), ctx, {}), null);
});

test("a row is marked: term words get the term class, loose links a line of their own", () => {
  const { parseHTML } = require("linkedom");
  const { document } = parseHTML("<div id=s></div>");
  const t2 = Object.assign({}, terms, { "a97002:term:lap-joint": { lemma_he: "חיבור חפיפה", niqqud: "חִבּוּר חֲפִיפָה", senses: [{ sense: "lap-joint", ru: "соединение внахлёст" }] } });
  const sec = Object.assign({}, section, { terms: t2 });
  sec.pages = [{ page: 16, items: [{ id: "b1", he: "קוטר מסמרה לגזירה", he_niqqud: "קֹטֶר מַסְמְרָה לִגְזִירָה", ru: "Диаметр заклёпки на срез",
    terms: ["a97002:term:rivet#rivet", "a97002:term:shear-stress#shear-stress"] }] }];
  const ctx = W.sectionContext("a97002", sec, RM);
  const row = document.createElement("div");
  row.className = "atlas-row"; row.setAttribute("data-ref", "b1");
  row.innerHTML = '<div class="atlas-he" data-col="he">' + RM.wrapCellHtml(sec.pages[0].items[0].he, null, {}) + "</div>" +
    '<div class="atlas-ru">Диаметр</div>';
  W.decorateRow(row, ctx, { terms: "Термины абзаца" });
  const marked = Array.from(row.querySelectorAll(".rm-w.atlas-term")).map((s) => s.getAttribute("data-w-offset"));
  assert.deepEqual(marked, ["1"]);
  const loose = row.querySelector(".atlas-row-terms");
  assert.ok(loose);
  assert.match(loose.textContent, /Термины абзаца/);
  assert.match(loose.textContent, /מאמץ גזירה/);
  assert.match(loose.textContent, /касательное напряжение/);
  // decorating twice changes nothing
  W.decorateRow(row, ctx, { terms: "Термины абзаца" });
  assert.equal(row.querySelectorAll(".atlas-row-terms").length, 1);
});
