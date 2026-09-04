"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Preview = require("../public/js/obsidian-lexical-preview.js");
const InflectionRender = require("../public/js/inflection-render.js");
const Core = require("../public/js/lexical-resolution-core.js");
const Service = require("../public/js/lexical-resolution-service.js");

function fixture() {
  return {
    library: {
      texts: [{
        text_id: "T1", text_key: "text-kfar", title: "Кфар Аза - 2", updated_at: "2026-09-04T00:00:00Z",
        rows: [
          { row_id: "R1", order_index: 0, hebrew_plain: "שרפו את הבתים", hebrew_niqqud: "שָׂרְפוּ אֶת הַבָּתִּים", russian: "Сожгли дома" },
          { row_id: "R2", order_index: 1, hebrew_plain: "הבתים של נטע", hebrew_niqqud: "הַבָּתִּים שֶׁל נֶטַע", russian: "Дома Неты" }
        ]
      }]
    },
    notes_advanced: {
      notes: [
        { id: "N1", note_type: "word_study", gen_dedup_key: "ff:שרפו#verb", source: "autogen", confidence: 0.92,
          body_json: JSON.stringify({ word: "שרפו", niqqud_variant: "שָׂרְפוּ", lemma: "לשרוף", pos: "verb", root: "שרף", binyan: "paal", meaning: "жечь", pealim_id: "2321" }) },
        { id: "N2", note_type: "word_study", gen_dedup_key: "ff:הבתים#noun", source: "autogen", confidence: 0.85,
          body_json: JSON.stringify({ word: "הבתים", niqqud_variant: "הַבָּתִּים", lemma: "בית", pos: "noun", root: "בית", meaning: "дом", pealim_id: "18" }) },
        { id: "N3", note_type: "word_study", gen_dedup_key: "ff:נטע#noun", source: "autogen", confidence: 0.85,
          body_json: JSON.stringify({ word: "נטע", niqqud_variant: "נֶטַע", lemma: "נטע", pos: "noun", root: "נטע", meaning: "растение", pealim_id: "7361" }) }
      ],
      occurrences: [
        { note_id: "N1", text_id: "T1", sentence_id: "R1", word_offset: 0, surface: "שרפו" },
        { note_id: "N2", text_id: "T1", sentence_id: "R1", word_offset: 2, surface: "הבתים" },
        { note_id: "N2", text_id: "T1", sentence_id: "R2", word_offset: 0, surface: "הבתים" },
        { note_id: "N3", text_id: "T1", sentence_id: "R2", word_offset: 2, surface: "נטע" }
      ],
      sentence_morph: [
        { text_id: "T1", sentence_id: "R1", model_version: "dicta-v1", tokens: [
          { word: "שרפו", niqqud: "שָׂרְפוּ", lemma: "לשרוף", posDicta: "verb", binyan: "paal" },
          { word: "את", niqqud: "אֶת", stem: "את", posDicta: "preposition" },
          { word: "הבתים", niqqud: "הַבָּתִּים", lemma: "בית", posDicta: "noun" }
        ] },
        { text_id: "T1", sentence_id: "R2", model_version: "dicta-v1", tokens: [
          { word: "הבתים", niqqud: "הַבָּתִּים", lemma: "בית", posDicta: "noun" },
          { word: "של", niqqud: "שֶׁל", stem: "של", posDicta: "preposition" },
          { word: "נטע", niqqud: "נֶטַע", lemma: "נטע", posDicta: "noun", kind: "propernoun", ambiguous: true,
            alts: [{ lemma: "נֶטַע", pos: "noun" }] }
        ] }
      ],
      review_log: [{ id: "must-remain-untouched" }],
      srs_cards: [{ id: "must-remain-untouched" }]
    }
  };
}

function verbParadigm() {
  return {
    pealim_id: "2321", pealim_url: "https://www.pealim.com/ru/dict/2321/",
    model_version: "pealim-infl-v12", source: "pealim", kind: "verb", pos: "verb",
    lemma: "לשרוף", lemma_niqqud: "לִשְׂרוֹף", root: "שרף", binyan: "paal", meaning: "жечь",
    cells: {
      "INF-L": { he: "לִשְׂרוֹף", translit: "lisrof" },
      "AP-ms": { he: "שׂוֹרֵף", translit: "soref" },
      "AP-fs": { he: "שׂוֹרֶפֶת", translit: "sorefet" },
      "AP-mp": { he: "שׂוֹרְפִים", translit: "sorfim" },
      "AP-fp": { he: "שׂוֹרְפוֹת", translit: "sorfot" },
      "PERF-3mp": { he: "שָׂרְפוּ", translit: "sarfu" },
      "IMPF-3mp": { he: "יִשְׂרְפוּ", translit: "yisrefu" },
      "IMP-2ms": { he: "שְׂרֹף", translit: "srof" }
    }
  };
}

