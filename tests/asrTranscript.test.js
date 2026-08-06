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

// ── validateRowSegMapping (фикс караоке-мисмапа 2026-07-30) ────────────────────────────────
// Живой дефект: премиум-ответ /api/translate-table-v2 несёт СВОЙ `segment_index` (порядковый
// номер предложения премиум-сегментатора, 1-based), прежний гейт «есть целые числа» принимал
// его за индекс ASR-сегмента и строил вырожденный тайминг 1:1.
test("validateRowSegMapping: honest 1:N mapping (rows > segments) is valid", () => {
  // 4 сегмента → 7 строк: сегмент дробится на несколько строк — штатное поведение модели.
  const m = A.validateRowSegMapping([0, 0, 1, 2, 2, 2, 3], 4);
  assert.equal(m.ok, true);
  assert.equal(m.reason, null);
  assert.equal(m.indexed, 7);
  assert.equal(m.unique, 4);
});

test("validateRowSegMapping: exact 1:1 is VALID when rows == segments", () => {
  // Не путать с вырожденным 1:1: модель имеет право не дробить ни одного сегмента.
  const m = A.validateRowSegMapping([0, 1, 2, 3], 4);
  assert.equal(m.ok, true);
  assert.equal(m.reason, null);
});

test("validateRowSegMapping: degenerate 1:1 rejected when rows > segments", () => {
  // Строк 6, сегментов 4 ⇒ хотя бы один сегмент раздроблен ⇒ «каждая строка — свой сегмент» ложь.
  const m = A.validateRowSegMapping([0, 1, 2, 3, null, null], 4);
  assert.equal(m.ok, false);
  assert.equal(m.reason, "DEGENERATE_1_TO_1");
});

test("validateRowSegMapping: live defect fingerprint (premium 1-based row ordinals) rejected", () => {
  // Ровно то, что пришло бы от /api/translate-table-v2: индексы 1..rows при segCount < rows.
  const segCount = 5, rows = 8;
  const rowSegIdx = Array.from({ length: rows }, (_, r) => r + 1);
  const m = A.validateRowSegMapping(rowSegIdx, segCount);
  assert.equal(m.ok, false);
  assert.equal(m.reason, "OUT_OF_RANGE");
});

test("validateRowSegMapping: out of range / negative / non-integer rejected", () => {
  assert.equal(A.validateRowSegMapping([0, 1, 4], 4).reason, "OUT_OF_RANGE"); // 4 >= segCount
  assert.equal(A.validateRowSegMapping([-1, 0, 1], 4).reason, "OUT_OF_RANGE");
  assert.equal(A.validateRowSegMapping([0, "1", 2], 4).reason, "NOT_INTEGER");
  assert.equal(A.validateRowSegMapping([0, 1.5, 2], 4).reason, "NOT_INTEGER");
});

test("validateRowSegMapping: decreasing rejected", () => {
  const m = A.validateRowSegMapping([0, 1, 1, 0, 2], 4);
  assert.equal(m.ok, false);
  assert.equal(m.reason, "DECREASING");
});

test("validateRowSegMapping: rows of one segment must be contiguous", () => {
  // Возврат к сегменту 0 ЧЕРЕЗ строки без индекса: границы чанков проходят только по сегментам,
  // поэтому разрыв блока строк одного сегмента невозможен by construction — значит, маппинг врёт.
  const m = A.validateRowSegMapping([0, 0, null, 0, 1], 4);
  assert.equal(m.ok, false);
  assert.equal(m.reason, "SPLIT_SEGMENT");
});

test("validateRowSegMapping: partially-indexed table (one lost chunk) stays valid", () => {
  // Сценарий 3 smoke:studio-chunks: средний кусок вернулся без segment_index (SEG_MAPPING_LOST
  // локально) — строки с индексом обязаны продолжать работать.
  const m = A.validateRowSegMapping([0, 0, 1, null, null, 4, 4, 5], 6);
  assert.equal(m.ok, true);
  assert.equal(m.indexed, 6);
  assert.equal(m.unique, 4);
});

test("validateRowSegMapping: boundaries — no rows, no indices, no segments", () => {
  assert.equal(A.validateRowSegMapping([], 4).reason, "NO_INDEX");        // 0 строк
  assert.equal(A.validateRowSegMapping([null, null], 4).reason, "NO_INDEX"); // строки без индексов
  assert.equal(A.validateRowSegMapping([0], 1).ok, true);                 // 1 сегмент, 1 строка
  assert.equal(A.validateRowSegMapping([0, 0], 1).ok, true);              // 1 сегмент → 2 строки
  assert.equal(A.validateRowSegMapping([0], 0).reason, "NO_SEGMENTS");    // сегментов нет вовсе
  assert.equal(A.validateRowSegMapping([0], null).reason, "NO_SEGMENTS");
  assert.equal(A.validateRowSegMapping(null, 4).reason, "NO_INDEX");
});

test("buildRowTiming: 1:N split — every entry points at its OWN segment's first row", () => {
  // Регресс живого дефекта: строк заметно больше сегментов, проверяем КОНКРЕТНЫЕ o, не их число.
  const segs = [{ i: 0, start: 0, text: "a" }, { i: 1, start: 10, text: "b" },
                { i: 2, start: 20, text: "c" }, { i: 3, start: 30, text: "d" }];
  const rowSegIdx = [0, 0, 1, 2, 2, 2, 3]; // 7 строк на 4 сегмента
  assert.equal(A.validateRowSegMapping(rowSegIdx, segs.length).ok, true);
  const t = A.buildRowTiming(segs, rowSegIdx);
  assert.deepEqual(t.entries, [{ o: 0, t: 0 }, { o: 2, t: 10 }, { o: 3, t: 20 }, { o: 6, t: 30 }]);
  // независимый оракул: строка, на которую указывает запись, обязана принадлежать своему сегменту
  t.entries.forEach((e) => {
    const seg = segs.find((s) => s.start === e.t);
    assert.equal(rowSegIdx[e.o], seg.i, "entry o=" + e.o + " points at segment " + rowSegIdx[e.o] + ", expected " + seg.i);
  });
  // и НЕ вырождается в 1:1 (o != 0,1,2,3 — фингерпринт дефекта)
  assert.notDeepEqual(t.entries.map((e) => e.o), [0, 1, 2, 3]);
});

// ── timingLooksDegenerate: карантин уже СОХРАНЁННЫХ паспортов (ревью фикса 2026-07-30) ───────
// validateRowSegMapping судит только новые ответы; карточки, сохранённые до фикса, несут
// вырожденный тайминг в table_model_meta_json — включая ту, на которой владелец увидел брак.
const degSegs = (n, step) => Array.from({ length: n }, (_, i) => ({ i, start: i * (step || 10), text: "s" + i }));

test("timingLooksDegenerate: owner's live passport fingerprint (rows >> segments, o === segment index)", () => {
  // Паспорт из тикета: 1651 строка, 1074 сегмента, o = 0…1072 с пропусками 259/260/800.
  const segs = degSegs(1074, 6.5);
  const skip = new Set([259, 260, 800]);
  const entries = segs.filter((s) => !skip.has(s.i)).map((s) => ({ o: s.i, t: s.start }));
  assert.equal(entries.length, 1071);
  assert.equal(A.timingLooksDegenerate({ v: 1, unit: "row", entries }, segs, 1651), true);
});

test("timingLooksDegenerate: honest 1:N timing is NEVER quarantined", () => {
  // 4 сегмента → 7 строк; entries строит сам прод-код, поэтому отпечаток проверяем на нём.
  const segs = [{ i: 0, start: 0, text: "a" }, { i: 1, start: 10, text: "b" },
                { i: 2, start: 20, text: "c" }, { i: 3, start: 30, text: "d" }];
  const t = A.buildRowTiming(segs, [0, 0, 1, 2, 2, 2, 3]);
  assert.equal(A.timingLooksDegenerate(t, segs, 7), false);
  // и достаточно ОДНОЙ честной записи, чтобы не трогать тайминг: только первый сегмент раздроблен
  const t2 = A.buildRowTiming(segs, [0, 0, 1, 2, 3]);
  assert.equal(A.timingLooksDegenerate(t2, segs, 5), false);
  // худший случай для отпечатка: дробление ТОЛЬКО в самом конце, поэтому 4 записи из 5 совпадают
  // с индексом своего сегмента СЛУЧАЙНО. Одна честная запись обязана спасти весь тайминг —
  // «большинство совпало» никогда не должно становиться приговором.
  const segs5 = degSegs(5);
  const t3 = A.buildRowTiming(segs5, [0, 1, 2, 3, 3, 4]);
  assert.deepEqual(t3.entries.map((e) => e.o), [0, 1, 2, 3, 5]);
  assert.equal(A.timingLooksDegenerate(t3, segs5, 6), false);
});

