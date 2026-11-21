'use strict';
// Full text 45 days (docs/superpowers/specs/2026-11-21-news-findability-design.md §2 п.5).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { openDb } = require('./helpers/newsDb.cjs');
const { bodyOf, packBody, hasBody } = require('../news/harvest/newsBody');
const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));

const ART = { title_he: 'כותרת', paragraphs: ['פסקה ראשונה ארוכה.', 'פסקה שנייה.'], images: [] };
test('bodyOf reads the plain and the compressed body alike', () => {
  assert.deepEqual(bodyOf({ data_json: JSON.stringify(ART) }), ART);
  assert.deepEqual(bodyOf({ data_json: null, data_gz: packBody(ART) }), ART);
  assert.equal(bodyOf({ data_json: null, data_gz: null }), null);
  assert.equal(bodyOf({ data_json: '{broken' }), null);
  assert.equal(hasBody({ data_gz: packBody(ART) }), true); assert.equal(hasBody({}), false);
});
test('cleanup compresses bodies after 3 days and keeps the fresh ones plain', async () => {
  const db = await openDb();
  const NOW = Date.parse('2026-11-21T12:00:00Z');
  const ins = (k, daysAgo) => run(db, `INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status, data_json) VALUES (?,?,?,?,'ready',?)`,
    [k, 'ynet', 'https://www.ynet.co.il/news/article/' + k, new Date(NOW - daysAgo * 86400000).toISOString(), JSON.stringify(ART)]);
  await ins('na_' + 'a'.repeat(24), 1); await ins('na_' + 'b'.repeat(24), 5); await ins('na_' + 'c'.repeat(24), 44);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-body-'));
  const { createNewsHarvester } = require('../news/harvest/newsHarvest');
  await createNewsHarvester({ db, dataDir, now: () => NOW, fetchImpl: async () => { throw new Error('offline'); } }).cleanup();
  const rows = await all(db, 'SELECT url_key, data_json, data_gz FROM news_harvest_items ORDER BY url_key');
  assert.equal(rows.length, 3, '44 days is still inside the 45');
  assert.ok(rows[0].data_json && !rows[0].data_gz, 'one day: plain');
  for (const r of rows.slice(1)) { assert.equal(r.data_json, null); assert.deepEqual(bodyOf(r), ART); }
  fs.rmSync(dataDir, { recursive: true, force: true });
  db.close();
});
