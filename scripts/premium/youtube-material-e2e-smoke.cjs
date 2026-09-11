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
const fs = require('node:fs');
const path = require('node:path');

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith('--' + n + '=')); return h ? h.slice(n.length + 3) : d; };
const ORIGIN = arg('origin', process.env.STUDY_VIDEO_ORIGIN || 'http://127.0.0.1:3010');
const SHOTS = arg('shots', '');
const VIDEO_ID = 'eLYgTqNFn-s';
const LINK = 'https://www.youtube.com/watch?v=' + VIDEO_ID + '&t=42s&list=PLnoise';
const CANONICAL = 'https://www.youtube.com/watch?v=' + VIDEO_ID;
// 130 реплик на 700 с ≈ 11 в минуту — плотность, измеренная на настоящем пилоте. При более
// плотной записи маршрут ОБЯЗАН переспросить (предохранитель на превышение сметы), и это
// поведение закрыто юнит-тестами tableCostWithinQuote.
const DURATION_SEC = 700;
const ANCHORS = [
  'יש מקרי גירושים בציבור החרדי שנובעים מחוסר התאמה',
  'אני בגיל שמונה עשרה וחצי התארסתי ואחר כך התחתנתי',
  'שלושה חודשים אחרי זה התגרשתי כי הוא לא התאים לי',
];
// 130 реплик — выше TableChunks.CHUNK_SIZE (120), иначе чанк-цикл не включится и вместе с ним не
// проверится ни прогресс таблицы, ни отсутствие второго window.confirm посреди прогона.
const SEGMENTS = Array.from({ length: 130 }, (_, i) => ({
  start: Math.floor((7 + i * 2) / 60) + ':' + String((7 + i * 2) % 60).padStart(2, '0'),
  // Номер идёт ПЕРВЫМ: якорь строится по первым словам, и общий хвост делал бы все реплики
  // неотличимыми друг от друга — зонд часов честно считал бы такой таймлайн сбитым.
  text: 'משפט מספר ' + (i + 1) + ' ' + ANCHORS[i % ANCHORS.length],
}));

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : ' — ' + String(detail).slice(0, 200)));
};

const jobNow = (page) => page.evaluate(async () => {
  const jobs = await LearningMaterialTask.createStore().list();
  return jobs[0] && { state: jobs[0].state, phase: jobs[0].phase, error: jobs[0].error, saved: jobs[0].saved_text_id };
});

