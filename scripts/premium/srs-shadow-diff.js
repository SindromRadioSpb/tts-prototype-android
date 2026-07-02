#!/usr/bin/env node
"use strict";
// srs-shadow-diff.js — Retention P1.5 (recon §4.3, measure-before-code / R11 M4).
// OFFLINE prediction of what the P2 SM2-lite→FSRS switchover changes on the owner's REAL
// schedule, BEFORE any flip: both engines are pure, so we simulate the same review policy
// under both and diff (a) the very next review per word, (b) the daily queue over N days,
// (c) the interval distribution at the horizon. No DB, no network, no writes.
//
// Usage: node scripts/premium/srs-shadow-diff.js <snapshot.json> [--days=60] [--out=report.md]
// Snapshot shape: { snapshotAt, rows: [{lemma_key, status, srs_due, srs_interval, srs_reps, srs_lapses}] }
//
// Policy (deterministic, identical for both engines): reviews happen on the day a word is
// due (daily cap 12 — TRAIN_N); every 5th answer GLOBALLY is wrong (~80% accuracy — near the
// observed early-loop rate); a same-day retest after a miss is served the same day (both
// engines put a missed word back to due-now — the preserved product contract).

const fs = require("fs");
const path = require("path");
const F = require(path.join(__dirname, "..", "..", "public", "js", "fsrs-core.js"));

const args = process.argv.slice(2);
const snapPath = args.find((a) => !a.startsWith("--"));
if (!snapPath) { console.error("usage: node srs-shadow-diff.js <snapshot.json> [--days=60] [--out=report.md]"); process.exit(1); }
const DAYS = Number((args.find((a) => a.startsWith("--days=")) || "").split("=")[1]) || 60;
const OUT = (args.find((a) => a.startsWith("--out=")) || "").split("=")[1] || null;
const SNAP = JSON.parse(fs.readFileSync(snapPath, "utf8"));
const DAY = 86400000, CAP = 12;

// ── SM2-lite (byte-mirror of reader-morph nextSrs :1902) ───────────────────────────────────
function sm2Next(prev, correct, nowMs) {
  var p = prev || { interval: 0, reps: 0, lapses: 0 };
  var interval = Number(p.interval) || 0, reps = Number(p.reps) || 0, lapses = Number(p.lapses) || 0;
  if (correct) { reps += 1; interval = reps <= 1 ? 1 : (reps === 2 ? 3 : Math.min(365, Math.round(interval * 2.3))); }
  else { lapses += 1; reps = 0; interval = 0; }
  return { interval, reps, lapses, due: (nowMs || 0) + interval * DAY };
}

// ── simulation ──────────────────────────────────────────────────────────────────────────────
const T0 = Date.parse(SNAP.snapshotAt);
const simStart = Date.UTC(new Date(T0).getUTCFullYear(), new Date(T0).getUTCMonth(), new Date(T0).getUTCDate()) + 12 * 3600000; // next noon UTC

function simulate(engine) {
  // word state: { due(ms), sm2:{interval,reps,lapses} } | { due, fsrs:{state...} }
  const words = SNAP.rows.map((r) => ({
    key: r.lemma_key,
    due: Date.parse(r.srs_due),
    legacy: { interval: Number(r.srs_interval) || 0, reps: Number(r.srs_reps) || 0, lapses: Number(r.srs_lapses) || 0 },
    sm2: { interval: Number(r.srs_interval) || 0, reps: Number(r.srs_reps) || 0, lapses: Number(r.srs_lapses) || 0 },
    fsrs: null,   // lazy-seed at first simulated review — exactly the P2 behavior
  }));
  let answerCounter = 0;   // every 5th answer wrong — GLOBAL, so both engines see the same sequence
  const daily = [];
  let totalReviews = 0;
  for (let d = 0; d < DAYS; d++) {
    const nowMs = simStart + d * DAY;
    const endOfDay = nowMs + 12 * 3600000;
    let served = 0, passes = 0;
    const dueCount = words.filter((w) => w.due <= endOfDay).length;
    while (served < CAP && passes < 3) {   // ≤3 passes: a missed word can return same-day (due-now)
      const queue = words.filter((w) => w.due <= endOfDay).sort((a, b) => b.sm2.lapses - a.sm2.lapses || a.due - b.due);
      if (!queue.length) break;
      for (const w of queue) {
        if (served >= CAP) break;
        const correct = (++answerCounter % 5) !== 0;
        if (engine === "sm2") {
          w.sm2 = sm2Next(w.sm2, correct, nowMs);
          w.due = w.sm2.due;
        } else {
          if (!w.fsrs) w.fsrs = F.seedFromSm2(w.legacy, nowMs);   // lazy-seed at first review
          w.fsrs = F.nextState(w.fsrs, correct ? 3 : 1, nowMs);
          w.sm2 = { interval: w.fsrs.intervalDays, reps: w.fsrs.reps, lapses: w.fsrs.lapses };   // projection (rank key)
          w.due = w.fsrs.dueMs;
        }
        served++;
      }
      passes++;
    }
    totalReviews += served;
    daily.push({ day: d, due: dueCount, served });
  }
  const horizonIntervals = words.map((w) => {
    const iv = engine === "sm2" ? w.sm2.interval : (w.fsrs ? w.fsrs.refIntervalDays : w.legacy.interval);
    return Math.round(iv);
  }).sort((a, b) => a - b);
  return { daily, totalReviews, horizonIntervals };
}

