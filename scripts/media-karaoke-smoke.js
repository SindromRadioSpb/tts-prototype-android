#!/usr/bin/env node
// scripts/media-karaoke-smoke.js
"use strict";

const { activeSegmentRange } = require("../public/js/studio-media-karaoke.js");

function test(desc, fn) {
  try {
    fn();
    console.log("  ✓ " + desc);
  } catch (e) {
    console.error("  ✗ " + desc);
    console.error("    " + e.message);
    process.exit(1);
  }
}

function eq(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error("Expected " + JSON.stringify(b) + " but got " + JSON.stringify(a));
  }
}

console.log("MEDIA-KARAOKE smoke tests:");

const e = [{ o: 0, t: 2 }, { o: 3, t: 10 }, { o: 4, t: 20 }];

test("before first → null", () => {
  eq(activeSegmentRange(e, 6, 0), null);
});

test("first segment at t=2", () => {
  eq(activeSegmentRange(e, 6, 2), { idx: 0, rowStart: 0, rowEnd: 3 });
});

test("second segment at t=11.5", () => {
  eq(activeSegmentRange(e, 6, 11.5), { idx: 1, rowStart: 3, rowEnd: 4 });
});

test("third segment at t=999", () => {
  eq(activeSegmentRange(e, 6, 999), { idx: 2, rowStart: 4, rowEnd: 6 });
});

test("empty entries", () => {
  eq(activeSegmentRange([], 6, 5), null);
});

test("null entries", () => {
  eq(activeSegmentRange(null, 6, 5), null);
});

// S12.7 (docs/research/studio-karaoke-clock-drift/2026-07-30): чанк, чьи часы остались сжатыми
// после переспроса и дробления, помечен в записях `blind`. Внутри него мы НЕ ЗНАЕМ, где идёт
// воспроизведение, поэтому не подсвечиваем ничего — ни текущую строку, ни последнюю честную
// (последняя честная и есть тот самый «уверенно показываем не ту строку», ради которого слайс).
const blindE = [{ o: 0, t: 2 }, { o: 3, t: 10, blind: true }, { o: 4, t: 20, blind: true }, { o: 5, t: 30 }];

test("blind entry → подсветки нет вовсе", () => {
  eq(activeSegmentRange(blindE, 8, 12), null);
  eq(activeSegmentRange(blindE, 8, 25), null);
});

test("честная запись ДО слепого диапазона работает как прежде", () => {
  eq(activeSegmentRange(blindE, 8, 5), { idx: 0, rowStart: 0, rowEnd: 3 });
});

test("честная запись ПОСЛЕ слепого диапазона снова подсвечивает", () => {
  eq(activeSegmentRange(blindE, 8, 31), { idx: 3, rowStart: 5, rowEnd: 8 });
});

const { _segIdxForRow } = require("../public/js/studio-media-karaoke.js");
test("повтор строки из слепого диапазона отклоняется (-1), честной — работает", () => {
  eq(_segIdxForRow(blindE, 0), 0);
  eq(_segIdxForRow(blindE, 3), -1);
  eq(_segIdxForRow(blindE, 4), -1);
  eq(_segIdxForRow(blindE, 6), 3);
});

console.log("\nMEDIA-KARAOKE SMOKE OK");