// Задача переходит в 'running' не мгновенно после клика: если ждать сразу терминального
// состояния, увидишь ПРЕДЫДУЩЕЕ ('paused') и решишь, что прогон уже кончился. Сначала дожидаемся
// старта, и только потом финала — иначе проверки читают задачу на середине.
async function waitTask(page) {
  for (let i = 0; i < 100; i++) {
    const job = await jobNow(page);
    if (job && job.state === 'running') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  for (let i = 0; i < 900; i++) {
    const job = await jobNow(page);
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
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.type() + ': ' + d.message().slice(0, 80)); await d.accept(); });

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
  if (SHOTS) {
    // Момент, ради которого всё делалось: пользователь видит, на каком этапе прогон и что идёт.
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.waitForFunction(() => document.querySelectorAll('dialog .lmt-stages li').length > 0, null, { timeout: 20000 }).catch(() => {});
    await page.setViewportSize({ width: 380, height: 844 });
    await page.screenshot({ path: path.join(SHOTS, 'yt-material-progress-380-ru.png') });
    await page.setViewportSize({ width: 1180, height: 900 });
  }
  const job = await waitTask(page);
  if (SHOTS) {
    await page.setViewportSize({ width: 380, height: 844 });
    await page.screenshot({ path: path.join(SHOTS, 'yt-material-done-380-ru.png') });
    // Тот же экран на иврите: этапы и знаки обязаны читаться в RTL, а не только в русской раскладке.
    await page.evaluate(async () => {
      const d = document.querySelector('dialog.study-source-dialog'); if (d) d.close();
      appSetLocale('he');
      const jobs = await LearningMaterialTask.createStore().list();
      await LearningMaterialTaskUI.list();
      const b = [...document.querySelectorAll('dialog button')].find((x) => x.textContent.includes(jobs[0].input.title));
      if (b) b.click();
    });
    await page.waitForFunction(() => document.querySelectorAll('dialog .lmt-stages li').length > 0, null, { timeout: 15000 }).catch(() => {});
    await page.screenshot({ path: path.join(SHOTS, 'yt-material-done-380-he-rtl.png') });
    // Съёмка не имеет права менять сценарий: возвращаем русский диалог задачи ровно в то
    // состояние, в котором его застали, иначе следующая проверка кликнет не туда.
    await page.evaluate(async () => {
      const d = document.querySelector('dialog.study-source-dialog'); if (d) d.close();
      appSetLocale('ru');
      const jobs = await LearningMaterialTask.createStore().list();
      await LearningMaterialTaskUI.list();
      const b = [...document.querySelectorAll('dialog button')].find((x) => x.textContent.includes(jobs[0].input.title));
      if (b) b.click();
    });
    await page.waitForFunction(() => document.querySelectorAll('dialog .lmt-stages li').length > 0, null, { timeout: 15000 }).catch(() => {});
    await page.setViewportSize({ width: 1180, height: 900 });
  }
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
  check('one agreed price carries the whole run: nothing else is asked mid-flight',
    dialogs.length === 0, dialogs.join(' | '));
  check('the rows carry a YouTube clock, so karaoke can follow', result.entries === SEGMENTS.length && result.firstEntry && result.firstEntry.t === 7, JSON.stringify(result.firstEntry));
  check('exactly one card exists', result.texts === 1, result.texts);
  check('passive preparation never writes learner memory', result.reviews === 0, result.reviews);

  const leftovers = await page.evaluate(async () => {
    const shown = (el) => !!(el && el.getClientRects().length);   // факт отрисовки, не признак реализации
    const before = shown(document.getElementById('v3ImportModal'));
    const d = document.querySelector('dialog[open]');
    const btn = d && [...d.querySelectorAll('button')].find((b) => /Открыть материал|Open material/.test(b.textContent));
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 1500));
    return {
      importWasOpen: before,
      dialogs: [...document.querySelectorAll('dialog[open]')].map((x) => x.className || x.id),
      importVisible: shown(document.getElementById('v3ImportModal')),
    };
  });
  check('the scenario is real: the import modal was still open when the material was opened',
    leftovers.importWasOpen === true, JSON.stringify(leftovers));
  check('opening the material leaves no modal standing over it',
    leftovers.dialogs.length === 0 && leftovers.importVisible === false, JSON.stringify(leftovers));

  const paidBefore = provider.generateContent;
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(async () => { if (window.__localDBInitPromise) await window.__localDBInitPromise; });
  await page.evaluate(async (id) => {
    const store = LearningMaterialTask.createStore();
    // Сбрасываем И таблицу: иначе возобновление проскакивает мимо стадии, где цена и спрашивается.
    await store.update(id, (j) => ({ ...j, table: null, saved_text_id: null, playback_bound: null, package: null, state: 'paused', phase: 'translating' }));
  }, result.id);
  await page.evaluate(async () => { const m = document.getElementById('v3Phase6Modal'); if (m) m.remove(); await LearningMaterialTaskUI.list(); });
  await page.locator('dialog').getByRole('button', { name: /סליחה|Подготовка|סליחה על השאלה/ }).first().click();
  await page.locator('dialog').getByRole('button', { name: 'Продолжить', exact: true }).click();
  await waitTask(page);
  check('a resumed run never pays for the same transcript twice', provider.generateContent === paidBefore, provider.generateContent + ' vs ' + paidBefore);
  // Сценарий владельца 2026-09-11: согласованная цена жила в переменной страницы, возобновление её
  // теряло, маршрут спрашивал заново — и закрытый вопрос оставлял пустую таблицу.
  check('a resumed run does not ask again about a price already agreed',
    dialogs.length === 0, dialogs.join(' | '));

  const after = await page.evaluate(async () => {
    const db = await ensureLocalDB();
    return { texts: (await db.dbQuery('SELECT id FROM texts')).length, reviews: (await db.dbQuery('SELECT * FROM review_log')).length };
  });
  check('the resume creates no duplicate card', after.texts === 1, after.texts);
  const stages = await page.evaluate(async () => {
    const jobs = await LearningMaterialTask.createStore().list();
    await LearningMaterialTaskUI.list();
    const btn = [...document.querySelectorAll('dialog button')].find((b) => b.textContent.includes(jobs[0].input.title));
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 300));
    const li = [...document.querySelectorAll('dialog .lmt-stages li')];
    return { count: li.length, marks: li.map((x) => x.dataset.mark).join(','),
      clocks: li.map((x) => (x.querySelector('.lmt-stage-clock') || {}).textContent).filter(Boolean),
      words: li.map((x) => (x.querySelector('.lmt-mark-word') || {}).textContent).filter(Boolean),
      labels: li.map((x) => x.textContent.trim()) };
  });
  check('the dialog shows the stages of the run, each with its own state', stages.count === 4, JSON.stringify(stages));
  check('a finished run marks every stage done, none left looking unfinished',
    stages.marks === 'done,done,done,done', stages.marks);
  check('every finished stage reports how long it actually took',
    stages.clocks.length === 4 && stages.clocks.every((c) => /^\d+:\d\d$/.test(c)), JSON.stringify(stages.clocks));
  check('each stage is labelled in words, not only by a glyph',
    stages.words.length === 4 && stages.words.every((w) => w && w.length > 2), JSON.stringify(stages.words));

  check('no page error was raised', errors.length === 0, errors.join(' | '));

  await browser.close();
  const failed = checks.filter((c) => !c.ok);
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' checks passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SMOKE_FAILED', e && e.message); process.exit(1); });
