// tests/subtitleMaterialCore.test.js — pure core for materials built from container subtitle tracks.
// Fixture shapes follow docs/research/studio-subtitle-video-material/2026-09-16 (aggregates only).
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const SMC = require("../public/js/subtitle-material-core.js");

const RLE = "‫";
const PDF = "‬";
const he = (text) => RLE + text + PDF;

function cue(start, end, text) {
  return { start, end, text };
}

// One Hebrew track: Hebrew speech, then two cues over Arabic speech, then Hebrew speech again.
const HEBREW_CUES = [
  cue(4.0, 6.0, he("מה זה?")),
  cue(6.2, 8.0, he("הגיע משהו.")),
  cue(10.0, 12.0, he("הוא ברח מעזה")),
  cue(12.0, 14.0, he("דרך מעבר רפיח.")),
  cue(20.0, 22.0, he("{\\an8}יפה?")),
];
const FORCED_CUES = [
  cue(10.0, 12.0, he("[בערבית] הוא ברח מעזה")),
  cue(12.0, 14.0, he("דרך מעבר רפיח.")),
];
const SDH_CUES = [
  cue(3.0, 3.8, he("[מוזיקה מותחת]")),
  cue(4.0, 6.0, he("מה זה?")),
  cue(6.2, 8.0, he("הגיע משהו.")),
];
const RUSSIAN_CUES = [
  cue(4.0, 6.0, "Что это?"),
  cue(6.2, 8.0, "Кое-что получил."),
  cue(10.0, 14.0, "[Он сбежал из Газы\nчерез Рафах.]"),
  cue(20.0, 22.0, "Красиво?"),
];

function tracks() {
  return [
    { index: 4, language: "ru", title: null, disposition: {}, cues: RUSSIAN_CUES },
    { index: 6, language: "he", title: "Forced", disposition: {}, cues: FORCED_CUES },
    { index: 7, language: "he", title: null, disposition: {}, cues: HEBREW_CUES },
    { index: 8, language: "he", title: "SDH", disposition: { hearing_impaired: 1 }, cues: SDH_CUES },
  ];
}

const TABLE_ROWS = [
  { index: 0, start: 4, end: 6, text: "מה זה?", source_cue_indexes: [0],
    speech_language: "target_assumed", speech_language_named: null, translation: "Что это?", translation_group: null },
  { index: 1, start: 10, end: 14, text: "הוא ברח מעזה דרך מעבר רפיח.", source_cue_indexes: [2, 3],
    speech_language: "other", speech_language_named: "ar", translation: "Он сбежал из Газы через Рафах.", translation_group: "tgroup:2" },
];
const TABLE_OPTIONS = {
  textTrackIndex: 7, textTrackSha256: "a".repeat(64),
  translationTrackIndex: 4, translationTrackSha256: "b".repeat(64),
  language: "he", translationLanguage: "ru",
};

test("buildTableRows fills the studio row shape from subtitles, leaving the free columns empty", () => {
  const table = SMC.buildTableRows(TABLE_ROWS, TABLE_OPTIONS);
  assert.equal(table.length, 2);
  assert.equal(table[0].he, "מה זה?");
  assert.equal(table[0].ru, "Что это?");
  // Niqqud and transliteration stay empty on purpose: the product fills them deterministically
  // and for free, so no paid provider is involved in a subtitle material.
  assert.deepEqual(
    [table[0].niqqud, table[0].translit, table[0].translit_sbl, table[0].translit_ru],
    ["", "", "", ""],
  );
  assert.equal(table[0].segment_index, 0);
  assert.equal(table[0].source_line_index, 0);
  assert.equal(table[1].segment_index, 1);
  assert.equal(table[0].translation_provider, "subtitle-track");

  const meta = JSON.parse(table[0].translation_meta_json);
  assert.equal(meta.provider, "subtitle-track");
  assert.equal(meta.local_execution, true);
  assert.equal(meta.paid, false);
  assert.equal(meta.text_track_index, 7);
  assert.equal(meta.text_track_sha256, "a".repeat(64));
  assert.equal(meta.translation_track_index, 4);
  assert.equal(meta.translation_track_sha256, "b".repeat(64));
  assert.equal(meta.translation_source, "subtitle-track");
  assert.deepEqual(meta.source_cue_indexes, [0]);
  assert.equal(meta.start_ms, 4000);
  assert.equal(meta.end_ms, 6000);
  assert.equal(meta.speech_language, "target_assumed");
  assert.equal(meta.speech_language_named, null);
});

