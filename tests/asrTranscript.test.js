"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const A = require("../public/js/asr-transcript.js");

test("secondsFromTimestamp parses M:SS / H:MM:SS / fractional, rejects junk", () => {
  assert.equal(A.secondsFromTimestamp("0:03"), 3);
  assert.equal(A.secondsFromTimestamp("2:15"), 135);
  assert.equal(A.secondsFromTimestamp("1:02:05"), 3725);
  assert.equal(A.secondsFromTimestamp("0:03.5"), 3.5);
  for (const bad of [null, "", "abc", "1:75", "-1:00", "3", {}, "1:2:3:4"]) {
    assert.equal(A.secondsFromTimestamp(bad), null, String(bad));
  }
});

test("parseAsrResponse strips fences, normalizes, throws ASR_BAD_JSON", () => {
  const raw = '```json\n{"language":"he","segments":[{"start":"0:02","text":" שלום "}],"warnings":[]}\n```';
  const p = A.parseAsrResponse(raw);
  assert.equal(p.language, "he");
  assert.deepEqual(p.segments, [{ start: 2, text: "שלום" }]);
  assert.throws(() => A.parseAsrResponse("not json"), (e) => e.code === "ASR_BAD_JSON");
});

test("validateSegments: keeps texts, nulls bad starts, monotonic filter, thresholds", () => {
  const segs = [
    { start: 1, text: "א" }, { start: 5, text: "ב" }, { start: 3, text: "ג" }, // 3 < 5 → non-monotonic
    { start: 9999, text: "ד" },                                                // за пределами длительности
    { start: 12, text: "ה" },
  ];
  const v = A.validateSegments(segs, 60);
  assert.equal(v.segments.length, 5);                    // тексты не потеряны
  assert.deepEqual(v.segments.map((s) => s.start), [1, 5, null, null, 12]);
  assert.deepEqual(v.segments.map((s) => s.i), [0, 1, 2, 3, 4]);
  assert.equal(v.timingOk, false);                       // 3/5 = 60% < 80%
  assert.equal(v.dropReason, "ASR_TIMING_INVALID");
  const ok = A.validateSegments([{ start: 0, text: "א" }, { start: 4, text: "ב" }, { start: 8, text: "ג" }], 30);
  assert.equal(ok.timingOk, true);
  assert.equal(ok.dropReason, null);
  const late = A.validateSegments([{ start: 95, text: "א" }, { start: 100, text: "ב" }], 200);
  assert.equal(late.timingOk, true);                     // поздний первый сегмент — warning, не провал
  assert.ok(late.warnings.includes("LATE_FIRST_SEGMENT"));
  assert.equal(A.validateSegments([{ start: 1, text: "א" }], 60).timingOk, false); // < 2 валидных
});

test("buildRowTiming: first row per segment, needs >=2 entries", () => {
  const segs = [{ i: 0, start: 0, text: "a" }, { i: 1, start: 5, text: "b" }, { i: 2, start: null, text: "c" }];
  // 5 строк таблицы: сегмент0 → строки 0-1, сегмент1 → строки 2-3, сегмент2 → строка 4
  const t = A.buildRowTiming(segs, [0, 0, 1, 1, 2]);
  assert.deepEqual(t, { v: 1, unit: "row", entries: [{ o: 0, t: 0 }, { o: 2, t: 5 }] });
  assert.equal(A.buildRowTiming(segs, [null, null, null, null, null]), null);
  assert.equal(A.buildRowTiming([{ i: 0, start: 0, text: "a" }], [0]), null); // 1 entry < 2
});

test("estimateAsrCostUsd is positive and roughly linear", () => {
  const one = A.estimateAsrCostUsd(60), twenty = A.estimateAsrCostUsd(1200);
  assert.ok(one > 0 && twenty > one * 15 && twenty < 1); // 20 мин — центы, не доллары
});

