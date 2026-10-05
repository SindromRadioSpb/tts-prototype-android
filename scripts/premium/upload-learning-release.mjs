// Default is a local dry run. --check-remote is read-only; --apply requires the reviewed seal.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
const argv = process.argv.slice(2), arg = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const dir = path.resolve(arg('--dir', '.tmp/learning-release'));
const candidate = path.join(dir, 'candidate');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const rootBytes = fs.readFileSync(path.join(candidate, 'corpus-catalog-v8.json'));
const root = JSON.parse(rootBytes), manifestBytes = fs.readFileSync(path.join(candidate, root.release_manifest));
if (sha(manifestBytes) !== root.release_manifest_sha256) throw Error('Local release manifest mismatch');
const manifest = JSON.parse(manifestBytes), seal = JSON.parse(fs.readFileSync(path.join(dir, 'release-seal.json')));
if (seal.root_sha256 !== sha(rootBytes) || seal.manifest_sha256 !== sha(manifestBytes)) throw Error('Local seal mismatch');
const expected = new Map(manifest.works.flatMap(w => [[w.body,w.body_sha256],[w.preview,w.preview_sha256]]));
for (const [file, item] of Object.entries(manifest.assets)) if (file.startsWith('fts/')) expected.set(file, item.sha256);
if (expected.size !== seal.upload_files) throw Error('Upload allowlist mismatch');
const payloads = [...expected].map(([file, hash]) => {
  if (!/^works\/\d{1,8}-([a-f0-9]{32}|[a-f0-9]{16}-preview)\.json$/.test(file)
    && !/^fts\/(ex-[א-ת]+(-\d+)?|lemma(-\d+)?|lemmamap)-v8\.json$/.test(file)) throw Error('Unsafe immutable namespace: ' + file);
  const bytes = fs.readFileSync(path.join(candidate, file)), json = JSON.parse(bytes);
  if (sha(bytes) !== hash || !Buffer.from(JSON.stringify(json)).equals(bytes)) throw Error('Bytes cannot roundtrip through upload API: ' + file);
  const works = file.startsWith('works/'), name = path.basename(file);
  const body = JSON.stringify(works ? { id: name.slice(0,-5), json } : { file: name, json });
  if (Buffer.byteLength(body) > 10*1024*1024) throw Error('Upload request too large');
  return { file, hash, endpoint: works ? '/api/benyehuda/works/upload' : '/api/benyehuda/fts/upload', bytes: bytes.length, request: zlib.gzipSync(body) };
});
const report = { manifest_sha256: sha(manifestBytes), root_sha256: sha(rootBytes), files: payloads.length,
  uncompressed_file_bytes: payloads.reduce((n,x) => n+x.bytes,0), compressed_request_bytes: payloads.reduce((n,x) => n+x.request.length,0), mode: 'dry-run' };
const apply = argv.includes('--apply'), checkRemote = argv.includes('--check-remote');
if (apply && (arg('--reviewed-manifest', '') !== sha(manifestBytes) || !process.env.AUDIO_UPLOAD_TOKEN)) throw Error('Reviewed manifest and owner upload token required');
if (apply) {
  const capacity = JSON.parse(fs.readFileSync(path.join(dir, 'capacity-preflight.json')));
  const age = Date.now() - Date.parse(capacity.measured_at_utc);
  if (capacity.capacity_gate !== 'pass' || capacity.manifest_sha256 !== sha(manifestBytes)
    || !Number.isFinite(age) || age < 0 || age > 10*60*1000) throw Error('Fresh passing capacity preflight for this manifest required');
}
if (apply || checkRemote) {
  const origin = arg('--origin', 'https://linguistpro.kolosei.com');
  if (new URL(origin).protocol !== 'https:' && !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('HTTPS or disposable loopback required');
  const baseline = fs.readFileSync(path.join(dir, 'baseline/data/benyehuda/corpus-catalog-v7.json'));
  const live = await fetch(origin + '/data/benyehuda/corpus-catalog-v7.json', { cache:'no-store' });
  if (!live.ok || sha(Buffer.from(await live.arrayBuffer())) !== sha(baseline)) throw Error('Public v7 baseline changed; re-inventory required');
  const liveUi = await fetch(origin + '/js/library-ui.js', { cache: 'no-store' });
  const activeVersion = (await liveUi.text()).match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/)?.[1];
  if (apply && activeVersion !== '7') throw Error('The publication base is no longer v7');
  let absent=0, identical=0, uploaded=0;
  for (const item of payloads) {
    const get = () => fetch(origin + '/data/benyehuda/' + item.file + '?seal=' + item.hash, { cache:'no-store' });
    const existing = await get();
    if (existing.ok) {
      if (sha(Buffer.from(await existing.arrayBuffer())) !== item.hash) throw Error('Immutable namespace collision: ' + item.file);
      identical++; continue;
    }
    if (existing.status !== 404) throw Error('Read preflight failed: ' + item.file + ' HTTP ' + existing.status);
    absent++;
    if (apply) {
      const response = await fetch(origin + item.endpoint, { method:'POST', headers:{ 'Content-Type':'application/json', 'Content-Encoding':'gzip', 'X-Audio-Upload-Token':process.env.AUDIO_UPLOAD_TOKEN }, body:item.request });
      if (!response.ok || !(await response.json()).ok) throw Error('Upload failed: ' + item.file + ' HTTP ' + response.status);
      const verified = await get();
      if (!verified.ok || sha(Buffer.from(await verified.arrayBuffer())) !== item.hash) throw Error('Uploaded checksum mismatch: ' + item.file);
      uploaded++;
    }
    if ((absent+identical)%100===0) console.log(JSON.stringify({ checked:absent+identical, absent, identical, uploaded }));
  }
  Object.assign(report, { mode: apply ? 'uploaded-verified' : 'read-only-remote', absent, identical, uploaded, activeVersion });
}
fs.writeFileSync(path.join(dir, apply ? 'upload-report.json' : checkRemote ? 'remote-check-report.json' : 'upload-dry-run.json'), JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
