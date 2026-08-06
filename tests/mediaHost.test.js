// tests/mediaHost.test.js — общий паспорт-пайплайн медиа (spec 2026-08-04, Room media player).
// Pure-часть тестируется в Node против РЕАЛЬНОГО AsrTranscript (независимый оракул выравнивания).
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const MH = require("../public/js/media-host.js");
const AT = require("../public/js/asr-transcript.js");

const deps = { AT, appVersion: "test" };

test("passport: audio | captions | null", () => {
  assert.equal(MH.passport({ audio: { v: 1 } }).v, 1);
  assert.equal(MH.passport({ captions: { v: 2 } }).v, 2);
  assert.equal(MH.passport({}), null);
  assert.equal(MH.passport(null), null);
});

test("isDerivedTimingDrop", () => {
  assert.equal(MH.isDerivedTimingDrop("NO_SEGMENT_MAPPING"), true);
  assert.equal(MH.isDerivedTimingDrop("SEG_MAPPING_LOST"), true);
  assert.equal(MH.isDerivedTimingDrop("PREVIEW_EDITED"), false);
  assert.equal(MH.isDerivedTimingDrop(null), false);
});

test("clockBlindRanges: filters invalid", () => {
  const a = { asr: { clockCompressedRanges: [{ fromSec: 1, toSec: 5 }, { fromSec: 5, toSec: 5 }, null] } };
  assert.deepEqual(MH.clockBlindRanges(a), [{ fromSec: 1, toSec: 5 }]);
  assert.deepEqual(MH.clockBlindRanges({}), []);
  assert.deepEqual(MH.clockBlindRanges(null), []);
});

test("passportFromTextRow: table_model wins, source_meta only WITH passport", () => {
  const p = { v: 1, media: { opfsPath: "media/x.mp3" } };
  assert.equal(MH.passportFromTextRow({ table_model_meta_json: JSON.stringify({ source: { audio: p } }) }).media.opfsPath, "media/x.mp3");
  assert.equal(MH.passportFromTextRow({ source_meta_json: JSON.stringify({ source: { audio: p } }) }).media.opfsPath, "media/x.mp3");
  // camelCase-варианты колонок (пути импорта отдают их так)
  assert.equal(MH.passportFromTextRow({ tableModelMetaJson: JSON.stringify({ source: { captions: p } }) }).media.opfsPath, "media/x.mp3");
  // корпусная source_meta_json без паспорта — НЕ подхватывается (узкий фолбэк K3)
  assert.equal(MH.passportFromTextRow({ source_meta_json: JSON.stringify({ corpus: { byehuda_id: "1" } }) }), null);
  assert.equal(MH.passportFromTextRow({ table_model_meta_json: "{broken", source_meta_json: "{broken" }), null);
  assert.equal(MH.passportFromTextRow(null), null);
});

// 2 строки ↔ 2 сегмента, тексты пословно совпадают → align сходится, тайминг строится
function freshAudio() {
  return {
    v: 1,
    segments: [
      { i: 0, start: 0, end: 10, text: "שלום עולם" },
      { i: 1, start: 10, end: 20, text: "מה קורה היום" },
    ],
    timing: null,
  };
}
const rows2 = [{ he: "שלום עולם" }, { he: "מה קורה היום" }];

test("restoreForRows: offline align builds timing + provenance", () => {
  const a = freshAudio();
  MH.restoreForRows(a, rows2, deps);
  assert.ok(a.timing && a.timing.entries.length === 2);
  assert.equal(a.timingSource, "aligned-offline");
  assert.equal(a.timingAlign.ok, true);
  assert.equal(a.timingDropReason, null);
});

test("restoreForRows: idempotent — entries reference preserved on 2nd call", () => {
  const a = freshAudio();
  MH.restoreForRows(a, rows2, deps);
  const ref = a.timing.entries;
  MH.restoreForRows(a, rows2, deps);
  assert.equal(a.timing.entries, ref); // строгое ссылочное равенство (контракт karaoke resume)
});

test("restoreForRows: degenerate saved timing is quarantined (K1)", () => {
  // rowCount(5) > segments(3); все записи o === i сегмента → отпечаток DEGENERATE
  const a = {
    v: 1,
    segments: [
      { i: 0, start: 0, text: "אחת" },
      { i: 1, start: 10, text: "שתיים" },
      { i: 2, start: 20, text: "שלוש" },
    ],
    timing: { v: 1, unit: "row", entries: [{ o: 0, t: 0 }, { o: 1, t: 10 }, { o: 2, t: 20 }] },
  };
  const rows5 = [{ he: "x" }, { he: "y" }, { he: "z" }, { he: "w" }, { he: "v" }]; // align не сойдётся
  MH.restoreForRows(a, rows5, deps);
  assert.equal(a.timing, null);
  assert.equal(a.timingDropReason, "SEG_MAPPING_LOST");
  assert.equal(a.timingDropDetail, "DEGENERATE_1_TO_1"); // диагноз K1 первичнее ALIGN_*
  assert.equal(a.timingAlign.ok, false);                 // вердикт выравнивания записан рядом (R9)
});

