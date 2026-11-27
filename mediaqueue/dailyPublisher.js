'use strict';
// dot's learning archive → a public material in «Видео дня» (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.5).
// The same canonical steps as the owner's «Добавить материал» wizard (public/js/mediatheque-publisher.js):
// prepare → corpus «Видео дня» → copy → rights → validate → publish the corpus; then one structure command into
// «Видео дня», applied to the published edition and to the owner's draft (publicationRepo.publishMediathequeDailyAddition).
// The writes run as the owner (the canonical writers need that role); the queue and the audit name dot's editor.
const crypto = require('node:crypto');
const Mediatheque = require('../public/js/mediatheque-core.js');
const { DAILY_VIDEO } = require('../db/publicationRepo');
const { MediaQueueError } = require('./mediaQueueRepo');

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
// dot's own corpus: the owner's wizard derives a topic's corpus from the category id, so dot never shares a draft with
// an import the owner has not confirmed yet (review M2-I2). Still media-<20 hex>, so the Mediatheque's own material
// commands (edit, delete) manage it.
const DAILY_SLUG = 'media-' + sha('dot:' + DAILY_VIDEO.id).slice(0, 20);
const RETIRE_AFTER_MS = 30 * 24 * 3600 * 1000;
// The public work id the publication gives a copied archive (mediatheque-publisher.js).
const workIdOf = sourceWorkId => 'work-' + sha('MY_TEXTS:local:' + sourceWorkId).slice(0, 24);
// Codes of the archive checks: dot can fix these by changing the archive. Everything else is the server's (review M2-I5).
const ARCHIVE_CODE = /^(MATERIAL_|PACKAGE_|ZIP_|MANIFEST_|CANONICAL_|GRAPH_|PLAYBACK_SOURCE_INVALID|SOURCE_SNAPSHOT_INVALID)/;
const coded = (code, status, detail = null) => Object.assign(new Error(code), { code, status, detail });

