// SPIKE (throwaway) · Independent oracle for the YouTube-URL ASR timeline.
// Ground truth = OUR OWN deterministic ffmpeg cut at a known absolute offset, uploaded as a
// standalone file (Gemini cannot know where it came from) → its text at relative t must appear in
// the YouTube-URL run at absolute offset+t. Measures real timestamp error in seconds.
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');

const ENV = fs.readFileSync('E:/projects/tts-prototype-android/.env', 'utf8');
for (const ln of ENV.split(/\r?\n/)) {
  const m = ln.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.GEMINI_API_KEY;
const AT = require('E:/projects/tts-prototype-android/public/js/asr-transcript.js');
const GL = 'https://generativelanguage.googleapis.com';
const SP = __dirname;
const SRC = path.join(SP, 'pilot.m4a');
const MODEL = process.env.PROBE_MODEL || 'gemini-flash-latest';

const norm = (s) => AT.stitchNormalizeWords(String(s || '')).join(' ');

async function uploadAndTranscribe(buf, mime, label) {
  const start = await fetch(GL + '/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'x-goog-api-key': KEY,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buf.length),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: label } }),
  });
  if (!start.ok) throw new Error('upload start ' + start.status + ' ' + (await start.text()).slice(0, 300));
  const uploadUrl = start.headers.get('x-goog-upload-url');
  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0' },
    body: buf,
  });
  if (!up.ok) throw new Error('upload ' + up.status + ' ' + (await up.text()).slice(0, 300));
  const file = (await up.json()).file || {};
  for (let i = 0; i < 40; i++) {
    const g = await fetch(GL + '/v1beta/' + file.name, { headers: { 'x-goog-api-key': KEY } });
    const st = (await g.json()).state;
    if (st === 'ACTIVE') break;
    if (st === 'FAILED') throw new Error('file FAILED');
    await new Promise((r) => setTimeout(r, 1500));
  }
  const r = await fetch(GL + '/v1beta/models/' + MODEL + ':generateContent', {
    method: 'POST',
    headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [
        { file_data: { file_uri: file.uri, mime_type: mime } },
        { text: AT.ASR_PROMPT },
      ] }],
      generationConfig: { temperature: 0 },
    }),
  });
  if (!r.ok) throw new Error('asr ' + r.status + ' ' + (await r.text()).slice(0, 400));
  const data = await r.json();
  const text = ((((data.candidates || [])[0] || {}).content || {}).parts || [])
    .map((p) => p.text || '').join('');
  const j = JSON.parse(text.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim());
  return { segments: j.segments || [], usage: data.usageMetadata };
}

// Find where the local phrase occurs in the YouTube-run timeline (by word shingle match).
function locateInTimeline(timeline, phraseWords, k) {
  const need = phraseWords.slice(0, k).join(' ');
  if (phraseWords.length < k) return null;
  let best = null;
  for (const seg of timeline) {
    const w = AT.stitchNormalizeWords(seg.text);
    for (let i = 0; i + k <= w.length; i++) {
      if (w.slice(i, i + k).join(' ') === need) {
        // approximate the in-segment position: linear by word index over segment word count
        const frac = w.length ? i / w.length : 0;
        best = { segStart: seg.abs, wordFrac: frac, segWords: w.length };
        break;
      }
    }
    if (best) break;
  }
  return best;
}

(async () => {
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', SRC]).toString().trim());
  const ytRun = JSON.parse(fs.readFileSync(path.join(SP, 'probe-full.json'), 'utf8'))[0];
  const timeline = (ytRun.segments || []).map((s) => ({
    abs: AT.secondsFromTimestamp(s.start), text: s.text,
  })).filter((s) => s.abs != null);

  const offsets = (process.env.PROBE_OFFSETS || '180,480,780,1080,1380').split(',').map(Number);
  const WIN = Number(process.env.PROBE_WIN || 90);
  const report = { source: SRC, durationSec: dur, model: MODEL, ytSegments: timeline.length, probes: [] };

  for (const off of offsets) {
    const cut = path.join(SP, 'cut-' + off + '.mp3');
    if (!fs.existsSync(cut)) {
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(off),
        '-t', String(WIN), '-i', SRC, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', cut]);
    }
    const buf = fs.readFileSync(cut);
    let local;
    try {
      local = await uploadAndTranscribe(buf, 'audio/mpeg', 'oracle-cut-' + off);
    } catch (e) {
      report.probes.push({ offset: off, error: String(e.message) });
      continue;
    }
    const matches = [];
    for (const seg of local.segments) {
      const rel = AT.secondsFromTimestamp(seg.start);
      if (rel == null) continue;
      const words = AT.stitchNormalizeWords(seg.text);
      const hit = locateInTimeline(timeline, words, 5) || locateInTimeline(timeline, words, 4);
      if (!hit) continue;
      const expectedAbs = off + rel;
      matches.push({
        rel, expectedAbs, ytAbs: hit.segStart,
        errorSec: Math.round((hit.segStart - expectedAbs) * 10) / 10,
        text: seg.text.slice(0, 60),
      });
    }
    const errs = matches.map((m) => m.errorSec).sort((a, b) => a - b);
    report.probes.push({
      offset: off, windowSec: WIN,
      localSegments: local.segments.length,
      matched: matches.length,
      matchRate: local.segments.length ? +(matches.length / local.segments.length).toFixed(2) : 0,
      medianErrorSec: errs.length ? errs[Math.floor(errs.length / 2)] : null,
      minErrorSec: errs[0] ?? null, maxErrorSec: errs[errs.length - 1] ?? null,
      matches,
    });
    console.log('probe ' + off + 's:', JSON.stringify({
      localSegments: local.segments.length, matched: matches.length,
      medianErrorSec: errs.length ? errs[Math.floor(errs.length / 2)] : null,
      range: errs.length ? [errs[0], errs[errs.length - 1]] : null,
    }));
  }
  fs.writeFileSync(path.join(SP, 'oracle-report.json'), JSON.stringify(report, null, 1));
  console.log('\nwrote oracle-report.json');
})();