test("alignSavedTimingOffline: asserted drop reason → untouched", () => {
  const a = freshAudio();
  a.timingDropReason = "PREVIEW_EDITED";
  MH.alignSavedTimingOffline(a, rows2, deps);
  assert.equal(a.timing, null);
  assert.equal(a.timingDropReason, "PREVIEW_EDITED");
});

test("Node export: pure part only (no DOM helpers)", () => {
  assert.equal(typeof MH.passport, "function");
  assert.equal(typeof MH.restoreForRows, "function");
  assert.equal(typeof MH.createStage, "undefined");
  assert.equal(typeof MH.augmentRows, "undefined");
});

// ── Композитные паспорта Import Center / portable (живой кейс «В сокрытии - 1», 2026-08-05):
// timing — булева сводка, сегменты в start_ms/end_ms (+caption_segment_id), opfsPath отсутствует
// по контракту media-ref. Пайплайн обязан их понимать, не ослабляя правил классического пути.

function compositeAudio(nCues, texts) {
  return {
    v: 1,
    media: { sha256: "comp-sha", mime: "audio/mpeg", originalName: "c.mp3", sizeBytes: 3, durationSec: 60 },
    segments: Array.from({ length: nCues }, (_, k) => ({
      authority: "corrected", caption_segment_id: "cue:" + k, quality_flags: [],
      source_segment_ids: [], speaker: null,
      start_ms: k * 1000 + 700, end_ms: (k + 1) * 1000 + 600, text: texts[k],
    })),
    timing: true, // булева сводка портативного паспорта — НЕ играбельный тайминг
  };
}
const CUE_TEXTS = ["שלום עולם", "מה קורה היום", "אחת שתיים", "שלוש ארבע", "חמש שש",
                   "שבע שמונה", "תשע עשר", "אחת עשרה", "שתים עשרה", "שלוש עשרה"];

test("composite: boolean timing + ms-segments → K3 align rebuilds real entries", () => {
  const a = compositeAudio(10, CUE_TEXTS);
  const rows = CUE_TEXTS.map((t) => ({ he: t }));
  MH.restoreForRows(a, rows, deps);
  assert.ok(a.timing && Array.isArray(a.timing.entries), "timing must become a real {entries} object");
  assert.equal(a.timing.entries.length, 10);
  assert.equal(a.timing.entries[0].t, 0.7);          // ms → секунды
  assert.equal(a.timing.entries[1].t, 1.7);
  assert.equal(a.timingSource, "aligned-offline");   // тексты совпали → доказательство сильнее
});

test("composite: one edited row → positional identity fallback (asserted by construction)", () => {
  const texts = CUE_TEXTS.slice();
  const rows = texts.map((t) => ({ he: t }));
  rows[7] = { he: "אחת עשרה בערך" };                 // правка владельца: align откажет
  const a = compositeAudio(10, texts);
  MH.restoreForRows(a, rows, deps);
  assert.ok(a.timing && a.timing.entries.length === 10, "positional fallback must build timing");
  assert.equal(a.timingSource, "composite-positional");
  assert.equal(a.timingMap.source, "composite-positional");
  assert.equal(a.timingMap.mismatched, 1);
  assert.equal(a.timingMap.matched, 9);
  assert.equal(a.timingAlign.ok, false);             // вердикт align остаётся рядом (R9)
  assert.equal(a.timingDropReason, null);
});

test("composite positional: idempotent — entries reference preserved on 2nd call", () => {
  const texts = CUE_TEXTS.slice();
  const rows = texts.map((t) => ({ he: t }));
  rows[3] = { he: "текст правлен" };
  const a = compositeAudio(10, texts);
  MH.restoreForRows(a, rows, deps);
  const ref = a.timing.entries;
  assert.ok(Array.isArray(ref) && ref.length === 10, "first call must build entries");
  MH.restoreForRows(a, rows, deps);
  assert.equal(a.timing.entries, ref);
});