function createDailyPublisher({ repo, queue, ownerActor, now = () => Date.now(), log = () => {} }) {
  const day = () => new Date(now()).toISOString().slice(0, 10);
  // One publication at a time: the steps share the corpus draft and the Mediatheque structure (review M2-I3).
  let chain = Promise.resolve();
  const exclusive = fn => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

  async function publishNow(jobId, editorId, archiveBytes) {
    if (!Buffer.isBuffer(archiveBytes) || !archiveBytes.length) throw new MediaQueueError('MATERIAL_ARCHIVE_INVALID', 400, 'empty');
    const begun = await queue.beginPublish(jobId, editorId, sha(archiveBytes));
    if (begun.repeat && begun.job.status === 'published') {
      const item = (await repo.getPublicMediatheque()).items.find(i => i.ref.slug === begun.job.published_slug && i.ref.workId === begun.job.published_work_id);
      return { job: begun.job, material: { slug: begun.job.published_slug, workId: begun.job.published_work_id, title: item ? item.title : null }, repeat: true };
    }
    const job = begun.job, owner = await ownerActor();
    const o = step => ({ idempotencyKey: `mq-${job.job_id}-${begun.uploadNo}-${step}` });
    let copiedSource = null, corpusPublished = false;
    try {
      // An unreadable ZIP throws without a code: it is an invalid archive, as on the owner's route.
      const prepared = await repo.prepareMediathequeArchive(owner, archiveBytes, { mode: 'youtube', youtubeUrl: job.url })
        .catch(e => { throw e && e.code ? e : coded('MATERIAL_ARCHIVE_INVALID', 400); });
      let corpus = (await repo.listPublisherCorpora(owner)).find(c => c.slug === DAILY_SLUG);
      if (!corpus) corpus = await repo.createCorpus(owner, { slug: DAILY_SLUG, title: DAILY_VIDEO.title, description: '' }, o('corpus'));
      const fresh = async () => {
        let d = await repo.getPublisherCorpus(owner, corpus.corpus_id);
        if (!d.draft) { await repo.createRevisionDraft(owner, corpus.corpus_id, o('revision-' + Date.now())); d = await repo.getPublisherCorpus(owner, corpus.corpus_id); }
        return d;
      };
      const liveWorks = async () => new Set((await repo.getPublicMediatheque()).items.filter(i => i.ref.slug === DAILY_SLUG).map(i => i.ref.workId));
      const target = workIdOf('archive_' + prepared.contentRoot);
      let live = await liveWorks();
      if (!live.has(target)) {
        // A copy that a crashed upload left in the draft is dropped first, so it is never published by this job (M2-I2).
        let detail = await fresh();
        const extras = (detail.items || []).filter(i => !live.has(workIdOf(i.source_work_id)));
        if (extras.length > 1) throw coded('MEDIA_DAILY_DRAFT_BUSY', 409, { extras: extras.length });
        if (extras.length === 1) {
          await repo.discardMediathequePendingImport(owner, { slug: DAILY_SLUG, sourceWorkId: extras[0].source_work_id }, o('residue'));
          detail = await fresh();
        }
        const title = prepared.title || job.title || job.video_id;
        const copied = await repo.copyMediathequeArchive(owner, corpus.corpus_id, { token: prepared.token, title, description: '',
          creator: job.channel_title || 'YouTube', expectedVersion: detail.draft.version }, o('copy'));
        copiedSource = copied.items[0].source_work_id;
        const date = day();
        const rights = await repo.recordMaterialRights(owner, corpus.corpus_id, { itemIds: copied.items.map(i => i.item_id), expectedVersion: copied.draft_version,
          preset: { public_read_allowed: true, public_stream_allowed: true, package_download_allowed: true, basis: 'OWNER_ATTESTATION_MEDIA_' + date.replaceAll('-', '_'), asserted_at: date } }, o('rights'));
        const validation = await repo.validateDraft(owner, corpus.corpus_id, rights.draft_version);
        if (!validation.ready) throw coded((validation.blockers[0] && validation.blockers[0].code) || 'SOURCE_SNAPSHOT_INVALID', 400);
        await repo.publish(owner, corpus.corpus_id, { expectedVersion: rights.draft_version }, o('publish'));
        corpusPublished = true;
        live = await liveWorks();
      }
      // Already public (an earlier upload of this archive stopped after the corpus publish, M2-I1): go on from here.
      const items = (await repo.getPublicMediatheque()).items;
      const item = items.find(i => i.ref.slug === DAILY_SLUG && i.ref.workId === target);
      if (!item) throw coded('MEDIA_PUBLISH_RETRY', 409, { code: 'NOT_PUBLIC_AFTER_PUBLISH' });
      // Materials of dot older than 30 days leave «Видео дня» (they stay public in their corpus).
      const old = await queue.retireCandidates(new Date(now() - RETIRE_AFTER_MS).toISOString());
      const retireKeys = old.map(r => items.find(i => i.ref.slug === r.published_slug && i.ref.workId === r.published_work_id))
        .filter(Boolean).map(i => Mediatheque.refKey(i.ref));
      await repo.publishMediathequeDailyAddition(owner, { ref: item.ref, retireKeys }, o('daily'));
      const done = await queue.markPublished(job.job_id, { slug: DAILY_SLUG, workId: target });
      log(`media-queue: ${job.video_id} published as ${DAILY_SLUG}/${target} by ${editorId}`);
      return { job: done, material: { slug: DAILY_SLUG, workId: target, title: item.title }, repeat: false };
    } catch (e) {
      // A copy that did not reach the public edition is dropped now, so it cannot ride along with the next job.
      if (copiedSource && !corpusPublished) {
        await repo.discardMediathequePendingImport(owner, { slug: DAILY_SLUG, sourceWorkId: copiedSource }, o('rollback')).catch(() => {});
      }
      const raw = String(e && e.code || '');
      let err;
      if (e instanceof MediaQueueError) err = e;
      else if (ARCHIVE_CODE.test(raw)) err = new MediaQueueError(raw, 400, e.detail || null);
      else if (raw === 'MEDIA_DAILY_DRAFT_BUSY' || raw === 'MEDIA_PUBLISH_RETRY') err = new MediaQueueError(raw, 409, e.detail || null);
      else { err = new MediaQueueError('MEDIA_PUBLISH_RETRY', 409, { code: raw || 'INTERNAL' }); log('media-queue: publish failed ' + (raw || (e && e.stack) || e)); }
      await queue.publishFailed(job.job_id, err.code, err.detail ? JSON.stringify(err.detail).slice(0, 300) : null).catch(() => {});
      throw err;
    }
  }
  const publish = (...a) => exclusive(() => publishNow(...a));
  // The owner's «Снять» (spec §5.5): the material leaves «Видео дня» in the edition and the draft. It stays in its
  // corpus; deleting it for good is the Mediatheque's own «Удалить» command.
  const withdraw = jobId => exclusive(() => withdrawNow(jobId));
  async function withdrawNow(jobId) {
    const job = await queue.get(jobId);
    if (!job) throw new MediaQueueError('MEDIA_JOB_NOT_FOUND', 404);
    if (job.status !== 'published') throw new MediaQueueError('MEDIA_JOB_STATE', 409);
    const owner = await ownerActor();
    const pub = await repo.getPublicMediatheque();
    const item = pub.items.find(i => i.ref.slug === job.published_slug && i.ref.workId === job.published_work_id);
    const dailyCat = pub.structure.categories.find(c => c.id === DAILY_VIDEO.id);
    const key = item && Mediatheque.refKey(item.ref);
    if (key && dailyCat && dailyCat.items.includes(key)) {
      await repo.withdrawMediathequeDailyItem(owner, { key }, { idempotencyKey: `mq-${job.job_id}-withdraw` });
    }
    return queue.withdraw(job.job_id);
  }
  return { publish, withdraw };
}

module.exports = { createDailyPublisher, DAILY_SLUG, workIdOf };
