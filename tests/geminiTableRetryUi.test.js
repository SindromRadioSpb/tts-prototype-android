'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const start = html.indexOf('    async function v3RequestGeminiChunk(');
const end = html.indexOf('    async function v3TranslateTableChunked(', start);
function runtime(error) {
  let calls = 0;
  const ctx = { apiCall: async () => { calls++; if(error) throw error; return { rows: [], fromCache: true }; },
    geminiKeyGet: () => 'NOT_A_REAL_KEY', v3IsGeminiChunkJsonError: () => false, v3RecoverGeminiChunkJsonError: () => null };
  vm.createContext(ctx);
  vm.runInContext(html.slice(start, end), ctx);
  return { calls: () => calls, request: () => ctx.v3RequestGeminiChunk([{ i: 0, text: 'שלום' }], true) };
}
for (const error of [
  { httpStatus: 422, raw: { error_code: 'GEMINI_TABLE_REVIEW_REQUIRED', retryable: false } },
  { httpStatus: 400, raw: { error_code: 'GEMINI_KEY_REJECTED', retryable: false } },
  { httpStatus: 429 }, { httpStatus: 401 }, { httpStatus: 403 },
]) test(`client does not replay a permanent/limited failure: ${error.httpStatus}`, async () => {
  const r = runtime(error);
  await assert.rejects(r.request());
  assert.equal(r.calls(), 1);
  assert.equal(error.tableAttempt, 1);
});
test('transient failure retains the existing bounded retry', async () => {
  const r = runtime({ httpStatus: 503 });
  await assert.rejects(r.request());
  assert.equal(r.calls(), 2);
});
test('cached success is accepted once', async () => {
  const r = runtime();
  assert.equal((await r.request()).fromCache, true);
  assert.equal(r.calls(), 1);
});
test('stopped UI uses actual coverage and does not overwrite a quota explanation', () => {
  const body = html.slice(end, html.indexOf('// PROVIDER SELECTOR', end));
  assert.match(body, /const readySegments = TableChunks.coverageForRows\(accum, segs.length\).covered/);
  assert.match(body, /if \(e.httpStatus !== 429\) showError/);
  assert.match(body, /classic.tableChunkReviewRequired/);
  assert.match(body, /classic.tableChunkStopped/);
});
