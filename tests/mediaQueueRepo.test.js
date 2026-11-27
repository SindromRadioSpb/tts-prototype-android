'use strict';
// Mediatheque video queue, stage M1 (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.1;
// plan docs/superpowers/plans/2026-11-27-mediatheque-video-pipeline-m1.md Tasks 1–2).
const test = require('node:test'), assert = require('node:assert/strict');
const { openDb } = require('./helpers/newsDb.cjs');

const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));

// ---- Task 1: the table -------------------------------------------------------------------------------
test('migration 099 creates media_jobs', async () => {
  const db = await openDb();
  const cols = (await all(db, 'PRAGMA table_info(media_jobs)')).map(c => c.name);
  for (const c of ['job_id', 'video_id', 'url', 'source', 'priority', 'status', 'step_detail', 'progress', 'title', 'duration_sec',
    'channel_title', 'attempts', 'lease_key_id', 'lease_until', 'error_code', 'error_detail', 'asr_zip_sha256', 'asr_zip_bytes',
    'created_by', 'created_at', 'updated_at']) assert.ok(cols.includes(c), c);
  await assert.rejects(run(db, "INSERT INTO media_jobs(job_id,video_id,url,source,priority,status,created_at,updated_at) VALUES('mj_1','dQw4w9WgXcQ','u','x',0,'queued','t','t')"));
  await run(db, "INSERT INTO media_jobs(job_id,video_id,url,source,priority,status,created_at,updated_at) VALUES('mj_1','dQw4w9WgXcQ','u','owner',100,'queued','t','t')");
  db.close();
});

test('migration 100 adds publish columns', async () => {
  const db = await openDb();
  const cols = (await all(db, 'PRAGMA table_info(media_jobs)')).map(c => c.name);
  for (const c of ['dot_editor_id', 'dot_lease_until', 'upload_count', 'archive_sha256', 'published_slug', 'published_work_id', 'published_at', 'withdrawn_at'])
    assert.ok(cols.includes(c), c);
  db.close();
});

// ---- Task 2: the queue repository ------------------------------------------------------------------------
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { parseYoutubeUrl, createMediaQueue, MediaQueueError } = require('../mediaqueue/mediaQueueRepo');

const ID = 'dQw4w9WgXcQ';
async function setup(t) {
  const db = await openDb();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-media-queue-'));
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  const clock = { now: Date.parse('2026-11-27T08:00:00Z') };
  const queue = createMediaQueue({ db, dataDir, now: () => clock.now });
  return { db, dataDir, clock, queue };
}
const enq = (queue, url = 'https://youtu.be/' + ID) => queue.enqueue({ url, source: 'owner', actorId: 'owner1' });
const codeOf = async p => { try { await p; return null; } catch (e) { assert.ok(e instanceof MediaQueueError, String(e)); return [e.code, e.status]; } };
function asrZip({ completed = true, extra = {} } = {}) {
  const z = new AdmZip();
  z.addFile('manifest.json', Buffer.from(JSON.stringify({ completed, status: completed ? 'completed' : 'failed' })));
  z.addFile('raw/segments.json', Buffer.from('[]'));
  for (const [n, b] of Object.entries(extra)) z.addFile(n, Buffer.from(b));
  return z.toBuffer();
}
const vid = n => 'v' + String(n).padStart(10, '0');

