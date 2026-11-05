'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer, waitForSmokeHealth } = require('../smoke-server-env');
const { buildCourseData } = require('./build-course-data.cjs');
const { CLOUD_TEXTS_CONSENT_VERSION } = require('../../public/js/cloud-sync.js');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, '.tmp', 'course-sync-browser');
const pause = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const data = fs.mkdtempSync(path.join(out, 'run-')), source = path.join(data, 'source');
  fs.cpSync(path.join(root, 'tests/fixtures/course/mini'), source, { recursive: true });
  const coursePath = path.join(source, 'course.json'), course = JSON.parse(fs.readFileSync(coursePath, 'utf8'));
  course.id = 'ulpan'; fs.writeFileSync(coursePath, JSON.stringify(course));
  buildCourseData(source, path.join(data, 'course'));
  const secret = 'course-sync-browser-disposable-owner-0123456789';
  const child = spawn(process.execPath, ['-e', SMOKE_SERVER_BOOTSTRAP], {
    cwd: root, env: { ...smokeServerEnv(data, 0), AUTH_BOOTSTRAP_SECRET: secret, TTS_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true
  });
  let logs = '', browser;
  child.stdout.on('data', x => logs += x); child.stderr.on('data', x => logs += x);
  try {
    const base = 'http://127.0.0.1:' + await waitForSmokeServer(child, 30000);
    await waitForSmokeHealth(base, { timeoutMs: 60000 });
    browser = await chromium.launch({ headless: true });
    async function context() {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      await c.addInitScript(() => localStorage.setItem('lp_world_v1', JSON.stringify({ id: 'classic' })));
      await c.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const login = await c.request.post(base + '/api/auth/bootstrap-login', { data: { secret } });
      assert.equal(login.status(), 200);
      return { context: c, session: await login.json() };
    }
    const a = await context(), b = await context();
    assert.equal(a.session.user.id, b.session.user.id);
    const grant = await a.context.request.post(base + '/api/auth/consent', {
      headers: { 'X-LP-CSRF': a.session.csrf },
      data: { key: 'cloud_texts', granted: true, version: CLOUD_TEXTS_CONSENT_VERSION }
    });
    assert.equal(grant.status(), 200);
    const pageA = await a.context.newPage(), pageB = await b.context.newPage();
    const errors = [];
    pageA.on('pageerror', e => errors.push('A: ' + e.message));
    pageB.on('pageerror', e => errors.push('B: ' + e.message));
    async function enter(page) {
      await page.goto(base + '/library.html#room=course%3Aulpan', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-course-lesson]', { timeout: 30000 });
      await page.locator('[data-course-lesson="L001-cafe"]').click();
      await page.waitForSelector('[data-course-step]');
      await page.locator('[data-course-next]').click();
      await page.waitForSelector('[data-course-input]');
    }
    async function attempts(page) {
      return page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('lp.course.') && k.endsWith('.ulpan.v1'))
        .map(k => JSON.parse(localStorage.getItem(k)).attempts.length)[0] || 0);
    }
    await enter(pageA);
    await pageA.locator('[data-course-input]').fill('תֵּה בְּלִי סֻכָּר');
    await pageA.locator('[data-course-check]').click();
    await pageA.waitForFunction(() => document.querySelector('[data-course-sync-status]')?.textContent.includes('облаке'), { timeout: 15000 });
    await enter(pageB);
    await pageB.waitForFunction(() => Object.keys(localStorage).some(k => k.endsWith('.ulpan.v1') && JSON.parse(localStorage.getItem(k)).attempts.length === 1), { timeout: 15000 });
    assert.equal(await attempts(pageB), 1);
    await a.context.setOffline(true);
    await pageA.locator('[data-course-input]').fill('אפשר תה בלי סוכר');
    await pageA.locator('[data-course-check]').click();
    assert.equal(await attempts(pageA), 2);
    await pause(5500);
    await a.context.setOffline(false);
    await pageA.evaluate(() => window.dispatchEvent(new Event('online')));
    await pageA.waitForFunction(() => document.querySelector('[data-course-sync-status]')?.textContent.includes('облаке'), { timeout: 15000 });
    await pageB.reload({ waitUntil: 'domcontentloaded' });
    await pageB.waitForFunction(() => Object.keys(localStorage).some(k => k.endsWith('.ulpan.v1') && JSON.parse(localStorage.getItem(k)).attempts.length === 2), { timeout: 15000 });
    assert.equal(await attempts(pageB), 2);
    const anonymous = await fetch(base + '/api/learner/course-progress/ulpan');
    assert.equal(anonymous.status, 401);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, contexts: 2, attempts: await attempts(pageB), offlineRecovery: true, anonymousDenied: true }));
  } catch (error) { throw new Error(error.stack + '\nserver log:\n' + logs.slice(-3000)); }
  finally { if (browser) await browser.close(); child.kill(); await Promise.race([new Promise(r => child.once('exit', r)), pause(5000)]); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
