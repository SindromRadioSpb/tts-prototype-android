'use strict';
// dot's narrow publication into «Видео дня» (spec 2026-11-27 §5.5; plan M2 Task 3): one structure command applied
// to the published edition AND the owner's draft; nothing else of the draft is published.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const sqlite3 = require('sqlite3');
const fixture = require('./helpers/mediathequeArchiveFixture.cjs');
const Core = require('../public/js/portable-learning-package-core');
const Portable = require('../public/js/studio-portable-learning-package');
const Playback = require('../public/js/playback-source');
const C = require('../public/js/mediatheque-core');
const { createPublicationRepo, DAILY_VIDEO } = require('../db/publicationRepo');

const MIGRATIONS = ['020_identity.sql', '056_group_song_corpus_p0.sql', '057_group_corpus_audio_revisions.sql', '058_group_corpus_catalog_metadata.sql',
  '063_publication_domain.sql', '067_mediatheque_structure.sql', '068_mediatheque_material_purge.sql', '069_mediatheque_purge_sources.sql', '103_media_daily_seen.sql'];
const exec = (db, s) => new Promise((resolve, reject) => db.exec(s, e => e ? reject(e) : resolve()));
async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-daily-'));
  const db = await new Promise((resolve, reject) => { const d = new sqlite3.Database(':memory:', e => e ? reject(e) : resolve(d)); });
  await exec(db, 'PRAGMA foreign_keys=ON');
  for (const m of MIGRATIONS) await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', m), 'utf8'));
  await exec(db, "INSERT INTO users(id,role,display_name) VALUES('owner','owner','Owner'),('member','user','Member')");
  t.after(async () => { await new Promise(r => db.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  return { db, dir, repo: createPublicationRepo({ db, dataDir: dir }), owner: { id: 'owner', role: 'owner' } };
}
async function archiveBytes(variant) {
  const input = fixture();
  input.table_revisions[0].rows[0].ru = 'привет ' + variant; input.text_card.card.rows[0].russian = 'привет ' + variant;
  input.playback_source = Playback.append(null, { url: 'https://www.youtube.com/watch?v=sYd4zgR7f6w' });
  return Buffer.from(await Portable.zipFiles(await Core.buildPackageFiles(input, { mode: 'snapshot' }), 'nodebuffer'));
}
// A material published into a corpus by the same canonical steps as the owner's wizard → its public ref.
async function publishMaterial(h, slug, title, key) {
  const prepared = await h.repo.prepareMediathequeArchive(h.owner, await archiveBytes(title), { mode: 'youtube' });
  const o = n => ({ idempotencyKey: key + '-' + n });
  let corpus = (await h.repo.listPublisherCorpora(h.owner)).find(c => c.slug === slug);
  if (!corpus) corpus = await h.repo.createCorpus(h.owner, { slug, title: 'Corpus' }, o('create'));
  let detail = await h.repo.getPublisherCorpus(h.owner, corpus.corpus_id);
  if (!detail.draft) { await h.repo.createRevisionDraft(h.owner, corpus.corpus_id, o('rev')); detail = await h.repo.getPublisherCorpus(h.owner, corpus.corpus_id); }
  const copied = await h.repo.copyMediathequeArchive(h.owner, corpus.corpus_id, { token: prepared.token, title, creator: 'Channel', expectedVersion: detail.draft.version }, o('copy'));
  const rights = await h.repo.recordMaterialRights(h.owner, corpus.corpus_id, { itemIds: copied.items.map(i => i.item_id), expectedVersion: copied.draft_version,
    preset: { public_read_allowed: true, public_stream_allowed: true, package_download_allowed: true, basis: 'OWNER_ATTESTATION_2026_11_27', asserted_at: '2026-11-27' } }, o('rights'));
  await h.repo.publish(h.owner, corpus.corpus_id, { expectedVersion: rights.draft_version }, o('publish'));
  return (await h.repo.getPublicMediatheque()).items.find(i => i.title === title).ref;
}
const key = ref => C.refKey(ref);
const cat = (s, id) => s.categories.find(c => c.id === id);
const dailySlug = 'media-' + crypto.createHash('sha256').update('m_daily_video').digest('hex').slice(0, 20);

test('DAILY_VIDEO is the fixed category', () => {
  assert.deepEqual(DAILY_VIDEO, { id: 'm_daily_video', title: 'Видео дня' });
});

test('daily addition publishes only the new item while the owner draft edit stays unpublished', async t => {
  const h = await setup(t);
  // 1. The owner's material A in topic «Тема», published.
  const a = await publishMaterial(h, 'media-' + '1'.repeat(20), 'A', 'a');
  let draft = await h.repo.getMediathequeDraft(h.owner);
  let s = C.command(draft.structure, { type: 'category.create', id: 'm_topic', title: 'Тема' }, { publicOnly: true });
  s = C.command(s, { type: 'items.add', target: 'category', id: 'm_topic', references: [a] }, { publicOnly: true });
  await h.repo.saveMediathequeDraft(h.owner, { structure: s, expectedVersion: draft.revision }, { idempotencyKey: 'save1' });
  draft = await h.repo.getMediathequeDraft(h.owner);
  await h.repo.publishMediatheque(h.owner, { expectedVersion: draft.revision, expectedEdition: draft.edition_id }, { idempotencyKey: 'pub1' });
  // 2. An unpublished edit of the owner in the draft.
  draft = await h.repo.getMediathequeDraft(h.owner);
  s = C.command(draft.structure, { type: 'category.create', id: 'm_unpub', title: 'Неопубликованная' }, { publicOnly: true });
  await h.repo.saveMediathequeDraft(h.owner, { structure: s, expectedVersion: draft.revision }, { idempotencyKey: 'save2' });
  const before = await h.repo.getMediathequeDraft(h.owner);
  // 3. dot's material B into «Видео дня».
  const b = await publishMaterial(h, dailySlug, 'B', 'b');
  const r = await h.repo.publishMediathequeDailyAddition(h.owner, { ref: b }, { idempotencyKey: 'daily1' });
  assert.ok(r.edition_id);
  const pub = (await h.repo.getPublicMediatheque()).structure;
  assert.deepEqual(cat(pub, 'm_daily_video').items, [key(b)]);
  assert.equal(cat(pub, 'm_daily_video').title, 'Видео дня');
  assert.deepEqual(cat(pub, 'm_topic').items, [key(a)]);
  assert.equal(cat(pub, 'm_unpub'), undefined, 'the owner draft edit is not published');
  const after = await h.repo.getMediathequeDraft(h.owner);
  assert.ok(cat(after.structure, 'm_unpub'), 'the owner draft edit is kept');
  assert.deepEqual(cat(after.structure, 'm_topic').items, [key(a)]);
  assert.deepEqual(cat(after.structure, 'm_daily_video').items, [key(b)]);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.edition_id, r.edition_id);
});

test('daily addition on an empty Mediatheque creates the category in both', async t => {
  const h = await setup(t);
  const b = await publishMaterial(h, dailySlug, 'B', 'b');
  await h.repo.publishMediathequeDailyAddition(h.owner, { ref: b }, { idempotencyKey: 'd1' });
  const pub = (await h.repo.getPublicMediatheque()).structure, dr = (await h.repo.getMediathequeDraft(h.owner)).structure;
  assert.deepEqual(cat(pub, 'm_daily_video').items, [key(b)]);
  assert.deepEqual(cat(dr, 'm_daily_video').items, [key(b)]);
});

test('retireKeys leave the category but the material stays in the corpus', async t => {
  const h = await setup(t);
  const b1 = await publishMaterial(h, dailySlug, 'B1', 'b1');
  await h.repo.publishMediathequeDailyAddition(h.owner, { ref: b1 }, { idempotencyKey: 'd1' });
  const b2 = await publishMaterial(h, dailySlug, 'B2', 'b2');
  await h.repo.publishMediathequeDailyAddition(h.owner, { ref: b2, retireKeys: [key(b1), 'public/never/there'] }, { idempotencyKey: 'd2' });
  const pub = await h.repo.getPublicMediatheque();
  assert.deepEqual(cat(pub.structure, 'm_daily_video').items, [key(b2)]);
  assert.ok(pub.items.some(i => i.title === 'B1'), 'B1 is still a public material');
  assert.deepEqual(cat((await h.repo.getMediathequeDraft(h.owner)).structure, 'm_daily_video').items, [key(b2)]);
});

test('same idempotency key twice → one edition', async t => {
  const h = await setup(t);
  const b = await publishMaterial(h, dailySlug, 'B', 'b');
  const r1 = await h.repo.publishMediathequeDailyAddition(h.owner, { ref: b }, { idempotencyKey: 'same' });
  const r2 = await h.repo.publishMediathequeDailyAddition(h.owner, { ref: b }, { idempotencyKey: 'same' });
  assert.equal(r1.edition_id, r2.edition_id);
  const n = await new Promise((res, rej) => h.db.get('SELECT COUNT(*) n FROM publication_mediatheque_editions', (e, r) => e ? rej(e) : res(r.n)));
  assert.equal(n, 1);
});

test('withdraw removes from both; second withdraw → 409', async t => {
  const h = await setup(t);
  const b = await publishMaterial(h, dailySlug, 'B', 'b');
  await h.repo.publishMediathequeDailyAddition(h.owner, { ref: b }, { idempotencyKey: 'd1' });
  await h.repo.withdrawMediathequeDailyItem(h.owner, { key: key(b) }, { idempotencyKey: 'w1' });
  assert.deepEqual(cat((await h.repo.getPublicMediatheque()).structure, 'm_daily_video').items, []);
  assert.deepEqual(cat((await h.repo.getMediathequeDraft(h.owner)).structure, 'm_daily_video').items, []);
  await assert.rejects(h.repo.withdrawMediathequeDailyItem(h.owner, { key: key(b) }, { idempotencyKey: 'w2' }), e => e.code === 'MEDIATHEQUE_REFERENCE_UNAVAILABLE' && e.status === 409);
});

test('non-owner actor → PUBLISHER_FORBIDDEN', async t => {
  const h = await setup(t);
  await assert.rejects(h.repo.publishMediathequeDailyAddition({ id: 'member', role: 'user' }, { ref: { kind: 'public', slug: 'x', workId: 'y' } }, { idempotencyKey: 'x' }),
    e => e.code === 'PUBLISHER_FORBIDDEN');
});
