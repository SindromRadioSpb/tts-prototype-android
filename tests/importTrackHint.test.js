// tests/importTrackHint.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const SI = require("../public/js/studio-import.js");

const T = (lang, kind, name) => ({ languageCode: lang, kind: kind, languageName: name });

test("manual Hebrew wins over everything, alphabet is irrelevant", () => {
  const list = [T("az", "", "Азербайджанский"), T("sq", "", "Албанский"),
                T("en", "", "Английский"), T("iw", "", "Иврит")];
  const r = SI.chooseTrackHint(list, true);
  assert.equal(r.key, "studio.import.captionsTracksHeManual");
  assert.equal(r.more, 3);
});

test("he code variant is recognised too", () => {
  assert.equal(SI.chooseTrackHint([T("he", "", "Hebrew")], true).key,
               "studio.import.captionsTracksHeManual");
});

test("auto Hebrew is named as auto, not as manual", () => {
  const r = SI.chooseTrackHint([T("en", "", "Английский"), T("iw", "asr", "Иврит")], true);
  assert.equal(r.key, "studio.import.captionsTracksHeAuto");
});

test("manual Hebrew beats auto Hebrew when both exist", () => {
  const r = SI.chooseTrackHint([T("iw", "asr", "Иврит"), T("iw", "", "Иврит")], true);
  assert.equal(r.key, "studio.import.captionsTracksHeManual");
});

test("no Hebrew: says so and lists at most three others", () => {
  const list = [T("en", "", "Английский"), T("de", "", "Немецкий"),
                T("fr", "", "Французский"), T("es", "", "Испанский")];
  const r = SI.chooseTrackHint(list, true);
  assert.equal(r.key, "studio.import.captionsTracksNoHe");
  assert.equal(r.langs.split(", ").length, 3);
  assert.equal(r.more, 1);
});

test("empty list: pending before confirmation, none after", () => {
  assert.equal(SI.chooseTrackHint([], false).key, "studio.import.captionsTracksPending");
  assert.equal(SI.chooseTrackHint([], true).key, "studio.import.captionsTracksNone");
  assert.equal(SI.chooseTrackHint(null, false).key, "studio.import.captionsTracksPending");
});

test("a track without name or code never renders as undefined", () => {
  const r = SI.chooseTrackHint([{ kind: "" }, T("en", "", "Английский")], true);
  assert.equal(r.key, "studio.import.captionsTracksNoHe");
  assert.ok(!/undefined/.test(r.langs || ""));
});

test("all tracks nameless: langs is empty string, not undefined (guards the {langs} leak)", () => {
  // Whole-branch review 2026-07-28 MINOR: describeTracks() used `r.langs ? {...} : null`, which
  // treated "" the same as "no langs field at all" and skipped i18n's {param} substitution
  // entirely, leaking the literal "{langs}" into the UI. This proves the DATA side of the fix:
  // chooseTrackHint() must hand back "" (falsy but defined), not undefined, even when every
  // track lacks both a languageCode and a languageName.
  const r = SI.chooseTrackHint([{ kind: "" }, { kind: "asr" }], true);
  assert.equal(r.key, "studio.import.captionsTracksNoHe");
  assert.equal(r.langs, "");
  assert.notEqual(r.langs, undefined);
});

test("more counts DISTINCT languages, not raw tracks — one language can have both a manual and an auto track", () => {
  // Whole-branch review 2026-07-28 MINOR: HeManual/HeAuto used to count tracks.length - heManual/
  // he.length, while NoHe counted unique names — same word ("more"), two different promises. Here
  // English has TWO tracks (manual + auto) alongside manual Hebrew and manual French: the old
  // (track-counting) code would have reported more=3 (4 tracks total - 1 Hebrew); the fixed
  // (language-counting) code must report more=2 (English, French — English counted once).
  const list = [T("iw", "", "Иврит"), T("en", "", "English (manual)"), T("en", "asr", "English (auto)"),
                T("fr", "", "Français")];
  const r = SI.chooseTrackHint(list, true);
  assert.equal(r.key, "studio.import.captionsTracksHeManual");
  assert.equal(r.more, 2);
});