test("normalizes the complete approved POS vocabulary", () => {
  assert.equal(Preview.normalizePos("PROPN"), "propernoun");
  assert.equal(Preview.normalizePos("noun", "propernoun"), "propernoun");
  assert.equal(Preview.normalizePos("ADP"), "preposition");
  assert.equal(Preview.normalizePos("DET"), "particle");
  assert.equal(Preview.normalizePos(""), "unknown");
  assert.equal(Preview.normalizePos("provider-new-tag"), "other");
});

test("builds a per-text reference index and collapses repeated occurrences", () => {
  const report = Preview.analyzeBundle(fixture(), { textId: "T1" });
  assert.equal(report.read_only, true);
  assert.equal(report.text.rows_total, 2);
  assert.equal(report.text.rows_with_morph, 2);
  assert.equal(report.counts.analyzed_occurrences, 6);
  assert.equal(report.counts.unique_lexemes, 5);
  assert.equal(report.counts.duplicate_occurrences_collapsed, 1);
  assert.equal(report.counts.ambiguity_signal_occurrences, 1);
  assert.equal(report.lexemes_by_pos.verb, 1);
  assert.equal(report.lexemes_by_pos.noun, 1);
  assert.equal(report.lexemes_by_pos.preposition, 2);
  assert.equal(report.lexemes_by_pos.propernoun, 1);
  assert.equal(report.lexemes_by_pos.unknown, 0);

  const houses = report.lexemes.find((x) => x.lp_lexeme_id === "pid:18");
  assert.ok(houses);
  assert.equal(houses.occurrence_count, 2);
  assert.deepEqual(houses.occurrences.map((x) => x.row_id), ["R1", "R2"]);
});

test("keeps ambiguity visible and does not turn the reference index into learning state", () => {
  const report = Preview.analyzeBundle(fixture(), { title: "Кфар Аза" });
  assert.equal(report.counts.ambiguous_occurrences, 1);
  const name = report.lexemes.find((x) => x.lp_pos === "propernoun");
  assert.ok(name && name.ambiguity);
  assert.equal(name.lp_lexeme_id, "name:נטע");
  assert.equal(name.pealim_id, "");
  assert.equal(name.meaning_ru, "");
  assert.equal(name.candidate_evidence[0].meaning, "растение");
  assert.deepEqual(name.identity_guard_reasons, ["propernoun-vs-dictionary-sense"]);
  assert.equal(report.counts.context_identity_guarded_occurrences, 1);
  assert.equal(report.counts.uncertain_occurrences, 1);
  assert.equal(report.counts.queued_uncertain_occurrences, 1);
  assert.equal(report.counts.resolution_queue_coverage_pct, 100);
  assert.equal(report.resolution_queue.items.length, 1);
  assert.deepEqual(report.resolution_queue.items[0].reasons, ["ambiguous", "identity_guarded"]);
  assert.equal(report.resolution_queue.items[0].candidate_evidence[0].pealim_id, "7361");
  assert.equal(report.resolution_queue.items[0].sentence_he_niqqud, "הַבָּתִּים שֶׁל נֶטַע");
  assert.equal(report.resolution_queue.clusters.length, 1);
  assert.equal(report.resolution_queue.clusters[0].occurrence_count, 1);
  assert.equal(report.resolution_queue.reason_counts.ambiguous, 1);
  assert.equal(report.resolution_queue.reason_counts.identity_guarded, 1);
  assert.equal(Object.hasOwn(report, "learning_state"), false);
  assert.equal(Object.hasOwn(report, "review_log"), false);
});

test("conserves every uncertain occurrence in the visible resolution queue", () => {
  const input = fixture();
  input.notes_advanced.sentence_morph[0].tokens[1].posDicta = "";
  const report = Preview.analyzeBundle(input, { textId: "T1" });
  const itemIds = report.resolution_queue.items.map((x) => x.lp_occurrence_id);
  const clusteredIds = report.resolution_queue.clusters.flatMap((x) => x.occurrence_ids);

  assert.equal(report.counts.uncertain_occurrences, 2);
  assert.equal(report.counts.queued_uncertain_occurrences, 2);
  assert.equal(report.counts.resolution_queue_coverage_pct, 100);
  assert.equal(new Set(itemIds).size, itemIds.length);
  assert.deepEqual(new Set(clusteredIds), new Set(itemIds));
  assert.ok(report.resolution_queue.items.some((x) => x.reasons.includes("unknown_pos")));
  assert.ok(report.resolution_queue.items.some((x) => x.reasons.includes("identity_guarded")));
});

