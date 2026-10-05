'use strict';
// Preserve every released v7 payload; additive v8 requires a sealed asset allowlist.
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
  const data = 'public/data/benyehuda/', publicationPath = data + 'learning-release-v8.json';
  let publication = null;
  if (fs.existsSync(path.join(root, publicationPath))) {
    const catalogPath = data + 'corpus-catalog-v8.json', catalog = JSON.parse(fs.readFileSync(path.join(root, catalogPath)));
    const bytes = fs.readFileSync(path.join(root, publicationPath));
    if (hash(bytes) !== catalog.release_manifest_sha256) throw new Error('Unsealed learning publication');
    publication = JSON.parse(bytes);
    const ids = [...publication.works, ...publication.retained_works].map(work => String(work.work_id));
    if (catalog.version !== 8 || publication.catalog_version !== 8 || ids.length !== catalog.counts.baked || new Set(ids).size !== ids.length) throw new Error('Publication identity/count mismatch');
    allowed.add(publicationPath); allowed.add(catalogPath);
    for (const [file, asset] of Object.entries(publication.assets)) {
      if (file.startsWith('fts/')) continue; // checked on the volume by the release validator/upload preflight
      if (!/^(?:catalog\/era-[a-z0-9-]+-v8|corpus-(?:index|search|authors|fts|vocab)-v8|translit-ru-v8)\.json$/.test(file)) throw new Error('Unsafe publication asset: ' + file);
      const assetBytes = fs.readFileSync(path.join(root, data + file));
      if (hash(assetBytes) !== asset.sha256 || assetBytes.length !== asset.bytes) throw new Error('Publication asset changed: ' + file);
      allowed.add(data + file);
    }
  }
  const tracked = execFileSync('git', ['-c', 'safe.directory=' + root, 'ls-files', '--', data + 'works', data + 'fts'], { cwd: root, encoding: 'utf8' }).trim();
  if (tracked) throw new Error('Corpus volume payloads must not enter git');
  const visit = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) { if (!/^(?:works|fts)$/.test(entry.name)) visit(file); } else { const relative = path.relative(root, file).replace(/\\/g, '/'); if (!allowed.has(relative)) throw new Error('Unexpected corpus payload: ' + relative); } } };
  visit(path.join(root, 'public/data/benyehuda'));
  const index = JSON.parse(fs.readFileSync(path.join(root, 'public/data/benyehuda/corpus-index-v7.json')));
  const search = JSON.parse(fs.readFileSync(path.join(root, 'public/data/benyehuda/corpus-search-v7.json')));
  if (hash(JSON.stringify(index.ready.map(card => String(card.id)).sort())) !== baseline.readyIdsSha256) throw new Error('Ready IDs changed');
  if (hash(JSON.stringify(search.map(card => String(card.id)).sort())) !== baseline.catalogIdsSha256) throw new Error('Catalog IDs changed');
  // A sealed publication permits these read-only resolvers; schema/writers stay excluded.
  const changed = checkDiff ? execFileSync('git', ['-c', 'safe.directory=' + root, 'diff', '--name-only', baseline.base, '--'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean) : [];
  const publicationReaders = new Set(['db/corpusSentenceRepo.js', 'db/benyehudaLearningRelease.js', 'scripts/premium/build-corpus-vocab.js']);
  if (publication && changed.includes('.dockerignore')) {
    const original = execFileSync('git', ['-c', 'safe.directory=' + root, 'show', baseline.base + ':.dockerignore'], { cwd: root, encoding: 'utf8' }).replace(/\r\n/g, '\n').trimEnd();
    const expected = original + '\n\n# Publication staging and generated FTS payloads are private/volume-only.\n.tmp/\npublic/data/benyehuda/fts/';
    if (fs.readFileSync(path.join(root, '.dockerignore'), 'utf8').replace(/\r\n/g, '\n').trimEnd() !== expected) throw new Error('Publication may only exclude staging and volume FTS from Docker');
    publicationReaders.add('.dockerignore');
  }
  const forbidden = changed.filter(file => /^(?:db\/|public\/db\/|scripts\/premium\/(?:publish|bake|ingest|build-corpus|push-corpus)|Dockerfile|\.dockerignore)/.test(file) && !(publication && publicationReaders.has(file)));
  if (forbidden.length) throw new Error('Publisher/schema/writer changed: ' + forbidden.join(', '));
  return { base: baseline.base, files: baseline.files.length, ready: index.ready.length, catalog: search.length, result: 'unchanged' };
}
if (require.main === module) console.log(JSON.stringify(check({ checkDiff: true })));
module.exports = { check };
