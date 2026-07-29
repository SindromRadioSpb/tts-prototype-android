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
// Нормализация теста НЕЗАВИСИМА от нормализации модуля (independent-oracle): своя реализация
// правила «буквы/цифры любого письма, огласовки сняты, регистр вниз».
function words(segments) {
  return segments.flatMap((s) => String(s.text).replace(/[֑-ׇ]/g, "").toLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter(Boolean));
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

// ── fix1 ревью S12.4 ────────────────────────────────────────────────────────────────────────

// C1 (БЛОКЕР ревью, R11): noAnchor-фолбэк резал у окна k+1 «всё < seam-2» БЕЗУСЛОВНО — молча
// полагая, что зону шва покрывает окно k. Если окно k оборвалось раньше (обрезанный ответ,
// пропущенная половина бисекции), это была ЧИСТАЯ ПОТЕРЯ речи, невидимая для гейтов: дыра в
// ≤90с не даёт ни coverageGaps, ни warning, ни добора. Теперь рез требует ДОКАЗАТЕЛЬСТВА
// покрытия — сохранённого сегмента окна k с числовой меткой в зоне шва.
test("(S12.4-C1) noAnchor: окно k оборвано до зоны шва → рез соседа НЕ применяется, потерь 0", () => {
  const r = A.stitchWindowSegments([
    [sg(700, "מאמר על חינוך"), sg(850, "אבא אמא")],           // обрыв на seam-50: зоны [870,900] нет
    [sg(872, "ילד ילדה"), sg(886, "שלום עולם"), sg(950, "משפט שני")],
  ], [900]);
  assert.deepEqual(r.segments.map((s) => s.start), [700, 850, 872, 886, 950]); // 872/886 УЦЕЛЕЛИ
  assert.equal(r.seamsMeta[0].k1CutPartial, true);   // R9: честно записано, почему сосед не резался
  assert.equal(r.seamsMeta[0].k1CutKept, 2);
  assert.equal(r.seamsMeta[0].cutSegDroppedK1, 0);
  // контроль: у окна k покрытие ЕСТЬ (880 ≥ 872-10) → рез применяется как прежде, без флагов
  const ctl = A.stitchWindowSegments([
    [sg(700, "מאמר על חינוך"), sg(880, "אבא אמא")],
    [sg(872, "ילד ילדה"), sg(950, "משפט שני")],
  ], [900]);
  assert.deepEqual(ctl.segments.map((s) => s.start), [700, 880, 950]);
  assert.equal(ctl.seamsMeta[0].cutSegDroppedK1, 1);
  assert.equal(ctl.seamsMeta[0].k1CutSkipped, undefined);
  assert.equal(ctl.seamsMeta[0].k1CutPartial, undefined);
  // у окна k нет НИ ОДНОЙ числовой метки → свидетелей нет вообще → k1CutSkipped (не partial)
  const noMarks = A.stitchWindowSegments([
    [sg(null, "מאמר על חינוך")], [sg(872, "ילד ילדה"), sg(950, "משפט שני")]], [900]);
  assert.deepEqual(noMarks.segments.map((s) => s.start), [null, 872, 950]);
  assert.equal(noMarks.seamsMeta[0].k1CutSkipped, true);
  assert.equal(noMarks.seamsMeta[0].k1CutPartial, undefined);
});

// D1 (fix2, БЛОКЕР раунда 2 — тот же класс, что C1): доказательство ПОСЕГМЕНТНОЕ. Одного
// «у окна k есть метка в зоне шва» мало: k=[…,855] при seam=900 «доказывало» покрытие сегментов
// соседа на 870…894 (≈24с речи), которых окно k никогда не касалось, и флага не ставилось — от
// легитимного полного реза случай было не отличить.
test("(S12.4-D1а) обрыв k ВНУТРИ зоны шва: сегменты соседа без свидетеля живы, флаг частичного реза", () => {
  const r = A.stitchWindowSegments([
    [sg(700, "מאמר על חינוך"), sg(855, "אחת שתיים")],          // окно k молчит после 855
    [sg(870, "שלום עולם"), sg(878, "טוב מאוד"), sg(886, "משפט אחד"), sg(894, "משפט שני"), sg(950, "מוזיקה")],
  ], [900]);
  assert.deepEqual(r.segments.map((s) => s.start), [700, 855, 870, 878, 886, 894, 950]); // потерь 0
  assert.equal(r.seamsMeta[0].cutSegDroppedK1, 0);
  assert.equal(r.seamsMeta[0].k1CutPartial, true);  // отличимо от легитимного полного реза
  assert.equal(r.seamsMeta[0].k1CutKept, 4);
});

test("(S12.4-D1б) свип границы доказательства: режется ровно то, что покрыто (TOL=10с)", () => {
  assert.equal(A.STITCH_COVER_TOL_SEC, 10);
  const r = A.stitchWindowSegments([
    [sg(700, "מאמר על חינוך"), sg(870, "אחת שתיים")],          // последняя метка k = 870 → покрыто ≤880
    [sg(872, "שלום עולם"), sg(884, "טוב מאוד"), sg(896, "משפט אחד"), sg(950, "מוזיקה")],
  ], [900]);
  assert.deepEqual(r.segments.map((s) => s.start), [700, 870, 884, 896, 950]); // срезан ТОЛЬКО 872
  assert.equal(r.seamsMeta[0].cutSegDroppedK1, 1);
  assert.equal(r.seamsMeta[0].k1CutKept, 2);
  assert.equal(r.seamsMeta[0].k1CutPartial, true);
});

// D2 (fix2): трим воскрешал сегмент, законно отброшенный ПРЕДЫДУЩИМ швом (окно s — это k+1 для
// шва s-1) — в транскрипте появлялась вторая копия уже снятого текста, а счётчики шва приписывали
// себе чужие резы. Фикстура: 3 окна, швы 900/1800, среднее окно вырожденное (метки null).
test("(S12.4-D2) трим не воскрешает сегмент, снятый предыдущим швом; счётчики честные", () => {
  const AN_A = "אבא אמא ילד ילדה תפוח";          // якорь шва 900 (5 слов)
  const win0 = [sg(700, "מאמר על חינוך"), sg(860, "אחת שתיים"), sg(880, AN_A)];
  const win1 = [sg(null, "אחת שתיים " + ANCHOR), sg(null, AN_A), sg(1790, "שלום עולם טוב")];
  const win2 = [sg(1801, ANCHOR + " שלום עולם טוב"), sg(1900, "משפט שני")];
  const r = A.stitchWindowSegments([win0, win1, win2], [900, 1800]);
  // «אחת שתיים» окна1 снято швом 900 (его копия есть у окна0 на 860) и НЕ возвращается тримом
  assert.equal(shingleCount(r.segments, "אחת שתיים"), 1);
  assert.equal(r.seamsMeta[1].cutSegTrimmedK, undefined); // трим не сработал: сегмент уже был снят
  // счётчик шва 1800 считает ТОЛЬКО свои резы (сегменты 1 и 2), а не «всё правее cutK» (было бы 3)
  assert.equal(r.seamsMeta[1].cutSegDroppedK, 2);
  assert.deepEqual(r.segments.map((s) => s.start), [700, 860, 1801, 1900]);
});

// C2 (ревью): нормализация «только иврит» делала якорь НЕВОЗМОЖНЫМ на не-ивритском аудио —
// а это поддержанный путь (ASR_PROMPT: транскрибируем и помечаем NOT_HEBREW). Каждый шов уходил
// в лоссовый noAnchor-путь, и провенанс при этом «сообщал», что модель не повторяет речь. Теперь
// слово = буквы/цифры любого письма.
test("(S12.4-C2) не-ивритское аудио (NOT_HEBREW-путь): якорь работает, копия одна", () => {
  const RU = "мама мыла раму очень чисто";
  const r = A.stitchWindowSegments([
    [sg(700, "первое предложение здесь"), sg(895, RU)],
    [sg(905, RU), sg(1000, "второе предложение тут")],
  ], [900]);
  assert.equal(shingleCount(r.segments, RU), 1);
  assert.equal(r.seamsMeta[0].anchored, true);
  assert.equal(r.seamsMeta[0].anchorWords, 5);
  assert.deepEqual(r.segments.map((s) => s.start), [700, 905, 1000]);
  // регистр и пунктуация не мешают якорю
  const mixed = A.stitchWindowSegments([
    [sg(895, "Мама мыла раму, очень чисто!")], [sg(905, "мама мыла раму очень чисто"), sg(1000, "хвост")],
  ], [900]);
  assert.equal(mixed.seamsMeta[0].anchored, true);
});

// I1 (ревью): слова сегмента cutK ДО первого слова якоря выбрасывались вместе с сегментом —
// подсегментная потеря речи. Правило (целиком — в коде): если у соседа якорь начинается с ПЕРВОГО
// слова его сегмента (сосед не даёт ничего до якоря), префикс cutK сохраняется УСЕЧЁННЫМ
// сегментом; если у соседа есть СВОЯ редакция до-якорных слов — cutK отбрасывается целиком.
test("(S12.4-I1) словесный трим границы: до-якорные слова не теряются", () => {
  const r = A.stitchWindowSegments([
    [sg(700, "מאמר על חינוך"), sg(875, "מילה יחידה " + ANCHOR)],
    [sg(876, ANCHOR), sg(950, "שלום עולם טוב")],
  ], [900]);
  assert.deepEqual(r.segments.map((s) => [s.start, s.text]), [
    [700, "מאמר על חינוך"], [875, "מילה יחידה"], [876, ANCHOR], [950, "שלום עולם טוב"]]);
  assert.equal(shingleCount(r.segments, "מילה יחידה"), 1); // сохранено ровно один раз
  assert.equal(shingleCount(r.segments, ANCHOR), 1);       // якорь по-прежнему один раз
  assert.equal(r.seamsMeta[0].cutSegTrimmedK, 2);          // R9: сегмент усечён, а не отброшен
  assert.equal(r.seamsMeta[0].cutSegDroppedK, 0);
  // контроль: у соседа СВОЯ редакция до-якорных слов → трима нет, обе редакции не плодятся
  const ctl = A.stitchWindowSegments([
    [sg(700, "מאמר על חינוך"), sg(875, "מילה יחידה " + ANCHOR)],
    [sg(876, "אבא אמא " + ANCHOR), sg(950, "שלום עולם טוב")],
  ], [900]);
  assert.deepEqual(ctl.segments.map((s) => s.text),
    ["מאמר על חינוך", "אבא אמא " + ANCHOR, "שלום עולם טוב"]);
  assert.equal(ctl.seamsMeta[0].cutSegTrimmedK, undefined);
  assert.equal(ctl.seamsMeta[0].cutSegDroppedK, 1);
});

// I2(а): порог якоря — не декоративная константа. 4 общих слова доказательством НЕ считаются.
test("(S12.4-I2а) порог STITCH_ANCHOR_MIN_WORDS: 4 общих слова — не якорь, 5 — якорь", () => {
  assert.equal(A.STITCH_ANCHOR_MIN_WORDS, 5);
  const W4 = "אבא אמא ילד ילדה", W5 = W4 + " תפוח";
  const four = A.stitchWindowSegments([
    [sg(700, "מאמר על חינוך"), sg(880, W4)], [sg(881, W4), sg(950, "משפט שני")]], [900]);
  assert.equal(four.seamsMeta[0].anchored, false);
  const five = A.stitchWindowSegments([
    [sg(700, "מאמר על חינוך"), sg(880, W5)], [sg(881, W5), sg(950, "משפט שני")]], [900]);
  assert.equal(five.seamsMeta[0].anchored, true);
  assert.equal(five.seamsMeta[0].anchorWords, 5);
});

// M6: при равной длине кандидатов побеждает БЛИЖНИЙ К ШВУ. Если бы побеждал дальний (700с),
// zone-предохранитель отклонил бы якорь целиком (anchored:false) — ассерт ниже это ловит.
test("(S12.4-M6) tie-break якоря: из двух равных кандидатов выбран ближний к шву", () => {
  const W5 = "אבא אמא ילד ילדה תפוח";
  const r = A.stitchWindowSegments([
    [sg(700, W5), sg(800, "מאמר על חינוך"), sg(880, W5)],  // W5 встречается ДВАЖДЫ
    [sg(881, W5), sg(950, "משפט שני")],
  ], [900]);
  assert.equal(r.seamsMeta[0].anchored, true);
  assert.equal(r.seamsMeta[0].cutSegDroppedK, 1);          // срезана только ПОЗДНЯЯ копия
  assert.deepEqual(r.segments.map((s) => s.start), [700, 800, 881, 950]); // ранняя копия цела
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
  // S12.4 fix1 (I3, R16): вход оплачивается за d + OVERLAP*(окон-1) — шовная зона уходит в модель
  // дважды. 8 окон → 7 швов → +210с звука. Проверяем по построению, а не «на глаз».
  const billedIn = (7200 + A.ASR_WINDOW_OVERLAP_SEC * (e.windows - 1)) * 32 / 1e6 * 1.0;
  assert.ok(Math.abs(e.asrUsd - (billedIn + 7200 * 8 / 1e6 * 2.5)) < 1e-9, "asrUsd=" + e.asrUsd);
  // и строго больше доперекрытийной формулы (по d) — иначе перекрытие снова не учтено
  assert.ok(e.asrUsd > 7200 * 32 / 1e6 * 1.0 + 7200 * 8 / 1e6 * 2.5, "asrUsd=" + e.asrUsd);
  assert.ok(e.asrUsd > 0.15 && e.asrUsd < 0.5, "asrUsd=" + e.asrUsd);
  assert.ok(e.totalUsd > 0.4 && e.totalUsd < 1.5, "totalUsd=" + e.totalUsd);
  assert.ok(e.minutes >= 10 && e.minutes <= 35, "minutes=" + e.minutes);
  assert.equal(e.windows, 8);
  assert.ok(e.chunks >= 5 && e.chunks <= 8);
  assert.throws(() => A.estimateLongJob(7200, {}), /chunkSize/);
  const known = A.estimateLongJob(7200, { chunkSize: 120, segmentsKnown: 1700 });
  assert.equal(known.chunks, Math.ceil(1700 / 120));
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// S12.5 T3 — АНТИ-РЕПЛЕЙ ТЕКСТ-ГЕЙТ (replayRatio/collectShingles). Диагноз
// DIAGNOSIS_S12_LIVE_DEFECT_2026_07_29 §7: модель на глубоких офсетах длинного fileUri отдаёт
// ЧУЖОЙ контент с подделанными in-range метками, поэтому ВСЕ метко-ключёванные гейты слепы.
// Независимый сигнал — ТЕКСТ: 6-словные нормализованные шинглы против накопителя уже принятого
// материала прогона. Обоснование порога/K/null — в комментарии исходника.
// ══════════════════════════════════════════════════════════════════════════════════════════

// Уникальные «слова» (основа+буква-префикс+номер): в таком материале СЛУЧАЙНЫХ совпадений
// шинглов не бывает вовсе, поэтому любая ненулевая доля в тесте — следствие НАМЕРЕННОГО
// копирования текста фикстурой, а не частотности живой речи.
function uw(prefix, from, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push("מילה" + prefix + (from + i));
  return out;
}
const oneSeg = (words) => [{ start: 0, text: words.join(" ") }];

test("(S12.5-T3) константы гейта: K=6, порог 40%, пол суждения 20 шинглов", () => {
  assert.equal(A.REPLAY_SHINGLE_K, 6);
  assert.equal(A.REPLAY_REJECT_RATIO, 0.4);
  assert.equal(A.REPLAY_MIN_SHINGLES, 20);
});

test("(S12.5-T3) replayRatio: полный повтор принятого материала → 1.0 (разбивка на сегменты не важна)", () => {
  const w = uw("א", 0, 30); // 30 слов → 25 шинглов ≥ REPLAY_MIN_SHINGLES
  const seen = A.collectShingles(oneSeg(w), new Set());
  assert.equal(A.replayRatio(oneSeg(w), seen), 1);
  // тот же поток слов, но нарезанный на 30 сегментов по слову: нарезка — решение модели, у двух
  // копий одной речи она разная, поэтому шинглы строятся по СКВОЗНОМУ потоку и доля не меняется.
  assert.equal(A.replayRatio(w.map((x, i) => ({ start: i, text: x })), seen), 1);
});

test("(S12.5-T3) replayRatio: ноль пересечения → 0 (и пустой накопитель → 0, не null)", () => {
  const seen = A.collectShingles(oneSeg(uw("א", 0, 30)), new Set());
  assert.equal(A.replayRatio(oneSeg(uw("ב", 0, 30)), seen), 0);
  assert.equal(A.replayRatio(oneSeg(uw("א", 0, 30)), new Set()), 0); // текста хватает, совпадать не с чем
});

test("(S12.5-T3) replayRatio: частичное пересечение → ТОЧНАЯ доля; 5 общих слов — не совпадение (K=6)", () => {
  const a = uw("א", 0, 30), b = uw("ב", 0, 30);
  const seen = A.collectShingles(oneSeg(a), new Set());
  // 12 слов из принятого + 13 новых = 25 слов → 20 шинглов; целиком внутри повторённых 12 слов
  // лежат ровно 12-6+1 = 7 шинглов, остальные захватывают новое слово и в накопителе отсутствуют.
  assert.equal(A.replayRatio(oneSeg(a.slice(0, 12).concat(b.slice(0, 13))), seen), 7 / 20);
  assert.ok(7 / 20 < A.REPLAY_REJECT_RATIO); // 35% — ещё НЕ брак: порог не декоративен
  // 5 общих слов подряд шинглом не становятся (K=6) — та же логика, что у STITCH_ANCHOR_MIN_WORDS:
  // короткое совпадение не доказательство.
  assert.equal(A.replayRatio(oneSeg(a.slice(0, 5).concat(b.slice(0, 20))), seen), 0);
});

test("(S12.5-T3) replayRatio: мало текста → null (R11: не обвинять окно без доказательств)", () => {
  const w = uw("א", 0, 30);
  const seen = A.collectShingles(oneSeg(w), new Set());
  // свип границы: 24 слова = 19 шинглов → суждения нет ДАЖЕ при дословном повторе; 25 = ровно 20.
  assert.equal(A.replayRatio(oneSeg(w.slice(0, 24)), seen), null);
  assert.equal(A.replayRatio(oneSeg(w.slice(0, 25)), seen), 1);
  assert.equal(A.replayRatio([], seen), null);
  assert.equal(A.replayRatio(null, seen), null);
});

test("(S12.5-T3) collectShingles: мутирует и возвращает ПЕРЕДАННЫЙ Set, накапливает по вызовам", () => {
  const set = new Set();
  assert.equal(A.collectShingles(oneSeg(uw("א", 0, 30)), set), set); // тот же объект, не копия
  assert.equal(set.size, 25);
  A.collectShingles(oneSeg(uw("ב", 0, 30)), set);
  assert.equal(set.size, 50);
  A.collectShingles(oneSeg(uw("א", 0, 30)), set); // повтор того же материала множество не растит
  assert.equal(set.size, 50);
  // узнаётся материал ОБОИХ вызовов — накопитель прогона, а не «последнее окно»
  assert.equal(A.replayRatio(oneSeg(uw("א", 0, 30)), set), 1);
  assert.equal(A.replayRatio(oneSeg(uw("ב", 0, 30)), set), 1);
});

test("(S12.5-T3) нормализация — общая со швом: огласовки/пунктуация/регистр не мешают узнаванию", () => {
  const base = uw("א", 0, 26); // 26 слов → 21 шингл
  const seen = A.collectShingles(oneSeg(base), new Set());
  // тот же текст с патахом внутри слова, пунктуацией и иной разбивкой на сегменты
  const decorated = base.map((w, i) => ({ start: i, text: w.replace("מ", "מַ") + (i % 3 ? "," : "!") }));
  assert.equal(A.replayRatio(decorated, seen), 1);
  // письмо С регистром (иврит его не имеет — проверяем на латинице)
  const lat = Array.from({ length: 26 }, (_, i) => "word" + i);
  const seenLat = A.collectShingles(oneSeg(lat), new Set());
  assert.equal(A.replayRatio(oneSeg(lat.map((w) => w.toUpperCase())), seenLat), 1);
});

// ── S12.5 T4: сводка прогона (R11 — потеря обязана быть видна ДО «→ В поле ввода») ────────────
// Живой брак 2026-07-29: прогон с потерей 47% таймлайна отчитался coverageGaps:[] и выглядел
// успехом. Эти юниты пинят ровно те свойства, на которых сводка держится: слияние пересекающихся
// интервалов (иначе потеря считается ДВАЖДЫ), пороги level и честность «ok».

const win = (startSec, endSec, extra) => Object.assign({ startSec, endSec, retries: 0 }, extra || {});

test("(S12.5-T4) summarizeAsrRun: чистый прогон → level ok, покрытие = вся длительность", () => {
  const s = A.summarizeAsrRun({
    durationSec: 7017, windows: [win(0, 900), win(870, 1800), win(1770, 7017)],
    coverageGaps: [], healedGaps: [], rejectedRanges: [], warnings: ["PARTIALLY_UNCLEAR"],
  });
  assert.equal(s.level, "ok");
  assert.equal(s.windowsTotal, 3);
  assert.equal(s.windowsOk, 3);
  assert.equal(s.lostSec, 0);
  assert.equal(s.lostPct, 0);
  assert.equal(s.coveredSec, 7017);
  assert.deepEqual(s.gaps, []);
  assert.equal(s.rejected, 0);
  assert.equal(s.healed, 0);
});

test("(S12.5-T4) БЕЗ ДВОЙНОГО СЧЁТА: дыра и забракованное окно на одном диапазоне = одна потеря", () => {
  // Так и выглядит реальность гейта T3: забракованное окно не отдаёт сегментов, поэтому его
  // диапазон появляется И в rejectedRanges, И (сразу же) в coverageGaps. Наивная сумма дала бы
  // 1800с потери на 900с реального провала — цифру, которой владелец не поверит.
  const s = A.summarizeAsrRun({
    durationSec: 3600, windows: [win(0, 900), win(870, 1800, { rejectedReplay: 0.87 }), win(1770, 2700), win(2670, 3600)],
    coverageGaps: [{ fromSec: 870, toSec: 1800 }],
    rejectedRanges: [{ startSec: 870, endSec: 1800, rejectedReplay: 0.87 }],
    healedGaps: [], warnings: ["ASR_WINDOW_REPLAY", "ASR_COVERAGE_GAP"],
  });
  assert.equal(s.lostSec, 930);                       // 1800-870, НЕ 1860
  assert.deepEqual(s.gaps, [{ fromSec: 870, toSec: 1800 }]);
  assert.equal(s.coveredSec, 3600 - 930);
  assert.equal(s.lostPct, 25.8);                      // округление до 0.1 — то же число, что в UI
  assert.equal(s.level, "bad");
  assert.equal(s.rejected, 1);
  assert.equal(s.windowsOk, 3);                       // забракованное окно — не «ok»
});

test("(S12.5-T4) слияние интервалов: пересечение, вложенность, стык, разрыв", () => {
  const s = A.summarizeAsrRun({
    durationSec: 1000, windows: [],
    coverageGaps: [
      { fromSec: 100, toSec: 200 },   // ┐ пересекаются
      { fromSec: 150, toSec: 260 },   // ┘ → 100–260
      { fromSec: 170, toSec: 190 },   // вложен целиком → ничего не добавляет
      { fromSec: 260, toSec: 300 },   // стык встык → та же дыра 100–300
      { fromSec: 500, toSec: 560 },   // отдельная дыра
    ],
    rejectedRanges: [{ startSec: 280, endSec: 320 }], // хвост первой дыры + продолжение → 100–320
    healedGaps: [], warnings: [],
  });
  assert.deepEqual(s.gaps, [{ fromSec: 100, toSec: 320 }, { fromSec: 500, toSec: 560 }]);
  assert.equal(s.lostSec, 220 + 60);
  assert.equal(s.lostPct, 28);
});

test("(S12.5-T4) уровни: 0% → ok, ≤5% → warn, >5% → bad, любой брак → bad", () => {
  const base = { durationSec: 1000, windows: [win(0, 1000)], healedGaps: [], rejectedRanges: [], warnings: [] };
  const lvl = (o) => A.summarizeAsrRun(Object.assign({}, base, o)).level;
  assert.equal(lvl({ coverageGaps: [] }), "ok");
  assert.equal(lvl({ coverageGaps: [{ fromSec: 0, toSec: 10 }] }), "warn");   // 1%
  assert.equal(lvl({ coverageGaps: [{ fromSec: 0, toSec: 50 }] }), "warn");   // ровно 5% — ещё warn
  assert.equal(lvl({ coverageGaps: [{ fromSec: 0, toSec: 51 }] }), "bad");    // 5.1% — уже bad
  // забракованный диапазон = класс дефекта (подделка-реплей), а не объём: bad при любой доле
  assert.equal(lvl({ coverageGaps: [], rejectedRanges: [{ startSec: 0, endSec: 5 }] }), "bad");
});

test("(S12.5-T4) «ok» не выдаётся авансом: пропуск половины бисекции и warning конвейера снимают его", () => {
  const skipped = A.summarizeAsrRun({
    durationSec: 1000, windows: [win(0, 1000, { skippedRanges: [{ startSec: 500, endSec: 750 }] })],
    coverageGaps: [], healedGaps: [{ fromSec: 500, toSec: 750 }], rejectedRanges: [], warnings: [],
  });
  assert.equal(skipped.windowsOk, 0);
  assert.equal(skipped.level, "warn"); // дыра закрыта добором, но окно целым не было
  assert.equal(skipped.healed, 1);
  // Расхождение источников: конвейер поднял ASR_COVERAGE_GAP, а интервалов нам не передали.
  // Зелёное здесь означало бы «наш счёт важнее предупреждения» — ровно та слепота, что убила прогон.
  const flagged = A.summarizeAsrRun({
    durationSec: 1000, windows: [win(0, 1000)],
    coverageGaps: [], healedGaps: [], rejectedRanges: [], warnings: ["ASR_COVERAGE_GAP"],
  });
  assert.equal(flagged.level, "warn");
  assert.equal(flagged.lostSec, 0);
});

test("(S12.5-T4) мусор на входе не ломает и не выдумывает потерю; клип по длительности", () => {
  const s = A.summarizeAsrRun({
    durationSec: 600, windows: null,
    coverageGaps: [{ fromSec: 300, toSec: 900 },      // хвост за длительностью → клип до 600
                   { fromSec: 50, toSec: 50 },        // нулевая длина → не потеря
                   { fromSec: 90, toSec: 40 },        // обратный → игнор
                   { fromSec: null, toSec: 10 }],     // без числа → игнор
    rejectedRanges: [{}], healedGaps: null, warnings: null,
  });
  assert.deepEqual(s.gaps, [{ fromSec: 300, toSec: 600 }]);
  assert.equal(s.lostSec, 300);
  assert.equal(s.lostPct, 50);
  assert.equal(s.windowsTotal, 0);
  assert.equal(s.rejected, 1);       // запись брака СЧИТАЕТСЯ, даже если её диапазон нечитаем
  assert.equal(s.level, "bad");
  const empty = A.summarizeAsrRun();  // вызов без аргумента вообще
  assert.equal(empty.level, "ok");
  assert.equal(empty.coveredSec, 0);
});

test("(S12.5-T4) fmtClock экспортирован и печатает мм:сс / ч:мм:сс (формат, который парсит ASR)", () => {
  assert.equal(A.fmtClock(0), "0:00");
  assert.equal(A.fmtClock(59.4), "0:59");
  assert.equal(A.fmtClock(2496), "41:36");
  assert.equal(A.fmtClock(7018), "1:56:58");
  assert.equal(A.secondsFromTimestamp(A.fmtClock(7018)), 7018); // round-trip: свой же парсер
});

// ── Whole-branch ревью S12.5: ШОВНОЕ ИСКЛЮЧЕНИЕ анти-реплей гейта ────────────────────────────
// asrWindows (S12.4) перекрывает соседей на 30с НАМЕРЕННО, значит часть повторов у честного окна
// создана НАМИ. Сколько именно — МЕРЯЕТСЯ якорем шва (общая последовательность слов между
// хвостом предыдущего окна и головой текущего), а не предполагается; меток гейт по-прежнему не
// касается. Живые последствия отсутствия исключения — в tests/runWindowedAsr.test.js
// (S12.5-T3-h/i): честная речь уничтожалась, а добор настоящей дыры запрещался.

test("(S12.5-T3-k) replaySeamSkipWords: якорь шва измерен; без якоря — 0; сверху ограничен хвостом", () => {
  const seam = uw("ש", 0, 12);                          // 12 слов шовной зоны
  const prev = [{ start: 0, text: uw("א", 0, 40).join(" ") },
                { start: 10, text: seam.join(" ") }];   // хвост предыдущего окна = шовная зона
  const cur = [{ start: 12, text: seam.join(" ") },
               { start: 20, text: uw("ב", 0, 40).join(" ") }];
  assert.equal(A.replaySeamSkipWords(prev, cur), 12);   // ровно шовный повтор, ни словом больше
  // общей последовательности нет → шов ничего не объясняет
  assert.equal(A.replaySeamSkipWords(prev, [{ start: 12, text: uw("ג", 0, 30).join(" ") }]), 0);
  assert.equal(A.replaySeamSkipWords(null, cur), 0);
  assert.equal(A.replaySeamSkipWords([], []), 0);
  // ЖЁСТКАЯ ГРАНИЦА 80 слов, и она держится ДАЖЕ на аномальной сегментации (окно отдано ОДНИМ
  // сегментом): срез пословный, а не по целым сегментам — иначе «хвост» растянулся бы на всё окно.
  const long = uw("ד", 0, 320);
  const prevLong = [{ start: 0, text: long.slice(0, 200).join(" ") }];        // слова 0..199
  const curShifted = [{ start: 10, text: long.slice(120).join(" ") }];        // слова 120..319
  assert.equal(A.replaySeamSkipWords(prevLong, curShifted), 80);              // не больше хвоста
  // Реплей ДЛИННОГО окна исключением не маскируется: голова копии — это НАЧАЛО предыдущего окна,
  // а сравнивается она с его ХВОСТОМ, общего нет → исключать нечего, доля остаётся 1.
  const curCopy = [{ start: 10, text: long.slice(0, 200).join(" ") }];
  assert.equal(A.replaySeamSkipWords(prevLong, curCopy), 0);
  const seen = A.collectShingles(prevLong, new Set());
  assert.equal(A.replayRatio(curCopy, seen, A.replaySeamSkipWords(prevLong, curCopy)), 1);
  // короткое окно, целиком совпавшее с предыдущим: после исключения судить нечем → null
  const short = uw("ה", 0, 60);
  const prevShort = [{ start: 0, text: short.join(" ") }];
  const curShort = [{ start: 10, text: short.join(" ") }];
  assert.equal(A.replaySeamSkipWords(prevShort, curShort), 60);
  assert.equal(A.replayRatio(curShort, A.collectShingles(prevShort, new Set()),
                             A.replaySeamSkipWords(prevShort, curShort)), null);
});

test("(S12.5-T3-k) replayRatio(skipWords): исключаются слова ГОЛОВЫ, накопитель не худеет", () => {
  const a = uw("א", 0, 30), b = uw("ב", 0, 30);
  const seen = A.collectShingles(oneSeg(a), new Set());
  const cur = oneSeg(a.slice(0, 5).concat(b));          // 5 повторных слов + 30 новых
  assert.equal(A.replayRatio(cur, seen, 0), A.replayRatio(cur, seen)); // умолчание = 0, обратная совместимость
  assert.equal(A.replayRatio(oneSeg(a), seen, 5), 1);   // исключение головы: остаток всё ещё узнан
  // мусорный skipWords не должен превращаться в «исключить всё» или в NaN-арифметику
  for (const bad of [null, undefined, -3, NaN, "7", {}]) {
    assert.equal(A.replayRatio(oneSeg(a), seen, bad), 1, "skipWords=" + JSON.stringify(bad));
  }
  // collectShingles кладёт в накопитель ВЕСЬ материал окна (шовное исключение — только суждение)
  const set = A.collectShingles(oneSeg(a), new Set());
  assert.equal(set.size, 25);
});