test("buildTableRows keeps non-target speech and grouped translations honest", () => {
  const table = SMC.buildTableRows(TABLE_ROWS, TABLE_OPTIONS);
  const meta = JSON.parse(table[1].translation_meta_json);
  assert.equal(meta.speech_language, "other");
  assert.equal(meta.speech_language_named, "ar");
  assert.equal(meta.translation_group, "tgroup:2");
  assert.deepEqual(meta.source_cue_indexes, [2, 3]);

  const untranslated = SMC.buildTableRows(
    [Object.assign({}, TABLE_ROWS[0], { translation: null, translation_group: null })],
    TABLE_OPTIONS,
  );
  assert.equal(untranslated[0].ru, "");
  assert.equal(untranslated[0].translation_provider, null);
  assert.equal(JSON.parse(untranslated[0].translation_meta_json).translation_source, "missing");
});

function readiness(overrides = {}) {
  return {
    outcome: "AUDIO_TRANSCODE_REQUIRED",
    plan: { mode: "audio_transcode", selected_audio_stream: 2, selected_video_stream: 0 },
    plan_sha256: "a".repeat(64),
    lite_plan: { mode: "lite_transcode", height: 540, max_output_bytes: 419430400 },
    lite_plan_sha256: "b".repeat(64),
    lite_reason: null,
    audio_selection: { index: 2, type_index: 1, language: "he", title: null, reason: "target_language_tag" },
    audio_choices: [{ index: 1, language: "ru" }, { index: 2, language: "he" }],
    estimated_output_bytes: 1_670_000_000,
    estimated_time_seconds: 160,
    ...overrides,
  };
}

test("buildMaterialPlan names one action per stream and asks nothing when the choice is clear", () => {
  const plan = SMC.buildMaterialPlan({
    readiness: readiness(), tracks: tracks(), targetLanguage: "he", translationLanguage: "ru",
  });
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.video, { action: "copy", mode: "audio_transcode" });
  assert.equal(plan.audio.index, 2);
  assert.equal(plan.audio.language, "he");
  assert.equal(plan.audio.reason, "target_language_tag");
  assert.equal(plan.text.index, 7);
  assert.equal(plan.text.cue_count, HEBREW_CUES.length);
  assert.equal(plan.text.reason, "target_language_full_track");
  assert.equal(plan.translation.index, 4);
  assert.equal(plan.translation.coverage, 1);
  assert.deepEqual(plan.signal_track_indexes, [6]);
  assert.deepEqual(plan.lite, { available: true, height: 540, max_output_bytes: 419430400, reason: null });
  assert.deepEqual(plan.size, { estimated_output_bytes: 1_670_000_000, estimated_time_seconds: 160 });
  assert.equal(plan.plan_sha256, "a".repeat(64));
  assert.equal(plan.lite_plan_sha256, "b".repeat(64));
  assert.deepEqual(plan.questions, []);
});

test("buildMaterialPlan turns a real ambiguity into exactly one question and refuses to confirm", () => {
  const audioChoice = SMC.buildMaterialPlan({
    readiness: readiness({ outcome: "AUDIO_STREAM_CHOICE_REQUIRED", plan: null, plan_sha256: null, audio_selection: null }),
    tracks: tracks(), targetLanguage: "he", translationLanguage: "ru",
  });
  assert.equal(audioChoice.status, "needs_choice");
  assert.equal(audioChoice.questions.length, 1);
  assert.equal(audioChoice.questions[0].kind, "audio");
  assert.deepEqual(audioChoice.questions[0].choices.map((choice) => choice.index), [1, 2]);
  assert.equal(audioChoice.plan_sha256, null);

  const twin = tracks().concat([{ index: 9, language: "he", title: null, disposition: {}, cues: HEBREW_CUES.slice(0, 4) }]);
  const textChoice = SMC.buildMaterialPlan({
    readiness: readiness(), tracks: twin, targetLanguage: "he", translationLanguage: "ru",
  });
  assert.equal(textChoice.status, "needs_choice");
  assert.equal(textChoice.questions[0].kind, "text");
  assert.deepEqual(textChoice.questions[0].choices.map((choice) => choice.index), [7, 9]);
});

