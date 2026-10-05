'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
// Isolated in-memory filesystem. No production/owner storage or LLM calls.
function repository() {
  const latest = { text_key: 'a'.repeat(64), rows: [{ order_index: 0, hebrew_plain: 'latest-one' }, { order_index: 1, hebrew_plain: 'latest-two' }] };
  const earlier = { text_key: 'b'.repeat(64), rows: [{ order_index: 0, hebrew_plain: 'earlier-only' }] };
  const files = { '900001-edition.json': JSON.stringify({ library: { texts: [latest] } }), '900001.json': JSON.stringify({ library: { texts: [earlier] } }) };
  const fakeFs = { statSync(p) { const raw = files[path.basename(p)]; if (!raw) throw Error('ENOENT'); return { isFile: () => true, size: raw.length, mtimeMs: 1 }; }, readFileSync: p => Buffer.from(files[path.basename(p)]) };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../db/corpusSentenceRepo.js'), 'utf8'), {
    module, exports: module.exports, Buffer, __dirname: '/fixture', process: { env: { DATA_DIR: '/isolated' } },
    require: name => name === 'fs' ? fakeFs : name === 'path' ? path : { publishedFile: () => ({ name: '900001-edition.json', sha256: 'fixture' }), checkBody: () => {} }
  });
  return module.exports;
}
test('work-only metadata and coverage use the current publisher edition', () => {
  const repo = repository();
  const coverage = repo.getCorpusCoverageText('900001');
  assert.equal(coverage.ok, true); assert.deepEqual(Array.from(coverage.rows, r => r.he), ['latest-one','latest-two']);
  const list = repo.listWorkTexts('900001');
  assert.equal(list.texts.length, 1); assert.equal(list.texts[0].rows_total, 2); assert.equal(list.texts[0].text_key, 'a'.repeat(64));
});
test('exact old and new text keys remain independent sentence and lesson anchors', async () => {
  const repo = repository();
  for (const [key, expected, rows] of [['a','latest-one',2],['b','earlier-only',1]]) {
    const anchor = { work_id: '900001', text_key: key.repeat(64), order_index: 0 };
    assert.equal((await repo.getCorpusSentenceContext(anchor)).sentence.he, expected);
    assert.equal((await repo.getCorpusLessonWindow({ ...anchor, start_order_index: 0, row_count: 5 })).rows_total, rows);
    assert.equal((await repo.getCorpusWindow(anchor)).rows[0].he, expected);
  }
});
