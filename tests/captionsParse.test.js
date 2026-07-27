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
