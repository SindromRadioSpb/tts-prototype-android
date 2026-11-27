'use strict';
// Video queue routes (spec 2026-11-27 §5.1, §6; plan M1 Task 3): the owner orders and watches, the home PC's relay
// key leases and hands in the ASR ZIP, and neither key reaches the other's routes.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const express = require('express');
const AdmZip = require('adm-zip');
const { openDb } = require('./helpers/newsDb.cjs');
const { createRelayAuth } = require('../news/newsRelayAuth');
const { createNewsEditorAuth } = require('../news/newsEditorAuth');
const { createMediaQueue } = require('../mediaqueue/mediaQueueRepo');
const { mountMediaQueueRoutes } = require('../mediaqueue/mediaQueueRoutes');

const OWNER_COOKIE = 'lp_session=owner-session', OWNER_CSRF = 'owner-csrf', READER_COOKIE = 'lp_session=reader-session';
const ID = 'dQw4w9WgXcQ';

async function setup(t) {
  const db = await openDb();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-media-routes-'));
  const now = () => Date.parse('2026-11-27T08:00:00Z');
  const queue = createMediaQueue({ db, dataDir, now }), relayAuth = createRelayAuth({ db, now }), editorAuth = createNewsEditorAuth({ db, now });
  const app = express(), audits = [];
  const resolveUser = async req => {
    const c = String(req.headers.cookie || '');
    if (c.includes(OWNER_COOKIE)) return { user: { id: 'owner', role: 'owner' }, session: { csrf: OWNER_CSRF } };
    if (c.includes(READER_COOKIE)) return { user: { id: 'reader', role: 'user' }, session: { csrf: 'r' } };
    return null;
  };
  mountMediaQueueRoutes(app, { queue, relayAuth, resolveUser, audit: (...a) => audits.push(a) });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); r(); })));
  const base = 'http://127.0.0.1:' + server.address().port;
  const owner = { cookie: OWNER_COOKIE, 'x-lp-csrf': OWNER_CSRF, origin: base };
  const call = (method, url, { headers = {}, json, body, type } = {}) => fetch(base + url, { method,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(type ? { 'content-type': type } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : body }).then(async r => {
    const buf = Buffer.from(await r.arrayBuffer());
    let parsed = null; try { parsed = JSON.parse(buf.toString('utf8')); } catch (_) {}
    return { status: r.status, body: parsed, raw: buf, headers: r.headers };
  });
  const { key } = await relayAuth.issue('home PC', 'owner');
  const { key: editorKey } = await editorAuth.createEditor('owner', 'dot');
  return { call, owner, base, key, editorKey, audits, queue };
}
const bearer = k => ({ authorization: 'Bearer ' + k });
function asrZip() {
  const z = new AdmZip();
  z.addFile('manifest.json', Buffer.from(JSON.stringify({ completed: true })));
  z.addFile('raw/segments.json', Buffer.from('[]'));
  return z.toBuffer();
}

test('owner enqueues and lists', async t => {
  const { call, owner, audits } = await setup(t);
  const a = await call('POST', '/api/media-queue/jobs', { json: { url: 'https://youtu.be/' + ID }, headers: owner });
  assert.equal(a.status, 200); assert.equal(a.body.ok, true); assert.equal(a.body.existing, false); assert.equal(a.body.job.video_id, ID);
  assert.equal(a.headers.get('cache-control'), 'no-store');
  const b = await call('POST', '/api/media-queue/jobs', { json: { url: 'https://www.youtube.com/watch?v=' + ID }, headers: owner });
  assert.equal(b.body.existing, true);
  const list = await call('GET', '/api/media-queue/jobs', { headers: owner });
  assert.equal(list.status, 200); assert.equal(list.body.jobs.length, 1);
  assert.ok(audits.some(x => x[0] === 'media_job_enqueued'));
  const bad = await call('POST', '/api/media-queue/jobs', { json: { url: 'https://www.youtube.com/@kan11' }, headers: owner });
  assert.equal(bad.status, 400); assert.equal(bad.body.error, 'MEDIA_URL_INVALID');
});

test('worker routes need a relay key', async t => {
  const { call, owner, editorKey } = await setup(t);
  for (const headers of [{}, bearer(editorKey), owner]) {
    assert.equal((await call('POST', '/api/media-queue/worker/lease', { json: {}, headers })).status, 401);
    assert.equal((await call('PUT', '/api/media-queue/worker/jobs/mj_0000000000000000/asr-zip', { body: asrZip(), type: 'application/zip', headers })).status, 401);
  }
});

