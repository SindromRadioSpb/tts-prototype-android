'use strict';
// Fail closed if a discovery-only release changes published corpus payloads.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const fixture = path.join(root, 'docs/research/room-discovery/2026-10-04/corpus-baseline.json');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function check({ checkDiff = false } = {}) {
  const baseline = JSON.parse(fs.readFileSync(fixture));
  for (const entry of baseline.files) {
    const bytes = fs.readFileSync(path.join(root, entry.path));
    if (bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) throw new Error('Published corpus changed: ' + entry.path);
  }
  const allowed = new Set([...baseline.files.map(entry => entry.path), 'public/data/benyehuda/author-aliases-v1.json']);
  const visit = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) visit(file); else { const relative = path.relative(root, file).replace(/\\/g, '/'); if (!allowed.has(relative)) throw new Error('Unexpected corpus payload: ' + relative); } } };
  visit(path.join(root, 'public/data/benyehuda'));
  const index = JSON.parse(fs.readFileSync(path.join(root, 'public/data/benyehuda/corpus-index-v7.json')));
  const search = JSON.parse(fs.readFileSync(path.join(root, 'public/data/benyehuda/corpus-search-v7.json')));
  if (hash(JSON.stringify(index.ready.map(card => String(card.id)).sort())) !== baseline.readyIdsSha256) throw new Error('Ready IDs changed');
  if (hash(JSON.stringify(search.map(card => String(card.id)).sort())) !== baseline.catalogIdsSha256) throw new Error('Catalog IDs changed');
  // No database schema/writer or corpus publisher is in this release's allowlist.
  const changed = checkDiff ? execFileSync('git', ['diff', '--name-only', baseline.base, '--'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean) : [];
  const forbidden = changed.filter(file => /^(?:db\/|public\/db\/|scripts\/premium\/(?:publish|bake|ingest|build-corpus|push-corpus)|Dockerfile|\.dockerignore)/.test(file));
  if (forbidden.length) throw new Error('Publisher/schema/writer changed: ' + forbidden.join(', '));
  return { base: baseline.base, files: baseline.files.length, ready: index.ready.length, catalog: search.length, result: 'unchanged' };
}
if (require.main === module) console.log(JSON.stringify(check({ checkDiff: true })));
module.exports = { check };
