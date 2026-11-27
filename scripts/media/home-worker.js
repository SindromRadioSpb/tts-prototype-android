#!/usr/bin/env node
'use strict';
// The home PC worker of the Mediatheque video queue (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.3).
// Takes jobs one by one until the queue is empty: yt-dlp downloads the audio only, the ASR tool runs on the GPU
// (windowed-review), the ASR ZIP goes to the server. The audio stays in --work for 14 days; yt-dlp updates itself daily.
//   node scripts/media/home-worker.js --push https://linguistpro.kolosei.com --key-file <file with the lpr_ key>
//        --work F:\LinguistPro_MediaQueue --asr-root F:\datasets_models\LinguistPro_ASR_Tool [--max-jobs 20]
// The key is the same relay key as the news harvest («Сбор с ПК» in /news-editor.html).
const fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const { runOnce, maintain } = require('../../mediaqueue/homeWorkerCore');

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = m => console.log(stamp() + ' ' + m);

// → Promise<{ code, stdout, stderr, timedOut? }>; code -1 = the program could not start. The ASR tool's output
// is echoed to the log. On timeout the whole process tree is killed (python starts children of its own).
function exec(cmd, args, { cwd, env, echo = false, timeoutMs = 0 } = {}) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { cwd, env: env || process.env, windowsHide: true });
    let stdout = '', stderr = '', timedOut = false;
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => child.kill());
    }, timeoutMs) : null;
    const done = r => { if (timer) clearTimeout(timer); resolve(r); };
    child.stdout.on('data', b => { const s = b.toString('utf8'); stdout += s; if (echo) process.stdout.write(s); });
    child.stderr.on('data', b => { const s = b.toString('utf8'); stderr += s; if (echo) process.stdout.write(s); });
    child.on('error', e => done({ code: -1, stdout, stderr: stderr + '\n' + e.message }));
    child.on('close', code => done(timedOut ? { code: -2, stdout, stderr, timedOut: true } : { code: code == null ? -2 : code, stdout, stderr }));
  });
}

async function main() {
  const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const push = opt('--push'), keyFile = opt('--key-file'), work = opt('--work'), asrRoot = opt('--asr-root');
  if (!push || !keyFile || !work || !asrRoot) throw new Error('needs --push, --key-file, --work and --asr-root');
  const origin = new URL(push).origin;
  const key = fs.readFileSync(path.resolve(keyFile), 'utf8').trim();
  const workDir = path.resolve(work), maxJobs = Math.max(1, Number(opt('--max-jobs')) || 20);
  fs.mkdirSync(workDir, { recursive: true });
  // --yt-dlp: the full path of yt-dlp.exe (the installer resolves it; a .cmd/.ps1 shim cannot be spawned directly).
  const ytDlp = opt('--yt-dlp') || 'yt-dlp';
  const run = (cmd, a, o = {}) => exec(cmd, a, { ...o, echo: cmd !== ytDlp });
  // Stage M4: old audio goes (14 days), yt-dlp updates itself once a day; a failure here never stops the run.
  let ytdlpVersion = null;
  try { ({ ytdlpVersion } = await maintain({ workDir, exec: run, ytDlp, log })); }
  catch (e) { log('обслуживание ПК не удалось: ' + (e && e.message)); }
  let failed = 0;
  for (let i = 0; i < maxJobs; i++) {
    let r;
    try { r = await runOnce({ origin, key, workDir, asrRoot, exec: run, log, ytDlp, ytdlpVersion }); }
    catch (e) { log('ошибка связи с сервером: ' + (e && e.message)); failed++; break; }
    if (r === 'idle') { if (!i) log('очередь пуста'); break; }
    if (r === 'busy') { log('ASR занят другим запуском — задание вернулось в очередь'); break; }
    // A fault of the PC (or YouTube refusing this PC) is not the videos' fault: end the run, retry next time.
    if (r === 'stop') { failed++; log('сбой на стороне ПК или YouTube — запуск остановлен до следующего (через 10 минут)'); break; }
    if (r === 'failed') failed++;
  }
  if (failed) process.exitCode = 1;
}

main().catch(e => { log('остановлено: ' + (e && e.message)); process.exitCode = 1; });
