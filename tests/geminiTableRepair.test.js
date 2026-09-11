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
    const r = await recoverTableNiqqud(opts);
    assert.deepEqual(r.repair.unvocalizedRows, [1], 'the unfixable row stays named, run after run');
    assert.equal(r.parsed.rows[1].niqqud_status, 'not_vocalized');
  }
  assert.equal(calls, 2, 'the ledger still bounds paid attempts: marking is not a licence to keep paying');
});
test('provider cannot overwrite good rows, source or segment identity', async t => {
  const opts = fixture(t, async () => ({ text: JSON.stringify({ repairs: [
    { ...fixed, he: 'changed', ru: 'changed', segment_index: 77 },
    { row_index: 0, he_niqqud: 'שונה', translit: 'changed' },
  ] }) }));
  const out = await recoverTableNiqqud(opts);
  assert.deepEqual(out.repair.unvocalizedRows, [1], 'a patch that reaches outside its row is refused');
  assert.deepEqual(opts.parsed.rows[0], good);
  assert.deepEqual(out.parsed.rows[0], good, 'a healthy row is never touched by a rejected patch');
  assert.equal(out.parsed.rows[1].he, bad.he, 'nor is the source of the row it targeted');
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
  const out = await recoverTableNiqqud(opts);
  // Существенное различие: неогласованную ПОДДЕЛКУ модели не принимаем как починку. Строка
  // получает честную пометку от НАС, а не выдаётся за выполненную работу провайдера.
  assert.deepEqual(out.repair.unvocalizedRows, [1]);
  assert.equal(out.parsed.rows[1].he_niqqud, '', 'the model copy is discarded, not stored as a vocalization');
  assert.equal(out.parsed.rows[1].niqqud_status, 'not_vocalized');
});
test('accepted repairs survive partial failure and are not requested again', async t => {
  const targets = [];
  const opts = fixture(t, async ({ targets: requested }) => {
    targets.push(requested.map(r => r.row_index));
    return { text: JSON.stringify({ repairs: requested[0].row_index === 1 ? [fixed] : [] }) };
  });
  opts.parsed.rows.push({ ...bad, segment_index: 2 });
  opts.rawText = JSON.stringify(opts.parsed);
  const first = await recoverTableNiqqud(opts);
  assert.deepEqual(first.repair.unvocalizedRows, [2], 'only the row that never came back stays unvocalized');
  assert.equal(first.parsed.rows[1].he_niqqud, fixed.he_niqqud, 'the accepted repair is kept');
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

// ── Владелец, 2026-09-11: содержательный конфликт «модель правит источник при огласовке» ──
// На проде модель превращала `מעשר` в `מעשרת` и `30 ס"מ` в `30 סנטימטר`. Валидатор прав, но целая
// таблица из-за шести строк из 637 не собиралась вовсе. Решение владельца (вариант A): такие
// строки едут дальше БЕЗ огласовки и с явной пометкой — материал собирается, правда не страдает.
const stubborn = { segment_index: 2, he: 'גבוה ממני באיזה 30 ס"מ', he_niqqud: 'גָּבוֹהַּ מִמֶּנִּי בְּאֵיזֶה 30 סֶנְטִימֶטֶר', translit: 'x', ru: 'y' };
function stubbornFixture(t, generate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-table-repair-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { parsed: { rows: [good, stubborn] }, direction: 'he-ru', segMode: true,
    rawText: JSON.stringify({ rows: [good, stubborn] }), cacheFile: path.join(dir, 'repair.json'),
    scenario, translitProfile: 'learner-latin', generate };
}

test('a row the model cannot vocalize without rewriting ships unvocalized and says so', async t => {
  const opts = stubbornFixture(t, async () => ({ text: JSON.stringify({ repairs: [] }), modelVersion: 'test-1' }));
  const result = await recoverTableNiqqud(opts);
  const row = result.parsed.rows[1];
  assert.equal(row.he, stubborn.he, 'the source is untouched — that is the whole point of the validator');
  assert.equal(row.he_niqqud, '', 'a vocalization that rewrites the source is not shipped at all');
  assert.equal(row.niqqud_status, 'not_vocalized', 'the gap is stated, never silent');
  assert.deepEqual(result.repair.unvocalizedRows, [1]);
  assert.equal(result.parsed.rows[0].he_niqqud, good.he_niqqud, 'healthy rows are untouched');
});

test('the repair tells the model exactly what it broke, not only that something broke', async t => {
  let seenPrompt = '';
  const opts = stubbornFixture(t, async ({ prompt }) => { seenPrompt = prompt; return { text: JSON.stringify({ repairs: [] }) }; });
  await recoverTableNiqqud(opts);
  assert.ok(seenPrompt.includes('ס\\"מ') || seenPrompt.includes('ס"מ'),
    'the source token it must keep has to appear in the instruction');
  assert.match(seenPrompt, /סֶנְטִימֶטֶר|סנטימטר/, 'so does the substitution it made');
});
