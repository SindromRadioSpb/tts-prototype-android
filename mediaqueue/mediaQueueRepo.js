'use strict';
// The Mediatheque video queue (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.1, stage M1).
// One job per YouTube video. The owner's home PC leases a job with its relay key, downloads the audio, runs ASR
// and hands in the ASR ZIP; the server never downloads from YouTube and never stores audio or video.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { dbGet, dbAll, dbRun } = require('../db/newsRepo');

class MediaQueueError extends Error {
  constructor(code, status = 400, detail = null) { super(code); this.code = code; this.status = status; this.detail = detail; }
}
const fail = (code, status, detail) => { throw new MediaQueueError(code, status, detail); };

const LEASE_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const OWNER_OPEN_LIMIT = 100;
const OWNER_PRIORITY = 100;
const ASR_ZIP_MAX = 50 * 1024 * 1024;
// A small deflated ZIP can unpack to gigabytes: sizes are checked from the headers before anything is unpacked.
const ASR_ZIP_UNPACKED_MAX = 500 * 1024 * 1024;
const ASR_ZIP_MANIFEST_MAX = 1024 * 1024;
const ASR_ZIP_ENTRIES_MAX = 2000;
const OPEN = ['queued', 'acquiring', 'asr'];
// A video that is open, has its ASR, is with dot or is published is not queued a second time.
const DEDUPE = [...OPEN, 'asr_ready', 'dot_taken', 'publishing', 'published'];
const DOT_LEASE_MS = 4 * 3600 * 1000;
// A publish that has not finished in 30 minutes died with the process: dot may take the job again.
const STALE_PUBLISH_MS = 30 * 60 * 1000;
// The owner may cancel until dot has taken the job.
const CANCELLABLE = [...OPEN, 'asr_ready'];
const FAILED_OF = { queued: 'failed_acquire', acquiring: 'failed_acquire', asr: 'failed_asr' };
const AUDIO_EXT = /\.(wav|mp3|m4a|aac|opus|ogg|webm|flac|mp4|pcm)$/i;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const JOB_ID = /^mj_[a-f0-9]{16}$/;

// → { video_id, url } | null. Only single videos of youtube.com/watch and youtu.be; a playlist's list= is ignored.
function parseYoutubeUrl(s) {
  let u;
  try { u = new URL(String(s || '').trim()); } catch (_) { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  let id = null;
  if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(host)) { if (u.pathname === '/watch') id = u.searchParams.get('v'); }
  else if (host === 'youtu.be') id = u.pathname.slice(1);
  if (!id || !VIDEO_ID.test(id)) return null;
  return { video_id: id, url: 'https://www.youtube.com/watch?v=' + id };
}

const clip = (s, n) => s == null ? null : String(s).slice(0, n);
function publicJob(row) {
  if (!row) return null;
  const { lease_key_id, dot_editor_id, ...job } = row;
  return job;
}

function inspectAsrZip(bytes, { maxUnpacked = ASR_ZIP_UNPACKED_MAX } = {}) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) fail('MEDIA_ASR_ZIP_INVALID', 400, 'empty');
  if (bytes.length > ASR_ZIP_MAX) fail('MEDIA_ASR_ZIP_INVALID', 400, 'too_large');
  let entries;
  try { entries = new AdmZip(bytes).getEntries(); } catch (_) { fail('MEDIA_ASR_ZIP_INVALID', 400, 'not_zip'); }
  if (entries.length > ASR_ZIP_ENTRIES_MAX) fail('MEDIA_ASR_ZIP_INVALID', 400, 'too_many_entries');
  let total = 0;
  for (const e of entries) total += Number(e.header && e.header.size) || 0;
  if (total > maxUnpacked) fail('MEDIA_ASR_ZIP_INVALID', 400, 'too_large_unpacked');
  let manifest = null;
  for (const e of entries) {
    const name = e.entryName;
    if (!name || name.startsWith('/') || name.includes('\\') || /^[A-Za-z]:/.test(name) || name.split('/').includes('..')) fail('MEDIA_ASR_ZIP_INVALID', 400, 'bad_path');
    if (AUDIO_EXT.test(name)) fail('MEDIA_ASR_ZIP_INVALID', 400, 'audio_inside');
    if (name === 'manifest.json' && Number(e.header && e.header.size) > ASR_ZIP_MANIFEST_MAX) fail('MEDIA_ASR_ZIP_INVALID', 400, 'manifest_too_large');
    if (name === 'manifest.json') { try { manifest = JSON.parse(e.getData().toString('utf8')); } catch (_) { fail('MEDIA_ASR_ZIP_INVALID', 400, 'manifest_unreadable'); } }
  }
  if (!manifest) fail('MEDIA_ASR_ZIP_INVALID', 400, 'no_manifest');
  if (manifest.completed !== true) fail('MEDIA_ASR_ZIP_INVALID', 400, 'not_completed');
}

