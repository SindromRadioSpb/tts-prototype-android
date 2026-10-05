// Read-only public baseline snapshot. No credentials, uploads, deletes, or client DB access.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const args = process.argv.slice(2);
const arg = (name, fallback) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
const base = arg('base', 'https://linguistpro.kolosei.com').replace(/\/$/, '');
const out = path.resolve(arg('out', '.tmp/learning-release/baseline'));
const hashes = {};
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function get(relative, bust = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(base + '/' + relative + (bust ? '?inventory=' + Date.now() : ''), { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(relative + ': HTTP ' + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      const dest = path.join(out, relative);
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, bytes);
      hashes[relative] = { bytes: bytes.length, sha256: hash(bytes) };
      return bytes;
    } catch (error) { if (attempt === 2) throw error; }
  }
}
if (args.includes('--fts-only')) {
  const snapshot = JSON.parse(fs.readFileSync(path.join(out, 'snapshot.json'), 'utf8'));
  const fts = snapshot.fts;
  const files = [...new Set([...Object.values(fts.bucket_files).flat(), ...fts.lemma_files, fts.lemmamap_file])];
  let done = 0; const queue = [...files];
  await Promise.all(Array.from({length: 6}, async () => {
    while (queue.length) { await get('data/benyehuda/' + queue.shift()); if (++done % 50 === 0) console.log('FTS baseline', done, '/', files.length); }
  }));
  snapshot.files = {...snapshot.files, ...hashes};
  fs.writeFileSync(path.join(out, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
  console.log('FTS snapshot bytes', Object.values(hashes).reduce((n, x) => n + x.bytes, 0));
  process.exit(0);
}
const health = JSON.parse((await get('healthz', true)).toString());
const sw = (await get('sw.js', true)).toString();
const ui = (await get('js/library-ui.js', true)).toString();
const version = Number(ui.match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/)[1]);
const prefix = 'data/benyehuda/';
const root = JSON.parse((await get(prefix + 'corpus-catalog-v' + version + '.json')).toString());
for (const file of [root.index_file, root.search_file, 'corpus-catalog-v2.json', 'corpus-fts-v' + version + '.json', 'corpus-vocab-v' + version + '.json', 'corpus-authors-v' + version + '.json', ...root.manifests.map(item => item.file)]) await get(prefix + file);
const cards = [];
for (const item of root.manifests) {
  const manifest = JSON.parse(fs.readFileSync(path.join(out, prefix, item.file), 'utf8'));
  cards.push(...(manifest.works || manifest.cards || []));
}
let done = 0;
const ids = root.pointers.ready.map(String);
const queue = [...ids];
await Promise.all(Array.from({length: 6}, async () => {
  while (queue.length) {
    const id = queue.shift(); await get(prefix + 'works/' + id + '.json');
    if (++done % 50 === 0) console.log('baseline bodies', done, '/', ids.length);
  }
}));
const fts = JSON.parse(fs.readFileSync(path.join(out, prefix, 'corpus-fts-v' + version + '.json'), 'utf8'));
fs.writeFileSync(path.join(out, 'snapshot.json'), JSON.stringify({ schema: 'public-benyehuda-snapshot-v1', captured_at: new Date().toISOString(), base, version, cache_version: sw.match(/const CACHE_VERSION\s*=\s*"([^"]+)"/)[1], health, ready_ids: ids, manifest_cards: cards.length, fts, files: hashes }, null, 2));
console.log(JSON.stringify({version, ready: ids.length, files: Object.keys(hashes).length, bytes: Object.values(hashes).reduce((n,x)=>n+x.bytes,0), cache_version: sw.match(/const CACHE_VERSION\s*=\s*"([^"]+)"/)[1]}));
