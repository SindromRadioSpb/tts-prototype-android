#!/usr/bin/env node
'use strict';
// smoke:reader-karaoke-words — BRR-P1-008b. Guards the PURE word-level pieces:
//  • reader-core.activeWordIndex (audio currentTime → spoken word offset; honest on partial timing)
//  • ttsBake.buildMarkedSsml (mark index == word offset; punctuation PRESERVED)
//  • ttsBake.timingFromTimepoints (GCP timepoints[] → sorted [{o,t}], tolerates gaps/truncation)
const path = require('path');
const { pathToFileURL } = require('url');
const TB = require('./lib/ttsBake.js');

let pass = 0, fail = 0;
const eq = (g, w, m) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); } };
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL ' + m); } };

(async () => {
  const RC = await import(pathToFileURL(path.resolve(__dirname, '../../public/js/reader-core.js')).href);
  const awi = RC.activeWordIndex;

  // ── activeWordIndex ──
  const W = [{ o: 0, t: 0.2 }, { o: 1, t: 0.5 }, { o: 2, t: 1.1 }];
  eq(awi(W, 0.0), -1, 'before first word → -1');
  eq(awi(W, 0.2), 0, 'at first word start');
  eq(awi(W, 0.49), 0, 'still first word');
  eq(awi(W, 0.5), 1, 'second word');
  eq(awi(W, 5.0), 2, 'past last → last word');
  eq(awi([], 1), -1, 'empty → -1');
  eq(awi(null, 1), -1, 'null → -1');
  // partial timing (word 1 has no timepoint) — never highlight the missing word (honest)
  const P = [{ o: 0, t: 0 }, { o: 2, t: 1.0 }];
  eq(awi(P, 0.5), 0, 'partial: before gap → 0');
  eq(awi(P, 1.5), 2, 'partial: after gap → 2 (word 1 skipped honestly)');

  // ── buildMarkedSsml: punctuation preserved, mark count == word count ──
  const a = TB.buildMarkedSsml('בַּיִת. גַּן');
  eq(a.wordCount, 2, 'buildMarkedSsml word count');
  ok(/<mark name="w0"\/>/.test(a.ssml) && /<mark name="w1"\/>/.test(a.ssml), 'two marks present');
  ok(a.ssml.indexOf('.') >= 0, 'period PRESERVED in ssml (prosody)');
  ok((a.ssml.match(/<mark /g) || []).length === a.wordCount, 'mark count == word count');
  eq(TB.buildMarkedSsml('').wordCount, 0, 'empty text → 0 words');

  // ── timingFromTimepoints: parse, sort, tolerate gaps ──
  eq(TB.timingFromTimepoints([{ markName: 'w0', timeSeconds: 0.1 }, { markName: 'w2', timeSeconds: 1.0 }], 3),
     { v: 1, n: 3, got: 2, words: [{ o: 0, t: 0.1 }, { o: 2, t: 1.0 }] }, 'timepoints → timing (gap tolerated)');
  eq(TB.timingFromTimepoints([{ markName: 'w1', timeSeconds: 0.5 }, { markName: 'w0', timeSeconds: 0.1 }], 2).words,
     [{ o: 0, t: 0.1 }, { o: 1, t: 0.5 }], 'sorted by offset');
  eq(TB.timingFromTimepoints([], 0), { v: 1, n: 0, got: 0, words: [] }, 'empty timepoints');
  eq(TB.timingFromTimepoints([{ markName: 'bad' }, { markName: 'w0', timeSeconds: 0.2 }], 1).got, 1, 'drops malformed marks');

  console.log(`smoke:reader-karaoke-words — ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
