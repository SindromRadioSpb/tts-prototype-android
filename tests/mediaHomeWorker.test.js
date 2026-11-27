'use strict';
// The home PC worker core (spec 2026-11-27 §5.3; plan M1 Task 4). yt-dlp, the ASR tool and the server are
// stand-ins here: no network, no GPU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const AdmZip = require('adm-zip');
const W = require('../mediaqueue/homeWorkerCore');

const ID = 'dQw4w9WgXcQ', ORIGIN = 'https://lp.example', KEY = 'lpr_' + 'a'.repeat(43);
const ROOT = 'F:\\datasets_models\\LinguistPro_ASR_Tool';

test('asrEnv matches the .cmd variables', () => {
  const env = W.asrEnv(ROOT, { PATH: 'p', TEMP: 'old' });
  const r = ROOT + '\\';
  assert.deepEqual({ ...env, PATH: undefined }, {
    PATH: undefined, LINGUIST_ASR_ROOT: r, TEMP: r + 'runtime\\tmp', TMP: r + 'runtime\\tmp',
    HF_HOME: r + 'runtime\\cache\\hf', HUGGINGFACE_HUB_CACHE: r + 'runtime\\cache\\hf\\hub', TORCH_HOME: r + 'runtime\\cache\\torch',
    PIP_CACHE_DIR: r + 'runtime\\cache\\pip', XDG_CACHE_HOME: r + 'runtime\\cache', UV_CACHE_DIR: r + 'runtime\\cache\\uv',
    PYTHONPYCACHEPREFIX: r + 'runtime\\cache\\pycache', CUDA_CACHE_PATH: r + 'runtime\\cache\\cuda',
    HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1',
  });
  assert.equal(env.PATH, 'p');
});
test('asrPython reads the venv from local_config.json', () => {
  const p = W.asrPython(ROOT, f => { assert.equal(f, ROOT + '\\local_config.json'); return JSON.stringify({ venv: 'F:\\venvs\\asr' }); });
  assert.equal(p, 'F:\\venvs\\asr\\Scripts\\python.exe');
});
test('ytDlpArgs never contains cookies, playlist or proxy flags', () => {
  const meta = W.ytDlpArgs.meta('https://www.youtube.com/watch?v=' + ID);
  const dl = W.ytDlpArgs.download('https://www.youtube.com/watch?v=' + ID, 'C:\\w\\' + ID);
  assert.deepEqual(meta, ['-J', '--no-playlist', '--no-warnings', 'https://www.youtube.com/watch?v=' + ID]);
  assert.deepEqual(dl, ['-f', 'bestaudio[ext=m4a]/bestaudio', '--no-playlist', '--no-progress', '--restrict-filenames',
    '-o', path.join('C:\\w\\' + ID, '%(id)s.%(ext)s'), '--print', 'after_move:filepath', 'https://www.youtube.com/watch?v=' + ID]);
  for (const a of [...meta, ...dl]) assert.ok(!/cookies|yes-playlist|proxy/.test(a), a);
});
test('findAsrZip picks _ASR.zip and _ASR_2.zip, reports partial', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-asrzip-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(W.findAsrZip(dir, ID), null);
  fs.writeFileSync(path.join(dir, ID + '_ASR_partial.zip'), 'x');
  assert.deepEqual(W.findAsrZip(dir, ID), { partial: true });
  fs.writeFileSync(path.join(dir, ID + '_ASR_2.zip'), 'x');
  assert.deepEqual(W.findAsrZip(dir, ID), { zip: path.join(dir, ID + '_ASR_2.zip') });
  fs.writeFileSync(path.join(dir, 'other_ASR.zip'), 'x');
  assert.deepEqual(W.findAsrZip(dir, ID), { zip: path.join(dir, ID + '_ASR_2.zip') });
});
test('classifyYtDlpError', () => {
  assert.deepEqual(W.classifyYtDlpError('ERROR: [youtube] x: Sign in to confirm you’re not a bot'), { code: 'YOUTUBE_BLOCKED', retryable: true, countAttempt: false, stop: true });
  assert.deepEqual(W.classifyYtDlpError("ERROR: [youtube] x: Sign in to confirm you're not a bot"), { code: 'YOUTUBE_BLOCKED', retryable: true, countAttempt: false, stop: true });
  assert.deepEqual(W.classifyYtDlpError('ERROR: [youtube] x: Sign in to confirm your age'), { code: 'YOUTUBE_SIGN_IN', retryable: false });
  assert.deepEqual(W.classifyYtDlpError('ERROR: [youtube] x: Private video. Sign in if…'), { code: 'YOUTUBE_PRIVATE', retryable: false });
  assert.deepEqual(W.classifyYtDlpError('ERROR: [youtube] x: Video unavailable'), { code: 'YOUTUBE_UNAVAILABLE', retryable: false });
  // the real wording seen live on 2026-11-27 for a nonexistent id
  assert.deepEqual(W.classifyYtDlpError('ERROR: [youtube] AAAAAAAAAAA: This video is unavailable'), { code: 'YOUTUBE_UNAVAILABLE', retryable: false });
  assert.deepEqual(W.classifyYtDlpError('ERROR: unable to download: HTTP Error 503'), { code: 'ACQUIRE_FAILED', retryable: true, stop: true });
});

