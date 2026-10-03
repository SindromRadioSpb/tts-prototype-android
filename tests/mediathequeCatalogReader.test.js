'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { createMediathequeCatalogReader } = require('../db/mediathequeCatalogReader');
async function harness(t, maxEntries) {
  const db = new sqlite3.Database(':memory:');
  t.after(() => new Promise(resolve => db.close(resolve)));
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
  const exec = sql => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
  let projections = 0, failNext = false;
  const all = (sql, params = []) => {
    if (sql.includes('media_projection')) {
      projections++;
      if (failNext) { failNext = false; return Promise.reject(new Error('fixture projection failure')); }
    }
    return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
  };
  await exec(`CREATE TABLE published_corpora(slug TEXT,title TEXT,status TEXT,current_edition_id TEXT);
    CREATE TABLE published_corpus_editions(edition_id TEXT,published_at TEXT);
    CREATE TABLE published_corpus_edition_items(edition_item_id TEXT,edition_id TEXT,public_work_id TEXT,
      snapshot_sha256 TEXT,title TEXT,creator TEXT,position_no INTEGER,package_download_allowed INTEGER,
      public_read_allowed INTEGER,snapshot_json TEXT);
    INSERT INTO published_corpora VALUES('public','Channel','PUBLISHED','v1');
    INSERT INTO published_corpus_editions VALUES('v1','2026-10-03');`);
  const insert = async (id, edition = 'v1', title = 'Title ' + id) => run(
    'INSERT INTO published_corpus_edition_items VALUES(?,?,?,?,?,?,?,?,?,?)',
    [id, edition, 'work-' + id, 'hash-' + id, title, 'Author', Number(id) || 0, 1, 1,
      JSON.stringify({ library: { texts: [{ topic: 'Topic', tags: ['tag'], source_text: 'BODY MUST NOT ESCAPE',
        source_meta: { source: { audio: { video: { videoId: 'dQw4w9WgXcQ' }, durationSec: 45 } }, apiKey: 'DO NOT EXPOSE' },
        rows: [{ hebrew_plain: 'שלום', russian: 'Привет' }] }] } })]);
  return { read: createMediathequeCatalogReader({ all, maxEntries }), run, insert,
    projections: () => projections, fail: () => { failNext = true; } };
}

test('warm metadata cache never grants read or download rights and follows current editions immediately', async t => {
  const h = await harness(t); await h.insert('1');
  const first = await h.read(); assert.equal(first.length, 1); assert.equal(first[0].media.videoId, 'dQw4w9WgXcQ');
  assert.equal(first[0].has_translation, 1); assert.doesNotMatch(JSON.stringify(first), /BODY MUST|DO NOT EXPOSE|edition_item_id|snapshot_json/);
  first[0].tags.push('mutation'); first[0].media.source = 'mutation';
  const second = await h.read(); assert.deepEqual(second[0].tags, ['tag']); assert.equal(second[0].media.source, 'YouTube');
  assert.equal(h.projections(), 1, 'warm requests do not parse snapshots again');
  await h.run('UPDATE published_corpus_edition_items SET package_download_allowed=0');
  assert.equal((await h.read())[0].download_allowed, 0);
  await h.run('UPDATE published_corpus_edition_items SET public_read_allowed=0');
  assert.deepEqual(await h.read(), []);
  await h.run('UPDATE published_corpus_edition_items SET public_read_allowed=1');
  await h.run("UPDATE published_corpora SET status='WITHDRAWN'"); assert.deepEqual(await h.read(), []);
  await h.run("UPDATE published_corpora SET status='PUBLISHED',current_edition_id='v2'");
  await h.run("INSERT INTO published_corpus_editions VALUES('v2','2026-10-04')");
  await h.insert('2', 'v2', 'New edition');
  assert.deepEqual((await h.read()).map(row => row.title), ['New edition']);
  assert.equal(h.projections(), 2);
});

test('catalogs exceeding cache capacity retain all rows across SQL chunks and repeated reads', async t => {
  const h = await harness(t, 2);
  for (let i = 0; i < 70; i++) await h.insert(String(i));
  for (let pass = 0; pass < 2; pass++) {
    const rows = await h.read(); assert.equal(rows.length, 70);
    assert.deepEqual(rows.map(row => row.public_work_id), Array.from({ length: 70 }, (_, i) => 'work-' + i));
  }
});

test('overlapping cold requests share projections and a failed load remains retryable', async t => {
  const h = await harness(t); await h.insert('1');
  h.fail(); await assert.rejects(h.read(), /fixture projection failure/);
  const results = await Promise.all([h.read(), h.read(), h.read()]);
  assert.ok(results.every(rows => rows.length === 1));
  assert.equal(h.projections(), 2, 'one failure plus one shared successful projection');
});
