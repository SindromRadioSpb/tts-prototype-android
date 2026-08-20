#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sqlite3 = require("sqlite3");
const { chromium } = require("playwright");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3318, BASE = `http://127.0.0.1:${PORT}`;
const secret = "publication-browser-smoke-secret";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lp-publication-browser-"));
const data = path.join(tmp, "data"), dbPath = path.join(data, "app.db");
const shots = process.env.PUBLICATION_SMOKE_SCREENSHOT_DIR
  ? path.resolve(process.env.PUBLICATION_SMOKE_SCREENSHOT_DIR)
  : path.join(ROOT, "docs", "research", "mass-access-public-corpora", "2026-08-20", "implementation", "screenshots");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const openDb = file => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db)); });
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
const closeDb = db => new Promise(resolve => db.close(resolve));
async function ready() { for (let i = 0; i < 120; i += 1) { try { const response = await fetch(BASE + "/healthz"); const body = await response.json(); if (response.ok && body.db && body.db.ready && body.migrations && body.migrations.ready) return; } catch (_) {} await sleep(150); } throw new Error("SERVER_NOT_READY"); }
async function stop(child) { if (!child || child.exitCode != null) return; child.kill("SIGTERM"); const done = await new Promise(resolve => { const timer = setTimeout(() => resolve(false), 4000); child.once("exit", () => { clearTimeout(timer); resolve(true); }); }); if (!done && process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); }
async function seed(ownerId) {
  const audio = fs.readFileSync(path.join(ROOT, "scripts", "premium", "fixtures", "ingest", "audio", "he-sample.mp3"));
  const audioKey = sha(audio);
  const bundle = Buffer.from(JSON.stringify({ library: { texts: [{ text_key: "browser-song", title: "שיר לדוגמה", source_meta_json: JSON.stringify({ group_corpus: { corpus_id: "browser-source" } }), rows: [{ order_index: 0, hebrew_plain: "שלום עולם", hebrew_niqqud: "שָׁלוֹם עוֹלָם", transliteration: "shalom olam", russian: "Привет, мир", audio_asset_key: audioKey }] }], audio_assets: [{ asset_key: audioKey, mime: "audio/mpeg" }] }, notes_advanced: {} }));
  const now = new Date().toISOString();
  const workRel = "group-corpora/browser-study/v1/works/song.json", audioRel = "group-corpora/browser-study/v1/audio/" + audioKey + ".mp3";
  fs.mkdirSync(path.dirname(path.join(data, workRel)), { recursive: true }); fs.mkdirSync(path.dirname(path.join(data, audioRel)), { recursive: true });
  fs.writeFileSync(path.join(data, workRel), bundle); fs.writeFileSync(path.join(data, audioRel), audio);
  const db = await openDb(dbPath);
  try {
    await run(db, "INSERT INTO reading_groups VALUES(?,?,'Учебные песни','ACTIVE',?,?)", ["browser-group", ownerId, now, now]);
    await run(db, "INSERT INTO reading_group_members VALUES(?,?,'OWNER','ACTIVE',?,?,NULL)", ["browser-group", ownerId, now, now]);
    await run(db, "INSERT INTO group_corpora VALUES(?,'browser-group','browser-study','Учебные песни','GROUP_RESTRICTED',1,'ACTIVE','LICENSED',?,?)", ["browser-source", now, now]);
    await run(db, `INSERT INTO group_corpus_works(corpus_id,work_id,text_key,position_no,title,artist,source_url,rights_status,bundle_path,bundle_sha256,rows_count,audio_count,notes_count,morph_count,source_updated_at,created_at,updated_at,audio_revision,audio_profile_json,audio_published_at,level,topic,tags_json,source_created_at)
      VALUES('browser-source','browser-song','browser-song',1,'שיר לדוגמה','מחבר לדוגמה',NULL,'APPROVED',?,?,1,1,0,0,?,?,?,1,NULL,NULL,'A1','songs','["song"]',?)`, [workRel, sha(bundle), now, now, now, now]);
    await run(db, `INSERT INTO group_corpus_audio(corpus_id,work_id,asset_key,relative_path,bytes,sha256,mime,created_at,revision) VALUES('browser-source','browser-song',?,?,?,?,'audio/mpeg',?,1)`, [audioKey, audioRel, audio.length, audioKey, now]);
  } finally { await closeDb(db); }
}
async function capture(page, file) {
  const report = await page.evaluate(() => {
    const dialog = document.getElementById("publicationCenterDialog"), body = document.getElementById("pcBody");
    const controls = Array.from(dialog.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)"));
    return { dir: document.documentElement.dir, lang: document.documentElement.lang, documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, dialogOverflow: dialog.scrollWidth > dialog.clientWidth, bodyOverflow: body.scrollWidth > body.clientWidth, open: dialog.open, controlCount: controls.length, tinyTargets: controls.filter(node => { const box = node.getBoundingClientRect(); return box.width < 44 || box.height < 44; }).map(node => node.id || node.textContent.trim().slice(0, 30)) };
  });
  await page.screenshot({ path: path.join(shots, file), fullPage: false });
  return report;
}

