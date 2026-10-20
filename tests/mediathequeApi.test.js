'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../public/js/mediatheque-api.js'), 'utf8');
const reader = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('a body timeout after HTTP 200 remains a timeout, rather than HTTP_200', async () => {
  const { readPublicationResponse } = await reader;
  for (const name of ['TimeoutError', 'AbortError']) {
    const error = new DOMException('body interrupted', name);
    await assert.rejects(readPublicationResponse({ ok: true, status: 200, json: async () => { throw error; } }), e => e === error);
  }
});
test('publication response distinguishes invalid payloads, HTTP errors and domain errors', async () => {
  const { readPublicationResponse: read } = await reader;
  assert.deepEqual(await read(Response.json({ ok: true, corpus: { items: [] } })), { ok: true, corpus: { items: [] } });
  for (const body of ['', '<html>bad gateway</html>', '{}', 'null'])
    await assert.rejects(read(new Response(body)), /PUBLICATION_RESPONSE_INVALID/);
  await assert.rejects(read(new Response('gateway failed', { status: 502 })), /HTTP_502/);
  await assert.rejects(read(Response.json({ ok: false, error: 'DRAFT_VERSION_CONFLICT' }, { status: 409 })), /DRAFT_VERSION_CONFLICT/);
});