test("estimateAsrCostUsd: backward-compat (no opts) unchanged, video adds frame tokens", () => {
  const audio = A.estimateAsrCostUsd(600);
  const video = A.estimateAsrCostUsd(600, { video: true });
  assert.ok(audio > 0);
  assert.ok(video > audio);
  const expectedVideo = (32 + A.VIDEO_FRAME_TOKENS_PER_SEC_LOW) * 600 / 1e6 * 1.0 +
                         4 * 600 / 1e6 * 2.5;
  assert.ok(Math.abs(video - expectedVideo) < 1e-9);
  // opts omitted entirely still works (backward compat call shape)
  assert.equal(A.estimateAsrCostUsd(600), audio);
});

// S12.4: окна больше НЕ встык — сосед стартует на ASR_WINDOW_OVERLAP_SEC=30 раньше своей
// номинальной границы, чтобы шовную зону транскрибировали ОБА окна (материал для якоря). Замысел
// прежний: нарезка покрывает всю запись, хвост короче окна, нулевая длительность даёт одно пустое
// окно, короткий файл — ровно одно окно (single-путь, перекрытия не существует). Числа — прямой
// прогон asrWindows (см. отчёт S12.4).
test("asrWindows: перекрытие 30с у соседей, хвост короче окна, нулевая длительность", () => {
  assert.equal(A.ASR_WINDOW_OVERLAP_SEC, 30);
  assert.deepEqual(A.asrWindows(0), [{ startSec: 0, endSec: 0 }]);
  assert.deepEqual(A.asrWindows(900), [{ startSec: 0, endSec: 900 }]); // ровно окно — один вызов, без шва
  assert.deepEqual(A.asrWindows(2000), [
    { startSec: 0, endSec: 900 }, { startSec: 870, endSec: 1800 }, { startSec: 1770, endSec: 2000 },
  ]);
  // первое окно НИКОГДА не уезжает в отрицательное время; каждое следующее начинается ровно на
  // OVERLAP раньше своей номинальной границы, а заканчивается РОВНО на следующей.
  A.asrWindows(4000).forEach((w, i) => {
    assert.ok(w.startSec >= 0);
    assert.equal(w.startSec, i === 0 ? 0 : i * A.ASR_WINDOW_SEC - A.ASR_WINDOW_OVERLAP_SEC);
  });
});

test("asrSeams: номинальные границы между окнами (900, 1800…), одно окно → швов нет", () => {
  assert.deepEqual(A.asrSeams(A.asrWindows(2000)), [900, 1800]);
  assert.deepEqual(A.asrSeams(A.asrWindows(600)), []);
  assert.deepEqual(A.asrSeams(A.asrWindows(1000)), [900]);
});

// S12.4: SCOPE-блок переписан ЦЕЛИКОМ. Прежнее «Timestamps … i.e. within a-b» заставляло модель
// ПОДГОНЯТЬ метку захваченного куска под диапазон — обе копии реплики на шве выглядели легальными,
// и клиппинг по меткам (S12.3) их не различал. Проверяем ОБА требования нового правила: метки
// абсолютные И честные (реальная метка, даже если она вне a-b), плюс явный запрет подгонки.
test("ASR_RANGE_PROMPT: базовый промт цел, диапазон в M:SS/H:MM:SS, ABSOLUTE + честные метки вне a-b", () => {
  const p = A.ASR_RANGE_PROMPT(1920, 2400);
  assert.ok(p.startsWith(A.ASR_PROMPT));
  assert.match(p, /from 32:00 to 40:00/);
  assert.match(p, /ABSOLUTE/);
  assert.match(p, /EVEN IF that timestamp falls outside 32:00-40:00/);
  assert.match(p, /NEVER shift, round or stretch a timestamp/);
  assert.ok(!/within 32:00-40:00/.test(p), "требование «метки внутри диапазона» должно исчезнуть");
  assert.match(A.ASR_RANGE_PROMPT(3600, 4500), /from 1:00:00 to 1:15:00/);
});

