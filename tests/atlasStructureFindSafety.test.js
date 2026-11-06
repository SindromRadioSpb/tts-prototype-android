'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AW = require('../public/js/atlas-words.js');
const T = require('../public/js/atlas-train.js');
const { buildFindBank } = require('../scripts/atlas/build-train-bank.cjs');

function block(id, he, extra) {
  return Object.assign({ id, type: 'block', kind: 'prose', he, ru: 'Исходный перевод' }, extra);
}
test('find-bank rebuild respects canonical learning holds, including nested holds', () => {
  const rows = [
    block('ready', 'הכוח פועל על הגוף לאורך הציר', { training_eligible: true }),
    block('legacy', 'התנועה של הגוף מתרחשת לאורך מסלול ישר'),
    block('held', 'המתכת עוברת תהליך קירור בתוך מים קרים', { training_eligible: false }),
    block('nested-held', 'הכדור נע במהירות קבועה סביב מרכז המעגל', { structure: { training_eligible: false } }),
    block('conflicting-held', 'הדוגמה הזאת נשארת לקריאה ולא לתרגול נוסף', { training_eligible: true, structure: { training_eligible: false } }),
    block('editor', 'ההערה מסבירה מדוע הטקסט דורש בדיקה נוספת', { kind: 'editor_note' }),
    block('shared', 'התרגום המקורי מתאר שני גדלים באותו משפט', { kind: 'shared_source_context' }),
  ];
  const sections = [{ id: 's01', pages: [{ page: 7, items: rows }] }];
  const before = JSON.stringify(sections);
  for (const atlasId of ['a97001', 'a97002']) {
    const bank = buildFindBank(sections, { s01: 'source-hash' }, atlasId);
    assert.deepEqual(bank.items.map(i => i.block), ['ready', 'legacy']);
    assert(bank.items.every(i => AW.learningItem(rows.find(r => r.id === i.block))));
    assert.deepEqual(bank.built_from.sections, { s01: 'source-hash' });
  }
  assert.equal(JSON.stringify(sections), before, 'rebuilding never modifies the held source or learner state');
});

test('a held duplicate stays out of questions and still prevents an ambiguous active question', () => {
  const he = 'הכוח פועל על הגוף לאורך הציר';
  const sections = [{ id: 's01', pages: [
    { page: 7, items: [block('active-copy', he)] },
    { page: 8, items: [block('held-copy', he, { training_eligible: false })] },
  ] }];
  assert.deepEqual(buildFindBank(sections, {}, 'a97001').items, []);
});

test('find-bank status requires the exact current 97001 section files before any question', () => {
  const sha = 'a'.repeat(64), index = { atlas_id: 'a97001', sections: [{ id: 's01' }], sections_sha256: { s01: sha } };
  const bank = { atlas_id: 'a97001', items: [{ block: 'held-but-text-unchanged', he: 'טקסט שלא השתנה' }], built_from: { sections: { s01: sha } } };
  const saved = JSON.stringify({ bank, index });
  assert.equal(T.findBankStatus(bank, index, 'a97001'), 'ready');
  assert.equal(T.findBankStatus(null, index, 'a97001'), 'missing');
  assert.equal(T.findBankStatus(bank, null, 'a97001'), 'unverified');
  assert.equal(T.findBankStatus({ ...bank, built_from: {} }, index, 'a97001'), 'unverified');
  assert.equal(T.findBankStatus({ ...bank, atlas_id: 'a97002' }, index, 'a97001'), 'unverified');
  assert.equal(T.findBankStatus(bank, { ...index, sections: 'malformed' }, 'a97001'), 'unverified');
  assert.equal(T.findBankStatus(bank, { ...index, sections_sha256: { s01: '' } }, 'a97001'), 'unverified');
  for (const sections of [{ s01: 'b'.repeat(64) }, {}, { s01: sha, retired: sha }])
    assert.equal(T.findBankStatus({ ...bank, built_from: { sections } }, index, 'a97001'), 'stale');
  assert.equal(T.findBankStatus(bank, { ...index, sections: [{ id: 's01' }, { id: 's02' }], sections_sha256: { s01: sha, s02: sha } }, 'a97001'), 'stale');
  assert.equal(T.findBankStatus(bank, null, 'a97002'), 'ready', 'other atlas behavior is unchanged');
  assert.equal(JSON.stringify({ bank, index }), saved, 'validation does not rewrite bank or history');
});