test("composite positional: refuses when texts diverge beyond threshold (R11)", () => {
  const texts = CUE_TEXTS.slice();
  const rows = texts.map(() => ({ he: "אחר לגמרי" }));   // все строки чужие
  const a = compositeAudio(10, texts);
  MH.restoreForRows(a, rows, deps);
  assert.equal(a.timing, null);
  assert.ok(a.timingDropReason, "honest drop reason must be set");
});

test("composite positional: refuses when row/cue counts differ", () => {
  const texts = CUE_TEXTS.slice();
  const rows = texts.slice(0, 9).map((t) => ({ he: t }));
  rows[3] = { he: "правка" };                            // и align тоже не сойдётся
  const a = compositeAudio(10, texts);
  MH.restoreForRows(a, rows, deps);
  assert.equal(a.timing, null);
});

// ── Живой замер владельца 2026-08-05 (карточка «9 сезон | Яир Голан | Кан 11») ───────────────
// 554 реплики = 554 строки, расходятся 11 строк (2%) и все — варианты РАСПОЗНАВАНИЯ одного
// слова (ניגשו/היגשו, מרצ/מרץ). Порог 1% отказывал на волосок и гасил караоке целиком.
// Позиционная идентичность здесь утверждена построением материала (композитный паспорт),
// текстовая сверка — предохранитель от ЧУЖОГО материала, а не от вариантов ASR.
function manyCues(n) {
  return Array.from({ length: n }, (_, k) => "שורה מספר " + k + " בטקסט");
}

test("composite positional: 3% расхождения (варианты ASR) — принимается", () => {
  const texts = manyCues(100);
  const rows = texts.map((t) => ({ he: t }));
  rows[10] = { he: "שורה מספר 10 בטקסטים" };   // 3 строки из 100 = 3%
  rows[40] = { he: "שורה מיספר 40 בטקסט" };
  rows[70] = { he: "שורה מספר 70 בטקסת" };
  const a = compositeAudio(100, texts);
  MH.restoreForRows(a, rows, deps);
  assert.ok(a.timing && a.timing.entries.length === 100, "3% расхождения не должны гасить караоке");
  assert.equal(a.timingSource, "composite-positional");
  assert.equal(a.timingMap.mismatched, 3);
});

test("composite positional: 10% расхождения — по-прежнему отказ (R11, порог не отменён)", () => {
  const texts = manyCues(100);
  const rows = texts.map((t) => ({ he: t }));
  for (let i = 0; i < 10; i++) rows[i * 7] = { he: "טקסט אחר לגמרי מספר " + i };
  const a = compositeAudio(100, texts);
  MH.restoreForRows(a, rows, deps);
  assert.equal(a.timing, null, "чужой материал обязан отказывать");
  assert.ok(a.timingDropReason);
});

// ── L3a: точная привязка против выведенного тайминга ──────────────────────────────────────────
// Живой дефект «g_transl ynet» 2026-08-05: привязка покрывает 8 строк из 236 и, замещая ПОЛНЫЙ
// офлайн-тайминг (кнопка на каждой строке), оставляет 8 кнопок. Неполная привязка не «точнее» —
// она беднее. Контроль — «В сокрытии - 1»: привязка 432/432 обязана выигрывать как и раньше.
function exactPassport(mappedRows, totalRows, entries) {
  return {
    v: 1, media: { sha256: "x", mime: "audio/mpeg" }, segments: [],
    timing: entries ? { entries: Array.from({ length: entries }, (_, k) => ({ o: k, t: k })) } : null,
    timingSource: entries ? "studio-exact-binding" : null,
    timingMap: {
      authority: "studio-exact-binding", revision_id: "rev:1",
      row_caption_segment_ids: Array.from({ length: totalRows }, (_, k) => (k < mappedRows ? "cue:" + k : null)),
      mapped_rows: mappedRows, missing_rows: totalRows - mappedRows,
    },
  };
}
function derivedPassport(entries) {
  return {
    v: 1, media: { sha256: "x", mime: "audio/mpeg" }, segments: [],
    timing: { entries: Array.from({ length: entries }, (_, k) => ({ o: k, t: k })) },
    timingSource: "aligned-offline", timingMap: { source: "aligned-offline" },
  };
}

test("exact binding: полная привязка (432/432) выигрывает у выведенного", () => {
  const prev = derivedPassport(432), exact = exactPassport(432, 432, 432);
  assert.equal(MH.pickExactBindingPassport(prev, exact, 432), exact);
});

