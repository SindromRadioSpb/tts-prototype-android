'use strict';
// dot's archive → canonical publication into «Видео дня» (spec 2026-11-27 §5.4–5.5; plan M2 Task 4).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const sqlite3 = require('sqlite3');
const AdmZip = require('adm-zip');
const fixture = require('./helpers/mediathequeArchiveFixture.cjs');
const Core = require('../public/js/portable-learning-package-core');
const Portable = require('../public/js/studio-portable-learning-package');
const Playback = require('../public/js/playback-source');
const C = require('../public/js/mediatheque-core');
const { createPublicationRepo } = require('../db/publicationRepo');
const { createMediaQueue, MediaQueueError } = require('../mediaqueue/mediaQueueRepo');
const { createDailyPublisher } = require('../mediaqueue/dailyPublisher');

const MIGRATIONS = ['020_identity.sql', '056_group_song_corpus_p0.sql', '057_group_corpus_audio_revisions.sql', '058_group_corpus_catalog_metadata.sql',
  '063_publication_domain.sql', '067_mediatheque_structure.sql', '068_mediatheque_material_purge.sql', '069_mediatheque_purge_sources.sql',
  '099_media_queue.sql', '100_media_queue_publish.sql', '101_media_channels.sql', '102_media_worker_seen.sql', '103_media_daily_seen.sql'];
