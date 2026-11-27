// The owner's «Видео: очередь» in the Mediatheque (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.6, stage M1).
// A YouTube link goes into the queue; the home PC downloads the audio, runs ASR and the ASR ZIP shows up here.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MediathequeVideoQueue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STATUSES = ['queued', 'acquiring', 'asr', 'asr_ready', 'dot_taken', 'publishing', 'published', 'failed_acquire', 'failed_asr', 'failed_upload', 'failed_publish', 'cancelled', 'withdrawn'];
  // The owner may cancel until dot has taken the job (stage M2).
  const CANCELLABLE = ['queued', 'acquiring', 'asr', 'asr_ready'];
  // The ASR ZIP stays downloadable once it exists.
  const HAS_ASR = ['asr_ready', 'dot_taken', 'publishing', 'published', 'failed_publish'];
  // Codes of the publication checks: one hint that names the code.
  const PUBLISH_CODE = /^(MATERIAL_|PACKAGE_|ZIP_|MANIFEST_|CANONICAL_|GRAPH_|SOURCE_|MEDIATHEQUE_|PLAYBACK_|PUBLICATION_)/;
  const DAILY_HREF = '/mediatheque.html?section=catalog&amp;category=m_daily_video';
  const HINT_CODES = ['ACQUIRE_FAILED', 'ASR_FAILED', 'ASR_PARTIAL', 'ASR_BUSY', 'LEASE_EXPIRED', 'UPLOAD_REJECTED',
    'YOUTUBE_SIGN_IN', 'YOUTUBE_PRIVATE', 'YOUTUBE_UNAVAILABLE', 'YOUTUBE_BLOCKED', 'YOUTUBE_LIVE', 'TOOL_MISSING', 'MEDIA_URL_INVALID', 'MEDIA_QUEUE_FULL', 'DOT_REFUSED', 'PUBLISH_FAILED', 'MEDIA_PUBLISH_RETRY', 'MEDIA_DAILY_DRAFT_BUSY'];
  // These codes promise another try; on a failed_* job (attempts used up) the final wording is shown instead.
  const FINAL_HINT_CODES = ['ACQUIRE_FAILED', 'LEASE_EXPIRED', 'YOUTUBE_BLOCKED', 'TOOL_MISSING'];
  const POLL_MS = 15000;
  const MARK = { queued: '⏸', acquiring: '●', asr: '●', asr_ready: '✓', dot_taken: '●', publishing: '●', published: '★', cancelled: '–', withdrawn: '–' };

  const statusLabelKey = job => 'videoQueue.status.' + job.status;
  function hintKey(job) {
    if (!job.error_code) return null;
    if (PUBLISH_CODE.test(job.error_code)) return 'videoQueue.hint.PUBLISH_FAILED';
    if (!HINT_CODES.includes(job.error_code)) return 'videoQueue.hint.unknown';
    const final = /^failed_/.test(job.status) && FINAL_HINT_CODES.includes(job.error_code);
    return 'videoQueue.hint.' + job.error_code + (final ? '_final' : '');
  }
  let current = null; // the open dialog's poll; a reopen stops the old one first
  const canRetry = job => /^failed_/.test(job.status);
  const canCancel = job => CANCELLABLE.includes(job.status);
  const canWithdraw = job => job.status === 'published';

  function rowHtml(job, { t, esc }) {
    const id = esc(job.job_id);
    // Without a title yet, the short address names the video.
    const name = job.title || 'youtu.be/' + job.video_id;
    // The channel is isolated (<bdi>) so a Hebrew name does not reorder the duration around it.
    const meta = [job.channel_title ? `<bdi>${esc(job.channel_title)}</bdi>` : null,
      job.duration_sec != null ? esc(t('videoQueue.duration', { min: Math.max(1, Math.round(job.duration_sec / 60)) })) : null].filter(Boolean).join(' · ');
    const hint = hintKey(job);
    const actions = [
      canRetry(job) ? `<button type="button" data-vq="retry" data-id="${id}">${esc(t('videoQueue.retry'))}</button>` : '',
      canCancel(job) ? `<button type="button" data-vq="cancel" data-id="${id}">${esc(t('videoQueue.cancel'))}</button>` : '',
      canWithdraw(job) ? `<a class="ml-primary ml-vq-download" href="${DAILY_HREF}">${esc(t('videoQueue.openMaterial'))}</a>` : '',
      canWithdraw(job) ? `<button type="button" data-vq="withdraw" data-id="${id}">${esc(t('videoQueue.withdraw'))}</button>` : '',
      HAS_ASR.includes(job.status) ? `<a class="${job.status === 'asr_ready' ? 'ml-primary ' : ''}ml-vq-download" href="/api/media-queue/jobs/${id}/asr-zip" download>${esc(t('videoQueue.download'))}</a>` : '',
    ].join('');
    return `<li class="ml-vq-row" data-status="${esc(job.status)}"><div class="ml-vq-main">`
      + `<span class="ml-vq-mark" aria-hidden="true">${MARK[job.status] || '✕'}</span>`
      + `<div><a class="ml-vq-name" dir="auto" href="${esc(job.url)}" target="_blank" rel="noopener">${esc(name)}</a>`
      + (meta ? `<small>${meta}</small>` : '')
      + `<p class="ml-vq-status">${esc(t(statusLabelKey(job)))}</p>`
      + (hint ? `<p class="ml-vq-hint" dir="auto">${esc(t(hint, { code: job.error_code, detail: job.error_detail || '' }))}</p>` : '')
      + `</div></div>${actions ? `<div class="ml-actions">${actions}</div>` : ''}</li>`;
  }

  // ctx: { api, t, esc, showDialog, formActions, announce, dialog, body }
  function open(ctx) {
    const { api, t, esc } = ctx;
    if (current) current.stop();
    let timer = null;
    const listEl = () => ctx.body.querySelector('#ml-vq-list');
    async function refresh() {
      const el = listEl();
      if (!el || !ctx.dialog.open) { stop(); return; }
      try {
        const { jobs } = await api('/api/media-queue/jobs');
        if (!listEl()) return;
        el.innerHTML = jobs.length ? jobs.map(j => rowHtml(j, { t, esc })).join('') : `<li class="ml-muted">${esc(t('videoQueue.empty'))}</li>`;
      } catch (e) { if (listEl()) el.innerHTML = `<li class="ml-form-error">${esc(ctx.errorText(e))}</li>`; }
    }
    function stop() { if (timer) clearInterval(timer); timer = null; ctx.body.removeEventListener('click', onClick); if (current === self) current = null; }
    const self = { stop };
    async function onClick(event) {
      const b = event.target.closest('[data-vq]');
      if (!b) return;
      event.preventDefault(); b.disabled = true;
      try { await api('/api/media-queue/jobs/' + encodeURIComponent(b.dataset.id) + '/' + b.dataset.vq, {}); }
      catch (e) { ctx.announce(ctx.errorText(e), true); }
      await refresh();
    }
    ctx.showDialog(t('videoQueue.title'),
      `<p>${esc(t('videoQueue.intro'))}</p>`
      + `<div class="ml-vq-add"><label>${esc(t('videoQueue.url'))}<input name="url" type="url" inputmode="url" autocomplete="off" required dir="ltr" placeholder="https://youtu.be/…"></label>`
      + `<button type="submit" class="ml-primary">${esc(t('videoQueue.add'))}</button></div>`
      + `<ul class="ml-vq-list" id="ml-vq-list" aria-live="polite"></ul>`,
      async data => {
        const r = await api('/api/media-queue/jobs', { url: String(data.get('url') || '').trim() });
        const input = ctx.body.querySelector('input[name=url]'); if (input) input.value = '';
        ctx.announce(t(r.existing ? 'videoQueue.already' : 'videoQueue.added'));
        await refresh();
      }, stop);
    ctx.body.addEventListener('click', onClick);
    // Closing the dialog stops the poll however it closes (the form's cancel hook is not called after a successful add).
    ctx.dialog.addEventListener('close', stop, { once: true });
    timer = setInterval(refresh, POLL_MS);
    current = self;
    return refresh();
  }

  return { STATUSES, HINT_CODES, FINAL_HINT_CODES, statusLabelKey, hintKey, canRetry, canCancel, canWithdraw, rowHtml, open };
});
