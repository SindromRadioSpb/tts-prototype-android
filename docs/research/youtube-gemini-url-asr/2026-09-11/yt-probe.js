// SPIKE (throwaway): does Gemini accept a YouTube URL as ASR input, and how honest are timestamps?
const fs = require('fs');
const ENV = fs.readFileSync('E:/projects/tts-prototype-android/.env', 'utf8');
for (const ln of ENV.split(/\r?\n/)) {
  const m = ln.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.GEMINI_API_KEY;
const AT = require('E:/projects/tts-prototype-android/public/js/asr-transcript.js');
const GL = 'https://generativelanguage.googleapis.com';
const URL_YT = process.env.PROBE_YT || 'https://www.youtube.com/watch?v=eLYgTqNFn-s';

async function call({ model, prompt, videoMetadata, label }) {
  const filePart = { file_data: { file_uri: URL_YT } };
  if (videoMetadata) filePart.video_metadata = videoMetadata;
  const body = {
    contents: [{ role: 'user', parts: [filePart, { text: prompt }] }],
    generationConfig: { temperature: 0, mediaResolution: 'MEDIA_RESOLUTION_LOW' },
  };
  const t0 = Date.now();
  let r, txt;
  try {
    r = await fetch(GL + '/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    txt = await r.text();
  } catch (e) {
    return { label, model, ok: false, transportError: String(e && e.message), ms: Date.now() - t0 };
  }
  const ms = Date.now() - t0;
  let data = null;
  try { data = JSON.parse(txt); } catch (_) {}
  const out = { label, model, ok: r.ok, status: r.status, ms, videoMetadata: videoMetadata || null };
  if (!r.ok) { out.error = txt.slice(0, 1500); return out; }
  out.usage = data.usageMetadata;
  out.finishReason = (data.candidates || [])[0] && (data.candidates || [])[0].finishReason;
  const cand = (data.candidates || [])[0] || {};
  const text = (((cand.content || {}).parts) || []).map(p => p.text || '').join('');
  out.rawLen = text.length;
  out.rawHead = text.slice(0, 400);
  out.rawTail = text.slice(-200);
  try {
    const j = JSON.parse(text.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim());
    out.language = j.language;
    out.warnings = j.warnings;
    out.segCount = (j.segments || []).length;
    out.segments = j.segments;
  } catch (e) { out.parseError = String(e.message); }
  return out;
}

(async () => {
  const which = process.argv[2] || 'all';
  const model = process.argv[3] || 'gemini-flash-latest';
  const outPath = process.argv[4] || 'probe-out.json';
  const results = [];
  if (which === 'full' || which === 'all') {
    results.push(await call({ model, prompt: AT.ASR_PROMPT, label: 'full-video-single-call' }));
  }
  if (which === 'clip' || which === 'all') {
    results.push(await call({
      model, prompt: AT.ASR_PROMPT, label: 'clip-600-720',
      videoMetadata: { start_offset: '600s', end_offset: '720s' },
    }));
  }
  if (which === 'clip2') {
    results.push(await call({
      model, prompt: AT.ASR_PROMPT, label: 'clip-1200-1320',
      videoMetadata: { start_offset: '1200s', end_offset: '1320s' },
    }));
  }
  fs.writeFileSync(outPath, JSON.stringify(results, null, 1));
  for (const r of results) {
    const segs = r.segments || [];
    console.log(JSON.stringify({
      label: r.label, ok: r.ok, status: r.status, ms: r.ms, finishReason: r.finishReason,
      usage: r.usage, segCount: r.segCount, language: r.language, warnings: r.warnings,
      parseError: r.parseError, transportError: r.transportError,
      error: r.error ? r.error.slice(0, 600) : undefined,
      firstStart: segs[0] && segs[0].start,
      lastStart: segs[segs.length - 1] && segs[segs.length - 1].start,
      rawHead: r.rawHead,
    }, null, 1));
  }
})();
