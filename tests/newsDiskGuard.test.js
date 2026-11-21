'use strict';
// Disk guard (docs/superpowers/specs/2026-11-21-news-findability-design.md §2 п.5, §8а п.7).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { openDb } = require('./helpers/newsDb.cjs');
const { createDiskGuard } = require('../news/newsDiskGuard');
const { createNewsHarvester } = require('../news/harvest/newsHarvest');
const { packBody } = require('../news/harvest/newsBody');
const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const NOW = Date.parse('2026-11-21T12:00:00Z');

test('disk guard: free space below 2 GB is low', async () => {
  const g = createDiskGuard({ dir: '.', statfs: async () => ({ bavail: 100, bsize: 1024 ** 2 }) });
  assert.deepEqual(await g.check(), { free: 100 * 1024 ** 2, low: true });
  const ok = createDiskGuard({ dir: '.', statfs: async () => ({ bavail: 3 * 1024, bsize: 1024 ** 2 }) });
  assert.equal((await ok.check()).low, false);
  const broken = createDiskGuard({ dir: '.', statfs: async () => { throw new Error('no statfs'); } });
  assert.equal((await broken.check()).low, false, 'unknown is not low');
});

async function setup(lowChecks) {
  const db = await openDb(), dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-guard-'));
  for (const d of [40, 30, 10, 2]) await run(db, `INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status, title_he, data_gz) VALUES (?,?,?,?,'ready','כותרת',?)`,
    ['na_' + String(d).padStart(24, '0'), 'ynet', 'https://www.ynet.co.il/news/article/' + d, new Date(NOW - d * 86400000).toISOString(), packBody({ paragraphs: ['טקסט ' + d] })]);
  let i = 0; const refreshed = [];
  const diskGuard = { check: async () => ({ free: 0, low: lowChecks[Math.min(i++, lowChecks.length - 1)] }) };
  const h = createNewsHarvester({ db, dataDir, now: () => NOW, fetchImpl: async () => { throw new Error('offline'); }, diskGuard,
    index: { refresh: async k => { refreshed.push(...k); return {}; }, prune: async () => 0 } });
  return { db, h, refreshed, dataDir };
}
const bodies = db => all(db, 'SELECT url_key FROM news_harvest_items WHERE data_gz IS NOT NULL ORDER BY first_seen_at').then(r => r.map(x => Number(x.url_key.slice(3))));

test('low disk trims one day per cleanup — freed pages do not show as free disk (review W3 I1)', async () => {
  const { db, h, refreshed, dataDir } = await setup([true]);
  await h.cleanup();
  assert.deepEqual(await bodies(db), [30, 10, 2], 'still low: only the oldest day goes in one pass');
  await h.cleanup();
  assert.deepEqual(await bodies(db), [10, 2], 'the next pass takes the next day');
  assert.ok(refreshed.includes('na_' + '40'.padStart(24, '0')), 'trimmed rows are re-indexed without text');
  const [s] = await all(db, "SELECT value_json FROM news_settings WHERE key='search_horizon'");
  assert.equal(JSON.parse(s.value_json).from_day, '2026-11-11');
  fs.rmSync(dataDir, { recursive: true, force: true }); db.close();
});
test('never trims inside 3 days, however many passes', async () => {
  const { db, h, dataDir } = await setup([true]);
  for (let i = 0; i < 6; i++) await h.cleanup();
  assert.deepEqual(await bodies(db), [2]);
  fs.rmSync(dataDir, { recursive: true, force: true }); db.close();
});
test('normal disk leaves 45 days and no horizon', async () => {
  const { db, h, dataDir } = await setup([false]);
  await h.cleanup();
  assert.deepEqual(await bodies(db), [40, 30, 10, 2]);
  assert.equal((await all(db, "SELECT 1 FROM news_settings WHERE key='search_horizon'")).length, 0);
  fs.rmSync(dataDir, { recursive: true, force: true }); db.close();
});
