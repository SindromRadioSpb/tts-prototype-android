// tests/captionsParse.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const CP = require("../public/js/captions-parse.js");

test("detectFormat: vtt / srt / panel / null", () => {
  assert.equal(CP.detectFormat("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi"), "vtt");
  assert.equal(CP.detectFormat("1\n00:00:01,000 --> 00:00:02,000\nhi"), "srt");
  assert.equal(CP.detectFormat("0:27\nGood morning."), "youtube-panel");
  assert.equal(CP.detectFormat("просто текст без таймкодов"), null);
});

test("vtt: header language, multi-line cue joined, settings ignored", () => {
  const r = CP.parse([
    "WEBVTT", "Kind: captions", "Language: iw", "",
    "00:00:00.000 --> 00:00:07.000 align:start position:0%",
    "первая", "вторая", "",
    "00:00:09.200 --> 00:00:11.206",
    "третья", "",
  ].join("\n"));
  assert.equal(r.ok, true);
  assert.equal(r.format, "vtt");
  assert.equal(r.rolling, false);
  assert.equal(r.language, "iw");
  assert.deepEqual(r.segments, [
    { i: 0, start: 0, text: "первая вторая" },
    { i: 1, start: 9.2, text: "третья" },
  ]);
});

test("vtt: whitespace-only body line is CUE TEXT, not a block separator", () => {
  // Реальная ловушка YouTube: "\n \n" внутри кью. Разделитель — только пустая строка.
  const r = CP.parse([
    "WEBVTT", "",
    "00:00:01.964 --> 00:00:07.630 align:start position:100%",
    " ",
    "[מוזיקה]", "",
  ].join("\n"));
  assert.equal(r.segments.length, 1);
  assert.equal(r.segments[0].text, "[מוזיקה]");
  assert.equal(r.segments[0].start, 1.964);
});

test("vtt: HTML entities decoded, stray tags stripped", () => {
  const r = CP.parse("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n&gt;&gt; <b>да</b> &amp; нет\n");
  assert.equal(r.segments[0].text, ">> да & нет");
});

test("srt: comma milliseconds, numeric index line, CRLF, BOM", () => {
  // merge:false — с дефолтным слиянием эти две короткие реплики без точки в конце и с паузой
  // <2с склеились бы в одну (T3B); этот тест проверяет разбор кью, а не слияние.
  const r = CP.parse("﻿1\r\n00:00:01,500 --> 00:00:02,000\r\nпервая\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nвторая\r\n", { merge: false });
  assert.equal(r.format, "srt");
  assert.deepEqual(r.segments.map((s) => s.start), [1.5, 3]);
  assert.deepEqual(r.segments.map((s) => s.text), ["первая", "вторая"]);
});

test("hours form and non-decreasing starts", () => {
  const r = CP.parse("WEBVTT\n\n01:02:03.000 --> 01:02:04.000\nx\n");
  assert.equal(r.segments[0].start, 3723);
});

// Семантика кодов (единая на весь модуль, не пересматривать в задачах 2-3):
//   CAPTIONS_EMPTY        — вход пуст ИЛИ формат распознан, но реплик ноль
//   CAPTIONS_NO_TIMESTAMPS — таймкодов нет вовсе (пользователь вставил просто текст)
//   CAPTIONS_UNPARSEABLE  — на субтитры похоже (есть "-->"), но разобрать не вышло
//   CAPTIONS_TOO_MANY     — реплик > MAX_SEGMENTS ИЛИ реплика длиннее MAX_SEG_TEXT
test("errors: empty, no timestamps, unparseable, too many", () => {
  assert.equal(CP.parse("").error_code, "CAPTIONS_EMPTY");
  assert.equal(CP.parse("   \n  \n").error_code, "CAPTIONS_EMPTY");
  assert.equal(CP.parse("просто текст").error_code, "CAPTIONS_NO_TIMESTAMPS");
  assert.equal(CP.parse("00:00:0 --> хх\nтекст").error_code, "CAPTIONS_UNPARSEABLE");
  assert.equal(CP.parse("WEBVTT\n\n\n").error_code, "CAPTIONS_EMPTY");
  // Кап применяется ТОЛЬКО на продуктовом пути (merge:true, дефолт) и ПОСЛЕ слияния (T3B) —
  // merge:false теперь сырой диагностический режим без капов. Поэтому кью здесь разнесены на 4с
  // (пауза 3с > MERGE_PAUSE_SEC=2с) — они гарантированно НЕ склеятся, и 401 кью останутся 401
  // сегментом, бив кап числом сегментов, а не числом кью-подряд-как-раньше.
  function fmtHMS(totalSec) {
    const m = Math.floor(totalSec / 60), s = totalSec % 60;
    return `00:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.000`;
  }
  const many = ["WEBVTT", ""].concat(
    Array.from({ length: CP.MAX_SEGMENTS + 1 }, (_, k) =>
      `${fmtHMS(k * 4)} --> ${fmtHMS(k * 4 + 1)}\nx${k}.\n`)).join("\n");
  assert.equal(CP.parse(many).error_code, "CAPTIONS_TOO_MANY");
});

