#!/usr/bin/env node
/**
 * build-proclitic-gold.js — Phase-1 of the proclitic epic: assemble a STRATIFIED,
 * R1-adjudicable GOLD set for measuring proclitic segmentation (independent of Dicta,
 * per the design recon — we must NOT gate the future Dicta tier against Dicta-silver).
 *
 * What it does (it does NOT decide the gold — the owner/R1 does):
 *  - sources proclitic-initial tokens (+ niqqud + sentence context) from the Dicta audit
 *    cache (a corpus sample);
 *  - DRAFT-labels each via Dicta-silver (word vs stem leading-diff) + lexicon flags;
 *  - STRATIFIES into the classes the role-critique flagged as hard: name / narrative-vav /
 *    fossil-adverb / archaic / content, plus stack-depth;
 *  - flags NEEDS_R1 = true for every hard class (names, vav, fossils, archaic, depth≥3,
 *    niqqud-absent-ambiguous, or where the offline heuristic disagrees with Dicta) — those
 *    are exactly the cases the human oracle must adjudicate to break the Dicta-circularity;
 *  - emits a TSV worksheet (owner edits the R1_VERDICT column) + a frozen-gold JSON skeleton.
 *
 * FROZEN ktiv-skeleton rule (declared here, before any measurement, per R10):
 *   skeleton(w) = niqqud-stripped → final-forms normalized (ך→כ ם→מ ן→נ ף→פ ץ→צ) →
 *   optional matres collapsed (drop a SECOND consecutive ו or י). Used for LEXICON
 *   MEMBERSHIP + gold comparison ONLY, never for display. (Symmetric: applied to both
 *   detector output and gold, so ktiv male/chaser noise cancels in both directions.)
 *
 * Output: docs/research/epic-proclitic-phase2/2026-07-01/
 *   gold-worksheet.tsv   ← R1/owner edits the R1_VERDICT + R1_NOTES columns
 *   gold-frozen.json     ← skeleton (auto-accepted easy cases pre-filled; verdicts merged later)
 *   gold-LEGEND.md       ← column meanings + verification instructions
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'research', 'epic-proclitic-phase2', '2026-07-01');
const CACHE = path.join(ROOT, '.tmp', 'benyehuda', 'reader-morph-audit-dicta-cache.json');
const DICT = path.join(ROOT, 'public', 'data', 'inflection', 'pealim-infl-v12.json.gz');

const NIQQUD = /[֑-ׇ]/g;
const FINAL = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const stripN = (s) => String(s == null ? '' : s).replace(NIQQUD, '').trim();
const f2m = (s) => s.split('').map((c) => FINAL[c] || c).join('');
// frozen ktiv-skeleton: strip niqqud, normalize finals, collapse a doubled mater (וו→ו, יי→י)
const skel = (s) => f2m(stripN(s)).replace(/וו/g, 'ו').replace(/יי/g, 'י');

const PROC = new Set(['ה', 'ו', 'ב', 'ל', 'כ', 'מ', 'ש']);
// curated fossilized/lexicalized adverbs & prepositions (synchronically single words)
const FOSSIL = new Set(['באמת', 'ביחוד', 'בעיקר', 'בעצם', 'בכלל', 'בערך', 'בגלל', 'כמו', 'כדי',
  'לפי', 'מפני', 'בלי', 'לכן', 'כאשר', 'בעבור', 'למען', 'כיצד', 'כך', 'ככה', 'בלעדי', 'מלבד', 'מאחר']);
const ARCHAIC = new Set(['לאמר', 'לאמור', 'לראת', 'לדעת', 'לתת', 'לשבת', 'לרדת', 'לצאת']); // ל+ archaic/irregular inf-construct (R1 to verify)

function loadKnown() {
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(DICT)).toString('utf8'));
  const known = new Set();
  const names = new Set();
  for (const p of ds.paradigms) {
    for (const k of [p.lemma_niqqud, p.lemma]) if (k) known.add(skel(k));
    if (p.cells) for (const c of Object.values(p.cells)) if (c && c.he) known.add(skel(c.he));
    if (p.pos === 'propernoun' || /имя|name/i.test(p.meaning || '')) names.add(skel(p.lemma_niqqud || p.lemma));
  }
  return { known, names };
}

// Dicta-silver proclitic sequence: leading chars of word removed to reach the stem
function silverSeq(word, stem) {
  const w = skel(word), s = skel(stem);
  if (!w || !s || w === s) return '';
  let i = 0;
  while (i < w.length && w[i] !== s[0] && PROC.has(w[i])) i++;
  const pre = w.slice(0, i);
  if (pre && w.slice(i).startsWith(s.slice(0, Math.min(2, s.length)))) return pre;
  if (w.endsWith(s) && [...w.slice(0, w.length - s.length)].every((c) => PROC.has(c))) return w.slice(0, w.length - s.length);
  return '?';   // differs but not a clean proclitic strip (inflectional / spelling) → R1
}

function stratum(word, niqqud, stem, posDicta, known, names) {
  const w = skel(word), s = skel(stem);
  if (FOSSIL.has(stripN(word)) || FOSSIL.has(w)) return 'fossil';
  if (ARCHAIC.has(stripN(word)) || ARCHAIC.has(w)) return 'archaic';
  // narrative vav-consecutive (wayyiqtol): RAW niqqud shows וַ (vav + PATACH U+05B7), the
  // consecutive marker — distinct from conjunctive וְ (shva) / וּ (shuruk) = plain «and».
  if (posDicta === 'verb' && /^וַ/.test(String(niqqud || ''))) return 'vav-consecutive';
  // name-suspect: ONLY Dicta proper-noun OR residual is a known name (NOT residual length —
  // that wrongly flagged real short stems כל/ים/זה).
  const seq = silverSeq(word, stem);
  if (posDicta === 'propernoun') return 'name-suspect';
  if (seq && seq !== '?' && names.has(w.slice(seq.length))) return 'name-suspect';
  if (posDicta === 'verb' || posDicta === 'noun' || posDicta === 'adjective') return 'content';
  return 'other';
}

// Hard-negative + canonical seeds the cache may not contain — injected so the gold ALWAYS
// covers the do-no-harm tripwire (names/root-letters → no proclitic) and the vav-consecutive
// class. Each gets needs_r1 (R1 confirms the expected verdict). expected = '' means NO proclitic.
const SEEDS = [
  // root-letter / not-a-proclitic (expected: NO proclitic)
  { surface: 'בית', niqqud: 'בַּיִת', expected: '', note: 'root ב (house)' },
  { surface: 'משה', niqqud: 'מֹשֶׁה', expected: '', note: 'name Moses, not מ+שה' },
  { surface: 'מרים', niqqud: 'מִרְיָם', expected: '', note: 'name Miriam' },
  { surface: 'לאה', niqqud: 'לֵאָה', expected: '', note: 'name Leah' },
  { surface: 'לבן', niqqud: 'לָבָן', expected: '', note: 'name Lavan / white' },
  { surface: 'מים', niqqud: 'מַיִם', expected: '', note: 'water, root מ' },
  { surface: 'שמן', niqqud: 'שֶׁמֶן', expected: '', note: 'oil, root ש' },
  { surface: 'כלב', niqqud: 'כֶּלֶב', expected: '', note: 'dog, root כ' },
  { surface: 'מורה', niqqud: 'מוֹרֶה', expected: '', note: 'teacher (mishkal מ), not «from»' },
  { surface: 'ברוך', niqqud: 'בָּרוּךְ', expected: '', note: 'blessed / name Baruch' },
  // canonical vav-consecutive (expected: ו proclitic, BUT label = narrative-vav, not «and»)
  { surface: 'ויאמר', niqqud: 'וַיֹּאמֶר', expected: 'ו', note: 'vav-consecutive «and said» — NOT conjunctive' },
  { surface: 'ויהי', niqqud: 'וַיְהִי', expected: 'ו', note: 'vav-consecutive «and it was»' },
  { surface: 'וילך', niqqud: 'וַיֵּלֶךְ', expected: 'ו', note: 'vav-consecutive «and went»' },
  { surface: 'ותהי', niqqud: 'וַתְּהִי', expected: 'ו', note: 'vav-consecutive «and she was»' },
  // true proclitics (expected: the prefix) — positive controls
  { surface: 'בבית', niqqud: 'בַּבַּיִת', expected: 'בה', note: 'ב + fused article ה (in the house)' },
  { surface: 'ולכשהמלך', niqqud: 'וּלִכְשֶׁהַמֶּלֶךְ', expected: 'ולכשה', note: 'depth-5 stack ו+ל+כש+ה' },
];

function main() {
  if (!fs.existsSync(CACHE)) { console.error('Dicta cache missing — run `npm run smoke:reader-morph:audit` first.'); process.exit(2); }
  const { known, names } = loadKnown();
  const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const rows = [];
  const seen = new Set();
  for (const [sentence, toks] of Object.entries(cache)) {
    for (const t of toks) {
      const w = skel(t.word);
      if (!w || w.length < 2 || !PROC.has(w[0])) continue;
      if (seen.has(w)) continue; seen.add(w);
      const seq = silverSeq(t.word, t.stem);
      const strat = stratum(t.word, t.niqqud, t.stem, t.posDicta, known, names);
      const depth = (seq && seq !== '?') ? seq.length : 0;
      const wholeKnown = known.has(w);
      const niqqudPresent = NIQQUD.test(t.niqqud || '');
      // offline-heuristic draft (precision-tuned layered): emit only if whole∉lexicon AND stem∈known
      const stemSkel = skel(t.stem);
      const offlineSeq = (!wholeKnown && stemSkel && known.has(stemSkel) && w.length >= 3) ? w.slice(0, w.length - stemSkel.length) : '';
      const offlineAgrees = (seq === offlineSeq) ? 'Y' : 'N';
      // NEEDS_R1: every hard class, plus disagreement, plus unclear silver, plus niqqud-absent
      const needsR1 = ['fossil', 'archaic', 'vav-consecutive', 'name-suspect', 'other'].includes(strat)
        || seq === '?' || depth >= 3 || offlineAgrees === 'N' || !niqqudPresent;
      rows.push({
        surface: t.word, niqqud: t.niqqud || '', stratum: strat, depth,
        draft_proclitics: seq === '?' ? '(unclear)' : seq, stem: t.stem, posDicta: t.posDicta || '',
        offline_agrees: offlineAgrees, needs_r1: needsR1 ? 'YES' : '', context: sentence.slice(0, 90),
      });
    }
  }
  // inject hard-negative + canonical seeds (cache may not contain them)
  for (const sd of SEEDS) {
    if (seen.has(skel(sd.surface))) continue; seen.add(skel(sd.surface));
    const strat = /name|Moses|Miriam|Leah|Lavan|Baruch/.test(sd.note) ? 'name-suspect'
      : /vav-consecutive/.test(sd.note) ? 'vav-consecutive'
      : sd.expected ? 'content' : 'name-suspect';
    rows.push({ surface: sd.surface, niqqud: sd.niqqud, stratum: strat, depth: sd.expected.length || 0,
      draft_proclitics: sd.expected, stem: '', posDicta: '', offline_agrees: '', needs_r1: 'YES',
      context: 'SEED — ' + sd.note, seed: true });
  }
  // FOCUS the worksheet to ~300 rows so R1 verification is tractable; the full pool stays in
  // gold-frozen.json. Priority: (1) all hard-class + seeds (names/vav/fossil/archaic) — the
  // do-no-harm tripwire; (2) all detector↔Dicta DISAGREEMENTS (where the offline detector errs);
  // (3) a capped stratified sample of the agreeing content/other (for the precision floors).
  const isHardClass = (r) => ['name-suspect', 'vav-consecutive', 'fossil', 'archaic'].includes(r.stratum) || r.seed;
  const p1 = rows.filter(isHardClass);
  const p2 = rows.filter((r) => !isHardClass(r) && r.offline_agrees === 'N');
  const restPool = rows.filter((r) => !isHardClass(r) && r.offline_agrees !== 'N');
  const SAMPLE = Math.max(0, 300 - p1.length - p2.length);
  const sampled = restPool.filter((_, i) => i % Math.max(1, Math.ceil(restPool.length / Math.max(1, SAMPLE))) === 0);
  const focus = p1.concat(p2, sampled);

  // stratified ordering: hard classes first (so R1 sees them up top), then content
  const order = { 'name-suspect': 0, 'vav-consecutive': 1, 'fossil': 2, 'archaic': 3, 'other': 4, 'content': 5 };
  const sortFn = (a, b) => (order[a.stratum] - order[b.stratum]) || (b.depth - a.depth) || a.surface.localeCompare(b.surface);
  focus.sort(sortFn);
  rows.sort(sortFn);

  fs.mkdirSync(OUT, { recursive: true });
  // TSV worksheet — the FOCUSED set (R1 edits R1_VERDICT: a proclitic string e.g. "בה",
  // or "-" for NO proclitic; seeds pre-fill draft_proclitics as the expected answer to confirm).
  const header = ['id', 'surface', 'niqqud', 'stratum', 'depth', 'draft_proclitics', 'stem', 'posDicta', 'offline_agrees', 'needs_r1', 'R1_VERDICT', 'R1_NOTES', 'context'];
  const tsv = [header.join('\t')].concat(focus.map((r, i) =>
    [i + 1, r.surface, r.niqqud, r.stratum, r.depth, r.draft_proclitics, r.stem, r.posDicta, r.offline_agrees, r.needs_r1, '', '', r.context].join('\t')));
  fs.writeFileSync(path.join(OUT, 'gold-worksheet.tsv'), tsv.join('\n') + '\n', 'utf8');
  // frozen-gold skeleton: auto-accept the easy (content, agrees, niqqud, depth<3, not needs_r1)
  const gold = rows.map((r, i) => ({
    id: i + 1, surface: r.surface, niqqud: r.niqqud, stratum: r.stratum, depth: r.depth,
    draft_proclitics: r.draft_proclitics, needs_r1: r.needs_r1 === 'YES',
    verdict: r.needs_r1 === 'YES' ? null : r.draft_proclitics,   // null = awaits R1; else auto-accepted draft
  }));
  fs.writeFileSync(path.join(OUT, 'gold-frozen.json'), JSON.stringify({ _meta: {
    purpose: 'Phase-1 proclitic GOLD (independent of Dicta). verdict=null rows await R1 adjudication.',
    ktiv_skeleton_rule: 'niqqud-strip → finals-normalized → doubled-mater collapsed; membership/compare only',
    total: gold.length, awaiting_r1: gold.filter((g) => g.needs_r1).length, auto_accepted: gold.filter((g) => !g.needs_r1).length,
  }, gold }, null, 2) + '\n', 'utf8');

  const byStrat = {};
  focus.forEach((r) => { byStrat[r.stratum] = (byStrat[r.stratum] || 0) + 1; });
  console.log(`[proclitic-gold] pool ${rows.length} forms → FOCUSED worksheet ${focus.length} rows (+${SEEDS.length} seeds)`);
  console.log('  worksheet strata:', JSON.stringify(byStrat));
  console.log('  → R1 verifies the worksheet (R1_VERDICT col); auto-accepted easy content in gold-frozen.json:', rows.filter((r) => r.needs_r1 !== 'YES' && !r.seed).length);
}

main();