test("mergeWindowSegments: конкатенация, немонотонный стык → start=null", () => {
  const m = A.mergeWindowSegments([
    [{ start: 10, text: "א" }, { start: 890, text: "ב" }],
    [{ start: 870, text: "ג" }, { start: 910, text: "ד" }], // 870 < 890 — залез в прошлое окно
  ]);
  assert.deepEqual(m.map((s) => s.start), [10, 890, null, 910]);
  assert.equal(m.length, 4); // тексты не теряются
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// S12.4 — ШОВ ОКОН ПО ТЕКСТУ (stitchWindowSegments). Живая 117-мин приёмка владельца показала
// ~2 копии на шов ПОСЛЕ клиппинга S12.3: прежний range-промт требовал метки «within a-b», модель
// начинает с начала ФРАЗЫ (а не с секунды a) и штамповала захваченному куску метку ВНУТРИ своего
// диапазона — обе копии «легальны» по меткам, клип по меткам слеп. Теперь соседние окна намеренно
// перекрываются, а шов режется по ТЕКСТУ: якорь (общая последовательность слов ≥5) = доказательство,
// что речь одна и та же. Фикстуры собраны из РЕАЛЬНЫХ ивритских фраз существующих фикстур репо
// (tests/segTable.test.js, tests/tableRows.test.js), не транслита.
// ══════════════════════════════════════════════════════════════════════════════════════════
const AN1 = "הילד אכל תפוח";        // из tests/segTable.test.js
const AN2 = "הילד רץ אל הבית";      // из tests/segTable.test.js
const ANCHOR = AN1 + " " + AN2;      // 7 слов — заведомо ≥ STITCH_ANCHOR_MIN_WORDS
const sg = (start, text) => ({ start, text });
// Нормализация теста НЕЗАВИСИМА от нормализации модуля (independent-oracle): считаем шинглы по
// собственному правилу «ивритские буквы + пробелы».
function words(segments) {
  return segments.flatMap((s) => String(s.text).replace(/[֑-ׇ]/g, "").replace(/[^א-ת]+/g, " ")
    .trim().split(/\s+/).filter(Boolean));
}
function shingleCount(segments, phrase) {
  const hay = words(segments), needle = words([{ text: phrase }]);
  let n = 0;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((w, j) => hay[i + j] === w)) n++;
  }
  return n;
}

// (а) Точный якорь: обе стороны отдали ОДИНАКОВЫЕ сегменты шовной зоны. Рез по сегментам:
// окно k отдаёт всё ДО сегмента, открывающего якорь; окно k+1 — начиная С сегмента, содержащего
// начало якоря. Якорная речь остаётся ровно одной копией — из окна k+1.
test("(S12.4-а) точный якорь: одна копия шовной речи, рез ровно по границам сегментов", () => {
  const r = A.stitchWindowSegments([
    [sg(700, "מאמר על חינוך"), sg(800, "אבא אמא ילד ילדה"), sg(875, AN1), sg(890, AN2)],
    [sg(876, AN1), sg(891, AN2), sg(950, "שלום עולם טוב"), sg(1100, "משפט שני")],
  ], [900]);
  assert.deepEqual(r.segments.map((s) => s.start), [700, 800, 876, 891, 950, 1100]);
  assert.equal(shingleCount(r.segments, ANCHOR), 1);        // не 2 — дубль шва снят
  assert.deepEqual(r.seamsMeta, [{ seam: 900, anchored: true, anchorWords: 7,
                                   cutSegDroppedK: 2, cutSegDroppedK1: 0 }]);
  // уцелевшие копии — именно окна k+1 (876/891), метки окна k (875/890) ушли вместе с дублем
  assert.ok(!r.segments.some((s) => s.start === 875 || s.start === 890));
  // всё, что ВНЕ зоны перекрытия, нетронуто (R11)
  assert.deepEqual(r.segments.slice(0, 2).map((s) => s.text), ["מאמר על חינוך", "אבא אמא ילד ילדה"]);
});

