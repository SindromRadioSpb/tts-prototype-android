'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/reader-core.js'), 'utf8');
const core = () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('Room omits hidden Studio edit controls while preserving every text cell, row identity and audio action', async () => {
  const { buildBilingualTableHtml } = await core();
  const rows = [{ he: 'שלום', he_niqqud: 'שָׁלוֹם', translit: 'shalom', ru: 'мир', _v3_sentenceId: 's1', _v3_textId: 't1' }];
  const doc = config => parseHTML('<html><body>' + buildBilingualTableHtml(rows, config) + '</body></html>').document;
  const studio = doc({}), room = doc({ readOnly: true });
  assert.ok(studio.querySelector('.row-note-btn'));
  assert.equal(studio.querySelectorAll('.row-edit-btn').length, 4);
  assert.equal(room.querySelectorAll('.row-note-btn,.row-edit-actions').length, 0);
  assert.equal(room.querySelector('.row-tts-btn').dataset.rowIdx, '0');
  assert.equal(room.querySelector('tbody tr').dataset.sentenceId, 's1');
  for (const name of ['he', 'niqqud', 'translit', 'ru']) assert.equal(room.querySelector('td[data-col="' + name + '"]').textContent, studio.querySelector('td[data-col="' + name + '"]').textContent);
});

test('sentence identity survives a hidden action column and is escaped independently of edit permission', async () => {
  const { buildBilingualTableHtml } = await core();
  const RM = require('../public/js/reader-morph.js');
  const sid = 'sentence"<&';
  for (const readOnly of [true, false]) {
    const html = buildBilingualTableHtml([{ he: 'יופי', _v3_sentenceId: sid }], { readOnly, visibleColumns: { he: true } });
    const { document } = parseHTML('<html><body>' + html + '</body></html>');
    const tr = document.querySelector('tbody tr');
    assert.equal(tr.dataset.sentenceId, sid);
    assert.equal(document.querySelector('[data-col="action"]'), null);
    tr.firstChild.innerHTML = '<span class="rm-w" data-w-offset="0">יופי</span>';
    assert.deepEqual(RM.placeOfSpan(tr.querySelector('.rm-w')), { sid, off: 0 });
  }
});

test('a hidden transliteration column does not enqueue expensive derivations', async () => {
  const { buildBilingualTableHtml } = await core();
  let calls = 0;
  const html = buildBilingualTableHtml([{ he: 'שלום', he_niqqud: 'שָׁלוֹם' }], {
    visibleColumns: { he: true, niqqud: true }, translitDisplay: () => { calls++; return 'derived'; },
  });
  assert.equal(calls, 0);
  assert.ok(html.includes('שָׁלוֹם'));
});
