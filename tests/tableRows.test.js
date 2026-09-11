"use strict";
// Regression coverage for the W2-S4 Task 6 review-round-1 Critical finding:
// buildRowsFromGeminiPayload's legacy segMap/segIndex lookup is 1-based
// ("index <= 0 -> idx + 1" normalization) and silently collides on 0-based
// segment_index 0 (both segment 0 and segment 1 normalize to key 1),
// corrupting row 0's he with segment 1's text. The fix bypasses the segMap
// lookup entirely when opts.keepSegmentIndex is set (seg-mode), taking heBase
// directly from the row's own "he" field. This file locks in both:
//   (a) the seg-mode fix (0-based, no collision), and
//   (b) byte-identical legacy behavior (1-based, segMap fallback) with no opts.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildRowsFromGeminiPayload,
  prepareRowsFromGeminiPayload,
  canonicalizeKnownNiqqudRows,
  validateHebrewSourceCoverage,
} = require("../ingest/tableRows.js");

test("seg-mode (opts.keepSegmentIndex): row 0 gets its OWN segment's he, not segment 1's (reviewer's repro)", () => {
  const parsed = {
    segments: [
      { index: 0, he: "שלום" },
      { index: 1, he: "עולם" },
      { index: 2, he: "טוב" },
    ],
    rows: [
      { segment_index: 0, he: "שלום", he_niqqud: "שָׁלוֹם", translit: "shalom", ru: "привет" },
      { segment_index: 1, he: "עולם", he_niqqud: "עוֹלָם", translit: "olam", ru: "мир" },
      { segment_index: 2, he: "טוב", he_niqqud: "טוֹב", translit: "tov", ru: "хорошо" },
    ],
  };

  const rows = buildRowsFromGeminiPayload(parsed, { direction: "he-ru" }, { keepSegmentIndex: true });

  assert.equal(rows.length, 3);
  // The exact reviewer repro: row 0's he must be segment 0's he ("שלום"), never
  // segment 1's ("עולם") — the old code returned "עולם" here due to the 1-based
  // collision described above.
  assert.equal(rows[0].he, "שלום");
  assert.equal(rows[1].he, "עולם");
  assert.equal(rows[2].he, "טוב");

  // segment_index passthrough must survive (opted-in), and every row's he must
  // match its OWN declared segment_index — not some neighbor's.
  const expectedHeBySegIndex = { 0: "שלום", 1: "עולם", 2: "טוב" };
  rows.forEach((r, i) => {
    assert.equal(r.segment_index, i);
    assert.equal(r.he, expectedHeBySegIndex[r.segment_index]);
  });
});

test("legacy mode (no opts): byte-identical to the pre-fix behavior — 1-based segMap fallback, no segment_index on output", () => {
  // Old-shape payload: segments indexed 1..n (as the legacy HE_RU_PROMPT/
  // ANY_HE_PROMPT prompts require), one row with an empty he relying on the
  // segMap fallback (exactly the pre-existing fallback path this task must
  // NOT alter).
  const parsed = {
    segments: [
      { index: 1, he: "אחד" },
      { index: 2, he: "שתיים" },
    ],
    rows: [
      { segment_index: 1, he: "", he_niqqud: "אֶחָד", translit: "echad", ru: "один" },
      { segment_index: 2, he: "שתיים", he_niqqud: "שְׁתַּיִם", translit: "shtayim", ru: "два" },
    ],
  };

  const rows = buildRowsFromGeminiPayload(parsed, { direction: "he-ru" });

  assert.equal(rows.length, 2);
  // row 0's he is empty in the raw payload -> must fall back to segMap.get(1).
  assert.equal(rows[0].he, "אחד");
  assert.equal(rows[1].he, "שתיים");

  // Legacy path: no opts passed -> no segment_index leaks onto output rows.
  rows.forEach((r) => {
    assert.equal(Object.prototype.hasOwnProperty.call(r, "segment_index"), false);
  });

  // segmentId (internal, pre-existing) still reflects the 1-based segment_index.
  assert.equal(rows[0].segmentId, 1);
  assert.equal(rows[1].segmentId, 2);
});