test("timingLooksDegenerate: exact 1:1 (rows == segments) is not degenerate", () => {
  const segs = degSegs(300);
  const entries = segs.map((s) => ({ o: s.i, t: s.start }));
  assert.equal(A.timingLooksDegenerate({ entries }, segs, 300), false); // строк не больше сегментов
  assert.equal(A.timingLooksDegenerate({ entries }, segs, 299), false);
});

test("timingLooksDegenerate: boundaries — no timing / <2 entries / no segments / unknown t", () => {
  const segs = degSegs(10);
  assert.equal(A.timingLooksDegenerate(null, segs, 100), false);
  assert.equal(A.timingLooksDegenerate({ entries: [] }, segs, 100), false);
  assert.equal(A.timingLooksDegenerate({ entries: [{ o: 0, t: 0 }] }, segs, 100), false); // 1 запись
  assert.equal(A.timingLooksDegenerate({ entries: [{ o: 0, t: 0 }, { o: 1, t: 10 }] }, [], 100), false);
  assert.equal(A.timingLooksDegenerate({ entries: [{ o: 0, t: 0 }, { o: 1, t: 10 }] }, segs, null), false);
  // t, которых нет среди сегментов, не судим вовсе — 0 сопоставленных записей ⇒ не вырожден
  assert.equal(A.timingLooksDegenerate({ entries: [{ o: 0, t: 7.77 }, { o: 1, t: 8.88 }] }, segs, 100), false);
});

// ── premiumRowLineIdx: ВОЗВРАТ караоке премиум-ветке через source_line_index (K2 2026-07-30) ──
// K1 отключил караоке на /api/translate-table-v2, но google-free — ДЕФОЛТНЫЙ провайдер владельца.
// K2 даёт честный мост: premium публикует source_line_index (номер исходной строки), а для
// импортированного медиа одна строка = один ASR-сегмент. Мост принимается не на слово: каждая
// строка ответа обязана быть подстрокой ТОЙ строки, на которую ссылается.
const premRow = (li, he) => ({ source_line_index: li, he: he });

test("premiumRowLineIdx: 1:N (строка → несколько предложений) — индексы строк ASR-сегментов", () => {
  const lines = ["ראשון. שני!", "שלישי.", "רביעי. חמישי. שישי."];
  const rows = [premRow(0, "ראשון."), premRow(0, "שני!"), premRow(1, "שלישי."),
                premRow(2, "רביעי."), premRow(2, "חמישי."), premRow(2, "שישי.")];
  const m = A.premiumRowLineIdx(rows, lines);
  assert.equal(m.reason, null);
  assert.deepEqual(m.idx, [0, 0, 1, 2, 2, 2]);
  // и этот маппинг обязан проходить ТОТ ЖЕ гейт осмысленности, что seg-режим Gemini
  assert.equal(A.validateRowSegMapping(m.idx, lines.length).ok, true);
});

test("premiumRowLineIdx: 1:1 (каждая строка — одно предложение) валиден", () => {
  const lines = ["שורה 0", "שורה 1", "שורה 2"];
  const rows = lines.map((t, i) => premRow(i, t));
  const m = A.premiumRowLineIdx(rows, lines);
  assert.deepEqual(m.idx, [0, 1, 2]);
  assert.equal(A.validateRowSegMapping(m.idx, lines.length).ok, true);
});

test("premiumRowLineIdx: старый премиум-кэш БЕЗ поля → NO_INDEX, караоке честно нет", () => {
  // Ответ из doc-кэша, записанного до K2: rows несут только чужой segment_index.
  const lines = ["שורה 0", "שורה 1"];
  const rows = [{ segment_index: 1, he: "שורה 0" }, { segment_index: 2, he: "שורה 1" }];
  const m = A.premiumRowLineIdx(rows, lines);
  assert.equal(m.reason, "NO_INDEX");
  assert.deepEqual(m.idx, []);
  assert.equal(A.validateRowSegMapping(m.idx, lines.length).ok, false);
});

test("premiumRowLineIdx: индекс вне диапазона строк → отказ целиком", () => {
  const lines = ["א", "ב"];
  assert.equal(A.premiumRowLineIdx([premRow(0, "א"), premRow(2, "ב")], lines).reason, "LINE_OUT_OF_RANGE");
  assert.equal(A.premiumRowLineIdx([premRow(-1, "א")], lines).reason, "LINE_OUT_OF_RANGE");
});

test("premiumRowLineIdx: строка ответа НЕ из своей строки текста → LINE_TEXT_MISMATCH", () => {
  // Сдвиг на единицу — ровно то, что даёт разъехавшаяся нарезка (и то, чего проверка «поле
  // целое» никогда не поймает). Текст доказывает принадлежность, самоотчёт — нет.
  const lines = ["ראשון.", "שני.", "שלישי."];
  const rows = [premRow(0, "ראשון."), premRow(1, "שלישי."), premRow(2, "שני.")];
  const m = A.premiumRowLineIdx(rows, lines);
  assert.equal(m.reason, "LINE_TEXT_MISMATCH");
  assert.deepEqual(m.idx, [], "ни одной строки не отдаём: маппинг разъехался целиком (R11)");
});

test("premiumRowLineIdx: NFKC и BIDI-марки не считаются расхождением", () => {
  // Сервер сегментирует normalizeForDisplay(text) (NFKC + снятие марок в сегментаторе), клиент
  // передаёт сырые строки поля ввода — сравнение обязано это переживать, иначе караоке
  // отваливалось бы на ровном месте.
  const lines = ["\u200Eרגע… בסדר.", " שלום עולם."];
  const rows = [premRow(0, "רגע... בסדר."), premRow(1, "שלום עולם.")];
  const m = A.premiumRowLineIdx(rows, lines);
  assert.equal(m.reason, null);
  assert.deepEqual(m.idx, [0, 1]);
});

test("premiumRowLineIdx: нет строк (текст переразбит) → NO_LINES", () => {
  assert.equal(A.premiumRowLineIdx([premRow(0, "א")], []).reason, "NO_LINES");
  assert.equal(A.premiumRowLineIdx([premRow(0, "א")], null).reason, "NO_LINES");
});

test("premiumRowLineIdx: частично проиндексированный ответ сохраняет дыры (не гадает)", () => {
  const lines = ["א.", "ב.", "ג."];
  const rows = [premRow(0, "א."), { he: "ב." }, premRow(2, "ג.")];
  const m = A.premiumRowLineIdx(rows, lines);
  assert.equal(m.reason, null);
  assert.deepEqual(m.idx, [0, null, 2]);
  assert.equal(A.validateRowSegMapping(m.idx, 3).ok, true);
});

test("premiumRowLineIdx → buildRowTiming: записи указывают на строки СВОЕГО сегмента", () => {
  // Сквозной оракул премиум-ветки: 3 сегмента (= 3 строки текста), 6 строк таблицы.
  const lines = ["ראשון. שני!", "שלישי.", "רביעי. חמישי. שישי."];
  const segs = [{ i: 0, start: 0, text: lines[0] }, { i: 1, start: 12, text: lines[1] },
                { i: 2, start: 25, text: lines[2] }];
  const rows = [premRow(0, "ראשון."), premRow(0, "שני!"), premRow(1, "שלישי."),
                premRow(2, "רביעי."), premRow(2, "חמישי."), premRow(2, "שישי.")];
  const m = A.premiumRowLineIdx(rows, lines);
  assert.equal(A.validateRowSegMapping(m.idx, segs.length).ok, true);
  const t = A.buildRowTiming(segs, m.idx);
  assert.deepEqual(t.entries, [{ o: 0, t: 0 }, { o: 2, t: 12 }, { o: 3, t: 25 }]);
  // независимый оракул: строка, на которую указывает запись, принадлежит своему сегменту
  t.entries.forEach((e) => {
    const seg = segs.find((s) => s.start === e.t);
    assert.equal(m.idx[e.o], seg.i);
  });
  // и это НЕ вырожденный 1:1 (фингерпринт живого брака)
  assert.notDeepEqual(t.entries.map((e) => e.o), [0, 1, 2]);
});

// ── alignRowsToSegments: ОФЛАЙН-ОЖИВЛЕНИЕ караоке у сохранённой карточки (K3 2026-07-30) ──────
// K1/K2 работают только в сессии импорта; у сохранённой карточки строк с индексами уже нет
// (segment_index в схеме sentences не хранится вовсе). Связь восстанавливается ПО ТЕКСТУ:
// строка обязана совпасть со словами своего сегмента начиная ровно с позиции указателя, а
// оракул требует, чтобы каждый получивший строки сегмент был покрыт ими ЦЕЛИКОМ.
const alSegs = (texts, step) => texts.map((t, i) => ({ i, start: i * (step || 10), text: t }));

