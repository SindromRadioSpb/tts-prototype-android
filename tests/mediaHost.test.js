// tests/mediaHost.test.js — общий паспорт-пайплайн медиа (spec 2026-08-04, Room media player).
// Pure-часть тестируется в Node против РЕАЛЬНОГО AsrTranscript (независимый оракул выравнивания).
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const MH = require("../public/js/media-host.js");
const AT = require("../public/js/asr-transcript.js");

const deps = { AT, appVersion: "test" };

test('authorized same-origin public media streams without reading OPFS or buffering a blob',async()=>{
  let reads=0;
  const sandbox={window:{MediaStore:{mediaFileName:()=>'',readMedia:async()=>{reads++;return null;}}},document:{},module:{exports:{}},Blob};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/media-host.js'),'utf8'),sandbox);
  const resolver=sandbox.module.exports.createBlobResolver({}),url='/api/public-corpora/channel-one/assets/'+'a'.repeat(64);
  const result=await resolver.resolve({media:{sha256:'a'.repeat(64),mime:'video/mp4',publicStreamUrl:url}});
  assert.equal(result.publicStreamUrl,url);assert.equal(result.type,'video/mp4');assert.equal(reads,0);
  assert.equal(await resolver.resolve({media:{publicStreamUrl:'https://external.example/video.mp4'}}),null);
});

test('ASR clock rejection survives reopening without becoming an alignment failure', () => {
  for (const diagnosis of [{timingDropReason:'ASR_CLOCK_UNVERIFIED'},
    {captions:{timing:{verdict:'suspect'}}}]) {
    const passport={...diagnosis,segments:[{start:1,end:3,text:'שלום עולם'}],
      timing:{entries:[{o:0,t:1,end:3}]}};
    MH.restoreForRows(passport,[{he:'שלום עולם'}],deps);
    assert.equal(passport.timing,null);
    assert.equal(passport.timingDropReason,'ASR_CLOCK_UNVERIFIED');
    assert.equal(MH.rowReplayAllowed(passport,0),false);
  }
});

test("passport: audio | captions | null", () => {
  assert.equal(MH.passport({ audio: { v: 1 } }).v, 1);
  assert.equal(MH.passport({ captions: { v: 2 } }).v, 2);
  assert.equal(MH.passport({}), null);
  assert.equal(MH.passport(null), null);
});

test("YouTube-only media metadata is not mistaken for local playable bytes", () => {
  assert.equal(MH.hasLocalMediaReference({ durationSec: 900, compatibility: { outcome: "READY" } }), false);
  assert.equal(MH.hasLocalMediaReference({ opfsPath: "media/source.mp4" }), true);
  assert.equal(MH.hasLocalMediaReference({ sha256: "a".repeat(64) }), true);
  assert.equal(MH.hasLocalMediaReference({ sessionOnly: true }), true);
});