(async () => {
  fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(shots, { recursive: true });
  const server = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), BIND_HOST: "127.0.0.1", DATA_DIR: data, DB_PATH: dbPath, AUTH_BOOTSTRAP_SECRET: secret }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = ""; server.stdout.on("data", chunk => { logs += chunk; }); server.stderr.on("data", chunk => { logs += chunk; });
  let browser, guestContext;
  try {
    await ready();
    let response = await fetch(BASE + "/api/auth/bootstrap-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret, deviceLabel: "browser-seed" }) });
    const login = await response.json(); assert.strictEqual(response.status, 200, JSON.stringify(login) + "\n" + logs); await seed(login.user.id);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 820 }, locale: "ru-RU" });
    const page = await context.newPage(), pageErrors = [], consoleErrors = [], failedResponses = [];
    page.on("pageerror", error => pageErrors.push(String(error)));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("response", res => { if (res.status() >= 400 && /(?:publication-center|publication\/corpora|group-corpora)/.test(res.url())) failedResponses.push(res.status() + " " + res.url()); });
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(async value => { const response = await fetch("/api/auth/bootstrap-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: value, deviceLabel: "publication-browser" }) }); const body = await response.json(); localStorage.setItem("cloud.csrf", body.csrf); if (!response.ok) throw new Error(body.error); }, secret);
    await page.evaluate(async () => { window.appSetLocale("ru"); await window.PublicationCenter.open(); });
    await page.locator("#publicationCenterDialog[open]").waitFor();
    await page.locator("#pcCreateForm button[type=submit]").click();
    await page.locator("#pcCopyGroup").waitFor();
    await page.locator("#pcCopyGroup").click();
    await page.locator(".pc-item").first().waitFor();
    await page.locator("#pcApplyRights").click();
    await page.waitForFunction(() => document.querySelector(".pc-item-meta")?.textContent && !/pending|не заданы/i.test(document.querySelector(".pc-item-meta").textContent));
    await page.locator("#pcValidate").click();
    await page.locator(".pc-metrics").waitFor();
    const desktop = await capture(page, "publication-center-desktop-ru.png");
    await page.setViewportSize({ width: 380, height: 844 });
    const mobileRu = await capture(page, "publication-center-380-ru.png");
    await page.locator("#publicationCenterClose").focus();
    for (let i = 0; i < 18; i += 1) await page.keyboard.press("Tab");
    const keyboard = await page.evaluate(() => ({ trapped: document.getElementById("publicationCenterDialog").contains(document.activeElement), focusVisible: getComputedStyle(document.activeElement).outlineStyle !== "none" }));
    await page.keyboard.press("Escape"); assert.strictEqual(await page.locator("#publicationCenterDialog").evaluate(node => node.open), false);
    await page.evaluate(async () => { window.appSetLocale("he"); await window.PublicationCenter.open(); });
    await page.locator("#publicationCenterDialog[open]").waitFor();
    await page.waitForTimeout(250);
    const mobileHe = await capture(page, "publication-center-380-he-rtl.png");
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const zoom = await capture(page, "publication-center-380-he-rtl-200pct.png");
    assert.ok(desktop.open && mobileRu.open && mobileHe.open && zoom.open);
    for (const result of [desktop, mobileRu, mobileHe, zoom]) assert.ok(!result.documentOverflow && !result.dialogOverflow && !result.bodyOverflow, JSON.stringify(result));
    assert.strictEqual(desktop.dir, "ltr"); assert.strictEqual(mobileRu.dir, "ltr"); assert.strictEqual(mobileHe.dir, "rtl"); assert.strictEqual(zoom.dir, "rtl");
    for (const result of [desktop, mobileRu, mobileHe, zoom]) assert.deepStrictEqual(result.tinyTargets, [], JSON.stringify(result));
    assert.ok(keyboard.trapped && keyboard.focusVisible, JSON.stringify(keyboard));
    assert.deepStrictEqual(pageErrors, []); assert.deepStrictEqual(failedResponses, []);
    assert.deepStrictEqual(consoleErrors.filter(value => /publication|TypeError|ReferenceError/i.test(value)), [], JSON.stringify(consoleErrors));

    await page.evaluate(() => { document.documentElement.style.fontSize = ''; window.appSetLocale('ru'); });
    await page.locator('#pcValidate').click();
    await page.waitForFunction(() => { const button = document.getElementById('pcPublish'); return button && !button.disabled; });
    await page.locator('#pcPublish').click();
    await page.locator('#pcPublish').click();
    await page.locator('.pc-receipt').waitFor();
    const catalogResponse = await fetch(BASE + '/api/public-corpora/study-songs');
    const catalog = await catalogResponse.json(); assert.strictEqual(catalogResponse.status, 200); assert.strictEqual(catalog.items.length, 1);
    const publicWorkId = catalog.items[0].public_work_id;

    guestContext = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1280, height: 820 }, locale: 'ru-RU', acceptDownloads: true });
    await guestContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    const guest = await guestContext.newPage(), guestErrors = [], guestConsoleErrors = [], guestFailed = [], assetResponses = [], audioRequests = [];
    guest.on('pageerror', error => guestErrors.push(String(error)));
    guest.on('console', message => { if (message.type() === 'error') guestConsoleErrors.push(message.text()); });
    guest.on('response', response => {
      if (/\/api\/public-corpora\/.+\/assets\//.test(response.url())) assetResponses.push(response.status());
      if (response.status() >= 400 && /\/api\/public-corpora/.test(response.url())) guestFailed.push(response.status() + ' ' + response.url());
    });
    guest.on('request', request => { if (/\/api\/(?:public-corpora\/.+\/assets|audio)\//.test(request.url())) audioRequests.push(request.url()); });
    await guest.addInitScript(() => { localStorage.setItem('localMode', '1'); localStorage.setItem('v3OnboardingSeenV1', '1'); localStorage.setItem('onboardingSeen_v1', '1'); });
    const publicUrl = BASE + '/library.html?public_corpus=study-songs&cb=' + Date.now();
    await guest.goto(publicUrl, { waitUntil: 'domcontentloaded' });
    try { await guest.locator('[data-public-corpus="study-songs"]').waitFor({ state: 'attached', timeout: 8000 }); }
    catch (_) { await guest.reload({ waitUntil: 'domcontentloaded' }); }
    try { await guest.locator('[data-public-corpus="study-songs"]').waitFor({ timeout: 30000 }); }
    catch (error) {
      const publicProbe = await guest.evaluate(async () => {
        const response = await fetch('/api/public-corpora/study-songs', { cache: 'no-store' });
        const root = document.querySelector('[data-public-corpus="study-songs"]');
        const chain = []; for (let node = root; node && chain.length < 6; node = node.parentElement) chain.push({ tag: node.tagName, id: node.id, className: node.className, hidden: node.hidden, display: getComputedStyle(node).display, visibility: getComputedStyle(node).visibility, rect: node.getBoundingClientRect().toJSON() });
        return { status: response.status, body: (await response.text()).slice(0, 500), url: location.href, root_count: document.querySelectorAll('[data-public-corpus="study-songs"]').length, chain };
      }).catch(probeError => ({ error: String(probeError), url: guest.url() }));
      console.error(JSON.stringify({ guest_errors: guestErrors, guest_console_errors: guestConsoleErrors, guest_failed: guestFailed, public_probe: publicProbe, body: (await guest.locator('body').textContent()).slice(0, 1200), server_logs: logs.slice(-2400) }, null, 2));
      throw error;
    }
    const capturePublic = async (name) => {
      const report = await guest.evaluate(() => {
        const root = document.querySelector('[data-public-corpus]');
        const controls = Array.from(root.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)')).filter(node => node.getClientRects().length > 0);
        return { dir: document.documentElement.dir, lang: document.documentElement.lang,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          tinyTargets: controls.filter(node => { const rect = node.getBoundingClientRect(); return rect.width < 44 || rect.height < 44; }).map(node => node.getAttribute('aria-label') || node.textContent.trim().slice(0, 30)),
          catalog: !!root.querySelector('.corpus-catalog-region'),
          resultCount: root.querySelectorAll('[data-public-work]').length,
          publicTrust: root.textContent.includes('без аккаунта') || root.textContent.includes('ללא חשבון') || root.textContent.includes('ללא צורך בחשבון'),
          takedown: document.body.textContent.includes('peter@kolosei.com') };
      });
      await guest.screenshot({ path: path.join(shots, name), fullPage: false }); return report;
    };
    const publicDesktop = await capturePublic('public-study-songs-desktop-ru.png');
    assert.ok(publicDesktop.catalog && publicDesktop.resultCount === 1, JSON.stringify(publicDesktop));
    const publicSearch = guest.locator('#roomPublicCorpusSearch');
    const publicScope = guest.locator('#roomPublicCorpusScope');
    const publicAudio = guest.locator('#roomPublicCorpusAudio');
    const publicSort = guest.locator('#roomPublicCorpusSort');
    await publicScope.selectOption('title'); await publicSearch.fill('מחבר לדוגמה'); await guest.waitForTimeout(180);
    assert.strictEqual(await guest.locator('[data-public-work]').count(), 0, 'title-only search leaked creator matches');
    await publicScope.selectOption('creator'); await guest.waitForTimeout(180);
    assert.strictEqual(await guest.locator('[data-public-work]').count(), 1, 'creator-only search missed creator');
    await publicSearch.fill(''); await publicAudio.locator('[data-audio=missing]').click(); await guest.waitForTimeout(180);
    assert.strictEqual(await guest.locator('[data-public-work]').count(), 0, 'missing-audio filter included a complete package');
    await publicAudio.locator('[data-audio=complete]').click(); await publicSort.selectOption('title_desc'); await guest.waitForTimeout(180);
    assert.strictEqual(await guest.locator('[data-public-work]').count(), 1, 'complete-audio filter lost the complete package');
    assert.strictEqual(await guest.locator('.public-corpus-page-prev').count(), 1);
    assert.strictEqual(await guest.locator('.public-corpus-page-next').count(), 1);
    await publicScope.selectOption('all'); await publicAudio.locator('[data-audio=complete]').click(); await publicSort.selectOption('position'); await guest.waitForTimeout(180);
    await guest.setViewportSize({ width: 380, height: 844 });
    const publicMobileRu = await capturePublic('public-study-songs-380-ru.png');
    await guest.evaluate(() => window.appSetLocale('he'));
    await guest.waitForTimeout(150);
    const publicMobileHe = await capturePublic('public-study-songs-380-he-rtl.png');
    await guest.evaluate(() => window.appSetLocale('ru'));
    await guest.locator('.public-corpus input[type=search]').focus(); await guest.keyboard.press('Tab');
    const publicKeyboard = await guest.evaluate(() => ({ inside: !!document.activeElement.closest('[data-public-corpus]'), focusVisible: getComputedStyle(document.activeElement).outlineStyle !== 'none' }));

    await guest.locator('.public-corpus .room-text-secondary').first().click();
    await guest.locator('.room-share-sheet[role=dialog]').waitFor();
    await guest.getByRole('button', { name: 'Отправить ссылку' }).click();
    const copied = await guest.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied.endsWith('/library.html?public_corpus=study-songs&public_work=' + encodeURIComponent(catalog.items[0].public_work_id)), copied);
    const downloadPromise = guest.waitForEvent('download');
    await guest.getByRole('button', { name: 'Сохранить ZIP' }).click();
    const download = await downloadPromise, downloadPath = await download.path();
    assert.match(download.suggestedFilename(), /^study-songs-edition-1\.zip$/); assert.strictEqual(fs.readFileSync(downloadPath).subarray(0, 2).toString(), 'PK');
    await guest.getByRole('button', { name: 'Закрыть' }).click();

    await guest.locator('.public-corpus .room-text-title-link').first().click();
    await guest.locator('#roomReader:not([hidden]) #proTable tbody tr').first().hover();
    await guest.locator('#roomReader:not([hidden]) .row-tts-btn').waitFor({ timeout: 30000 });
    await guest.locator('#roomReader .row-tts-btn').first().click();
    await guest.waitForTimeout(3000);
    assert.ok(audioRequests.some(url => /\/api\/public-corpora\/study-songs\/assets\//.test(url)), JSON.stringify(audioRequests));
    await guest.screenshot({ path: path.join(shots, 'public-study-songs-reader-380-ru.png'), fullPage: false });
    const swState = await guest.evaluate(async () => { const registration = await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) return { ready: !!registration, controlled: false, caches: [] }; return { ready: true, controlled: true, caches: await caches.keys() }; });
    if (!swState.controlled) { await guest.reload({ waitUntil: 'domcontentloaded' }); await guest.locator('#roomReader:not([hidden])').waitFor({ timeout: 30000 }); }
    const cacheEvidence = await guest.evaluate(async () => { const names = await caches.keys(); const name = names.find(value => value.includes('public-corpus')); const keys = name ? await (await caches.open(name)).keys() : []; return { name: name || '', urls: keys.map(request => request.url) }; });
    assert.ok(cacheEvidence.urls.some(url => url.endsWith('/api/public-corpora')), JSON.stringify(cacheEvidence));
    assert.ok(cacheEvidence.urls.some(url => url.includes('/works/')), JSON.stringify(cacheEvidence));
    const rangeOnline = await guest.evaluate(async id => { const work = await (await fetch('/api/public-corpora/study-songs/works/' + id)).json(); const key = work.assets[0].asset_key; const response = await fetch('/api/public-corpora/study-songs/assets/' + key, { headers: { Range: 'bytes=0-3' } }); return { key, status: response.status, range: response.headers.get('content-range'), bytes: (await response.arrayBuffer()).byteLength }; }, publicWorkId);
    assert.strictEqual(rangeOnline.status, 206); assert.strictEqual(rangeOnline.bytes, 4); assert.match(rangeOnline.range, /^bytes 0-3\//);
    await guestContext.setOffline(true);
    await guest.reload({ waitUntil: 'domcontentloaded' });
    await guest.locator('#roomReader:not([hidden])').waitFor({ timeout: 30000 });
    assert.match(await guest.locator('#roomReader').textContent(), /שלום עולם/);
    const offline = await guest.evaluate(async key => { const response = await fetch('/api/public-corpora/study-songs/assets/' + key, { headers: { Range: 'bytes=1-2' } }); return { online: navigator.onLine, textVisible: document.getElementById('roomReader').textContent.includes('שלום עולם'), audio_status: response.status, audio_bytes: (await response.arrayBuffer()).byteLength }; }, rangeOnline.key);
    await guestContext.setOffline(false);
    await guest.reload({ waitUntil: 'domcontentloaded' });
    await guest.locator('#roomReader:not([hidden])').waitFor({ timeout: 30000 });
    const reconnect = await guest.evaluate(() => ({ online: navigator.onLine, textVisible: document.getElementById('roomReader').textContent.includes('שלום עולם') }));
    for (const result of [publicDesktop, publicMobileRu, publicMobileHe]) { assert.strictEqual(result.overflow, false, JSON.stringify(result)); assert.deepStrictEqual(result.tinyTargets, [], JSON.stringify(result)); assert.ok(result.publicTrust && result.takedown, JSON.stringify(result)); }
    assert.strictEqual(publicDesktop.dir, 'ltr'); assert.strictEqual(publicMobileRu.dir, 'ltr'); assert.strictEqual(publicMobileHe.dir, 'rtl');
    assert.ok(publicKeyboard.inside && publicKeyboard.focusVisible, JSON.stringify(publicKeyboard)); assert.ok(assetResponses.includes(200) || assetResponses.includes(206), JSON.stringify(assetResponses));
    assert.ok(!offline.online && offline.textVisible && offline.audio_status === 206 && offline.audio_bytes === 2, JSON.stringify(offline)); assert.ok(reconnect.online && reconnect.textVisible, JSON.stringify(reconnect));
    assert.deepStrictEqual(guestErrors, []); assert.deepStrictEqual(guestFailed, []);
    console.log(JSON.stringify({ gate: "PUBLICATION_CENTER_AND_PUBLIC_ROOM_BROWSER", publication_center: { desktop, mobile_ru: mobileRu, mobile_he: mobileHe, zoom_200: zoom, keyboard }, public_room: { work_id: publicWorkId, desktop_ru: publicDesktop, mobile_ru: publicMobileRu, mobile_he: publicMobileHe, keyboard: publicKeyboard, audio_http: assetResponses, audio_range_online: rangeOnline, zip_download: download.suggestedFilename(), cache: cacheEvidence, offline, reconnect }, page_errors: pageErrors.length + guestErrors.length, failed_public_responses: guestFailed.length, screenshots: ["publication-center-desktop-ru.png", "publication-center-380-ru.png", "publication-center-380-he-rtl.png", "publication-center-380-he-rtl-200pct.png", "public-study-songs-desktop-ru.png", "public-study-songs-380-ru.png", "public-study-songs-380-he-rtl.png", "public-study-songs-reader-380-ru.png"] }, null, 2));
    await guestContext.close(); guestContext = null;
    await context.close();
  } finally {
    if (guestContext) await guestContext.close();
    if (browser) await browser.close();
    await stop(server);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
