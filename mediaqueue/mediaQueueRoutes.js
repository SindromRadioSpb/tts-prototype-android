'use strict';
// Video queue HTTP routes (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.1, §6; stage M1).
// The owner orders, watches and downloads the ASR ZIP; the home PC's relay key (lpr_) only leases jobs, reports
// steps and hands in the ASR ZIP. An editor key or a reader session reaches none of these.
const crypto = require('node:crypto');
const express = require('express');
const { MediaQueueError } = require('./mediaQueueRepo');
const { createMediaDotTask, TASK_URL } = require('./mediaDotTask');

const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function mountMediaQueueRoutes(app, { queue, relayAuth, resolveUser, audit = () => {}, readLimiter = null, writeLimiter = null, workerLimiter = null,
  editorAuth = null, dailyPublisher = null, dotTask = null, editorLimiter = null, channels = null }) {
  const pass = (req, res, next) => next();
  const read = readLimiter || pass, write = writeLimiter || pass, worker = workerLimiter || pass;
  const json = express.json({ limit: '16kb' });
  const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  const send = (res, error) => {
    if (error instanceof MediaQueueError) return res.status(error.status).json({ ok: false, error: error.code, detail: error.detail || null });
    try { console.warn('[media-queue]', error); } catch (_) {}
    return res.status(500).json({ ok: false, error: 'MEDIA_QUEUE_INTERNAL' });
  };

  // → owner actor { id } or null after writing 401/403. Mutations also need the session CSRF and the same origin.
  async function ownerFor(req, res, { mutating = false } = {}) {
    if (req.get('authorization')) { res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' }); return null; }
    const auth = await Promise.resolve(resolveUser(req)).catch(() => null);
    if (!auth || !auth.user) { res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' }); return null; }
    if (String(auth.user.role || '').toLowerCase() !== 'owner') { res.status(403).json({ ok: false, error: 'OWNER_ONLY' }); return null; }
    if (mutating) {
      if (req.get('sec-fetch-site') === 'cross-site') { res.status(403).json({ ok: false, error: 'BAD_ORIGIN' }); return null; }
      if (req.get('origin') !== req.protocol + '://' + req.get('host')) { res.status(403).json({ ok: false, error: 'BAD_ORIGIN' }); return null; }
      if (!safeEqual(req.get('x-lp-csrf') || '', auth.session && auth.session.csrf || '')) { res.status(403).json({ ok: false, error: 'BAD_CSRF' }); return null; }
    }
    return { id: String(auth.user.id) };
  }
  async function workerFor(req, res) {
    const k = await Promise.resolve(relayAuth.resolve(req)).catch(() => null);
    if (!k) res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
    return k;
  }

  // ---- owner ----
  app.post('/api/media-queue/jobs', write, json, noStore, async (req, res) => {
    const actor = await ownerFor(req, res, { mutating: true }); if (!actor) return;
    try {
      const r = await queue.enqueue({ url: req.body && req.body.url, source: 'owner', actorId: actor.id });
      if (!r.existing) audit('media_job_enqueued', actor.id, { job_id: r.job.job_id, video_id: r.job.video_id }, req.ip);
      res.json({ ok: true, ...r });
    } catch (e) { send(res, e); }
  });
  app.get('/api/media-queue/jobs', read, noStore, async (req, res) => {
    const actor = await ownerFor(req, res); if (!actor) return;
    try { res.json({ ok: true, jobs: await queue.list(), worker: await queue.workerStatus() }); } catch (e) { send(res, e); }
  });
  for (const action of ['retry', 'cancel']) {
    app.post('/api/media-queue/jobs/:id/' + action, write, json, noStore, async (req, res) => {
      const actor = await ownerFor(req, res, { mutating: true }); if (!actor) return;
      try {
        const job = await queue[action](req.params.id);
        audit('media_job_' + action, actor.id, { job_id: job.job_id }, req.ip);
        res.json({ ok: true, job });
      } catch (e) { send(res, e); }
    });
  }
  app.get('/api/media-queue/jobs/:id/asr-zip', read, noStore, async (req, res) => {
    const actor = await ownerFor(req, res); if (!actor) return;
    try {
      const file = await queue.asrZipPath(req.params.id), job = await queue.get(req.params.id);
      res.download(file, job.video_id + '_ASR.zip', { headers: { 'Content-Type': 'application/zip', 'X-Content-Type-Options': 'nosniff' } }, err => {
        if (err && !res.headersSent) send(res, new MediaQueueError('MEDIA_JOB_STATE', 409, 'file_missing'));
      });
    } catch (e) { send(res, e); }
  });

  // ---- channels and candidates (stage M3, spec §5.2): the owner manages channels, everyone with the owner session sees candidates ----
  if (channels) {
    app.get('/api/media-queue/channels', read, noStore, async (req, res) => {
      const actor = await ownerFor(req, res); if (!actor) return;
      try { res.json({ ok: true, channels: await channels.list() }); } catch (e) { send(res, e); }
    });
    app.post('/api/media-queue/channels', write, json, noStore, async (req, res) => {
      const actor = await ownerFor(req, res, { mutating: true }); if (!actor) return;
      try {
        const r = await channels.add({ input: req.body && req.body.url, actorId: actor.id });
        if (!r.existing) audit('media_channel_added', actor.id, { channel_id: r.channel.channel_id }, req.ip);
        res.json({ ok: true, ...r });
      } catch (e) { send(res, e); }
    });
    app.post('/api/media-queue/channels/:id/remove', write, json, noStore, async (req, res) => {
      const actor = await ownerFor(req, res, { mutating: true }); if (!actor) return;
      try {
        const r = await channels.remove(req.params.id);
        audit('media_channel_removed', actor.id, r, req.ip);
        res.json({ ok: true, ...r });
      } catch (e) { send(res, e); }
    });
    app.get('/api/media-queue/candidates', read, noStore, async (req, res) => {
      const actor = await ownerFor(req, res); if (!actor) return;
      try { res.json({ ok: true, candidates: await channels.candidates(), quota: await queue.dotQuota() }); } catch (e) { send(res, e); }
    });
  }

  // ---- dot (the news editor key, spec §5.4): the instruction, take a job, upload the archive, refuse ----
  const task = dotTask || createMediaDotTask();
  app.get(TASK_URL, read, (req, res) => {
    try {
      const t = task.get(), etag = '"' + t.version + '"';
      res.set({ 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag, 'X-Content-Type-Options': 'nosniff' });
      if (req.get('if-none-match') === etag) return res.status(304).end();
      res.send(t.text);
    } catch (e) { send(res, e); }
  });
  if (editorAuth && dailyPublisher) {
    const ed = editorLimiter || write;
    // → { editor_id } | { owner: true } (owner only where allowed) | null after 401/403.
    async function editorFor(req, res, { mutating = false, ownerMay = false } = {}) {
      const editor = await Promise.resolve(editorAuth.resolve(req)).catch(() => null);
      if (editor) {
        if (mutating && editor.via === 'cookie' && !safeEqual(req.get('x-lp-csrf') || '', editor.csrf || '')) { res.status(403).json({ ok: false, error: 'BAD_CSRF' }); return null; }
        return { editor_id: editor.editor_id, id: editor.id };
      }
      if (!req.get('authorization')) {
        const auth = await Promise.resolve(resolveUser(req)).catch(() => null);
        if (auth && auth.user && String(auth.user.role || '').toLowerCase() === 'owner') {
          if (ownerMay) return { owner: true, id: String(auth.user.id) };
          res.status(403).json({ ok: false, error: 'EDITOR_ONLY' }); return null;
        }
      }
      res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' }); return null;
    }
    // Who may upload is known before the body is read: an anonymous 512 MB upload is refused at once (review M2-I4).
    const editorFirst = async (req, res, next) => { const a = await editorFor(req, res, { mutating: true }); if (a) { req.mqEditor = a; next(); } };
    const links = job => job && { ...job, asr_zip: '/api/media-queue/editor/jobs/' + job.job_id + '/asr-zip', archive: '/api/media-queue/editor/jobs/' + job.job_id + '/archive' };
    app.get('/api/media-queue/editor/jobs/next', read, noStore, async (req, res) => {
      const actor = await editorFor(req, res, { ownerMay: true }); if (!actor) return;
      try { res.json({ ok: true, job: links(await queue.nextForDot()), task: task.meta() }); } catch (e) { send(res, e); }
    });
    // Downloading the ASR ZIP takes the job for 4 hours.
    app.get('/api/media-queue/editor/jobs/:id/asr-zip', read, noStore, async (req, res) => {
      const actor = await editorFor(req, res); if (!actor) return;
      try {
        const job = await queue.takeForDot(req.params.id, actor.editor_id);
        audit('media_job_dot_taken', actor.id, { job_id: job.job_id, editor: actor.id }, req.ip);
        res.download(await queue.asrZipPath(job.job_id), job.video_id + '_ASR.zip', { headers: { 'Content-Type': 'application/zip', 'X-Content-Type-Options': 'nosniff' } }, err => {
          if (err && !res.headersSent) send(res, new MediaQueueError('MEDIA_JOB_STATE', 409, 'file_missing'));
        });
      } catch (e) { send(res, e); }
    });
    app.post('/api/media-queue/editor/jobs/:id/archive', ed, noStore, editorFirst, express.raw({ type: 'application/zip', limit: '512mb' }), async (req, res) => {
      const actor = req.mqEditor;
      try {
        const r = await dailyPublisher.publish(req.params.id, actor.editor_id, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
        audit('media_job_published', actor.id, { job_id: r.job.job_id, editor: actor.id, slug: r.material.slug, work_id: r.material.workId, repeat: !!r.repeat }, req.ip);
        res.json({ ok: true, job: r.job, material: r.material });
      } catch (e) { send(res, e); }
    });
    app.post('/api/media-queue/editor/jobs/:id/fail', ed, json, noStore, async (req, res) => {
      const actor = await editorFor(req, res, { mutating: true }); if (!actor) return;
      try {
        const job = await queue.dotFail(req.params.id, actor.editor_id, { reason: req.body && req.body.reason });
        audit('media_job_dot_refused', actor.id, { job_id: job.job_id, editor: actor.id }, req.ip);
        res.json({ ok: true, job });
      } catch (e) { send(res, e); }
    });
    if (channels) {
      // dot's candidate round: read, translate the new titles, pick up to the day's quota (spec §5.2).
      app.get('/api/media-queue/editor/candidates', read, noStore, async (req, res) => {
        const actor = await editorFor(req, res, { ownerMay: true }); if (!actor) return;
        try { res.json({ ok: true, candidates: await channels.candidates(), quota: await queue.dotQuota(), task: task.meta() }); } catch (e) { send(res, e); }
      });
      app.post('/api/media-queue/editor/candidates', ed, json, noStore, async (req, res) => {
        const actor = await editorFor(req, res, { mutating: true }); if (!actor) return;
        try {
          const body = req.body || {}, picks = body.picks == null ? [] : body.picks;
          if (!Array.isArray(picks) || picks.length > 5) throw new MediaQueueError('MEDIA_INPUT_INVALID', 400, 'picks');
          const { translated } = await channels.translate(body.translations == null ? [] : body.translations, actor.editor_id);
          const results = [];
          // Each pick on its own: one refused video does not stop the others (per-item best-effort).
          for (const id of picks) {
            try {
              const cand = await channels.get(id);
              if (!cand) throw new MediaQueueError('MEDIA_CANDIDATE_NOT_FOUND', 404);
              const r = await queue.enqueue({ url: 'https://www.youtube.com/watch?v=' + cand.video_id, source: 'dot', actorId: actor.editor_id });
              if (!r.existing) audit('media_dot_picked', actor.id, { job_id: r.job.job_id, video_id: r.job.video_id, editor: actor.id }, req.ip);
              results.push({ video_id: cand.video_id, ok: true, existing: r.existing, job: r.job });
            } catch (e) {
              if (!(e instanceof MediaQueueError)) throw e;
              results.push({ video_id: String(id).slice(0, 20), ok: false, error: e.code });
            }
          }
          res.json({ ok: true, translated, picks: results, quota: await queue.dotQuota() });
        } catch (e) { send(res, e); }
      });
    }
    app.post('/api/media-queue/jobs/:id/withdraw', write, json, noStore, async (req, res) => {
      const owner = await ownerFor(req, res, { mutating: true }); if (!owner) return;
      try {
        const job = await dailyPublisher.withdraw(req.params.id);
        audit('media_job_withdrawn', owner.id, { job_id: job.job_id }, req.ip);
        res.json({ ok: true, job });
      } catch (e) { send(res, e); }
    });
  }

  // ---- home PC (relay key only) ----
  app.post('/api/media-queue/worker/lease', worker, json, noStore, async (req, res) => {
    const k = await workerFor(req, res); if (!k) return;
    try { res.json({ ok: true, job: await queue.lease(k.key_id, { ytdlpVersion: req.body && req.body.ytdlp_version }) }); } catch (e) { send(res, e); }
  });
  app.post('/api/media-queue/worker/jobs/:id/step', worker, json, noStore, async (req, res) => {
    const k = await workerFor(req, res); if (!k) return;
    try { res.json({ ok: true, job: await queue.step(req.params.id, k.key_id, req.body || {}) }); } catch (e) { send(res, e); }
  });
  app.post('/api/media-queue/worker/jobs/:id/fail', worker, json, noStore, async (req, res) => {
    const k = await workerFor(req, res); if (!k) return;
    try { res.json({ ok: true, job: await queue.fail(req.params.id, k.key_id, req.body || {}) }); } catch (e) { send(res, e); }
  });
  app.put('/api/media-queue/worker/jobs/:id/asr-zip', worker, express.raw({ type: 'application/zip', limit: '50mb' }), noStore, async (req, res) => {
    const k = await workerFor(req, res); if (!k) return;
    try {
      const job = await queue.acceptAsrZip(req.params.id, k.key_id, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
      audit('media_job_asr_ready', null, { job_id: job.job_id, relay_key: k.key_id, bytes: job.asr_zip_bytes }, req.ip);
      res.json({ ok: true, job });
    } catch (e) { send(res, e); }
  });
}

module.exports = { mountMediaQueueRoutes };
