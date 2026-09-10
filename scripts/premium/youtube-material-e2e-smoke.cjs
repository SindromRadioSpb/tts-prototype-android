'use strict';
// P5 · Сквозной гейт «ссылка → готовая карточка» в настоящем браузере (OPFS/SQLite, реальный
// движок задачи). Провайдеры ЗАМОКАНЫ детерминированно: ни одного платного вызова.
// Проверяет ровно то, ради чего маршрут делался: пользователь вставил ссылку и один раз нажал
// «Подготовить» — карточка сохранена, «Источник видео» подставлен сам, метки на месте, а повтор
// прогона не заказывает распознавание второй раз.
//
//   node scripts/premium/youtube-material-e2e-smoke.cjs [--origin=http://127.0.0.1:3010]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith('--' + n + '=')); return h ? h.slice(n.length + 3) : d; };
const ORIGIN = arg('origin', process.env.STUDY_VIDEO_ORIGIN || 'http://127.0.0.1:3010');
const VIDEO_ID = 'eLYgTqNFn-s';
const LINK = 'https://www.youtube.com/watch?v=' + VIDEO_ID + '&t=42s&list=PLnoise';
const CANONICAL = 'https://www.youtube.com/watch?v=' + VIDEO_ID;
const DURATION_SEC = 300;
const SEGMENTS = [
  { start: '0:07', text: 'יש מקרי גירושים בציבור החרדי שנובעים מחוסר התאמה' },
  { start: '0:21', text: 'אני בגיל שמונה עשרה וחצי התארסתי ואחר כך התחתנתי' },
  { start: '0:36', text: 'שלושה חודשים אחרי זה התגרשתי כי הוא לא התאים לי' },
];

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : ' — ' + String(detail).slice(0, 200)));
};

