'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { recoverTableNiqqud } = require('../ingest/geminiTableRepair');
const scenario = { model: 'pinned-test', promptId: 'test', schemaId: 'rows-v1' };
const good = { segment_index: 0, he: 'שלום', he_niqqud: 'שָׁלוֹם', translit: 'shalom', ru: 'мир' };
const bad = { segment_index: 1, he: 'הטרראומטי', he_niqqud: 'הַטְּרָאוּמָטִי', translit: 'wrong', ru: 'травматичный' };
function fixture(t, generate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-table-repair-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { parsed: { rows: [good, bad] }, direction: 'he-ru', segMode: true,
    rawText: JSON.stringify({ rows: [good, bad] }), cacheFile: path.join(dir, 'repair.json'),
    scenario, translitProfile: 'learner-latin', generate };
}
const fixed = { row_index: 1, he_niqqud: 'הַטְּרְרָאוּמָטִי', translit: 'ha-treraumati', ru: 'травматичный' };
test('cached invalid output repairs only rejected row; source and good derivatives stay immutable', async t => {
  let calls = 0;
  const opts = fixture(t, async ({ targets }) => {
    calls++;
    assert.deepEqual(targets.map(r => r.row_index), [1]);
    assert.equal(targets[0].he, bad.he);
    return { text: JSON.stringify({ repairs: [fixed] }), modelVersion: 'test-1' };
  });
  const before = JSON.stringify(opts.parsed);
  const result = await recoverTableNiqqud(opts);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(opts.parsed), before);
  assert.deepEqual(result.parsed.rows[0], good);
  assert.equal(result.parsed.rows[1].he, bad.he);
  assert.equal(result.parsed.rows[1].ru, bad.ru);
  assert.equal(result.parsed.rows[1].he_niqqud, fixed.he_niqqud);
  assert.equal(result.repair.repairedRows, 1);
  const replay = await recoverTableNiqqud(opts);
  assert.equal(calls, 1, 'reload must reuse validated repair without provider charge');
  assert.deepEqual(replay.parsed, result.parsed);
  assert.equal(replay.providerCalls, 0);
});
test('exhausted repair is durable and never causes infinite paid retries', async t => {
  let calls = 0;
  const opts = fixture(t, async () => { calls++; return { text: JSON.stringify({ repairs: [] }) }; });
  for (let i = 0; i < 3; i++) {
    await assert.rejects(recoverTableNiqqud(opts), e => e.code === 'GEMINI_TABLE_REVIEW_REQUIRED' && e.retryable === false);
  }
  assert.equal(calls, 2);
});
test('provider cannot overwrite good rows, source or segment identity', async t => {
  const opts = fixture(t, async () => ({ text: JSON.stringify({ repairs: [
    { ...fixed, he: 'changed', ru: 'changed', segment_index: 77 },
    { row_index: 0, he_niqqud: 'שונה', translit: 'changed' },
  ] }) }));
  await assert.rejects(recoverTableNiqqud(opts), { code: 'GEMINI_TABLE_REVIEW_REQUIRED' });
  assert.deepEqual(opts.parsed.rows[0], good);
});
test('valid output makes no provider request and no repair file', async t => {
  const opts = fixture(t, async () => assert.fail('must not generate'));
  opts.parsed = { rows: [good] };
  const result = await recoverTableNiqqud(opts);
  assert.equal(result.providerCalls, 0);
  assert.equal(fs.existsSync(opts.cacheFile), false);
});
test('concurrent requests share persisted repair budget and result', async t => {
  let calls = 0;
  const opts = fixture(t, async () => { calls++; await new Promise(r => setTimeout(r, 20)); return { text: JSON.stringify({ repairs: [fixed] }) }; });
  const results = await Promise.all([recoverTableNiqqud(opts), recoverTableNiqqud(opts)]);
  assert.equal(calls, 1);
  assert.deepEqual(results[0].parsed, results[1].parsed);
});
test('a received repair is replayed after a crash without spending again', async t => {
  let calls = 0;
  const opts = fixture(t, async () => { calls++; return { text: JSON.stringify({ repairs: [fixed] }) }; });
  await recoverTableNiqqud(opts);
  const ledger = JSON.parse(fs.readFileSync(opts.cacheFile));
  ledger.patches = [];
  ledger.attempts[0].state = 'received';
  fs.writeFileSync(opts.cacheFile, JSON.stringify(ledger));
  assert.equal((await recoverTableNiqqud(opts)).repair.repairedRows, 1);
  assert.equal(calls, 1);
});
test('unvocalized copy is not an acceptable repair placeholder', async t => {
  const opts = fixture(t, async () => ({ text: JSON.stringify({ repairs: [{ ...fixed, he_niqqud: bad.he }] }) }));
  await assert.rejects(recoverTableNiqqud(opts), { code: 'GEMINI_TABLE_REVIEW_REQUIRED' });
});
test('accepted repairs survive partial failure and are not requested again', async t => {
  const targets = [];
  const opts = fixture(t, async ({ targets: requested }) => {
    targets.push(requested.map(r => r.row_index));
    return { text: JSON.stringify({ repairs: requested[0].row_index === 1 ? [fixed] : [] }) };
  });
  opts.parsed.rows.push({ ...bad, segment_index: 2 });
  opts.rawText = JSON.stringify(opts.parsed);
  await assert.rejects(recoverTableNiqqud(opts), e => e.code === 'GEMINI_TABLE_REVIEW_REQUIRED' && e.repair.pendingRows.join() === '2');
  assert.deepEqual(targets, [[1, 2], [2]]);
  assert.equal(JSON.parse(fs.readFileSync(opts.cacheFile)).patches.length, 1);
});
test('rate rejection leaves repair budget available after cooldown', async t => {
  let first = true;
  const opts = fixture(t, async () => {
    if (first) { first = false; throw Object.assign(new Error('quota'), { status: 429 }); }
    return { text: JSON.stringify({ repairs: [fixed] }) };
  });
  await assert.rejects(recoverTableNiqqud(opts), { status: 429 });
  assert.equal((await recoverTableNiqqud(opts)).repair.attempts, 1);
});
