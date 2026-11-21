'use strict';
// Search normalization (docs/superpowers/specs/2026-11-21-news-findability-design.md §2 п.3).
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../news/newsSearchNorm');

test('normHe: niqqud and final forms', () => {
  assert.equal(N.normHe('הַבְּחִירוֹת'), N.normHe('הבחירות'));
  assert.equal(N.normHe('שלום'), 'שלומ');
});
test('normHe: geresh variants are one', () => {
  assert.equal(N.normHe("צ'ילה"), N.normHe('צ׳ילה'));
  assert.equal(N.normHe('צה"ל'), N.normHe('צה״ל'));
  assert.equal(N.normHe("צ'ילה").split(' ').length, 1, 'the word is not split in two');
});
test('normHe: maqaf separates words instead of gluing them', () => {
  assert.equal(N.normHe('בית־ספר'), 'בית ספר');
});
test('stemsHe: prefixes stripped', () => {
  const st = N.stemsHe(N.normHe('ובבחירות')).split(' ');
  assert.ok(st.includes('בחירות'), st.join(','));
  assert.ok(st.includes('בבחירות'));
  assert.ok(!N.stemsHe('של ול').split(' ').filter(Boolean).some(w => w.length < 2), 'no one-letter stems');
});
test('normRu: case and ё', () => {
  assert.equal(N.normRu('Ёлка ВЫБОРЫ'), 'елка выборы');
});
test('ftsQuery: injection-safe', () => {
  const q = N.ftsQuery('a" OR x');
  assert.equal((q.match(/"/g) || []).length % 2, 0);
  assert.ok(!/\bOR x\b/.test(q.replace(/"[^"]*"/g, '')), 'user text never becomes an operator');
  assert.equal(N.ftsQuery('   '), null);
  assert.equal(N.ftsQuery('"'), null);
});
test('ftsQuery: Hebrew word looks in he and stems, Russian in ru', () => {
  const q = N.ftsQuery('ובבחירות выборы');
  assert.match(q, /\{he stems\}/); assert.match(q, /"בחירות"(?!\*)/); assert.match(q, /"ובבחירות"\*/); assert.match(q, /\{ru\} : \("выборы"\*\)/);
});

// Review W2 I1: prefixes are stripped only while a real word is left, and stripped forms match whole words.
test('ftsQuery precision: ממשלה does not find שלהם; בית does not find יתרון; prefixes still work', async () => {
  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database(':memory:');
  const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
  const ids = q => new Promise((res, rej) => db.all('SELECT rowid FROM t WHERE t MATCH ? ORDER BY rowid', [N.ftsQuery(q)], (e, r) => e ? rej(e) : res(r.map(x => x.rowid))));
  await run("CREATE VIRTUAL TABLE t USING fts5(he, stems, ru, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 0')");
  const docs = ['שלהם', 'יתרון', 'הממשלה החדשה', 'בית ספר', 'בחירות', 'ובבחירות', 'הבית'];
  for (let i = 0; i < docs.length; i++) { const he = N.normHe(docs[i]); await run('INSERT INTO t(rowid, he, stems, ru) VALUES (?,?,?,?)', [i + 1, he, N.stemsHe(he), '']); }
  assert.deepEqual(await ids('ממשלה'), [3]);
  assert.deepEqual(await ids('בית'), [4, 7]);
  assert.deepEqual(await ids('ובבחירות'), [5, 6]);
  assert.deepEqual(await ids('הבית'), [4, 7]);
  db.close();
});
