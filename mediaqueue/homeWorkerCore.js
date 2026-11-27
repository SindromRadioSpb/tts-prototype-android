'use strict';
// The owner's home PC worker for the Mediatheque video queue (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.3).
// One run: lease one job with the relay key → yt-dlp downloads the audio only → the unchanged ASR tool
// (asr_tool.py --profile windowed-review, CUDA) → the ASR ZIP goes to the server. The audio stays on the PC.
// yt-dlp flags are fixed here: no browser cookies, no playlists, no proxies. A refusal by YouTube is reported, never worked around.
const fs = require('node:fs'), path = require('node:path');

const W = path.win32;
const API = '/api/media-queue/worker';

// Exactly the variables ASR_WINDOWED_REVIEW.cmd sets (%~dp0 ends with a backslash).
function asrEnv(asrRoot, baseEnv = process.env) {
  const r = W.join(asrRoot, W.sep), c = W.join(r, 'runtime', 'cache');
  return { ...baseEnv, LINGUIST_ASR_ROOT: r, TEMP: W.join(r, 'runtime', 'tmp'), TMP: W.join(r, 'runtime', 'tmp'),
    HF_HOME: W.join(c, 'hf'), HUGGINGFACE_HUB_CACHE: W.join(c, 'hf', 'hub'), TORCH_HOME: W.join(c, 'torch'), PIP_CACHE_DIR: W.join(c, 'pip'),
    XDG_CACHE_HOME: c, UV_CACHE_DIR: W.join(c, 'uv'), PYTHONPYCACHEPREFIX: W.join(c, 'pycache'), CUDA_CACHE_PATH: W.join(c, 'cuda'),
    HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' };
}
function asrPython(asrRoot, readFile = f => fs.readFileSync(f, 'utf8')) {
  const cfg = JSON.parse(readFile(W.join(asrRoot, 'local_config.json')));
  if (!cfg || !cfg.venv) throw new Error('local_config.json has no venv');
  return W.join(cfg.venv, 'Scripts', 'python.exe');
}
const ytDlpArgs = {
  meta: url => ['-J', '--no-playlist', '--no-warnings', url],
  download: (url, outDir) => ['-f', 'bestaudio[ext=m4a]/bestaudio', '--no-playlist', '--no-progress', '--restrict-filenames',
    '-o', path.join(outDir, '%(id)s.%(ext)s'), '--print', 'after_move:filepath', url],
};
// stop:true — the fault is the PC's or YouTube's towards this PC, not this video's: the run ends so one broken
// yt-dlp or a bot check never burns the attempts of every queued video in a few seconds.
function classifyYtDlpError(stderr) {
  const s = String(stderr || '');
  if (/not a bot/i.test(s)) return { code: 'YOUTUBE_BLOCKED', retryable: true, countAttempt: false, stop: true };
  if (/Sign in to confirm/i.test(s)) return { code: 'YOUTUBE_SIGN_IN', retryable: false };
  if (/Private video/i.test(s)) return { code: 'YOUTUBE_PRIVATE', retryable: false };
  if (/video (is )?unavailable/i.test(s)) return { code: 'YOUTUBE_UNAVAILABLE', retryable: false };
  return { code: 'ACQUIRE_FAILED', retryable: true, stop: true };
}
// Every external step has a time limit (a hung yt-dlp would hold the PC until the task's 6-hour kill).
const TIMEOUTS = { update: 5 * 60 * 1000, meta: 2 * 60 * 1000, download: 60 * 60 * 1000, asr: 4 * 60 * 60 * 1000, http: 60 * 1000, upload: 5 * 60 * 1000 };
const folderStamp = (ms = Date.now()) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const lastLine = s => String(s || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).pop() || null;
const clip = (s, n = 300) => s == null ? null : String(s).slice(0, n);

// ---- stage M4: the PC looks after itself ----
// The audio stays 14 days for a repeat ASR, then goes (spec §5.3). yt-dlp is checked for a new release once a day
// and right after YouTube answered 403 (lesson 2026-11-27: an old yt-dlp got 403 until it was updated).
const AUDIO_KEEP_MS = 14 * 24 * 3600 * 1000;
const UPDATE_EVERY_MS = 24 * 3600 * 1000;
const UPDATE_MARK = '.yt-dlp-update.json';
const VIDEO_DIR = /^[A-Za-z0-9_-]{11}$/;
const ATTEMPT_DIR = /^a\d+-(\d{8})T(\d{6})Z$/;
const FINISHED_AUDIO = /\.(m4a|webm|opus|mp3|ogg|aac|wav|flac|mp4)$/i;
const WINGET_UPGRADE = ['upgrade', '--id', 'yt-dlp.yt-dlp', '-e', '--silent', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity'];
// a3-20261127T080000Z → its time in ms, or null for a folder this worker did not make.
function attemptTime(name) {
  const m = ATTEMPT_DIR.exec(name); if (!m) return null;
  const [d, t] = [m[1], m[2]];
  return Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`);
}
const listDir = d => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return []; } };
// → the attempt folders removed. Only <video id>/a<N>-<stamp> folders older than 14 days; anything else in --work stays.
function pruneAudio(workDir, now = Date.now()) {
  const removed = [];
  for (const v of listDir(workDir)) {
    if (!v.isDirectory() || !VIDEO_DIR.test(v.name)) continue;
    const vdir = path.join(workDir, v.name);
    for (const a of listDir(vdir)) {
      const at = a.isDirectory() ? attemptTime(a.name) : null;
      if (at == null || now - at <= AUDIO_KEEP_MS) continue;
      fs.rmSync(path.join(vdir, a.name), { recursive: true, force: true });
      removed.push(path.join(vdir, a.name));
    }
    if (!listDir(vdir).length) { try { fs.rmdirSync(vdir); } catch (_) {} }
  }
  return removed;
}
// → the newest finished audio of this video kept from an earlier attempt (yt-dlp names it <id>.<ext> only once complete).
function findCachedAudio(workDir, videoId, now = Date.now()) {
  const vdir = path.join(workDir, videoId);
  const attempts = listDir(vdir).filter(a => a.isDirectory()).map(a => ({ name: a.name, at: attemptTime(a.name) }))
    .filter(a => a.at != null && now - a.at <= AUDIO_KEEP_MS).sort((x, y) => y.at - x.at);
  for (const a of attempts) {
    const file = listDir(path.join(vdir, a.name)).find(e => e.isFile() && e.name.startsWith(videoId + '.') && FINISHED_AUDIO.test(e.name));
    if (file) return path.join(vdir, a.name, file.name);
  }
  return null;
}
const forgetUpdate = workDir => { try { fs.unlinkSync(path.join(workDir, UPDATE_MARK)); } catch (_) {} };
// Before a run: old audio goes, yt-dlp is updated if a day has passed. Nothing here stops the run.
async function maintain({ workDir, exec, ytDlp = 'yt-dlp', now = Date.now, log = () => {} }) {
  const removed = pruneAudio(workDir, now());
  if (removed.length) log(`удалён звук старше 14 дней: ${removed.length}`);
  const markFile = path.join(workDir, UPDATE_MARK);
  let last = 0; try { last = Date.parse(JSON.parse(fs.readFileSync(markFile, 'utf8')).checked_at) || 0; } catch (_) {}
  let updated = null;
  if (now() - last >= UPDATE_EVERY_MS) {
    const u = await exec(ytDlp, ['-U'], { timeoutMs: TIMEOUTS.update });
    updated = u.code === 0;
    if (!updated) {
      // An install that cannot update itself is updated by winget (the way it was installed).
      const w = await exec('winget', WINGET_UPGRADE, { timeoutMs: TIMEOUTS.update });
      // winget says «no newer package» with its own non-zero code: that is not a failure.
      updated = w.code === 0 || /No (available upgrade|newer package)/i.test(w.stdout || '');
      if (!updated) log('yt-dlp не обновился: ' + (lastLine(u.stderr) || 'код ' + u.code) + ' / winget: ' + (lastLine(w.stderr) || lastLine(w.stdout) || 'код ' + w.code));
    }
    fs.writeFileSync(markFile, JSON.stringify({ checked_at: new Date(now()).toISOString(), ok: updated }));
  }
  const v = await exec(ytDlp, ['--version'], { timeoutMs: TIMEOUTS.meta });
  const ytdlpVersion = v.code === 0 ? clip(lastLine(v.stdout), 40) : null;
  if (updated != null) log('yt-dlp ' + (ytdlpVersion || '?') + (updated ? ' (проверено обновление)' : ''));
  return { ytdlpVersion, updated, removed };
}

// The ASR tool writes <stem>_ASR.zip (or _ASR_2.zip …) next to the audio; _partial.zip is not a result.
function findAsrZip(dir, stem, readdir = d => fs.readdirSync(d)) {
  let names; try { names = readdir(dir); } catch (_) { return null; }
  const mine = names.filter(n => n.startsWith(stem + '_ASR') && n.toLowerCase().endsWith('.zip'));
  const full = mine.filter(n => !/_partial\.zip$/i.test(n)).sort();
  if (full.length) return { zip: path.join(dir, full[full.length - 1]) };
  return mine.length ? { partial: true } : null;
}

// → 'idle' | 'done' | 'failed' (this video failed; go on) | 'busy' | 'stop' (the PC or YouTube-to-this-PC is at fault; end the run)
// exec(cmd, args, { cwd, env, timeoutMs }) → { code, stdout, stderr, timedOut? }; code -1 = the program could not start.
async function runOnce({ origin, key, workDir, asrRoot, exec, fetch = globalThis.fetch, log = () => {}, readFile, heartbeatMs = 120000, ytDlp = 'yt-dlp', now = Date.now, ytdlpVersion = null }) {
  const headers = { authorization: 'Bearer ' + key };
  async function post(p, body) {
    const r = await fetch(origin + API + p, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(TIMEOUTS.http) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.ok !== true) throw new Error('server ' + r.status + ' ' + (j && j.error || ''));
    return j;
  }
  const { job } = await post('/lease', { ytdlp_version: ytdlpVersion });
  if (!job) return 'idle';
  const id = job.job_id;
  const step = (status, extra = {}) => post('/jobs/' + id + '/step', { status, ...extra });
  const failWith = async (code, detail, retryable, countAttempt = true) => {
    log(`${job.video_id}: ${code}${detail ? ' — ' + detail : ''}`);
    await post('/jobs/' + id + '/fail', { code, detail: detail == null ? null : clip(detail), retryable, countAttempt });
  };
  // A yt-dlp result that is not a success → the reported failure and what the run does next.
  async function ytFailed(r) {
    // YouTube refusing with 403 is what an outdated yt-dlp gets: the next run updates it first.
    if (/HTTP Error 403|403: Forbidden/i.test(r.stderr || '')) forgetUpdate(workDir);
    if (r.timedOut) { await failWith('ACQUIRE_FAILED', 'timeout', true); return 'stop'; }
    if (r.code === -1) { await failWith('TOOL_MISSING', lastLine(r.stderr), true, false); return 'stop'; }
    const c = classifyYtDlpError(r.stderr);
    await failWith(c.code, lastLine(r.stderr), c.retryable, c.countAttempt !== false);
    return c.stop ? 'stop' : 'failed';
  }
  log(`${job.video_id}: взято (${job.url})`);
  await step('acquiring');

  // 1. yt-dlp: metadata, then the audio only.
  const meta = await exec(ytDlp, ytDlpArgs.meta(job.url), { timeoutMs: TIMEOUTS.meta });
  if (meta.code !== 0 || meta.timedOut) return ytFailed(meta);
  let info = {}; try { info = JSON.parse(meta.stdout); } catch (_) {}
  // A live or upcoming stream never ends as a file: refuse it rather than hold the PC.
  if (info.is_live === true || info.live_status === 'is_live' || info.live_status === 'is_upcoming') { await failWith('YOUTUBE_LIVE', info.live_status || 'is_live', false); return 'failed'; }
  const dur = Number(info.duration);
  const metaStep = await step('acquiring', { meta: { title: info.title || null, duration_sec: Number.isFinite(dur) ? Math.round(dur) : null, channel_title: info.channel || info.uploader || null } });
  // The server may close the job on what the metadata showed (dot's pick over 2 hours): nothing is downloaded then.
  const st = metaStep && metaStep.job && metaStep.job.status;
  if (st && st !== 'acquiring') { log(`${job.video_id}: сервер закрыл задание (${metaStep.job.error_code || st})`); return 'failed'; }
  // A fresh folder per lease: the ASR tool never overwrites, so an old ZIP from an earlier attempt can never be picked up.
  const dir = path.join(workDir, job.video_id, 'a' + ((Number(job.attempts) || 0) + 1) + '-' + folderStamp(now()));
  fs.mkdirSync(dir, { recursive: true });
  // A retry of a video whose audio is still on the PC (14 days) runs ASR again without downloading.
  const cached = findCachedAudio(workDir, job.video_id, now());
  let audio;
  if (cached) {
    audio = path.join(dir, path.basename(cached));
    fs.copyFileSync(cached, audio);
    log(`${job.video_id}: звук уже на ПК — без скачивания`);
  } else {
    // A long download keeps the lease too.
    const dlBeat = heartbeatMs > 0 ? setInterval(() => { step('acquiring').catch(() => {}); }, heartbeatMs) : null;
    let dl;
    try { dl = await exec(ytDlp, ytDlpArgs.download(job.url, dir), { timeoutMs: TIMEOUTS.download }); }
    finally { if (dlBeat) clearInterval(dlBeat); }
    if (dl.code !== 0 || dl.timedOut) return ytFailed(dl);
    audio = lastLine(dl.stdout);
    if (!audio || !fs.existsSync(audio)) { await failWith('ACQUIRE_FAILED', 'no audio file', true); return 'stop'; }
  }

  // 2. ASR with the tool's own environment; a heartbeat keeps the lease while it runs.
  await step('asr');
  const python = asrPython(asrRoot, readFile);
  let beat = null;
  if (heartbeatMs > 0) beat = setInterval(() => { step('asr').catch(() => {}); }, heartbeatMs);
  let asr;
  try {
    asr = await exec(python, ['-B', path.join(asrRoot, 'asr_tool.py'), '--audio', audio, '--profile', 'windowed-review'], { cwd: asrRoot, env: asrEnv(asrRoot), timeoutMs: TIMEOUTS.asr });
  } finally { if (beat) clearInterval(beat); }
  if (asr.timedOut) { await failWith('ASR_FAILED', 'timeout', true); return 'stop'; }
  if (asr.code === -1) { await failWith('TOOL_MISSING', lastLine(asr.stderr), true, false); return 'stop'; }
  if (asr.code === 3) { await failWith('ASR_BUSY', null, true, false); return 'busy'; }
  if (asr.code !== 0) { await failWith('ASR_FAILED', 'exit ' + asr.code + (lastLine(asr.stderr) ? ': ' + lastLine(asr.stderr) : ''), true); return 'stop'; }
  const found = findAsrZip(dir, path.basename(audio, path.extname(audio)));
  if (!found) { await failWith('ASR_FAILED', 'no ASR zip', true); return 'stop'; }
  if (found.partial) { await failWith('ASR_PARTIAL', null, false); return 'failed'; }

  // 3. Hand in the ZIP (no audio inside: the tool leaves audio and PCM out).
  const bytes = fs.readFileSync(found.zip);
  const r = await fetch(origin + API + '/jobs/' + id + '/asr-zip', { method: 'PUT', headers: { ...headers, 'content-type': 'application/zip' }, body: bytes, signal: AbortSignal.timeout(TIMEOUTS.upload) });
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    await failWith('UPLOAD_REJECTED', j && j.error || 'HTTP ' + r.status, false);
    return 'failed';
  }
  log(`${job.video_id}: ASR готов (${bytes.length} байт)`);
  return 'done';
}

module.exports = { asrEnv, asrPython, ytDlpArgs, classifyYtDlpError, findAsrZip, runOnce, maintain, pruneAudio, findCachedAudio, AUDIO_KEEP_MS, UPDATE_EVERY_MS };