test("niqqud allows full/defective spelling but may not change the consonantal word", () => {
  const good = {
    segments: [{ index: 1, he: 'אופנוע נוסע 72 קמ"ש.' }],
    rows: [{ segment_index: 1, he: 'אופנוע נוסע 72 קמ"ש.', he_niqqud: 'אוֹפַנּוֹעַ נוֹסֵעַ 72 קמ"ש.', translit: "ofanua", ru: "мотоцикл" }],
  };
  const rows = buildRowsFromGeminiPayload(good, { direction: "he-ru" });
  assert.equal(rows.length, 1);
  validateHebrewSourceCoverage(rows, 'אופנוע נוסע 72 קמ"ש.');

  const defectiveSpelling = {
    segments: [{ index: 1, he: 'שתיים ואופקי' }],
    rows: [{ segment_index: 1, he: 'שתיים ואופקי', he_niqqud: 'שְׁתַּיִם וְאָפְקִי', translit: "shtayim ve-ofki", ru: "два и горизонтальный" }],
  };
  assert.equal(buildRowsFromGeminiPayload(defectiveSpelling, { direction: "he-ru" }).length, 1);

  const changedConsonant = {
    segments: [{ index: 1, he: 'שווה תאוצה' }],
    rows: [{ segment_index: 1, he: 'שווה תאוצה', he_niqqud: 'שְׁוַת תְּאוּצָה', translit: "shvat te'utsa", ru: "равноускоренное" }],
  };
  assert.throws(
    () => buildRowsFromGeminiPayload(changedConsonant, { direction: "he-ru" }),
    (error) => error && error.code === "HE_NIQQUD_CONSONANT_MISMATCH",
  );
});

test("source coverage rejects dropped or rewritten Hebrew before cache publication", () => {
  assert.throws(
    () => validateHebrewSourceCoverage([{ he: "בנקודה N עוזב הרכב" }], "בנקודה N מאיץ הנהג את הרכב"),
    (error) => error && error.code === "HE_SOURCE_COVERAGE_MISMATCH",
  );
});

test("known physics terms are canonicalized locally without changing plain Hebrew", () => {
  const input = [{
    he: "אופנוע ומכונית נוסעים על כביש ישר ואופקי.",
    he_niqqud: "אֶוֹפַנּוֹעַ וּמְכוֹנִית נוֹסְעִים עַל כְּבִישׁ יָשָׁר וְאֹפְקִי.",
    translit: "provider output must be replaced",
    ru: "Мотоцикл и автомобиль едут по прямой горизонтальной дороге.",
  }, {
    he: "כשהאופנוע מאיץ, תאוצת האופנוע קבועה.",
    he_niqqud: "כְּשֶׁהָאֶוֹפַנּוֹעַ מֵאִיץ, תְּאוּצַת הָאֶוֹפַנּוֹעַ קְבוּעָה.",
    translit: "stale",
    ru: "Когда мотоцикл ускоряется, его ускорение постоянно.",
  }];

  const result = canonicalizeKnownNiqqudRows(input);

  assert.deepEqual(result.rows.map((row) => row.he), input.map((row) => row.he));
  assert.equal(
    result.rows[0].he_niqqud,
    "אוֹפַנּוֹעַ וּמְכוֹנִית נוֹסְעִים עַל כְּבִישׁ יָשָׁר וְאָפְקִי.",
  );
  assert.equal(
    result.rows[1].he_niqqud,
    "כְּשֶׁהָאוֹפַנּוֹעַ מֵאִיץ, תְּאוּצַת הָאוֹפַנּוֹעַ קְבוּעָה.",
  );
  assert.equal(result.corrections.length, 4);
  assert.deepEqual(result.corrections.map((item) => item.term), ["אופנוע", "אופקי", "כשהאופנוע", "האופנוע"]);
  assert.notStrictEqual(result.rows[0], input[0]);
  assert.equal(input[0].he_niqqud, "אֶוֹפַנּוֹעַ וּמְכוֹנִית נוֹסְעִים עַל כְּבִישׁ יָשָׁר וְאֹפְקִי.");

  const unrelated = canonicalizeKnownNiqqudRows([{ he: "מכונית בלבד", he_niqqud: "אֶוֹפַנּוֹעַ" }]);
  assert.equal(unrelated.rows[0].he_niqqud, "אֶוֹפַנּוֹעַ");
  assert.equal(unrelated.corrections.length, 0);
});