function createMediaQueue({ db, dataDir, now = () => Date.now() } = {}) {
  const iso = (ms = now()) => new Date(ms).toISOString();
  const asrDir = path.join(dataDir, 'media-queue', 'asr');
  const row = jobId => dbGet(db, 'SELECT * FROM media_jobs WHERE job_id=?', [String(jobId)]);
  async function mustRow(jobId) {
    if (!JOB_ID.test(String(jobId || ''))) fail('MEDIA_JOB_NOT_FOUND', 404);
    const r = await row(jobId); if (!r) fail('MEDIA_JOB_NOT_FOUND', 404); return r;
  }
  const get = async jobId => publicJob(await row(jobId));
  const inList = list => list.map(() => '?').join(',');

  async function enqueue({ url, source = 'owner', actorId = null } = {}) {
    if (source !== 'owner') fail('MEDIA_INPUT_INVALID', 400, 'source');
    const parsed = parseYoutubeUrl(url);
    if (!parsed) fail('MEDIA_URL_INVALID', 400);
    const existing = await dbGet(db, `SELECT * FROM media_jobs WHERE video_id=? AND status IN (${inList(DEDUPE)}) ORDER BY created_at DESC LIMIT 1`, [parsed.video_id, ...DEDUPE]);
    if (existing) return { job: publicJob(existing), existing: true };
    const open = await dbGet(db, `SELECT COUNT(*) n FROM media_jobs WHERE source='owner' AND status IN (${inList(OPEN)})`, OPEN);
    if (open.n >= OWNER_OPEN_LIMIT) fail('MEDIA_QUEUE_FULL', 409, { limit: OWNER_OPEN_LIMIT });
    const jobId = 'mj_' + crypto.randomBytes(8).toString('hex'), t = iso();
    await dbRun(db, `INSERT INTO media_jobs(job_id,video_id,url,source,priority,status,attempts,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,'queued',0,?,?,?)`, [jobId, parsed.video_id, parsed.url, source, OWNER_PRIORITY, actorId == null ? null : String(actorId), t, t]);
    return { job: await get(jobId), existing: false };
  }

  // Reading the list also returns abandoned leases to the queue, so a job never shows «on the PC» forever.
  const list = async ({ limit = 200 } = {}) => (await reclaimExpired(), await dbAll(db, 'SELECT * FROM media_jobs ORDER BY created_at DESC, rowid DESC LIMIT ?', [Math.max(1, Math.min(500, Number(limit) || 200))])).map(publicJob);

  // A lease whose time ran out (the PC went off mid-job) goes back to the queue and counts as an attempt.
  async function reclaimExpired() {
    const t = iso();
    await dbRun(db, `UPDATE media_jobs SET
        attempts=attempts+1,
        status=CASE WHEN attempts+1>=? THEN (CASE status WHEN 'asr' THEN 'failed_asr' ELSE 'failed_acquire' END) ELSE 'queued' END,
        error_code='LEASE_EXPIRED', error_detail=NULL, lease_key_id=NULL, lease_until=NULL, progress=NULL, step_detail=NULL, updated_at=?
      WHERE status IN ('acquiring','asr') AND lease_until IS NOT NULL AND lease_until<?`, [MAX_ATTEMPTS, t, t]);
  }

  async function lease(keyId) {
    await reclaimExpired();
    // A conditional update hands each job to one key even if two leases race.
    for (let i = 0; i < 5; i++) {
      const next = await dbGet(db, "SELECT job_id FROM media_jobs WHERE status='queued' ORDER BY priority DESC, created_at, rowid LIMIT 1");
      if (!next) return null;
      const t = iso();
      const r = await dbRun(db, `UPDATE media_jobs SET status='acquiring', lease_key_id=?, lease_until=?, progress=NULL, step_detail=NULL, error_code=NULL, error_detail=NULL, updated_at=?
        WHERE job_id=? AND status='queued'`, [String(keyId), iso(now() + LEASE_MS), t, next.job_id]);
      if (r.changes === 1) return get(next.job_id);
    }
    return null;
  }

  async function leased(jobId, keyId) {
    const r = await mustRow(jobId);
    if (!OPEN.includes(r.status) || r.status === 'queued' || r.lease_key_id !== String(keyId)) fail('MEDIA_JOB_NOT_LEASED', 409);
    return r;
  }

  async function step(jobId, keyId, { status, progress = null, detail = null, meta = null } = {}) {
    if (!['acquiring', 'asr'].includes(status)) fail('MEDIA_INPUT_INVALID', 400, 'status');
    if (progress != null && !(Number.isFinite(Number(progress)) && progress >= 0 && progress <= 1)) fail('MEDIA_INPUT_INVALID', 400, 'progress');
    const r = await leased(jobId, keyId);
    const m = meta && typeof meta === 'object' ? meta : {};
    const dur = Number.isFinite(Number(m.duration_sec)) && Number(m.duration_sec) >= 0 ? Math.round(Number(m.duration_sec)) : null;
    await dbRun(db, `UPDATE media_jobs SET status=?, progress=?, step_detail=?, title=COALESCE(?,title), duration_sec=COALESCE(?,duration_sec),
        channel_title=COALESCE(?,channel_title), lease_until=?, updated_at=? WHERE job_id=?`,
      [status, progress == null ? null : Number(progress), clip(detail, 300), clip(m.title, 500), dur, clip(m.channel_title, 200),
        iso(now() + LEASE_MS), iso(), r.job_id]);
    return get(r.job_id);
  }

  async function failJob(jobId, keyId, { code, detail = null, retryable = false, countAttempt = true } = {}) {
    if (!/^[A-Z][A-Z0-9_]{1,40}$/.test(String(code || ''))) fail('MEDIA_INPUT_INVALID', 400, 'code');
    const r = await leased(jobId, keyId);
    const attempts = r.attempts + (countAttempt ? 1 : 0);
    const final = !retryable || attempts >= MAX_ATTEMPTS;
    const status = final ? (/^UPLOAD/.test(code) ? 'failed_upload' : FAILED_OF[r.status]) : 'queued';
    await dbRun(db, `UPDATE media_jobs SET status=?, attempts=?, error_code=?, error_detail=?, lease_key_id=NULL, lease_until=NULL,
        progress=NULL, step_detail=NULL, updated_at=? WHERE job_id=?`, [status, attempts, String(code), clip(detail, 300), iso(), r.job_id]);
    return get(r.job_id);
  }

  async function acceptAsrZip(jobId, keyId, bytes) {
    const r = await leased(jobId, keyId);
    inspectAsrZip(bytes);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    await fs.promises.mkdir(asrDir, { recursive: true });
    await fs.promises.writeFile(path.join(asrDir, sha + '.zip'), bytes, { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
    await dbRun(db, `UPDATE media_jobs SET status='asr_ready', asr_zip_sha256=?, asr_zip_bytes=?, lease_key_id=NULL, lease_until=NULL,
        progress=NULL, step_detail=NULL, error_code=NULL, error_detail=NULL, updated_at=? WHERE job_id=?`, [sha, bytes.length, iso(), r.job_id]);
    return get(r.job_id);
  }

  async function asrZipPath(jobId) {
    const r = await mustRow(jobId);
    // The ZIP stays downloadable after dot took the job (and for the owner later).
    if (!r.asr_zip_sha256) fail('MEDIA_JOB_STATE', 409);
    return path.join(asrDir, r.asr_zip_sha256 + '.zip');
  }

  async function retry(jobId) {
    const r = await mustRow(jobId);
    if (!/^failed_/.test(r.status)) fail('MEDIA_JOB_STATE', 409);
    const dup = await dbGet(db, `SELECT job_id FROM media_jobs WHERE video_id=? AND job_id<>? AND status IN (${inList(DEDUPE)})`, [r.video_id, r.job_id, ...DEDUPE]);
    if (dup) fail('MEDIA_JOB_STATE', 409, { existing: dup.job_id });
    // A job that failed at dot's step already has its ASR: it goes back to dot, not to the PC.
    const back = r.status === 'failed_publish' && r.asr_zip_sha256 ? 'asr_ready' : 'queued';
    await dbRun(db, `UPDATE media_jobs SET status=?, attempts=0, error_code=NULL, error_detail=NULL, dot_editor_id=NULL, dot_lease_until=NULL, updated_at=? WHERE job_id=?`, [back, iso(), r.job_id]);
    return get(r.job_id);
  }

  async function cancel(jobId) {
    const r = await mustRow(jobId);
    if (!CANCELLABLE.includes(r.status)) fail('MEDIA_JOB_STATE', 409);
    await dbRun(db, `UPDATE media_jobs SET status='cancelled', lease_key_id=NULL, lease_until=NULL, progress=NULL, updated_at=? WHERE job_id=?`, [iso(), r.job_id]);
    return get(r.job_id);
  }

  // ---- dot (spec §5.4): take a job with ASR ready, upload the learning archive, the server publishes ----
  // → the oldest ready job (owner orders first), else a job whose dot lease ran out (retry: true).
  async function nextForDot() {
    const t = iso();
    const ready = await dbGet(db, "SELECT * FROM media_jobs WHERE status='asr_ready' ORDER BY priority DESC, created_at, rowid LIMIT 1");
    if (ready) return { ...publicJob(ready), retry: false };
    const stale = await dbGet(db, `SELECT * FROM media_jobs WHERE (status='dot_taken' AND dot_lease_until<?) OR (status='publishing' AND updated_at<?)
      ORDER BY priority DESC, created_at, rowid LIMIT 1`, [t, iso(now() - STALE_PUBLISH_MS)]);
    return stale ? { ...publicJob(stale), retry: true } : null;
  }
  async function takeForDot(jobId, editorId) {
    const r = await mustRow(jobId), t = iso(), ed = String(editorId);
    const ok = r.status === 'asr_ready' || (r.status === 'dot_taken' && (r.dot_editor_id === ed || !r.dot_lease_until || r.dot_lease_until < t))
      || (r.status === 'publishing' && r.updated_at < iso(now() - STALE_PUBLISH_MS));
    if (!ok) fail('MEDIA_JOB_NOT_TAKEN', 409);
    const u = await dbRun(db, `UPDATE media_jobs SET status='dot_taken', dot_editor_id=?, dot_lease_until=?, updated_at=? WHERE job_id=? AND status=? AND COALESCE(dot_editor_id,'')=?`,
      [ed, iso(now() + DOT_LEASE_MS), t, r.job_id, r.status, r.dot_editor_id || '']);
    if (u.changes !== 1) fail('MEDIA_JOB_NOT_TAKEN', 409);
    return get(r.job_id);
  }
  // → { job, uploadNo, repeat }. The same archive sent again (dot did not see the answer) is a repeat, not a second material.
  async function beginPublish(jobId, editorId, archiveSha) {
    const r = await mustRow(jobId), ed = String(editorId), sha = String(archiveSha || '');
    if (!/^[a-f0-9]{64}$/.test(sha)) fail('MEDIA_INPUT_INVALID', 400, 'archive_sha256');
    if ((r.status === 'publishing' || r.status === 'published') && r.archive_sha256 === sha && r.dot_editor_id === ed)
      return { job: publicJob(r), uploadNo: r.upload_count, repeat: true };
    if (r.status === 'publishing' || r.status === 'published') fail('MEDIA_JOB_STATE', 409);
    if (r.status !== 'dot_taken' || r.dot_editor_id !== ed) fail('MEDIA_JOB_NOT_TAKEN', 409);
    const u = await dbRun(db, `UPDATE media_jobs SET status='publishing', upload_count=upload_count+1, archive_sha256=?, error_code=NULL, error_detail=NULL, updated_at=?
      WHERE job_id=? AND status='dot_taken' AND dot_editor_id=?`, [sha, iso(), r.job_id, ed]);
    if (u.changes !== 1) fail('MEDIA_JOB_NOT_TAKEN', 409);
    const job = await get(r.job_id);
    return { job, uploadNo: job.upload_count, repeat: false };
  }
  async function publishFailed(jobId, code, detail = null) {
    const r = await mustRow(jobId);
    await dbRun(db, `UPDATE media_jobs SET status='dot_taken', error_code=?, error_detail=?, updated_at=? WHERE job_id=? AND status='publishing'`,
      [clip(code, 60), clip(detail, 300), iso(), r.job_id]);
    return get(r.job_id);
  }
  async function markPublished(jobId, { slug, workId }) {
    const r = await mustRow(jobId), t = iso();
    // The same result recorded twice (a resend raced the first answer) is not an error.
    if (r.status === 'published' && r.published_slug === String(slug) && r.published_work_id === String(workId)) return publicJob(r);
    if (r.status !== 'publishing') fail('MEDIA_JOB_STATE', 409);
    await dbRun(db, `UPDATE media_jobs SET status='published', published_slug=?, published_work_id=?, published_at=?, error_code=NULL, error_detail=NULL, updated_at=? WHERE job_id=?`,
      [String(slug), String(workId), t, t, r.job_id]);
    return get(r.job_id);
  }
  async function dotFail(jobId, editorId, { reason = null } = {}) {
    const r = await mustRow(jobId);
    if (r.status !== 'dot_taken' || r.dot_editor_id !== String(editorId)) fail('MEDIA_JOB_NOT_TAKEN', 409);
    await dbRun(db, `UPDATE media_jobs SET status='failed_publish', error_code='DOT_REFUSED', error_detail=?, dot_lease_until=NULL, updated_at=? WHERE job_id=?`,
      [clip(reason, 300), iso(), r.job_id]);
    return get(r.job_id);
  }
  async function withdraw(jobId) {
    const r = await mustRow(jobId), t = iso();
    if (r.status !== 'published') fail('MEDIA_JOB_STATE', 409);
    await dbRun(db, "UPDATE media_jobs SET status='withdrawn', withdrawn_at=?, updated_at=? WHERE job_id=?", [t, t, r.job_id]);
    return get(r.job_id);
  }
  // dot's publications older than the cut and still shown: they leave «Видео дня» (spec §5.5, 30 days).
  const retireCandidates = beforeIso => dbAll(db, `SELECT job_id, published_slug, published_work_id FROM media_jobs
    WHERE status='published' AND published_at<? ORDER BY published_at`, [String(beforeIso)]);

  return { enqueue, list, get, lease, step, fail: failJob, acceptAsrZip, asrZipPath, retry, cancel,
    nextForDot, takeForDot, beginPublish, publishFailed, markPublished, dotFail, withdraw, retireCandidates };
}

module.exports = { parseYoutubeUrl, createMediaQueue, MediaQueueError, inspectAsrZip, LIMITS: { LEASE_MS, MAX_ATTEMPTS, OWNER_OPEN_LIMIT, ASR_ZIP_MAX, ASR_ZIP_UNPACKED_MAX, ASR_ZIP_MANIFEST_MAX, ASR_ZIP_ENTRIES_MAX } };