test("exact binding: частичная привязка (8/236) НЕ гасит полный выведенный тайминг", () => {
  const prev = derivedPassport(228), exact = exactPassport(8, 236, 1);
  const picked = MH.pickExactBindingPassport(prev, exact, 236);
  assert.equal(picked, prev, "выведенный тайминг покрывает 236 строк против 8 — он и остаётся");
  assert.ok(picked.exactBindingSkipped, "отказ обязан быть видим в провенансе (R9)");
  assert.equal(picked.exactBindingSkipped.playableRows, 8);
  assert.equal(picked.exactBindingSkipped.insteadOf, 236);
});

test("exact binding: без выведенного тайминга принимается любая непустая привязка", () => {
  const prev = { v: 1, media: { sha256: "x" }, segments: [], timing: null };
  const exact = exactPassport(8, 236, 1);
  assert.equal(MH.pickExactBindingPassport(prev, exact, 236), exact);
});

test("exact binding: привязки нет — паспорт не трогаем", () => {
  const prev = derivedPassport(10);
  assert.equal(MH.pickExactBindingPassport(prev, null, 10), prev);
});

// ── Честная причина отсутствия караоке (обе поверхности показывали одну общую строку) ─────────
test("timingDropExplain: молчит, когда тайминг есть", () => {
  assert.equal(MH.timingDropExplain(derivedPassport(5), (k) => k), "");
});

test("timingDropExplain: расхождение текста объясняется числами", () => {
  const a = {
    timing: null, timingDropReason: "SEG_MAPPING_LOST", timingDropDetail: "ALIGN_ROW_NOT_IN_SEGMENT",
    timingAlign: { rows: 1118, segments: 1107, alignedRows: 100, ok: false, reason: "ROW_NOT_IN_SEGMENT" },
  };
  const out = MH.timingDropExplain(a, (k) => k);
  assert.match(out, /diverged/, "должен выбрать ключ про расхождение текста");
  assert.match(out, /100/, "и назвать, сколько строк совпало");
  assert.match(out, /1118/);
});

test("timingDropExplain: карантин вырожденных меток — свой ключ", () => {
  const out = MH.timingDropExplain({ timing: null, timingDropReason: "SEG_MAPPING_LOST", timingDropDetail: "DEGENERATE_1_TO_1" }, (k) => k);
  assert.match(out, /degenerate/);
});

// ── D5 (2026-08-06): паспорт сегментов живёт ТОЛЬКО в памяти. Открыл сохранённый транскрипт заново
// или перезагрузил вкладку → v3LastImportMeta исчез, хотя ревизия с сегментами лежит на устройстве.
// Текст в поле построчно тождественен ей, но приложение считает его «плоским» и упирает владельца
// в guard >250 строк без выхода: собрать таблицу из длинного транскрипта становится невозможно.
test('revisionMatchesLines admits an exact line-for-line transcript and nothing looser', () => {
  const segs = [{ text: 'שלום מיה' }, { text: 'מה קשור' }, { text: 'תודה רבה' }];
  const ok = MH.revisionMatchesLines(segs, ['שלום מיה', 'מה קשור', 'תודה רבה'], deps);
  assert.equal(ok, true, 'identical lines restore segment identity');

  assert.equal(MH.revisionMatchesLines(segs, ['שלום  מיה', 'מה קשור', 'תודה רבה'], deps), true,
    'whitespace differences are not content differences');
  assert.equal(MH.revisionMatchesLines(segs, ['שלום מיה', 'מה קשור'], deps), false,
    'fewer lines than segments means the text was re-split');
  assert.equal(MH.revisionMatchesLines(segs, ['שלום מיה', 'מה קשור', 'תודה רבה', 'עוד'], deps), false,
    'more lines than segments means the text was re-split');
  assert.equal(MH.revisionMatchesLines(segs, ['שלום מיה', 'מה קשור אחר', 'תודה רבה'], deps), false,
    'one edited line forfeits identity — row index is no longer segment index');
  assert.equal(MH.revisionMatchesLines([], [], deps), false, 'nothing to restore from');
  assert.equal(MH.revisionMatchesLines(null, ['a'], deps), false, 'no segments, no claim');
});