test('parseYoutubeUrl accepts watch, youtu.be, m., &t= and list= (keeps v only)', () => {
  for (const u of ['https://www.youtube.com/watch?v=' + ID, 'https://youtu.be/' + ID, 'https://m.youtube.com/watch?v=' + ID,
    'https://youtube.com/watch?v=' + ID + '&t=30s', 'https://www.youtube.com/watch?v=' + ID + '&list=PLx123']) {
    assert.deepEqual(parseYoutubeUrl(u), { video_id: ID, url: 'https://www.youtube.com/watch?v=' + ID }, u);
  }
});
test('parseYoutubeUrl rejects', () => {
  for (const u of ['https://www.youtube.com/playlist?list=PLx123', 'https://www.youtube.com/@kan11', 'https://www.youtube.com/shorts/' + ID,
    'https://example.com/watch?v=' + ID, 'https://youtu.be/dQw4w9WgXc', 'not a url', '', null]) assert.equal(parseYoutubeUrl(u), null, String(u));
});
test('enqueue rejects a bad url with MEDIA_URL_INVALID', async t => {
  const { queue } = await setup(t);
  assert.deepEqual(await codeOf(enq(queue, 'https://www.youtube.com/@kan11')), ['MEDIA_URL_INVALID', 400]);
});
test('enqueue same video twice returns existing', async t => {
  const { queue, db } = await setup(t);
  const a = await enq(queue, 'https://youtu.be/' + ID);
  assert.equal(a.existing, false); assert.equal(a.job.status, 'queued'); assert.equal(a.job.priority, 100); assert.match(a.job.job_id, /^mj_[a-f0-9]{16}$/);
  const b = await enq(queue, 'https://www.youtube.com/watch?v=' + ID + '&t=30s');
  assert.equal(b.existing, true); assert.equal(b.job.job_id, a.job.job_id);
  assert.equal((await all(db, 'SELECT * FROM media_jobs')).length, 1);
});
test('enqueue after failed or cancelled creates a new job', async t => {
  const { queue } = await setup(t);
  const a = await enq(queue);
  await queue.cancel(a.job.job_id);
  const b = await enq(queue);
  assert.equal(b.existing, false); assert.notEqual(b.job.job_id, a.job.job_id);
  const leased = await queue.lease('k1');
  assert.equal(leased.job_id, b.job.job_id);
  await queue.fail(leased.job_id, 'k1', { code: 'ACQUIRE_FAILED', detail: 'x', retryable: false, countAttempt: true });
  const c = await enq(queue);
  assert.equal(c.existing, false); assert.notEqual(c.job.job_id, b.job.job_id);
});
test('enqueue of a video whose ASR is ready returns the ready job', async t => {
  const { queue } = await setup(t);
  await enq(queue);
  const job = await queue.lease('k1');
  await queue.acceptAsrZip(job.job_id, 'k1', asrZip());
  const again = await enq(queue);
  assert.equal(again.existing, true); assert.equal(again.job.status, 'asr_ready');
});
test('owner limit 100 open jobs', async t => {
  const { queue } = await setup(t);
  let first;
  for (let i = 0; i < 100; i++) { const r = await enq(queue, 'https://youtu.be/' + vid(i)); if (!i) first = r.job; }
  assert.deepEqual(await codeOf(enq(queue, 'https://youtu.be/' + vid(100))), ['MEDIA_QUEUE_FULL', 409]);
  await queue.cancel(first.job_id);
  assert.equal((await enq(queue, 'https://youtu.be/' + vid(100))).existing, false);
});
test('lease gives highest priority oldest first and sets lease_until = now+30min', async t => {
  const { queue, clock } = await setup(t);
  const a = await enq(queue, 'https://youtu.be/' + vid(1));
  clock.now += 1000;
  await enq(queue, 'https://youtu.be/' + vid(2));
  const job = await queue.lease('k1');
  assert.equal(job.job_id, a.job.job_id); assert.equal(job.status, 'acquiring');
  assert.equal(job.lease_until, new Date(clock.now + 30 * 60 * 1000).toISOString());
  assert.ok(!('lease_key_id' in job));
  const second = await queue.lease('k1');
  assert.notEqual(second.job_id, a.job.job_id);
  assert.equal(await queue.lease('k1'), null);
});
test('step extends lease and records meta', async t => {
  const { queue, clock } = await setup(t);
  await enq(queue);
  const job = await queue.lease('k1');
  clock.now += 10 * 60 * 1000;
  const s = await queue.step(job.job_id, 'k1', { status: 'acquiring', meta: { title: 'Сюжет', duration_sec: 7200, channel_title: 'Kan 11' } });
  assert.equal(s.title, 'Сюжет'); assert.equal(s.duration_sec, 7200); assert.equal(s.channel_title, 'Kan 11');
  assert.equal(s.lease_until, new Date(clock.now + 30 * 60 * 1000).toISOString());
  const a = await queue.step(job.job_id, 'k1', { status: 'asr', progress: 0.4, detail: 'window 12/30' });
  assert.equal(a.status, 'asr'); assert.equal(a.progress, 0.4); assert.equal(a.step_detail, 'window 12/30');
  assert.deepEqual(await codeOf(queue.step(job.job_id, 'k1', { status: 'asr_ready' })), ['MEDIA_INPUT_INVALID', 400]);
});
test('expired lease returns job to queued and counts attempt; third expiry → failed_asr', async t => {
  const { queue, clock } = await setup(t);
  const { job } = await enq(queue);
  for (let i = 1; i <= 3; i++) {
    const l = await queue.lease('k1');
    assert.equal(l.job_id, job.job_id, 'attempt ' + i);
    await queue.step(l.job_id, 'k1', { status: 'asr' });
    clock.now += 31 * 60 * 1000;
    if (i < 3) {
      // The expired job is back in the queue at once.
      const back = await queue.get(job.job_id);
      assert.equal(back.status, 'asr'); // nothing has run the expiry yet
    }
  }
  assert.equal(await queue.lease('k2'), null);
  const final = await queue.get(job.job_id);
  assert.equal(final.status, 'failed_asr'); assert.equal(final.error_code, 'LEASE_EXPIRED'); assert.equal(final.attempts, 3);
});
test('expired lease during acquiring fails as failed_acquire', async t => {
  const { queue, clock } = await setup(t);
  const { job } = await enq(queue);
  for (let i = 0; i < 3; i++) {
    const l = await queue.lease('k1');
    assert.equal(l.job_id, job.job_id);
    assert.equal(l.attempts, i);
    clock.now += 31 * 60 * 1000;
  }
  assert.equal(await queue.lease('k1'), null);
  assert.equal((await queue.get(job.job_id)).status, 'failed_acquire');
});
test('step/fail/accept by a different key → MEDIA_JOB_NOT_LEASED', async t => {
  const { queue } = await setup(t);
  await enq(queue);
  const job = await queue.lease('k1');
  assert.deepEqual(await codeOf(queue.step(job.job_id, 'k2', { status: 'asr' })), ['MEDIA_JOB_NOT_LEASED', 409]);
  assert.deepEqual(await codeOf(queue.fail(job.job_id, 'k2', { code: 'ASR_FAILED', retryable: true, countAttempt: true })), ['MEDIA_JOB_NOT_LEASED', 409]);
  assert.deepEqual(await codeOf(queue.acceptAsrZip(job.job_id, 'k2', asrZip())), ['MEDIA_JOB_NOT_LEASED', 409]);
});
test('fail retryable without countAttempt keeps attempts and status queued', async t => {
  const { queue } = await setup(t);
  await enq(queue);
  const job = await queue.lease('k1');
  const f = await queue.fail(job.job_id, 'k1', { code: 'ASR_BUSY', retryable: true, countAttempt: false });
  assert.equal(f.status, 'queued'); assert.equal(f.attempts, 0); assert.equal(f.error_code, 'ASR_BUSY');
  const again = await queue.lease('k1');
  assert.equal(again.job_id, job.job_id);
});
test('fail retryable with countAttempt: third one is final', async t => {
  const { queue } = await setup(t);
  await enq(queue);
  for (let i = 1; i <= 3; i++) {
    const job = await queue.lease('k1');
    await queue.step(job.job_id, 'k1', { status: 'asr' });
    const f = await queue.fail(job.job_id, 'k1', { code: 'ASR_FAILED', detail: 'exit 1', retryable: true, countAttempt: true });
    assert.equal(f.attempts, i);
    assert.equal(f.status, i < 3 ? 'queued' : 'failed_asr');
  }
});
test('fail not retryable is final at once with its phase', async t => {
  const { queue } = await setup(t);
  await enq(queue);
  const job = await queue.lease('k1');
  const f = await queue.fail(job.job_id, 'k1', { code: 'ACQUIRE_FAILED', detail: 'Sign in to confirm', retryable: false, countAttempt: true });
  assert.equal(f.status, 'failed_acquire'); assert.equal(f.error_detail, 'Sign in to confirm');
});
test('acceptAsrZip stores a valid zip and marks asr_ready', async t => {
  const { queue, dataDir } = await setup(t);
  await enq(queue);
  const job = await queue.lease('k1');
  await queue.step(job.job_id, 'k1', { status: 'asr' });
  const bytes = asrZip();
  const r = await queue.acceptAsrZip(job.job_id, 'k1', bytes);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(r.status, 'asr_ready'); assert.equal(r.asr_zip_sha256, sha); assert.equal(r.asr_zip_bytes, bytes.length);
  assert.equal(r.lease_until, null);
  const p = await queue.asrZipPath(job.job_id);
  assert.equal(p, path.join(dataDir, 'media-queue', 'asr', sha + '.zip'));
  assert.deepEqual(fs.readFileSync(p), bytes);
});
test('acceptAsrZip rejects audio, traversal, incomplete, non-zip and oversized', async t => {
  const { queue } = await setup(t);
  await enq(queue);
  const job = await queue.lease('k1');
  const evil = new AdmZip(asrZip()); evil.addFile('xx/evil.js', Buffer.from('x'));
  const evilBuf = Buffer.from(evil.toBuffer().toString('latin1').replaceAll('xx/evil.js', '../evil.js'), 'latin1');
  const bad = [asrZip({ extra: { 'a.wav': 'x' } }), asrZip({ extra: { 'raw/x.m4a': 'x' } }), asrZip({ completed: false }),
    Buffer.from('not a zip'), Buffer.alloc(50 * 1024 * 1024 + 1), evilBuf];
  for (const [i, b] of bad.entries()) assert.deepEqual(await codeOf(queue.acceptAsrZip(job.job_id, 'k1', b)), ['MEDIA_ASR_ZIP_INVALID', 400], 'case ' + i);
  assert.equal((await queue.get(job.job_id)).status, 'acquiring');
});
test('retry failed job → queued, attempts reset; retry of open job → MEDIA_JOB_STATE', async t => {
  const { queue } = await setup(t);
  await enq(queue);
  const job = await queue.lease('k1');
  assert.deepEqual(await codeOf(queue.retry(job.job_id)), ['MEDIA_JOB_STATE', 409]);
  await queue.fail(job.job_id, 'k1', { code: 'ACQUIRE_FAILED', retryable: false, countAttempt: true });
  const r = await queue.retry(job.job_id);
  assert.equal(r.status, 'queued'); assert.equal(r.attempts, 0); assert.equal(r.error_code, null);
});
test('cancel only open jobs; list hides lease key, newest first', async t => {
  const { queue, clock } = await setup(t);
  const a = await enq(queue, 'https://youtu.be/' + vid(1)); clock.now += 1000;
  const b = await enq(queue, 'https://youtu.be/' + vid(2));
  const list = await queue.list();
  assert.deepEqual(list.map(j => j.job_id), [b.job.job_id, a.job.job_id]);
  assert.ok(list.every(j => !('lease_key_id' in j)));
  assert.equal((await queue.cancel(a.job.job_id)).status, 'cancelled');
  assert.deepEqual(await codeOf(queue.cancel(a.job.job_id)), ['MEDIA_JOB_STATE', 409]);
  assert.deepEqual(await codeOf(queue.cancel('mj_0000000000000000')), ['MEDIA_JOB_NOT_FOUND', 404]);
});