test('actual find loader rejects stale cached banks before session, refetches index, and recovers without writing history', async () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '../public/js/library-ui.js'), 'utf8');
  const start = source.indexOf('const ATLAS_FIND_KEY ='), end = source.indexOf('function atlasFindBlock(', start);
  assert(start > 0 && end > start);
  const sha = 'a'.repeat(64), next = 'b'.repeat(64);
  let index = { atlas_id: 'a97001', sections: [{ id: 's01' }], sections_sha256: { s01: sha } };
  let bank = { atlas_id: 'a97001', built_from: { sections: { s01: sha } }, items: [{ id: 'find:held', block: 'held', he: 'טקסט שלא השתנה' }] };
  const calls = { bank: 0, index: 0 }, writes = [];
  const context = { window: { AtlasTrain: T }, localStorage: { getItem: () => '[]', setItem: (...args) => writes.push(args) },
    fetch: async (url) => {
      const kind = url.endsWith('index.json') ? 'index' : 'bank'; calls[kind]++;
      const value = kind === 'index' ? index : bank;
      return { ok: !!value, json: async () => JSON.parse(JSON.stringify(value)) };
    } };
  context.atlasJson = async (atlasId, file) => { assert.equal(atlasId, 'a97001'); const r = await context.fetch(file); return r.ok ? r.json() : null; };
  vm.createContext(context); vm.runInContext(source.slice(start, end) + ';globalThis.loadFind=atlasFindLoad;', context);
  assert.equal((await context.loadFind('a97001')).status, 'ready');
  index.sections_sha256.s01 = next;
  let result = await context.loadFind('a97001');
  assert.equal(result.status, 'stale'); assert.equal(result.bank, null);
  assert.deepEqual(calls, { bank: 1, index: 2 }, 'cached old index cannot approve its cached old bank');
  bank.built_from.sections.s01 = next;
  result = await context.loadFind('a97001'); assert.equal(result.status, 'ready'); assert(result.bank);
  assert.deepEqual(calls, { bank: 2, index: 3 }, 'rejected bank can recover after a separately verified rebuild');
  index = null;
  result = await context.loadFind('a97001'); assert.equal(result.status, 'unverified'); assert.equal(result.bank, null);
  context.window.AtlasTrain = {}; // mixed-version assets must fail closed, not start an unchecked session
  result = await context.loadFind('a97001'); assert.equal(result.status, 'unverified'); assert.equal(result.bank, null);
  assert.deepEqual(writes, [], 'loading or rejecting never changes answer history');
  const block = source.slice(end, source.indexOf('// P5 G5', end));
  assert(block.indexOf("tt('atlas.find.unverifiedBank'") < block.indexOf('UI.findSession'), 'a clear status precedes session construction');
});

const data = path.resolve(process.env.ATLAS_FOLLOWUP_DATA || path.join(__dirname, '../data/atlas/a97001'));
const hasData = fs.existsSync(path.join(data, 'sections'));
test('full 97001 find-bank rebuild cannot teach any held or editorial row', { skip: hasData ? false : 'requires a97001 runtime data' }, () => {
  const sections = fs.readdirSync(path.join(data, 'sections')).filter(f => f.endsWith('.json')).sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(data, 'sections', f), 'utf8')));
  const rows = sections.flatMap(s => s.pages.flatMap(p => p.items));
  const blocked = new Set(rows.filter(i => !AW.learningItem(i)).map(i => i.id));
  const hashes = Object.fromEntries(sections.map(s => [s.id, require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(data, 'sections', s.id + '.json'))).digest('hex')]));
  const bank = buildFindBank(sections, hashes, 'a97001');
  const index = JSON.parse(fs.readFileSync(path.join(data, 'index.json'), 'utf8'));
  assert.equal(T.findBankStatus(bank, index, 'a97001'), 'ready', 'a correctly rebuilt in-memory bank passes the runtime contract');
  assert(bank.items.length > 0, 'the guard must not disable all valid questions');
  assert.deepEqual(bank.items.filter(i => blocked.has(i.block)), []);
  if (sections.some(s => s.structure_revision)) {
    assert.equal(rows.filter(i => i.training_eligible === false).length, 108, 'known held/editorial rows remain in the source');
    // The 23 concrete rows reproduced by independent review before the fix.
    const previousLeaks = ["a97001:p123:b003", "a97001:p123:b012:s02", "a97001:p123:b014", "a97001:p126:b008:s02", "a97001:p128:b004:s04", "a97001:p128:b004:s05", "a97001:p135:b006:s01", "a97001:p135:b006:s02", "a97001:p135:b006:s04", "a97001:p138:b003:s03", "a97001:p138:b003:s05", "a97001:p139:b003:s03", "a97001:p139:b003:s04", "a97001:p158:b005:s11", "a97001:p158:b005:s12", "a97001:p171:b001:s09", "a97001:p171:b001:s10", "a97001:p189:b004", "a97001:p190:b004", "a97001:p190:b005", "a97001:p193:b002:s01", "a97001:p193:b002:s02", "a97001:p193:b002:s03"];
    assert.equal(previousLeaks.length, 23);
    for (const id of previousLeaks) {
      assert(blocked.has(id), id + ' must remain held, not silently approved to make this test pass');
      assert(!bank.items.some(i => i.block === id), id + ' must not be an exercise after rebuild');
    }
    const observedLeaks = ['a97001:p128:b004', 'a97001:p132:b006', 'a97001:p135:b006', 'a97001:p136:b001', 'a97001:p138:b003', 'a97001:p139:b003', 'a97001:p144:b002', 'a97001:p158:b005', 'a97001:p165:b002', 'a97001:p171:b001', 'a97001:p193:b002'];
    for (const parent of observedLeaks) {
      const children = rows.filter(i => i.structure && i.structure.parent_ref === parent);
      assert(children.length > 0, parent + ' preserved source rows');
      assert(children.every(i => !AW.learningItem(i)), parent + ' held until content review');
      assert(!bank.items.some(i => children.some(c => c.id === i.block)), parent + ' must not leak into find questions');
    }
  }
});
