'use strict';
// «Разложить» из «Видео дня» on the server (spec 2026-11-28): immediate narrow edition + the 5-day sweep.
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

const P = require('../public/js/mediatheque-placement');
const O = { publicOnly: true };
const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
// Published: topic «C14» with collection «Интервью», an unpublished draft edit, two dot videos in «Видео дня».
async function scene(t) {
  const h = await setup(t);
  let draft = await h.repo.getMediathequeDraft(h.owner);
  let s = C.command(draft.structure, { type: 'category.create', id: 'c14', title: 'C14' }, O);
  s = C.command(s, { type: 'collection.create', id: 'intv', title: 'Интервью', categoryId: 'c14' }, O);
  await h.repo.saveMediathequeDraft(h.owner, { structure: s, expectedVersion: draft.revision }, { idempotencyKey: 's1' });
  draft = await h.repo.getMediathequeDraft(h.owner);
  await h.repo.publishMediatheque(h.owner, { expectedVersion: draft.revision, expectedEdition: draft.edition_id }, { idempotencyKey: 'p1' });
  draft = await h.repo.getMediathequeDraft(h.owner);
  s = C.command(draft.structure, { type: 'category.create', id: 'm_unpub', title: 'Черновая' }, O);
  await h.repo.saveMediathequeDraft(h.owner, { structure: s, expectedVersion: draft.revision }, { idempotencyKey: 's2' });
  const v1 = await publishMaterial(h, dailySlug, 'V1', 'v1');
  await h.repo.publishMediathequeDailyAddition(h.owner, { ref: v1 }, { idempotencyKey: 'd1' });
  const v2 = await publishMaterial(h, dailySlug, 'V2', 'v2');
  await h.repo.publishMediathequeDailyAddition(h.owner, { ref: v2 }, { idempotencyKey: 'd2' });
  return { ...h, v1, v2 };
}
const pub = async h => (await h.repo.getPublicMediatheque()).structure;
const dr = async h => (await h.repo.getMediathequeDraft(h.owner)).structure;