test("alignRowsToSegments: идеальное 1:N (строка сегмента раздроблена на предложения)", () => {
  const segs = alSegs(["ראשון. שני!", "שלישי.", "רביעי. חמישי. שישי."]);
  const rows = ["ראשון.", "שני!", "שלישי.", "רביעי.", "חמישי.", "שישי."];
  const a = A.alignRowsToSegments(rows, segs);
  assert.equal(a.reason, null);
  assert.equal(a.ok, true);
  assert.deepEqual(a.rowSegIdx, [0, 0, 1, 2, 2, 2]);
  assert.equal(a.alignedSegments, 3);
  assert.equal(a.alignedRows, 6);
  // и результат обязан проходить ТОТ ЖЕ гейт, что ответы seg-режима и премиума
  assert.equal(A.validateRowSegMapping(a.rowSegIdx, segs.length).ok, true);
  const t = A.buildRowTiming(segs, a.rowSegIdx);
  assert.deepEqual(t.entries, [{ o: 0, t: 0 }, { o: 2, t: 10 }, { o: 3, t: 20 }]);
});

test("alignRowsToSegments: ровно 1:1", () => {
  const segs = alSegs(["שורה אפס.", "שורה אחת.", "שורה שתיים."]);
  const a = A.alignRowsToSegments(["שורה אפס.", "שורה אחת.", "שורה שתיים."], segs);
  assert.equal(a.ok, true);
  assert.deepEqual(a.rowSegIdx, [0, 1, 2]);
  assert.equal(A.validateRowSegMapping(a.rowSegIdx, 3).ok, true);
});

test("alignRowsToSegments: другая пунктуация/огласовки/BIDI/NFKC — не расхождение", () => {
  // Сегмент — сырой текст ASR (без огласовок, «...»), строка таблицы — после normalizeForDisplay
  // (NFKC) и, возможно, с огласовками из ②-обогащения. Нормализация обеих сторон одна.
  const segs = alSegs(["רגע... בסדר, שלום עולם", "אבא אמא ילד"]);
  const rows = ["‎רגע… בסדר,", "שָׁלוֹם עוֹלָם!", "אבא — אמא, ילד."];
  const a = A.alignRowsToSegments(rows, segs);
  assert.equal(a.reason, null);
  assert.deepEqual(a.rowSegIdx, [0, 0, 1]);
});

test("alignRowsToSegments: строка не принадлежит своему месту → ROW_NOT_IN_SEGMENT", () => {
  const segs = alSegs(["ראשון. שני!", "שלישי.", "רביעי."]);
  const a = A.alignRowsToSegments(["ראשון.", "טקסט זר לגמרי", "שלישי.", "רביעי."], segs);
  assert.equal(a.ok, false);
  assert.equal(a.reason, "ROW_NOT_IN_SEGMENT");
  assert.deepEqual(a.rowSegIdx, [], "частичный маппинг наружу не отдаём — на нём построили бы кривой тайминг");
});

test("alignRowsToSegments: подстрока внутри слова НЕ считается совпадением", () => {
  // indexOf по склеенному тексту нашёл бы «שלום» внутри «שלומי» и разрешил бы сдвиг границы.
  // Сравнение пословное — такой «почти совпало» обязан быть отказом.
  const segs = alSegs(["שלומי הלך הביתה", "מחר יהיה טוב"]);
  const a = A.alignRowsToSegments(["שלום", "הלך הביתה", "מחר יהיה טוב"], segs);
  assert.equal(a.ok, false);
  assert.equal(a.reason, "ROW_NOT_IN_SEGMENT");
});

test("alignRowsToSegments: сегмент покрыт строками ЧАСТИЧНО → SEGMENT_UNCOVERED (оракул)", () => {
  // Указатель сам по себе такой рез пропустил бы (строка «שלישי» честно нашлась в сегменте 1);
  // ловит его именно оракул покрытия: сегмент 0 получил строку, но покрыт ею не целиком.
  const segs = alSegs(["ראשון. שני!", "שלישי.", "רביעי."]);
  const a = A.alignRowsToSegments(["ראשון.", "שלישי.", "רביעי."], segs);
  assert.equal(a.ok, false);
  assert.equal(a.reason, "SEGMENT_UNCOVERED");
});

test("alignRowsToSegments: строка, склеившая ДВА сегмента, → отказ", () => {
  // Модель могла слить речь двух сегментов в одну строку. Такой строке нельзя назначить сегмент:
  // тайминг получил бы запись, покрывающую чужую метку.
  const segs = alSegs(["אבא הלך", "הביתה מהר"]);
  const a = A.alignRowsToSegments(["אבא הלך הביתה מהר"], segs);
  assert.equal(a.ok, false);
  assert.equal(a.reason, "ROW_NOT_IN_SEGMENT");
});

test("alignRowsToSegments: лишние строки в конце → TRAILING_ROWS", () => {
  const segs = alSegs(["ראשון.", "שני."]);
  const a = A.alignRowsToSegments(["ראשון.", "שני.", "שורה שנוספה אחר כך"], segs);
  assert.equal(a.ok, false);
  assert.equal(a.reason, "TRAILING_ROWS");
});

test("alignRowsToSegments: сегмент БЕЗ строк не ломает выравнивание, но и записи не получает", () => {
  // Речь сегмента 1 в таблицу не попала (модель пропустила её при переводе). Соврать этот случай
  // не может: каждая оставшаяся строка доказана текстом своего сегмента, а сегмент 1 просто не
  // получает записи — караоке дольше держит предыдущую строку, но НЕ подсвечивает чужую.
  const segs = alSegs(["ראשון. שני!", "שלישי רביעי חמישי.", "שישי."]);
  const a = A.alignRowsToSegments(["ראשון.", "שני!", "שישי."], segs);
  assert.equal(a.ok, true);
  assert.deepEqual(a.rowSegIdx, [0, 0, 2]);
  assert.equal(a.alignedSegments, 2, "сегмент 1 не покрыт — он и не судится");
  const t = A.buildRowTiming(segs, a.rowSegIdx);
  assert.deepEqual(t.entries, [{ o: 0, t: 0 }, { o: 2, t: 20 }], "у пропущенного сегмента записи нет");
});

test("alignRowsToSegments: строка без слов между строками ОДНОГО сегмента наследует его индекс", () => {
  // «[…]» / «—» нормализуются в пусто: доказать принадлежность нечем. Но строка, зажатая между
  // двумя строками одного сегмента, принадлежит ему ПО ПОРЯДКУ — иначе гейт непрерывности
  // (SPLIT_SEGMENT) отверг бы честное выравнивание из-за одной строки со скобками.
  const segs = alSegs(["ראשון שני שלישי", "רביעי."]);
  const a = A.alignRowsToSegments(["ראשון שני", "[...]", "שלישי", "רביעי."], segs);
  assert.equal(a.reason, null);
  assert.deepEqual(a.rowSegIdx, [0, 0, 0, 1]);
  assert.equal(A.validateRowSegMapping(a.rowSegIdx, 2).ok, true);
  // а на границе сегментов такая строка индекса НЕ получает (принадлежность недоказуема)
  const segs3 = alSegs(["ראשון שני שלישי", "רביעי חמישי", "שישי"]);
  const b = A.alignRowsToSegments(["ראשון שני שלישי", "[...]", "רביעי", "חמישי", "שישי"], segs3);
  assert.equal(b.reason, null);
  assert.deepEqual(b.rowSegIdx, [0, null, 1, 1, 2]);
  assert.equal(A.validateRowSegMapping(b.rowSegIdx, 3).ok, true);
});

test("alignRowsToSegments: осознанный остаток — пограничная пустая строка может уронить гейт 1:1", () => {
  // Строк 3, сегментов 2, у каждого сегмента ровно одна ИНДЕКСИРОВАННАЯ строка ⇒
  // validateRowSegMapping считает такой маппинг вырожденным (его правило «строк больше, чем
  // сегментов ⇒ кто-то раздроблен» не знает про строки без слов). Выравнивание тут доказано
  // текстом, но ослаблять гейт K1 ради этого края нельзя — отказ консервативен и честен (R11).
  const segs = alSegs(["ראשון שני שלישי", "רביעי"]);
  const a = A.alignRowsToSegments(["ראשון שני שלישי", "[...]", "רביעי"], segs);
  assert.equal(a.ok, false);
  assert.equal(a.reason, "DEGENERATE_1_TO_1");
});

