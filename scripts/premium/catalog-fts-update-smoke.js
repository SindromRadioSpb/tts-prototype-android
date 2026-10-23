#!/usr/bin/env node
'use strict';
// Independent check of a catalog full-text update (build-catalog-fts-update.js): the CLIENT search module
// (public/js/corpus-fts.js) is pointed at the built files and asked real questions.
//   • every Modern work: a phrase taken from one of its rows finds it, and for a work made of parts the
//     position of that phrase maps to the part whose body holds the row;
//   • a sample of other indexed works: their postings for a word of the new release are identical to vN;
//   • the release seal covers every file, and the catalog root names it by hash.
// Usage: node catalog-fts-update-smoke.js --dir <v(N+1) out> --to 11 --old <vN fts dir> --data public/data/benyehuda --bodies <dir>
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; }
const dir = path.resolve(arg('dir')), to = Number(arg('to')), oldDir = path.resolve(arg('old')), data = path.resolve(arg('data')), bodies = path.resolve(arg('bodies'));
let checks = 0; const fail = (m) => { throw new Error(m); }; const ok = (c, m) => { checks++; if (!c) fail(m); };

function client(base) {
  delete require.cache[require.resolve('../../public/js/corpus-fts.js')];
  const C = require('../../public/js/corpus-fts.js');
  C._resetForTest();
  global.fetch = (url) => { const file = decodeURIComponent(String(url).split('?')[0].replace(/^\/data\/benyehuda\//, '')); const p = path.join(base, file);
    return Promise.resolve(fs.existsSync(p) ? { ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8'))) } : { ok: false, status: 404 }); };
  return C;
}

(async () => {
  const root = JSON.parse(fs.readFileSync(path.join(dir, `corpus-catalog-v${to}.json`)));
  const relBytes = fs.readFileSync(path.join(dir, root.release_manifest));
  ok(sha(relBytes) === root.release_manifest_sha256, 'release not sealed by the catalog root');
  const rel = JSON.parse(relBytes);
  for (const [f, a] of Object.entries(rel.assets)) { const b = fs.readFileSync(path.join(dir, f)); ok(sha(b) === a.sha256 && b.length === a.bytes, 'asset seal ' + f); ok(/-v\d+\.json$/.test(f) ? f.endsWith(`-v${to}.json`) : f.startsWith('toc/'), 'asset version ' + f); }
  const search = JSON.parse(fs.readFileSync(path.join(dir, root.search_file)));
  const ord = new Map(search.map((r, i) => [String(r.id), i]));
  const cards = new Map(); for (const m of root.manifests) for (const c of JSON.parse(fs.readFileSync(path.join(dir, m.file))).works) cards.set(String(c.id), c);

  const C = client(dir); C.configure({ base: '/data/benyehuda/', version: to, dataRev: 1 });
  const m = await C.ensureManifest();
  ok(m.works_file === root.search_file, 'fts manifest works_file');
  const modern = rel.works.filter((w) => fs.existsSync(path.join(bodies, path.basename(w.body))));
  ok(modern.length === rel.modern.summary.works, 'Modern works count');
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  let partsChecked = 0, phraseRows = 0;
  for (const w of modern) {
    const card = cards.get(String(w.work_id)), o = ord.get(String(w.work_id));
    const parts = w.parts && w.parts.length > 1 ? JSON.parse(fs.readFileSync(path.join(dir, card.toc_file))).parts.map((p) => ({ ...p, body: w.parts.find((x) => x.part_id === p.part_id).body })) : [{ body: w.body }];
    // pick a row with ≥3 Hebrew words from a random part, take 3 consecutive words as a phrase
    let pi = rnd(parts.length), row = null, tries = 0;
    while (!row && tries++ < parts.length * 2) {
      const rows = JSON.parse(fs.readFileSync(path.join(bodies, path.basename(parts[pi].body)))).library.texts.flatMap((t) => t.rows);
      const cand = rows.filter((r) => C.tokenizeText(r.hebrew_niqqud || r.hebrew_plain || '').length >= 3);
      if (cand.length) row = cand[rnd(cand.length)]; else pi = (pi + 1) % parts.length;
    }
    if (!row) continue;
    const toks = C.tokenizeText(row.hebrew_niqqud || row.hebrew_plain || '');
    const at = rnd(toks.length - 2), q = toks.slice(at, at + 3).join(' ');
    const res = await C.phraseSearch(q);
    const hit = res.results.find((r) => r.w === o);
    ok(hit, `work ${w.work_id} not found by «${q}»`);
    phraseRows++;
    if (parts.length > 1) {
      const got = await C.partsWith(q, o);
      ok(got && got.toc_sha256 === card.toc_sha256 && String(got.work_id) === String(w.work_id), 'work_parts identity ' + w.work_id);
      ok(got.parts.includes(pi), `part ${pi} of ${w.work_id} holds «${q}» but the index does not list it`);
      partsChecked++;
    }
  }
  // works made of parts, exact: for 10 queries each (1–4 words) the parts listed by the index must equal the parts
  // whose TEXT holds every query word (skeletons from the client normaliser), and the query's own part is among them
  let exactParts = 0;
  for (const w of modern.filter((x) => x.parts && x.parts.length > 1)) {
    const card = cards.get(String(w.work_id)), o = ord.get(String(w.work_id));
    const toc = JSON.parse(fs.readFileSync(path.join(dir, card.toc_file)));
    const rowsOf = toc.parts.map((p) => JSON.parse(fs.readFileSync(path.join(bodies, path.basename(w.parts.find((x) => x.part_id === p.part_id).body)))).library.texts.flatMap((t) => t.rows));
    const skels = rowsOf.map((rows) => new Set(rows.flatMap((r) => C.tokenizeText(r.hebrew_niqqud || r.hebrew_plain || '').map(C.normalizeToken)).filter(Boolean)));
    for (let k = 0; k < 10; k++) {
      const pi = rnd(rowsOf.length), cand = rowsOf[pi].filter((r) => C.tokenizeText(r.hebrew_niqqud || r.hebrew_plain || '').length >= 4);
      if (!cand.length) continue;
      const pick = cand[rnd(cand.length)];
      const toks = C.tokenizeText(pick.hebrew_niqqud || pick.hebrew_plain || ''); const n = 1 + (k % 4), at = rnd(toks.length - n + 1), q = toks.slice(at, at + n).join(' ');
      const qs = [...new Set(C.tokenizeText(q).map(C.normalizeToken).filter(Boolean))];
      const truth = skels.map((set, i) => qs.every((t) => set.has(t)) ? i : -1).filter((i) => i >= 0);
      const got = await C.partsWith(q, o);
      ok(JSON.stringify(got.parts) === JSON.stringify(truth), `${w.work_id} «${q}»: index ${JSON.stringify(got.parts.slice(0, 8))} ≠ text ${JSON.stringify(truth.slice(0, 8))}`);
      ok(truth.includes(pi), 'query part missing from truth ' + w.work_id);
      exactParts++;
    }
  }
  // other works keep their postings: compare decoded postings of untouched works for a sample of keys
  const modernOrds = new Set(modern.map((w) => ord.get(String(w.work_id))));
  const oldM = JSON.parse(fs.readFileSync(path.join(data, `corpus-fts-v${to - 1}.json`)));
  let compared = 0;
  for (const key of Object.keys(oldM.bucket_files).filter((_, i) => i % 15 === 0)) {
    const load = (base, files) => Object.assign({}, ...files.map((f) => JSON.parse(fs.readFileSync(path.join(base, f)))));
    const a = load(oldDir, oldM.bucket_files[key]), b = load(dir, m.bucket_files[key] || []);
    for (const k of Object.keys(a).slice(0, 200)) {
      const keep = (flat) => JSON.stringify(C.decodePositions(flat || []).filter((x) => !modernOrds.has(x.w)));
      ok(keep(a[k]) === keep(b[k]), 'postings changed for unrelated works: ' + k); compared++;
    }
  }
  console.log(JSON.stringify({ checks, modern_works_found_by_phrase: phraseRows, multipart_part_checks: partsChecked, multipart_exact_part_checks: exactParts, unrelated_keys_compared: compared, indexed: m.counts.indexed }));
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