test('owner routes refuse relay key, editor key and a reader', async t => {
  const { call, key, editorKey, base } = await setup(t);
  for (const headers of [bearer(key), bearer(editorKey), { cookie: READER_COOKIE, 'x-lp-csrf': 'r', origin: base }]) {
    const g = await call('GET', '/api/media-queue/jobs', { headers });
    assert.ok([401, 403].includes(g.status), 'GET ' + g.status);
    const p = await call('POST', '/api/media-queue/jobs', { json: { url: 'https://youtu.be/' + ID }, headers });
    assert.ok([401, 403].includes(p.status), 'POST ' + p.status);
  }
});

test('owner POST needs CSRF and same origin', async t => {
  const { call, owner } = await setup(t);
  const noCsrf = await call('POST', '/api/media-queue/jobs', { json: { url: 'https://youtu.be/' + ID }, headers: { cookie: owner.cookie, origin: owner.origin } });
  assert.equal(noCsrf.status, 403); assert.equal(noCsrf.body.error, 'BAD_CSRF');
  const cross = await call('POST', '/api/media-queue/jobs', { json: { url: 'https://youtu.be/' + ID }, headers: { ...owner, origin: 'https://evil.example' } });
  assert.equal(cross.status, 403); assert.equal(cross.body.error, 'BAD_ORIGIN');
  const site = await call('POST', '/api/media-queue/jobs', { json: { url: 'https://youtu.be/' + ID }, headers: { ...owner, 'sec-fetch-site': 'cross-site' } });
  assert.equal(site.status, 403);
});

test('home PC leases, steps and hands in the ASR zip; owner downloads it', async t => {
  const { call, owner, key, audits } = await setup(t);
  const { body: { job } } = await call('POST', '/api/media-queue/jobs', { json: { url: 'https://youtu.be/' + ID }, headers: owner });
  const l = await call('POST', '/api/media-queue/worker/lease', { json: {}, headers: bearer(key) });
  assert.equal(l.status, 200); assert.equal(l.body.job.job_id, job.job_id);
  const s = await call('POST', '/api/media-queue/worker/jobs/' + job.job_id + '/step', { json: { status: 'asr', progress: 0.5, meta: { title: 'T' } }, headers: bearer(key) });
  assert.equal(s.status, 200); assert.equal(s.body.job.status, 'asr');
  const notReady = await call('GET', '/api/media-queue/jobs/' + job.job_id + '/asr-zip', { headers: owner });
  assert.equal(notReady.status, 409);
  const bytes = asrZip();
  const up = await call('PUT', '/api/media-queue/worker/jobs/' + job.job_id + '/asr-zip', { body: bytes, type: 'application/zip', headers: bearer(key) });
  assert.equal(up.status, 200); assert.equal(up.body.job.status, 'asr_ready');
  assert.ok(audits.some(x => x[0] === 'media_job_asr_ready'));
  const dl = await call('GET', '/api/media-queue/jobs/' + job.job_id + '/asr-zip', { headers: owner });
  assert.equal(dl.status, 200); assert.deepEqual(dl.raw, bytes);
  assert.match(dl.headers.get('content-disposition'), new RegExp('attachment; filename="' + ID + '_ASR\\.zip"'));
  assert.equal((await call('GET', '/api/media-queue/jobs/' + job.job_id + '/asr-zip', { headers: bearer(key) })).status, 401);
});

test('worker fail, owner retry and cancel', async t => {
  const { call, owner, key, audits } = await setup(t);
  const { body: { job } } = await call('POST', '/api/media-queue/jobs', { json: { url: 'https://youtu.be/' + ID }, headers: owner });
  await call('POST', '/api/media-queue/worker/lease', { json: {}, headers: bearer(key) });
  const f = await call('POST', '/api/media-queue/worker/jobs/' + job.job_id + '/fail', { json: { code: 'ACQUIRE_FAILED', detail: 'Video unavailable', retryable: false, countAttempt: true }, headers: bearer(key) });
  assert.equal(f.status, 200); assert.equal(f.body.job.status, 'failed_acquire');
  const r = await call('POST', '/api/media-queue/jobs/' + job.job_id + '/retry', { json: {}, headers: owner });
  assert.equal(r.status, 200); assert.equal(r.body.job.status, 'queued');
  const c = await call('POST', '/api/media-queue/jobs/' + job.job_id + '/cancel', { json: {}, headers: owner });
  assert.equal(c.body.job.status, 'cancelled');
  assert.ok(audits.some(x => x[0] === 'media_job_retry') && audits.some(x => x[0] === 'media_job_cancel'));
});

test('MediaQueueError maps to its status and code', async t => {
  const { call, owner, key } = await setup(t);
  const nf = await call('POST', '/api/media-queue/jobs/mj_0000000000000000/cancel', { json: {}, headers: owner });
  assert.equal(nf.status, 404); assert.equal(nf.body.error, 'MEDIA_JOB_NOT_FOUND');
  const nl = await call('POST', '/api/media-queue/worker/jobs/mj_0000000000000000/step', { json: { status: 'asr' }, headers: bearer(key) });
  assert.equal(nl.status, 404);
});
