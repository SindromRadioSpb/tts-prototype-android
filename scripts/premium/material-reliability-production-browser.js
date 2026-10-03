'use strict';
// Anonymous, disposable browser only. No owner data or remote write requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const BASE = 'https://linguistpro.kolosei.com';
const RELEASE = process.env.MATERIAL_RELEASE_VERSION || '3.11.724';
const OUT = process.env.MATERIAL_RELEASE_OUTPUT ? path.resolve(process.env.MATERIAL_RELEASE_OUTPUT)
  : path.resolve(__dirname, '../../docs/research/reliability-performance/2026-10-03/production', RELEASE);
const normal = text => String(text || '').replace(/\s+/g, ' ').trim();
async function main() {
  assert.equal((await (await fetch(BASE + '/api/client-config?verify=' + Date.now())).json()).version, RELEASE);
  const browser = await chromium.launch({ headless: true });
  fs.mkdirSync(OUT, { recursive: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 850 } });
    await context.route('**/*', route => {
      const request = route.request();
      if (!request.url().startsWith(BASE) || !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.abort();
      return route.continue();
    });
    await context.addInitScript(() => { if (location.protocol !== 'https:') return;
      localStorage.setItem('app.locale', 'ru'); localStorage.setItem('onboardingSeen_v1', '1'); localStorage.setItem('phase6Decision_v1', 'declined'); });
    const errors = []; context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const catalog = await context.newPage();
    const started = Date.now();
    await catalog.goto(BASE + '/mediatheque.html', { waitUntil: 'domcontentloaded' });
    await catalog.locator('a[href*="public_work="]').first().waitFor({ timeout: 45000 });
    const catalogMs = Date.now() - started;
    const links = await catalog.locator('a[href*="public_work="]').evaluateAll(nodes => [...new Set(nodes.filter(node => node.getClientRects().length).map(node => node.getAttribute('href')))].slice(0, 2));
    assert.equal(links.length, 2);
    await catalog.screenshot({ path: path.join(OUT, 'catalog-desktop.png') });
    const materials = [];
    for (const [index, href] of links.entries()) {
      const url = new URL(href, BASE), slug = url.searchParams.get('public_corpus'), work = url.searchParams.get('public_work');
      const snapshot = url.searchParams.get('public_snapshot');
      const payload = await (await fetch(`${BASE}/api/public-corpora/${encodeURIComponent(slug)}/works/${encodeURIComponent(work)}?snapshot=${snapshot}`)).json();
      assert.equal(payload.item.snapshot_sha256, snapshot);
      const source = payload.item.snapshot.library.texts[0], expected = (source.rows || source.sentences)[0];
      const opened = context.waitForEvent('page');
      // Use the actual anchor and modified click, preserving normal new-tab semantics.
      const exactLink = catalog.locator('a[href*="public_work="]');
      const handles = await exactLink.elementHandles();
      const selected = await Promise.all(handles.map(async handle => ({ handle, href: await handle.getAttribute('href') })));
      await selected.find(item => item.href === href).handle.click({ modifiers: ['Control'] });
      const room = await opened;
      await room.waitForLoadState('domcontentloaded');
      await room.locator('#roomReaderTable tbody tr').first().waitFor({ timeout: 60000 });
      assert.equal(normal(await room.locator('#readerTitle').textContent()), normal(payload.item.title));
      const rendered = normal(await room.locator('#roomReaderTable tbody tr').first().textContent());
      assert.ok(rendered.includes(normal(expected.hebrew_plain || expected.he_plain)), 'Hebrew content matches the public snapshot');
      const ru = normal(expected.russian || expected.ru);
      if (ru) assert.ok(rendered.includes(ru), 'translation matches the same public snapshot');
      const landed = new URL(room.url());
      assert.equal(landed.searchParams.get('public_corpus'), slug); assert.equal(landed.searchParams.get('public_work'), work);
      const before = await room.evaluate(() => { window.reliabilitySentinel = true; return performance.timeOrigin; });
      await catalog.bringToFront(); await room.bringToFront();
      assert.equal(await room.evaluate(() => performance.timeOrigin), before);
      assert.equal(await room.evaluate(() => window.reliabilitySentinel), true);
      if (index === 1) await room.setViewportSize({ width: 380, height: 820 });
      await room.screenshot({ path: path.join(OUT, `reader-${index ? '380' : 'desktop'}.png`) });
      materials.push({ slug, work, snapshot, titleMatches: true, firstRowMatches: true, queryIdentityPreserved: true, modifiedClickNewTab: true, noReloadOnFocus: true });
      await room.close();
    }
    assert.deepEqual(errors, []);
    const result = { status: 'PASS', version: RELEASE, at: new Date().toISOString(), anonymous: true, catalogMs, materials, errors };
    fs.writeFileSync(path.join(OUT, 'browser.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
