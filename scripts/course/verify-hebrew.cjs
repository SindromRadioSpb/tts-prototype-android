'use strict';
// Hebrew quality tools for course lessons: Pealim cross-check, optional Dicta second opinion, checker probes.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MARKS = /[֑-ׇ]/g;
const norm = s => String(s || '').normalize('NFC').replace(/[֑-ֽ֯]/g, '').replace(/\|/g, '');
const strip = s => norm(s).replace(MARKS, '');
const tokens = s => norm(s).split(/[\s־]+/).map(t => t.replace(/[^א-תְ-ׇ"'׳״]/g, '')).filter(t => /[א-ת]/.test(t));
const PREFIX = /^[בהולמשכ]/;

let pealimCache = null;
function pealim() {
  if (pealimCache) return pealimCache;
  const file = path.join(__dirname, '../../public/data/inflection/pealim-infl-v12.json.gz');
  const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const exact = new Set(), bySkeleton = new Map();
  const add = he => {
    if (!he) return;
    for (const form of String(he).split(/[~,]/)) {
      const n = norm(form).trim().replace(/־$/, '');
      if (!n) continue;
      exact.add(n);
      const sk = strip(n);
      if (!bySkeleton.has(sk)) bySkeleton.set(sk, n);
    }
  };
  for (const p of data.paradigms) { add(p.lemma_niqqud); for (const c of Object.values(p.cells || {})) add(c.he); }
  pealimCache = { exact, bySkeleton };
  return pealimCache;
}

function classify(niqqud, plain) {
  const { exact, bySkeleton } = pealim();
  if (exact.has(niqqud)) return { pealim: 'match' };
  // One-letter prefix (ו, ה, ב, ל, מ, ש, כ) with its vowels.
  const m = niqqud.match(/^([בהולמשכ][ְ-ׇ]*)(.+)$/);
  if (m && exact.has(m[2])) return { pealim: 'prefixed' };
  if (bySkeleton.has(plain)) return { pealim: 'differs', pealimForm: bySkeleton.get(plain) };
  if (PREFIX.test(plain) && bySkeleton.has(plain.slice(1))) return { pealim: 'differs', pealimForm: bySkeleton.get(plain.slice(1)) };
  return { pealim: 'absent' };
}

function read(dir, file) { return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, '')); }

// Every Hebrew pair a learner can meet in the lesson, with where it lives.
function lessonPairs(lesson) {
  const out = [];
  const push = (where, pair) => { if (pair && pair.niqqud) out.push({ where, pair }); };
  for (const t of lesson.scene?.turns || []) { push('scene.' + t.id, t.he); for (const c of t.choices || []) push('scene.' + t.id + '.' + c.id, c.he); }
  for (const p of lesson.text?.paras || []) push('text.' + p.id, p.he);
  for (const t of lesson.tasks || []) {
    const w = 'task.' + t.id;
    push(w + '.model', t.model); push(w + '.cue', t.cue);
    (t.answers || []).forEach((a, i) => push(w + '.answers' + i, a));
    (t.tiles || []).forEach((a, i) => push(w + '.tiles' + i, a));
    (t.distractors || []).forEach((a, i) => push(w + '.distractors' + i, a));
    (t.options || []).forEach(o => push(w + '.option.' + o.id, o.he));
    (t.pairs || []).forEach(o => push(w + '.pair.' + o.id, o.he));
    (t.variants || []).forEach(v => push(w + '.variant.' + v.id, v.model));
  }
  for (const [id, g] of Object.entries(lesson.grammar || {})) { push('grammar.' + id, g.line?.he); (g.pattern || []).forEach((p, i) => push('grammar.' + id + '.p' + i, p)); }
  return out;
}

function verifyLesson(dir, lessonId) {
  const lesson = read(dir, 'lessons/' + lessonId + '.json');
  const seen = new Map();
  for (const { where, pair } of lessonPairs(lesson)) {
    const n = tokens(pair.niqqud), p = tokens(pair.plain);
    n.forEach((word, i) => {
      if (seen.has(word)) { seen.get(word).where.push(where); return; }
      const plain = strip(p[i] || word);
      seen.set(word, { word, plain, where: [where], ...classify(word, plain) });
    });
  }
  return [...seen.values()];
}

async function dictaOpinion(dir, lessonId, report, { cacheFile, pauseMs = 1100 } = {}) {
  const { nakdan } = require('../../db/premium/providers/dictaCloud.js');
  const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
  const lesson = read(dir, 'lessons/' + lessonId + '.json');
  const byWord = new Map(report.map(r => [r.word, r]));
  for (const { pair } of lessonPairs(lesson)) {
    const key = pair.plain;
    if (!(key in cache)) {
      // Sequential with a pause: concurrent Dicta calls get the address banned (O-090).
      const res = await nakdan([key]);
      cache[key] = res.ok ? res.body.results[0] : null;
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
      await new Promise(r => setTimeout(r, pauseMs));
    }
    if (!cache[key]) continue;
    const d = tokens(cache[key]), n = tokens(pair.niqqud);
    n.forEach((word, i) => { const r = byWord.get(word); if (r && d[i] && r.dicta === undefined) r.dicta = norm(d[i]) === word ? 'match' : norm(d[i]); });
  }
  return report;
}

function runProbes(dir, lessonId) {
  const C = require('../../public/js/course-checker.js');
  const course = read(dir, 'course.json'), lexicon = read(dir, course.lexicon || 'lexicon.json');
  const lesson = read(dir, 'lessons/' + lessonId + '.json');
  const probes = read(dir, 'probes/' + lessonId + '.json');
  const index = C.buildIndex(lexicon.entries);
  index.preknown = course.preknown || [];
  const failures = [];
  for (const probe of probes) {
    let task = lesson.tasks.find(t => t.id === probe.taskId);
    if (!task) { failures.push({ ...probe, got: 'NO_TASK' }); continue; }
    if (probe.variant) { const v = task.variants?.find(x => x.id === probe.variant); task = v ? { ...task, prompt: v.prompt, spec: v.spec, ...(v.model ? { model: v.model } : {}) } : task; }
    const got = C.assess(probe.input, task, lesson, index).kind;
    if (got !== probe.expect) failures.push({ ...probe, got });
  }
  return failures;
}

module.exports = { verifyLesson, dictaOpinion, runProbes, classify, tokens };
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const li = args.indexOf('--lesson');
    const dir = args[0], lessonId = args[li + 1];
    if (!dir || li < 0) { console.error('Использование: node scripts/course/verify-hebrew.cjs <courseSrc> --lesson <id> [--dicta]'); process.exitCode = 1; return; }
    let report = verifyLesson(dir, lessonId);
    if (args.includes('--dicta')) {
      fs.mkdirSync(path.join(__dirname, '../../.tmp'), { recursive: true });
      report = await dictaOpinion(dir, lessonId, report, { cacheFile: path.join(__dirname, '../../.tmp/course-dicta-cache.json') });
    }
    const out = path.join(dir, 'journal', lessonId + '.verify.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report.map(r => ({ ...r, note: '' })), null, 1) + '\n');
    const count = k => report.filter(r => r.pealim === k).length;
    console.log('Слов: ' + report.length + ' · Pealim совпало ' + count('match') + ', с приставкой ' + count('prefixed') + ', расходится ' + count('differs') + ', нет ' + count('absent') +
      (args.includes('--dicta') ? ' · Dicta расходится ' + report.filter(r => r.dicta && r.dicta !== 'match').length : '') + ' → ' + out);
  })().catch(e => { console.error(e.message); process.exitCode = 1; });
}