test('place publishes at once, keeps «Видео дня», mirrors the draft and publishes nothing else of it', async t => {
  const h = await scene(t);
  const r = await h.repo.placeMediathequeItem(h.owner, { ref: h.v1, places: [{ type: 'category', id: 'c14' }, { type: 'collection', id: 'intv' }] }, { idempotencyKey: 'pl1' });
  assert.ok(r.edition_id); assert.equal(r.label, 'C14 / Интервью');
  const p = await pub(h), d = await dr(h);
  for (const s of [p, d]) {
    assert.deepEqual(cat(s, 'c14').items, [key(h.v1)]);
    assert.deepEqual(s.collections.find(c => c.id === 'intv').items, [key(h.v1)]);
    assert.ok(cat(s, P.DAILY_ID).items.includes(key(h.v1)));
  }
  assert.equal(cat(p, 'm_unpub'), undefined, 'the unpublished draft edit stays unpublished');
  assert.ok(cat(d, 'm_unpub'), 'and stays in the draft');
});
test('place creates a new topic with a collection; an unknown place is 400; a non-owner 403', async t => {
  const h = await scene(t);
  const r = await h.repo.placeMediathequeItem(h.owner, { ref: h.v2, places: [{ type: 'collection', id: 'n2' }, { type: 'category', id: 'n1' }],
    create: [{ tempId: 'n1', type: 'category', title: 'Хеврон' }, { tempId: 'n2', type: 'collection', title: 'Репортажи', categoryId: 'n1' }] }, { idempotencyKey: 'pl2' });
  assert.equal(r.label, 'Хеврон / Репортажи');
  const p = await pub(h), topic = p.categories.find(c => c.title === 'Хеврон'), coll = p.collections.find(c => c.title === 'Репортажи');
  assert.match(topic.id, /^m_[a-f0-9]{32}$/); assert.equal(coll.categoryId, topic.id); assert.deepEqual(coll.items, [key(h.v2)]);
  assert.ok((await dr(h)).collections.some(c => c.id === coll.id), 'the draft gets the same ids');
  await assert.rejects(h.repo.placeMediathequeItem(h.owner, { ref: h.v2, places: [{ type: 'collection', id: 'nope' }] }, { idempotencyKey: 'pl3' }), e => e.code === 'MEDIATHEQUE_PLACE_UNKNOWN' && e.status === 400);
  await assert.rejects(h.repo.placeMediathequeItem({ id: 'member', role: 'user' }, { ref: h.v2, places: [] }, { idempotencyKey: 'pl4' }), e => e.status === 403);
});
test('place of a material that is not published → 409; the same key twice → one edition', async t => {
  const h = await scene(t);
  const ghost = { ...h.v1, workId: 'nowhere' };
  await assert.rejects(h.repo.placeMediathequeItem(h.owner, { ref: ghost, places: [] }, { idempotencyKey: 'g' }), e => e.code === 'MEDIATHEQUE_REFERENCE_UNAVAILABLE');
  const before = (await all(h.db, 'SELECT COUNT(*) n FROM publication_mediatheque_editions'))[0].n;
  const a = await h.repo.placeMediathequeItem(h.owner, { ref: h.v1, places: [{ type: 'category', id: 'c14' }] }, { idempotencyKey: 'same' });
  const b = await h.repo.placeMediathequeItem(h.owner, { ref: h.v1, places: [{ type: 'category', id: 'c14' }] }, { idempotencyKey: 'same' });
  assert.equal(a.edition_id, b.edition_id);
  assert.equal((await all(h.db, 'SELECT COUNT(*) n FROM publication_mediatheque_editions'))[0].n, before + 1);
});
test('a place the owner removed in the draft is skipped there, the edition still gets it', async t => {
  const h = await scene(t);
  const draft = await h.repo.getMediathequeDraft(h.owner);
  await h.repo.saveMediathequeDraft(h.owner, { structure: C.command(draft.structure, { type: 'collection.remove', id: 'intv' }, O), expectedVersion: draft.revision }, { idempotencyKey: 'rm' });
  await h.repo.placeMediathequeItem(h.owner, { ref: h.v1, places: [{ type: 'collection', id: 'intv' }] }, { idempotencyKey: 'pl' });
  assert.deepEqual((await pub(h)).collections.find(c => c.id === 'intv').items, [key(h.v1)]);
  assert.equal((await dr(h)).collections.find(c => c.id === 'intv'), undefined);
});
test('dot publication records first_seen; the sweep moves old ones out after 5 days', async t => {
  const h = await scene(t);
  const seen = await all(h.db, 'SELECT item_key FROM media_daily_seen ORDER BY item_key');
  assert.deepEqual(seen.map(r => r.item_key).sort(), [key(h.v1), key(h.v2)].sort());
  await h.repo.placeMediathequeItem(h.owner, { ref: h.v2, places: [{ type: 'category', id: 'c14' }] }, { idempotencyKey: 'pl' });
  const quiet = await h.repo.sweepMediathequeDaily(h.owner, { now: Date.now() + 4 * 86400000 });
  assert.deepEqual(quiet.expired, []); assert.equal(quiet.edition_id, undefined, 'nothing to do writes no edition');
  const r = await h.repo.sweepMediathequeDaily(h.owner, { now: Date.now() + 6 * 86400000 });
  assert.deepEqual(r.unsorted, [key(h.v1)]); assert.equal(r.expired.length, 2); assert.ok(r.edition_id);
  for (const s of [await pub(h), await dr(h)]) {
    assert.deepEqual(cat(s, P.DAILY_ID).items, []);
    assert.deepEqual(cat(s, P.UNSORTED.id).items, [key(h.v1)]);
    assert.deepEqual(cat(s, 'c14').items, [key(h.v2)]);
  }
  assert.equal(cat(await pub(h), 'm_unpub'), undefined);
  assert.deepEqual(await all(h.db, 'SELECT item_key FROM media_daily_seen'), [], 'rows of materials that left «Видео дня» go');
});
test('the sweep notices a material added to «Видео дня» by hand and dates it from then', async t => {
  const h = await scene(t);
  await new Promise((res, rej) => h.db.run('DELETE FROM media_daily_seen WHERE item_key=?', [key(h.v1)], e => e ? rej(e) : res()));
  const now = Date.now();
  const first = await h.repo.sweepMediathequeDaily(h.owner, { now });
  assert.deepEqual(first.expired, []);
  const row = (await all(h.db, 'SELECT first_seen_at FROM media_daily_seen WHERE item_key=?', [key(h.v1)]))[0];
  assert.equal(Date.parse(row.first_seen_at), now);
});