test("uses an exact curated Pealim identity to correct bad dataset POS without weakening the guard", () => {
  const input = fixture();
  input.notes_advanced.notes.push({
    id: "N4", note_type: "word_study", gen_dedup_key: "ff:את#preposition", source: "autogen", confidence: 0.91,
    body_json: JSON.stringify({ word: "את", niqqud_variant: "אֶת", lemma: "את", pos: "preposition", meaning: "маркер прямого дополнения", pealim_id: "2710" })
  });
  input.notes_advanced.occurrences.push({ note_id: "N4", text_id: "T1", sentence_id: "R1", word_offset: 1, surface: "את" });
  const pealimResolver = (id) => String(id) === "2710" ? { pealim_id: "2710", pos: "noun" } : null;

  const raw = Preview.analyzeBundle(input, { textId: "T1", pealimResolver });
  const rawAt = raw.resolution_queue.items.find((x) => x.surface === "את");
  assert.ok(rawAt && rawAt.reasons.includes("identity_guarded"), "bad raw dataset POS must still fail closed");
  assert.equal(rawAt.candidate_evidence[0].lemma, "את");
  assert.equal(rawAt.candidate_evidence[0].lp_pos, "preposition");

  const corrected = Preview.analyzeBundle(input, {
    textId: "T1",
    pealimResolver,
    pealimIdentityResolver: ({ pealim_id }) => String(pealim_id) === "2710"
      ? { pealim_id: "2710", pos: "particle", provenance: "function-usage-curated" }
      : null
  });
  const at = corrected.lexemes.find((x) => x.lp_lexeme_id === "pid:2710");
  assert.ok(at, "the exact Pealim sense remains the lexeme identity");
  assert.equal(at.lp_pos, "preposition");
  assert.equal(at.meaning_ru, "маркер прямого дополнения");
  assert.equal(corrected.resolution_queue.items.some((x) => x.surface === "את"), false);
  assert.equal(corrected.counts.verified_pealim_identity_occurrences, 1);
  assert.equal(corrected.pealim_identity_sources["function-usage-curated"], 1);

  const mismatched = Preview.analyzeBundle(input, {
    textId: "T1",
    pealimResolver,
    pealimIdentityResolver: () => ({ pealim_id: "999", pos: "particle", provenance: "wrong-id" })
  });
  assert.ok(mismatched.resolution_queue.items.some((x) => x.surface === "את" && x.reasons.includes("identity_guarded")),
    "a curated record for another Pealim id must never suppress the guard");
});

test("recognizes a Pealim pronominal paradigm as a preposition despite legacy noun metadata", () => {
  const input = fixture();
  input.library.texts[0].rows = [{ row_id: "R1", order_index: 0, hebrew_plain: "לי", hebrew_niqqud: "לִי", russian: "мне" }];
  input.notes_advanced.notes = [{
    id: "L1", note_type: "word_study", gen_dedup_key: "ff:לי#preposition", source: "autogen", confidence: 0.92,
    body_json: JSON.stringify({ word: "לי", niqqud_variant: "לִי", lemma: "ל", pos: "preposition", meaning: "к; у", pealim_id: "6014" })
  }];
  input.notes_advanced.occurrences = [{ note_id: "L1", text_id: "T1", sentence_id: "R1", word_offset: 0, surface: "לי" }];
  input.notes_advanced.sentence_morph = [{ text_id: "T1", sentence_id: "R1", model_version: "dicta-v1", tokens: [
    { word: "לי", niqqud: "לִי", lemma: "ל", posDicta: "preposition" }
  ] }];
  const report = Preview.analyzeBundle(input, {
    textId: "T1",
    pealimResolver: () => ({ pealim_id: "6014", pos: "noun", kind: "noun", root: null, cells: {
      "P-1s": { he: "לִי" }, "P-1p": { he: "לָנוּ" }, "P-2ms": { he: "לְךָ" },
      "P-2fs": { he: "לָךְ" }, "P-3ms": { he: "לוֹ" }, "P-3fs": { he: "לָהּ" }
    } })
  });
  assert.equal(report.resolution_queue.items.length, 0);
  assert.equal(report.counts.verified_pealim_identity_occurrences, 1);
  assert.equal(report.pealim_identity_sources["paradigm-pronominal-preposition"], 1);
});

test("canonical Pealim metadata prevents one stale root from queueing every occurrence", () => {
  const input = fixture();
  input.notes_advanced.notes[0].body_json = JSON.stringify({ word: "שרפו", niqqud_variant: "שָׂרְפוּ", lemma: "לשרוף", pos: "verb", root: "wrong", meaning: "жечь", pealim_id: "2321" });
  const report = Preview.analyzeBundle(input, {
    textId: "T1",
    pealimResolver: (id) => String(id) === "2321" ? { pealim_id: "2321", pos: "verb", kind: "verb", root: "שרף", lemma: "לשרוף", meaning: "жечь" } : null
  });
  const burning = report.lexemes.find((x) => x.pealim_id === "2321");
  assert.equal(burning.root, "שרף");
  assert.deepEqual(burning.conflicts, []);
});