// ---- final review fixes -----------------------------------------------------------------------------------
test('list reclaims an abandoned lease (the PC never came back)', async t => {
  const { queue, clock } = await setup(t);
  const { job } = await enq(queue);
  const l = await queue.lease('k1');
  await queue.step(l.job_id, 'k1', { status: 'asr' });
  clock.now += 31 * 60 * 1000;
  const [row] = await queue.list();
  assert.equal(row.job_id, job.job_id); assert.equal(row.status, 'queued'); assert.equal(row.error_code, 'LEASE_EXPIRED');
});
test('lease clears the previous error so a running job shows no stale hint', async t => {
  const { queue } = await setup(t);
  await enq(queue);
  const j = await queue.lease('k1');
  await queue.fail(j.job_id, 'k1', { code: 'ASR_BUSY', retryable: true, countAttempt: false });
  const again = await queue.lease('k1');
  assert.equal(again.error_code, null); assert.equal(again.error_detail, null);
});
test('acceptAsrZip refuses a manifest bigger than 1 MB unpacked and too many entries', async t => {
  const { queue } = await setup(t);
  await enq(queue);
  const job = await queue.lease('k1');
  const big = new AdmZip();
  big.addFile('manifest.json', Buffer.from('{"completed":true,"pad":"' + ' '.repeat(1024 * 1024 + 10) + '"}'));
  assert.ok(big.toBuffer().length < 100 * 1024, 'the bomb is small packed');
  assert.deepEqual(await codeOf(queue.acceptAsrZip(job.job_id, 'k1', big.toBuffer())), ['MEDIA_ASR_ZIP_INVALID', 400]);
  const many = new AdmZip(asrZip());
  for (let i = 0; i < 2001; i++) many.addFile('raw/w' + i + '.json', Buffer.from('{}'));
  assert.deepEqual(await codeOf(queue.acceptAsrZip(job.job_id, 'k1', many.toBuffer())), ['MEDIA_ASR_ZIP_INVALID', 400]);
});
test('inspectAsrZip refuses a total unpacked size over the cap', () => {
  const { inspectAsrZip, LIMITS } = require('../mediaqueue/mediaQueueRepo');
  const z = new AdmZip(asrZip());
  z.addFile('raw/big.json', Buffer.alloc(2048, 32));
  assert.throws(() => inspectAsrZip(z.toBuffer(), { maxUnpacked: 1024 }), e => e.code === 'MEDIA_ASR_ZIP_INVALID' && e.detail === 'too_large_unpacked');
  assert.equal(LIMITS.ASR_ZIP_UNPACKED_MAX, 500 * 1024 * 1024);
});

