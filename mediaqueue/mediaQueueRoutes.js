'use strict';
// Video queue HTTP routes (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.1, §6; stage M1).
// The owner orders, watches and downloads the ASR ZIP; the home PC's relay key (lpr_) only leases jobs, reports
// steps and hands in the ASR ZIP. An editor key or a reader session reaches none of these.
const crypto = require('node:crypto');
const express = require('express');
const { MediaQueueError } = require('./mediaQueueRepo');

const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function mountMediaQueueRoutes(app, { queue, relayAuth, resolveUser, audit = () => {}, readLimiter = null, writeLimiter = null, workerLimiter = null }) {
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
    try { res.json({ ok: true, jobs: await queue.list() }); } catch (e) { send(res, e); }
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

  // ---- home PC (relay key only) ----
  app.post('/api/media-queue/worker/lease', worker, json, noStore, async (req, res) => {
    const k = await workerFor(req, res); if (!k) return;
    try { res.json({ ok: true, job: await queue.lease(k.key_id) }); } catch (e) { send(res, e); }
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