test("segment text over MAX_SEG_TEXT is rejected honestly", () => {
  const long = "a".repeat(CP.MAX_SEG_TEXT + 1);
  const r = CP.parse(`WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n${long}\n`);
  assert.equal(r.ok, false);
  assert.equal(r.error_code, "CAPTIONS_TOO_MANY");
});

test("i is dense and zero-based (contract of ingest/segTable.js)", () => {
  // merge:false — these two short punctuation-less cues would otherwise merge into one (T3B);
  // this test targets the index contract, not merging.
  const r = CP.parse("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\na\n\n00:00:03.000 --> 00:00:04.000\nb\n", { merge: false });
  assert.deepEqual(r.segments.map((s) => s.i), [0, 1]);
});

test("caps mirror the server contract by construction", () => {
  const seg = require("../ingest/segTable.js");
  // segTable не экспортирует константы — проверяем по исходнику, чтобы расхождение падало здесь,
  // а не превращалось в загадочный 400 от сервера.
  const src = require("node:fs").readFileSync(require.resolve("../ingest/segTable.js"), "utf8");
  assert.match(src, new RegExp(`MAX_SEGMENTS\\s*=\\s*${CP.MAX_SEGMENTS}\\b`));
  assert.match(src, new RegExp(`MAX_SEG_TEXT\\s*=\\s*${CP.MAX_SEG_TEXT}\\b`));
  assert.ok(seg);
});

test("rolling auto-captions are de-rolled (real YouTube structure)", () => {
  // Структура из scripts/premium/fixtures/captions/hebrew-auto-rolling.vtt, продолжена на один
  // цикл дальше исходного brief-примера: кью с пословными тегами = НОВЫЙ текст на старте кью;
  // 10-мс кью = «доводка»; первая строка следующей кью = перенос предыдущей. isRolling() требует
  // tagged>=3 (см. реальный фикстур-файл: 129 сырых кью / 59 тегированных → ровно 65 сегментов;
  // тот же порог 3-из-3 использован во втором rolling-тесте ниже) — двух тегированных кью
  // исходного примера недостаточно, поэтому добавлен третий цикл «третья строка».
  const raw = [
    "WEBVTT", "Kind: captions", "Language: iw", "",
    "00:00:01.964 --> 00:00:07.630 align:start position:100%",
    " ", "[музыка]", "",
    "00:00:07.630 --> 00:00:07.640 align:start position:100%",
    " ", " ", "",
    "00:00:07.640 --> 00:00:10.190 align:start position:100%",
    " ", "кто<00:00:07.919><c> вы</c><00:00:08.120><c> такие?</c>", "",
    "00:00:10.190 --> 00:00:10.200 align:start position:100%",
    "кто вы такие?", " ", "",
    "00:00:10.200 --> 00:00:13.230 align:start position:100%",
    "кто вы такие?", "и<00:00:10.280><c> зачем</c><00:00:10.400><c> пришли</c>", "",
    "00:00:13.230 --> 00:00:13.240 align:start position:100%",
    "и зачем пришли", " ", "",
    "00:00:13.240 --> 00:00:16.000 align:start position:100%",
    "и зачем пришли", "третья<00:00:13.500><c> строка</c>", "",
  ].join("\n");
  // merge:false — de-rolled segments here have short gaps and no closing punctuation, so T3B's
  // merge would join them; this test targets de-rolling, not merging.
  const r = CP.parse(raw, { merge: false });
  assert.equal(r.ok, true);
  assert.equal(r.rolling, true);
  assert.equal(r.kindHint, "auto");
  assert.deepEqual(r.segments, [
    { i: 0, start: 1.964, text: "[музыка]" },
    { i: 1, start: 7.64, text: "кто вы такие?" },
    { i: 2, start: 10.2, text: "и зачем пришли" },
    { i: 3, start: 13.24, text: "третья строка" },
  ]);
});

