'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const policy = require('../ingest/geminiPolicy');
const rawCache = require('../ingest/geminiTableRawCache');
const rows = require('../ingest/tableRows');
const repair = require('../ingest/geminiTableRepair');
const segTable = require('../ingest/segTable');
const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const start = src.indexOf('app.post("/api/translate-table",');
const end = src.indexOf('\n});', start) + 4;
function fixture(t, generate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-table-route-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let handler, usage = 0;
  const Type = { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', INTEGER: 'INTEGER' };
  vm.runInNewContext(src.slice(start, end), {
    app: { post: (_p, h) => { handler = h; } }, fs, path, crypto, ...policy, ...rawCache, ...rows, ...repair, segTable, Type,
    geminiCacheDir: dir, isPlausibleGeminiKey: () => true,
    classifyTableGeminiError: require('../ingest/geminiError').classifyGeminiError,
    canonicalizeGeminiTableRowsLocally: r => ({ rows: r, corrections: [], resolvedTranslitProfile: 'learner-latin' }),
    generateGeminiContent: generate, updateUsage: () => { usage++; },
    console: { error() {}, warn() {} },
  });
  const body = { geminiApiKey: 'NOT_A_REAL_KEY', direction: 'he-ru', segments: [{ i: 0, text: 'שלום' }, { i: 1, text: 'ראיתי' }] };
  const scenario = policy.getGeminiScenario('table-seg-he-ru');
  const clean = segTable.buildSegInput(body.segments);
  const contentSha256 = crypto.createHash('sha256').update(clean+'\n\u0000translit_profile=learner-latin').digest('hex');
  const key = policy.buildGeminiCacheKey({ ...scenario, contentSha256 });
  const rawFile = path.join(dir, `table-raw-v1-${key}.json`);
  const originalRows = [
    { segment_index: 0, he: 'שלום', he_niqqud: 'שָׁלוֹם', translit: 'shalom', ru: 'мир' },
    { segment_index: 1, he: 'ראיתי', he_niqqud: 'רָצִיתִי', translit: 'ratsiti', ru: 'я хотела' },
  ];
  rawCache.writeRawTableCacheAtomic(rawFile, rawCache.buildRawTableCachePayload({ rawText: JSON.stringify({ rows: originalRows }), scenario, translitProfile: 'learner-latin' }));
  const original = fs.readFileSync(rawFile);
  return { dir, originalRows, usage: () => usage, preserved: () => original.equals(fs.readFileSync(rawFile)),
    request: async () => {
      const reply = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(payload) { this.payload = payload; return this; } };
      await handler({ body }, reply);
      return reply;
    } };
}
test('real endpoint reuses rejected raw cache, repairs one row, publishes and replays without charging again', async t => {
  let calls = 0;
  const f = fixture(t, async args => {
    calls++;
    assert.equal(args.apiKey, 'NOT_A_REAL_KEY');
    assert.match(args.contents, /REJECTED ROW DATA/);
    assert.equal(args.config.temperature, undefined);
    assert.deepEqual(args.config.thinkingConfig, { thinkingLevel: 'medium' });
    return { text: JSON.stringify({ repairs: [{ row_index: 1, he_niqqud: 'רָאִיתִי', translit: "ra'iti", ru: 'я увидела' }] }), modelVersion: 'test' };
  });
  const first = await f.request();
  assert.equal(first.statusCode, 200);
  assert.equal(first.payload.rows.length, 2);
  assert.equal(first.payload.rows[1].he, 'ראיתי');
  assert.equal(first.payload.rows[1].ru, 'я увидела');
  assert.equal(first.payload.fromCache, false, 'repair consumed provider quota');
  assert.equal(first.payload.semanticRepair.repairedRows, 1);
  assert.equal((await f.request()).payload.fromCache, true);
  assert.equal(calls, 1);
  assert.equal(f.usage(), 1);
  assert.equal(f.preserved(), true);
});
test('endpoint returns non-retryable 422 after durable bounded attempts; never publishes invalid rows', async t => {
  let calls = 0;
  const f = fixture(t, async () => { calls++; return { text: '{"repairs":[]}' }; });
  for(let i=0;i<3;i++) {
    const r = await f.request();
    assert.equal(r.statusCode, 422);
    assert.equal(r.payload.error_code, 'GEMINI_TABLE_REVIEW_REQUIRED');
    assert.equal(r.payload.retryable, false);
    assert.equal(r.payload.raw, undefined);
  }
  assert.equal(calls, 2);
  assert.equal(fs.readdirSync(f.dir).some(n => n.startsWith('table-v2-')), false);
  assert.equal(f.preserved(), true);
});
test('upstream rejected key remains actionable and cannot leak an SDK message in API response', async t => {
  const f = fixture(t, async () => { throw Object.assign(new Error('API key not valid: SECRET_SENTINEL'), { status: 400 }); });
  const r = await f.request();
  assert.equal(r.statusCode, 400);
  assert.equal(r.payload.error_code, 'GEMINI_KEY_REJECTED');
  assert.equal(r.payload.retryable, false);
  assert.doesNotMatch(JSON.stringify(r.payload), /SECRET_SENTINEL/);
});