// ---- runOnce -------------------------------------------------------------------------------------------
function zipBytes() { const z = new AdmZip(); z.addFile('manifest.json', Buffer.from('{"completed":true}')); return z.toBuffer(); }
function harness(t, { lease = { job_id: 'mj_0123456789abcdef', video_id: ID, url: 'https://www.youtube.com/watch?v=' + ID, attempts: 0 },
  ytMeta = { code: 0, stdout: JSON.stringify({ title: 'Сюжет', duration: 754.3, channel: 'Kan 11' }), stderr: '' },
  ytDl = null, asr = { code: 0 }, asrOutput = 'zip', putStatus = 200, metaStepJob = null } = {}) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-worker-'));
  t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));
  const calls = [], execs = [], written = {};
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url), body = init.body && !Buffer.isBuffer(init.body) && typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ method: init.method, path: u.pathname, body, auth: init.headers && init.headers.authorization, type: init.headers && init.headers['content-type'] });
    const ok = s => new Response(JSON.stringify(s), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/api/media-queue/worker/lease') return ok({ ok: true, job: lease });
    if (u.pathname.endsWith('/asr-zip')) return new Response(JSON.stringify(putStatus === 200 ? { ok: true } : { ok: false, error: 'MEDIA_ASR_ZIP_INVALID' }), { status: putStatus });
    if (metaStepJob && body && body.meta) return ok({ ok: true, job: metaStepJob });
    return ok({ ok: true, job: {} });
  };
  const exec = async (cmd, args, opts) => {
    execs.push({ cmd, args, opts });
    if (cmd === 'yt-dlp' && args[0] === '-J') return ytMeta;
    if (cmd === 'yt-dlp') {
      if (ytDl) return ytDl;
      const out = path.dirname(args[args.indexOf('-o') + 1]), file = path.join(out, ID + '.m4a');
      fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(file, 'audio');
      return { code: 0, stdout: 'some line\n' + file + '\n', stderr: '' };
    }
    // the ASR tool
    const audio = args[args.indexOf('--audio') + 1], dir = path.dirname(audio);
    if (asrOutput === 'zip') fs.writeFileSync(path.join(dir, ID + '_ASR.zip'), written.zip = zipBytes());
    if (asrOutput === 'partial') fs.writeFileSync(path.join(dir, ID + '_ASR_partial.zip'), zipBytes());
    return { code: asr.code, stdout: '', stderr: asr.code ? 'boom' : '' };
  };
  const run = () => W.runOnce({ origin: ORIGIN, key: KEY, workDir, asrRoot: ROOT, exec, fetch: fetchImpl, log: () => {},
    readFile: () => JSON.stringify({ venv: 'F:\\venv' }), heartbeatMs: 0 });
  return { run, calls, execs, workDir, written };
}
const steps = calls => calls.map(c => c.path.replace(/mj_[0-9a-f]+/, ':id') + (c.body && c.body.status ? ':' + c.body.status : '') + (c.body && c.body.code ? ':' + c.body.code : ''));

