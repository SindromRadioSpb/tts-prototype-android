#!/usr/bin/env node
'use strict';
// Independent check of a catalog built on official Ben-Yehuda periods (build-catalog-periods.js output).
// It does not reuse the builder: it compares the new catalog with the previous sealed catalog and with the
// raw official-period snapshot, and verifies the seal.
//   • same works, same ready set, same search order (full-text ordinals);
//   • every card's section == its official period from the snapshot (or «none» when the source has none);
//   • every card carries verifiable evidence (work id, source URL, snapshot hash);
//   • nothing «known» disagrees with older evidence; no ready work has changed rights;
//   • every file named in the release manifest matches its sha256; the root names that manifest by hash.
// Usage: node catalog-periods-smoke.js --old <dir with vN> --new <dir with vN+1> --periods <snapshot dir> --from N --to N+1

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');

const args = {}; process.argv.slice(2).forEach((a, i, all) => { if (a.startsWith('--')) args[a.slice(2)] = all[i + 1]; });
const read = (d, f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const from = Number(args.from), to = Number(args.to);
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

const oldRoot = read(args.old, `corpus-catalog-v${from}.json`);
const newRoot = read(args.new, `corpus-catalog-v${to}.json`);
const official = read(args.periods, 'official-periods.json').periods;   // id → [period]
const allPd = new Set(read(args.periods, 'period-all.json').ids);
const cardsOf = (dir, root) => root.manifests.flatMap((m) => read(dir, m.file).works);
const oldCards = cardsOf(args.old, oldRoot), newCards = cardsOf(args.new, newRoot);
const oldById = new Map(oldCards.map((c) => [String(c.id), c]));

ok(newRoot.version === to && newRoot.taxonomy_source === 'benyehuda-official', 'root is the official-period catalog');
ok(newCards.length === oldCards.length && newCards.every((c) => oldById.has(String(c.id))), 'same works');
ok(new Set(newCards.map((c) => String(c.id))).size === newCards.length, 'no duplicate cards');
const PERIODS = ['ancient', 'medieval', 'enlightenment', 'revival', 'modern', 'none'];
ok(newRoot.era_taxonomy.every((t) => PERIODS.includes(t.era) && t.classification === 'benyehuda-official'), 'only official sections');
ok(JSON.stringify(newRoot.era_taxonomy.map((t) => t.era)) === JSON.stringify(PERIODS.filter((p) => newRoot.era_taxonomy.some((t) => t.era === p))), 'official order');

for (const c of newCards) {
  const id = String(c.id), want = official[id] ? official[id][0] : 'none';
  ok(c.era === want, `work ${id}: section ${c.era}, official ${want}`);
  const sp = c.source_period || {};
  ok(sp.scope === 'work' && sp.work_id === id && /^https:\/\/benyehuda\.org\//.test(sp.source_url || '') && /^(sha256:[0-9a-f]{64}|http:\d+)$/.test(sp.snapshot || ''), `work ${id}: evidence`);
  ok(want === 'none' ? sp.status === 'checked-absent' : sp.status === 'known' && sp.value === want, `work ${id}: evidence status`);
  const before = oldById.get(id).source_period;
  if (before && before.status === 'known') ok(before.value === c.era, `work ${id}: older evidence said ${before.value}`);
  if (c.source_removed || c.source_rights) ok(!allPd.has(id), `work ${id}: marked although listed as public domain`);
}

const ready = (root, dir) => new Set(read(dir, root.index_file).ready.map((c) => String(c.id)));
const oldReady = ready(oldRoot, args.old), newReady = ready(newRoot, args.new);
ok(oldReady.size === newReady.size && [...oldReady].every((id) => newReady.has(id)), 'same ready works');
ok([...newReady].every((id) => { const c = newCards.find((x) => String(x.id) === id); return !c.source_rights && !c.source_removed; }), 'no ready work removed or with changed rights');
const oldSearch = read(args.old, oldRoot.search_file), newSearch = read(args.new, newRoot.search_file);
ok(oldSearch.map((r) => r.id).join() === newSearch.map((r) => r.id).join(), 'search order unchanged (FTS ordinals)');
ok(newSearch.every((r) => r.e === (official[String(r.id)] ? official[String(r.id)][0] : 'none')), 'search period letters');

const release = read(args.new, newRoot.release_manifest);
ok(sha(fs.readFileSync(path.join(args.new, newRoot.release_manifest))) === newRoot.release_manifest_sha256, 'root seals the release manifest');
ok(release.catalog_version === to, 'release manifest version');
for (const [file, a] of Object.entries(release.assets)) {
  const local = path.join(args.new, file);
  if (fs.existsSync(local)) ok(sha(fs.readFileSync(local)) === a.sha256, 'asset hash ' + file);
}
for (const f of [newRoot.index_file, newRoot.search_file, newRoot.authors_file, ...newRoot.manifests.map((m) => m.file)]) ok(!!release.assets[f], 'sealed ' + f);
console.log(`catalog-periods-smoke: ${checks} checks passed · ${newCards.length} works · ready ${newReady.size}`);
