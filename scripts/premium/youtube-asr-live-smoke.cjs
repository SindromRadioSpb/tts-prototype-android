'use strict';
// P5 · ЖИВОЙ гейт качества маршрута «Gemini ASR по ссылке YouTube». ПЛАТНЫЙ, запускается только
// владельцем вручную и только с явным потолком бюджета. Не входит ни в CI, ни в `npm test`.
//
// Что он меряет (R17: генератор меток не сертифицирует сам себя):
//   1. Покрытие — сколько речи попало в транскрипт и нет ли дыр по меткам.
//   2. Согласие ЯКОРЕЙ между двумя НЕЗАВИСИМЫМИ прогонами: один и тот же кусок звука
//      транскрибируется дважды разными вызовами, и совпадать обязаны АБСОЛЮТНЫЕ времена.
//   3. Собственный вердикт зонда, встроенного в маршрут.
// Ни один из трёх не спрашивает модель «хорошо ли ты справилась» — все считают от текста.
//
//   GEMINI_API_KEY=... node scripts/premium/youtube-asr-live-smoke.cjs \
//     --url=https://www.youtube.com/watch?v=<id> [--budget=1.00] [--out=<dir>] [--dry]
//
// --dry делает ТОЛЬКО бесплатный countTokens и печатает смету, ничего не оплачивая.
const fs = require('node:fs');
const path = require('node:path');
const Y = require('../../public/js/youtube-asr.js');
const AT = require('../../public/js/asr-transcript.js');

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith('--' + n + '=')); return h ? h.slice(n.length + 3) : d; };
const URL_IN = arg('url', '');
const BUDGET = Number(arg('budget', '1.00'));
const OUT = arg('out', '');
const DRY = process.argv.includes('--dry');
const KEY = process.env.GEMINI_API_KEY;

// Пороги — из измеренной базы 2026-09-11 (docs/research/youtube-gemini-url-asr/2026-09-11):
// медиана 0 с и P95 = 1 с между независимыми прогонами, ни одной дыры меток >25 с.
const MAX_MEDIAN_ERROR_SEC = 2;
const MAX_P95_ERROR_SEC = 5;
const MIN_ANCHORS = 8;
const MAX_MARK_GAP_SEC = AT.ASR_GAP_MAX_SEC;

function anchorAgreement(a, b) {
  const norm = AT.stitchNormalizeWords;
  const rows = b.map((s) => ({ t: s.startSec, w: norm(s.text) }));
  const errors = [];
  for (const seg of a) {
    const w = norm(seg.text);
    if (w.length < 5 || typeof seg.startSec !== 'number') continue;
    const need = w.slice(0, 5).join(' ');
    for (const row of rows) {
      let hit = false;
      for (let i = 0; i + 5 <= row.w.length; i++) if (row.w.slice(i, i + 5).join(' ') === need) { hit = true; break; }
      if (hit && typeof row.t === 'number') { errors.push(row.t - seg.startSec); break; }
    }
  }
  const abs = errors.map(Math.abs).sort((x, y) => x - y);
  const sorted = errors.slice().sort((x, y) => x - y);
  return { anchors: errors.length,
    medianErrorSec: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    p95AbsErrorSec: abs.length ? abs[Math.floor(abs.length * 0.95)] : null,
    maxAbsErrorSec: abs.length ? abs[abs.length - 1] : null };
}

function coverage(segments, durationSec) {
  const marks = segments.map((s) => s.startSec).filter((t) => typeof t === 'number');
  let maxGap = 0;
  for (let i = 1; i < marks.length; i++) maxGap = Math.max(maxGap, marks[i] - marks[i - 1]);
  const words = segments.reduce((sum, s) => sum + AT.stitchNormalizeWords(s.text).length, 0);
  return { segments: segments.length, words,
    wordsPerSec: durationSec ? +(words / durationSec).toFixed(2) : null,
    firstMarkSec: marks[0] == null ? null : marks[0],
    lastMarkSec: marks.length ? marks[marks.length - 1] : null,
    maxMarkGapSec: Math.round(maxGap),
    tailSilenceSec: durationSec && marks.length ? Math.round(durationSec - marks[marks.length - 1]) : null };
}

(async () => {
  if (!KEY) throw new Error('GEMINI_API_KEY_REQUIRED');
  const target = Y.canonicalize(URL_IN);
  if (!target) throw new Error('YT_URL_REJECTED: ' + URL_IN);
  const deps = { fetch: (u, i) => fetch(u, i), apiKey: KEY };

  const est = await Y.estimate(deps, target.url);
  // Два независимых прогона плюс встроенный зонд каждого: считаем потолок честно, до трат.
  const ceiling = est.estimatedUsd * 2 * 1.1;
  console.log(JSON.stringify({ stage: 'estimate', url: target.url, durationSec: est.durationSec,
    windows: est.windows, inputTokens: est.inputTokens, estimatedUsd: +est.estimatedUsd.toFixed(4),
    twoRunCeilingUsd: +ceiling.toFixed(4), budgetUsd: BUDGET }, null, 1));
  if (DRY) return;
  if (ceiling > BUDGET) throw new Error('BUDGET_EXCEEDED: raise --budget above ' + ceiling.toFixed(4));

  const runs = [];
  for (let i = 0; i < 2; i++) {
    const started = Date.now();
    const r = await Y.transcribe(deps, target.url, (phase, at) =>
      console.log(JSON.stringify({ stage: 'run' + (i + 1), phase, at })));
    runs.push(r);
    console.log(JSON.stringify({ stage: 'run' + (i + 1) + '-done', ms: Date.now() - started,
      segments: r.segments.length, attempts: r.attempts, timing: r.timing, blind: r.blind }));
  }

  const agree = anchorAgreement(runs[0].segments, runs[1].segments);
  const cov = runs.map((r) => coverage(r.segments, r.durationSec));
  const verdicts = [];
  const fail = (name, ok, detail) => { verdicts.push({ name, ok, detail }); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + ' — ' + JSON.stringify(detail)); };

  fail('independent runs agree on absolute time', agree.anchors >= MIN_ANCHORS &&
    Math.abs(agree.medianErrorSec) <= MAX_MEDIAN_ERROR_SEC && agree.p95AbsErrorSec <= MAX_P95_ERROR_SEC, agree);
  fail('the transcript has no unexplained hole in its marks',
    cov.every((c) => c.maxMarkGapSec <= MAX_MARK_GAP_SEC), cov.map((c) => c.maxMarkGapSec));
  fail('speech volume is plausible for the duration',
    cov.every((c) => c.wordsPerSec !== null && c.wordsPerSec > 0.5 && c.wordsPerSec < 6), cov.map((c) => c.wordsPerSec));
  fail("the route's own probe did not disprove the clock",
    runs.every((r) => r.timing.verdict !== 'suspect'), runs.map((r) => r.timing.verdict));

  const report = { at: new Date().toISOString(), url: target.url, model: AT.ASR_MODEL,
    estimate: est, agreement: agree, coverage: cov,
    timing: runs.map((r) => r.timing), blind: runs.map((r) => r.blind),
    attempts: runs.map((r) => r.attempts), verdicts };
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'live-qualification.json'), JSON.stringify(report, null, 1));
    console.log('report → ' + path.join(OUT, 'live-qualification.json'));
  }
  const failed = verdicts.filter((v) => !v.ok);
  console.log('\n' + (verdicts.length - failed.length) + '/' + verdicts.length + ' verdicts passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('LIVE_SMOKE_FAILED', e && e.message); process.exit(1); });