test("more counts DISTINCT languages for the HeAuto branch too", () => {
  const list = [T("iw", "asr", "Hebrew (auto)"), T("de", "", "Deutsch (manual)"), T("de", "asr", "Deutsch (auto)")];
  const r = SI.chooseTrackHint(list, true);
  assert.equal(r.key, "studio.import.captionsTracksHeAuto");
  assert.equal(r.more, 1); // German counted once, not twice for its two tracks
});

test("pluralCategory: Russian one/few/many boundaries (owner-found defect: 63 → \"языков\" was wrong)", () => {
  const ru = (n) => SI.pluralCategory(n, "ru");
  assert.equal(ru(1), "one");
  assert.equal(ru(21), "one");   // 21 % 10 === 1, 21 % 100 !== 11
  assert.equal(ru(101), "one");
  assert.equal(ru(2), "few");
  assert.equal(ru(3), "few");
  assert.equal(ru(4), "few");
  assert.equal(ru(63), "few");   // the owner's own reported scenario — must NOT be "many"
  assert.equal(ru(22), "few");
  assert.equal(ru(5), "many");
  assert.equal(ru(11), "many");  // the x1-but-teen exception
  assert.equal(ru(12), "many");
  assert.equal(ru(14), "many");
  assert.equal(ru(20), "many");
  assert.equal(ru(111), "many"); // the x11-but-hundred exception
});

test("pluralCategory: English and Hebrew are binary (singular only at exactly 1)", () => {
  for (const locale of ["en", "he"]) {
    assert.equal(SI.pluralCategory(1, locale), "one");
    assert.equal(SI.pluralCategory(0, locale), "many");
    assert.equal(SI.pluralCategory(2, locale), "many");
    assert.equal(SI.pluralCategory(21, locale), "many"); // no Russian-style "one" at 21 here
    assert.equal(SI.pluralCategory(63, locale), "many");
  }
});

test("B+C: row identity separates ASR source segment from premium sentence ordinal", () => {
  const sha = "a".repeat(64);
  const audio = {
    media: { sha256: sha },
    segments: [{ id: "local-seg-0", text: "שלום" }, { text: "עולם" }],
    timing: { entries: [{ row: 0, seg: 0 }, { row: 1, seg: 1 }] },
    timingMap: { source: "source_line_index+aligned" },
  };
  const raw = SI.rowEditMetaForSave({
    edit_meta_json: JSON.stringify({ edited: { ru: true } }),
    source_line_index: 1,
    segment_index: 7,
  }, audio, 0);
  const parsed = JSON.parse(raw);
  assert.deepEqual(parsed.edited, { ru: true }, "existing edit provenance must survive");
  assert.deepEqual(parsed._studio_source, {
    schema: "studio-row-source-v1",
    source_segment_id: "local-seg-0",
    source_line_index: 1,
    sentence_index: 7,
  });
  assert.deepEqual(
    SI.restorePortableRowIdentity({ he: "שלום" }, raw),
    { he: "שלום", source_segment_id: "local-seg-0", source_line_index: 1, sentence_index: 7 }
  );

  const derived = JSON.parse(SI.rowEditMetaForSave({}, {
    media: { sha256: sha }, segments: [{}, {}],
    timing: { entries: [{ row: 0, seg: 0 }, { row: 1, seg: 1 }] },
    timingMap: { source: "segment_index+aligned" },
  }, 1));
  assert.equal(derived._studio_source.source_segment_id, `asrseg:${sha}:1`);
  assert.equal(derived._studio_source.source_line_index, 1);
  assert.equal(derived._studio_source.sentence_index, null,
    "seg-mode segment_index must not be relabelled as the premium sentence ordinal");
});

test("B+C: imported media starts a new draft and media SHA is strict", () => {
  assert.deepEqual(SI.importSessionResetPatch(), {
    mode: "draft", textId: null, baseTextId: null, resumeSentenceId: null,
    title: null, openMode: null,
  });
  const sha = "B".repeat(64);
  assert.equal(SI.mediaSourceSha({ audio: { media: { sha256: sha } } }), sha.toLowerCase());
  assert.equal(SI.mediaSourceSha({ audio: { media: { sha256: "not-a-hash" } } }), null);
});