async function waitTask(page) {
  for (let i = 0; i < 600; i++) {
    const job = await page.evaluate(async () => {
      const jobs = await LearningMaterialTask.createStore().list();
      return jobs[0] && { state: jobs[0].state, phase: jobs[0].phase, error: jobs[0].error };
    });
    if (job && ['ready', 'paused', 'cancelled'].includes(job.state) && job.phase !== 'imported') return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('TASK_WAIT_TIMEOUT');
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  const provider = { countTokens: 0, generateContent: 0, table: 0 };
  page.on('pageerror', (e) => errors.push(e.message));

  await page.addInitScript(() => {
    for (const key of ['localMode', 'v3OnboardingSeenV1', 'onboardingSeen_v1', 'v3.byokOnboardingDismissed', 'v3.byokTourCompleted']) localStorage.setItem(key, '1');
    localStorage.setItem('v3.geminiApiKey', 'AIza' + 'f'.repeat(35));
  });
  await page.route('**/www.youtube.com/oembed**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ title: 'סליחה על השאלה', author_name: 'כאן 11' }),
  }));
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith(':countTokens')) {
      provider.countTokens++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        totalTokens: 32 * DURATION_SEC + 5000,
        promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 32 * DURATION_SEC }, { modality: 'VIDEO', tokenCount: 5000 }],
      }) });
    }
    provider.generateContent++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ language: 'he', segments: SEGMENTS, warnings: [] }) }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
    }) });
  });
  await page.route('**/api/translate-table', async (route) => {
    provider.table++;
    const body = route.request().postDataJSON();
    const source = body.segments || String(body.text || '').split('\n').map((text, i) => ({ i, text }));
    const rows = source.map((row, i) => ({ segment_index: i, source_line_index: i, he: row.text, he_niqqud: row.text, translit: 'x', ru: 'Строка ' + (i + 1) }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      rows, model: 'gemini-3.8-flash', requestedModel: 'gemini-3.8-flash',
      promptId: 'he-ru-table-seg-v3', schemaId: 'studio-table-rows-schema-v1', warnings: [] }) });
  });

  await page.goto(ORIGIN + '/index.html?localMode=1', { waitUntil: 'load' });
  await page.evaluate(async () => { if (window.__localDBInitPromise) await window.__localDBInitPromise; await ensureLocalDB(); });
  await page.evaluate(() => { appSetLocale('ru'); const m = document.getElementById('v3Phase6Modal'); if (m) m.remove(); });

  // Настоящий путь пользователя: вкладка «Видео» → вставил ссылку → одна кнопка.
  await page.evaluate(() => { StudioImport.open(); StudioImport.switchTab('video'); });
  await page.fill('#v3ImportVideoUrl', LINK);
  await page.click('#v3YtMaterialBtn');
  const dialog = page.locator('dialog.study-source-dialog');
  await dialog.waitFor({ state: 'visible', timeout: 20000 });
  const startBtn = dialog.getByRole('button', { name: 'Подготовить и сохранить', exact: true });
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('dialog.study-source-dialog button')].find((x) => /Подготовить/.test(x.textContent));
    return b && !b.disabled;
  }, null, { timeout: 30000 });
  check('the estimate is free: the paid endpoint is untouched before the owner agrees',
    provider.countTokens === 1 && provider.generateContent === 0, JSON.stringify(provider));
  check('the material is named from the video', (await dialog.locator('input[type="text"]').inputValue()) === 'סליחה על השאלה');

  await startBtn.click();
  const job = await waitTask(page);
  check('one click carries the link all the way to a ready material', job.state === 'ready', JSON.stringify(job));

  const result = await page.evaluate(async () => {
    const jobs = await LearningMaterialTask.createStore().list();
    const j = jobs[0];
    const db = await ensureLocalDB();
    const row = (await db.dbQuery('SELECT source_meta_json FROM texts WHERE id=?', [String(j.saved_text_id)]))[0];
    const meta = PlaybackSource.parseMeta(row.source_meta_json);
    const rows = await db.getSentences(j.saved_text_id);
    const context = await StudyVideoSourceUI.context(j.saved_text_id);
    const view = await PlaybackSource.youtubeView(context.audio, context.rows, meta.playback_source);
    return {
      id: j.saved_text_id, phase: j.phase, transcriptSegments: j.transcript.segments.length,
      timingVerdict: j.transcript.timing.verdict, blind: j.transcript.blind,
      provenance: j.transcript.import_meta.captions.captions.origin,
      binding: PlaybackSource.selected(meta.playback_source),
      rows: rows.length, entries: view.entries ? view.entries.length : 0, firstEntry: view.entries && view.entries[0],
      reviews: (await db.dbQuery('SELECT * FROM review_log')).length,
      texts: (await db.dbQuery('SELECT id FROM texts')).length,
    };
  });

  check('the video source is attached without the owner opening metadata',
    result.binding.source && result.binding.source.url === CANONICAL && result.binding.offset_ms === 0, JSON.stringify(result.binding));
  check('the attachment claims no human verification it never had', result.binding.timing.status === 'unverified', result.binding.timing.status);
  check('the transcript records that a provider produced it from the link', result.provenance === 'gemini-url-asr', result.provenance);
  check('an independently probed clock is reported as measured', result.timingVerdict === 'verified' && result.blind === false, result.timingVerdict);
  check('every spoken line became a study row', result.rows === SEGMENTS.length, result.rows);
  check('the rows carry a YouTube clock, so karaoke can follow', result.entries === SEGMENTS.length && result.firstEntry && result.firstEntry.t === 7, JSON.stringify(result.firstEntry));
  check('exactly one card exists', result.texts === 1, result.texts);
  check('passive preparation never writes learner memory', result.reviews === 0, result.reviews);

  const paidBefore = provider.generateContent;
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(async () => { if (window.__localDBInitPromise) await window.__localDBInitPromise; });
  await page.evaluate(async (id) => {
    const store = LearningMaterialTask.createStore();
    await store.update(id, (j) => ({ ...j, saved_text_id: null, playback_bound: null, package: null, state: 'paused', phase: 'saving' }));
  }, result.id);
  await page.evaluate(async () => { const m = document.getElementById('v3Phase6Modal'); if (m) m.remove(); await LearningMaterialTaskUI.list(); });
  await page.locator('dialog').getByRole('button', { name: /סליחה|Подготовка|סליחה על השאלה/ }).first().click();
  await page.locator('dialog').getByRole('button', { name: 'Продолжить', exact: true }).click();
  await waitTask(page);
  check('a resumed run never pays for the same transcript twice', provider.generateContent === paidBefore, provider.generateContent + ' vs ' + paidBefore);

  const after = await page.evaluate(async () => {
    const db = await ensureLocalDB();
    return { texts: (await db.dbQuery('SELECT id FROM texts')).length, reviews: (await db.dbQuery('SELECT * FROM review_log')).length };
  });
  check('the resume creates no duplicate card', after.texts === 1, after.texts);
  check('no page error was raised', errors.length === 0, errors.join(' | '));

  await browser.close();
  const failed = checks.filter((c) => !c.ok);
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' checks passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SMOKE_FAILED', e && e.message); process.exit(1); });