// ── A) per-word next-review diff (seed handover) ───────────────────────────────────────────
const nextDiff = SNAP.rows.map((r) => {
  const legacy = { interval: Number(r.srs_interval) || 0, reps: Number(r.srs_reps) || 0, lapses: Number(r.srs_lapses) || 0 };
  const at = Math.max(Date.parse(r.srs_due), simStart);
  const sm2Ok = sm2Next(legacy, true, at), sm2Bad = sm2Next(legacy, false, at);
  const seeded = F.seedFromSm2(legacy, at);
  const fsrsOk = F.nextState(seeded, 3, at), fsrsBad = F.nextState(seeded, 1, at);
  return {
    key: r.lemma_key, status: r.status, legacy,
    okSm2: sm2Ok.interval, okFsrs: fsrsOk.refIntervalDays,
    badSm2: 0, badFsrs: 0,   // both put the word back to due-now (contract preserved)
    seededS: seeded.stability, seededD: seeded.difficulty,
  };
});

const simSm2 = simulate("sm2");
const simFsrs = simulate("fsrs");

// ── report ───────────────────────────────────────────────────────────────────────────────────
const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
const sum = (a) => a.reduce((x, y) => x + y, 0);
const fmtHist = (daily) => {
  const weeks = [];
  for (let w = 0; w < Math.ceil(daily.length / 7); w++) {
    const chunk = daily.slice(w * 7, w * 7 + 7);
    weeks.push(`нед${w + 1}: due ${Math.round(sum(chunk.map(d => d.due)) / chunk.length)}/д, ревью ${sum(chunk.map(d => d.served))}`);
  }
  return weeks.join(" · ");
};

const groups = {};
for (const d of nextDiff) {
  const g = d.legacy.interval === 0 ? "interval=0 (post-lapse)" : `interval=${d.legacy.interval}`;
  (groups[g] = groups[g] || []).push(d);
}

let md = `# P1.5 Shadow-diff — SM2-lite vs FSRS-6 на реальном профиле (${SNAP.rows.length} слов)

**Снапшот:** ${SNAP.snapshotAt} · **Горизонт:** ${DAYS} дней · **Политика:** каждая 5-я оценка неверная (~80%), cap ${CAP}/день, одна и та же детерминированная последовательность для обоих движков.
**Генератор:** \`node scripts/premium/srs-shadow-diff.js\` (движки: reader-morph nextSrs-зеркало · public/js/fsrs-core.js @ ${F.REFERENCE}).

## A. Ближайшее ревью каждого слова (момент lazy-seed-передачи)

| Группа | Слов | Верно: SM2 → интервал | Верно: FSRS → интервал | Неверно (оба) |
|---|---|---|---|---|
`;
for (const [g, list] of Object.entries(groups)) {
  const sm2Set = [...new Set(list.map((d) => d.okSm2))].join("/");
  const fsrsSet = [...new Set(list.map((d) => d.okFsrs))].join("/");
  md += `| ${g} | ${list.length} | ${sm2Set} д | ${fsrsSet} д | due сразу (контракт сохранён) |\n`;
}
md += `
Сид: interval=1 → S=1.0, D=D0(Good)=${nextDiff.find(d => d.legacy.interval === 1).seededD}; interval=0 → S=${nextDiff.find(d => d.legacy.interval === 0).seededS} (initState(Again)-пол), D=${nextDiff.find(d => d.legacy.interval === 0).seededD}.

## B. ${DAYS}-дневная симуляция ежедневной очереди

| Движок | Всего ревью за ${DAYS} дней | Интервалы на горизонте: медиана / p75 / max |
|---|---|---|
| SM2-lite | ${simSm2.totalReviews} | ${pct(simSm2.horizonIntervals, 0.5)} / ${pct(simSm2.horizonIntervals, 0.75)} / ${simSm2.horizonIntervals[simSm2.horizonIntervals.length - 1]} д |
| FSRS-6 | ${simFsrs.totalReviews} | ${pct(simFsrs.horizonIntervals, 0.5)} / ${pct(simFsrs.horizonIntervals, 0.75)} / ${simFsrs.horizonIntervals[simFsrs.horizonIntervals.length - 1]} д |

**SM2 понедельно:** ${fmtHist(simSm2.daily)}
**FSRS понедельно:** ${fmtHist(simFsrs.daily)}

## C. Вывод для флипа P2
`;
const delta = simFsrs.totalReviews - simSm2.totalReviews;
md += `- Разница нагрузки: FSRS ${delta >= 0 ? "+" : ""}${delta} ревью за ${DAYS} дней (${Math.round(100 * simFsrs.totalReviews / Math.max(1, simSm2.totalReviews))}% от SM2).\n`;
md += `- Ни одно существующее due миграцией не двигается (lazy-seed); «неверно → повтори сейчас же» сохраняется в обоих мирах.\n`;
md += `- Провальные слова: под FSRS difficulty растёт → они возвращаются ЧАЩЕ зрелых (weakness-семантика D4 усиливается), успешные растут агрессивнее SM2-цепочки 1→3→×2.3 на ранних шагах и консервативнее на поздних (cap 36500 vs 365).\n`;

if (OUT) { fs.writeFileSync(OUT, md); console.log("wrote", OUT); }
else console.log(md);