test("isDerivedTimingDrop", () => {
  assert.equal(MH.isDerivedTimingDrop("NO_SEGMENT_MAPPING"), true);
  assert.equal(MH.isDerivedTimingDrop("SEG_MAPPING_LOST"), true);
  assert.equal(MH.isDerivedTimingDrop("NO_EXACT_SEGMENT_MAPPING"), true);
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
  const prev = derivedPassport(228), exact = exactPassport(8, 236, 8);
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

// Прод 2026-09-24 («Хан Юнес»): субтитровая реплика «...» не содержит слов. Пустое сравнение
// считалось расхождением, и одна такая строка из 241 молча отвязывала видео от всей карточки.
test('revisionMatchesLines keeps identity across a word-free cue such as "..."', () => {
  const segs = [{ text: 'שלום מיה' }, { text: '...' }, { text: 'תודה רבה' }];
  assert.equal(MH.revisionMatchesLines(segs, ['שלום מיה', '...', 'תודה רבה'], deps), true,
    'an identical punctuation-only cue is the same line');
  assert.equal(MH.revisionMatchesLines(segs, ['שלום מיה', '!', 'תודה רבה'], deps), false,
    'a different word-free line is still a different line');
  assert.equal(MH.revisionMatchesLines(segs, ['שלום מיה', 'מה', 'תודה רבה'], deps), false,
    'words where the segment had none is an edit');
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

test('W1/W3 cold-open retries the canonical resolver after lazy source hydration', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const hydrateStart = html.indexOf('const _st = await _ldb.getTextSourceText(textId)');
  const composerHydrated = html.indexOf('v3SetSourceTextFromLibrary(String(_st))', hydrateStart);
  const retry = html.indexOf('await v3RestoreUnboundMediaAfterSourceHydration(textId, rows)', hydrateStart);
  assert.ok(hydrateStart >= 0 && composerHydrated > hydrateStart, 'lazy Library source hydration exists');
  assert.ok(retry > composerHydrated,
    'an unbound legacy card must retry W1 only after its own composer text and rows are available');

  const helper = html.indexOf('async function v3RestoreUnboundMediaAfterSourceHydration');
  const helperEnd = html.indexOf('\n    }\n\n    function v3AudioSegmentsForRequest', helper);
  const body = html.slice(helper, helperEnd);
  assert.match(body, /await v3ResolveMediaContext\(\)/,
    'cold-open recovery delegates to the one content-addressed resolver');
  assert.match(body, /v3RestoreMediaFromMeta\(\{ source: context\.restored \}, rows\)/,
    'the proven canonical context must enter W3 offline partial alignment without being saved to canon');
  assert.match(body, /window\.v3ActiveMediaAudio && window\.v3ActiveMediaAudio\.timing/,
    'an exact binding with empty row mapping is not restored yet and must still enter W3');
  assert.doesNotMatch(body, /if \(window\.v3ActiveMediaAudio \|\|/,
    'the mere presence of a media passport must not suppress partial-proven recovery');
});

test('W6 routes large flat documents through the resumable chunk path instead of a fixed rejection', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert.match(html, /TableChunks\.plainRequestPlan\(getText\(\)\)/);
  assert.match(html, /plainPlan && plainPlan\.requiresChunking/);
  assert.match(html, /v3TranslateTableChunked\(plainPlan\.segments, null\)/);
  assert.doesNotMatch(html, /estimatePlainRows\(getText\(\)\) > 250/);
});

test('W3 offline restore keeps proven rows, leaves holes blind, and surfaces coverage', () => {
  const audio = {
    segments: [
      { i: 0, start: 0, end: 2, text: 'שלום עולם' },
      { i: 1, start: 4, end: 6, text: 'שורה אחרת' },
      { i: 2, start: 8, end: 10, text: 'מיה באה' },
    ],
    timing: null,
    timingMap: { authority: 'studio-exact-binding', row_caption_segment_ids: [] },
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
  assert.equal(audio.timingMap.authority, undefined,
    'derived partial timing must not inherit exact-binding authority');
  assert.equal(audio.timingMap.row_caption_segment_ids, undefined,
    'an empty exact map must not veto proven partial replay rows');
  assert.equal(audio.timingAlign.mode, 'partial-proven');
  assert.equal(MH.timingCoverageExplain(audio, (key, vars) =>
    key === 'studio.media.partialCoverage' ? `${vars.mapped}/${vars.total} rows with audio` : key),
  '2/3 rows with audio');
});

test('legacy composite package with split table rows restores only proven row timing', () => {
  const audio = {
    media: { sha256: 'c'.repeat(64), mime: 'video/mp4' },
    segments: [
      { start_ms: 0, end_ms: 2000, text: 'שלום עולם' },
      { start_ms: 4000, end_ms: 6000, text: 'שורה אחרת' },
      { start_ms: 8000, end_ms: 10000, text: 'מיה באה' },
    ],
    timing: null,
    timingDropReason: 'NO_EXACT_SEGMENT_MAPPING',
    timingMap: {
      authority: 'studio-exact-binding',
      row_caption_segment_ids: [null, null, null, null],
      mapped_rows: 0,
      missing_rows: 4,
    },
  };
  const rows = [
    { he: 'שלום עולם' },
    { he: 'לא נמצא' },
    { he: 'שורה אחרת' },
    { he: 'מיה באה' },
  ];

  MH.restoreForRows(audio, rows, deps);

  assert.equal(audio.timingSource, 'aligned-partial-proven');
  assert.deepEqual(audio.timingMap.row_seg_idx, [0, null, 1, 2]);
  assert.deepEqual(MH.replayCoverage(audio, rows.length), {
    playable_rows: 3, total_rows: 4, blind_rows: 1, ratio: 3 / 4,
    label: '3/4', complete: false,
  });
  assert.equal(MH.rowReplayAllowed(audio, 1), false,
    'an unmatched legacy row must stay blind instead of borrowing adjacent media');
});

test('W3 never exposes karaoke timing for a canon segment marked blind at ASR promotion', () => {
  const audio = {
    segments: [
      { i: 0, start: 874.82, end: 878.6, text: 'שורה לפני השוליים' },
      { i: 1, start: 870, end: 890.52, text: 'שורת חפיפה מהחלון הבא', blind: true, quality_flags: ['blind'] },
      { i: 2, start: 893.4, end: 894.52, text: 'שורה אחרי השוליים' },
    ],
    timing: null,
  };
  MH.alignSavedTimingOffline(audio, audio.segments.map((segment) => ({ he: segment.text })),
    { AT, appVersion: 'test' });
  assert.deepEqual(audio.timing.entries.map((entry) => !!entry.blind), [false, true, false],
    'the rejected seam is retained for text identity but must stay non-playable');
  assert.equal(audio.timingMap.coverage.mapped_rows, 2);
  assert.equal(audio.timingMap.coverage.unmapped_rows, 1);
});

test('Room restores the Studio 510/544 row-media contract from persisted row identity', () => {
  const total = 544, playable = 510, sha = 'a'.repeat(64);
  const audio = {
    media: { sha256: sha, mime: 'video/mp4' },
    segments: Array.from({ length: total }, (_, index) => ({
      i: index,
      start: index * 2,
      end: index * 2 + 1.5,
      text: `מקור ${index}`,
      caption_segment_id: `caption:${index}`,
      source_segment_id: `asrseg:${sha}:${index}`,
      quality_flags: index < playable ? [] : ['blind'],
      blind: index >= playable,
    })),
    // This is the exact false Room baseline from the owner screenshot: text-only
    // recovery found 176 rows even though Studio still had 510 proven identities.
    timing: {
      v: 1,
      unit: 'row',
      entries: Array.from({ length: 176 }, (_, index) => ({ o: index, t: index * 2 })),
    },
    timingSource: 'aligned-partial-proven',
    timingMap: {
      source: 'aligned-partial-proven',
      row_seg_idx: Array.from({ length: total }, (_, index) => index < 176 ? index : null),
    },
  };
  const rows = Array.from({ length: total }, (_, index) => ({
    // The learning table was legitimately edited after transcription, so text-only
    // alignment cannot recover the Studio contract. The persisted source identity can.
    he: `עריכה ${index}`,
    edit_meta_json: index < playable ? JSON.stringify({
      _studio_source: {
        schema: 'studio-row-source-v2',
        source_segment_id: `asrseg:${sha}:${index}`,
        source_segment_ids: [`asrseg:${sha}:${index}`],
        caption_segment_id: `caption:${index}`,
        source_line_index: index,
      },
    }) : null,
  }));

  MH.restoreForRows(audio, rows, deps);

  assert.equal(audio.timingSource, 'persisted-row-identity');
  assert.deepEqual(MH.replayCoverage(audio, total), {
    playable_rows: playable,
    total_rows: total,
    blind_rows: total - playable,
    ratio: playable / total,
    label: '510/544',
    complete: false,
  });
  assert.equal(MH.rowReplayAllowed(audio, playable - 1), true);
  assert.equal(MH.rowReplayAllowed(audio, playable), false,
    'a row without persisted identity must not borrow its neighbour timing');
  assert.equal(audio.timing.entries.some((entry) => entry.o === playable && !entry.blind), false,
    'no interpolation may turn the first unbound row into playable media');

  const stableTiming = audio.timing;
  MH.restoreForRows(audio, rows, deps);
  assert.equal(audio.timing, stableTiming,
    'reopening the same Room material must preserve the proven projection');
});

test('persisted row identity does not treat a missing source_line_index as row zero', () => {
  const sha = 'b'.repeat(64);
  const audio = {
    media: { sha256: sha },
    segments: [
      { i: 0, start: 0, end: 1, text: 'אפס' },
      { i: 1, start: 1, end: 2, text: 'אחד' },
    ],
    timing: null,
  };
  const rows = [0, 1].map((index) => ({
    he: `עריכה ${index}`,
    edit_meta_json: JSON.stringify({ _studio_source: {
      schema: 'studio-row-source-v2', source_line_index: null,
    } }),
  }));

  MH.restoreForRows(audio, rows, deps);

  assert.notEqual(audio.timingSource, 'persisted-row-identity');
  assert.equal(MH.replayCoverage(audio, rows.length).playable_rows, 0);
});

test('P0 replay coverage is one invariant and intentional partial holes do not retrigger augment', () => {
  assert.equal(typeof MH.rowReplayAllowed, 'function');
  assert.equal(typeof MH.replayCoverage, 'function');
  assert.equal(typeof MH.rowsNeedReplayAugment, 'function');

  const partial = {
    timing: { entries: [{ o: 0, t: 0 }, { o: 1, t: 2, blind: true }, { o: 2, t: 8 }] },
    timingMap: { source: 'aligned-partial-proven', row_seg_idx: [0, null, 2] },
  };
  assert.equal(MH.rowReplayAllowed(partial, 0), true);
  assert.equal(MH.rowReplayAllowed(partial, 1), false);
  assert.equal(MH.rowReplayAllowed(partial, 2), true);
  assert.deepEqual(MH.replayCoverage(partial, 3), {
    playable_rows: 2, total_rows: 3, blind_rows: 1, ratio: 2 / 3,
    label: '2/3', complete: false,
  });
  assert.equal(MH.rowsNeedReplayAugment(partial, 3, [0]), true,
    'one missing proven button requires augment');
  assert.equal(MH.rowsNeedReplayAugment(partial, 3, [0, 2]), false,
    'the intentionally blind middle row is complete, not an endless augment trigger');

  const exact = {
    timing: { entries: [{ o: 0, t: 0 }, { o: 1, t: 2 }, { o: 2, t: 8 }] },
    timingMap: { authority: 'studio-exact-binding', row_caption_segment_ids: ['c0', null, 'c2'] },
  };
  assert.deepEqual(MH.replayCoverage(exact, 3), {
    playable_rows: 2, total_rows: 3, blind_rows: 1, ratio: 2 / 3,
    label: '2/3', complete: false,
  });
  assert.equal(MH.rowsNeedReplayAugment(exact, 3, [0, 2]), false);

  const sparseGemini = {
    timing: { entries: [{ o: 2, t: 12, end: 14 }, { o: 5, t: 25, end: 27 }] },
    timingMap: { source: 'segment_index+aligned', row_seg_idx: [0, 1, 2, 2, 3, 4] },
  };
  assert.deepEqual(MH.replayCoverage(sparseGemini, 6), {
    playable_rows: 3, total_rows: 6, blind_rows: 3, ratio: 0.5,
    label: '3/6', complete: false,
  }, 'a few trusted timestamps never make every mapped row playable');
});

test('restoring a saved immutable material preserves verified revision timing and segment ends',()=>{
  const audio={projection_of_revision_id:'rev:exact',projection_sha256:'a'.repeat(64),
    segments:[{i:0,start:0,end:0.8,text:'שלום'},{i:1,start:0.9,end:1.8,text:'מיה'},{i:2,start:1.9,end:2.8,text:'חדש'}],
    timing:{entries:[{o:0,t:0,end:0.8},{o:1,t:0.9,end:1.8},{o:2,t:1.9,end:2.8}]},timingSource:'studio-exact-binding',
    timingMap:{authority:'studio-exact-binding',revision_id:'rev:exact',revision_sha256:'a'.repeat(64),row_caption_segment_ids:['c0','c1','c2']}};
  const before=JSON.stringify(audio),entries=audio.timing.entries;
  MH.restoreForRows(audio,[{he:'שלום'},{he:'מיה'},{he:'חדש'}],deps);
  assert.equal(JSON.stringify(audio),before,'derived restoration must not overwrite immutable revision boundaries');
  assert.equal(audio.timing.entries,entries,'resume retains the same entries identity');
});

test('local playback falls back to a registered lite file without changing the canonical hash', async () => {
  const full = 'a'.repeat(64), lite = 'b'.repeat(64), reads = [];
  let fullPresent = false;
  const browser = { MediaStore: {
    mediaFileName: sha => `media/${sha}.mp4`,
    readMedia: async path => { reads.push(path); return path === `media/${full}.mp4` && fullPresent
      ? new Blob(['full-video']) : path === `media/${lite}.mp4` ? new Blob(['lite']) : null; },
  } };
  const sandbox = { window: browser, document: {}, module: { exports: {} }, Blob };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/media-host.js'), 'utf8'), sandbox);
  const resolver = sandbox.module.exports.createBlobResolver({});
  const audio = { media: { sha256: full, mime: 'video/mp4',
    renditions: { lite: { sha256: lite, opfs_path: `media/${lite}.mp4`, size_bytes: 4 } } } };
  assert.equal((await resolver.resolve(audio)).size, 4);
  assert.deepEqual(reads, [`media/${full}.mp4`, `media/${lite}.mp4`]);
  assert.equal(audio.media.sha256, full);
  fullPresent = true;
  assert.equal((await resolver.resolve(audio)).size, 10, 'the full copy takes precedence once present');
});

// Владелец, 2026-09-24: улучшенное выравнивание (452/453 против 440 у точной привязки) стало
// выигрывать выбор — и сохранённый отпечаток YouTube-привязки (посчитанный по точной привязке)
// перестал совпадать: все ▶ пропали. Вытесненный кандидат остаётся псевдонимом для сверки.
test("exact binding: вытесненная точная привязка остаётся псевдонимом отпечатка", () => {
  const prev = derivedPassport(228), exact = exactPassport(8, 236, 8);
  const picked = MH.pickExactBindingPassport(prev, exact, 236);
  assert.equal(picked, prev);
  assert.deepEqual(picked.timingBasisAliases, [exact.timing.entries]);
  const again = MH.pickExactBindingPassport(picked, exact, 236);
  assert.equal(again.timingBasisAliases.length, 1, "повторный выбор не копит одинаковые псевдонимы");
});

test('offline realignment that replaces a saved timing keeps the replaced shape as a basis alias', () => {
  const saved = [{ o: 0, t: 0 }, { o: 2, t: 8 }];
  const audio = {
    segments: [
      { i: 0, start: 0, end: 2, text: 'שלום עולם' },
      { i: 1, start: 4, end: 6, text: 'שורה אחרת' },
      { i: 2, start: 8, end: 10, text: 'מיה באה' },
    ],
    timing: { entries: saved },
    timingMap: { authority: 'studio-exact-binding', row_caption_segment_ids: [] },
  };
  MH.alignSavedTimingOffline(audio, [
    { he: 'שלום עולם' }, { he: 'לא נמצא' }, { he: 'מיה באה' },
  ], { AT, appVersion: 'test' });
  assert.equal(audio.timingSource, 'aligned-partial-proven');
  assert.notEqual(audio.timing.entries, saved);
  assert.deepEqual(audio.timingBasisAliases, [saved]);
});

test('basis aliases never reach the persisted passport', () => {
  const prev = derivedPassport(228), exact = exactPassport(8, 236, 8);
  const picked = MH.pickExactBindingPassport(prev, exact, 236);
  assert.equal(picked.timingBasisAliases.length, 1);
  assert.equal(JSON.stringify(picked).includes('timingBasisAliases'), false);
});

test('timing derived by the v2 order proof keeps the v1 shape as a basis alias', () => {
  const segments = [
    { i: 0, start: 0, end: 1, text: 'שלום עולם' },
    { i: 1, start: 2, end: 3, text: 'כן.' },
    { i: 2, start: 4, end: 34, text: 'הי הי הי' },
    { i: 3, start: 35, end: 36, text: 'מיה באה' },
    { i: 4, start: 37, end: 38, text: 'כן.' },
  ];
  const rows = ['שלום עולם', 'כן.', 'הי הי הי הי', 'מיה באה', 'כן.'].map((he) => ({ he }));
  const audio = { segments, timing: null };
  MH.alignSavedTimingOffline(audio, rows, { AT, appVersion: 'test' });
  const v1 = AT.buildPartialProvenTiming(segments,
    AT.alignRowsToSegmentsPartialProven(rows.map((r) => r.he), segments, { orderProof: false }).rowSegIdx, []);
  assert.deepEqual(audio.timingMap.row_seg_idx, [0, 1, null, 3, 4]);
  assert.deepEqual(audio.timingBasisAliases, [v1.timing.entries]);
});

// Ведущий путь (2026-09-24): остановка «медиа потеряно» обязана назвать строку, а не только факт.
test('firstMismatchLine names the first line that breaks identity with the revision', () => {
  const segs = [{ text: 'שלום מיה' }, { text: '...' }, { text: 'תודה רבה' }];
  assert.equal(MH.firstMismatchLine(segs, ['שלום מיה', '...', 'תודה רבה'], deps), -1);
  assert.equal(MH.firstMismatchLine(segs, ['שלום מיה', '...', 'תודה'], deps), 2);
  assert.equal(MH.firstMismatchLine(segs, ['שלום מיה', '...'], deps), 2, 'a missing line is where identity ends');
  assert.equal(MH.firstMismatchLine(segs, ['שלום מיה', '...', 'תודה רבה', 'עוד'], deps), 3);
});