test('runOnce happy path: lease → step acquiring(meta) → step asr → PUT zip', async t => {
  const h = harness(t);
  assert.equal(await h.run(), 'done');
  assert.deepEqual(steps(h.calls), ['/api/media-queue/worker/lease', '/api/media-queue/worker/jobs/:id/step:acquiring',
    '/api/media-queue/worker/jobs/:id/step:acquiring', '/api/media-queue/worker/jobs/:id/step:asr', '/api/media-queue/worker/jobs/:id/asr-zip']);
  assert.ok(h.calls.every(c => c.auth === 'Bearer ' + KEY));
  assert.deepEqual(h.calls[2].body.meta, { title: 'Сюжет', duration_sec: 754, channel_title: 'Kan 11' });
  const put = h.calls[4];
  assert.equal(put.method, 'PUT'); assert.equal(put.type, 'application/zip'); assert.deepEqual(put.body, h.written.zip);
  const asrCall = h.execs[2];
  assert.equal(asrCall.cmd, 'F:\\venv\\Scripts\\python.exe');
  assert.deepEqual(asrCall.args.slice(0, 2), ['-B', path.join(ROOT, 'asr_tool.py')]);
  assert.deepEqual(asrCall.args.slice(-2), ['--profile', 'windowed-review']);
  assert.equal(asrCall.opts.cwd, ROOT); assert.equal(asrCall.opts.env.HF_HUB_OFFLINE, '1');
  // the audio went into a fresh folder under <workDir>/<video_id>/
  const audioDir = path.dirname(asrCall.args[asrCall.args.indexOf('--audio') + 1]);
  assert.equal(path.dirname(audioDir), path.join(h.workDir, ID)); assert.match(path.basename(audioDir), /^a1-\d{8}T\d{6}Z$/);
  // every step has a time limit
  assert.equal(h.execs[0].opts.timeoutMs, 2 * 60 * 1000);
  assert.equal(h.execs[1].opts.timeoutMs, 60 * 60 * 1000);
  assert.equal(asrCall.opts.timeoutMs, 4 * 60 * 60 * 1000);
});
test('a retried job never reuses an old folder (a stale ZIP cannot be uploaded)', async t => {
  const h = harness(t, { asrOutput: 'none' });
  // An earlier attempt left a complete ZIP in what used to be the fixed a1 folder.
  fs.mkdirSync(path.join(h.workDir, ID, 'a1'), { recursive: true });
  fs.writeFileSync(path.join(h.workDir, ID, 'a1', ID + '_ASR.zip'), 'old');
  assert.equal(await h.run(), 'stop');
  assert.ok(!h.calls.some(c => c.path.endsWith('/asr-zip')));
  assert.equal(h.calls.at(-1).body.code, 'ASR_FAILED');
});
test('runOnce idle when lease returns null', async t => {
  const h = harness(t, { lease: null });
  assert.equal(await h.run(), 'idle');
  assert.equal(h.calls.length, 1); assert.equal(h.execs.length, 0);
});
test('runOnce exit 3 → ASR_BUSY without attempt', async t => {
  const h = harness(t, { asr: { code: 3 }, asrOutput: 'none' });
  assert.equal(await h.run(), 'busy');
  const f = h.calls.at(-1);
  assert.match(f.path, /\/fail$/); assert.deepEqual(f.body, { code: 'ASR_BUSY', detail: null, retryable: true, countAttempt: false });
});
// A fault of the PC itself (yt-dlp outdated, CUDA broken) must not burn every job's attempts in one run:
// the run stops ('stop') and the next attempt comes with the next scheduled run.
test('runOnce ASR exit 1 → ASR_FAILED retryable with attempt, and the run stops', async t => {
  const h = harness(t, { asr: { code: 1 }, asrOutput: 'none' });
  assert.equal(await h.run(), 'stop');
  assert.deepEqual(h.calls.at(-1).body, { code: 'ASR_FAILED', detail: 'exit 1: boom', retryable: true, countAttempt: true });
});
test('runOnce partial → ASR_PARTIAL not retryable, nothing uploaded', async t => {
  const h = harness(t, { asrOutput: 'partial' });
  assert.equal(await h.run(), 'failed');
  assert.ok(!h.calls.some(c => c.path.endsWith('/asr-zip')));
  assert.deepEqual(h.calls.at(-1).body, { code: 'ASR_PARTIAL', detail: null, retryable: false, countAttempt: true });
});
test('runOnce age sign-in → this video is not retryable, the run goes on', async t => {
  const h = harness(t, { ytMeta: { code: 1, stdout: '', stderr: 'WARNING: x\nERROR: [youtube] ' + ID + ': Sign in to confirm your age. This video may be inappropriate for some users.' } });
  assert.equal(await h.run(), 'failed');
  const f = h.calls.at(-1);
  assert.equal(f.body.code, 'YOUTUBE_SIGN_IN'); assert.equal(f.body.retryable, false);
  assert.match(f.body.detail, /Sign in to confirm your age/);
  assert.equal(h.execs.length, 1);
});
test('runOnce bot check blocks the PC, not the video: no attempt counted, the run stops', async t => {
  const h = harness(t, { ytMeta: { code: 1, stdout: '', stderr: 'ERROR: [youtube] ' + ID + ': Sign in to confirm you’re not a bot. Use --cookies…' } });
  assert.equal(await h.run(), 'stop');
  const f = h.calls.at(-1);
  assert.equal(f.body.code, 'YOUTUBE_BLOCKED'); assert.equal(f.body.retryable, true); assert.equal(f.body.countAttempt, false);
});
test('runOnce yt-dlp cannot start → TOOL_MISSING, no attempt counted, the run stops', async t => {
  const h = harness(t, { ytMeta: { code: -1, stdout: '', stderr: '\nspawn yt-dlp ENOENT' } });
  assert.equal(await h.run(), 'stop');
  assert.deepEqual(h.calls.at(-1).body, { code: 'TOOL_MISSING', detail: 'spawn yt-dlp ENOENT', retryable: true, countAttempt: false });
});
test('runOnce a live or upcoming stream is refused before downloading', async t => {
  for (const meta of [{ is_live: true }, { live_status: 'is_upcoming' }]) {
    const h = harness(t, { ytMeta: { code: 0, stdout: JSON.stringify({ title: 'Live', ...meta }), stderr: '' } });
    assert.equal(await h.run(), 'failed');
    assert.equal(h.calls.at(-1).body.code, 'YOUTUBE_LIVE'); assert.equal(h.calls.at(-1).body.retryable, false);
    assert.equal(h.execs.length, 1, 'no download');
  }
});
test('runOnce a timed-out step is a retryable failure that stops the run', async t => {
  const h = harness(t, { ytDl: { code: -2, stdout: '', stderr: '', timedOut: true } });
  assert.equal(await h.run(), 'stop');
  assert.deepEqual(h.calls.at(-1).body, { code: 'ACQUIRE_FAILED', detail: 'timeout', retryable: true, countAttempt: true });
});
test('runOnce download error is retryable ACQUIRE_FAILED with last stderr line, and the run stops', async t => {
  const h = harness(t, { ytDl: { code: 1, stdout: '', stderr: 'line1\nERROR: unable to download: HTTP Error 503' } });
  assert.equal(await h.run(), 'stop');
  assert.deepEqual(h.calls.at(-1).body, { code: 'ACQUIRE_FAILED', detail: 'ERROR: unable to download: HTTP Error 503', retryable: true, countAttempt: true });
});
test('runOnce server refuses the zip → UPLOAD_REJECTED', async t => {
  const h = harness(t, { putStatus: 400 });
  assert.equal(await h.run(), 'failed');
  assert.deepEqual(h.calls.at(-1).body, { code: 'UPLOAD_REJECTED', detail: 'MEDIA_ASR_ZIP_INVALID', retryable: false, countAttempt: true });
});

test('runOnce stops before the download when the server closed the job at the meta step (dot pick over 2 hours)', async t => {
  const h = harness(t, { metaStepJob: { status: 'failed_acquire', error_code: 'MEDIA_TOO_LONG' }, ytMeta: { code: 0, stdout: JSON.stringify({ title: 'ארוך', duration: 9000 }), stderr: '' } });
  assert.equal(await h.run(), 'failed');
  assert.equal(h.execs.length, 1, 'no download');
  assert.ok(!h.calls.some(c => c.path.endsWith('/fail')), 'the server already closed it');
});
