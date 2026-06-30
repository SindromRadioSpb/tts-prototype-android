#!/usr/bin/env node
/**
 * build-function-frequency.js — Epic-3b producer step (measure-before-code, R10).
 *
 * Counts Hebrew FUNCTION-WORD frequency over the locally-baked Ben-Yehuda work
 * bodies to drive the authoring batch order/composition for the "Употребление
 * служебных слов" usage cards (owner decision 2026-06-30: corpus frequency, not
 * a textbook top-25).
 *
 * Source:  public/data/benyehuda/works/<id>.json  (library-export bundles;
 *          GITIGNORED — bodies live on the prod volume, a local subset is baked
 *          here). Reads rows[].hebrew_plain (niqqud-stripped fallback).
 * Output:  docs/research/epic3b-function-usage/<date>/function-word-frequency.json
 *          (a small TRACKED artifact; raw counts + honesty caveats + suggested
 *          frequency-ordered authoring batch).
 *
 * Honesty (R10/R1):
 *  - STANDALONE function words are counted as EXACT whole tokens — precise.
 *  - PROCLITIC single-letter morphemes (ה ו ב ל מ כ ש) are glued to the next word
 *    in surface text, so they are counted as "tokens whose first letter is this
 *    morpheme". That OVER-COUNTS (e.g. בַּיִת "house" starts with ב but is not
 *    proclitic-ב). The reported proclitic counts are therefore an UPPER BOUND and
 *    are labelled as such; they are reliable for RANK/ORDER, not for an exact rate.
 *  - Composition = the linguistically-defined closed class (a POS-free frequency
 *    scan alone cannot distinguish function words from content words); corpus
 *    frequency RANKS that class and sets the inclusion threshold. A diagnostic of
 *    the top overall tokens is emitted so no frequent function word is missed.
 *
 * Usage:  node scripts/premium/build-function-frequency.js [--out <dir>] [--top N]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const WORKS_DIR = path.join(ROOT, 'public', 'data', 'benyehuda', 'works');

// --- args ---
const argv = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const OUT_DIR = getArg('--out', path.join(ROOT, 'docs', 'research', 'epic3b-function-usage', '2026-06-30'));
const TOP_DIAG = parseInt(getArg('--top', '40'), 10);

// --- closed-class inventories (linguistically defined) ---
// Standalone function words (whole tokens) — prepositions, conjunctions,
// particles, common pronominal/adverbial function words a learner taps.
const STANDALONE = [
  'את', 'על', 'של', 'לא', 'כל', 'כי', 'גם', 'זה', 'זאת', 'אשר', 'אל', 'אם',
  'עם', 'אין', 'מה', 'אך', 'רק', 'עוד', 'עד', 'מן', 'יש', 'או', 'בין', 'לפני',
  'אחרי', 'כבר', 'כמו', 'אצל', 'נגד', 'בלי', 'בלעדי', 'למען', 'יען', 'פן',
  'אולי', 'הן', 'הנה', 'מאד', 'מאוד', 'אחר', 'תחת', 'מי', 'איך', 'איפה', 'מתי',
  'למה', 'מדוע', 'כאשר', 'אף', 'הלא', 'אכן',
  // added after corpus composition-check (2026-06-30 top-overall diagnostic):
  'אבל', 'זו', 'אלה', 'אלו', 'אז', 'לכן', 'כן', 'אצלי', 'בלתי', 'טרם', 'זולת',
];
// Personal pronouns — function-class but a DISTINCT paradigm; reported separately
// (diagnostic) so the owner can decide whether 3b includes them or treats them as
// their own feature. NOT folded into suggested_batch (note 'את' is a homograph:
// object-marker [standalone] vs "you-f" [pronoun] — counted under standalone).
const PRONOUNS = [
  'אני', 'אנכי', 'אתה', 'אתם', 'אתן', 'הוא', 'היא', 'אנחנו', 'אנו', 'הם', 'הם', 'המה', 'הנה',
];
// Single-letter proclitic morphemes (glued prefixes).
const PROCLITIC = [
  { m: 'ה', gloss: 'определённый артикль / вопросит. частица' },
  { m: 'ו', gloss: 'союз «и/а/но»' },
  { m: 'ב', gloss: 'предлог «в/на/при; посредством»' },
  { m: 'ל', gloss: 'предлог «к/для; дат.»' },
  { m: 'מ', gloss: 'предлог «из/от» (מן-сокр.)' },
  { m: 'כ', gloss: 'предлог «как/подобно»' },
  { m: 'ש', gloss: 'релятив «который/что» / союз' },
];
const PROC_SET = new Set(PROCLITIC.map((p) => p.m));
const STAND_SET = new Set(STANDALONE);
const PRON_SET = new Set(PRONOUNS);

// niqqud + cantillation marks U+0591..U+05C7
const stripNiqqud = (s) => s.replace(/[֑-ׇ]/g, '');
const HE = /[א-ת]/; // Hebrew letter

function tokenize(line) {
  return stripNiqqud(line).split(/[^א-ת]+/).filter((t) => t && HE.test(t));
}

function main() {
  if (!fs.existsSync(WORKS_DIR)) {
    console.error(`[fn-freq] works dir not found: ${WORKS_DIR}\n` +
      'Bodies are gitignored and live on the prod volume; bake a local subset first.');
    process.exit(2);
  }
  const files = fs.readdirSync(WORKS_DIR).filter((f) => f.endsWith('.json'));
  const standCnt = Object.create(null);
  const procCnt = Object.create(null);
  const pronCnt = Object.create(null);
  const allCnt = Object.create(null);
  let totalTok = 0;
  let worksWithText = 0;

  for (const f of files) {
    let bundle;
    try { bundle = JSON.parse(fs.readFileSync(path.join(WORKS_DIR, f), 'utf8')); }
    catch { continue; }
    const texts = (bundle && bundle.library && bundle.library.texts) || [];
    let any = false;
    for (const t of texts) {
      for (const r of (t.rows || [])) {
        const line = r.hebrew_plain || r.hebrew_niqqud || '';
        if (!line) continue;
        for (const tok of tokenize(line)) {
          any = true;
          totalTok++;
          allCnt[tok] = (allCnt[tok] || 0) + 1;
          if (STAND_SET.has(tok)) standCnt[tok] = (standCnt[tok] || 0) + 1;
          if (PRON_SET.has(tok)) pronCnt[tok] = (pronCnt[tok] || 0) + 1;
          if (tok.length > 1 && PROC_SET.has(tok[0])) procCnt[tok[0]] = (procCnt[tok[0]] || 0) + 1;
        }
      }
    }
    if (any) worksWithText++;
  }

  const pct = (c) => +(100 * c / totalTok).toFixed(3);
  const standalone = Object.entries(standCnt)
    .sort((a, b) => b[1] - a[1])
    .map(([w, c]) => ({ word: w, count: c, pct: pct(c) }));
  const proclitic = PROCLITIC
    .map((p) => ({ morpheme: p.m, gloss: p.gloss, count_upper_bound: procCnt[p.m] || 0, pct_upper_bound: pct(procCnt[p.m] || 0) }))
    .sort((a, b) => b.count_upper_bound - a.count_upper_bound);
  const pronoun_diagnostic = Object.entries(pronCnt)
    .sort((a, b) => b[1] - a[1])
    .map(([w, c]) => ({ word: w, count: c, pct: pct(c) }));

  // diagnostic: top overall tokens, flag which are already-known function words
  const topOverall = Object.entries(allCnt).sort((a, b) => b[1] - a[1]).slice(0, TOP_DIAG)
    .map(([w, c]) => ({ token: w, count: c, is_known_function: STAND_SET.has(w) }));

  // suggested authoring batch: proclitics first (highest morpheme impact),
  // then standalone by descending corpus frequency.
  const suggested_batch = [
    ...proclitic.map((p) => ({ key: p.m, type: 'proclitic', rank_by: p.count_upper_bound })),
    ...standalone.map((s) => ({ key: s.word, type: 'standalone', rank_by: s.count })),
  ];

  const out = {
    _meta: {
      purpose: 'Epic-3b — corpus frequency of Hebrew function words, to set authoring batch order/composition.',
      generated_from: 'public/data/benyehuda/works/*.json (rows[].hebrew_plain), niqqud-stripped',
      source_command: 'node scripts/premium/build-function-frequency.js',
      sample_works: worksWithText,
      sample_files_scanned: files.length,
      total_hebrew_tokens: totalTok,
      caveats: {
        proclitic: 'count_upper_bound = tokens whose FIRST letter is this morpheme; over-counts non-proclitic words (e.g. בית starts with ב). Reliable for RANK, not exact rate.',
        composition: 'Composition is the linguistically-defined closed class; corpus frequency ranks it and sets the inclusion threshold. POS-free frequency cannot itself separate function from content words — see top_overall_diagnostic to confirm no frequent function word is missed.',
        pronouns: 'Personal pronouns (pronoun_diagnostic) are function-class but a DISTINCT paradigm; NOT in suggested_batch. Owner-scope decision pending: include in 3b or treat as a separate feature. Note את is a homograph (object-marker vs "you-f"); its count sits under standalone.',
        sample: `Local baked subset (${worksWithText} works); full corpus is ~26K. Closed-class RANK is stable at this volume; absolute rates are sample-relative.`,
      },
    },
    standalone,
    proclitic,
    pronoun_diagnostic,
    top_overall_diagnostic: topOverall,
    suggested_batch,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'function-word-frequency.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');

  // console summary
  console.log(`[fn-freq] ${worksWithText} works, ${totalTok} Hebrew tokens`);
  console.log('\n=== PROCLITIC morphemes (upper-bound, ranked) ===');
  proclitic.forEach((p, i) => console.log(`${String(i + 1).padStart(2)}. ${p.morpheme}־  ${p.count_upper_bound}  (≤${p.pct_upper_bound}%)  ${p.gloss}`));
  console.log('\n=== STANDALONE function words (exact) — top 25 ===');
  standalone.slice(0, 25).forEach((s, i) => console.log(`${String(i + 1).padStart(2)}. ${s.word.padEnd(6)} ${s.count}  (${s.pct}%)`));
  console.log('\n=== PERSONAL PRONOUNS (diagnostic; scope decision pending) — top 8 ===');
  pronoun_diagnostic.slice(0, 8).forEach((p, i) => console.log(`${String(i + 1).padStart(2)}. ${p.word.padEnd(6)} ${p.count}  (${p.pct}%)`));
  console.log(`\n[fn-freq] wrote ${path.relative(ROOT, outPath)}`);
}

main();