test("alignRowsToSegments: сегменты со start:null выравниваются, но записей не дают", () => {
  const segs = [{ i: 0, start: 0, text: "ראשון. שני!" }, { i: 1, start: null, text: "שלישי." },
                { i: 2, start: 30, text: "רביעי." }];
  const a = A.alignRowsToSegments(["ראשון.", "שני!", "שלישי.", "רביעי."], segs);
  assert.equal(a.ok, true);
  assert.deepEqual(a.rowSegIdx, [0, 0, 1, 2]);
  assert.deepEqual(A.buildRowTiming(segs, a.rowSegIdx).entries, [{ o: 0, t: 0 }, { o: 3, t: 30 }]);
});

test("alignRowsToSegments: пустые входы → EMPTY_INPUT", () => {
  const segs = alSegs(["ראשון."]);
  assert.equal(A.alignRowsToSegments([], segs).reason, "EMPTY_INPUT");
  assert.equal(A.alignRowsToSegments(["ראשון."], []).reason, "EMPTY_INPUT");
  assert.equal(A.alignRowsToSegments(null, null).reason, "EMPTY_INPUT");
  // строки есть, но ни в одной нет слов — маппинга не будет (гадать не по чему)
  assert.equal(A.alignRowsToSegments(["...", "—"], segs).ok, false);
});

test("alignRowsToSegments: живая форма владельца 1074 сегмента ↔ 1651 строка", () => {
  // Пропорция взята с карточки «Шломо Крук. Интервью» (замер 2026-07-30): 577 сегментов модель
  // раздробила надвое, 497 оставила целыми ⇒ 577*2 + 497 = 1651 строка.
  const SEGS = 1074, SPLIT = 577;
  const segs = [], rows = [], expect = [];
  for (let i = 0; i < SEGS; i++) {
    const a1 = "מילה" + i + " שתיים" + i, a2 = "שלוש" + i + " ארבע" + i;
    segs.push({ i, start: i * 6.5, text: a1 + ". " + a2 + "." });
    if (i < SPLIT) { rows.push(a1 + "."); rows.push(a2 + "."); expect.push(i, i); }
    else { rows.push(a1 + ". " + a2 + "."); expect.push(i); }
  }
  assert.equal(rows.length, 1651);
  const a = A.alignRowsToSegments(rows, segs);
  assert.equal(a.reason, null);
  assert.deepEqual(a.rowSegIdx, expect);
  assert.equal(a.alignedSegments, SEGS);
  assert.equal(a.alignedRows, 1651);
  const t = A.buildRowTiming(segs, a.rowSegIdx);
  assert.equal(t.entries.length, SEGS);
  // независимый оракул поверх результата: запись указывает на строку СВОЕГО сегмента,
  // и это НЕ вырожденный локстеп (o = 0,1,2,… — фингерпринт живого брака)
  t.entries.forEach((e) => {
    const seg = segs.find((s) => s.start === e.t);
    assert.equal(a.rowSegIdx[e.o], seg.i);
  });
  assert.deepEqual(t.entries.slice(0, 4).map((e) => e.o), [0, 2, 4, 6]);
  assert.equal(A.timingLooksDegenerate(t, segs, rows.length), false, "честный тайминг не карантинится");
});

test("alignRowsToSegments: одна изменённая строка роняет ВСЁ выравнивание (не «почти»)", () => {
  const segs = alSegs(["ראשון. שני!", "שלישי.", "רביעי."]);
  const rows = ["ראשון.", "שני!", "שלישי.", "רביעי."];
  assert.equal(A.alignRowsToSegments(rows, segs).ok, true);
  const tampered = rows.slice();
  tampered[2] = "שלישי ועוד מילה";              // владелец (или модель) поправил строку
  const a = A.alignRowsToSegments(tampered, segs);
  assert.equal(a.ok, false);
  assert.ok(a.reason === "ROW_NOT_IN_SEGMENT" || a.reason === "SEGMENT_UNCOVERED", a.reason);
});

// W3 (honest import -> card, 2026-08-06): strict alignment remains binary for its
// existing callers. The additive mode proves each row independently and leaves a
// literal null wherever uniqueness cannot be established.
test("alignRowsToSegmentsPartialProven accepts only rows contained in exactly one segment", () => {
  const segs = [
    { i: 0, start: 0, end: 2, text: "שלום עולם" },
    { i: 1, start: 4, end: 6, text: "כן תשובה" },
    { i: 2, start: 8, end: 10, text: "מיה באה" },
    { i: 3, start: 12, end: 14, text: "כן בהחלט" },
  ];
  const rows = ["שלום עולם", "שורה שלא קיימת", "מיה באה", "כן"];
  assert.equal(A.alignRowsToSegments(rows, segs).ok, false, "the old all-or-nothing verdict is unchanged");

  const partial = A.alignRowsToSegmentsPartialProven(rows, segs);
  assert.equal(partial.mode, "partial-proven");
  assert.deepEqual(partial.rowSegIdx, [0, null, 2, null]);
  assert.equal(partial.mappedRows, 2);
  assert.equal(partial.totalRows, 4);
  assert.equal(partial.coverage, 0.5);
  assert.deepEqual(partial.absentRows, [1]);
  assert.deepEqual(partial.ambiguousRows, [3], "a row present in two segments gets no timing");
  assert.deepEqual(partial.orderConflictRows, []);
});

test("partial-proven mode never uses substrings, neighbours, voting or reordered matches", () => {
  const segs = [
    { i: 0, start: 0, end: 1, text: "שלומי הגיע" },
    { i: 1, start: 2, end: 3, text: "מיה באה" },
    { i: 2, start: 4, end: 5, text: "דני הלך" },
  ];
  const partial = A.alignRowsToSegmentsPartialProven(
    ["שלום", "דני הלך", "מיה באה", "מילה קרובה"], segs,
  );
  assert.deepEqual(partial.rowSegIdx, [null, 2, null, null]);
  assert.deepEqual(partial.absentRows, [0, 3], "inside-word and nearest-neighbour guesses are absent");
  assert.deepEqual(partial.orderConflictRows, [2], "a unique but decreasing match is not playable");
});

test("buildPartialProvenTiming brackets an unproven row with a canonical blind boundary", () => {
  const segs = [
    { i: 0, start: 0, end: 2, text: "שלום עולם" },
    { i: 1, start: 4, end: 6, text: "חסר" },
    { i: 2, start: 8, end: 10, text: "מיה באה" },
  ];
  const built = A.buildPartialProvenTiming(segs, [0, null, 2]);
  assert.deepEqual(built.rowSegIdx, [0, null, 2]);
  assert.deepEqual(built.timing.entries, [
    { o: 0, t: 0 }, { o: 1, t: 2, blind: true }, { o: 2, t: 8 },
  ]);
  assert.equal(built.mappedRows, 2);
});

test("buildPartialProvenTiming refuses a gap when its canonical end boundary is absent", () => {
  const segs = [
    { i: 0, start: 0, text: "שלום עולם" },
    { i: 1, start: 4, text: "חסר" },
    { i: 2, start: 8, text: "מיה באה" },
  ];
  const built = A.buildPartialProvenTiming(segs, [0, null, 2]);
  assert.equal(built.timing, null, "without segment.end there is no honest boundary for the hole");
  assert.deepEqual(built.rowSegIdx, [null, null, null]);
  assert.equal(built.mappedRows, 0);
});

