// SPIKE (throwaway) · limits & knobs of YouTube-URL input.
const fs = require('fs');
const ENV = fs.readFileSync('E:/projects/tts-prototype-android/.env', 'utf8');
for (const ln of ENV.split(/\r?\n/)) {
  const m = ln.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.GEMINI_API_KEY;
const AT = require('E:/projects/tts-prototype-android/public/js/asr-transcript.js');
const GL = 'https://generativelanguage.googleapis.com';
const PILOT = 'https://www.youtube.com/watch?v=eLYgTqNFn-s';

async function call({ model = 'gemini-flash-latest', url = PILOT, vm, mediaRes = 'MEDIA_RESOLUTION_LOW', label, prompt }) {
  const part = { file_data: { file_uri: url } };
  if (vm) part.video_metadata = vm;
  const gc = { temperature: 0 };
  if (mediaRes) gc.mediaResolution = mediaRes;
  const t0 = Date.now();
  let r, txt;
  try {
    r = await fetch(GL + '/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [part, { text: prompt || AT.ASR_PROMPT }] }], generationConfig: gc }),
    });
    txt = await r.text();
  } catch (e) { return { label, transportError: String(e.message), ms: Date.now() - t0 }; }
  const ms = Date.now() - t0;
  let data = null; try { data = JSON.parse(txt); } catch (_) {}
  if (!r.ok) return { label, ok: false, status: r.status, ms, error: txt.slice(0, 400) };
  const u = data.usageMetadata || {};
  const vid = (u.promptTokensDetails || []).find((d) => d.modality === 'VIDEO');
  const text = ((((data.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join('');
  let segs = null, lang = null;
  try {
    const j = JSON.parse(text.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim());
    segs = j.segments || []; lang = j.language;
  } catch (_) {}
  return {
    label, ok: true, status: 200, ms, vm: vm || null, mediaRes,
    videoTokens: vid && vid.tokenCount, totalPrompt: u.promptTokenCount, out: u.candidatesTokenCount,
    segCount: segs && segs.length, lang,
    first: segs && segs[0] && segs[0].start, last: segs && segs[segs.length - 1] && segs[segs.length - 1].start,
    segments: segs,
  };
}

(async () => {
  const which = process.argv[2];
  const out = [];
  if (which === 'knobs') {
    // A: fps knob accepted for YouTube? (cost lever: frames dominate LOW-res video tokens)
    out.push(await call({ label: 'clip600-720_fps0.2', vm: { start_offset: '600s', end_offset: '720s', fps: 0.2 } }));
    // B: baseline repeat of the same clip (stochastic stability)
    out.push(await call({ label: 'clip600-720_repeat', vm: { start_offset: '600s', end_offset: '720s' } }));
    // C: no mediaResolution (default MEDIUM) — cost reference
    out.push(await call({ label: 'clip600-720_defaultRes', vm: { start_offset: '600s', end_offset: '720s' }, mediaRes: null }));
  }
  if (which === 'errors') {
    // D: non-existent video id → what does the API say?
    out.push(await call({ label: 'bad-video-id', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' }));
    // E: non-YouTube https URL
    out.push(await call({ label: 'non-youtube-url', url: 'https://example.com/video.mp4' }));
    // F: youtu.be short form accepted?
    out.push(await call({ label: 'youtu.be-shortform', url: 'https://youtu.be/eLYgTqNFn-s', vm: { start_offset: '600s', end_offset: '660s' } }));
    // G: url with extra query params (list=, t=)
    out.push(await call({ label: 'url-with-params', url: PILOT + '&t=42s&list=PLxxxx', vm: { start_offset: '600s', end_offset: '660s' } }));
  }
  if (which === 'full2') {
    out.push(await call({ label: 'full-run-2' }));
  }
  fs.writeFileSync(__dirname + '/limits-' + which + '.json', JSON.stringify(out, null, 1));
  for (const o of out) {
    const c = Object.assign({}, o); delete c.segments;
    console.log(JSON.stringify(c));
  }
})();