test("rolling: word-level timings are DISCARDED, never surfaced (R11)", () => {
  const raw = "WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nа<00:00:02.000><c> б</c><00:00:03.000><c> в</c>\n\n" +
              "00:00:05.000 --> 00:00:09.000\nа б в\nг<00:00:06.000><c> д</c>\n\n" +
              "00:00:09.000 --> 00:00:12.000\nг д\nе<00:00:10.000><c> ж</c>\n";
  // merge:false — these three punctuation-less de-rolled segments would otherwise join (T3B);
  // this test targets tag-stripping/R11, not merging.
  const r = CP.parse(raw, { merge: false });
  assert.equal(r.rolling, true);
  for (const s of r.segments) {
    assert.ok(!/<|\d{2}:\d{2}/.test(s.text), "no tags or timings leak into text: " + s.text);
    assert.equal(typeof s.start, "number");
  }
  assert.deepEqual(r.segments.map((s) => s.text), ["а б в", "г д", "е ж"]);
});

test("non-rolling plain captions keep every cue (no false de-roll)", () => {
  const raw = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nодно\n\n00:00:03.000 --> 00:00:04.000\nодно\n";
  // merge:false — эти две "одно"-реплики без точки и с паузой <2с иначе склеились бы (T3B);
  // этот тест проверяет анти-де-роллинг, а не слияние.
  const r = CP.parse(raw, { merge: false }); // повтор текста БЕЗ тегов и не подряд-переносом — это законные две реплики
  assert.equal(r.rolling, false);
  assert.equal(r.segments.length, 2);
});

const fs = require("node:fs");
const path = require("node:path");
const FIX = path.join(__dirname, "..", "scripts", "premium", "fixtures", "captions");

test("panel paste: timestamp line + one text line; chapter headings dropped", () => {
  const raw = ["Introduction", "0:27", "Good morning.", "0:29", "(Audience) Good.",
               "Three themes", "0:43", "There have been three themes,"].join("\n");
  const r = CP.parse(raw);
  assert.equal(r.ok, true);
  assert.equal(r.format, "youtube-panel");
  assert.equal(r.droppedHeadings, 2); // "Introduction" (до первого таймкода) + "Three themes"
  assert.deepEqual(r.segments, [
    { i: 0, start: 27, text: "Good morning." },
    { i: 1, start: 29, text: "(Audience) Good." },
    { i: 2, start: 43, text: "There have been three themes," },
  ]);
});

test("panel paste: heading sits BETWEEN cue text and the next timestamp (real RTL fixture)", () => {
  const raw = fs.readFileSync(path.join(FIX, "youtube-panel-he.txt"), "utf8");
  // merge:false — with default merging (T3B) many of these short, punctuation-light cues join
  // and the `at41`/`at44` lookups below (which assume one segment per cue) would miss; this
  // test targets heading-stripping, not merging.
  const r = CP.parse(raw, { merge: false });
  assert.equal(r.ok, true);
  assert.equal(r.format, "youtube-panel");
  assert.ok(r.droppedHeadings >= 2, "Introduction + Three themes dropped");
  // «Three themes» стоит между текстом реплики 0:41 и таймкодом 0:44 — не должно к ней прилипнуть
  const at41 = r.segments.find((s) => s.start === 41);
  assert.ok(at41 && !/Three themes/.test(at41.text), "heading leaked into cue text");
  const at44 = r.segments.find((s) => s.start === 44);
  assert.ok(at44 && at44.text.indexOf("מבחינת העתיד") === 0);
  assert.ok(r.segments.every((s) => s.start >= 0 && typeof s.text === "string" && s.text.length));
});

test("panel paste: english fixture parses with monotonic starts", () => {
  const r = CP.parse(fs.readFileSync(path.join(FIX, "youtube-panel-en.txt"), "utf8"));
  assert.equal(r.ok, true);
  assert.equal(r.segments[0].start, 27);
  for (let k = 1; k < r.segments.length; k++) {
    assert.ok(r.segments[k].start >= r.segments[k - 1].start, "starts must be non-decreasing");
  }
});

test("panel paste: H:MM:SS timestamps", () => {
  // merge:false — these two punctuation-less cues 7s apart would otherwise merge (T3B); this
  // test targets H:MM:SS timestamp parsing, not merging.
  const r = CP.parse("1:02:03\nпоздняя реплика\n1:02:10\nследующая", { merge: false });
  assert.deepEqual(r.segments.map((s) => s.start), [3723, 3730]);
});

