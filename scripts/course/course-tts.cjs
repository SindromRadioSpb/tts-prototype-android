'use strict';
// Offline: inventory <courseSrcDir> [--lesson id] [--out report.json]
//          [--audio-dir .tmp/course-tts] (the directory checked for MP3s).
// Paid:    bake <courseSrcDir> [--lesson id] [--out .tmp/course-tts]
//          [--concurrency 2] [--ceiling 50000]. Credentials: operator env only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Speech = require('../../public/js/course-speech.js');
const { computeAssetKey } = require('../../db/premium/ttsAssetKey.js');
const { validateCourseDir } = require('./validate-course.cjs');
const PROFILE_ID = 'course-he-wavenet-v1';
const MAX_CHARS = 50000;
const DEFAULT_OUT = '.tmp/course-tts';
const keyFor = item => computeAssetKey({ assetType: 'row', ttsProfile: Speech.profileFor(item.voiceName), text: item.text });
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

function haveFile(outDir, key) {
  const stat = fs.lstatSync(path.join(outDir, key + '.mp3'), { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error('Audio asset must be a regular file: ' + key);
  return !!stat && stat.size > 0;
}

function checkedItems(items) {
  if (!Array.isArray(items)) throw new Error('Expected speech items');
  for (const item of items) {
    if (!item || typeof item.ref !== 'string' || !item.ref || typeof item.text !== 'string' || !item.text.trim()) {
      throw new Error('Each item needs ref and nonempty text');
    }
  }
  const issues = Speech.checkItems(items);
  if (issues.length) throw new Error(issues.map(i => i.code + ' ' + i.ref).join('\n'));
  return items.map(item => {
    const assetKey = keyFor(item);
    if (item.assetKey !== undefined && item.assetKey !== assetKey) throw new Error('Asset key does not match text/voice: ' + item.ref);
    return { ...item, assetKey, chars: [...item.text].length, bytes: Buffer.byteLength(item.text, 'utf8') };
  });
}

function inventory(srcDir, { lesson, outDir = DEFAULT_OUT } = {}) {
  const issues = validateCourseDir(srcDir);
  if (issues.some(i => i.level === 'error')) throw new Error(issues.map(i => i.code + ' ' + i.message).join('\n'));
  const course = readJson(path.join(srcDir, 'course.json'));
  if (lesson !== undefined && !course.lessons.includes(lesson)) throw new Error('Unknown lesson: ' + lesson);
  const items = checkedItems(course.lessons.filter(id => lesson === undefined || id === lesson).flatMap(id => {
    const source = readJson(path.join(srcDir, 'lessons', id + '.json'));
    const rows = [...(source.scene?.turns || []), ...(source.text?.paras || [])];
    return Speech.speechItems(source).map((item, index) => ({ ...item, plain: rows[index].he.plain }));
  })).map(item => ({ ...item, haveFile: haveFile(outDir, item.assetKey) }));
  return { profileId: PROFILE_ID, items, totals: {
    chars: items.reduce((n, item) => n + item.chars, 0),
    missingChars: items.reduce((n, item) => n + (item.haveFile ? 0 : item.chars), 0)
  } };
}

function atomicWrite(filename, data) {
  const part = filename + '.' + crypto.randomUUID() + '.part';
  try {
    fs.writeFileSync(part, data, { flag: 'wx' });
    fs.renameSync(part, filename);
  } finally {
    fs.rmSync(part, { force: true });
  }
}

async function bakeItems(items, { client, outDir = DEFAULT_OUT, ceiling = MAX_CHARS, concurrency = 2 } = {}) {
  if (!Number.isInteger(ceiling) || ceiling < 0 || ceiling > MAX_CHARS) throw new Error('ceiling must be 0..50000');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('concurrency must be 1..32');
  const checked = checkedItems(items);
  // Charge the actual unique missing requests, recomputing rather than trusting inventory metadata.
  const unique = [...new Map(checked.map(item => [item.assetKey, item])).values()];
  const pending = unique.filter(item => !haveFile(outDir, item.assetKey));
  if (pending.reduce((n, item) => n + item.chars, 0) > ceiling) throw new Error('Missing text exceeds ceiling');
  if (!client || typeof client.synthesizeSpeech !== 'function') throw new Error('TTS client required');
  fs.mkdirSync(outDir, { recursive: true });
  const logFile = path.join(outDir, 'bake-log.json');
  const log = fs.existsSync(logFile) ? readJson(logFile) : [];
  if (!Array.isArray(log)) throw new Error('Invalid bake-log.json');
  const record = (item, audio) => ({ ref: item.ref, key: item.assetKey, voice: item.voiceName,
    bytes: audio.length, sha256: crypto.createHash('sha256').update(audio).digest('hex') });
  // A process may stop between committing the MP3 and committing the journal.
  let recovered = false;
  for (const item of unique) {
    if (haveFile(outDir, item.assetKey) && !log.some(entry => entry.key === item.assetKey)) {
      log.push(record(item, fs.readFileSync(path.join(outDir, item.assetKey + '.mp3'))));
      recovered = true;
    }
  }
  if (recovered) atomicWrite(logFile, JSON.stringify(log, null, 2) + '\n');
  const result = { made: 0, skipped: checked.length - pending.length, failed: 0 };
  let next = 0;
  async function worker() {
    while (next < pending.length) {
      const item = pending[next++];
      let response;
      try {
        [response] = await client.synthesizeSpeech({
          input: { text: item.text },
          voice: { languageCode: 'he-IL', name: item.voiceName },
          audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000, speakingRate: 1, pitch: 0 }
        });
        const audio = typeof response?.audioContent === 'string'
          ? Buffer.from(response.audioContent, 'base64') : Buffer.from(response?.audioContent || []);
        if (!audio.length) throw new Error('Empty audio');
        atomicWrite(path.join(outDir, item.assetKey + '.mp3'), audio);
        log.push(record(item, audio));
        atomicWrite(logFile, JSON.stringify(log, null, 2) + '\n');
        result.made++;
      } catch {
        // Never print provider errors: they can include credential/request details.
        result.failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
  return result;
}

function buildListeningSheet(lessonId, items, asr = []) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rows = items.map(item => {
    const check = asr.find(entry => entry.key === item.assetKey && entry.ref === item.ref);
    return `<article data-ref="${esc(item.ref)}" data-key="${esc(item.assetKey)}">
<h2>${esc(item.ref)}</h2><p lang="he" dir="rtl">${esc(item.text)}</p>
<audio controls preload="none" src="${esc(item.assetKey)}.mp3"></audio>
<p>ASR: ${check ? esc(check.asr) : 'Не проверено'}</p>
<label>Оценка <select><option value="UNREVIEWED" selected>Ещё не прослушано</option><option value="ok">Годится</option><option value="bad">Проблема</option></select></label>
<label>Заметка <textarea></textarea></label></article>`;
  }).join('\n');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Прослушивание: ${esc(lessonId)}</title>
<style>body{font:18px system-ui;max-width:850px;margin:2rem auto;padding:0 1rem}article{border-top:1px solid #aaa;padding:1rem 0}p[lang=he]{font-size:1.7rem}label{display:block;margin:.7rem 0}textarea{display:block;width:95%}audio{width:100%}</style></head>
<body data-lesson-id="${esc(lessonId)}"><h1>Прослушивание: ${esc(lessonId)}</h1><p>Прослушайте каждую запись и выберите «Годится» или «Проблема». Непрослушанные записи не попадут в отметки. ASR служит только для диагностики.</p>${rows}
<button onclick="downloadMarks()">Скачать отметки</button><script>
function downloadMarks() {
  const items = Object.create(null);
  document.querySelectorAll('[data-ref]').forEach(row => {
    const status = row.querySelector('select').value;
    if (status === 'ok' || status === 'bad') items[row.dataset.ref] = { key: row.dataset.key, status, note: row.querySelector('textarea').value };
  });
  const lessonId = document.body.dataset.lessonId;
  const blob = new Blob([JSON.stringify({ lessonId, reviewedAt: new Date().toISOString(), items }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'listen-' + lessonId + '-marks.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
</script></body></html>`;
}

async function main(args) {
  const [command, srcDir, ...rest] = args;
  if (!['inventory', 'bake', 'sheet'].includes(command) || !srcDir || srcDir.startsWith('--')) throw new Error('Usage: course-tts.cjs inventory|bake|sheet <courseSrcDir> [options]');
  const allowed = command === 'inventory' ? ['--lesson', '--out', '--audio-dir'] : command === 'sheet' ? ['--lesson', '--out'] : ['--lesson', '--out', '--concurrency', '--ceiling'];
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i], value = rest[i + 1];
    if (!allowed.includes(name) || Object.hasOwn(options, name) || !value || value.startsWith('--')) throw new Error('Invalid option: ' + name);
    options[name] = value;
  }
  const outDir = (command === 'inventory' ? options['--audio-dir'] : options['--out']) || DEFAULT_OUT;
  if (command === 'sheet' && !options['--lesson']) throw new Error('sheet requires --lesson');
  const report = inventory(srcDir, { lesson: options['--lesson'], outDir });
  if (command === 'sheet') {
    const asrFile = path.join(outDir, 'asr-check.json');
    const asr = fs.existsSync(asrFile) ? readJson(asrFile) : [];
    if (!Array.isArray(asr)) throw new Error('Invalid asr-check.json: expected an array');
    fs.mkdirSync(outDir, { recursive: true });
    atomicWrite(path.join(outDir, 'listen-' + options['--lesson'] + '.html'), buildListeningSheet(options['--lesson'], report.items, asr));
    return;
  }
  if (command === 'inventory') {
    const json = JSON.stringify(report, null, 2) + '\n';
    if (options['--out']) atomicWrite(options['--out'], json);
    else process.stdout.write(json);
    return;
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS explicitly in the operator environment');
  // No dotenv, repository secrets or ambient credential fallback.
  const client = new (require('@google-cloud/text-to-speech').TextToSpeechClient)({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
  const result = await bakeItems(report.items, { client, outDir,
    ceiling: options['--ceiling'] === undefined ? MAX_CHARS : Number(options['--ceiling']),
    concurrency: options['--concurrency'] === undefined ? 2 : Number(options['--concurrency']) });
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
}

module.exports = { PROFILE_ID, inventory, bakeItems, buildListeningSheet };
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
