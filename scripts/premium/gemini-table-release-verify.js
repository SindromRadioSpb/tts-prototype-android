'use strict';
// Read-only public production asset proof. No private config or provider keys.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const commit = process.argv[2];
if (!/^[0-9a-f]{40}$/.test(commit || '')) throw new Error('Pass the exact release commit');
const urls = ['/index.html', '/sw.js', '/library.html', '/download-media.html',
  '/i18n/locales/ru.js?v=212', '/i18n/locales/en.js?v=212', '/i18n/locales/he.js?v=212',
  '/js/studio-import.js', '/js/media-readiness.js', '/js/iphone-downloader-release.js', '/js/table-chunks.js', '/js/table-job.js'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  const base = 'https://linguistpro.kolosei.com';
  const config = await (await fetch(base+'/api/client-config?verify='+Date.now())).json();
  const assets = [];
  for (const url of urls) {
    const response = await fetch(base+url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    const expected = execFileSync('git', ['show', commit+':public'+url.split('?')[0]], { cwd: root, maxBuffer: 8*1024*1024 });
    const item = { url, status: response.status, bytes: bytes.length, sha256: sha(bytes), matchesRelease: bytes.equals(expected) };
    assets.push(item);
    if (!response.ok || !item.matchesRelease) throw new Error('ASSET_MISMATCH '+url);
  }
  const health = await fetch(base+'/healthz');
  if (!health.ok || config.version !== '3.11.494') throw new Error('RELEASE_NOT_READY');
  const report = { status: 'TECHNICAL_PASS', checkedAt: new Date().toISOString(), releaseCommit: commit,
    version: config.version, healthStatus: health.status, assets };
  const out = path.join(root, 'docs/research/studio-gemini-table-recovery/2026-09-08');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'production-assets.json'), JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify({ status: report.status, version: report.version, assets: assets.length, health: health.status }));
}
main().catch(e => { console.error(e.message); process.exitCode=1; });