// (б) Формулировки ВОКРУГ якоря расходятся (окно k «אבא אמא …», окно k+1 «ילד ילדה …») — якорь
// всё равно найден по общей середине, дубля нет; расходящаяся обёртка остаётся в ОДНОМ варианте
// (окна k+1), а не склеивается в две редакции подряд.
test("(S12.4-б) расхождение формулировок вокруг якоря: якорь найден, дубля нет", () => {
  const r = A.stitchWindowSegments([
    [sg(700, "מאמר על חינוך"), sg(875, "אבא אמא " + ANCHOR)],
    [sg(876, "ילד ילדה " + ANCHOR), sg(950, "שלום עולם טוב")],
  ], [900]);
  assert.deepEqual(r.segments.map((s) => s.text),
    ["מאמר על חינוך", "ילד ילדה " + ANCHOR, "שלום עולם טוב"]);
  assert.equal(shingleCount(r.segments, ANCHOR), 1);
  assert.equal(r.seamsMeta[0].anchored, true);
  assert.equal(r.seamsMeta[0].anchorWords, 7);
});

// (в) Якоря нет (на шве тишина: хвост и голова не пересекаются ни одним общим куском) — честный
// фолбэк по номинальной границе ±2с. ГЛАВНОЕ: ни один сегмент не потерян.
test("(S12.4-в) якоря нет: noAnchor-фолбэк по номинальной границе, потерь контента нет", () => {
  const A0 = [sg(700, "מאמר על חינוך"), sg(880, "אבא אמא")];
  const B0 = [sg(905, "שלום עולם טוב"), sg(1100, "משפט שני")];
  const r = A.stitchWindowSegments([A0, B0], [900]);
  assert.deepEqual(r.segments.map((s) => s.text), A0.concat(B0).map((s) => s.text)); // ничего не выброшено
  assert.deepEqual(r.seamsMeta, [{ seam: 900, anchored: false, noAnchor: true,
                                   cutSegDroppedK: 0, cutSegDroppedK1: 0 }]);
  // а вот ЯВНЫЙ заезд за номинальную границу фолбэк по-прежнему срезает (у соседа он честный)
  const over = A.stitchWindowSegments([
    A0.concat([sg(960, "שלום עולם טוב")]), B0], [900]);
  assert.equal(over.seamsMeta[0].cutSegDroppedK, 1);
  assert.equal(shingleCount(over.segments, "שלום עולם טוב"), 1);
});

// (г) РЕГРЕСС ВЛАДЕЛЬЦА («врущие метки»): окно k держит в хвосте речь с меткой 860 — легальной для
// [0,900]; окно k+1 держит ТУ ЖЕ речь с меткой 872 — легальной для [870,1800]. Клип по меткам
// (S12.3) обе копии обязан сохранить — обе «в диапазоне». Именно так дубли пережили S12.3.
// После stitch каждая фраза шва встречается РОВНО один раз.
test("(S12.4-г) «врущие метки»: обе копии легальны по меткам → после stitch текст ровно один раз", () => {
  const winK = [sg(820, "מאמר על חינוך"), sg(860, ANCHOR), sg(885, "אבא אמא ילד ילדה")];
  const winK1 = [sg(872, ANCHOR), sg(886, "אבא אמא ילד ילדה"), sg(950, "שלום עולם טוב")];
  // контроль: простая конкатенация (поведение до S12.4) даёт ДВЕ копии каждой шовной фразы
  const naive = winK.concat(winK1);
  assert.equal(shingleCount(naive, ANCHOR), 2);
  assert.equal(shingleCount(naive, "אבא אמא ילד ילדה"), 2);
  const r = A.stitchWindowSegments([winK, winK1], [900]);
  assert.equal(shingleCount(r.segments, ANCHOR), 1);
  assert.equal(shingleCount(r.segments, "אבא אמא ילד ילדה"), 1);
  assert.deepEqual(r.segments.map((s) => s.start), [820, 872, 886, 950]);
  assert.equal(r.seamsMeta[0].anchored, true);
  assert.equal(r.seamsMeta[0].anchorWords, 11); // якорь дотянулся до второй общей фразы
});