test('a quote in the source cannot truncate the row it came from', () => {
  // Прод, материал владельца 2026-09-11: реплика `בגיל 23 טסתי לחו"ל…` содержит ASCII-кавычку.
  // Модель вернула ПОЛНУЮ огласовку (с ивритским гершаим), но эхо-поле he оборвалось ровно на
  // кавычке — и валидатор обвинил огласовку в «изменении источника». Источник наш, и он же
  // должен оставаться источником.
  const source = 'בגיל 23 טסתי לחו"ל, חשבתי שזה יהיה חצי שנה-שנה, ו-17 שנים מאז הייתי בחו"ל.';
  const parsed = { rows: [{
    segment_index: 50,
    he: 'בגיל 23 טסתי לחו',
    he_niqqud: 'בְּגִיל 23 טַסְתִּי לְחוּ״ל, חָשַׁבְתִּי שֶׁזֶּה יִהְיֶה חֲצִי שָׁנָה-שָׁנָה, וְ-17 שָׁנִים מֵאָז הָיִיתִי בְּחוּ״ל.',
    translit: 'Be-gil 23 tasti le-Hul…', ru: 'В 23 года я улетел за границу…',
  }] };
  const rows = prepareRowsFromGeminiPayload(parsed, { direction: 'he-ru' },
    { keepSegmentIndex: true, sourceSegments: [{ i: 50, text: source }] });
  assert.equal(rows[0].he, source, 'the row must carry OUR source, not the truncated echo');
});

test('a genuinely different echo is not quietly replaced by our text', () => {
  // Обрезка — это префикс. Любое ДРУГОЕ расхождение может означать сбитое соответствие строк,
  // и подменять там текст молча означало бы склеить чужой перевод с нашей репликой.
  const parsed = { rows: [{ segment_index: 7, he: 'משפט אחר לגמרי', he_niqqud: 'מִשְׁפָּט אַחֵר לְגַמְרֵי', translit: 'x', ru: 'y' }] };
  const rows = prepareRowsFromGeminiPayload(parsed, { direction: 'he-ru' },
    { keepSegmentIndex: true, sourceSegments: [{ i: 7, text: 'שלום עולם' }] });
  assert.equal(rows[0].he, 'משפט אחר לגמרי', 'a real mismatch stays visible to the validator');
});

test('without our segments the behaviour is unchanged', () => {
  const parsed = { rows: [{ segment_index: 3, he: 'שלום', he_niqqud: 'שָׁלוֹם', translit: 'shalom', ru: 'мир' }] };
  const rows = prepareRowsFromGeminiPayload(parsed, { direction: 'he-ru' }, { keepSegmentIndex: true });
  assert.equal(rows[0].he, 'שלום');
});

test('an explicitly marked row may ship without niqqud; a silently empty one may not', () => {
  // Решение владельца (вариант A): строку, которую нельзя огласовать без правки источника, лучше
  // отдать без огласовки и СКАЗАТЬ об этом, чем потерять весь материал. Пометка — обязательна:
  // именно она отличает честный пробел от молчаливой потери.
  const marked = [{ he: 'גבוה ממני באיזה 30 ס"מ', he_niqqud: '', niqqud_status: 'not_vocalized' }];
  buildRowsFromGeminiPayload({ rows: [{ segment_index: 1, ...marked[0], translit: 'x', ru: 'y' }] },
    { direction: 'he-ru' }, { keepSegmentIndex: true });
  assert.throws(() => buildRowsFromGeminiPayload(
    { rows: [{ segment_index: 1, he: 'שלום', he_niqqud: '', translit: 'x', ru: 'y' }] },
    { direction: 'he-ru' }, { keepSegmentIndex: true }),
    (e) => e.code === 'HE_NIQQUD_MISSING', 'a row that just lost its vocalization must still fail closed');
});

test('the mark travels with the row, so the surface can say it out loud', () => {
  const rows = prepareRowsFromGeminiPayload(
    { rows: [{ segment_index: 4, he: 'שלום', he_niqqud: '', niqqud_status: 'not_vocalized', translit: 'x', ru: 'y' }] },
    { direction: 'he-ru' }, { keepSegmentIndex: true });
  assert.equal(rows[0].niqqud_status, 'not_vocalized');
});

test('a marked row cannot smuggle a changed source past the validator', () => {
  // Пометка освобождает ТОЛЬКО от требования наличия огласовки. Если огласовка всё же есть и она
  // переписывает источник — это по-прежнему отказ.
  assert.throws(() => buildRowsFromGeminiPayload(
    { rows: [{ segment_index: 1, he: 'מעשר המשפחות', he_niqqud: 'מֵעֲשֶׂרֶת הַמִּשְׁפָּחוֹת', niqqud_status: 'not_vocalized', translit: 'x', ru: 'y' }] },
    { direction: 'he-ru' }, { keepSegmentIndex: true }),
    (e) => e.code === 'HE_NIQQUD_CONSONANT_MISMATCH');
});
