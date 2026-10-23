'use strict';
// S4: measure the word layers after the real table is wrapped and scrolled.
// This deliberately excludes initial table layout; it is not total cold-open latency.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { fork, execFileSync } = require('node:child_process'), { chromium } = require('playwright');
const { createHash } = require('node:crypto');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const arg = name => process.argv.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3);
const root = path.resolve(__dirname, '../..'), remote = arg('base'), surface = arg('surface') || 'classic';
const shape = arg('shape') || 'rows', mobile = process.argv.includes('--mobile'), priority = process.argv.includes('--expect-priority');
const requestedCount = Number(arg('rows') || 2500);
const ref = arg('ref'), runtimeFiles = ['js/word-gloss.js', 'js/word-gloss-ai.js', 'js/reader-morph.js', 'js/library-ui.js', 'css/reader-morph.css'];
const out = path.resolve(arg('out') || '.tmp/reader-performance/word-layer-priority.json');
assert.ok(['classic', 'ide', 'room'].includes(surface)); assert.ok(['rows', 'paragraphs'].includes(shape));
(async () => {
 const server = remote ? null : fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: root,
  env: smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-word-priority-')), 0), silent: true, windowsHide: true });
 server?.stdout.resume(); server?.stderr.resume(); let browser, page;
 const report = { surface, shape, mobile, ref: ref || null, startedAtUtc: new Date().toISOString(), scope: 'Disposable Chromium; prepared real table, saved manual context and restored row before each layer. Layer timings exclude DB/table opening. HTTP cache disabled by routing; SW blocked. No owner profile or paid generation.', errors: [], deniedWrites: [] };
 try {
  const base = remote || 'http://127.0.0.1:' + await waitForSmokeServer(server, 30000);
  if (remote) { assert.ok(arg('version')); report.version = (await (await fetch(base + '/api/client-config?verify=' + Date.now())).json()).version; assert.equal(report.version, arg('version')); }
  browser = await chromium.launch({ headless: true }); report.browser = browser.version();
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: mobile ? { width: 380, height: 780 } : { width: 1280, height: 900 } });
  const sources = new Map(runtimeFiles.map(file => [file, ref ? execFileSync('git', ['show', ref + ':public/' + file], { cwd: root, encoding: 'utf8', maxBuffer: 4e6 }) : fs.readFileSync(path.join(root, 'public', file), 'utf8').replace(/\r\n/g, '\n')]));
  if (!remote) report.runtimeHashes = Object.fromEntries([...sources].map(([file, content]) => [file, createHash('sha256').update(content).digest('hex')]));
  assert.ok(!remote || !ref, 'Production must use served runtime bytes');
  await context.route('**/*', async route => {
   const req = route.request(), url = new URL(req.url());
   if (!['GET', 'HEAD'].includes(req.method())) report.deniedWrites.push({ path: url.pathname, method: req.method() });
   if (url.origin !== base || !['GET', 'HEAD'].includes(req.method())) return route.abort();
   const historical = ref && sources.get(url.pathname.slice(1));
   if (historical) { const response = await route.fetch(); return route.fulfill({ response, body: historical }); }
   return route.continue();
  });
  await context.addInitScript(mobile => {
   localStorage.setItem('app.locale', mobile ? 'he' : 'ru'); localStorage.setItem('phase6Decision_v1', 'declined'); localStorage.setItem('onboardingSeen_v1', '1');
   for (const host of ['room', 'studio']) for (const option of ['Status', 'Gloss', 'GlossAi', 'Ribbon']) localStorage.setItem(host + '.word' + option, '0');
   const workers = new WeakSet(), pending = new Map(), post = Worker.prototype.postMessage;
   window.__s4Rpc = [];
   Worker.prototype.postMessage = function (message, ...rest) {
    if (message?.type === 'query' && window.__s4Phase) {
     if (!workers.has(this)) { workers.add(this); this.addEventListener('message', event => {
      const p = pending.get(event.data?.id); if (p) { p.ms = performance.now() - p.start; pending.delete(event.data.id); }
     }); }
     const entry = { phase: window.__s4Phase, start: performance.now() }; __s4Rpc.push(entry); pending.set(message.id, entry);
    }
    return post.call(this, message, ...rest);
   };
  }, mobile);
  page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', msg => { if (msg.text().startsWith('S4:')) console.log(msg.text()); });
  await page.goto(base + '/?localMode=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__localDB?.isReady() && window.WordGlossAI && window.StudioMorph);
  const fixture = await page.evaluate(async ({ shape, requestedCount }) => {
   const count = shape === 'rows' ? requestedCount : 34, repeats = shape === 'rows' ? 4 : 120;
   const rows = Array.from({ length: count }, (_, i) => ({ id: 's4-row-' + i, order_index: i,
    he_plain: Array(repeats).fill('שלום עולם').join(' '), he_niqqud: Array(repeats).fill('שָׁלוֹם עוֹלָם').join(' '), ru: 'Сохранённый контекст ' + i, translit: 'stored' }));
   await __localDB.importBundle({ texts: [{ id: 's4-material', text_key: 's4-material', title: 'S4 priority fixture', sentences: rows }] }, { mode: 'skip' });
   const [text] = await __localDB.dbQuery('SELECT id FROM texts WHERE text_key=?', ['s4-material']);
   const data = await __localDB.getSentences(text.id); window.__s4TextId = text.id;
   const saved = { schema: WordGlossAI.LAYER_SCHEMA, rows: data.map((row, i) => {
    const p = WordGlossAI.rowPayloadFromData(row);
    return { order_index: i, key: p.key, model: 'synthetic-saved', mwe: [], glosses: p.words.map((_, j) => ({ gloss: 'CONTEXT-' + i + ':' + j, ...(j === 0 ? { manual: true, ai_gloss: 'original-' + i } : {}) })) };
   }) };
   const remembered = await WordGlossAI.remember(saved, data); if (remembered.stored !== count) throw Error('Fixture rejected');
   window.__s4Rows = data.map(r => ({ he: r.he_plain, he_niqqud: r.he_niqqud, ru: r.ru, translit: r.translit, _v3_sentenceId: r.id, _v3_textId: r.text_id, _v3_orderIndex: r.order_index }));
   return { count, wordsPerRow: repeats * 2, target: count - 4, textId: text.id };
  }, { shape, requestedCount });
  report.fixture = fixture;
  if (surface === 'room') {
   await page.goto(base + '/library.html?my_text=' + encodeURIComponent(fixture.textId), { waitUntil: 'domcontentloaded' });
   await page.waitForFunction(() => window.WordGlossAI && window.ReaderMorph && document.querySelectorAll('#roomReaderTable #proTable tbody tr').length > 0);
  } else await page.evaluate(({ surface, mobile }) => {
   applyPreset('full'); if (surface === 'ide') v3IdeApplyMode(true);
   if (surface === 'ide') { currentTableData = __s4Rows; v3IdeState.activeTextId = __s4TextId; v3IdeRenderTable(__s4Rows, __s4TextId); }
   else v3RenderTableFromLibrary(__s4Rows);
   if (surface === 'ide' && mobile) { if (v3IdeState.leftOpen) v3IdeToggleLeft(); if (v3IdeState.rightOpen) v3IdeToggleRight(); }
  }, { surface, mobile });
  await page.waitForFunction(({ count, wordsPerRow }) => document.querySelectorAll('#proTable td[data-col="niqqud"] .rm-w').length === count * wordsPerRow, fixture);
  await page.evaluate(({ surface, target }) => {
   document.querySelectorAll("[id*='OnboardingModal'],#v3Phase6Modal").forEach(el => el.remove());
   window.__s4Mount = document.getElementById(surface === 'room' ? 'roomReaderTable' : surface === 'ide' ? 'v3IdeCenterContent' : 'tableContainer');
   window.__s4Target = __s4Mount.querySelector('tr[data-row-idx="' + target + '"]');
   __s4Target.querySelector('td[data-col="niqqud"] .rm-w').scrollIntoView({ block: 'center' });
  }, { surface, target: fixture.target });
  await page.waitForTimeout(150); // Settle restored scroll, observers and unrelated host refresh.
  const layerWork = page.evaluate(async ({ target }) => {
   const mount = __s4Mount, tr = __s4Target, samples = {}, longTasks = [];
   const po = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => ({ at: e.startTime, duration: e.duration })))); po.observe({ type: 'longtask' });
   const table = mount.querySelector('#proTable'), row = tr.querySelector('td[data-col="niqqud"] .rm-w');
   function position() { const ancestors = []; for (let el = row.parentElement; el; el = el.parentElement) if (el.scrollTop || el.id === mount.id) ancestors.push({ id: el.id, top: el.scrollTop, height: el.clientHeight, scrollHeight: el.scrollHeight }); return { wordTop: row.getBoundingClientRect().top, scrollY, ancestors }; }
   const rect = row.getBoundingClientRect();
   if (rect.bottom <= 0 || rect.top >= innerHeight) throw Error('Restored word is not visible');
   for (const layer of ['gloss', 'status']) {
    window.__s4Phase = layer;
    row.scrollIntoView({ block: 'center' });
    const positionBefore = position();
    console.log('S4: starting ' + layer);
    const start = performance.now(), seen = new Set(); let mutations = 0;
    const observer = new MutationObserver(entries => {
     for (const e of entries) {
      const sp = e.target;
      if (!sp.matches('.rm-w')) continue;
      const painted = layer === 'gloss' ? sp.hasAttribute('data-gloss') : /rm-w-(?:unassessed|known|learning|l[1-4])/.test(sp.className);
      if (!painted) continue;
      mutations++; seen.add(Number(sp.closest('tr').dataset.rowIdx));
      if (sp.closest('tr') === tr && !samples[layer]) {
       samples[layer] = { firstTargetMs: performance.now() - start, rowsBeforeTarget: seen.size - 1 };
       requestAnimationFrame(() => { samples[layer].firstTargetFrameMs = performance.now() - start; });
       console.log('S4: first target ' + layer + ' ' + JSON.stringify(samples[layer]));
      }
     }
    });
    observer.observe(mount, { subtree: true, attributes: true, attributeFilter: layer === 'gloss' ? ['data-gloss'] : ['class'] });
    if (layer === 'gloss') await WordGloss.apply(mount, { gloss: true, strict: true, ai: false });
    else await ReaderMorph.decorateWords(mount, {}, { color: true, fadeMode: 'full' });
    await new Promise(r => requestAnimationFrame(r)); observer.disconnect();
    if (!samples[layer]) throw Error('Visible ' + layer + ' was never painted');
    const rpc = __s4Rpc.filter(e => e.phase === layer);
    Object.assign(samples[layer], { completeMs: performance.now() - start, rowsPainted: seen.size, mutations, rpcCount: rpc.length, rpcTotalMs: rpc.reduce((s, e) => s + (e.ms || 0), 0), positionBefore, positionAfter: position() });
    console.log('S4: finished ' + layer + ' ' + JSON.stringify(samples[layer]));
   }
   let refreshMutations = 0;
   const refreshObserver = new MutationObserver(es => { refreshMutations += es.filter(e => e.target.matches('.rm-w') && /gloss/.test(e.attributeName)).length; });
   refreshObserver.observe(mount, { subtree: true, attributes: true });
   await WordGloss.apply(mount, { gloss: true, strict: true, ai: false });
   await new Promise(r => setTimeout(r, 0)); refreshObserver.disconnect();
   po.disconnect();
   window.__s4LayersDone = true;
   return { ...samples, unchangedRefreshGlossMutations: refreshMutations, tablePreserved: mount.querySelector('#proTable') === table,
    targetGloss: row.dataset.gloss, targetSource: row.dataset.glossSource, targetAiOriginal: WordGlossAI.wordAt(tr, 0).aiGloss,
    maxLongTaskMs: Math.max(0, ...longTasks.map(e => e.duration)), longTasks, target };
  }, fixture);
  await page.waitForFunction(() => __s4Target.querySelector('td[data-col="niqqud"] .rm-w')?.dataset.glossSource === 'user');
  const cardStarted = Date.now();
  const word = page.locator('#proTable tr[data-row-idx="' + fixture.target + '"] td[data-col="niqqud"] .rm-w').first();
  await word.evaluate(el => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  await page.waitForFunction(() => { const r = __s4Target.querySelector('td[data-col="niqqud"] .rm-w').getBoundingClientRect(); return r.top >= 0 && r.bottom < innerHeight; });
  const box = await word.boundingBox(); assert.ok(box);
  report.cardAttempt = { box, hit: await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 500), { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 10) }) };
  await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 10));
  const clickedAt = Date.now();
  await page.waitForFunction(target => document.querySelector('.rm-sheet.rm-open .rm-current-reading')?.textContent.includes('CONTEXT-' + target + ':0'), fixture.target, { timeout: 10000 });
  report.card = { method: 'native mouse at visible word', clickMs: clickedAt - cardStarted, contentAfterClickMs: Date.now() - clickedAt, openMs: Date.now() - cardStarted, openedBeforeLayersComplete: await page.evaluate(() => !window.__s4LayersDone) };
  await page.locator('.rm-sheet.rm-open .rm-sheet-x').click();
  report.layers = await layerWork;
  assert.equal(report.layers.targetGloss, 'CONTEXT-' + fixture.target + ':0'); assert.equal(report.layers.targetSource, 'user');
  assert.equal(report.layers.targetAiOriginal, 'original-' + fixture.target); assert.equal(report.layers.tablePreserved, true);
  assert.equal(await page.locator('#proTable td[data-col="niqqud"] .rm-w[data-gloss]').count(), fixture.count * fixture.wordsPerRow);
  for (const layer of ['gloss', 'status']) assert.equal(report.layers[layer].rowsPainted, fixture.count);
  if (priority) {
   for (const layer of ['gloss', 'status']) {
    assert.ok(report.layers[layer].rowsBeforeTarget < 12, layer + ' prioritizes the restored viewport');
    assert.ok(Math.abs(report.layers[layer].positionAfter.wordTop - report.layers[layer].positionBefore.wordTop) < 60, layer + ' retains the visible reading position');
   }
   assert.equal(report.layers.unchangedRefreshGlossMutations, 0); assert.equal(report.card.openedBeforeLayersComplete, true);
  }
  const later = Math.floor(fixture.count / 2);
  const pendingBefore = await page.evaluate(later => __s4Mount.querySelector('tr[data-row-idx="' + later + '"]').classList.contains('rm-gloss-pending'), later);
  if (priority) assert.equal(pendingBefore, true, 'distant gloss is prepared without changing row height');
  const laterWord = page.locator('#proTable tr[data-row-idx="' + later + '"] td[data-col="niqqud"] .rm-w').first();
  await laterWord.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await page.waitForFunction(later => !__s4Mount.querySelector('tr[data-row-idx="' + later + '"]').classList.contains('rm-gloss-pending'), later);
  report.scroll = await page.evaluate(later => {
   const row = __s4Mount.querySelector('tr[data-row-idx="' + later + '"]'), word = row.querySelector('td[data-col="niqqud"] .rm-w');
   return { later, shown: getComputedStyle(word, '::before').display, gloss: word.dataset.gloss, originalStillRevealed: !__s4Target.classList.contains('rm-gloss-pending') };
  }, later);
  assert.equal(report.scroll.shown, 'block'); assert.equal(report.scroll.gloss, 'CONTEXT-' + later + ':0'); assert.equal(report.scroll.originalStillRevealed, true);
  fs.mkdirSync(path.dirname(out), { recursive: true }); await page.screenshot({ path: out.replace(/\.json$/, '-visible.png') });
  if (shape === 'paragraphs') {
   await page.emulateMedia({ media: 'print' });
   report.print = await page.evaluate(() => { const row = __s4Mount.querySelector('tr.rm-gloss-pending'), word = row?.querySelector('td[data-col="niqqud"] .rm-w'); return word ? { pending: true, display: getComputedStyle(word, '::before').display } : { pending: false }; });
   if (priority) { assert.equal(report.print.pending, true); assert.equal(report.print.display, 'block'); }
   await page.emulateMedia({ media: 'screen' });
  }
  report.reviewLogCount = await page.evaluate(async () => (await __localDB.dbQuery('SELECT COUNT(*) n FROM review_log'))[0].n);
  assert.equal(report.reviewLogCount, 0); assert.deepEqual(report.deniedWrites, []); assert.deepEqual(report.errors, []);
  report.result = 'PASS'; console.log(JSON.stringify({ ...report, layers: { ...report.layers, longTasks: undefined } }));
 } catch (e) {
  report.result = 'FAIL'; report.failure = e.stack;
  report.diagnostic = await page?.evaluate(() => ({ openCard: !!document.querySelector('.rm-sheet.rm-open'), reading: document.querySelector('.rm-sheet.rm-open .rm-current-reading')?.textContent,
   target: window.__s4Target?.querySelector('.rm-w')?.outerHTML, targetRect: window.__s4Target?.getBoundingClientRect().toJSON(), layersDone: window.__s4LayersDone,
   textAtCenter: document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.outerHTML.slice(0, 500) })).catch(() => null);
  throw e;
 }
 finally { await browser?.close(); server?.kill(); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); }
})().catch(e => { console.error(e); process.exitCode = 1; });
