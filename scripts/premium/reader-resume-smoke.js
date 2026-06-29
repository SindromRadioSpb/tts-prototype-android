#!/usr/bin/env node
'use strict';
// smoke:reader-resume — BRR-P2-002 «Продолжить чтение» (Continue Reading).
// Guards the PURE resume helpers (reader-progress.js) — the R4 reliability invariants
// that keep resume from ever jumping to a wrong/non-existent position:
//   • resume ONLY to a real, in-range, past-start row;
//   • out-of-range (shrunk text) degrades to NO resume, never a phantom scroll;
//   • the "% прочитано" chip and topmost-visible-row math are deterministic.
const path = require('path');
const RP = require(path.resolve(__dirname, '../../public/js/reader-progress.js'));

let pass = 0, fail = 0;
function eq(got, want, msg) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) pass++;
  else { fail++; console.error(`FAIL ${msg}: got ${a} want ${b}`); }
}

for (const fn of ['resumeTarget', 'continuePercent', 'topVisibleRowIdx', 'mergeProgress', 'atTextEnd', 'lastRowVisible']) {
  if (typeof RP[fn] !== 'function') { console.error(`FAIL: reader-progress.${fn} not exported`); process.exit(1); }
}

// ── mergeProgress (BRR-P2-005 «Продолжить» disappearance fix) ────────────────
// THE FIX: a played/read row is NEVER lowered by a later top-visible=0 close-flush.
eq(RP.mergeProgress(-1, 3), 3, 'first record (no prior max)');
eq(RP.mergeProgress(3, 0), 3, 'played row 3, close at top 0 → stays 3 (THE FIX)');
eq(RP.mergeProgress(3, 5), 5, 'scroll forward advances');
eq(RP.mergeProgress(5, 2), 5, 'scroll back keeps furthest');
eq(RP.mergeProgress(5, -1), 5, 'no current → keep max');
eq(RP.mergeProgress(-1, -1), -1, 'nothing reached → -1 (close-flush writes nothing)');
eq(RP.mergeProgress(null, 4), 4, 'null prior → idx');
eq(RP.mergeProgress(2, null), 2, 'null idx → prior');
eq(RP.mergeProgress(2.0, 3.0), 3, 'integer floor');

// ── resumeTarget ────────────────────────────────────────────────────────────
// 1) Real in-range past-start position ⇒ resume to it.
eq(RP.resumeTarget({ last_row_idx: 42 }, 100), 42, 'in-range resume');
eq(RP.resumeTarget({ last_row_idx: 1 }, 2), 1, 'in-range resume (tight)');
// 2) No progress / start-of-text ⇒ no resume.
eq(RP.resumeTarget(null, 100), null, 'null progress');
eq(RP.resumeTarget(undefined, 100), null, 'undefined progress');
eq(RP.resumeTarget({ last_row_idx: 0 }, 100), null, 'start of text');
eq(RP.resumeTarget({ last_row_idx: -3 }, 100), null, 'negative idx');
eq(RP.resumeTarget({ last_row_idx: null }, 100), null, 'null idx');
// 3) Out-of-range (text shrank / re-import) ⇒ degrade to no resume (R4: no phantom jump).
eq(RP.resumeTarget({ last_row_idx: 100 }, 100), null, 'idx == rowCount (out of range)');
eq(RP.resumeTarget({ last_row_idx: 250 }, 100), null, 'idx > rowCount');
eq(RP.resumeTarget({ last_row_idx: 5 }, 0), null, 'empty text');
eq(RP.resumeTarget({ last_row_idx: 5 }, null), null, 'invalid rowCount');
// 4) Non-integer idx ⇒ no resume.
eq(RP.resumeTarget({ last_row_idx: 3.5 }, 100), null, 'fractional idx');

// ── continuePercent ─────────────────────────────────────────────────────────
eq(RP.continuePercent(0, 100), 1, 'row0/100 ≈ 1%');
eq(RP.continuePercent(49, 100), 50, 'row49/100 = 50%');
eq(RP.continuePercent(99, 100), 100, 'last row = 100%');
eq(RP.continuePercent(0, 1), 100, 'single-row text finished');
eq(RP.continuePercent(5, 0), 0, 'no rows ⇒ 0');
eq(RP.continuePercent(-1, 100), 0, 'negative ⇒ 0');

// ── atTextEnd (Epic-5 W1 «✓ Прочитано» auto-prompt trigger) ─────────────────
eq(RP.atTextEnd(99, 100), true, 'last row reached');
eq(RP.atTextEnd(100, 100), true, 'past last (defensive) ⇒ end');
eq(RP.atTextEnd(98, 100), false, 'one row short ⇒ not end');
eq(RP.atTextEnd(0, 1), true, 'single-row text ⇒ end at row 0');
eq(RP.atTextEnd(0, 100), false, 'start of long text ⇒ not end');
eq(RP.atTextEnd(-1, 100), false, 'no row reached ⇒ not end');
eq(RP.atTextEnd(5, 0), false, 'no rows ⇒ not end');
eq(RP.atTextEnd(5, null), false, 'invalid rowCount ⇒ not end');

// ── lastRowVisible (Epic-5 W1 — scroll-to-end «✓ Прочитано» trigger; the reviewer-caught fix) ──
const _endRows = [
  { idx: 0, top: -400, bottom: -320 },
  { idx: 1, top: -320, bottom: -240 },
  { idx: 2, top: 700, bottom: 790 },   // last row near the viewport bottom (viewport 844)
];
eq(RP.lastRowVisible(_endRows, 844, 4), true, 'last row bottom (790) <= viewport (844) ⇒ end reached');
eq(RP.lastRowVisible([{ idx: 0, top: 700, bottom: 980 }], 844, 4), false, 'last row bottom (980) below viewport ⇒ not yet end');
eq(RP.lastRowVisible([{ idx: 0, top: 10, bottom: 90 }], 844, 4), true, 'single-screen text fully visible ⇒ end');
eq(RP.lastRowVisible([{ idx: 0, top: 845, bottom: 848 }], 844, 4), true, 'within margin (848 <= 844+4) ⇒ end');
eq(RP.lastRowVisible([], 844, 4), false, 'no rows ⇒ not end');
eq(RP.lastRowVisible(_endRows, 0, 4), false, 'invalid viewport ⇒ not end');

// ── topVisibleRowIdx ────────────────────────────────────────────────────────
const rows = [
  { idx: 0, top: -120, bottom: -40 },   // scrolled above the bar
  { idx: 1, top: -40, bottom: 30 },     // straddles the bar (bottom below offset 20)
  { idx: 2, top: 30, bottom: 110 },
  { idx: 3, top: 110, bottom: 190 },
];
eq(RP.topVisibleRowIdx(rows, 20), 1, 'topmost row under the bar');
eq(RP.topVisibleRowIdx(rows, 0), 1, 'offset 0 → first with bottom>0');
eq(RP.topVisibleRowIdx([{ idx: 7, top: -300, bottom: -200 }], 20), 7, 'all scrolled past → last');
eq(RP.topVisibleRowIdx([], 20), null, 'no rows → null');

console.log(`smoke:reader-resume — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