test("buildMaterialPlan reports an unbuildable material and an unreachable light copy honestly", () => {
  const noHebrew = SMC.buildMaterialPlan({
    readiness: readiness(), tracks: [tracks()[0]], targetLanguage: "he", translationLanguage: "ru",
  });
  assert.equal(noHebrew.status, "blocked");
  assert.equal(noHebrew.text, null);
  assert.equal(noHebrew.reason, "target_language_missing");

  const noLite = SMC.buildMaterialPlan({
    readiness: readiness({ lite_plan: null, lite_plan_sha256: null, lite_reason: "lite_budget_unreachable" }),
    tracks: tracks(), targetLanguage: "he", translationLanguage: "ru",
  });
  assert.equal(noLite.status, "ready");
  assert.deepEqual(noLite.lite, { available: false, height: null, max_output_bytes: null, reason: "lite_budget_unreachable" });

  const noTranslation = SMC.buildMaterialPlan({
    readiness: readiness(), tracks: tracks().filter((track) => track.index !== 4),
    targetLanguage: "he", translationLanguage: "ru",
  });
  assert.equal(noTranslation.status, "ready");
  assert.equal(noTranslation.translation, null);
  assert.equal(noTranslation.translation_reason, "translation_language_missing");
});

test("buildMaterialPlan maps every companion mode to one honest video action", () => {
  const copy = SMC.buildMaterialPlan({ readiness: readiness({ plan: { mode: "lossless_repair" } }), tracks: tracks(), targetLanguage: "he", translationLanguage: "ru" });
  assert.equal(copy.video.action, "copy");
  const full = SMC.buildMaterialPlan({ readiness: readiness({ plan: { mode: "transcode" } }), tracks: tracks(), targetLanguage: "he", translationLanguage: "ru" });
  assert.equal(full.video.action, "transcode");
  const ready = SMC.buildMaterialPlan({ readiness: readiness({ outcome: "READY", plan: null, plan_sha256: null }), tracks: tracks(), targetLanguage: "he", translationLanguage: "ru" });
  assert.deepEqual(ready.video, { action: "ready", mode: null });
});

test("normalizeCueText strips bidi controls, styling tags and keeps bracket marks as metadata", () => {
  const result = SMC.normalizeCueText(he("{\\an8}<i>שלום</i> [בערבית]"));
  assert.equal(result.text, "שלום");
  assert.deepEqual(result.marks, ["בערבית"]);
  assert.equal(/[‎‏‪-‮⁦-⁩]/.test(result.text), false);

  const dialogue = SMC.normalizeCueText("- כן.\n-בסדר.");
  assert.equal(dialogue.turns, 2);
  assert.equal(dialogue.text.includes("\n"), false);
  assert.equal(SMC.normalizeCueText("  двойной   пробел  ").text, "двойной пробел");
  assert.deepEqual(SMC.normalizeCueText(null), { text: "", marks: [], turns: 0 });
});

test("detectScriptLanguage names the dominant script, not a guessed language", () => {
  assert.equal(SMC.detectScriptLanguage(he("מה זה?")), "he");
  assert.equal(SMC.detectScriptLanguage("Что это?"), "cyrillic");
  assert.equal(SMC.detectScriptLanguage("What is it?"), "latin");
  assert.equal(SMC.detectScriptLanguage("هذا عربي"), "ar");
  assert.equal(SMC.detectScriptLanguage("123 — 456"), null);
});

