#!/usr/bin/env node
'use strict';
// smoke:studio-karaoke — BRR-P1-008d. Guards the PURE pieces of the Studio per-row
// word-karaoke driver (public/js/studio-karaoke.js), which adds the "running word"
// highlight to index.html WITHOUT touching renderTable (smoke:reader-parity covers that):
//  • studio-karaoke.activeWordIndex — must behave IDENTICALLY to reader-core.activeWordIndex
//    (it's a copy, since reader-core is an ES module Studio can't import).
//  • Offset-scheme alignment (make-or-break): studio-karaoke wraps cell words by counting
//    reader-morph.tokenize() word tokens; that offset must equal reader-morph.words().length
//    AND the server's ttsBake.buildMarkedSsml() mark count — so data-w-offset N == SSML mark
//    wN == timing words[].o. If any of these three diverge, the wrong word lights up.
const path = require('path');
const { pathToFileURL } = require('url');
const SK = require('../../public/js/studio-karaoke.js');      // Node → { activeWordIndex }
const RM = require('../../public/js/reader-morph.js');         // IIFE → API (tokenize/words)
const TB = require('./lib/ttsBake.js');                        // buildMarkedSsml

let pass = 0, fail = 0;
const eq = (g, w, m) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); } };
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL ' + m); } };

(async () => {
  ok(typeof SK.activeWordIndex === 'function', 'studio-karaoke exports activeWordIndex');
  ok(typeof RM.tokenize === 'function' && typeof RM.words === 'function', 'reader-morph tokenize/words available');

  // ── activeWordIndex: same contract as reader-core (parity with smoke:reader-karaoke-words) ──
  const awi = SK.activeWordIndex;
  const W = [{ o: 0, t: 0.2 }, { o: 1, t: 0.5 }, { o: 2, t: 1.1 }];
  eq(awi(W, 0.0), -1, 'before first word → -1');
  eq(awi(W, 0.2), 0, 'at first word start');
  eq(awi(W, 0.49), 0, 'still first word');
  eq(awi(W, 0.5), 1, 'second word');
  eq(awi(W, 5.0), 2, 'past last → last word');
  eq(awi([], 1), -1, 'empty → -1');
  eq(awi(null, 1), -1, 'null → -1');
  const P = [{ o: 0, t: 0 }, { o: 2, t: 1.0 }];
  eq(awi(P, 0.5), 0, 'partial: before gap → 0');
  eq(awi(P, 1.5), 2, 'partial: after gap → 2 (missing word skipped honestly)');

  // ── byte-for-byte parity with reader-core.activeWordIndex (the source of truth) ──
  const RC = await import(pathToFileURL(path.resolve(__dirname, '../../public/js/reader-core.js')).href);
  const cases = [
    [W, 0.0], [W, 0.2], [W, 0.49], [W, 0.5], [W, 1.1], [W, 99], [P, 0.5], [P, 1.5],
    [[], 0], [null, 3], [[{ o: 0, t: 0 }], 0],
  ];
  let parity = true;
  for (const [w, t] of cases) { if (SK.activeWordIndex(w, t) !== RC.activeWordIndex(w, t)) parity = false; }
  ok(parity, 'activeWordIndex IDENTICAL to reader-core across cases');

  // ── Offset-scheme alignment: tokenize-words == words() == SSML mark count ──
  // Hebrew samples: plain, niqqud, maqaf (compound), punctuation, mixed.
  const SAMPLES = [
    'שלום עולם',
    'בַּיִת גָּדוֹל מְאוֹד',
    'אֵשֶׁת־חַיִל מִי יִמְצָא',          // maqaf → two tokens (reader-morph excludes U+05BE)
    'הוּא אָמַר: «שָׁלוֹם!» וְהָלַךְ.',   // punctuation, quotes, colon
    'אחד, שניים, שלושה.',
  ];
  for (const s of SAMPLES) {
    const tokWords = RM.tokenize(s).filter((tk) => tk.isWord).length;
    const wordsN = RM.words(s).length;
    const ssmlN = TB.buildMarkedSsml(s).wordCount;
    ok(tokWords === wordsN && wordsN === ssmlN,
      `offset alignment for "${s}" — tokenize-words=${tokWords} words()=${wordsN} ssmlMarks=${ssmlN} (must be equal)`);
  }

  // The wrap increments offset only for word tokens (0..n-1); the max valid data-w-offset
  // must be wordCount-1 so activeWordIndex's returned .o always addresses a real span.
  const probe = 'בַּיִת. גַּן וְעוֹד';
  const wc = TB.buildMarkedSsml(probe).wordCount;
  ok(wc === RM.words(probe).length && wc >= 1, 'wrap offset range matches word count');

  console.log(`smoke:studio-karaoke — ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