// W1 (honest import -> card, 2026-08-06): all three former ambient globals must be
// projections of one content-addressed decision. The decision is unique-or-null: two
// exact revisions are not permission to pick the most recent one.
test('resolveUniqueRevisionContext returns the single exact revision and refuses ambiguity', () => {
  const lines = ['שלום מיה', 'מה קשור'];
  const exact = {
    package: { package_id: 'mpkg:a', media_sha256: 'a'.repeat(64) },
    track: { track_id: 'track:a' },
    revision: { revision_id: 'rev:a', segments: [{ text: lines[0] }, { text: lines[1] }] },
  };
  const stale = {
    package: { package_id: 'mpkg:b', media_sha256: 'b'.repeat(64) },
    track: { track_id: 'track:b' },
    revision: { revision_id: 'rev:b', segments: [{ text: lines[0] }, { text: 'שורה אחרת' }] },
  };

  const one = MH.resolveUniqueRevisionContext([stale, exact], lines, deps);
  assert.equal(one.reason, null);
  assert.equal(one.context, exact);
  assert.equal(one.match_count, 1);

  const duplicateObject = { ...exact };
  const deduped = MH.resolveUniqueRevisionContext([exact, duplicateObject], lines, deps);
  assert.equal(deduped.context, exact, 'the same revision reached through ambient + catalog is one candidate');
  assert.equal(deduped.match_count, 1);

  const secondExact = {
    package: { package_id: 'mpkg:c', media_sha256: 'c'.repeat(64) },
    track: { track_id: 'track:c' },
    revision: { revision_id: 'rev:c', segments: [{ text: lines[0] }, { text: lines[1] }] },
  };
  const ambiguous = MH.resolveUniqueRevisionContext([exact, secondExact], lines, deps);
  assert.equal(ambiguous.context, null);
  assert.equal(ambiguous.reason, 'AMBIGUOUS_EXACT_REVISIONS');
  assert.equal(ambiguous.match_count, 2);

  const absent = MH.resolveUniqueRevisionContext([stale], lines, deps);
  assert.equal(absent.context, null);
  assert.equal(absent.reason, 'NO_EXACT_REVISION');
});

test('W1 contract: media context resolves before the premium/non-premium fork', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const translateStart = html.indexOf('async function translateTable()');
  const providerFork = html.indexOf('const usePremium = provider === "gcp" || provider === "google-free"', translateStart);
  const resolverCall = html.indexOf('await v3ResolveMediaContext()', translateStart);
  assert.ok(translateStart >= 0 && providerFork > translateStart, 'translateTable provider fork exists');
  assert.ok(resolverCall > translateStart && resolverCall < providerFork,
    'content-addressed resolver must run before provider fork so premium Gemini cannot bypass it');
});

test('W6 keeps the >250 safety gate and names every permitted next route in RU/HE/EN', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert.match(html, /estimatePlainRows\(getText\(\)\) > 250/, 'the historical server-500 guard is load-bearing');
  const texts = {
    ru: fs.readFileSync(path.join(root, 'public', 'i18n', 'locales', 'ru.js'), 'utf8'),
    en: fs.readFileSync(path.join(root, 'public', 'i18n', 'locales', 'en.js'), 'utf8'),
    he: fs.readFileSync(path.join(root, 'public', 'i18n', 'locales', 'he.js'), 'utf8'),
  };
  assert.match(texts.ru, /textTooLongForSingleTable[^\n]+восстанов[^\n]+сегмент[^\n]+Импорт[^\n]+разбей/i);
  assert.match(texts.en, /textTooLongForSingleTable[^\n]+restore[^\n]+segment identity[^\n]+import[^\n]+media[^\n]+split/i);
  assert.match(texts.he, /textTooLongForSingleTable[^\n]+זהות המקטעים[^\n]+ייבאו[^\n]+מדיה[^\n]+פצלו/i);
});

test('W3 offline restore keeps proven rows, leaves holes blind, and surfaces coverage', () => {
  const audio = {
    segments: [
      { i: 0, start: 0, end: 2, text: 'שלום עולם' },
      { i: 1, start: 4, end: 6, text: 'שורה אחרת' },
      { i: 2, start: 8, end: 10, text: 'מיה באה' },
    ],
    timing: null,
  };
  MH.alignSavedTimingOffline(audio, [
    { he: 'שלום עולם' }, { he: 'לא נמצא' }, { he: 'מיה באה' },
  ], { AT, appVersion: 'test' });
  assert.equal(audio.timingSource, 'aligned-partial-proven');
  assert.deepEqual(audio.timing.entries, [
    { o: 0, t: 0 }, { o: 1, t: 2, blind: true }, { o: 2, t: 8 },
  ]);
  assert.deepEqual(audio.timingMap.row_seg_idx, [0, null, 2]);
  assert.deepEqual(audio.timingMap.coverage, {
    mapped_rows: 2, total_rows: 3, unmapped_rows: 1,
    ratio: 2 / 3, label: '2/3', complete: false,
  });
  assert.equal(audio.timingAlign.mode, 'partial-proven');
  assert.equal(MH.timingCoverageExplain(audio, (key, vars) =>
    key === 'studio.media.partialCoverage' ? `${vars.mapped}/${vars.total} rows with audio` : key),
  '2/3 rows with audio');
});
