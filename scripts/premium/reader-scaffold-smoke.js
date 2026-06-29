#!/usr/bin/env node
'use strict';
// smoke:reader-scaffold — BRR-P1-006 Scaffolded Reading Console.
// Guards the PURE adaptive-niqqud-fade decision (reader-morph.fadeDecision) — the honest-gate
// invariants that keep the fade from ever hiding help dishonestly:
//   • only 'adaptive' mode ever fades; 'full'/'off' always keep the niqqud;
//   • fade ONLY a confidently-resolved word (label exact|likely) — never guessed/function/context/unknown;
//   • fade ONLY a real SAVED/familiar state — an UNSEEN word (state undefined) keeps its niqqud.
const path = require('path');
const RM = require(path.resolve(__dirname, '../../public/js/reader-morph.js'));

let pass = 0, fail = 0;
function eq(got, want, msg) {
  if (got === want) pass++;
  else { fail++; console.error(`FAIL ${msg}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

const fd = RM && RM.fadeDecision;
if (typeof fd !== 'function') { console.error('FAIL: reader-morph.fadeDecision not exported'); process.exit(1); }

const FAMILIAR = ['known', 'learning', 'new', 'weak', 'stale'];
const LABELS = ['exact', 'likely', 'guessed', 'function', 'context', 'unknown', undefined];

// 1) Non-adaptive modes NEVER fade — regardless of state/label.
for (const mode of ['full', 'off', '', undefined]) {
  for (const st of FAMILIAR.concat([undefined, 'bogus'])) {
    for (const lb of LABELS) eq(fd(st, lb, mode), 'niqqud', `mode=${mode} st=${st} lb=${lb}`);
  }
}

// 2) Adaptive + confident (exact|likely) + real familiar state ⇒ fade to plain.
for (const st of FAMILIAR) {
  eq(fd(st, 'exact', 'adaptive'), 'plain', `adaptive familiar(${st}) exact`);
  eq(fd(st, 'likely', 'adaptive'), 'plain', `adaptive familiar(${st}) likely`);
  // 3) Adaptive + familiar but UNCONFIDENT label ⇒ keep niqqud (honest gate, R10).
  for (const lb of ['guessed', 'function', 'context', 'unknown', undefined]) {
    eq(fd(st, lb, 'adaptive'), 'niqqud', `adaptive familiar(${st}) unconfident lb=${lb}`);
  }
}

// 4) Adaptive + UNSEEN (state undefined) confident word ⇒ keep niqqud (unseen ≠ familiar).
eq(fd(undefined, 'exact', 'adaptive'), 'niqqud', 'adaptive unseen exact');
eq(fd(undefined, 'likely', 'adaptive'), 'niqqud', 'adaptive unseen likely');
// 5) Adaptive + non-familiar state value ⇒ keep niqqud.
eq(fd('bogus', 'exact', 'adaptive'), 'niqqud', 'adaptive non-familiar state');

// ── W5 — fadeGraduationReady: OFFER adaptive fade once GENUINELY-LEARNED words reach the threshold.
// Counts known + SRS learning/weak/stale + manual l1–l4; EXCLUDES 'new' (tracked-but-unknown) and
// 'ignore' (skipped) so they never trigger the offer. The user (not the engine) flips the mode.
const fg = RM.fadeGraduationReady, MIN = RM.FADE_GRADUATION_MIN;
if (typeof fg !== 'function' || typeof MIN !== 'number') { console.error('FAIL: reader-morph.fadeGraduationReady/FADE_GRADUATION_MIN not exported'); process.exit(1); }
const mkStates = (counts) => { const m = {}; let i = 0; for (const [st, n] of Object.entries(counts)) for (let j = 0; j < n; j++) m['k' + (i++)] = st; return m; };
eq(fg(mkStates({ known: MIN })), true, `exactly MIN(${MIN}) known ⇒ ready`);
eq(fg(mkStates({ known: MIN - 1 })), false, `MIN-1 known ⇒ not ready`);
eq(fg(mkStates({ known: 10, l2: 10, learning: 10, l4: MIN - 30 })), true, `mixed genuinely-learned ≥MIN ⇒ ready`);
eq(fg(mkStates({ 'new': 1000, ignore: 1000 })), false, `new+ignore (any count) ⇒ not ready (not progress)`);
eq(fg(mkStates({ known: MIN - 1, 'new': 100, ignore: 100 })), false, `MIN-1 learned + lots of new/ignore ⇒ still not ready`);
eq(fg({}), false, 'empty states ⇒ not ready');
eq(fg(null), false, 'null states ⇒ not ready');
eq(fg(mkStates({ known: 5 }), 5), true, 'custom min=5 honoured');
eq(fg(mkStates({ known: 4 }), 5), false, 'custom min=5 not met');

console.log(`smoke:reader-scaffold — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
