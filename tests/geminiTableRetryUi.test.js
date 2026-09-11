'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChunkRetry = require('../public/js/chunk-retry.js');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const start = html.indexOf('    async function v3RequestGeminiChunk(');
const end = html.indexOf('    async function v3TranslateTableChunked(', start);

// Живой код берётся из index.html (Студия инлайновая), но лестница повторов — НАСТОЯЩИЙ модуль:
// проверять обёртку против собственной заглушки значило бы проверять саму себя.
// Паузы не выжидаются, а ЗАПИСЫВАЮТСЯ: тест обязан утверждать, что ожидание было и какое,
// не платя за это 46 секундами своего времени.
function runtime(error, options) {
  const opts = options || {};
  let calls = 0;
  const waits = [], events = [];
  const listeners = {};
  const doc = { hidden: !!opts.hidden, visibilityState: opts.hidden ? 'hidden' : 'visible',
    addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); },
    removeEventListener: (name, fn) => { listeners[name] = (listeners[name] || []).filter((x) => x !== fn); } };
  const ctx = {
    apiCall: async () => { calls++; if (error) throw Object.assign(new Error('boom'), error); return { rows: [], fromCache: true }; },
    geminiKeyGet: () => 'NOT_A_REAL_KEY',
    v3IsGeminiChunkJsonError: () => !!opts.jsonError,
    v3RecoverGeminiChunkJsonError: () => null,
    setTimeout: (fn, ms) => { waits.push(ms); fn(); return 0; },
    document: doc,
    CustomEvent: function (name, init) { return { type: name, detail: init && init.detail }; },
    window: { ChunkRetry, dispatchEvent: (event) => { events.push(event); return true; } },
  };
  vm.createContext(ctx);
  vm.runInContext(html.slice(start, end), ctx);
  const comeBack = () => {
    doc.hidden = false; doc.visibilityState = 'visible';
    (listeners.visibilitychange || []).slice().forEach((fn) => fn());
  };
  return { calls: () => calls, waits, events, comeBack,
    request: () => ctx.v3RequestGeminiChunk([{ i: 0, text: 'שלום' }], false) };
}
for (const error of [
  { httpStatus: 422, raw: { error_code: 'GEMINI_TABLE_REVIEW_REQUIRED', retryable: false } },
  { httpStatus: 400, raw: { error_code: 'GEMINI_KEY_REJECTED', retryable: false } },
  { httpStatus: 429 }, { httpStatus: 401 }, { httpStatus: 403 },
]) test(`client does not replay a permanent/limited failure: ${error.httpStatus}`, async () => {
  const r = runtime(error);
  await assert.rejects(r.request());
  assert.equal(r.calls(), 1);
  assert.deepEqual(r.waits, [], 'there is nothing to wait for when the answer will never change');
});

test('an overloaded provider is waited out across the whole ladder', async () => {
  // Прогон владельца 2026-09-11: единственный 503 стоил всего куска, потому что клиент
  // переспрашивал в ту же секунду и сдавался. Теперь кусок теряется только после лестницы.
  const r = runtime({ httpStatus: 503 });
  await assert.rejects(r.request());
  assert.equal(r.calls(), ChunkRetry.ATTEMPTS);
  assert.deepEqual(r.waits, ChunkRetry.DELAYS_MS, 'each attempt waits its own rung');
});

test('an ordinary 500 keeps one retry, and even that one waits', async () => {
  const r = runtime({ httpStatus: 500 });
  await assert.rejects(r.request());
  assert.equal(r.calls(), 2);
  assert.deepEqual(r.waits, [ChunkRetry.DELAYS_MS[0]]);
});

test('the wait announces its cause, attempt and duration instead of passing in silence', async () => {
  const r = runtime({ httpStatus: 503 });
  await assert.rejects(r.request());
  const said = r.events.filter((e) => e.type === 'table-job-retry').map((e) => e.detail.at);
  assert.equal(said.length, ChunkRetry.DELAYS_MS.length);
  assert.equal(said[0].code, 'PROVIDER_OVERLOADED');
  assert.equal(said[0].attempt, 1);
  assert.equal(said[0].waitMs, ChunkRetry.DELAYS_MS[0]);
  assert.equal(said[0].needsForeground, false);
});

test('a request killed by a frozen background tab waits for the tab, not for a clock', async () => {
  // Chrome замораживает фоновую вкладку примерно через 5 минут и убивает висящий запрос
  // (замер 2026-09-11). Пауза тут не лечит ничего: продолжение начинается, когда человек
  // возвращается на вкладку — и только тогда.
  const r = runtime({ message: 'Failed to fetch' }, { hidden: true });
  const pending = assert.rejects(r.request());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(r.calls(), 1, 'nothing is retried while the tab is still frozen');
  assert.deepEqual(r.waits, [], 'no timer is set for a tab that is still in the background');
  r.comeBack();
  await pending;
  const said = r.events.filter((e) => e.type === 'table-job-retry').map((e) => e.detail.at);
  assert.equal(said[0].code, 'TAB_BACKGROUNDED');
  assert.equal(said[0].needsForeground, true);
  assert.equal(said[0].waitMs, 0);
  assert.ok(r.calls() > 1, 'the run carries on once the tab is back');
});

test('cached success is accepted once', async () => {
  const r = runtime();
  assert.equal((await r.request()).fromCache, true);
  assert.equal(r.calls(), 1);
  assert.deepEqual(r.waits, []);
});

test('damaged JSON is not waited out: it is retried once and then handed to the split', async () => {
  const r = runtime({ httpStatus: 500 }, { jsonError: true });
  await assert.rejects(r.request());
  assert.equal(r.calls(), 2, 'one retry, then the repair/split path owns it');
  assert.deepEqual(r.waits, [], 'a parse defect does not heal with time');
});

test('stopped UI uses actual coverage and does not overwrite a quota explanation', () => {
  const body = html.slice(end, html.indexOf('// PROVIDER SELECTOR', end));
  assert.match(body, /const readySegments = TableChunks.coverageForRows\(accum, segs.length\).covered/);
  assert.match(body, /if \(e.httpStatus !== 429\) showError/);
  assert.match(body, /classic.tableChunkReviewRequired/);
  assert.match(body, /classic.tableChunkStopped/);
});
