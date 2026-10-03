'use strict';
// Read-only production verification. Compare served bytes with a fixed commit;
// preserve each round so a rolling/mixed deployment cannot pass on version alone.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const BASE = 'https://linguistpro.kolosei.com';
const git = args => execFileSync('git', args, { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
const commit = process.env.MATERIAL_RELEASE_COMMIT || git(['rev-parse', 'HEAD']).toString().trim();
const version = git(['show', `${commit}:public/sw.js`]).toString().match(/const CACHE_VERSION = "v([^"]+)"/)[1];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const files = git(['diff', '--name-only', '9d1d11e7', commit, '--', 'public']).toString().trim().split(/\r?\n/).filter(Boolean);
const expected = files.map(file => ({ file, sha256: sha(git(['show', `${commit}:${file}`])) }));
const output = process.env.MATERIAL_RELEASE_OUTPUT ? path.resolve(process.env.MATERIAL_RELEASE_OUTPUT)
  : path.join(ROOT, 'docs/research/reliability-performance/2026-10-03/production', version);
async function get(url) {
  const response = await fetch(BASE + url + '?reliability_verify=' + Date.now(), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, url); return response;
}
async function main() {
  const probes = [];
  for (let round = 0; round < 3; round++) {
    if (round) await new Promise(resolve => setTimeout(resolve, 10000));
    const config = await (await get('/api/client-config')).json();
    const health = await (await get('/healthz')).json();
    assert.equal(config.version, version);
    assert.equal(health.ok, true); assert.equal(health.db.ready, true); assert.equal(health.migrations.ready, true);
    const assets = [];
    for (const item of expected) {
      const url = item.file.slice('public'.length);
      const bytes = Buffer.from(await (await get(url)).arrayBuffer());
      assert.equal(sha(bytes), item.sha256, 'served artifact drift: ' + url);
      assets.push({ url, sha256: item.sha256, sizeBytes: bytes.length });
    }
    probes.push({ at: new Date().toISOString(), version: config.version, healthReady: true,
      diskWarn: health.disk_warn, diskPercent: health.disk_pct_used, assets });
    console.log(`PASS round ${round + 1}: version, health and ${assets.length} served assets`);
  }
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'served-assets.json'), JSON.stringify({ status: 'PASS', commit, probes }, null, 2) + '\n');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
