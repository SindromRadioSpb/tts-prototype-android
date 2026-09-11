'use strict';
// Наблюдение за НАСТОЯЩИМ прогоном «ссылка → учебный материал»: реальный провайдер, реальные
// деньги, реальные паузы. Нужно, чтобы судить о качестве экрана прогресса по тому, что человек
// на самом деле видит и сколько ждёт, а не по мокам, где всё мгновенно.
//
//   GEMINI_API_KEY=... node scripts/premium/youtube-material-observe.cjs \
//     --url=https://www.youtube.com/watch?v=<id> [--origin=http://127.0.0.1:3010] [--out=<dir>]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith('--' + n + '=')); return h ? h.slice(n.length + 3) : d; };
const ORIGIN = arg('origin', 'http://127.0.0.1:3010');
const URL_IN = arg('url', '');
const OUT = arg('out', '');
const KEY = process.env.GEMINI_API_KEY;
const SAMPLE_MS = 2000;

(async () => {
  if (!KEY) throw new Error('GEMINI_API_KEY_REQUIRED');
  if (!URL_IN) throw new Error('URL_REQUIRED');
  if (OUT) fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 380, height: 844 } });
  const page = await ctx.newPage();
  const bootAt = Date.now();
  const errors = [];
  const dialogs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', async (d) => { dialogs.push(d.type() + ': ' + d.message().slice(0, 120)); await d.accept(); });
  // Провайдерские отказы записываем с телом ответа: иначе «таблица не вернулась» остаётся
  // догадкой, а следующий прогон стоит новых денег за то же самое.
  const failures = [];
  page.on('response', async (r) => {
    if (r.status() < 400) return;
    const url = r.url();
    if (!/\/api\/translate-table|generativelanguage/.test(url)) return;
    let body = ''; try { body = (await r.text()).slice(0, 300); } catch (_) {}
    failures.push({ at: Math.round((Date.now() - bootAt) / 1000), status: r.status(), url: url.split('?')[0].slice(-60), body });
    console.log(JSON.stringify({ stage: 'providerFailure', status: r.status(), url: url.split('?')[0].slice(-60), body }));
  });
  await page.addInitScript((k) => {
    for (const key of ['localMode', 'v3OnboardingSeenV1', 'onboardingSeen_v1', 'v3.byokOnboardingDismissed', 'v3.byokTourCompleted']) localStorage.setItem(key, '1');
    localStorage.setItem('v3.geminiApiKey', k);
  }, KEY);

  await page.goto(ORIGIN + '/index.html?localMode=1', { waitUntil: 'load' });
  await page.evaluate(async () => { if (window.__localDBInitPromise) await window.__localDBInitPromise; await ensureLocalDB(); });
  await page.evaluate(() => { appSetLocale('ru'); const m = document.getElementById('v3Phase6Modal'); if (m) m.remove(); });

  const provider = await page.evaluate(() => document.getElementById('providerSelect').value);
  console.log(JSON.stringify({ stage: 'boot', defaultProvider: provider }));

  await page.evaluate(() => { StudioImport.open(); StudioImport.switchTab('video'); });
  await page.fill('#v3ImportVideoUrl', URL_IN);
  await page.click('#v3YtMaterialBtn');
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('dialog.study-source-dialog button')].find((x) => /Подготовить/.test(x.textContent));
    return b && !b.disabled;
  }, { timeout: 60000 });
  const quote = await page.evaluate(() => (document.querySelector('dialog.study-source-dialog p[role="status"]') || {}).textContent);
  console.log(JSON.stringify({ stage: 'quote', text: quote }));
  if (OUT) await page.screenshot({ path: path.join(OUT, '01-quote.png') });

  const started = Date.now();
  await page.locator('dialog.study-source-dialog').getByRole('button', { name: 'Подготовить и сохранить', exact: true }).click();

  const timeline = [];
  let lastSignature = '';
  let shot = 1;
  for (let i = 0; i < 900; i++) {
    const snap = await page.evaluate(async () => {
      const jobs = await LearningMaterialTask.createStore().list();
      const j = jobs[0] || {};
      const d = document.querySelector('dialog.study-source-dialog');
      const li = d ? [...d.querySelectorAll('.lmt-stages li')] : [];
      const bar = d && d.querySelector('.lmt-bar');
      return {
        phase: j.phase, state: j.state, error: j.error,
        marks: li.map((x) => x.dataset.mark).join(','),
        detail: (d && d.querySelector('.lmt-detail') || {}).textContent || '',
        status: (d && d.querySelector('p[role="status"]') || {}).textContent || '',
        bar: bar && !bar.hidden ? Number(bar.value) : null,
        buttons: d ? [...d.querySelectorAll('button')].map((b) => b.textContent.trim()) : [],
      };
    });
    const sig = [snap.phase, snap.state, snap.marks, snap.detail.replace(/\d+:\d\d/, 'T'), snap.bar].join('|');
    if (sig !== lastSignature) {
      const at = Math.round((Date.now() - started) / 1000);
      timeline.push(Object.assign({ atSec: at }, snap));
      console.log(JSON.stringify(Object.assign({ atSec: at }, snap)));
      if (OUT) await page.screenshot({ path: path.join(OUT, String(++shot).padStart(2, '0') + '-' + snap.phase + '-' + at + 's.png') });
      lastSignature = sig;
    }
    if (snap.state && ['ready', 'paused', 'cancelled'].includes(snap.state) && snap.phase !== 'imported') break;
    await new Promise((r) => setTimeout(r, SAMPLE_MS));
  }

  const totalSec = Math.round((Date.now() - started) / 1000);
  const result = await page.evaluate(async () => {
    const jobs = await LearningMaterialTask.createStore().list();
    const j = jobs[0];
    const db = await ensureLocalDB();
    const rows = j.saved_text_id ? await db.getSentences(j.saved_text_id) : [];
    return { phase: j.phase, state: j.state, error: j.error, saved: j.saved_text_id,
      segments: j.transcript ? j.transcript.segments.length : null,
      timing: j.transcript ? j.transcript.timing : null, blind: j.transcript ? j.transcript.blind : null,
      rows: rows.length };
  });
  console.log(JSON.stringify({ stage: 'done', totalSec, result, dialogs, failures, errors: errors.slice(0, 3) }, null, 1));
  if (OUT) {
    await page.screenshot({ path: path.join(OUT, '99-final.png') });
    fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ url: URL_IN, quote, totalSec, timeline, result, dialogs, errors, failures }, null, 1));
  }
  await browser.close();
})().catch((e) => { console.error('OBSERVE_FAILED', e && e.message); process.exit(1); });