test("classifyTracks marks forced and SDH tracks by flag, title and content", () => {
  const classified = SMC.classifyTracks(tracks());
  const byIndex = Object.fromEntries(classified.map((track) => [track.index, track]));
  assert.equal(byIndex[6].forced, true);
  assert.equal(byIndex[6].forced_evidence, "title");
  assert.equal(byIndex[8].sdh, true);
  assert.equal(byIndex[8].sdh_evidence, "disposition");
  assert.equal(byIndex[7].forced, false);
  assert.equal(byIndex[7].sdh, false);

  // A forced track named like an ordinary one is still a time-subset of the full track.
  const untitled = tracks().map((track) => (track.index === 6 ? { ...track, title: null } : track));
  const contentBased = SMC.classifyTracks(untitled).find((track) => track.index === 6);
  assert.equal(contentBased.forced, true);
  assert.equal(contentBased.forced_evidence, "subset_of_track_7");

  // An SDH track is recognised by its share of sound-description cues.
  const noFlag = tracks().map((track) => (track.index === 8 ? { ...track, title: null, disposition: {} } : track));
  const sdhByContent = SMC.classifyTracks(noFlag).find((track) => track.index === 8);
  assert.equal(sdhByContent.sdh, true);
  assert.equal(sdhByContent.sdh_evidence, "sound_description_share");

  // An untagged track keeps an honest script-derived language.
  const untagged = SMC.classifyTracks([{ index: 3, language: null, cues: HEBREW_CUES }])[0];
  assert.equal(untagged.language, "he");
  assert.equal(untagged.language_evidence, "script");
});

test("selectTracks picks the full target track, the translation track and keeps forced as a signal", () => {
  const plan = SMC.selectTracks({ tracks: tracks(), targetLanguage: "he", translationLanguage: "ru" });
  assert.equal(plan.status, "ok");
  assert.equal(plan.text_track.index, 7);
  assert.equal(plan.reasons.text, "target_language_full_track");
  assert.equal(plan.translation_track.index, 4);
  assert.equal(plan.reasons.translation, "translation_language_aligned");
  assert.deepEqual(plan.signal_tracks.map((track) => track.index), [6]);

  const noTranslation = SMC.selectTracks({ tracks: tracks().filter((track) => track.index !== 4), targetLanguage: "he", translationLanguage: "ru" });
  assert.equal(noTranslation.status, "ok");
  assert.equal(noTranslation.translation_track, null);
  assert.equal(noTranslation.reasons.translation, "translation_language_missing");

  // A translation track whose cues do not line up is refused instead of silently mismapped.
  const shifted = tracks().map((track) => (track.index === 4
    ? { ...track, cues: track.cues.map((item) => cue(item.start + 900, item.end + 900, item.text)) }
    : track));
  const refused = SMC.selectTracks({ tracks: shifted, targetLanguage: "he", translationLanguage: "ru" });
  assert.equal(refused.translation_track, null);
  assert.equal(refused.reasons.translation, "translation_coverage_too_low");

  // Two equally plausible full Hebrew tracks are the one case worth a question.
  const twin = tracks().concat([{ index: 9, language: "he", title: null, disposition: {}, cues: HEBREW_CUES.slice(0, 4) }]);
  const ambiguous = SMC.selectTracks({ tracks: twin, targetLanguage: "he", translationLanguage: "ru" });
  assert.equal(ambiguous.status, "needs_choice");
  assert.deepEqual(ambiguous.choices.map((track) => track.index), [7, 9]);

  const none = SMC.selectTracks({ tracks: [tracks()[0]], targetLanguage: "he", translationLanguage: "ru" });
  assert.equal(none.status, "needs_choice");
  assert.equal(none.reasons.text, "target_language_missing");
});

test("alignTranslation maps by time overlap and groups a translation cue covering several rows", () => {
  const alignment = SMC.alignTranslation(HEBREW_CUES, RUSSIAN_CUES);
  assert.equal(alignment.coverage, 1);
  assert.deepEqual(alignment.pairs[0], { text_index: 0, translation_indexes: [0], group_id: null });
  assert.deepEqual(alignment.pairs[2].translation_indexes, [2]);
  assert.equal(alignment.pairs[2].group_id, alignment.pairs[3].group_id);
  assert.notEqual(alignment.pairs[2].group_id, null);
  assert.equal(alignment.groups.length, 1);

  const partial = SMC.alignTranslation(HEBREW_CUES, RUSSIAN_CUES.slice(0, 2));
  assert.equal(partial.coverage, 0.4);
  assert.deepEqual(partial.pairs[4].translation_indexes, []);
});

