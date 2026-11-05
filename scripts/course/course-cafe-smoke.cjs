'use strict';
// P8a browser acceptance for the Cafe exemplar: every step at 320/390/1440 px, with media, without media
// (404) and with reduced motion. Isolated server and database; no production or paid traffic.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer, waitForSmokeHealth } = require('../smoke-server-env');
const { buildCourseData } = require('./build-course-data.cjs');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(process.argv[2] || path.join(root, '.tmp/course-cafe-smoke'));
const pause = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const parent = path.join(root, '.tmp/course-cafe-smoke-data'); fs.mkdirSync(parent, { recursive: true });
  const data = fs.mkdtempSync(path.join(parent, 'run-'));
  buildCourseData(path.join(root, 'content/course/ulpan'), path.join(data, 'course'));
  const lesson = JSON.parse(fs.readFileSync(path.join(root, 'content/course/ulpan/lessons/L001-cafe.json'), 'utf8'));
  const total = lesson.flow.reduce((n, p) => n + p.steps.length, 0);
  const stepOf = ref => { let i = 0; for (const p of lesson.flow) for (const s of p.steps) { if (s.ref === ref || s.kind === ref) return i; i++; } return -1; };
  const secret = 'course-cafe-smoke-disposable-owner-0123456789';
  const child = spawn(process.execPath, ['-e', SMOKE_SERVER_BOOTSTRAP], { cwd: root, env: { ...smokeServerEnv(data, 0), AUTH_BOOTSTRAP_SECRET: secret, TTS_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  let logs = '', browser; child.stdout.on('data', x => logs += x); child.stderr.on('data', x => logs += x);
  const report = { steps: total, runs: [] };
  try {
    const base = 'http://127.0.0.1:' + await waitForSmokeServer(child, 30000);
    await waitForSmokeHealth(base, { timeoutMs: 60000 });
    browser = await chromium.launch({ headless: true });
    const runs = [
      { name: '320-media', width: 320 }, { name: '390-media', width: 390 }, { name: '1440-media', width: 1440 },
      { name: '390-nomedia', width: 390, blockMedia: true }, { name: '390-reduced', width: 390, reduced: true }
    ];
    for (const run of runs) {
      const context = await browser.newContext({ viewport: { width: run.width, height: 800 }, serviceWorkers: 'block', reducedMotion: run.reduced ? 'reduce' : 'no-preference' });
      await context.addInitScript(() => { localStorage.setItem('lp_world_v1', JSON.stringify({ id: 'classic' })); });
      await context.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.origin !== base) return route.abort();
        if (run.blockMedia && u.pathname.includes('/data/course/ulpan/media/')) return route.fulfill({ status: 404, body: '' });
        return route.continue();
      });
      assert.equal((await context.request.post(base + '/api/auth/bootstrap-login', { data: { secret } })).status(), 200);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/library.html#room=course%3Aulpan', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-course-lesson="L001-cafe"]', { timeout: 60000 });
      await page.evaluate(async () => { if (window.LPWorld) await window.LPWorld.set(null); });
      await page.locator('[data-course-lesson="L001-cafe"]').click();
      await page.waitForSelector('[data-course-part]');
      const first = page.url();
      const overflow = [];
      for (let st = 0; st < total; st++) {
        const url = /([?&#])st=\d+/.test(first) ? first.replace(/([?&#])st=\d+/, '$1st=' + st) : first + '&st=' + st;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-course-part]', { timeout: 30000 });
        await pause(150);
        const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
        if (w.scroll > w.inner) overflow.push({ st, ...w });
        if ([0, stepOf('g-adj'), stepOf('m-words'), stepOf('b-big-coffee'), stepOf('o-card'), stepOf('r-instead'), stepOf('text'), stepOf('x-kiosk'), total - 1].includes(st))
          await page.screenshot({ path: path.join(out, `${run.name}-st${String(st).padStart(2, '0')}.png`), fullPage: true });
      }
      // Meaning-bearing checks per mode.
      const go = async ref => { const st = stepOf(ref); await page.goto(first.replace(/([?&#])st=\d+/, '$1st=' + st), { waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-course-part]'); await pause(400); };
      await go('o-card');
      const card = await page.locator('[data-course-order-card]').innerText();
      if (run.blockMedia) assert.match(card, /Большой чай/, 'fallback card words without media');
      else assert.equal(await page.locator('[data-course-order-card] img').count(), 1);
      await go('r-instead');
      if (run.reduced) assert.match(await page.locator('[data-media="m-swap"] img').getAttribute('src'), new RegExp(lesson.media.find(m => m.id === 'm-swap').frames[2]));
      // Answer the order card to prove the task still works in every mode.
      await go('o-card');
      await page.locator('[data-course-input]').fill('אֶפְשָׁר תֵּה גָּדוֹל בְּלִי סֻכָּר, לָקַחַת?');
      await page.locator('[data-course-check]').click();
      assert.match(await page.locator('[data-course-feedback]').innerText(), /Смысл передан/);
      report.runs.push({ run: run.name, overflow, errors });
      assert.deepEqual(overflow, [], run.name + ': horizontal overflow');
      assert.deepEqual(errors, [], run.name + ': page errors');
      await context.close();
    }
    report.ok = true;
  } catch (e) { report.ok = false; report.error = e.message; report.logs = logs.slice(-3000); throw e; }
  finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser?.close(); child.kill();
  }
  console.log(JSON.stringify({ ok: report.ok, steps: total, runs: report.runs.map(r => r.run) }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