// ---- M2 Task 2: dot's side of the queue -------------------------------------------------------------------
async function asrReady(queue, clock, n) {
  const { job } = await enq(queue, 'https://youtu.be/' + vid(n));
  const l = await queue.lease('k1');
  assert.equal(l.job_id, job.job_id);
  await queue.acceptAsrZip(job.job_id, 'k1', asrZip());
  clock.now += 1000;
  return job;
}
const H4 = 4 * 3600 * 1000;
test('nextForDot gives the oldest ready job, then expired dot leases with retry:true', async t => {
  const { queue, clock } = await setup(t);
  assert.equal(await queue.nextForDot(), null);
  const a = await asrReady(queue, clock, 1), b = await asrReady(queue, clock, 2);
  const n1 = await queue.nextForDot();
  assert.equal(n1.job_id, a.job_id); assert.equal(n1.retry, false);
  await queue.takeForDot(a.job_id, 'ed1');
  assert.equal((await queue.nextForDot()).job_id, b.job_id);
  await queue.takeForDot(b.job_id, 'ed1');
  assert.equal(await queue.nextForDot(), null);
  clock.now += H4 + 1000;
  const again = await queue.nextForDot();
  assert.equal(again.job_id, a.job_id); assert.equal(again.retry, true);
});
test('takeForDot leases 4 h; another editor cannot take a live lease', async t => {
  const { queue, clock } = await setup(t);
  const a = await asrReady(queue, clock, 1);
  const taken = await queue.takeForDot(a.job_id, 'ed1');
  assert.equal(taken.status, 'dot_taken'); assert.equal(taken.dot_lease_until, new Date(clock.now + H4).toISOString());
  assert.ok(!('dot_editor_id' in taken));
  assert.equal((await queue.takeForDot(a.job_id, 'ed1')).status, 'dot_taken', 'own lease can be renewed');
  assert.deepEqual(await codeOf(queue.takeForDot(a.job_id, 'ed2')), ['MEDIA_JOB_NOT_TAKEN', 409]);
  clock.now += H4 + 1;
  assert.equal((await queue.takeForDot(a.job_id, 'ed2')).status, 'dot_taken', 'an expired lease can be taken');
  const queued = (await enq(queue, 'https://youtu.be/' + vid(9))).job;
  assert.deepEqual(await codeOf(queue.takeForDot(queued.job_id, 'ed1')), ['MEDIA_JOB_NOT_TAKEN', 409]);
});
test('beginPublish only from own dot_taken; same sha repeat returns repeat:true', async t => {
  const { queue, clock } = await setup(t);
  const a = await asrReady(queue, clock, 1);
  assert.deepEqual(await codeOf(queue.beginPublish(a.job_id, 'ed1', 'f'.repeat(64))), ['MEDIA_JOB_NOT_TAKEN', 409]);
  await queue.takeForDot(a.job_id, 'ed1');
  assert.deepEqual(await codeOf(queue.beginPublish(a.job_id, 'ed2', 'f'.repeat(64))), ['MEDIA_JOB_NOT_TAKEN', 409]);
  const b = await queue.beginPublish(a.job_id, 'ed1', 'f'.repeat(64));
  assert.equal(b.job.status, 'publishing'); assert.equal(b.uploadNo, 1); assert.equal(b.repeat, false);
  const r = await queue.beginPublish(a.job_id, 'ed1', 'f'.repeat(64));
  assert.equal(r.repeat, true); assert.equal(r.uploadNo, 1);
  assert.deepEqual(await codeOf(queue.beginPublish(a.job_id, 'ed1', 'e'.repeat(64))), ['MEDIA_JOB_STATE', 409]);
});
test('publishFailed returns to dot_taken with the code; the next upload counts 2', async t => {
  const { queue, clock } = await setup(t);
  const a = await asrReady(queue, clock, 1);
  await queue.takeForDot(a.job_id, 'ed1');
  await queue.beginPublish(a.job_id, 'ed1', 'f'.repeat(64));
  const f = await queue.publishFailed(a.job_id, 'MATERIAL_ARCHIVE_INVALID', 'PACKAGE_X');
  assert.equal(f.status, 'dot_taken'); assert.equal(f.error_code, 'MATERIAL_ARCHIVE_INVALID'); assert.equal(f.error_detail, 'PACKAGE_X');
  const b = await queue.beginPublish(a.job_id, 'ed1', 'e'.repeat(64));
  assert.equal(b.uploadNo, 2); assert.equal(b.job.error_code, null);
});
test('markPublished; a repeat after publishing returns repeat with the material', async t => {
  const { queue, clock } = await setup(t);
  const a = await asrReady(queue, clock, 1);
  await queue.takeForDot(a.job_id, 'ed1');
  await queue.beginPublish(a.job_id, 'ed1', 'f'.repeat(64));
  const p = await queue.markPublished(a.job_id, { slug: 'media-x', workId: 'work-y' });
  assert.equal(p.status, 'published'); assert.equal(p.published_slug, 'media-x'); assert.equal(p.published_work_id, 'work-y');
  assert.equal(p.published_at, new Date(clock.now).toISOString());
  const r = await queue.beginPublish(a.job_id, 'ed1', 'f'.repeat(64));
  assert.equal(r.repeat, true); assert.equal(r.job.status, 'published');
});
test('dotFail → failed_publish; owner retry → asr_ready', async t => {
  const { queue, clock } = await setup(t);
  const a = await asrReady(queue, clock, 1);
  await queue.takeForDot(a.job_id, 'ed1');
  const f = await queue.dotFail(a.job_id, 'ed1', { reason: 'речь не на иврите' });
  assert.equal(f.status, 'failed_publish'); assert.equal(f.error_code, 'DOT_REFUSED'); assert.equal(f.error_detail, 'речь не на иврите');
  const r = await queue.retry(a.job_id);
  assert.equal(r.status, 'asr_ready'); assert.equal(r.error_code, null);
  assert.equal((await queue.nextForDot()).job_id, a.job_id);
});
test('withdraw only from published', async t => {
  const { queue, clock } = await setup(t);
  const a = await asrReady(queue, clock, 1);
  assert.deepEqual(await codeOf(queue.withdraw(a.job_id)), ['MEDIA_JOB_STATE', 409]);
  await queue.takeForDot(a.job_id, 'ed1'); await queue.beginPublish(a.job_id, 'ed1', 'f'.repeat(64));
  await queue.markPublished(a.job_id, { slug: 's', workId: 'w' });
  const w = await queue.withdraw(a.job_id);
  assert.equal(w.status, 'withdrawn'); assert.equal(w.withdrawn_at, new Date(clock.now).toISOString());
});
test('retireCandidates returns only dot publications older than the cut and not withdrawn', async t => {
  const { queue, clock } = await setup(t);
  const pub = async n => { const j = await asrReady(queue, clock, n); await queue.takeForDot(j.job_id, 'ed1'); await queue.beginPublish(j.job_id, 'ed1', String(n).repeat(64).slice(0, 64)); return queue.markPublished(j.job_id, { slug: 's', workId: 'w' + n }); };
  const old = await pub(1); const gone = await pub(2); await queue.withdraw(gone.job_id);
  clock.now += 31 * 24 * 3600 * 1000;
  await pub(3);
  const r = await queue.retireCandidates(new Date(clock.now - 30 * 24 * 3600 * 1000).toISOString());
  assert.deepEqual(r, [{ job_id: old.job_id, published_slug: 's', published_work_id: 'w1' }]);
});
test('cancel is allowed while ASR is ready (dot has not taken it)', async t => {
  const { queue, clock } = await setup(t);
  const a = await asrReady(queue, clock, 1);
  assert.equal((await queue.cancel(a.job_id)).status, 'cancelled');
});

