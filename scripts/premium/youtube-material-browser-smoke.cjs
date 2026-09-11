'use strict';
// P5 · «Учебный материал из ссылки» в живом браузере: вкладка Видео → смета → диалог задачи.
// По умолчанию провайдер ЗАМОКАН (детерминированно, ни цента, годится для CI). С реальным ключом
// в GEMINI_API_KEY смета берётся из настоящего бесплатного countTokens — платных вызовов нет ни в
// одном режиме: транскрипция здесь не запускается.
//
//   node scripts/premium/youtube-material-browser-smoke.cjs [--origin=http://127.0.0.1:3010] [--live] [--shots=<dir>]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ORIGIN = arg('origin', process.env.STUDIO_ORIGIN || 'http://127.0.0.1:3010');
const LIVE = process.argv.includes('--live');
const SHOTS = arg('shots', '');
const VIDEO = 'https://www.youtube.com/watch?v=eLYgTqNFn-s&t=42s&list=PLnoise';

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? undefined : String(detail).slice(0, 200) });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : ' — ' + detail));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 380, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));

  await page.addInitScript(() => { try { localStorage.setItem('v3.geminiApiKey', 'test-key'); } catch (_) {} });
  if (!LIVE) {
    // Провайдер отвечает ровно теми числами, которые измерены на пилоте 2026-09-11.
    await page.route('https://generativelanguage.googleapis.com/**', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ totalTokens: 72073, promptTokensDetails: [
        { modality: 'TEXT', tokenCount: 2 }, { modality: 'VIDEO', tokenCount: 22152 }, { modality: 'AUDIO', tokenCount: 49919 }] }),
    }));
  } else {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY required for --live');
    await page.addInitScript((k) => { try { localStorage.setItem('v3.geminiApiKey', k); } catch (_) {} }, key);
  }

  await page.goto(ORIGIN + '/?v=519', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StudioImport && window.YoutubeAsr && window.LearningMaterialTaskUI);

  check('the shell serves the release under test', await page.evaluate(() => window.APP_VERSION) === '3.11.519');
  check('a link with tracking parameters is canonicalised before it can be rejected',
    await page.evaluate((u) => JSON.stringify(window.YoutubeAsr.canonicalize(u)), VIDEO) ===
    JSON.stringify({ video_id: 'eLYgTqNFn-s', url: 'https://www.youtube.com/watch?v=eLYgTqNFn-s' }));

  await page.evaluate(() => window.StudioImport.open());
  await page.evaluate(() => window.StudioImport.switchTab('video'));
  await page.fill('#v3ImportVideoUrl', VIDEO);
  const block = page.locator('#v3YtMaterial');
  check('the link route is offered on the Video tab', await block.isVisible());
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'yt-material-tab-380-ru.png'), fullPage: false });
  }

  await page.click('#v3YtMaterialBtn');
  const dialog = page.locator('dialog.study-source-dialog');
  await dialog.waitFor({ state: 'visible', timeout: 20000 });
  const priceLine = dialog.locator('p[role="status"]');
  await page.waitForFunction(() => {
    const p = document.querySelector('dialog.study-source-dialog p[role="status"]');
    return p && /\$|\d+:\d\d/.test(p.textContent || '');
  }, null, { timeout: 30000 }).catch(() => {});
  const priceText = (await priceLine.textContent() || '').trim();
  check('the price is shown before anything is spent', /\$\d/.test(priceText) && /\p{L}/u.test(priceText), priceText);
  check('the estimate reports the real duration, not a guess', priceText.includes('26:00'), priceText);

  // Требование среды объявляется ДО трат: Chrome замораживает фоновую вкладку и обрывает
  // висящий запрос куска (замер 2026-09-11). 26-минутный ролик считается в несколько кусков.
  const frontNote = await dialog.locator('.lmt-foreground-note').textContent().catch(() => '');
  check('a chunked build says up front that the tab must stay in front',
    /вкладк|tab|לשונית/i.test(frontNote || ''), frontNote);

  const startBtn = dialog.locator('button', { hasText: /Подготовить и сохранить|Prepare and save/ }).first();
  check('preparation only unlocks once the price is on screen', await startBtn.isEnabled());
  const titleValue = await dialog.locator('input[type="text"]').inputValue();
  check('the material is named from the video itself', titleValue.length > 0 && titleValue !== 'eLYgTqNFn-s', titleValue);

  // Премиальность измеряется и так: решающая кнопка обязана быть на экране без прокрутки.
  const reach = await page.evaluate(() => {
    const d = document.querySelector('dialog.study-source-dialog');
    const b = [...d.querySelectorAll('button')].find((x) => /Подготовить|Prepare/.test(x.textContent));
    const price = d.querySelector('p[role="status"]');
    // Пояснительный абзац ищем по СОДЕРЖАНИЮ, а не по классу: проверяем то, что видит человек,
    // а не то, как это свёрстано.
    const prose = [...d.querySelectorAll('p')].filter((p2) => /переводчик|translator|מתרגם/.test(p2.textContent))[0];
    const y = (el) => Math.round(el.getBoundingClientRect().top);
    return { button: y(b), price: y(price), prose: prose ? y(prose) : null, viewport: window.innerHeight,
      buttonBottom: Math.round(b.getBoundingClientRect().bottom) };
  });
  check('the decision comes before the explanation: price and action sit above the prose',
    reach.prose !== null && reach.price < reach.prose && reach.button < reach.prose, JSON.stringify(reach));
  check('the action needs no scrolling at 380px', reach.buttonBottom <= reach.viewport, JSON.stringify(reach));

  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'yt-material-estimate-380-ru.png') });

  // Настоящее переключение локали, а не разворот dir: иначе скриншот показал бы русские строки в
  // RTL-раскладке и «доказывал» бы иврит, которого на экране нет.
  await page.evaluate(() => { const d = document.querySelector('dialog.study-source-dialog'); if (d) d.close(); });
  await page.evaluate(() => window.appSetLocale('he'));
  await page.waitForFunction(() => document.documentElement.lang === 'he');
  // Первичный OPFS-промпт Студии может всплыть поверх модала импорта в чистом профиле; он не
  // предмет этой проверки, поэтому убираем его вместо того, чтобы кликать сквозь него.
  await page.evaluate(() => { const m = document.getElementById('v3Phase6Modal'); if (m) m.remove(); });
  await page.click('#v3YtMaterialBtn');
  await dialog.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForFunction(() => {
    const p = document.querySelector('dialog.study-source-dialog p[role="status"]');
    return p && /\$/.test(p.textContent || '');
  }, null, { timeout: 30000 }).catch(() => {});
  const hebrewPrice = (await dialog.locator('p[role="status"]').textContent() || '').trim();
  check('the Hebrew surface states the cost in Hebrew', /[֐-׿]/.test(hebrewPrice), hebrewPrice);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'yt-material-estimate-380-he-rtl.png') });

  check('no page error was raised', errors.length === 0, errors.join(' | '));

  // Провайдер таблицы по умолчанию: с ключом Gemini незачем каждый раз переключать руками, но
  // ЯВНЫЙ выбор пользователя остаётся за ним — молча менять выбранное нельзя.
  async function providerFor(storage) {
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await p2.addInitScript((kv) => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); }, storage);
    await p2.goto(ORIGIN + '/?v=519', { waitUntil: 'load' });
    await p2.waitForFunction(() => document.getElementById('providerSelect'));
    const value = await p2.evaluate(() => document.getElementById('providerSelect').value);
    await ctx.close();
    return value;
  }
  check('a configured Gemini key makes Gemini the default table provider',
    (await providerFor({ 'v3.geminiApiKey': 'AIza' + 'f'.repeat(35) })) === 'gemini');
  check('without a key nothing pretends Gemini is available',
    (await providerFor({})) === 'google-free');
  check('an explicit choice is never silently overridden',
    (await providerFor({ 'v3.geminiApiKey': 'AIza' + 'f'.repeat(35), 'v3.translateProvider': 'google-free' })) === 'google-free');

  // ── Кеш библиотеки живёт в своём бюджете ──
  // До 2026-09-11 он рос без предела (у владельца 142 ключа / ~10 МБ) и валил ЧУЖИЕ записи в
  // localStorage QuotaExceededError. Проверяем на живой странице, а не только в модуле.
  const budget = await page.evaluate(() => {
    for (let i = 0; i < 12; i++) localStorage.setItem('ttsDashboard_v3_library_cache_v1:seed' + i, JSON.stringify({ rows: ['x'.repeat(20000)] }));
    localStorage.setItem('someone-else', 'keep me');
    for (let i = 0; i < 3; i++) v3LibraryCacheSave('fresh' + i, { rows: [{ he: 'א' }] });
    const usage = LocalCacheBudget.usage(localStorage, { prefix: V3_LIBRARY_CACHE_PREFIX });
    return { entries: usage.entries, chars: usage.chars, other: localStorage.getItem('someone-else'),
      newest: localStorage.getItem('ttsDashboard_v3_library_cache_v1:fresh2') != null,
      max: V3_LIBRARY_CACHE_MAX_ENTRIES, maxChars: V3_LIBRARY_CACHE_MAX_CHARS };
  });
  check('the library cache stays inside its own budget',
    budget.entries <= budget.max && budget.chars <= budget.maxChars, JSON.stringify(budget));
  check('the cache evicts itself, never another writer', budget.other === 'keep me' && budget.newest, JSON.stringify(budget));

  // Браузер, выросший ДО бюджета, лечится одним проходом на загрузке.
  const healed = await (async () => {
    const ctx = await browser.newContext();
    const p3 = await ctx.newPage();
    await p3.addInitScript(() => {
      for (let i = 0; i < 14; i++) localStorage.setItem('ttsDashboard_v3_library_cache_v1:old' + i, JSON.stringify({ rows: ['y'.repeat(30000)] }));
    });
    await p3.goto(ORIGIN + '/?v=519', { waitUntil: 'load' });
    await p3.waitForFunction(() => window.LocalCacheBudget);
    const after = await p3.evaluate(() => LocalCacheBudget.usage(localStorage, { prefix: V3_LIBRARY_CACHE_PREFIX }));
    await ctx.close();
    return after;
  })();
  check('an already over-grown cache is brought back into budget on load',
    healed.entries <= 6 && healed.chars <= 1500000, JSON.stringify(healed));

  await browser.close();

  const failed = checks.filter((c) => !c.ok);
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' checks passed');
  if (SHOTS) {
    fs.writeFileSync(path.join(SHOTS, 'checks.json'), JSON.stringify({ origin: ORIGIN, live: LIVE, checks }, null, 1));
  }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SMOKE_FAILED', e && e.message); process.exit(1); });