test("speechLanguage uses forced overlap and named marks, and stays honest without evidence", () => {
  const verdicts = SMC.speechLanguage(HEBREW_CUES, {
    forcedCues: FORCED_CUES,
    translationCues: RUSSIAN_CUES,
    targetLanguage: "he",
  });
  assert.deepEqual(verdicts.map((item) => item.value), ["target_assumed", "target_assumed", "other", "other", "target_assumed"]);
  assert.equal(verdicts[2].named, "ar");
  assert.deepEqual(verdicts[2].evidence, ["forced_track", "language_mark", "translation_brackets"]);
  assert.equal(verdicts[0].evidence.length, 0);

  // Bracket convention is only trusted when it agrees with the forced track in this same file.
  const noisyTranslation = RUSSIAN_CUES.map((item, index) => (index === 0 ? cue(item.start, item.end, "[Что это?]") : item));
  const calibrated = SMC.speechLanguage(HEBREW_CUES, {
    forcedCues: FORCED_CUES, translationCues: noisyTranslation, targetLanguage: "he",
  });
  assert.equal(calibrated.calibration.translation_brackets_trusted, false);
  assert.equal(calibrated[0].value, "target_assumed");

  // Without a forced track nothing calibrates the bracket convention, so it is not used at all.
  const withoutForced = SMC.speechLanguage(HEBREW_CUES, { translationCues: RUSSIAN_CUES, targetLanguage: "he" });
  assert.equal(withoutForced.calibration.translation_brackets_trusted, false);
  assert.equal(withoutForced[2].value, "target_assumed");
  assert.equal(withoutForced[3].value, "target_assumed");

  // A cue that names the spoken language itself needs no other evidence.
  const marked = SMC.speechLanguage([cue(0, 2, he("[בערבית] שלום"))], { targetLanguage: "he" });
  assert.equal(marked[0].value, "other");
  assert.equal(marked[0].named, "ar");
  assert.deepEqual(marked[0].evidence, ["language_mark"]);
});

test("buildRows merges cues into sentences without crossing a speech-language or pause boundary", () => {
  const verdicts = SMC.speechLanguage(HEBREW_CUES, { forcedCues: FORCED_CUES, translationCues: RUSSIAN_CUES, targetLanguage: "he" });
  const rows = SMC.buildRows({
    textCues: HEBREW_CUES,
    speechLanguage: verdicts,
    translation: SMC.alignTranslation(HEBREW_CUES, RUSSIAN_CUES),
    translationCues: RUSSIAN_CUES,
  });
  // A cue that already ends a sentence stays its own row; only an unfinished cue takes the next one.
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], {
    index: 0,
    start: 4.0,
    end: 6.0,
    text: "מה זה?",
    source_cue_indexes: [0],
    speech_language: "target_assumed",
    speech_language_named: null,
    translation: "Что это?",
    translation_group: null,
  });
  assert.deepEqual(rows[1].source_cue_indexes, [1]);
  assert.equal(rows[1].translation, "Кое-что получил.");
  // The Arabic-speech cues continue one sentence, so they form a single row with one translation.
  assert.deepEqual(rows[2].source_cue_indexes, [2, 3]);
  assert.equal(rows[2].start, 10.0);
  assert.equal(rows[2].end, 14.0);
  assert.equal(rows[2].text, "הוא ברח מעזה דרך מעבר רפיח.");
  assert.equal(rows[2].speech_language, "other");
  assert.equal(rows[2].speech_language_named, "ar");
  assert.equal(rows[2].translation, "Он сбежал из Газы через Рафах.");
  assert.equal(typeof rows[2].translation_group, "string");
  assert.equal(rows[3].text, "יפה?");
  assert.equal(rows[3].translation, "Красиво?");

  const longPause = SMC.buildRows({
    textCues: [cue(0, 1, he("שלום")), cue(30, 31, he("ובוקר טוב"))],
    speechLanguage: [{ value: "target_assumed" }, { value: "target_assumed" }],
  });
  assert.equal(longPause.length, 2);
});
