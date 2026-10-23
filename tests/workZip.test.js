'use strict';
// Modern release Ф4б: one ZIP for a work made of parts — built from verified public bodies, same identities inside.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const JSZip = require('jszip');
const WorkZip = require('../public/js/work-zip.js');
const WorkParts = require('../public/js/work-parts.js');
const Edition = require('../public/js/benyehuda-learning-edition.js');
const Share = require('../public/js/share-service.js');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hex = (n) => crypto.createHash('sha256').update(String(n)).digest('hex');

function fixture() {
  const parts = [], bodies = new Map();
  [['s1', 'text', null, 3], ['s1-notes', 'notes', 's1', 2], ['s2', 'text', null, 4]].forEach(([id, track, parent, n], i) => {
    const text_key = hex('key' + id), edition = hex('ed' + id);
    const body = { library: { schema_version: 1, corpus_meta_version: 1, shelves: [], audio_assets: [], texts: [{
      text_key, title: 'Работа · ' + id, corpus: { byehuda_id: '58052' }, word_gloss_ai_layer: { schema: 'word-gloss-ai-layer-v1', rows: {} },
      source_meta: { public_learning: { edition_id: edition, part: { work_id: '58052', part_id: id } } },
      rows: Array.from({ length: n }, (_, r) => ({ order_index: r, hebrew_plain: 'שורה ' + r, russian: 'строка ' + r })) }] } };
    const bytes = Buffer.from(JSON.stringify(body));
    const file = 'works/58052-' + sha(bytes).slice(0, 32) + '.json';
    bodies.set(id, bytes);
    parts.push({ part_id: id, order: i + 1, track, parent, title: 'Работа · ' + id, rows: n, file, text_key, learning_edition_id: edition, bundle_sha256: sha(bytes) });
  });
  const toc = { schema: 'benyehuda-work-toc-v1', work_id: '58052', title: 'פועל בארץ', parts };
  const tocBytes = Buffer.from(JSON.stringify(toc));
  const card = { id: '58052', title: 'פועל בארץ', author: 'כרמון', parts: 3, toc_file: 'toc/58052-' + sha(tocBytes).slice(0, 16) + '.json', toc_sha256: sha(tocBytes) };
  return { card, toc, tocBytes, bodies };
}
const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

test('the work ZIP holds every part as its published text, in table-of-contents order, with the sealed TOC', async () => {
  const { card, toc, tocBytes, bodies } = fixture();
  const seen = [];
  const art = await WorkZip.buildWorkZip({ card, toc, tocBytes, WorkParts, Edition, Share, JSZip, catalogVersion: 11, outputType: 'nodebuffer',
    fetchBody: async (p) => ab(bodies.get(p.part_id)), onPart: (k, n) => seen.push(k + '/' + n) });
  assert.deepEqual(seen, ['1/3', '2/3', '3/3']);
  const zip = await JSZip.loadAsync(art.blob);
  const lib = JSON.parse(await zip.file('library/library.json').async('string'));
  assert.deepEqual(lib.texts.map((t) => t.text_key), toc.parts.map((p) => p.text_key));
  for (const [i, p] of toc.parts.entries()) assert.deepEqual(lib.texts[i], JSON.parse(bodies.get(p.part_id)).library.texts[0], 'text equals the published body');
  assert.equal(sha(Buffer.from(await zip.file('work/toc.json').async('uint8array'))), card.toc_sha256);
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  assert.equal(manifest.text_count, 3);
  assert.equal(manifest.work.schema, 'benyehuda-work-zip-v1');
  assert.deepEqual(manifest.work.parts.map((p) => p.learning_edition_id), toc.parts.map((p) => p.learning_edition_id));
  assert.equal(manifest.partial_backup, false, 'no audio expected, so the archive is complete');
  const personal = ['progress', 'text_progress', 'notes', 'notes_advanced', 'bookmarks', 'word_states', 'review_log'];
  assert.ok(!Object.keys(lib).some((k) => personal.includes(k)) && lib.texts.every((t) => !Object.keys(t).some((k) => personal.includes(k))), 'no learner data');
  assert.equal(zip.file('library/notes_advanced.json'), null);
});

test('a part that does not match its seal stops the archive; no partial ZIP', async () => {
  const { card, toc, tocBytes, bodies } = fixture();
  const broken = Buffer.from(bodies.get('s2')); broken[broken.length - 3] = 0x20;
  await assert.rejects(WorkZip.buildWorkZip({ card, toc, tocBytes, WorkParts, Edition, Share, JSZip,
    fetchBody: async (p) => ab(p.part_id === 's2' ? broken : bodies.get(p.part_id)) }), (e) => e.code === 'PART_FAILED' && e.order === 3 && e.part === 's2');
});

test('closing the dialog aborts between parts', async () => {
  const { card, toc, tocBytes, bodies } = fixture();
  const ctl = new AbortController();
  await assert.rejects(WorkZip.buildWorkZip({ card, toc, tocBytes, WorkParts, Edition, Share, JSZip, signal: ctl.signal,
    fetchBody: async (p) => { ctl.abort(); return ab(bodies.get(p.part_id)); } }), (e) => e.name === 'AbortError');
});
