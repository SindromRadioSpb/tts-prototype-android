// tests/captionsParseSubFormats.test.js — O-098: SubViewer and MicroDVD .sub files.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const CP = require("../public/js/captions-parse.js");
const SMC = require("../public/js/subtitle-material-core.js");

// Shape of the owner's Mivtza.Savta.sub (SubViewer 2), synthetic text.
const SUBVIEWER = [
  "[INFORMATION]", "[TITLE]", "[AUTHOR] JR", "[END INFORMATION]", "[SUBTITLE]",
  "[COLF]&HFFFFFF,[STYLE]it,[SIZE]24,[FONT]Tahoma",
  "00:00:17.90,00:00:23.00", "Кто скажет, в чём разница?", "",
  "00:00:23.20,00:00:24.90", "Это млекопитающее?[br]Нет.", "",
  "00:00:25.10,00:00:27.50", "Нет, Моше.", "",
].join("\r\n");

test("SubViewer: detected, times in centiseconds, [br] is a line break, header skipped", () => {
  assert.equal(CP.detectFormat(SUBVIEWER), "subviewer");
  const r = CP.parseCues(SUBVIEWER);
  assert.equal(r.ok, true);
  assert.equal(r.format, "subviewer");
  assert.deepEqual(r.cues, [
    { start: 17.9, end: 23, text: "Кто скажет, в чём разница?" },
    { start: 23.2, end: 24.9, text: "Это млекопитающее?\nНет." },
    { start: 25.1, end: 27.5, text: "Нет, Моше." },
  ]);
  const merged = CP.parse(SUBVIEWER);
  assert.equal(merged.ok, true);
  assert.equal(merged.format, "subviewer");
  assert.equal(merged.segments[0].text, "Кто скажет, в чём разница?");
});

test("MicroDVD with a declared frame rate", () => {
  const raw = "{1}{1}25\n{250}{300}{y:i}שלום|מה נשמע?\n{325}{350}טוב.\n";
  assert.equal(CP.detectFormat(raw), "microdvd");
  const r = CP.parseCues(raw);
  assert.equal(r.ok, true);
  assert.equal(r.fps, 25);
  assert.deepEqual(r.cues, [
    { start: 10, end: 12, text: "שלום\nמה נשמע?" },
    { start: 13, end: 14, text: "טוב." },
  ]);
});

test("MicroDVD without a frame rate asks for one, and uses the one given", () => {
  const raw = "{240}{288}Hello\n{300}{336}World\n";
  const missing = CP.parseCues(raw);
  assert.equal(missing.ok, false);
  assert.equal(missing.error_code, "CAPTIONS_NEEDS_FPS");
  assert.equal(CP.parse(raw).error_code, "CAPTIONS_NEEDS_FPS");
  const r = CP.parseCues(raw, { fps: 24 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.cues.map((c) => [c.start, c.end]), [[10, 12], [12.5, 14]]);
});

test("SRT cues keep their ends and lines; visual-order repair applies per line", () => {
  const srt = "1\n00:00:01,000 --> 00:00:02,500\n.שלום\n?מה נשמע\n\n2\n00:00:03,000 --> 00:00:04,000\n.טוב\n";
  const r = CP.parseCues(srt, { normalizeCueLines: SMC.normalizeVisualPunctuation });
  assert.equal(r.visualPunctuationLines, 3);
  assert.deepEqual(r.cues, [
    { start: 1, end: 2.5, text: "שלום.\nמה נשמע?" },
    { start: 3, end: 4, text: "טוב." },
  ]);
});

test("existing VTT/SRT detection is unchanged", () => {
  assert.equal(CP.detectFormat("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi"), "vtt");
  assert.equal(CP.detectFormat("1\n00:00:01,000 --> 00:00:02,000\nhi"), "srt");
});

test("Hebrew SRT + Russian SubViewer become rows with the human translation by time", () => {
  const he = "1\n00:00:17,700 --> 00:00:22,800\n.שלום לכולם\n\n2\n00:00:23,000 --> 00:00:24,700\n?מה שלומכם\n";
  const ru = "[SUBTITLE]\n00:00:17.90,00:00:23.00\nВсем привет.\n\n00:00:23.20,00:00:24.90\nКак дела?\n";
  const h = CP.parseCues(he, { normalizeCueLines: SMC.normalizeVisualPunctuation }), r = CP.parseCues(ru);
  const alignment = SMC.alignTranslation(h.cues, r.cues);
  assert.equal(alignment.coverage, 1);
  const rows = SMC.buildRows({ textCues: h.cues, speechLanguage: SMC.speechLanguage(h.cues, { translationCues: r.cues, targetLanguage: "he" }),
    translation: alignment, translationCues: r.cues });
  const table = SMC.buildTableRows(rows, { language: "he", translationLanguage: SMC.detectScriptLanguage("Всем привет") });
  assert.deepEqual(table.map((row) => [row.he, row.ru]), [["שלום לכולם.", "Всем привет."], ["מה שלומכם?", "Как дела?"]]);
  assert.equal(JSON.parse(table[0].translation_meta_json).translation_source, "subtitle-track");
});
