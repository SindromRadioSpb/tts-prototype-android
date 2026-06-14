#!/usr/bin/env node
'use strict';
// smoke:reader-karaoke — BRR-P1-008. Guards the PURE continuous-advance bound
// reader-core.nextPlayableIndex: it must skip rows with no speakable Hebrew (so karaoke never
// stalls on a separator/blank) and return -1 at the end (so playback stops cleanly).
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const RC = await import(pathToFileURL(path.resolve(__dirname, '../../public/js/reader-core.js')).href);
  const f = RC && RC.nextPlayableIndex;
  if (typeof f !== 'function') { console.error('FAIL: reader-core.nextPlayableIndex not exported'); process.exit(1); }

  let pass = 0, fail = 0;
  const eq = (g, w, m) => { if (g === w) pass++; else { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); } };

  // mix of plain-he, niqqud-only, empty, whitespace-only rows
  const rows = [{ he: 'שלום' }, { he: '', he_niqqud: '' }, { he_niqqud: 'בֹּקֶר' }, { he: '   ' }, { he: 'ערב' }];
  eq(f(rows, -1), 0, 'first playable from start');
  eq(f(rows, 0), 2, 'skip empty row → niqqud-only row is playable');
  eq(f(rows, 2), 4, 'skip whitespace-only row → last');
  eq(f(rows, 4), -1, 'past last → -1 (stop)');
  eq(f(rows, 99), -1, 'beyond length → -1');
  eq(f([], -1), -1, 'empty array → -1');
  eq(f([{ he: '' }, { he: '  ' }], -1), -1, 'all-silent → -1');
  eq(f(null, -1), -1, 'non-array → -1');
  eq(f(rows, undefined), 0, 'undefined fromIdx behaves like -1');

  console.log(`smoke:reader-karaoke — ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL: ' + (e && e.message)); process.exit(1); });
