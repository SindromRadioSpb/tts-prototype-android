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
    'YOUTUBE_SIGN_IN', 'YOUTUBE_PRIVATE', 'YOUTUBE_UNAVAILABLE', 'YOUTUBE_BLOCKED', 'YOUTUBE_LIVE', 'TOOL_MISSING', 'MEDIA_URL_INVALID', 'MEDIA_QUEUE_FULL', 'DOT_REFUSED', 'PUBLISH_FAILED', 'MEDIA_PUBLISH_RETRY', 'MEDIA_DAILY_DRAFT_BUSY',
    'MEDIA_TOO_LONG', 'MEDIA_DOT_DAILY_LIMIT', 'MEDIA_CHANNEL_URL_INVALID', 'MEDIA_CHANNEL_NOT_FOUND', 'MEDIA_CHANNELS_FULL', 'MEDIA_CHANNEL_FETCH_FAILED'];
  // Stage M3: the candidates and channels tabs.
  const M3_KEYS = ['tabQueue', 'tabCandidates', 'tabChannels', 'channelsIntro', 'channelUrl', 'channelAdd', 'channelAdded', 'channelAlready', 'channelRemove',
    'channelRemoved', 'channelsEmpty', 'channelOk', 'channelError', 'channelNever', 'quota', 'noCandidates', 'byDot', 'candidatesIntro'];
  // A candidate whose last job ended this way may be queued again.
  const REQUEUE = ['cancelled', 'withdrawn'];
  const TABS = ['queue', 'candidates', 'channels'];
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

  // «26.11» from an ISO time, as the Mediatheque shows dates in lists.
  const shortDate = iso => { const s = String(iso || ''); return s.length >= 10 ? s.slice(8, 10) + '.' + s.slice(5, 7) : ''; };
  const clock = iso => { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };

  function candidateRowHtml(c, { t, esc }) {
    const url = 'https://www.youtube.com/watch?v=' + c.video_id;
    const byDot = c.job_status && c.job_source === 'dot';
    const meta = [c.channel_title ? `<bdi>${esc(c.channel_title)}</bdi>` : null, shortDate(c.published_at) ? esc(shortDate(c.published_at)) : null].filter(Boolean).join(' · ');
    const open = !c.job_status || REQUEUE.includes(c.job_status);
    const status = open ? '' : `<p class="ml-vq-status">${esc(t('videoQueue.status.' + c.job_status))}${byDot ? ' · ' + esc(t('videoQueue.byDot')) : ''}</p>`;
    const action = open ? `<div class="ml-actions"><button type="button" data-vq-cand="enqueue" data-url="${esc(url)}">${esc(t('videoQueue.add'))}</button></div>` : '';
    return `<li class="ml-vq-row" data-status="${esc(c.job_status || 'candidate')}"><div class="ml-vq-main">`
      + `<span class="ml-vq-mark" aria-hidden="true">${byDot ? '★' : open ? '' : '✓'}</span>`
      + `<div><a class="ml-vq-name" dir="auto" href="${esc(url)}" target="_blank" rel="noopener">${esc(c.title || 'youtu.be/' + c.video_id)}</a>`
      + (c.title_ru ? `<p class="ml-vq-tr" dir="auto">${esc(c.title_ru)}</p>` : '')
      + (meta ? `<small>${meta}</small>` : '') + status + `</div></div>${action}</li>`;
  }

  function channelRowHtml(ch, { t, esc }) {
    const state = ch.last_error ? t('videoQueue.channelError', { code: ch.last_error })
      : ch.last_ok_at ? t('videoQueue.channelOk', { time: clock(ch.last_ok_at) }) : t('videoQueue.channelNever');
    return `<li class="ml-vq-row" data-status="${ch.last_error ? 'failed_channel' : 'channel'}"><div class="ml-vq-main"><span class="ml-vq-mark" aria-hidden="true">${ch.last_error ? '✕' : '✓'}</span>`
      + `<div><a class="ml-vq-name" dir="auto" href="https://www.youtube.com/channel/${esc(ch.channel_id)}" target="_blank" rel="noopener">${esc(ch.title || ch.channel_id)}</a>`
      + (ch.handle ? `<small dir="ltr">@${esc(ch.handle)}</small>` : '')
      + `<p class="${ch.last_error ? 'ml-vq-hint' : 'ml-vq-status'}">${esc(state)}</p></div></div>`
      + `<div class="ml-actions"><button type="button" data-vq-ch="remove" data-id="${esc(ch.channel_id)}">${esc(t('videoQueue.channelRemove'))}</button></div></li>`;
  }

  function rowHtml(job, { t, esc }) {
    const id = esc(job.job_id);
    // Without a title yet, the short address names the video.
    const name = job.title || 'youtu.be/' + job.video_id;
    // The channel is isolated (<bdi>) so a Hebrew name does not reorder the duration around it.
    const meta = [job.source === 'dot' ? esc(t('videoQueue.byDot')) : null, job.channel_title ? `<bdi>${esc(job.channel_title)}</bdi>` : null,
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
      + (job.title_ru ? `<p class="ml-vq-tr" dir="auto">${esc(job.title_ru)}</p>` : '')
      + (meta ? `<small>${meta}</small>` : '')
      + `<p class="ml-vq-status">${esc(t(statusLabelKey(job)))}</p>`
      + (hint ? `<p class="ml-vq-hint" dir="auto">${esc(t(hint, { code: job.error_code, detail: job.error_detail || '' }))}</p>` : '')
      + `</div></div>${actions ? `<div class="ml-actions">${actions}</div>` : ''}</li>`;
  }

  // ctx: { api, t, esc, showDialog, formActions, announce, dialog, body }
  function open(ctx) {
    const { api, t, esc } = ctx;
    if (current) current.stop();
    let timer = null, tab = 'queue';
    const q = sel => ctx.body.querySelector(sel);
    const all = sel => (ctx.body.querySelectorAll ? Array.from(ctx.body.querySelectorAll(sel)) : []);
    const LIST = { queue: '#ml-vq-list', candidates: '#ml-vq-cands', channels: '#ml-vq-channels' };
    const empty = key => `<li class="ml-muted">${esc(t(key))}</li>`;
    // Only the tab on screen is read; a switch reads its tab at once.
    async function refresh() {
      const shown = tab, el = q(LIST[shown]);
      if (!el || !ctx.dialog.open) { stop(); return; }
      try {
        let html;
        if (shown === 'queue') {
          const { jobs } = await api('/api/media-queue/jobs');
          html = jobs.length ? jobs.map(j => rowHtml(j, { t, esc })).join('') : empty('videoQueue.empty');
        } else if (shown === 'candidates') {
          const { candidates, quota } = await api('/api/media-queue/candidates');
          const qEl = q('#ml-vq-quota'); if (qEl && quota) qEl.textContent = t('videoQueue.quota', { used: quota.used, limit: quota.limit });
          html = candidates.length ? candidates.map(c => candidateRowHtml(c, { t, esc })).join('') : empty('videoQueue.noCandidates');
        } else {
          const { channels } = await api('/api/media-queue/channels');
          html = channels.length ? channels.map(c => channelRowHtml(c, { t, esc })).join('') : empty('videoQueue.channelsEmpty');
        }
        // A tab switched while the answer was on its way keeps its own list.
        if (tab === shown && q(LIST[shown])) q(LIST[shown]).innerHTML = html;
      } catch (e) { if (tab === shown && q(LIST[shown])) q(LIST[shown]).innerHTML = `<li class="ml-form-error">${esc(ctx.errorText(e))}</li>`; }
    }
    function show(next) {
      tab = TABS.includes(next) ? next : 'queue';
      for (const b of all('[data-vq-tab]')) b.setAttribute('aria-selected', String(b.dataset.vqTab === tab));
      for (const p of all('[data-vq-panel]')) p.hidden = p.dataset.vqPanel !== tab;
      return refresh();
    }
    function stop() { if (timer) clearInterval(timer); timer = null; ctx.body.removeEventListener('click', onClick); if (current === self) current = null; }
    const self = { stop };
    async function addChannel() {
      const input = q('input[name=channel]'), url = String(input && input.value || '').trim();
      if (!url) throw Object.assign(new Error('MEDIA_CHANNEL_URL_INVALID'), { code: 'MEDIA_CHANNEL_URL_INVALID' });
      const r = await api('/api/media-queue/channels', { url });
      if (input) input.value = '';
      ctx.announce(t(r.existing ? 'videoQueue.channelAlready' : 'videoQueue.channelAdded'));
      await refresh();
    }
    async function onClick(event) {
      const tabBtn = event.target.closest('[data-vq-tab]');
      if (tabBtn) { event.preventDefault(); return show(tabBtn.dataset.vqTab); }
      const b = event.target.closest('[data-vq],[data-vq-cand],[data-vq-ch],[data-vq-add-channel]');
      if (!b) return;
      event.preventDefault(); b.disabled = true;
      try {
        if (b.dataset.vqCand) { const r = await api('/api/media-queue/jobs', { url: b.dataset.url }); ctx.announce(t(r.existing ? 'videoQueue.already' : 'videoQueue.added')); }
        else if (b.dataset.vqCh) { await api('/api/media-queue/channels/' + encodeURIComponent(b.dataset.id) + '/remove', {}); ctx.announce(t('videoQueue.channelRemoved')); }
        else if (b.hasAttribute('data-vq-add-channel')) await addChannel();
        else await api('/api/media-queue/jobs/' + encodeURIComponent(b.dataset.id) + '/' + b.dataset.vq, {});
      } catch (e) { ctx.announce(ctx.errorText(e), true); }
      b.disabled = false;
      await refresh();
    }
    const tabButton = name => `<button type="button" role="tab" data-vq-tab="${name}" aria-selected="${name === 'queue'}">${esc(t('videoQueue.tab' + name[0].toUpperCase() + name.slice(1)))}</button>`;
    ctx.showDialog(t('videoQueue.title'),
      `<div class="ml-vq-tabs" role="tablist">${TABS.map(tabButton).join('')}</div>`
      + `<section data-vq-panel="queue"><p>${esc(t('videoQueue.intro'))}</p>`
      + `<div class="ml-vq-add"><label>${esc(t('videoQueue.url'))}<input name="url" type="url" inputmode="url" autocomplete="off" dir="ltr" placeholder="https://youtu.be/…"></label>`
      + `<button type="submit" class="ml-primary">${esc(t('videoQueue.add'))}</button></div>`
      + `<ul class="ml-vq-list" id="ml-vq-list" aria-live="polite"></ul></section>`
      + `<section data-vq-panel="candidates" hidden><p>${esc(t('videoQueue.candidatesIntro'))}</p><p class="ml-vq-quota" id="ml-vq-quota"></p>`
      + `<ul class="ml-vq-list" id="ml-vq-cands" aria-live="polite"></ul></section>`
      + `<section data-vq-panel="channels" hidden><p>${esc(t('videoQueue.channelsIntro'))}</p>`
      + `<div class="ml-vq-add"><label>${esc(t('videoQueue.channelUrl'))}<input name="channel" type="text" inputmode="url" autocomplete="off" dir="ltr" placeholder="https://www.youtube.com/@…"></label>`
      + `<button type="button" class="ml-primary" data-vq-add-channel>${esc(t('videoQueue.channelAdd'))}</button></div>`
      + `<ul class="ml-vq-list" id="ml-vq-channels" aria-live="polite"></ul></section>`,
      // Enter in either field submits the form: the tab on screen decides what is added.
      async data => {
        if (tab === 'channels') return addChannel();
        const url = String(data.get('url') || '').trim();
        if (!url) throw Object.assign(new Error('MEDIA_URL_INVALID'), { code: 'MEDIA_URL_INVALID' });
        const r = await api('/api/media-queue/jobs', { url });
        const input = q('input[name=url]'); if (input) input.value = '';
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

  return { STATUSES, HINT_CODES, FINAL_HINT_CODES, M3_KEYS, statusLabelKey, hintKey, canRetry, canCancel, canWithdraw, rowHtml, candidateRowHtml, channelRowHtml, open };
});