test("paste without timestamps is refused, not silently imported", () => {
  const r = CP.parse("Просто абзац текста\nещё один абзац");
  assert.equal(r.ok, false);
  assert.equal(r.error_code, "CAPTIONS_NO_TIMESTAMPS");
});

test("panel: timestamps present but no text lines → EMPTY, not NO_TIMESTAMPS", () => {
  assert.equal(CP.parse("0:27").error_code, "CAPTIONS_EMPTY");
  assert.equal(CP.parse("0:27\n0:29").error_code, "CAPTIONS_EMPTY");
  // а вход вообще без таймкодов по-прежнему даёт NO_TIMESTAMPS
  assert.equal(CP.parse("Просто абзац текста\nещё один абзац").error_code, "CAPTIONS_NO_TIMESTAMPS");
});

test("merge: joins cues up to mergeMaxSec, breaks on sentence end", () => {
  const raw = [
    "WEBVTT", "",
    "00:00:00.000 --> 00:00:02.000", "первая часть", "",
    "00:00:02.000 --> 00:00:04.000", "вторая часть.", "",
    "00:00:04.000 --> 00:00:06.000", "новое предложение", "",
  ].join("\n");
  const r = CP.parse(raw);
  assert.equal(r.merged, true);
  assert.equal(r.cueCount, 3);
  assert.deepEqual(r.segments, [
    { i: 0, start: 0, text: "первая часть вторая часть." },
    { i: 1, start: 4, text: "новое предложение" },
  ]);
});

test("merge: never exceeds mergeMaxSec", () => {
  const cues = [];
  for (let k = 0; k < 10; k++) {
    const s = String(k * 4).padStart(2, "0"), e = String(k * 4 + 4).padStart(2, "0");
    cues.push(`00:00:${s}.000 --> 00:00:${e}.000`, `кусок ${k}`, "");
  }
  const r = CP.parse(["WEBVTT", ""].concat(cues).join("\n"), { mergeMaxSec: 15 });
  for (let k = 1; k < r.segments.length; k++) {
    assert.ok(r.segments[k].start - r.segments[k - 1].start <= 16,
      "segment spans at most mergeMaxSec (+1 cue slack)");
  }
  assert.ok(r.segments.length >= 3 && r.segments.length < 10);
});

test("merge: a pause longer than 2s is a boundary (speaker change)", () => {
  const raw = ["WEBVTT", "",
    "00:00:00.000 --> 00:00:02.000", "до паузы", "",
    "00:00:09.000 --> 00:00:11.000", "после паузы", ""].join("\n");
  const r = CP.parse(raw);
  assert.equal(r.segments.length, 2);
});

test("merge: loses no text — concatenation is preserved", () => {
  const fs2 = require("node:fs"), path2 = require("node:path");
  const file = path2.join(__dirname, "..", "scripts", "premium", "fixtures", "captions", "ted-hebrew-manual.vtt");
  const raw = fs2.readFileSync(file, "utf8");
  const unmerged = CP.parse(raw, { merge: false });
  const merged = CP.parse(raw);
  const flat = (r) => r.segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  assert.equal(flat(merged), flat(unmerged), "merging must not drop or reorder a single character");
  assert.equal(merged.cueCount, unmerged.segments.length);
  assert.ok(merged.segments.length < unmerged.segments.length);
  assert.ok(merged.segments.length <= CP.MAX_SEGMENTS, "a 20-min talk must fit the cap after merging");
});

test("merge: segment start equals the start of its FIRST cue (no interpolation)", () => {
  const raw = ["WEBVTT", "",
    "00:00:03.500 --> 00:00:05.000", "раз", "",
    "00:00:05.000 --> 00:00:06.500", "два", ""].join("\n");
  const r = CP.parse(raw);
  assert.equal(r.segments.length, 1);
  assert.equal(r.segments[0].start, 3.5);
});

test("merge:false keeps one segment per cue (oracle-parity mode)", () => {
  const raw = ["WEBVTT", "",
    "00:00:00.000 --> 00:00:02.000", "а", "",
    "00:00:02.000 --> 00:00:04.000", "б", ""].join("\n");
  const r = CP.parse(raw, { merge: false });
  assert.equal(r.merged, false);
  assert.equal(r.segments.length, 2);
  assert.equal(r.cueCount, 2);
});