test("timingLooksDegenerate: ЖИВОЙ отпечаток владельца — o === индекс сегмента − 1", () => {
  // Замер карточки 864f3aa2 (kapture, 2026-07-30): 1651 строка, 1074 сегмента, 1070 записей,
  // и у ВСЕХ o = segIdx − 1 (премиумный `segment_index` 1-based). Отпечаток «o === segIdx»
  // такую карточку не ловил — то есть карантин K1 проходил мимо той самой карточки.
  const segs = degSegs(1074, 6.5);
  const entries = segs.filter((s) => s.i >= 1).map((s) => ({ o: s.i - 1, t: s.start }));
  assert.equal(entries.length, 1073);
  assert.equal(A.timingLooksDegenerate({ v: 1, unit: "row", entries }, segs, 1651), true);
  // «плавающий» сдвиг локстепом не является — это честная 1:N-таблица
  const mixed = entries.slice(0, 500).concat(entries.slice(500).map((e) => ({ o: e.o + 3, t: e.t })));
  assert.equal(A.timingLooksDegenerate({ entries: mixed }, segs, 1651), false);
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

// ══════════════════════════════════════════════════════════════════════════════════════════
// S12.6 — ПЛОТНОСТЬ РЕЧИ ОКНА ПРОТИВ ЛОЖНОЙ ДЫРЫ (runSpeechDensity / classifyGap /
// classifyCoverageGaps). Живая приёмка владельца 2026-07-29 (тикет
// STUDIO_INGEST_S12_6_FALSE_GAP_COMPRESSED_MARKS_2026_07_30): окно выдало ПОЛНЫЙ текст своих
// 15 минут, но разметило только первые 9.3 — findCoverageGaps объявил сжатие меток дырой,
// сводка потребовала подтвердить несуществующую потерю, добор был оплачен впустую (R16).
// Независимый от меток сигнал — ОБЪЁМ ТЕКСТА окна против базовой плотности прогона.
// ══════════════════════════════════════════════════════════════════════════════════════════

// Окно фикстуры: wordCount УНИКАЛЬНЫХ слов, разложенных по меткам marks (метка = сегмент).
// Слово вида «מ<prefix>ד<n>» — только буквы и цифры, поэтому stitchNormalizeWords видит РОВНО
// один токен (подчёркивание/дефис разорвали бы его на два и сломали всю арифметику объёма).
function densWindow(prefix, wordCount, marks) {
  const segs = [];
  let w = 0;
  for (let i = 0; i < marks.length; i++) {
    const n = Math.floor((wordCount * (i + 1)) / marks.length) - w;
    const words = [];
    for (let j = 0; j < n; j++) words.push("מ" + prefix + "ד" + (w + j));
    w += n;
    segs.push({ start: marks[i], text: words.join(" ") });
  }
  return segs;
}
function evenMarks(from, to, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(count === 1 ? from : Math.round(from + ((to - from) * i) / (count - 1)));
  return out;
}

test("(S12.6) константы: порог объёма 0.85, пол базы 0.5 сл/с, минимум окна для базы 300с", () => {
  assert.equal(A.DENSITY_TEXT_PRESENT_RATIO, 0.85);
  assert.equal(A.DENSITY_MIN_BASELINE_WPS, 0.5);
  assert.equal(A.DENSITY_BASELINE_MIN_WINDOW_SEC, 300);
});

// База — МЕДИАНА, а не среднее: одно аномальное окно (ровно тот случай, ради которого пишется
// детектор) не имеет права двигать норму прогона. Среднее здесь ушло бы в 2.15 сл/с, и тогда все
// честные окна оказались бы «недодавшими объём» — детектор начал бы врать в другую сторону.
test("(S12.6) runSpeechDensity: база устойчива к одному аномальному окну (медиана, не среднее)", () => {
  const wins = [], per = [];
  const words = [1150, 1160, 1170, 1180, 5000];
  for (let i = 0; i < words.length; i++) {
    wins.push({ startSec: i * 900, endSec: (i + 1) * 900 });
    per.push(densWindow("м" + i, words[i], evenMarks(i * 900 + 5, (i + 1) * 900 - 5, 100)));
  }
  const d = A.runSpeechDensity(per, wins);
  assert.equal(d.baselineWindows, 5);
  assert.ok(Math.abs(d.baselineWordsPerSec - 1170 / 900) < 1e-9, "base=" + d.baselineWordsPerSec);
  const mean = words.reduce((a, b) => a + b, 0) / words.length / 900;
  assert.ok(mean > 2.1 && d.baselineWordsPerSec < 1.4, "среднее ушло бы в " + mean);
  assert.equal(d.usable, true);
  assert.equal(d.windows[0].words, 1150);
  assert.equal(d.windows[4].segments, 100);
});

// Живая форма владельца целиком: 8 окон 117-минутного файла, окно 5 (индекс 4) — 1218 слов на
// 51 сегменте с ОДНИМ разрывом меток 4139→4469; соседи 1093–1354 слова. Ожидание: ровно один
// вердикт «marks-unreliable» и НИ ОДНОЙ потери.
const OWNER_DUR = 7017;                       // 117 мин
const OWNER_WORDS = [1152, 1200, 1093, 1250, 1218, 1354, 1200, 950];
function ownerRun() {
  const wins = A.asrWindows(OWNER_DUR);
  const marks = [
    evenMarks(2, 896, 150),
    evenMarks(900, 1796, 120),
    evenMarks(1800, 2696, 120),
    evenMarks(2700, 3596, 120),
    evenMarks(3600, 4139, 49).concat([4469, 4497]),   // 51 сегмент: метки сжаты в первые 9 минут
    evenMarks(4500, 5396, 120),
    evenMarks(5400, 6296, 120),
    evenMarks(6300, 7010, 90),
  ];
  const per = marks.map((m, i) => densWindow("ו" + i, OWNER_WORDS[i], m));
  return { wins: wins, per: per, merged: A.mergeWindowSegments(per) };
}

test("(S12.6) живая форма владельца: 8 окон, окно 5 сжало метки → ровно один marks-unreliable, ноль потерь", () => {
  const run = ownerRun();
  assert.equal(run.wins.length, 8);
  // (1) прежний детектор видит здесь ДЫРУ — это и есть дефект, который чинится
  assert.deepEqual(A.findCoverageGaps(run.merged, OWNER_DUR), [{ fromSec: 4139, toSec: 4469 }]);
  // (2) объём окна 5 — норма прогона, а не провал: 1218 слов при базе ≈1.29 сл/с
  const d = A.runSpeechDensity(run.per, run.wins);
  assert.deepEqual(d.windows.map((w) => w.words), OWNER_WORDS);
  assert.equal(d.windows[4].segments, 51);
  assert.equal(d.baselineWindows, 7);          // окно со сжатыми метками из базы исключено
  assert.ok(Math.abs(d.baselineWordsPerSec - 1.29) < 0.02, "base=" + d.baselineWordsPerSec);
  assert.ok(d.windows[4].densityRatio > 0.95 && d.windows[4].densityRatio < 1.1,
            "ratio=" + d.windows[4].densityRatio);
  assert.equal(d.windows[4].internalGap, true);
  // (3) вердикт: текст на месте, недостоверны метки
  const c = A.classifyCoverageGaps(run.merged, OWNER_DUR, run.per, run.wins);
  assert.deepEqual(c.gaps, []);
  assert.equal(c.unreliableMarkRanges.length, 1);
  assert.equal(c.unreliableMarkRanges[0].fromSec, 4139);
  assert.equal(c.unreliableMarkRanges[0].toSec, 4469);
  assert.equal(c.unreliableMarkRanges[0].windowIdx, 4);
  assert.ok(c.unreliableMarkRanges[0].densityRatio >= 0.95);
});

test("(S12.6) окно, оборвавшее вывод (мало текста), остаётся ЧЕСТНОЙ потерей", () => {
  const wins = [{ startSec: 0, endSec: 900 }, { startSec: 870, endSec: 1800 }];
  const w0 = densWindow("а", 1152, evenMarks(2, 896, 150));
  const w1 = densWindow("б", 300, evenMarks(900, 1200, 40));   // 0.32 сл/с — треть нормы
  const merged = A.mergeWindowSegments([w0, w1]);
  const c = A.classifyCoverageGaps(merged, 1800, [w0, w1], wins);
  assert.deepEqual(c.gaps, [{ fromSec: 1200, toSec: 1800 }]);  // хвостовая дыра честная
  assert.deepEqual(c.unreliableMarkRanges, []);
  const v = A.classifyGap({ fromSec: 1200, toSec: 1800 }, c.density);
  assert.equal(v.verdict, "lost");
  assert.equal(v.windowIdx, 1);
  assert.ok(v.densityRatio < A.DENSITY_TEXT_PRESENT_RATIO, "ratio=" + v.densityRatio);
});

// Разрыв НА ГРАНИЦЕ двух окон не лежит целиком ни в одном: объём окна — утверждение про окно
// ЦЕЛИКОМ, и распространять его на речь, за которую окно не отвечало, нельзя. Именно так
// выглядит НАСТОЯЩАЯ потеря на стыке (оборванный хвост одного окна + поздний старт другого),
// поэтому вердикт консервативный, даже когда ОБА окна выдали полный объём.
test("(S12.6) разрыв на границе двух окон → консервативно lost, даже если оба окна полнообъёмны", () => {
  const wins = [{ startSec: 0, endSec: 900 }, { startSec: 870, endSec: 1800 }];
  const w0 = densWindow("а", 1152, evenMarks(2, 800, 150));
  const w1 = densWindow("б", 1200, evenMarks(1000, 1790, 120));
  const merged = A.mergeWindowSegments([w0, w1]);
  const c = A.classifyCoverageGaps(merged, 1800, [w0, w1], wins);
  assert.deepEqual(c.gaps, [{ fromSec: 800, toSec: 1000 }]);   // 200с через шов — потеря
  assert.deepEqual(c.unreliableMarkRanges, []);
  const d = c.density;
  assert.ok(d.windows[0].densityRatio > 0.9 && d.windows[1].densityRatio > 0.9); // оба окна «полны»
});

// АНТИ-ЦИРКУЛЯРНОСТЬ (independent-oracle, R11) — несущее свойство, а не деталь реализации.
// Окно с разрывом — ПОДСУДИМЫЙ, и в базу оно не идёт. У единственного окна прогона это значит,
// что базы нет ВООБЩЕ: пусти его в базу — медиана стала бы равна его собственной плотности,
// отношение вышло бы 1.0 ПО ПОСТРОЕНИЮ, и ЛЮБОЙ разрыв (включая обрыв вывода на середине файла)
// объявлялся бы «текст на месте». Мутация «считать базу по всем окнам» валится здесь.
test("(S12.6) единственное окно не может доказать само себя: базы нет → разрыв остаётся дырой", () => {
  const wins = [{ startSec: 0, endSec: 900 }];
  const w0 = densWindow("а", 1150, evenMarks(2, 400, 100).concat([700, 780, 860]));
  const merged = A.mergeWindowSegments([w0]);
  assert.deepEqual(A.findCoverageGaps(merged, 900), [{ fromSec: 400, toSec: 700 }]); // 300с
  const c = A.classifyCoverageGaps(merged, 900, [w0], wins);
  assert.equal(c.density.baselineWindows, 0);
  assert.equal(c.density.baselineWordsPerSec, null);
  assert.equal(c.density.usable, false);
  assert.deepEqual(c.gaps, [{ fromSec: 400, toSec: 700 }]);
  assert.deepEqual(c.unreliableMarkRanges, []);
  // достаточно ОДНОГО независимого окна рядом — и то же самое сжатие меток уже доказуемо
  const wins2 = wins.concat([{ startSec: 870, endSec: 1800 }]);
  const w1 = densWindow("б", 1190, evenMarks(900, 1790, 120));
  const c2 = A.classifyCoverageGaps(A.mergeWindowSegments([w0, w1]), 1800, [w0, w1], wins2);
  assert.equal(c2.density.baselineWindows, 1);
  assert.deepEqual(c2.gaps, []);
  assert.equal(c2.unreliableMarkRanges.length, 1);
  assert.equal(c2.unreliableMarkRanges[0].windowIdx, 0);
});

// R11: «объём — доказательство» только там, где есть что мерить. Пустые окна, окна без меток,
// нулевая длительность и разреженный материал не дают базы — вердикт остаётся «потеря».
test("(S12.6) граничные: нет слов / нет меток / нет окон / разреженная речь → суждение НЕ выносится", () => {
  const empty = A.runSpeechDensity([], []);
  assert.equal(empty.baselineWordsPerSec, null);
  assert.equal(empty.usable, false);
  assert.deepEqual(empty.windows, []);
  assert.equal(A.classifyGap({ fromSec: 10, toSec: 200 }, empty).verdict, "lost");

  // окна есть, слов нет
  const noWords = A.runSpeechDensity([[], []], [{ startSec: 0, endSec: 900 }, { startSec: 870, endSec: 1800 }]);
  assert.equal(noWords.baselineWordsPerSec, null);
  assert.equal(noWords.usable, false);
  assert.equal(noWords.windows[0].words, 0);
  assert.equal(noWords.windows[0].markFromSec, null);

  // текст есть, меток нет вовсе — объём считается, разрывов по построению нет
  const noMarks = A.runSpeechDensity([densWindow("а", 1000, evenMarks(0, 0, 40)).map((s) => ({ start: null, text: s.text }))],
                                     [{ startSec: 0, endSec: 900 }]);
  assert.equal(noMarks.windows[0].words, 1000);
  assert.equal(noMarks.windows[0].maxMarkHopSec, 0);
  assert.equal(noMarks.usable, true);

  // разреженная речь (0.1 сл/с): база ниже пола доверия → разрыв остаётся честной дырой
  const sparse = [densWindow("а", 90, evenMarks(5, 300, 30)), densWindow("б", 90, evenMarks(1000, 1700, 30))];
  const wins = [{ startSec: 0, endSec: 900 }, { startSec: 870, endSec: 1800 }];
  const c = A.classifyCoverageGaps(A.mergeWindowSegments(sparse), 1800, sparse, wins);
  assert.equal(c.density.usable, false);
  assert.equal(c.unreliableMarkRanges.length, 0);
  assert.ok(c.gaps.length > 0);

  // мусорный разрыв не проходит в «текст на месте» (R11: вердикт надо доказать)
  const run = ownerRun();
  const good = A.runSpeechDensity(run.per, run.wins);
  assert.equal(A.classifyGap(null, good).verdict, "lost");
  assert.equal(A.classifyGap({ fromSec: "4139", toSec: 4469 }, good).verdict, "lost");
  assert.equal(A.classifyGap({ fromSec: 0, toSec: 7017 }, good).verdict, "lost"); // шире любого окна
});

test("(S12.6) findCoverageGaps не тронут: контракт прежний (обёртка — отдельная функция)", () => {
  const segs = [{ start: 200, text: "а" }, { start: 500, text: "б" }];
  assert.deepEqual(A.findCoverageGaps(segs, 1000), [{ fromSec: 200, toSec: 500 }, { fromSec: 500, toSec: 1000 }]);
  assert.equal(typeof A.classifyCoverageGaps, "function");
  // без данных об окнах обёртка возвращает РОВНО те же дыры (нечем доказывать «текст на месте»)
  assert.deepEqual(A.classifyCoverageGaps(segs, 1000).gaps, A.findCoverageGaps(segs, 1000));
});

// СВОДКА: два разных факта — «текста нет» и «тайминг ненадёжен». Один и тот же диапазон в разной
// роли обязан давать разный вердикт: потеря 11% требует подтверждения владельца (bad), сжатые
// метки — нет (warn), потому что терять нечего.
test("(S12.6) summarizeAsrRun: ненадёжный тайминг не поднимает lostPct и не даёт bad; та же дыра как потеря — даёт", () => {
  const base = { durationSec: 7017, windows: new Array(8).fill({ startSec: 0, endSec: 900, retries: 0 }),
                 coverageGaps: [], healedGaps: [], rejectedRanges: [], warnings: [] };
  const range = { fromSec: 3000, toSec: 3800, windowIdx: 3, densityRatio: 1.02 };
  const unrel = A.summarizeAsrRun(Object.assign({}, base, { unreliableMarkRanges: [range] }));
  assert.equal(unrel.lostSec, 0);
  assert.equal(unrel.lostPct, 0);
  assert.equal(unrel.coveredSec, 7017);            // текст на месте — покрытие полное
  assert.equal(unrel.unreliable, 1);
  assert.deepEqual(unrel.unreliableRanges, [{ fromSec: 3000, toSec: 3800 }]);
  assert.equal(unrel.unreliableSec, 800);
  assert.equal(unrel.level, "warn");               // видно, но подтверждения НЕ требует

  const lost = A.summarizeAsrRun(Object.assign({}, base, { coverageGaps: [{ fromSec: 3000, toSec: 3800 }] }));
  assert.equal(lost.lostSec, 800);
  assert.ok(lost.lostPct > A.SUMMARY_WARN_PCT, "lostPct=" + lost.lostPct);
  assert.equal(lost.level, "bad");                 // потеря >5% — подтверждение владельца
  assert.equal(lost.unreliable, 0);
  assert.deepEqual(lost.unreliableRanges, []);

  // чистый прогон остаётся «ok», а мусорные/пустые диапазоны в счёт не идут
  const ok = A.summarizeAsrRun(Object.assign({}, base, { unreliableMarkRanges: [] }));
  assert.equal(ok.level, "ok");
  assert.equal(ok.unreliable, 0);
  const junk = A.summarizeAsrRun(Object.assign({}, base, {
    unreliableMarkRanges: [{ fromSec: 500, toSec: 500 }, { fromSec: null, toSec: 900 }, { fromSec: 900, toSec: 100 }] }));
  assert.equal(junk.unreliable, 0);
  assert.equal(junk.level, "ok");
  // стыкующиеся диапазоны сливаются (показывать два вместо одного значит врать об их числе)
  const merged = A.summarizeAsrRun(Object.assign({}, base, {
    unreliableMarkRanges: [{ fromSec: 100, toSec: 400 }, { fromSec: 400, toSec: 900 }] }));
  assert.deepEqual(merged.unreliableRanges, [{ fromSec: 100, toSec: 900 }]);
  assert.equal(merged.unreliableSec, 800);
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// S12.6 R11 — ОПАСНАЯ СТОРОНА ДЕТЕКТОРА: «текст на месте» НЕ ИМЕЕТ ПРАВА ЗАМАСКИРОВАТЬ
// РЕАЛЬНУЮ ПОТЕРЮ. Адверсариальный ревью 2026-07-30 (мутационный прогон + сценарии H1):
// одного порога объёма 0.85 НЕДОСТАТОЧНО. Окно 930с, потерявшее в середине 95–180с речи,
// выдаёт объём 0.85–0.90 от базы — выше порога, — и прежняя версия classifyGap объявляла эту
// РЕАЛЬНУЮ дыру «ненадёжными метками»: добор не вызывался, потеря не попадала ни в lostPct,
// ни в подтверждение владельца, а сводка сообщала «текст на месте». До 15% каждого окна
// (≈2.3 мин из 15) уходило молча — ровно тот класс, ради которого писался весь S12.5.
// Лечится вторым условием — ГИПОТЕЗОЙ ПОТЕРИ: если бы разрыв был настоящей потерей, окно
// выдало бы (windowSec − gapSec)/windowSec ожидаемого объёма. «Метки сжаты» доказано только
// тогда, когда фактический объём ПРЕВОСХОДИТ эту гипотезу с запасом (DENSITY_GAP_VOLUME_MARGIN).
// ══════════════════════════════════════════════════════════════════════════════════════════

// Прогон живой формы владельца, где окно 5 (индекс 4, [3570,4500] = 930с) — ПОДСУДИМОЕ, а
// остальные семь честные и задают базу 1.29 сл/с (метки в неперекрывающихся полосах 900*i).
const DENS_BASE_WPS = 1.29;
function suspectRun(suspectSegs) {
  const wins = A.asrWindows(OWNER_DUR);
  const per = wins.map((w, i) => (i === 4 ? suspectSegs
    : densWindow("ч" + i, Math.round(DENS_BASE_WPS * (w.endSec - w.startSec)),
                 evenMarks(900 * i + 2, Math.min(900 * i + 896, 7010), 120))));
  return A.classifyCoverageGaps(A.mergeWindowSegments(per), OWNER_DUR, per, wins);
}
// Окно, РЕАЛЬНО потерявшее lostSec секунд речи в середине: объём падает пропорционально
// потере (×natural — естественная многословность окна), метки честно показывают дыру.
function lostMiddleWindow(lostSec, natural) {
  const words = Math.round(DENS_BASE_WPS * (930 - lostSec) * (natural || 1));
  const from = 3600 + Math.round((930 - lostSec) / 2), to = from + lostSec;
  return densWindow("п", words, evenMarks(3600, from, 60).concat(evenMarks(to, 4497, 60)));
}
// Окно с ЗАДАННЫМ объёмом (доля от базы) и разрывом gapSec — для двусторонней проверки порога.
function volumeWindow(ratio, gapSec) {
  const words = Math.round(DENS_BASE_WPS * 930 * ratio);
  const from = 3600 + Math.round((930 - gapSec) / 2), to = from + gapSec;
  return densWindow("б", words, evenMarks(3600, from, 60).concat(evenMarks(to, 4497, 60)));
}

test("(S12.6-R11) реальная потеря середины окна НЕ маскируется «ненадёжными метками»", () => {
  // Объём каждого из этих окон ВЫШЕ порога 0.85 — и всё же речь потеряна: гипотеза потери
  // объясняет наблюдаемый объём не хуже «сжатых меток», значит доказательства нет.
  for (const [lostSec, natural] of [[95, 1], [110, 1], [120, 1], [135, 1], [139, 1],
                                    [139, 1.02], [150, 1.05], [180, 1.12]]) {
    const c = suspectRun(lostMiddleWindow(lostSec, natural));
    const ratio = c.density.windows[4].densityRatio;
    assert.ok(ratio >= A.DENSITY_TEXT_PRESENT_RATIO,
      "фикстура обязана быть выше порога объёма, иначе тест ничего не пинит: " + ratio);
    assert.equal(c.unreliableMarkRanges.length, 0,
      "потеря " + lostSec + "с (объём ×" + ratio.toFixed(3) + ") выдана за сжатые метки");
    assert.equal(c.gaps.length, 1, "потеря " + lostSec + "с обязана остаться дырой (добор, потеря в сводке)");
    assert.equal(c.gaps[0].toSec - c.gaps[0].fromSec, lostSec);
  }
  // КОНТРОЛЬ той же формы: объём ПОЛНЫЙ (речь на месте), разрыв 330с — это сжатые метки.
  const ok = suspectRun(densWindow("ж", 1218, evenMarks(3600, 4139, 49).concat([4469, 4497])));
  assert.deepEqual(ok.gaps, []);
  assert.equal(ok.unreliableMarkRanges.length, 1);
});

test("(S12.6-R11) порог объёма 0.85 пинится ПОВЕДЕНИЕМ: 0.88 → метки, 0.82 → потеря", () => {
  // Один и тот же разрыв 330с; отличается только объём окна. Оба случая проходят гипотезу
  // потери (0.645 + запас), поэтому решает именно порог «объём на месте».
  const rich = suspectRun(volumeWindow(0.88, 330));
  assert.equal(rich.unreliableMarkRanges.length, 1, "объём 0.88 — текст на месте");
  assert.deepEqual(rich.gaps, []);
  const poor = suspectRun(volumeWindow(0.82, 330));
  assert.equal(poor.unreliableMarkRanges.length, 0, "объём 0.82 — окно недодало текст, это потеря");
  assert.equal(poor.gaps.length, 1);
});

test("(S12.6-R11) classifyGap отдаёт требуемый порог провенансом (R9): почему решено так", () => {
  const c = suspectRun(lostMiddleWindow(120, 1));
  const v = A.classifyGap(c.gaps[0], c.density);
  assert.equal(v.verdict, "lost");
  assert.equal(v.windowIdx, 4);
  // требование = гипотеза потери (930−120)/930 = 0.871 + запас
  assert.ok(Math.abs(v.requiredRatio - (0.871 + A.DENSITY_GAP_VOLUME_MARGIN)) < 0.01,
            "requiredRatio=" + v.requiredRatio);
  assert.ok(v.densityRatio < v.requiredRatio);
  assert.equal(typeof A.DENSITY_GAP_VOLUME_MARGIN, "number");
});

// Ветка «судим по САМОМУ БЕДНОМУ из окон, целиком содержащих разрыв» недостижима на боевой
// геометрии asrWindows (окна перекрываются на 30с, а разрыв по определению длиннее 90с и в
// перекрытие не влезает) — она защитная, на случай смены нарезки. Пиним её напрямую: сменить
// «бедное» на «богатое» значит разрешить одному окну оправдать чужую потерю.
test("(S12.6-R11) два окна содержат разрыв целиком → решает БЕДНОЕ, а не богатое", () => {
  const wins = [{ startSec: 0, endSec: 900 }, { startSec: 3570, endSec: 4500 }, { startSec: 3570, endSec: 4500 }];
  const marks = evenMarks(3600, 3900, 30).concat(evenMarks(4230, 4497, 30)); // разрыв 330с
  const w0 = densWindow("а", 1161, evenMarks(2, 896, 120));                  // база 1.29 сл/с
  const rich = densWindow("б", 1200, marks);                                 // объём ×1.00
  const poor = densWindow("в", 720, marks);                                  // объём ×0.60
  const d = A.runSpeechDensity([w0, rich, poor], wins);
  assert.equal(d.baselineWindows, 1);
  assert.ok(Math.abs(d.windows[1].densityRatio - 1) < 0.02 && d.windows[2].densityRatio < 0.65);
  const v = A.classifyGap({ fromSec: 3900, toSec: 4230 }, d);
  assert.equal(v.verdict, "lost");
  assert.equal(v.windowIdx, 2, "судить обязано БЕДНОЕ окно");
  // контроль: когда полнообъёмны ОБА, тот же разрыв — сжатые метки
  const d2 = A.runSpeechDensity([w0, rich, densWindow("г", 1190, marks)], wins);
  assert.equal(A.classifyGap({ fromSec: 3900, toSec: 4230 }, d2).verdict, "marks-unreliable");
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// S12.7 — СЖАТЫЕ ЧАСЫ ЧАНКА (classifyClockCompression). Живая приёмка владельца 2026-07-30,
// карточка «Заложница Миа. Интервью» (docs/research/studio-karaoke-clock-drift/2026-07-30):
// чанк 870–1800 выдал ПОЛНЫЙ текст своих 15 минут, но разметил их 660 секундами меток —
// модель перестала читать позицию в звуке и начала штамповать почти постоянный шаг. Караоке
// уехало до 4 мин 17 с на 57% таблицы, при этом timingDropReason был пуст: подсветка уверенно
// показывала не ту строку.
//
// Почему это ОТДЕЛЬНЫЙ детектор, а не ветка S12.6: classifyGap судит НАЙДЕННЫЙ разрыв
// (hop > 90с либо хвост ≥180с). Сжатие на 15% в 15-минутном окне разрыва не даёт ВОВСЕ —
// тайминг уезжает на две минуты, и ни один гейт не произносит ни слова. Здесь судится сам
// РАЗМАХ МЕТОК против объёма текста, поэтому разрыв не нужен.
//
// Правило: ожидаемая доля окна, занятая речью, — это его ОБЪЁМ ТЕКСТА (densityRatio, обрезанный
// единицей: покрытие физически не может превысить 100% окна). Метки, покрывающие ЗАМЕТНО меньше
// этой доли, — сжатые часы. Замер живого прогона: сломанный чанк 0.71 покрытия при 0.99 объёма;
// здоровые — 0.90–0.99 при том же объёме (5 живых прогонов, FINDINGS.md §5).

test("(S12.7) константы: запас 0.15, минимум 8 сегментов и 120с окна", () => {
  assert.equal(A.CLOCK_SPAN_MARGIN, 0.15);
  assert.equal(A.CLOCK_MIN_SEGMENTS, 8);
  assert.equal(A.CLOCK_MIN_WINDOW_SEC, 120);
});

test("(S12.7) живая форма владельца: сжатый чанк найден, здоровый — нет", () => {
  const wins = [{ startSec: 0, endSec: 900 }, { startSec: 870, endSec: 1800 }];
  const per = [
    densWindow("а", 1280, evenMarks(0, 888, 76)),      // метки покрывают всё окно
    densWindow("б", 1290, evenMarks(869, 1529, 138)),  // тот же объём текста, метки — 71% окна
  ];
  const d = A.runSpeechDensity(per, wins);
  const out = A.classifyClockCompression(d);
  assert.equal(out.length, 1, JSON.stringify(out));
  assert.equal(out[0].windowIdx, 1);
  assert.ok(Math.abs(out[0].coverageRatio - 0.71) < 0.01, "coverage=" + out[0].coverageRatio);
  assert.ok(out[0].expectedRatio > 0.95, "expected=" + out[0].expectedRatio);
  // R9: вердикт обязан нести числа, по которым он вынесен, и диапазон, который пострадал
  // Пострадал ВЕСЬ чанк, а не участок от первой метки: часы сжаты внутри него целиком.
  assert.equal(out[0].fromSec, 870);
  assert.equal(out[0].toSec, 1800);
});

// САМАЯ ОПАСНАЯ СТОРОНА ДЕТЕКТОРА (R11). Окно, которое ЧЕСТНО молчит вторую треть, тоже
// покрывает метками лишь 71% — и если сравнивать покрытие с единицей, а не с объёмом текста,
// оно будет оболгано: караоке выключится там, где оно верное. Ровно этот случай и разводит
// сравнение с densityRatio.
test("(S12.7-R11) окно с настоящей тишиной в хвосте НЕ объявляется сжатым", () => {
  const wins = [{ startSec: 0, endSec: 900 }, { startSec: 870, endSec: 1800 }];
  const per = [
    densWindow("а", 1280, evenMarks(0, 888, 76)),
    densWindow("б", 915, evenMarks(869, 1529, 100)),   // объём ×0.71 — речи и правда меньше
  ];
  const out = A.classifyClockCompression(A.runSpeechDensity(per, wins));
  assert.deepEqual(out, [], JSON.stringify(out));
});

// Зеркальная ловушка: окно РЕЧИСТЕЕ базы (densityRatio > 1) при полном покрытии. Без обрезки
// ожидания единицей diff = 1.18 − 0.99 = 0.19 ≥ запаса, и здоровое окно объявлялось бы сжатым.
test("(S12.7-R11) окно речистее базы при полном покрытии НЕ объявляется сжатым", () => {
  const wins = [{ startSec: 0, endSec: 900 }, { startSec: 870, endSec: 1800 }, { startSec: 1770, endSec: 2700 }];
  const per = [
    densWindow("а", 1600, evenMarks(2, 890, 76)),      // ×1.25 к базе, покрытие полное
    densWindow("б", 1290, evenMarks(869, 1790, 100)),
    densWindow("в", 1280, evenMarks(1771, 2690, 100)),
  ];
  const out = A.classifyClockCompression(A.runSpeechDensity(per, wins));
  assert.deepEqual(out, [], JSON.stringify(out));
});

test("(S12.7) без базы прогона вердикт НЕ выносится (молчим, а не обвиняем)", () => {
  const one = A.runSpeechDensity([densWindow("а", 1280, evenMarks(0, 640, 76))], [{ startSec: 0, endSec: 900 }]);
  assert.equal(one.usable, true, "база из одного окна формально есть");
  // …но она равна плотности самого подсудимого ⇒ densityRatio ровно 1.0 ПО ПОСТРОЕНИЮ, и
  // сравнивать покрытие не с чем: отношение не несёт информации об этом окне.
  const out = A.classifyClockCompression(one);
  assert.deepEqual(out, [], "единственное окно судит само себя — вердикта быть не должно");
});

test("(S12.7) короткий хвост и малочисленные метки вердикта не получают", () => {
  const wins = [{ startSec: 0, endSec: 900 }, { startSec: 870, endSec: 1800 }, { startSec: 1770, endSec: 1806 }];
  const per = [
    densWindow("а", 1280, evenMarks(0, 888, 76)),
    densWindow("б", 1290, evenMarks(869, 1790, 138)),
    densWindow("в", 19, evenMarks(1769, 1791, 3)),     // 36с, 3 сегмента: размах ни о чём не говорит
  ];
  const out = A.classifyClockCompression(A.runSpeechDensity(per, wins));
  assert.deepEqual(out, [], JSON.stringify(out));
});

test("(S12.7) окно без меток вердикта не получает (это другой факт — их отсутствие)", () => {
  const wins = [{ startSec: 0, endSec: 900 }, { startSec: 870, endSec: 1800 }];
  const per = [
    densWindow("а", 1280, evenMarks(0, 888, 76)),
    densWindow("б", 1290, evenMarks(869, 1529, 138)).map((s) => ({ start: null, text: s.text })),
  ];
  const out = A.classifyClockCompression(A.runSpeechDensity(per, wins));
  assert.deepEqual(out, [], JSON.stringify(out));
});

// S12.7: диапазон с недоказуемым таймингом обязан быть виден В САМИХ ЗАПИСЯХ, а не только в
// паспорте. Иначе StudioMediaKaraoke, знающий лишь entries, продолжит уверенно подсвечивать
// строку по сжатым меткам — ровно то, что чинит слайс (R11).
test("(S12.7) buildRowTiming помечает записи сжатого диапазона blind", () => {
  const segs = [{ i: 0, start: 0 }, { i: 1, start: 100 }, { i: 2, start: 900 },
                { i: 3, start: 1200 }, { i: 4, start: 1810 }];
  const rowSegIdx = [0, 1, 2, 3, 4];
  const plain = A.buildRowTiming(segs, rowSegIdx);
  assert.equal(plain.entries.length, 5);
  assert.ok(plain.entries.every((e) => !e.blind), "без диапазонов blind не появляется");

  const t = A.buildRowTiming(segs, rowSegIdx, [{ fromSec: 870, toSec: 1800 }]);
  assert.deepEqual(t.entries.map((e) => !!e.blind), [false, false, true, true, false]);
  // Граница включительна с обеих сторон: сегмент, начавшийся ровно на границе окна, принадлежит
  // ему же. Запись ПОСЛЕ диапазона снова честная — тайминг следующего чанка не пострадал.
  assert.equal(t.entries[4].t, 1810);
  assert.equal(t.blindRanges.length, 1);
});

test("(S12.7) весь тайминг внутри сжатого диапазона → караоке нет вовсе", () => {
  const segs = [{ i: 0, start: 1000 }, { i: 1, start: 1100 }, { i: 2, start: 1200 }];
  const t = A.buildRowTiming(segs, [0, 1, 2], [{ fromSec: 870, toSec: 1800 }]);
  assert.equal(t, null, "две честные записи не набрались — это отказ, а не пустое караоке");
});
