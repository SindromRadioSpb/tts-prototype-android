#!/usr/bin/env node
'use strict';
// Checks a rebuilt browser transliteration bundle against the plain build, on real rows and every profile.
// Each bundle runs in its own process (--emit) and writes one hash per (body, row, profile); the plain bundle's
// module-level WeakMap tables grow for the whole run, so its context is recreated every --recycle rows to keep it
// within memory. --compare then diffs the two hash files. --memory measures what a bundle retains after a long text.
//   node translit-bundle-parity.js --emit <bundle> --bodies <dir> --out <file> [--every 10] [--recycle 200]
//   node translit-bundle-parity.js --compare <a> <b>
//   node --expose-gc translit-bundle-parity.js --memory <bundle> --bodies <dir>
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; }
const load = (file) => { const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file }); return ctx.LocalTranslit; };
const PROFILES = ['learner-latin', 'sbl', 'ru-phonetic'];
const bodiesOf = (dir) => fs.readdirSync(dir).filter((f) => /^\d+-[a-f0-9]{32}\.json$/.test(f)).sort();

if (arg('emit')) {
  const bundle = arg('emit'), dir = path.resolve(arg('bodies')), every = Number(arg('every', 10)), recycle = Number(arg('recycle', 200));
  const out = fs.openSync(arg('out'), 'w');
  let T = load(bundle), used = 0, rows = 0;
  for (const f of bodiesOf(dir)) {
    const all = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).library.texts.flatMap((t) => t.rows);
    const take = /^23822-/.test(f) ? all : all.filter((_, i) => i % every === 0);
    for (const r of take) {
      const he = r.hebrew_niqqud || '';
      if (!he) continue;
      if (++used > recycle) { T = load(bundle); used = 1; }
      const hashes = PROFILES.map((p) => crypto.createHash('sha1').update(T.transliterateWithProfile(he, p)).digest('hex').slice(0, 16));
      fs.writeSync(out, f + '\t' + r.order_index + '\t' + hashes.join('\t') + '\n');
      rows++;
    }
  }
  fs.writeSync(out, '#versions\t' + JSON.stringify(T.TRANSLIT_PROFILE_VERSIONS) + '\n');
  fs.closeSync(out);
  console.log(JSON.stringify({ bundle: path.basename(bundle), rows }));
} else if (arg('compare')) {
  const i = process.argv.indexOf('--compare');
  const a = fs.readFileSync(process.argv[i + 1], 'utf8').trim().split('\n'), b = fs.readFileSync(process.argv[i + 2], 'utf8').trim().split('\n');
  const diffs = [];
  if (a.length !== b.length) diffs.push('line count ' + a.length + ' vs ' + b.length);
  for (let k = 0; k < Math.min(a.length, b.length); k++) if (a[k] !== b[k] && diffs.length < 6) diffs.push(a[k] + '  ≠  ' + b[k]);
  const rows = a.filter((l) => !l.startsWith('#')).length;
  console.log(JSON.stringify({ rows, checks: rows * PROFILES.length, differences: diffs.length, examples: diffs }, null, 1));
  if (diffs.length) process.exit(1);
} else if (arg('memory')) {
  const dir = path.resolve(arg('bodies'));
  const long = JSON.parse(fs.readFileSync(path.join(dir, bodiesOf(dir).find((f) => /^23822-/.test(f))), 'utf8')).library.texts[0].rows.map((r) => r.hebrew_niqqud || '');
  const mb = () => { global.gc(); global.gc(); return process.memoryUsage().heapUsed / 1048576; };
  const T = load(arg('memory'));
  for (const he of long.slice(0, 20)) T.transliterateWithProfile(he, 'learner-latin');
  const before = mb();
  for (const he of long) T.transliterateWithProfile(he, 'learner-latin');
  console.log(JSON.stringify({ bundle: path.basename(arg('memory')), rows: long.length, retainedMB: Math.round(mb() - before) }));
}
