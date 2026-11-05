'use strict';
// Native Room integration in a fresh anonymous browser and disposable server/database.
// No production account, external network, paid services, or existing progress is used.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer, waitForSmokeHealth } = require('../smoke-server-env');
const { buildCourseData } = require('./build-course-data.cjs');
const E = require('../../public/js/course-evidence');
const root = path.resolve(__dirname, '../..');
const courseId = 'ulpan-cafe-b-pilot';
const source = path.join(root, 'content/course', courseId);
const read = file => JSON.parse(fs.readFileSync(path.join(source, file), 'utf8'));
const course = read('course.json'), lessons = course.lessons.map(id => read('lessons/' + id + '.json'));
const output = path.resolve(process.env.CAFE_B_SMOKE_OUTPUT || path.join(root, '.tmp/cafe-b-browser'));

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const data = fs.mkdtempSync(path.join(output, 'data-'));
  buildCourseData(source, path.join(data, 'course'));
  buildCourseData(path.join(root, 'content/course/ulpan'), path.join(data, 'course'));
  const child = spawn(process.execPath, ['-e', SMOKE_SERVER_BOOTSTRAP], {
    cwd: root, env: { ...smokeServerEnv(data, 0), TTS_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true
  });
  let logs = '', browser;
  child.stdout.on('data', value => logs += value); child.stderr.on('data', value => logs += value);
  const report = { courseId, evidence: 'automated disposable local browser', runs: [], ok: false };
  try {
    const base = 'http://127.0.0.1:' + await waitForSmokeServer(child, 30000);
    await waitForSmokeHealth(base, { timeoutMs: 60000 });
    if (process.argv.includes('--serve')) {
      console.log(JSON.stringify({ base, url: base + '/library.html#room=course%3A' + courseId, data }));
      await new Promise(resolve => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve); });
      return;
    }
    browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    for (const width of [320, 380, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      const legacy = E.emptyProgress('ulpan');
      legacy.reader = { position: { lessonId: 'L001-cafe', step: 7 }, tasks: {} };
      const legacyBytes = JSON.stringify(legacy);
      await context.addInitScript(bytes => {
        localStorage.setItem('lp_world_v1', JSON.stringify({ id: 'classic' }));
        if (!localStorage.getItem('lp.course.anon.ulpan.v1')) localStorage.setItem('lp.course.anon.ulpan.v1', bytes);
      }, legacyBytes);
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [], overflow = [];
      page.on('pageerror', error => errors.push(error.message));
      const home = base + '/library.html#room=course%3A' + courseId;
      await page.goto(home, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-course-lesson="B000-foundations"]', { timeout: 60000 });
      await page.evaluate(async () => { if (window.LPWorld) await window.LPWorld.set(null); });
      assert.equal(await page.locator('[data-course-lesson]').count(), 2);
      for (const lesson of lessons) {
        const steps = lesson.flow.flatMap(part => part.steps);
        for (const [step, definition] of steps.entries()) {
          await page.goto(home + '&les=' + lesson.id + '&st=' + step, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('[data-course-step="' + step + '"]', { timeout: 30000 });
          const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }));
          if (size.scroll > size.inner + 1) overflow.push({ lessonId: lesson.id, step, ...size });
          assert.equal(await page.locator('[data-course-play]').count(), 0, 'no unapproved audio controls');
          if (step === 0 || definition.kind === 'summary' || definition.metLexIds?.length)
            await page.screenshot({ path: path.join(output, width + '-' + lesson.id + '-' + step + '.png'), fullPage: true });
        }
      }
      const main = lessons.find(l => l.id === 'B001-cafe'), steps = main.flow.flatMap(p => p.steps);
      const task = main.tasks.find(t => t.spec && t.model && t.type === 'text' && t.evidenceLexIds.length > 0 && t.evidenceLexIds.length < 8);
      const step = steps.findIndex(s => s.kind === 'task' && s.ref === task.id);
      await page.goto(home + '&les=' + main.id + '&st=' + step, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-course-input]');
      await page.locator('[data-course-input]').fill(task.model.plain);
      await page.locator('[data-course-check]').click();
      assert.match(await page.locator('[data-course-feedback]').innerText(), /Смысл передан/);
      const snapshot = await page.evaluate(id => JSON.parse(localStorage.getItem('lp.course.anon.' + id + '.v1')), courseId);
      assert.deepEqual(snapshot.attempts.at(-1).lexIds, task.evidenceLexIds);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-course-input]');
      assert.equal(await page.locator('[data-course-input]').inputValue(), task.model.plain);
      await page.locator('[data-course-home]').click();
      await page.waitForSelector('[data-course-lesson="B001-cafe"]');
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-course-input]');
      assert.equal(await page.evaluate(() => localStorage.getItem('lp.course.anon.ulpan.v1')), legacyBytes);
      assert.deepEqual(overflow, [], width + ': horizontal overflow');
      assert.deepEqual(errors, [], width + ': page errors');
      report.runs.push({ width, steps: lessons.reduce((n, l) => n + l.flow.flatMap(p => p.steps).length, 0), overflow, errors, legacyUnchanged: true });
      await context.close();
    }
    report.ok = true;
  } catch (error) { report.error = error.message; report.serverLog = logs.slice(-2000); throw error; }
  finally {
    if (!process.argv.includes('--serve')) fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close(); child.kill();
  }
  console.log(JSON.stringify({ ok: report.ok, runs: report.runs }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
