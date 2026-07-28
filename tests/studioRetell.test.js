"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const SR = require("../public/js/studio-retell.js");
const IR = require("../ingest/retell.js");
const RM = require("../public/js/reader-morph.js");

test("LEVELS клиент/сервер совпадают ПО ПОСТРОЕНИЮ (config-string-match)", () => {
  assert.deepEqual(SR.LEVELS, IR.LEVELS);
});

test("estimateRetellCost: копейки на статье, ≤$0.05 на 100К символов; usd≥0.01 для лейбла", () => {
  const small = SR.estimateRetellCost(4000);   // статья
  const big = SR.estimateRetellCost(100000);   // потолок входа (≈48.5К ток., замер long-probe $0.027)
  assert.ok(small.usd >= 0.01 && small.usd <= 0.02, JSON.stringify(small));
  assert.ok(big.usd >= 0.02 && big.usd <= 0.05, JSON.stringify(big));
  assert.ok(big.seconds >= 20 && big.seconds <= 60);
});

test("buildRetellPassport: kind retell, snapshot = ПЕРЕСКАЗ, без audio/captions, derivedFrom собран", () => {
  const p = SR.buildRetellPassport({
    originLabel: "מאמר על חינוך", importKind: "url", importSource: "https://ex.am/a",
    savedTextId: "t-123", savedTitle: "Статья", level: "B1",
    model: "gemini-flash-latest", retellText: "משפט אחד.\nמשפט שני.",
    coverage: { before: 0.61, after: 0.84, zone: "in" },
  });
  assert.equal(p.kind, "retell");
  assert.equal(p.method, "gemini-retell");
  assert.equal(p.textSnapshot, "משפט אחד.\nמשפט שני.");   // снимок = пересказ, иначе edited врёт
  assert.equal(p.audio, undefined);                        // R11: медиа-паспорт НЕ наследуется
  assert.equal(p.captions, undefined);
  assert.equal(p.retell.v, 1);
  assert.equal(p.retell.level, "B1");
  assert.equal(p.retell.derivedFrom.textId, "t-123");
  assert.equal(p.retell.derivedFrom.importKind, "url");
  assert.equal(p.retell.coverage.after, 0.84);
  assert.ok(p.at && p.warnings.length === 0);
});

test("aggregateCoverage: токен-взвешенная доля знакомого + зона; пусто/нет знаний → null", () => {
  const cfg = { KNOWN_STATES: { known: true, l2: true }, classifyZone: (c) => (c >= 0.9 ? "easy" : c >= 0.7 ? "in" : "hard") };
  const items = [{ key: "pid:1", freq: 8 }, { key: "pid:2", freq: 1 }, { key: "שלום#noun", freq: 1 }];
  const r = SR.aggregateCoverage(items, { "pid:1": "known", "pid:2": "new" }, cfg);
  assert.equal(r.tokens, 10);
  assert.equal(r.knownTok, 8);
  assert.equal(r.pct, 0.8);
  assert.equal(r.zone, "in");
  assert.equal(SR.aggregateCoverage([], { "pid:1": "known" }, cfg), null);
  assert.equal(SR.aggregateCoverage(items, {}, cfg), null); // пустой профиль → честно нет цифры
});

test("collectTypeFreq: иврит-типы без огласовок, функциональные слова отфильтрованы functionGate", () => {
  const items = SR.collectTypeFreq("הילד אכל תפוח. הילד רץ אל הבית.", RM);
  const map = Object.fromEntries(items.map((i) => [i.surface, i.freq]));
  assert.equal(map["הילד"], 2);          // контент-слово, 2 употребления
  assert.equal(map["תפוח"], 1);
  assert.equal(map["אל"], undefined);    // предлог — functionGate isFunc → исключён
  assert.ok(items.every((i) => i.freq >= 1 && /[א-ת]/.test(i.surface)));
});

test("collectTypeFreq: пустой/неивритский текст → []", () => {
  assert.deepEqual(SR.collectTypeFreq("", RM), []);
  assert.deepEqual(SR.collectTypeFreq("hello world 123", RM), []);
});
