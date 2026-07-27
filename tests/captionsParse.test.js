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
  const r = CP.parse("﻿1\r\n00:00:01,500 --> 00:00:02,000\r\nпервая\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nвторая\r\n");
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
  const many = ["WEBVTT", ""].concat(
    Array.from({ length: CP.MAX_SEGMENTS + 1 }, (_, k) =>
      `00:00:${String(k % 60).padStart(2, "0")}.000 --> 00:00:59.000\nx${k}\n`)).join("\n");
  assert.equal(CP.parse(many).error_code, "CAPTIONS_TOO_MANY");
});

test("segment text over MAX_SEG_TEXT is rejected honestly", () => {
  const long = "a".repeat(CP.MAX_SEG_TEXT + 1);
  const r = CP.parse(`WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n${long}\n`);
  assert.equal(r.ok, false);
  assert.equal(r.error_code, "CAPTIONS_TOO_MANY");
});

test("i is dense and zero-based (contract of ingest/segTable.js)", () => {
  const r = CP.parse("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\na\n\n00:00:03.000 --> 00:00:04.000\nb\n");
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
  const r = CP.parse(raw);
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
  const r = CP.parse(raw);
  assert.equal(r.rolling, true);
  for (const s of r.segments) {
    assert.ok(!/<|\d{2}:\d{2}/.test(s.text), "no tags or timings leak into text: " + s.text);
    assert.equal(typeof s.start, "number");
  }
  assert.deepEqual(r.segments.map((s) => s.text), ["а б в", "г д", "е ж"]);
});

test("non-rolling plain captions keep every cue (no false de-roll)", () => {
  const raw = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nодно\n\n00:00:03.000 --> 00:00:04.000\nодно\n";
  const r = CP.parse(raw); // повтор текста БЕЗ тегов и не подряд-переносом — это законные две реплики
  assert.equal(r.rolling, false);
  assert.equal(r.segments.length, 2);
});