test("an exact unambiguous inflected form can restore a missing verb POS", () => {
  const input = fixture();
  input.notes_advanced.notes[0].body_json = JSON.stringify({ word: "שרפו", niqqud_variant: "שָׂרְפוּ", lemma: "לשרוף", pos: "", root: "שרף", meaning: "жечь", pealim_id: "2321" });
  input.notes_advanced.sentence_morph[0].tokens[0].posDicta = "";
  const report = Preview.analyzeBundle(input, {
    textId: "T1",
    ambiguityResolver: (unit) => unit.sampleWord === "שרפו" ? { pealim_id: "2321", ambiguous: false } : null,
    pealimResolver: (id) => String(id) === "2321" ? { pealim_id: "2321", pos: "verb", kind: "verb", root: "שרף", lemma: "לשרוף", meaning: "жечь" } : null
  });
  const burning = report.lexemes.find((x) => x.pealim_id === "2321");
  assert.equal(burning.lp_pos, "verb");
  assert.equal(report.resolution_queue.items.some((x) => x.surface === "שרפו"), false);
});

test("a reviewed surface identity keeps Pealim lexical class separate from contextual role", () => {
  const input = fixture();
  input.library.texts[0].rows = [{ row_id: "R1", order_index: 0, hebrew_plain: "כל העולם", hebrew_niqqud: "כָּל הָעוֹלָם", russian: "весь мир" }];
  input.notes_advanced.notes = [{
    id: "K1", note_type: "word_study", gen_dedup_key: "ff:כל#other", source: "autogen", confidence: 0.65,
    body_json: JSON.stringify({ word: "כל", niqqud_variant: "כָּל", lemma: "כל", pos: "other", meaning: "ошибочный омограф" })
  }];
  input.notes_advanced.occurrences = [{ note_id: "K1", text_id: "T1", sentence_id: "R1", word_offset: 0, surface: "כל" }];
  input.notes_advanced.sentence_morph = [{ text_id: "T1", sentence_id: "R1", model_version: "dicta-v1", tokens: [
    { word: "כל", niqqud: "כָּל", lemma: "כל", posDicta: "other" }
  ] }];
  const report = Preview.analyzeBundle(input, {
    textId: "T1",
    pealimResolver: () => ({ pealim_id: "4158", lemma: "כול", pos: "noun", kind: "noun", root: "כלל", meaning: "каждый, весь" }),
    pealimIdentityResolver: ({ pealim_id }) => pealim_id ? null : ({
      pealim_id: "4158", lemma: "כול", lp_pos: "particle", lexical_pos: "noun", context_role: "quantifier",
      meaning: "каждый, весь", provenance: "function-usage-curated", allow_surface_identity: true
    })
  });
  const all = report.lexemes.find((x) => x.pealim_id === "4158");
  assert.ok(all);
  assert.equal(all.lp_pos, "particle");
  assert.equal(all.lexical_pos, "noun");
  assert.equal(all.context_role, "quantifier");
  assert.equal(all.meaning_ru, "каждый, весь");
  assert.equal(report.resolution_queue.items.length, 0);
  const markdown = Preview.planObsidianPackage(report).files.find((file) => file.kind === "text-lexeme").content;
  assert.match(markdown, /lexical_pos: "noun"/);
  assert.match(markdown, /context_role: "quantifier"/);
});

test("turns an unparsed token into a contextual queue item instead of a hidden skip", () => {
  const input = fixture();
  input.notes_advanced.sentence_morph[0].tokens.push({ word: "—", posDicta: "punctuation" });
  const report = Preview.analyzeBundle(input, { textId: "T1" });
  const skipped = report.resolution_queue.items.find((x) => x.reasons.includes("skipped_token"));

  assert.equal(report.counts.skipped_tokens, 1);
  assert.equal(report.resolution_queue.reason_counts.skipped_token, 1);
  assert.ok(skipped);
  assert.equal(skipped.surface, "—");
  assert.equal(skipped.row_id, "R1");
  assert.equal(skipped.word_offset, 3);
  assert.equal(skipped.sentence_ru, "Сожгли дома");
  assert.equal(report.counts.uncertain_occurrences, 2);
  assert.equal(report.counts.resolution_queue_coverage_pct, 100);
});