const exec = (db, s) => new Promise((resolve, reject) => db.exec(s, e => e ? reject(e) : resolve()));
const VIDEO = 'sYd4zgR7f6w';
const DAY = 24 * 3600 * 1000;

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-dailypub-'));
  const db = await new Promise((resolve, reject) => { const d = new sqlite3.Database(':memory:', e => e ? reject(e) : resolve(d)); });
  await exec(db, 'PRAGMA foreign_keys=ON');
  for (const m of MIGRATIONS) await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', m), 'utf8'));
  await exec(db, "INSERT INTO users(id,role,display_name) VALUES('owner','owner','Owner')");
  t.after(async () => { await new Promise(r => db.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const clock = { now: Date.parse('2026-11-27T08:00:00Z') };
  const repo = createPublicationRepo({ db, dataDir: dir });
  const queue = createMediaQueue({ db, dataDir: dir, now: () => clock.now });
  const publisher = createDailyPublisher({ repo, queue, ownerActor: async () => ({ id: 'owner', role: 'owner' }), now: () => clock.now });
  return { db, repo, queue, publisher, clock };
}
function asrZip() { const z = new AdmZip(); z.addFile('manifest.json', Buffer.from('{"completed":true}')); return z.toBuffer(); }
// A job of the owner for VIDEO (or another id), with ASR ready and taken by dot.
async function takenJob(h, videoId = VIDEO, title = 'Сюжет') {
  const { job } = await h.queue.enqueue({ url: 'https://youtu.be/' + videoId, source: 'owner', actorId: 'owner' });
  const l = await h.queue.lease('k1');
  await h.queue.step(l.job_id, 'k1', { status: 'acquiring', meta: { title, duration_sec: 600, channel_title: 'Kan 11' } });
  await h.queue.acceptAsrZip(job.job_id, 'k1', asrZip());
  await h.queue.takeForDot(job.job_id, 'ed1');
  return job;
}
async function archiveBytes(variant, videoId = VIDEO) {
  const input = fixture();
  input.table_revisions[0].rows[0].ru = 'привет ' + variant; input.text_card.card.rows[0].russian = 'привет ' + variant;
  input.playback_source = Playback.append(null, { url: 'https://www.youtube.com/watch?v=' + videoId });
  return Buffer.from(await Portable.zipFiles(await Core.buildPackageFiles(input, { mode: 'snapshot' }), 'nodebuffer'));
}
const daily = async h => ((await h.repo.getPublicMediatheque()).structure.categories.find(c => c.id === 'm_daily_video') || { items: [] }).items;

test('dot archive becomes a published material in «Видео дня»', async t => {
  const h = await setup(t);
  const job = await takenJob(h);
  const r = await h.publisher.publish(job.job_id, 'ed1', await archiveBytes('a'));
  assert.equal(r.job.status, 'published');
  assert.equal(r.material.slug, 'media-' + crypto.createHash('sha256').update('dot:m_daily_video').digest('hex').slice(0, 20));
  assert.match(r.material.workId, /^work-[a-f0-9]{24}$/);
  const pub = await h.repo.getPublicMediatheque();
  const item = pub.items.find(i => i.ref.slug === r.material.slug && i.ref.workId === r.material.workId);
  assert.ok(item, 'the material is public');
  assert.deepEqual(await daily(h), [C.refKey(item.ref)]);
  assert.equal((await h.queue.get(job.job_id)).published_work_id, r.material.workId);
});

test('repeat upload of the same archive returns the same material, no second item', async t => {
  const h = await setup(t);
  const job = await takenJob(h);
  const bytes = await archiveBytes('a');
  const r1 = await h.publisher.publish(job.job_id, 'ed1', bytes);
  const r2 = await h.publisher.publish(job.job_id, 'ed1', bytes);
  assert.deepEqual(r2.material, r1.material);
  assert.equal((await daily(h)).length, 1);
  assert.equal((await h.repo.getPublicMediatheque()).items.length, 1);
});

test('invalid archive → MATERIAL_ARCHIVE code, job back to dot_taken, Mediatheque unchanged', async t => {
  const h = await setup(t);
  const job = await takenJob(h);
  await assert.rejects(h.publisher.publish(job.job_id, 'ed1', Buffer.from('not a zip at all')),
    e => e instanceof MediaQueueError && /^MATERIAL_ARCHIVE/.test(e.code) && e.status === 400);
  const j = await h.queue.get(job.job_id);
  assert.equal(j.status, 'dot_taken'); assert.match(j.error_code, /^MATERIAL_ARCHIVE/);
  assert.equal((await h.repo.getPublicMediatheque()).items.length, 0);
  // dot fixes the archive and sends it again
  const r = await h.publisher.publish(job.job_id, 'ed1', await archiveBytes('a'));
  assert.equal(r.job.status, 'published');
});

test('materials older than 30 days leave «Видео дня» on the next publication', async t => {
  const h = await setup(t);
  const j1 = await takenJob(h, VIDEO, 'Первый');
  const r1 = await h.publisher.publish(j1.job_id, 'ed1', await archiveBytes('one'));
  h.clock.now += 31 * DAY;
  const j2 = await takenJob(h, 'aaaaaaaaaaa', 'Второй');
  const r2 = await h.publisher.publish(j2.job_id, 'ed1', await archiveBytes('two', 'aaaaaaaaaaa'));
  const items = await daily(h);
  assert.equal(items.length, 1);
  assert.ok(items[0].includes(r2.material.workId)); assert.ok(!items.some(k => k.includes(r1.material.workId)));
  assert.ok((await h.repo.getPublicMediatheque()).items.some(i => i.ref.workId === r1.material.workId), 'the old material stays public');
});

test('an archive made for another video is refused (MATERIAL_SOURCE_MISMATCH)', async t => {
  const h = await setup(t);
  const job = await takenJob(h, 'bbbbbbbbbbb');
  await assert.rejects(h.publisher.publish(job.job_id, 'ed1', await archiveBytes('x', VIDEO)), e => e.code === 'MATERIAL_SOURCE_MISMATCH' && e.status === 400);
  assert.equal((await h.queue.get(job.job_id)).status, 'dot_taken');
  assert.equal((await h.repo.getPublicMediatheque()).items.length, 0);
});

test('withdraw takes the material out of «Видео дня» and marks the job', async t => {
  const h = await setup(t);
  const job = await takenJob(h);
  await h.publisher.publish(job.job_id, 'ed1', await archiveBytes('a'));
  const w = await h.publisher.withdraw(job.job_id);
  assert.equal(w.status, 'withdrawn');
  assert.deepEqual(await daily(h), []);
  await assert.rejects(h.publisher.withdraw(job.job_id), e => e.code === 'MEDIA_JOB_STATE' && e.status === 409);
});
test('withdraw of a material already retired from «Видео дня» only marks the job', async t => {
  const h = await setup(t);
  const j1 = await takenJob(h, VIDEO, 'Первый');
  await h.publisher.publish(j1.job_id, 'ed1', await archiveBytes('one'));
  h.clock.now += 31 * DAY;
  const j2 = await takenJob(h, 'aaaaaaaaaaa', 'Второй');
  await h.publisher.publish(j2.job_id, 'ed1', await archiveBytes('two', 'aaaaaaaaaaa'));
  assert.equal((await h.publisher.withdraw(j1.job_id)).status, 'withdrawn');
  assert.equal((await daily(h)).length, 1);
});

// ---- M2 final review fixes ---------------------------------------------------------------------------------
// The real repo with one method failing once (a crash or a deploy at that step).
function failOnce(h, method, code = 'MEDIATHEQUE_INVALID', status = 500) {
  let armed = true;
  const repo = new Proxy(h.repo, { get: (target, key) => {
    const v = target[key];
    if (key === method) return async (...a) => { if (armed) { armed = false; throw Object.assign(new Error(code), { code, status }); } return v.apply(target, a); };
    return typeof v === 'function' ? v.bind(target) : v;
  } });
  return createDailyPublisher({ repo, queue: h.queue, ownerActor: async () => ({ id: 'owner', role: 'owner' }), now: () => h.clock.now });
}
test('dot publishes into its own corpus, never the one the wizard makes for «Видео дня»', async t => {
  const h = await setup(t);
  const job = await takenJob(h);
  const r = await h.publisher.publish(job.job_id, 'ed1', await archiveBytes('a'));
  const wizardSlug = 'media-' + crypto.createHash('sha256').update('m_daily_video').digest('hex').slice(0, 20);
  assert.notEqual(r.material.slug, wizardSlug); assert.match(r.material.slug, /^media-[a-f0-9]{20}$/);
});
test('a failure after the corpus publish is recovered by the same archive (no second material)', async t => {
  const h = await setup(t);
  const job = await takenJob(h);
  const bytes = await archiveBytes('a');
  const p = failOnce(h, 'publishMediathequeDailyAddition');
  await assert.rejects(p.publish(job.job_id, 'ed1', bytes), e => e.code === 'MEDIA_PUBLISH_RETRY' && e.status === 409);
  assert.equal((await h.queue.get(job.job_id)).status, 'dot_taken');
  const r = await p.publish(job.job_id, 'ed1', bytes);
  assert.equal(r.job.status, 'published');
  assert.equal((await h.repo.getPublicMediatheque()).items.length, 1);
  assert.equal((await daily(h)).length, 1);
});
test('a failed copy leaves no residue: the next job publishes only itself', async t => {
  const h = await setup(t);
  const a = await takenJob(h, VIDEO, 'A');
  const p = failOnce(h, 'recordMaterialRights');
  await assert.rejects(p.publish(a.job_id, 'ed1', await archiveBytes('a')), e => e.code === 'MEDIA_PUBLISH_RETRY');
  const b = await takenJob(h, 'aaaaaaaaaaa', 'B');
  await p.publish(b.job_id, 'ed1', await archiveBytes('b', 'aaaaaaaaaaa'));
  assert.equal((await h.repo.getPublicMediatheque()).items.length, 1, 'A was not published by B');
  const ra = await p.publish(a.job_id, 'ed1', await archiveBytes('a'));
  assert.equal(ra.job.status, 'published');
  assert.equal((await h.repo.getPublicMediatheque()).items.length, 2);
  assert.equal((await daily(h)).length, 2);
});
test('two uploads at once are published one after another', async t => {
  const h = await setup(t);
  const a = await takenJob(h, VIDEO, 'A'), b = await takenJob(h, 'aaaaaaaaaaa', 'B');
  const [ra, rb] = await Promise.all([h.publisher.publish(a.job_id, 'ed1', await archiveBytes('a')), h.publisher.publish(b.job_id, 'ed1', await archiveBytes('b', 'aaaaaaaaaaa'))]);
  assert.equal(ra.job.status, 'published'); assert.equal(rb.job.status, 'published');
  assert.equal((await daily(h)).length, 2);
});
test('an archive defect stays 400 for dot; a server-side failure is MEDIA_PUBLISH_RETRY 409', async t => {
  const h = await setup(t);
  const job = await takenJob(h, 'bbbbbbbbbbb');
  await assert.rejects(h.publisher.publish(job.job_id, 'ed1', await archiveBytes('x', VIDEO)), e => e.code === 'MATERIAL_SOURCE_MISMATCH' && e.status === 400);
  const p = failOnce(h, 'publish', 'SQLITE_BUSY', undefined);
  await assert.rejects(p.publish(job.job_id, 'ed1', await archiveBytes('y', 'bbbbbbbbbbb')), e => e.code === 'MEDIA_PUBLISH_RETRY' && e.status === 409 && /SQLITE_BUSY/.test(JSON.stringify(e.detail)));
  assert.equal((await h.queue.get(job.job_id)).error_code, 'MEDIA_PUBLISH_RETRY');
});
