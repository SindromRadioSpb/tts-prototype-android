'use strict';
// Modern release F4: works made of parts — navigation, progress and «Продолжить» grouping.
const test = require('node:test');
const assert = require('node:assert/strict');
const WP = require('../public/js/work-parts.js');

const H = (c) => c.repeat(64);
const part = (id, track, parent, rows, n) => ({ part_id: id, order: n, track, parent, title: id, rows, text_key: H(String(n % 10)), bundle_sha256: H('f'), file: 'works/1-' + 'a'.repeat(32) + '.json', learning_edition_id: 'e' + n });
const TOC = { schema: 'benyehuda-work-toc-v1', work_id: '58052', parts: [
  part('s1-structure', 'structure', 's1', 7, 1), part('s1', 'text', null, 100, 2), part('s1-notes', 'notes', 's1', 10, 3),
  part('s2', 'text', null, 200, 4), part('s3', 'text', null, 300, 5), part('appendix', 'appendix', null, 20, 6)] };
const CARD = { id: '58052', title: 'פועל בארץ', parts: 6, toc_file: 'toc/58052-' + 'b'.repeat(16) + '.json', toc_sha256: H('b') };

test('a multi-part card is recognised only with a sealed table of contents', () => {
  assert.equal(WP.isMultipart(CARD), true);
  assert.equal(WP.isMultipart({ ...CARD, parts: 1 }), false);
  assert.equal(WP.isMultipart({ ...CARD, toc_sha256: 'x' }), false);
});

test('the table of contents must belong to its card', () => {
  assert.equal(WP.parseToc(CARD, JSON.stringify(TOC)).parts.length, 6);
  assert.throws(() => WP.parseToc({ ...CARD, id: '1' }, JSON.stringify(TOC)), /identity/);
  assert.throws(() => WP.parseToc(CARD, JSON.stringify({ ...TOC, parts: [TOC.parts[0], TOC.parts[0], ...TOC.parts.slice(2)] })), /Malformed/);
});

test('navigation walks the main text; a chapter note steps back to its chapter', () => {
  const nav = WP.navigation(TOC, 's2');
  assert.deepEqual([nav.number, nav.total, nav.prev.part_id, nav.next.part_id], [2, 4, 's1', 's3']);
  const note = WP.navigation(TOC, 's1-notes');
  assert.deepEqual([note.parent.part_id, note.number, note.next.part_id, note.prev], ['s1', 1, 's2', null]);
  const last = WP.navigation(TOC, 'appendix');
  assert.deepEqual([last.number, last.next, last.prev.part_id], [4, null, 's3']);
  assert.deepEqual(WP.children(TOC, 's1').map((p) => p.part_id), ['s1-structure', 's1-notes']);
});

test('work progress counts only parts opened on this device and resumes the most recent one', () => {
  const p = new Map([[TOC.parts[1].text_key, { last_row_idx: 99, finished_at: null, updated_at: '2026-10-20' }],
                     [TOC.parts[3].text_key, { last_row_idx: 49, finished_at: null, updated_at: '2026-10-22' }]]);
  const w = WP.workProgress(TOC, p);
  assert.deepEqual([w.partsDone, w.partsTotal, w.rowsRead, w.rowsTotal, w.percent], [1, 3, 150, 600, 25]);
  assert.equal(w.last.part.part_id, 's2');
  assert.equal(w.complete, false);
  assert.deepEqual(WP.workProgress(TOC, new Map()).last, null, 'nothing guessed without progress');
});

test('a part opens through the same verified card shape as any learning edition', () => {
  const c = WP.partCard(CARD, TOC.parts[3]);
  assert.deepEqual([c.id, c.text_key, c.segments, c.file], ['58052', TOC.parts[3].text_key, 200, TOC.parts[3].file]);
});

test('a Russian-only part title becomes «Part N» outside the Russian interface, keeping its date', () => {
  const L = (title, parent, o) => WP.partLabel({ title, parent }, o);
  assert.equal(L('Рабочий · 02 · Продолжение романа', null, { lang: 'ru', partWord: 'Часть 2' }), '02 · Продолжение романа');
  assert.equal(L('Рабочий · 02 · Продолжение романа', null, { lang: 'he', partWord: 'חלק 2' }), 'חלק 2');
  assert.equal(L('בארץ · Фрагмент дневниковой записи: 17.2.1940', null, { lang: 'he', partWord: 'חלק 4' }), 'חלק 4 · 17.2.1940');
  assert.equal(L('בארץ · יומן · 2.11.1939', null, { lang: 'he', partWord: 'חלק 1' }), 'יומן · 2.11.1939', 'a Hebrew title is kept as is');
  assert.equal(L('Алон · Том I · 01 · Исходные заголовки', 's1', { lang: 'en', partWord: 'Part 1', trackLabel: 'Chapter structure' }), 'Chapter structure');
});

test('«Продолжить» shows one card per work, the newest part first; ordinary texts are untouched', () => {
  const items = [{ id: 1, part_work_id: '58052' }, { id: 2 }, { id: 3, part_work_id: '58052' }, { id: 4, part_work_id: '64596' }];
  assert.deepEqual(WP.groupContinue(items).map((x) => x.id), [1, 2, 4]);
});