test("can recompute an observable ambiguity signal with the shared resolver", () => {
  const report = Preview.analyzeBundle(fixture(), {
    textId: "T1",
    ambiguityResolver: (unit) => unit.sampleWord === "את" ? { ambiguous: true, alts: [{ pealim_id: "A" }, { pealim_id: "B" }] } : null
  });
  assert.equal(report.counts.ambiguity_signal_occurrences, 6);
  assert.equal(report.counts.ambiguity_signal_coverage_pct, 100);
  assert.equal(report.counts.ambiguous_occurrences, 2);
});

test("is deterministic and never mutates bundle, review_log, or SRS arrays", () => {
  const input = fixture();
  const before = JSON.stringify(input);
  const first = Preview.analyzeBundle(input, { textId: "T1" });
  const second = Preview.analyzeBundle(input, { textId: "T1" });
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(input.notes_advanced.review_log, [{ id: "must-remain-untouched" }]);
  assert.deepEqual(input.notes_advanced.srs_cards, [{ id: "must-remain-untouched" }]);
});

test("plans a deterministic Obsidian package entirely in memory", () => {
  const report = Preview.analyzeBundle(fixture(), { textId: "T1" });
  const first = Preview.planObsidianPackage(report);
  const second = Preview.planObsidianPackage(report);
  assert.deepEqual(second, first);
  assert.equal(first.read_only, true);
  assert.equal(first.would_create_files, first.files.length + first.external_files.length);
  assert.equal(new Set(first.files.map((x) => x.path)).size, first.files.length);
  assert.ok(first.files.every((x) => x.path.startsWith("_LinguistPro/") || x.path === ".obsidian/snippets/linguistpro-study-v3.css"));
  assert.match(first.base_preview, /name: "Глаголы"/);
  assert.match(first.base_preview, /note\.lp_text_id == "T1"/);
  assert.match(first.resolution_base_preview, /note\.type == "lp-resolution-cluster"/);
  assert.ok(first.files.some((x) => x.kind === "resolution-cluster"));
  assert.ok(first.files.some((x) => x.path.endsWith("Очередь разбора.md")));
  assert.ok(first.would_write_bytes > 0);
  assert.equal(first.files.find((x) => x.path.endsWith("occurrences.tsv")).content.split("\n").length - 2, 6);
  assert.equal(first.files.find((x) => x.path.endsWith("resolution-occurrences.tsv")).content.split("\n").length - 2, report.counts.uncertain_occurrences);
  assert.equal(first.receipt.active_resolution_occurrences, 1);
  assert.equal(first.receipt.resolved_resolution_occurrences, 0);
  assert.ok(first.files.some((x) => x.path.endsWith("resolution-audit.json")));
});

