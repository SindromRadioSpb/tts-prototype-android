// tests/ingestRetell.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../ingest/retell.js");

test("LEVELS — ровно четыре CEFR-метки, порядок фиксирован", () => {
  assert.deepEqual(R.LEVELS, ["A1", "A2", "B1", "B2"]);
});

test("estimateSentences: считает по терминаторам и переводам строк, минимум 1", () => {
  assert.equal(R.estimateSentences("שלום. מה שלומך? טוב!"), 3);
  assert.equal(R.estimateSentences("שורה אחת\nשורה שתיים\nשורה שלוש"), 3);
  assert.equal(R.estimateSentences("בלי סוף משפט"), 1);
  assert.equal(R.estimateSentences(""), 1);
});

test("targetSentences: /3 с клампом 8..80", () => {
  assert.equal(R.targetSentences("א. ".repeat(9)), 8);     // 9/3=3 → clamp 8
  assert.equal(R.targetSentences("א. ".repeat(90)), 30);   // 90/3=30
  assert.equal(R.targetSentences("א. ".repeat(600)), 80);  // 200 → clamp 80
});

test("buildRetellPrompt: содержит метку уровня, диапазон предложений, R1-запрет, частотное ограничение и сам текст", () => {
  const p = R.buildRetellPrompt("זהו טקסט לדוגמה. עוד משפט.", "B1");
  assert.ok(p.includes("B1"), "CEFR-метка уровня");
  assert.ok(/\d+ ל-\d+ משפטים/.test(p), "числовой диапазон предложений (замер: доли не работают)");
  assert.ok(p.includes("אל תמציא מילים"), "R1-запрет выдумывать формы");
  assert.ok(p.includes("שכיח"), "частотное ограничение лексики (freq-вариант замера)");
  assert.ok(p.includes("זהו טקסט לדוגמה"), "исходный текст в конце промта");
  // все 4 уровня дают разные промты
  const set = new Set(R.LEVELS.map((l) => R.buildRetellPrompt("א.", l)));
  assert.equal(set.size, 4);
});

test("validateRetellInput: пустой текст / кривой уровень / перебор длины", () => {
  assert.deepEqual(R.validateRetellInput({ text: "שלום.", level: "B1" }), { ok: true });
  assert.equal(R.validateRetellInput({ text: "", level: "B1" }).error_code, "RETELL_EMPTY");
  assert.equal(R.validateRetellInput({ text: "  ", level: "B1" }).error_code, "RETELL_EMPTY");
  assert.equal(R.validateRetellInput({ text: "שלום.", level: "C2" }).error_code, "BAD_LEVEL");
  assert.equal(R.validateRetellInput({ text: "שלום.", level: "C2" }).status, 400);
  const long = "א".repeat(R.MAX_RETELL_INPUT_CHARS + 1);
  assert.equal(R.validateRetellInput({ text: long, level: "A2" }).error_code, "RETELL_TOO_LONG");
});

test("cacheKeyInput: включает promptId, УРОВЕНЬ и трим текста (разные уровни = разные ключи)", () => {
  assert.equal(R.cacheKeyInput(" שלום ", "B1"), "retell-he-v1|B1||שלום");
  assert.notEqual(R.cacheKeyInput("שלום", "A2"), R.cacheKeyInput("שלום", "B1"));
});