// ---- M2 final review fixes ---------------------------------------------------------------------------------
test('a publishing job stale for 30 min is offered again and accepts a different archive', async t => {
  const { queue, clock } = await setup(t);
  const a = await asrReady(queue, clock, 1);
  await queue.takeForDot(a.job_id, 'ed1');
  await queue.beginPublish(a.job_id, 'ed1', 'f'.repeat(64));
  assert.equal(await queue.nextForDot(), null, 'a fresh publish is not offered');
  assert.deepEqual(await codeOf(queue.beginPublish(a.job_id, 'ed1', 'e'.repeat(64))), ['MEDIA_JOB_STATE', 409]);
  clock.now += 31 * 60 * 1000; // the process died mid-publish
  const n = await queue.nextForDot();
  assert.equal(n.job_id, a.job_id); assert.equal(n.retry, true);
  await queue.takeForDot(a.job_id, 'ed2');
  const b = await queue.beginPublish(a.job_id, 'ed2', 'e'.repeat(64));
  assert.equal(b.repeat, false); assert.equal(b.uploadNo, 2);
});
test('markPublished twice with the same work id returns the job', async t => {
  const { queue, clock } = await setup(t);
  const a = await asrReady(queue, clock, 1);
  await queue.takeForDot(a.job_id, 'ed1'); await queue.beginPublish(a.job_id, 'ed1', 'f'.repeat(64));
  await queue.markPublished(a.job_id, { slug: 's', workId: 'w' });
  assert.equal((await queue.markPublished(a.job_id, { slug: 's', workId: 'w' })).status, 'published');
  assert.deepEqual(await codeOf(queue.markPublished(a.job_id, { slug: 's', workId: 'other' })), ['MEDIA_JOB_STATE', 409]);
});

