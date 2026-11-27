'use strict';
// The owner's «Видео: очередь» dialog in the Mediatheque (spec 2026-11-27 §5.6; plan M1 Task 6).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Q = require('../public/js/mediatheque-video-queue.js');

const STATUSES = ['queued', 'acquiring', 'asr', 'asr_ready', 'dot_taken', 'publishing', 'published', 'failed_acquire', 'failed_asr', 'failed_upload', 'failed_publish', 'cancelled', 'withdrawn'];

test('statusLabelKey covers every status', () => {
  assert.deepEqual(Q.STATUSES, STATUSES);
  for (const s of STATUSES) assert.equal(Q.statusLabelKey({ status: s }), 'videoQueue.status.' + s);
});
test('hintKey: known codes, unknown code falls back, no code → null', () => {
  assert.equal(Q.hintKey({ status: 'failed_acquire', error_code: 'YOUTUBE_SIGN_IN' }), 'videoQueue.hint.YOUTUBE_SIGN_IN');
  assert.equal(Q.hintKey({ status: 'queued', error_code: 'LEASE_EXPIRED' }), 'videoQueue.hint.LEASE_EXPIRED');
  assert.equal(Q.hintKey({ status: 'failed_asr', error_code: 'SOMETHING_NEW' }), 'videoQueue.hint.unknown');
  assert.equal(Q.hintKey({ status: 'asr_ready', error_code: null }), null);
});
test('a terminal job never shows a "will try again" hint', () => {
  assert.equal(Q.hintKey({ status: 'failed_acquire', error_code: 'ACQUIRE_FAILED' }), 'videoQueue.hint.ACQUIRE_FAILED_final');
  assert.equal(Q.hintKey({ status: 'failed_asr', error_code: 'LEASE_EXPIRED' }), 'videoQueue.hint.LEASE_EXPIRED_final');
  assert.equal(Q.hintKey({ status: 'failed_asr', error_code: 'ASR_FAILED' }), 'videoQueue.hint.ASR_FAILED');
  assert.equal(Q.hintKey({ status: 'queued', error_code: 'ACQUIRE_FAILED' }), 'videoQueue.hint.ACQUIRE_FAILED');
  for (const c of ['YOUTUBE_BLOCKED', 'TOOL_MISSING', 'YOUTUBE_LIVE']) assert.ok(Q.HINT_CODES.includes(c), c);
});
test('reopening the dialog leaves one poll and one click listener', async () => {
  const listeners = new Set(), dialogListeners = [];
  const body = { addEventListener: (n, f) => listeners.add(f), removeEventListener: (n, f) => listeners.delete(f),
    querySelector: s => s === '#ml-vq-list' ? { innerHTML: '' } : null };
  const dialog = { open: true, addEventListener: (n, f, o) => dialogListeners.push({ n, f, o }) };
  let polls = 0;
  const realSet = global.setInterval, realClear = global.clearInterval, live = new Set();
  global.setInterval = (f, ms) => { const h = { f, ms }; live.add(h); return h; };
  global.clearInterval = h => live.delete(h);
  try {
    const ctx = { api: async () => { polls++; return { jobs: [] }; }, t: k => k, esc: s => String(s), showDialog: () => {}, announce: () => {}, errorText: e => String(e), dialog, body };
    await Q.open(ctx); await Q.open(ctx);
    assert.equal(listeners.size, 1, 'one click listener'); assert.equal(live.size, 1, 'one poll timer');
    assert.ok(dialogListeners.some(l => l.n === 'close'), 'stops on dialog close');
    dialogListeners.filter(l => l.n === 'close').forEach(l => l.f());
    assert.equal(listeners.size, 0); assert.equal(live.size, 0);
  } finally { global.setInterval = realSet; global.clearInterval = realClear; }
});
test('retry only for failed_*', () => {
  for (const s of STATUSES) assert.equal(Q.canRetry({ status: s }), s.startsWith('failed_'), s);
});
test('cancel until dot takes the job (queued/acquiring/asr/asr_ready)', () => {
  for (const s of STATUSES) assert.equal(Q.canCancel({ status: s }), ['queued', 'acquiring', 'asr', 'asr_ready'].includes(s), s);
});
test('withdraw and the open link only for published', () => {
  for (const s of STATUSES) assert.equal(Q.canWithdraw({ status: s }), s === 'published', s);
  const t = k => k, esc = x => String(x);
  const pub = Q.rowHtml({ job_id: 'mj_0123456789abcdef', video_id: 'dQw4w9WgXcQ', status: 'published', title: 'x', url: 'u' }, { t, esc });
  assert.ok(pub.includes('href="/mediatheque.html?section=catalog&amp;category=m_daily_video"'), 'open in the Mediatheque');
  assert.ok(pub.includes('data-vq="withdraw"'));
  const ready = Q.rowHtml({ job_id: 'mj_0123456789abcdef', video_id: 'dQw4w9WgXcQ', status: 'asr_ready', title: 'x', url: 'u' }, { t, esc });
  assert.ok(!ready.includes('m_daily_video') && !ready.includes('data-vq="withdraw"'));
  assert.ok(ready.includes('asr-zip'), 'ASR zip still downloadable');
});
test('dot refusal and publish failures have hints', () => {
  assert.equal(Q.hintKey({ status: 'failed_publish', error_code: 'DOT_REFUSED' }), 'videoQueue.hint.DOT_REFUSED');
  assert.equal(Q.hintKey({ status: 'dot_taken', error_code: 'MATERIAL_ARCHIVE_INVALID' }), 'videoQueue.hint.PUBLISH_FAILED');
  assert.equal(Q.hintKey({ status: 'dot_taken', error_code: 'MATERIAL_SOURCE_MISMATCH' }), 'videoQueue.hint.PUBLISH_FAILED');
});
test('rowHtml escapes the title and links the ASR zip only when ready', () => {
  const t = (k, v) => k + (v ? JSON.stringify(v) : ''), esc = s => String(s).replace(/</g, '&lt;');
  const ready = Q.rowHtml({ job_id: 'mj_0123456789abcdef', status: 'asr_ready', title: '<b>x</b>', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', duration_sec: 754, channel_title: 'Kan 11' }, { t, esc });
  assert.match(ready, /&lt;b>x&lt;\/b>/);
  assert.match(ready, /href="\/api\/media-queue\/jobs\/mj_0123456789abcdef\/asr-zip"/);
  assert.match(ready, /videoQueue\.duration\{"min":13\}/);
  const queued = Q.rowHtml({ job_id: 'mj_0123456789abcdef', video_id: 'dQw4w9WgXcQ', status: 'queued', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, { t, esc });
  assert.ok(!/asr-zip/.test(queued)); assert.match(queued, /data-vq="cancel"/);
  assert.ok(queued.includes('>youtu.be/dQw4w9WgXcQ<'), 'untitled job is named by its short address');
  const he = Q.rowHtml({ job_id: 'mj_0123456789abcdef', video_id: 'dQw4w9WgXcQ', status: 'asr', title: 'x', url: 'u', channel_title: '<כאן>', duration_sec: 60 }, { t, esc });
  assert.ok(he.includes('<small><bdi>&lt;כאן></bdi> · videoQueue.duration'), 'channel isolated and escaped');
});

function localeObject(lang) {
  const window = { I18N_LOCALES: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n', 'locales', lang + '.js'), 'utf8'), { window });
  return window.I18N_LOCALES[lang];
}
test('every key used exists in ru, en and he', () => {
  const keys = ['open', 'title', 'intro', 'url', 'add', 'added', 'already', 'empty', 'retry', 'cancel', 'download', 'duration', 'openMaterial', 'withdraw', 'withdrawn',
    ...STATUSES.map(s => 'status.' + s), ...Q.HINT_CODES.map(c => 'hint.' + c), ...Q.FINAL_HINT_CODES.map(c => 'hint.' + c + '_final'), 'hint.unknown', ...Q.M3_KEYS];
  for (const lang of ['ru', 'en', 'he']) {
    const vq = localeObject(lang).mediatheque.videoQueue;
    for (const k of keys) {
      const v = k.split('.').reduce((o, p) => o && o[p], vq);
      assert.equal(typeof v, 'string', lang + ': ' + k); assert.ok(v.trim(), lang + ': ' + k);
    }
  }
});

test('a server-side publish failure is not blamed on dot\'s archive', () => {
  assert.equal(Q.hintKey({ status: 'dot_taken', error_code: 'MEDIA_PUBLISH_RETRY' }), 'videoQueue.hint.MEDIA_PUBLISH_RETRY');
  assert.equal(Q.hintKey({ status: 'dot_taken', error_code: 'MEDIA_DAILY_DRAFT_BUSY' }), 'videoQueue.hint.MEDIA_DAILY_DRAFT_BUSY');
  assert.equal(Q.hintKey({ status: 'dot_taken', error_code: 'PACKAGE_HASH_MISMATCH' }), 'videoQueue.hint.PUBLISH_FAILED');
});

// ---- M3 Task 4: candidates and channels (plan ...-m3.md) --------------------------------------------------------------
const ctxT = { t: (k, p) => k + (p ? JSON.stringify(p) : ''), esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') };
const cand = o => ({ video_id: 'aaaaaaaaaaa', title: 'הפטריוטים <b>', title_ru: 'Патриоты', channel_title: 'C14', published_at: '2026-11-26T22:09:37.000Z', job_id: null, job_status: null, job_source: null, ...o });

test('a candidate without a job offers «В очередь»; its title is escaped and the translation shown', () => {
  const h = Q.candidateRowHtml(cand(), ctxT);
  assert.match(h, /data-vq-cand="enqueue"/); assert.ok(h.includes('data-url="https://www.youtube.com/watch?v=aaaaaaaaaaa"'));
  assert.ok(h.includes('הפטריוטים &lt;b>')); assert.ok(!h.includes('<b>'));
  assert.ok(h.includes('Патриоты')); assert.ok(h.includes('<bdi>C14</bdi>')); assert.ok(h.includes('26.11'));
});
test('a candidate dot picked shows ★ and the job status instead of the button', () => {
  const h = Q.candidateRowHtml(cand({ job_id: 'mj_1', job_status: 'asr', job_source: 'dot' }), ctxT);
  assert.ok(!h.includes('data-vq-cand')); assert.ok(h.includes('★'));
  assert.ok(h.includes('videoQueue.status.asr')); assert.ok(h.includes('videoQueue.byDot'));
  const own = Q.candidateRowHtml(cand({ job_id: 'mj_2', job_status: 'queued', job_source: 'owner' }), ctxT);
  assert.ok(!own.includes('★')); assert.ok(!own.includes('videoQueue.byDot'));
});
test('a finished job of a candidate (cancelled) offers the queue again', () => {
  assert.match(Q.candidateRowHtml(cand({ job_id: 'mj_1', job_status: 'cancelled', job_source: 'owner' }), ctxT), /data-vq-cand="enqueue"/);
});
test('a channel row shows its error and a remove button', () => {
  const h = Q.channelRowHtml({ channel_id: 'UCKEImtWikw9usC1pl_9m1nQ', title: 'C14 <x>', handle: 'c14news', last_ok_at: null, last_error: 'MEDIA_FEED_HTTP_403' }, ctxT);
  assert.ok(h.includes('videoQueue.channelError')); assert.ok(h.includes('MEDIA_FEED_HTTP_403'));
  assert.match(h, /data-vq-ch="remove" data-id="UCKEImtWikw9usC1pl_9m1nQ"/); assert.ok(h.includes('C14 &lt;x>')); assert.ok(h.includes('@c14news'));
  assert.ok(!Q.channelRowHtml({ channel_id: 'UCKEImtWikw9usC1pl_9m1nQ', title: 'C14', last_ok_at: '2026-11-27T08:00:00Z', last_error: null }, ctxT).includes('channelError'));
});
test('a job row shows dot translation and who picked it; too-long has a hint', () => {
  const h = Q.rowHtml({ job_id: 'mj_0123456789abcdef', video_id: 'aaaaaaaaaaa', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', status: 'failed_acquire', source: 'dot', title: 'א', title_ru: 'Перевод', error_code: 'MEDIA_TOO_LONG' }, ctxT);
  assert.ok(h.includes('Перевод')); assert.ok(h.includes('videoQueue.byDot')); assert.ok(h.includes('videoQueue.hint.MEDIA_TOO_LONG'));
});