test("builds a relocatable, human-first Obsidian study projection", () => {
  const report = Preview.analyzeBundle(fixture(), { textId: "T1" });
  const plan = Preview.planObsidianPackage(report);
  const base = plan.files.find((file) => file.path.endsWith("Лексика.base")).content;
  const resolutionBase = plan.files.find((file) => file.path.endsWith("Разбор.base")).content;
  const verb = plan.files.find((file) => file.kind === "text-lexeme" && file.path.endsWith("pid-2321.md")).content;
  const resolution = plan.files.find((file) => file.kind === "resolution-cluster").content;
  const phraseIndex = plan.files.find((file) => file.kind === "phrases-index");
  const phraseChunk = plan.files.find((file) => file.kind === "phrases-chunk");
  const hub = plan.files.find((file) => file.kind === "text").content;

  assert.doesNotMatch(base, /file\.inFolder/, "a package nested in an existing vault must still work");
  assert.match(base, /note\.type == "lp-text-lexeme"/);
  assert.match(base, /note\.lp_text_id == "T1"/);
  assert.match(base, /file\.asLink\(note\.lemma\)/, "the word column must open the local lexeme note");
  assert.match(base, /link\(note\.pealim_url, "Pealim ↗"\)/, "Pealim must also be directly reachable");
  assert.doesNotMatch(resolutionBase, /file\.inFolder/);

  assert.match(verb, /pealim_url: "https:\/\/www\.pealim\.com\/ru\/dict\/2321\/"/);
  assert.match(verb, /\[Открыть в Pealim ↗\]\(https:\/\/www\.pealim\.com\/ru\/dict\/2321\/\)/);
  assert.match(verb, /\[\[\.\.\/Фразы\/001–002#\^lp-phrase-[0-9a-f]{8}\|Фраза 1\]\]/);
  assert.doesNotMatch(verb, /`R1:0`/, "raw sentence ids and offsets stay out of learner-facing prose");

  const snapshot = plan.files.find((file) => file.kind === "snapshot").content;
  const queue = plan.files.find((file) => file.kind === "resolution-index").content;
  assert.match(snapshot, /\[\[Лексемы\/pid-2321\|/);
  assert.match(queue, /\[\[Разбор\/cluster-/);

  assert.ok(phraseIndex && phraseChunk, "the package must contain a reusable phrase notebook");
  assert.match(phraseIndex.content, /# Фразы текста/);
  assert.match(phraseChunk.content, /Сожгли дома/);
  assert.match(phraseChunk.content, /\^lp-phrase-[0-9a-f]{8}/);
  assert.match(hub, /\[\[Фразы\|Все фразы с переводом\]\]/);
  assert.match(resolution, /несколько возможных разборов/);
  assert.doesNotMatch(resolution, /^\d+\. `[^`]+` — \{/m, "candidate JSON must not be learner-facing");

  const unknownInput = fixture();
  unknownInput.notes_advanced.sentence_morph[0].tokens[1].posDicta = "";
  const unknownPlan = Preview.planObsidianPackage(Preview.analyzeBundle(unknownInput, { textId: "T1" }));
  const unknownResolution = unknownPlan.files
    .filter((file) => file.kind === "resolution-cluster")
    .map((file) => file.content)
    .find((content) => /lp_pos: "unknown"/.test(content));
  assert.ok(unknownResolution);
  assert.match(unknownResolution, /lp_pos_label: "не определена"/);
  assert.match(unknownResolution, /Предполагаемая часть речи: не определена/);
});

test("exports every source phrase even when a row has no morphology", () => {
  const input = fixture();
  input.library.texts[0].rows.push({
    row_id: "R3", order_index: 2, hebrew_plain: "שורה בלי ניתוח",
    hebrew_niqqud: "שׁוּרָה בְּלִי נִתּוּחַ", translit: "shura bli nituakh",
    translit_ru: "шура бли нитуах", russian: "Строка без разбора"
  });
  const report = Preview.analyzeBundle(input, { textId: "T1" });
  const plan = Preview.planObsidianPackage(report);
  const phrases = plan.files.filter((file) => file.kind === "phrases-chunk").map((file) => file.content).join("\n");

  assert.equal(report.text.rows_total, 3);
  assert.equal(report.text.rows_with_morph, 2);
  assert.equal(report.text.rows.length, 3);
  assert.match(phrases, /## Фраза 3/);
  assert.match(phrases, /Строка без разбора/);
  assert.match(phrases, /Транслитерация \(латиница\):\*\* shura bli nituakh/);
  assert.match(phrases, /Транскрипция \(русскими буквами\):\*\* шура бли нитуах/);
  assert.match(phrases, /<!-- lp_sentence_id: R3 -->/);
});

test("receipts prove unresolved to resolved without losing the audited occurrence", async () => {
  const report = Preview.analyzeBundle(fixture(), { textId: "T1" });
  const before = Preview.planObsidianPackage(report);
  const hydrated = await Service.hydrate(report, [], Core);
  const item = hydrated.resolution_audit.items[0];
  const event = {
    id: "resolution-1", occurrence_id: item.lp_occurrence_id, text_id: "T1", sentence_id: item.row_id,
    word_offset: item.word_offset, text_key: "text-kfar", order_index: item.order_index,
    surface_norm: item.surface, source_anchor: item.source_anchor, action: "manual_correction",
    chosen_analysis: { lemma: "נטע", lp_pos: "propernoun" }, candidate_fingerprint: item.candidate_fingerprint,
    actor_kind: "owner", created_at: "2026-09-04T01:00:00Z"
  };
  const resolved = await Service.hydrate(report, [event], Core);
  const after = Preview.planObsidianPackage(resolved, { previousReceipt: before.receipt });

  assert.equal(after.receipt.active_resolution_occurrences, 0);
  assert.equal(after.receipt.resolved_resolution_occurrences, 1);
  assert.deepEqual(after.receipt.resolution_transitions, [{ lp_occurrence_id: item.lp_occurrence_id, from: "unresolved", to: "resolved" }]);
  assert.equal(resolved.resolution_queue.items.length, 0);
  const audit = JSON.parse(after.files.find((x) => x.path.endsWith("resolution-audit.json")).content);
  assert.equal(audit.items.length, 1);
  assert.equal(audit.items[0].resolution_event_id, "resolution-1");
});

test("requires an explicit selection when a bundle contains multiple texts", () => {
  const input = fixture();
  input.library.texts.push({ text_id: "T2", title: "Other", rows: [] });
  assert.throws(() => Preview.analyzeBundle(input), /Select exactly one text/);
});

test("projects only exact Pealim forms into a progressive POS study model", () => {
  const report = Preview.analyzeBundle(fixture(), {
    textId: "T1",
    pealimResolver: (id) => String(id) === "2321" ? verbParadigm() : null
  });
  const verb = report.lexemes.find((x) => x.pealim_id === "2321");

  assert.equal(verb.study_forms.source, "pealim");
  assert.equal(verb.study_forms.model_version, "pealim-infl-v12");
  assert.deepEqual(verb.study_forms.core.map((x) => x.slot), ["INF-L", "AP-ms", "AP-fs", "AP-mp", "AP-fp"]);
  assert.deepEqual(verb.study_forms.groups.map((x) => x.key), ["present", "past", "future", "imperative", "infinitive"]);
  assert.equal(verb.study_forms.groups.some((g) => g.forms.some((f) => f.slot === "PERF-1s")), false,
    "missing Pealim cells must never be fabricated");

  const guarded = report.lexemes.find((x) => x.lp_pos === "propernoun");
  assert.equal(guarded.study_forms, null, "a guarded candidate cannot leak a dictionary paradigm into the learner view");
});

test("uses one shared Pealim slot taxonomy for nouns, adjectives, prepositions and invariants", () => {
  const noun = InflectionRender.projectStudyForms({ pos: "noun", kind: "noun", cells: {
    s: { he: "בַּיִת" }, p: { he: "בָּתִּים" }, sc: { he: "בֵּית" }, pc: { he: "בָּתֵּי" },
    "s-P-1s": { he: "בֵּיתִי" }
  } });
  const adjective = InflectionRender.projectStudyForms({ pos: "adjective", kind: "adjective", cells: {
    "ms-a": { he: "גָּדוֹל" }, "fs-a": { he: "גְּדוֹלָה" }, "mp-a": { he: "גְּדוֹלִים" }, "fp-a": { he: "גְּדוֹלוֹת" }
  } });
  const preposition = InflectionRender.projectStudyForms({ pos: "noun", kind: "noun", cells: {
    "P-1s": { he: "לִי" }, "P-2ms": { he: "לְךָ" }, "P-3ms": { he: "לוֹ" }
  } });
  const invariant = InflectionRender.projectStudyForms({ pos: "adverb", kind: "invariant", form: { he: "שָׁם", translit: "sham" } });

  assert.deepEqual(noun.core.map((x) => x.slot), ["s", "p", "sc", "pc"]);
  assert.ok(noun.groups.find((x) => x.key === "possessive_sg").forms.some((x) => x.slot === "s-P-1s"));
  assert.deepEqual(adjective.core.map((x) => x.slot), ["ms-a", "fs-a", "mp-a", "fp-a"]);
  assert.deepEqual(preposition.core.map((x) => x.slot), ["P-1s", "P-2ms", "P-3ms"]);
  assert.deepEqual(invariant.core, [{ slot: "form", label: "наречие", he: "שָׁם", translit: "sham" }]);
});

test("builds separate reusable references and per-text study notes without cross-text context overwrite", () => {
  const makeReport = (textId, rowId, sentence) => {
    const input = fixture();
    input.library.texts[0].text_id = textId;
    input.library.texts[0].rows[0].row_id = rowId;
    input.library.texts[0].rows[0].hebrew_niqqud = sentence;
    input.notes_advanced.occurrences.forEach((o) => { o.text_id = textId; if (o.sentence_id === "R1") o.sentence_id = rowId; });
    input.notes_advanced.sentence_morph.forEach((s) => { s.text_id = textId; if (s.sentence_id === "R1") s.sentence_id = rowId; });
    return Preview.analyzeBundle(input, { textId, pealimResolver: (id) => String(id) === "2321" ? verbParadigm() : null });
  };
  const first = Preview.planObsidianPackage(makeReport("T1", "R1", "שָׂרְפוּ אֶת הַבָּתִּים"));
  const second = Preview.planObsidianPackage(makeReport("T2", "R9", "שָׂרְפוּ אֶת הַבַּיִת"));
  const ref1 = first.files.find((f) => f.kind === "lexeme-reference" && /pid-2321\.md$/.test(f.path));
  const ref2 = second.files.find((f) => f.kind === "lexeme-reference" && /pid-2321\.md$/.test(f.path));
  const study1 = first.files.find((f) => f.kind === "text-lexeme" && /pid-2321\.md$/.test(f.path));
  const study2 = second.files.find((f) => f.kind === "text-lexeme" && /pid-2321\.md$/.test(f.path));

  assert.equal(ref1.path, "_LinguistPro/reference/lexemes/pid-2321.md");
  assert.equal(ref2.path, ref1.path);
  assert.equal(ref2.content, ref1.content, "same exact Pealim snapshot must produce the same shared reference file");
  assert.doesNotMatch(ref1.content, /שָׂרְפוּ אֶת הַבָּתִּים|lp_occurrence/);
  assert.match(study1.path, /texts\/T1\/Лексемы\/pid-2321\.md$/);
  assert.match(study2.path, /texts\/T2\/Лексемы\/pid-2321\.md$/);
  assert.match(study1.content, /שָׂרְפוּ אֶת הַבָּתִּים/);
  assert.match(study2.content, /שָׂרְפוּ אֶת הַבַּיִת/);
});

test("plans deduplicated phrase audio and emits players only for successfully included bytes", () => {
  const input = fixture();
  input.library.texts[0].rows[0].audio_asset_key = "tts:shared/he";
  input.library.texts[0].rows[1].audio_asset_key = "tts:shared/he";
  input.library.audio_assets = [{ asset_key: "tts:shared/he", mime_type: "audio/mpeg", language: "he-IL" }];
  const report = Preview.analyzeBundle(input, { textId: "T1" });

  const pending = Preview.planObsidianPackage(report);
  assert.equal(pending.audio_plan.expected_count, 1);
  assert.equal(pending.receipt.audio.pending_count, 1);
  assert.doesNotMatch(pending.files.find((f) => f.kind === "phrases-chunk").content, /!\[\[_LinguistPro\/media\/audio/);

  const included = Preview.planObsidianPackage(report, { audioResults: [
    { asset_key: "tts:shared/he", status: "included", size_bytes: 1234 }
  ] });
  const audio = included.external_files[0];
  assert.equal(included.receipt.audio.included_count, 1);
  assert.equal(included.receipt.audio.missing_count, 0);
  assert.equal(audio.asset_key, "tts:shared/he");
  assert.match(audio.path, /^_LinguistPro\/media\/audio\/[A-Za-z0-9._-]+\.mp3$/);
  assert.equal((included.files.find((f) => f.kind === "phrases-chunk").content.match(/!\[\[/g) || []).length, 2);

  const missing = Preview.planObsidianPackage(report, { audioResults: [
    { asset_key: "tts:shared/he", status: "missing", reason: "AUDIO_HTTP_404" }
  ] });
  assert.equal(missing.receipt.audio.missing_count, 1);
  assert.doesNotMatch(missing.files.find((f) => f.kind === "phrases-chunk").content, /!\[\[/);
});

test("renders an active-recall phrase workflow while keeping translation collapsed", () => {
  const input = fixture();
  input.library.texts[0].rows[0].audio_asset_key = "audio-1";
  const report = Preview.analyzeBundle(input, { textId: "T1" });
  const plan = Preview.planObsidianPackage(report, { audioResults: [{ asset_key: "audio-1", status: "included", size_bytes: 10 }] });
  const chunk = plan.files.find((f) => f.kind === "phrases-chunk").content;
  const hub = plan.files.find((f) => f.kind === "text").content;

  assert.match(chunk, /Сначала прослушайте/);
  assert.match(chunk, /> \[!answer\]- Перевод и опоры/);
  assert.match(chunk, /Скажите фразу вслух/);
  assert.match(hub, /Первый проход: смысл на слух/);
  assert.match(hub, /LinguistPro остаётся единственным местом интервальных повторений/);
});

test("escapes imported text before placing it in Markdown and HTML learning surfaces", () => {
  const input = fixture();
  input.library.texts[0].title = "Текст <script>alert(1)</script>";
  input.library.texts[0].rows[0].hebrew_niqqud = "שָׁלוֹם <img src=x onerror=alert(1)>";
  input.library.texts[0].rows[0].russian = "Перевод <script>alert(2)</script> с _разметкой_";
  input.notes_advanced.notes[0].body_json = JSON.stringify({
    word: "שרפו", niqqud_variant: "שָׂרְפוּ", lemma: "לשרוף", pos: "verb", root: "שרף",
    binyan: "paal", meaning: "жечь <script>alert(3)</script>", pealim_id: "2321"
  });
  const report = Preview.analyzeBundle(input, { textId: "T1", pealimResolver: (id) => String(id) === "2321" ? verbParadigm() : null });
  const plan = Preview.planObsidianPackage(report);
  const learnerMarkdown = plan.files.filter((file) => /^(text|text-lexeme|phrases-chunk)$/.test(file.kind))
    .map((file) => file.content.replace(/^---[\s\S]*?\n---\s*/m, "")).join("\n");

  assert.doesNotMatch(learnerMarkdown, /(^|[^\\])<script/i);
  assert.doesNotMatch(learnerMarkdown, /(^|[^\\])<img\s/i);
  assert.match(learnerMarkdown, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.ok(learnerMarkdown.includes(String.raw`\<script\>alert(2)\</script\>`));
  assert.match(learnerMarkdown, /\\_разметкой\\_/);
});