// (д) Вырожденные швы: пустое окно, окно из одних null-стартов, склейка без швов.
test("(S12.4-д) пустое окно / null-старты на шве / отсутствие швов", () => {
  const only = [sg(905, "שלום עולם טוב")];
  const empt = A.stitchWindowSegments([[], only], [900]);
  assert.deepEqual(empt.segments, only);            // пустое окно ничего не рушит
  assert.equal(empt.seamsMeta[0].anchored, false);  // якорю не из чего строиться
  // null-старты: фолбэк без якоря НЕ имеет права их выбрасывать (нет свидетельства, R11)
  const nulls = A.stitchWindowSegments([
    [sg(null, "מאמר על חינוך"), sg(null, "אבא אמא")], [sg(null, "שלום עולם")]], [900]);
  assert.equal(nulls.segments.length, 3);
  assert.equal(nulls.seamsMeta[0].cutSegDroppedK + nulls.seamsMeta[0].cutSegDroppedK1, 0);
  // но ТЕКСТОВЫЙ якорь работает и на null-метках — дубль снимается без единой метки
  const anchoredNulls = A.stitchWindowSegments([
    [sg(null, ANCHOR)], [sg(null, ANCHOR), sg(950, "שלום עולם טוב")]], [900]);
  assert.equal(shingleCount(anchoredNulls.segments, ANCHOR), 1);
  assert.equal(anchoredNulls.seamsMeta[0].anchored, true);
  // швов нет вообще (одно окно / пустой seams) — чистая конкатенация, meta пуста
  assert.deepEqual(A.stitchWindowSegments([[sg(1, "שלום")]], []),
                   { segments: [sg(1, "שלום")], seamsMeta: [] });
  assert.deepEqual(A.stitchWindowSegments([], [900]), { segments: [], seamsMeta: [] });
});

// R11-предохранитель: ложный якорь ДАЛЕКО от шва (повтор той же фразы в начале окна) отклоняется —
// иначе рез выбросил бы уникальный контент, которого у соседа нет вообще.
test("(S12.4-R11) якорь вне зоны перекрытия отклоняется, уникальный контент цел", () => {
  const r = A.stitchWindowSegments([
    [sg(100, ANCHOR), sg(870, "אבא אמא")],                 // повтор фразы за 800с до шва
    [sg(875, ANCHOR), sg(950, "שלום עולם טוב")],
  ], [900]);
  assert.ok(r.segments.some((s) => s.start === 100), "уникальный сегмент вне зоны шва не выброшен");
  assert.equal(r.seamsMeta[0].anchored, false);
  assert.equal(r.seamsMeta[0].anchorOutOfZone, true); // R9: честно записано, ПОЧЕМУ якорь отклонён
});

test("findCoverageGaps: дыра середины >90с, хвост >180с; интро НЕ дыра; null-старты прозрачны", () => {
  const segs = [{ start: 200, text: "а" }, { start: 260, text: "б" }, { start: null, text: "х" },
                { start: 500, text: "в" }];
  // интро 0..200 НЕ дыра (LATE_FIRST_SEGMENT уже флагует); 260→500 = 240с > 90 — дыра;
  // хвост 500..1000 = 500с > 180 — дыра.
  assert.deepEqual(A.findCoverageGaps(segs, 1000), [
    { fromSec: 260, toSec: 500 }, { fromSec: 500, toSec: 1000 },
  ]);
  assert.deepEqual(A.findCoverageGaps([{ start: 5, text: "а" }, { start: 80, text: "б" }], 200), []);
  assert.deepEqual(A.findCoverageGaps([], 600), []); // пусто — NO_SPEECH-путь, не дыры
});

test("estimateLongJob: 2ч подкаст в замеренных рамках; chunkSize обязателен", () => {
  const e = A.estimateLongJob(7200, { video: false, chunkSize: 120 });
  assert.ok(e.asrUsd > 0.15 && e.asrUsd < 0.5, "asrUsd=" + e.asrUsd);
  assert.ok(e.totalUsd > 0.4 && e.totalUsd < 1.5, "totalUsd=" + e.totalUsd);
  assert.ok(e.minutes >= 10 && e.minutes <= 35, "minutes=" + e.minutes);
  assert.equal(e.windows, 8);
  assert.ok(e.chunks >= 5 && e.chunks <= 8);
  assert.throws(() => A.estimateLongJob(7200, {}), /chunkSize/);
  const known = A.estimateLongJob(7200, { chunkSize: 120, segmentsKnown: 1700 });
  assert.equal(known.chunks, Math.ceil(1700 / 120));
});