test("ASR draft promotion keeps asserted seam timing but marks the rejected segment blind", async () => {
  const source = [
    { id: "lasr-left", start: 874.82, end: 878.6, text: "שורה לפני השוליים" },
    { id: "lasr-seam", start: 870, end: 890.52, text: "שורת חפיפה מהחלון הבא" },
    { id: "lasr-right", start: 893.4, end: 894.52, text: "שורה אחרי השוליים" },
  ];
  const validated = [
    { i: 0, start: 874.82, text: source[0].text },
    { i: 1, start: null, text: source[1].text },
    { i: 2, start: 893.4, text: source[2].text },
  ];

  const promoted = SI.mediaSegmentsForPromotion(source, validated);
  assert.equal(promoted.length, 3, "a rejected timestamp must never drop its transcript line");
  assert.equal(promoted[1].start, 870, "the provider-asserted timestamp survives; no interpolation is invented");
  assert.equal(promoted[1].end, 890.52);
  assert.equal(promoted[1].blind, true, "the locally rejected seam remains visibly untrusted");
  assert.ok(promoted[1].quality_flags.includes("blind"));
  assert.equal(promoted[0].blind, false);
});

test("media-package creation failure cannot land a flat media transcript in the composer", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "studio-import.js"), "utf8");
  const create = source.indexOf("mediaPackage = await window.StudioMediaPackage.createFromImportMeta(importMeta)");
  const failure = source.indexOf('setStatus("studio.mediaPackage.createBlocked"', create);
  const stop = source.indexOf("return false", failure);
  const composerWrite = source.indexOf('var input = $("inputText")', create);
  assert.ok(create >= 0 && failure > create && stop > failure && composerWrite > stop,
    "a failed canonical promotion must remain retryable in Import instead of creating a media-less >250-row draft");
});

test("L3a: row-source-v2 keeps corrected id, complete raw lineage and distinct ordinals", () => {
  const sha = "c".repeat(64);
  const audio = {
    media: { sha256: sha },
    segments: [{
      caption_segment_id: "cseg:corrected-1",
      source_segment_id: "srcseg:legacy-first",
      source_segment_ids: ["srcseg:raw-1", "srcseg:raw-2"],
      text: "שלום מיה",
    }],
    timing: { entries: [{ row: 0, seg: 0 }] },
    timingMap: { source: "aligned" },
  };
  const raw = SI.rowEditMetaForSave({ source_line_index: 4, sentence_index: 9 }, audio, 0);
  const src = JSON.parse(raw)._studio_source;
  assert.deepEqual(src, {
    schema: "studio-row-source-v2",
    source_segment_id: "srcseg:raw-1",
    source_segment_ids: ["srcseg:raw-1", "srcseg:raw-2"],
    caption_segment_id: "cseg:corrected-1",
    source_line_index: 4,
    sentence_index: 9,
  });
  assert.deepEqual(SI.restorePortableRowIdentity({}, raw), {
    source_segment_id: "srcseg:raw-1", source_segment_ids: ["srcseg:raw-1", "srcseg:raw-2"],
    caption_segment_id: "cseg:corrected-1", source_line_index: 4, sentence_index: 9,
  });
});

test("L3a: save consumes proven row_seg_idx when karaoke entries use the real {o,t} shape", () => {
  const audio = {
    media: { sha256: "d".repeat(64) },
    segments: [
      { caption_segment_id: "cap-0", source_segment_ids: ["raw-0"], text: "שלום מיה" },
      { caption_segment_id: "cap-1", source_segment_ids: ["raw-1"], text: "חדש" },
    ],
    timing: { entries: [{ o: 0, t: 0 }, { o: 2, t: 1 }] },
    timingMap: { source: "aligned", row_seg_idx: [0, 0, 1], align_version: "align-rows-v1" },
  };
  const src = JSON.parse(SI.rowEditMetaForSave({}, audio, 1))._studio_source;
  assert.equal(src.schema, "studio-row-source-v2");
  assert.equal(src.caption_segment_id, "cap-0");
  assert.deepEqual(src.source_segment_ids, ["raw-0"]);
  assert.equal(src.source_line_index, 0);
});
