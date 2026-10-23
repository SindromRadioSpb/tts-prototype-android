#!/usr/bin/env node
'use strict';
// Checks a rebuilt browser transliteration bundle against the plain build:
//   • identical output for every sampled row and every profile (learner-latin, sbl, ru-phonetic);
//   • memory retained after transliterating a long text (run with --expose-gc).
// Usage: node --expose-gc translit-bundle-parity.js --plain <bundle> --candidate <bundle> --bodies <dir> [--every 10]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; }
const load = (file) => { const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file }); return ctx.LocalTranslit; };
const plain = load(arg('plain')), cand = load(arg('candidate'));
const dir = path.resolve(arg('bodies')), every = Number(arg('every', 10));
const PROFILES = ['learner-latin', 'sbl', 'ru-phonetic'];

let rows = 0, checks = 0, diffs = [];
const files = fs.readdirSync(dir).filter((f) => /^\d+-[a-f0-9]{32}\.json$/.test(f)).sort();
for (const f of files) {
  const texts = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).library.texts;
  const all = texts.flatMap((t) => t.rows);
  const take = /^23822-/.test(f) ? all : all.filter((_, i) => i % every === 0);
  for (const r of take) {
    const he = r.hebrew_niqqud || '';
    if (!he) continue;
    rows++;
    for (const p of PROFILES) {
      checks++;
      const a = plain.transliterateWithProfile(he, p), b = cand.transliterateWithProfile(he, p);
      if (a !== b && diffs.length < 5) diffs.push({ file: f, order: r.order_index, profile: p, plain: a.slice(0, 60), candidate: b.slice(0, 60) });
      else if (a !== b) diffs.push(null);
    }
  }
}
if (JSON.stringify(plain.TRANSLIT_PROFILE_VERSIONS) !== JSON.stringify(cand.TRANSLIT_PROFILE_VERSIONS)) diffs.push({ profileVersions: 'differ' });

let memory = null;
if (global.gc) {
  const long = JSON.parse(fs.readFileSync(path.join(dir, files.find((f) => /^23822-/.test(f))), 'utf8')).library.texts[0].rows.map((r) => r.hebrew_niqqud || '');
  const mb = () => { global.gc(); global.gc(); return process.memoryUsage().heapUsed / 1048576; };
  const retained = (T) => { const before = mb(); for (const he of long) T.transliterateWithProfile(he, 'learner-latin'); return Math.round(mb() - before); };
  // fresh contexts so neither carries the other's warm state
  memory = { plainRetainedMB: retained(load(arg('plain'))), candidateRetainedMB: retained(load(arg('candidate'))), rows: long.length };
}
const result = { files: files.length, rows, checks, differences: diffs.length, examples: diffs.filter(Boolean).slice(0, 5), memory };
console.log(JSON.stringify(result, null, 1));
if (diffs.length) process.exit(1);