// ---- M3 Task 2: dot's picks, the daily quota and the 2-hour limit (plan ...-m3.md) --------------------------------
const { LIMITS } = require('../mediaqueue/mediaQueueRepo');
const pick = (queue, n) => queue.enqueue({ url: 'https://youtu.be/' + vid(n), source: 'dot', actorId: 'ed_dot' });

test('dot picks: 5 per Israel day, the 6th is refused, the next Israel day has 5 again', async t => {
  const { clock, queue } = await setup(t);
  clock.now = Date.parse('2026-11-27T21:30:00Z'); // 23:30 in Israel
  for (let i = 1; i <= 5; i++) assert.equal((await pick(queue, i)).job.source, 'dot');
  assert.deepEqual(await codeOf(pick(queue, 6)), ['MEDIA_DOT_DAILY_LIMIT', 409]);
  const q = await queue.dotQuota();
  assert.deepEqual([q.limit, q.used, q.left, q.day, q.max_duration_sec], [5, 5, 0, '2026-11-27', 7200]);
  clock.now = Date.parse('2026-11-27T22:30:00Z'); // 00:30 next Israel day
  assert.equal((await queue.dotQuota()).left, 5);
  assert.equal((await pick(queue, 6)).existing, false);
});

test('dot picks racing at the quota edge create one job only', async t => {
  const { queue } = await setup(t);
  for (let i = 1; i <= 4; i++) await pick(queue, i);
  const r = await Promise.allSettled([pick(queue, 10), pick(queue, 11), pick(queue, 12)]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal((await queue.dotQuota()).used, 5);
});

test('a dot pick of a video already queued returns that job and costs no quota', async t => {
  const { queue } = await setup(t);
  const own = await queue.enqueue({ url: 'https://youtu.be/' + vid(1), source: 'owner', actorId: 'owner1' });
  const r = await pick(queue, 1);
  assert.equal(r.existing, true); assert.equal(r.job.job_id, own.job.job_id);
  assert.equal((await queue.dotQuota()).used, 0);
});

test('owner orders lease before dot picks; dot jobs carry the 2-hour limit', async t => {
  const { clock, queue } = await setup(t);
  await pick(queue, 1);
  clock.now += 1000;
  const own = await queue.enqueue({ url: 'https://youtu.be/' + vid(2), source: 'owner', actorId: 'owner1' });
  const first = await queue.lease('k1');
  assert.equal(first.job_id, own.job.job_id); assert.equal(first.max_duration_sec, null);
  const second = await queue.lease('k1');
  assert.equal(second.source, 'dot'); assert.equal(second.max_duration_sec, 7200);
});

test('a dot pick longer than 2 hours closes as MEDIA_TOO_LONG and gives its quota place back', async t => {
  const { queue } = await setup(t);
  for (let i = 1; i <= 5; i++) await pick(queue, i);
  const j = await queue.lease('k1');
  const r = await queue.step(j.job_id, 'k1', { status: 'acquiring', meta: { title: 'ארוך', duration_sec: LIMITS.DOT_MAX_DURATION_SEC + 1 } });
  assert.equal(r.status, 'failed_acquire'); assert.equal(r.error_code, 'MEDIA_TOO_LONG'); assert.equal(r.attempts, 0);
  assert.equal(r.duration_sec, 7201); assert.equal(r.lease_until, null);
  assert.equal((await queue.dotQuota()).left, 1);
  assert.deepEqual(await codeOf(queue.step(j.job_id, 'k1', { status: 'asr' })), ['MEDIA_JOB_NOT_LEASED', 409]);
});

test('an owner order longer than 2 hours goes on', async t => {
  const { queue } = await setup(t);
  await enq(queue);
  const j = await queue.lease('k1');
  const r = await queue.step(j.job_id, 'k1', { status: 'acquiring', meta: { duration_sec: 3 * 3600 } });
  assert.equal(r.status, 'acquiring');
});

test('a pick takes title and channel from its candidate; the list shows dot\'s translation', async t => {
  const { db, queue } = await setup(t);
  await run(db, "INSERT INTO media_channels(channel_id,title,added_at,enabled) VALUES('UCKEImtWikw9usC1pl_9m1nQ','C14','x',1)");
  await run(db, "INSERT INTO media_candidates(video_id,channel_id,title,published_at,first_seen_at,title_ru) VALUES(?,?,?,?,?,?)",
    [vid(1), 'UCKEImtWikw9usC1pl_9m1nQ', 'הפטריוטים', '2026-11-26T22:00:00.000Z', 'x', 'Патриоты']);
  const r = await pick(queue, 1);
  assert.equal(r.job.title, 'הפטריוטים'); assert.equal(r.job.channel_title, 'C14'); assert.equal(r.job.channel_id, 'UCKEImtWikw9usC1pl_9m1nQ');
  assert.equal(r.job.pick_day, '2026-11-27');
  const [row] = await queue.list();
  assert.equal(row.title_ru, 'Патриоты');
});

test('enqueue refuses an unknown source', async t => {
  const { queue } = await setup(t);
  assert.deepEqual(await codeOf(queue.enqueue({ url: 'https://youtu.be/' + ID, source: 'channel' })), ['MEDIA_INPUT_INVALID', 400]);
});

test('the owner\'s retry of a too-long dot pick makes it the owner\'s order', async t => {
  const { queue } = await setup(t);
  await pick(queue, 1);
  const j = await queue.lease('k1');
  await queue.step(j.job_id, 'k1', { status: 'acquiring', meta: { duration_sec: 9000 } });
  const r = await queue.retry(j.job_id);
  assert.deepEqual([r.status, r.source, r.priority, r.max_duration_sec, r.error_code], ['queued', 'owner', 100, null, null]);
  const again = await queue.lease('k1');
  assert.equal((await queue.step(again.job_id, 'k1', { status: 'acquiring', meta: { duration_sec: 9000 } })).status, 'acquiring');
});
