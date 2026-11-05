/* Real Chrome acceptance of the offline preview. Run from this repository. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const report = { started: new Date().toISOString(), browser: '', evidence: 'Local headless Chrome via Playwright; offline file URL; no production or physical-device acceptance.', checks: [], errors: [], network: [] };
const check = (name, details = {}) => { report.checks.push({ name, ...details }); console.log('PASS', name); };
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function state(page) { return page.evaluate(() => EPISODE.getState()); }
async function seek(page, value) { await page.evaluate(t => EPISODE.seek(t), value); }
async function pixels(page) { return page.evaluate(async () => {
  const data = document.querySelector('canvas').getContext('2d').getImageData(0, 0, 1280, 456).data;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
}); }
async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  report.browser = browser.version();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) report.network.push(request.url()); });
    await page.goto(pathToFileURL(path.join(root, 'Ulpan-Journey-Preview-v6.html')).href);
    await page.waitForFunction(() => window.EPISODE?.getState().ready);
    const timeline = await page.evaluate(() => ({ starts: EPISODE.starts, lines: EPISODE.lineStarts, duration: EPISODE.duration }));
    assert.equal(timeline.starts.length, 7); assert.equal(timeline.lines.flat().length, 29);
    check('seven scenes and 29 dialogue beats load offline', { duration: timeline.duration });
    const source = 'E:/World/Человек-Паук/Версия 3/LinguistPro-Ulpan-Journey-v5-CODEX/Ulpan-Journey-v5/assets';
    const preserved = fs.readdirSync(source).filter(name => name.endsWith('.png'));
    for (const file of preserved) assert.equal(hash(path.join(root, 'assets', file)), hash(path.join(source, file)), file);
    check('all supplied PNGs preserved byte for byte', { files: preserved.length });
    const ids = ['promenade', 'market', 'workshop', 'jaffa', 'travel', 'reading', 'cinema'];
    for (let i = 0; i < ids.length; i++) {
      await seek(page, timeline.starts[i] + 8);
      assert.equal((await state(page)).id, ids[i]);
      await page.screenshot({ path: path.join(root, 'reports', `desktop-${ids[i]}.png`), fullPage: true });
    }
    check('seven desktop scene screenshots');
    await page.getByRole('button', { name: 'Следующая сцена', exact: true }).isDisabled().then(value => assert.equal(value, true));
    await page.locator('#prev').click(); assert.equal((await state(page)).id, 'reading');
    await page.locator('#scene').selectOption('3'); assert.equal((await state(page)).id, 'jaffa');
    await page.locator('#replay').click(); assert.equal((await state(page)).time, 0);
    await page.locator('#next-line').click(); assert.equal((await state(page)).line, 1);
    await page.locator('#previous-line').click(); assert.equal((await state(page)).line, 0);
    await page.locator('#seek').fill('100'); assert.equal((await state(page)).time, 100);
    check('scene and line navigation, replay and timeline controls');
    await seek(page, timeline.lines[0][0] + 6.8);
    await page.locator('#play').click(); await page.waitForFunction(() => !EPISODE.getState().playing);
    assert.equal((await state(page)).line, 0);
    await page.locator('#play').click(); await page.waitForTimeout(140);
    assert.equal((await state(page)).line, 1);
    await page.locator('#play').click();
    const pausedTime = (await state(page)).time, pausedPixels = await pixels(page);
    await page.waitForTimeout(300); assert.equal((await state(page)).time, pausedTime); assert.deepEqual(await pixels(page), pausedPixels);
    check('read-at-own-pace holds each line; continue advances; pause freezes pixels');
    await page.locator('#reduced').check();
    for (let i = 0; i < ids.length; i++) {
      await seek(page, timeline.starts[i] + 3); const a = await pixels(page);
      await seek(page, timeline.starts[i] + 10); const b = await pixels(page); assert.deepEqual(b, a, ids[i]);
    }
    check('reduced motion freezes every scene including train and ambient sprites');
    await page.locator('#reduced').uncheck();
    const { windowChanges, forbiddenChanges } = await page.evaluate(start => {
      EPISODE.seek(start + 10);
      const ctx = document.querySelector('canvas').getContext('2d');
      const a = ctx.getImageData(0, 0, 1280, 456).data;
      EPISODE.seek(start + 12); const b = ctx.getImageData(0, 0, 1280, 456).data;
      let windowChanges = 0, forbiddenChanges = 0;
      for (let y = 0; y < 456; y++) for (let x = 0; x < 1280; x++) {
        const n = (y * 1280 + x) * 4;
        if (a[n] === b[n] && a[n+1] === b[n+1] && a[n+2] === b[n+2] && a[n+3] === b[n+3]) continue;
        const lx = x / 2, ly = y / 2;
        const window = ly >= 29 && ly < 109 && ((lx >= 183 && lx < 305) || (lx >= 335 && lx < 457));
        const actor = (lx >= 42 && lx < 240 && ly >= 25 && ly < 224) || (lx >= 458 && lx < 547 && ly >= 66 && ly < 182);
        if (window) windowChanges++; else if (!actor) forbiddenChanges++;
      }
      return { windowChanges, forbiddenChanges };
    }, timeline.starts[4]);
    assert.ok(windowChanges > 1000); assert.equal(forbiddenChanges, 0);
    check('extended train window masks preserve carriage outside animated actors', { windowChanges, forbiddenChanges });
    await seek(page, timeline.starts[4] + 21); assert.equal(await page.locator('#he').innerText(), 'תודה!');
    await seek(page, timeline.lines[4][4]); assert.equal(await page.locator('#he').innerText(), 'הגענו לחיפה!');
    check('arrival phrase appears only at the arrival beat');
    await page.setViewportSize({ width: 380, height: 900 });
    let checked = 0;
    for (let i = 0; i < ids.length; i++) {
      for (const t of timeline.lines[i]) {
        await seek(page, t);
        const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, font: parseFloat(getComputedStyle(document.querySelector('#line')).fontSize), he: getComputedStyle(document.querySelector('#he')).direction, text: document.querySelector('#line').textContent }));
        assert.equal(layout.overflow, false, layout.text); assert.ok(layout.font >= 18); assert.equal(layout.he, 'rtl'); checked++;
      }
      await seek(page, timeline.starts[i] + 8);
      await page.screenshot({ path: path.join(root, 'reports', `mobile-${ids[i]}.png`), fullPage: true });
    }
    check('380px: all dialogue fits without horizontal overflow, >=18px type, RTL Hebrew', { checked });
    await page.locator('#learning').click(); assert.equal((await state(page)).reduced, true); assert.equal((await state(page)).id, 'market');
    assert.equal(await page.locator('#lesson').isVisible(), true); assert.equal(await page.locator('#solution').isVisible(), false);
    await page.locator('#answer').press('Enter'); assert.equal(await page.locator('#solution').isVisible(), true);
    await page.locator('#learning').click(); assert.equal(await page.locator('#solution').isVisible(), false);
    check('quiet lesson, keyboard answer, reset on reopening');
    await page.locator('#transcript summary').click();
    assert.equal(await page.locator('.transcript-scene').count(), 7);
    await page.locator('#scene').focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'seek');
    check('DOM transcript and keyboard navigation');
    const reducedPage = await context.newPage(); await reducedPage.emulateMedia({ reducedMotion: 'reduce' });
    await reducedPage.goto(pathToFileURL(path.join(root, 'Ulpan-Journey-Preview-v6.html')).href);
    await reducedPage.waitForFunction(() => window.EPISODE?.getState().ready); assert.equal((await state(reducedPage)).reduced, true);
    await reducedPage.emulateMedia({ reducedMotion: 'no-preference' });
    await reducedPage.waitForFunction(() => !EPISODE.getState().reduced);
    await reducedPage.close(); check('system reduced-motion setting and live change');
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.locator('#lesson').evaluate(el => el.hidden = true);
    await page.locator('#transcript').evaluate(el => el.open = false);
    await page.locator('#reduced').uncheck(); await page.locator('#manual').uncheck();
    await seek(page, 0); await page.locator('#play').click();
    const seen = new Set(); const playbackStarted = Date.now();
    while ((await state(page)).playing) {
      seen.add((await state(page)).id);
      await page.waitForTimeout(1500);
      if (Date.now() - playbackStarted > 215000) throw new Error('Natural playback timed out');
    }
    assert.equal((await state(page)).time, timeline.duration); assert.equal(seen.size, 7);
    check('uninterrupted natural playback through all seven scenes to completion', { elapsedMs: Date.now() - playbackStarted, scenes: [...seen] });
    await page.locator('#play').click(); await page.waitForTimeout(150); assert.ok((await state(page)).time < 1); await page.locator('#play').click();
    check('play after completion restarts story');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.network, []);
    check('no browser exceptions and no HTTP network requests');
    await page.evaluate(() => EPISODE.destroy()); const stopped = await state(page);
    await page.waitForTimeout(200); assert.equal((await state(page)).time, stopped.time);
    check('destroy stops playback');
    report.result = 'passed';
  } finally {
    await browser.close(); report.finished = new Date().toISOString();
    fs.writeFileSync(path.join(root, 'reports/browser-qa.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
main().catch(error => { report.result = 'failed'; report.errors.push(error.stack); fs.writeFileSync(path.join(root, 'reports/browser-qa.json'), JSON.stringify(report, null, 2) + '\n'); console.error(error); process.exitCode = 1; });
