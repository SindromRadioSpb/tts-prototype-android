'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const core = require('../public/js/iphone-downloader-core.js');
const job = 'a'.repeat(32);
const request = { v: 1, job, source: 'njtNjn4ya2U', rights: 'permission', language: 'ru', action: 'start' };

test('phone downloader validates the whole launch request, not raw shell text', () => {
  assert.deepEqual(core.request(request), request);
  for (const change of [{ job: '../owner' }, { source: 'x;open evil' }, { rights: '' },
    { language: 'ru;ls' }, { action: 'exec' }, { url: 'https://evil.test' }, { v: 2 }]) {
    assert.throws(() => core.request({ ...request, ...change }));
  }
});

test('phone downloader preserves strict URL identity and discards tracking data', () => {
  assert.equal(core.videoId('https://youtu.be/njtNjn4ya2U?t=25'), 'njtNjn4ya2U');
  assert.equal(core.videoId('https://www.youtube.com/shorts/njtNjn4ya2U'), 'njtNjn4ya2U');
  for (const source of ['https://evil.test/njtNjn4ya2U', 'http://youtu.be/njtNjn4ya2U',
    'https://u:pw@youtu.be/njtNjn4ya2U', 'https://youtu.be/njtNjn4ya2U;ls',
    'https://youtube.com/watch?v=njtNjn4ya2U&v=njtNjn4ya2U']) assert.throws(() => core.videoId(source));
});

test('return is bound to a locally requested job and remains helper-reported evidence', () => {
  const result = { v: 1, job, source: request.source, state: 'ready', kind: 'video', quality: 360,
    name: 'A video.mp4', bytes: 10000, sha256: 'b'.repeat(64) };
  const returned = core.acceptReturn(request, result);
  assert.equal(returned.state, 'helper_ready');
  assert.equal(returned.evidence, 'HELPER_REPORTED');
  assert.equal(returned.browser_file_verified, false);
  for (const change of [{ job: 'c'.repeat(32) }, { source: 'dH_OkB7Uym4' },
    { bytes: 400 * 1024 * 1024 }, { name: '../owner.mp4' }, { sha256: 'fake' }, { quality: 999 }]) {
    assert.throws(() => core.acceptReturn(request, { ...result, ...change }));
  }
  assert.throws(() => core.acceptReturn(null, result));
});

test('opening helper is never completion; malformed returns cannot create a completed row', () => {
  const row = core.started(request, 100);
  assert.equal(row.state, 'requested');
  assert.equal(row.browser_file_verified, false);
  assert.throws(() => core.acceptReturn(request, { ...request, state: 'ready' }));
  assert.throws(() => core.decode('a'.repeat(8193)));
});

test('shipped helper matches current sources and the owner-qualified engine exactly', () => {
  const root = path.resolve(__dirname, '..');
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/js/iphone-downloader-release.js'), 'utf8'), context);
  const release = context.window.IPhoneDownloaderRelease;
  const bytes = fs.readFileSync(path.join(root, 'public', release.path));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), release.sha256);
  assert.equal(bytes.length, release.bytes);
  const zip = new AdmZip(bytes);
  const manifest = JSON.parse(zip.readAsText('manifest.json'));
  for (const [name, hash] of Object.entries(manifest.files)) {
    assert.equal(crypto.createHash('sha256').update(zip.readFile(name)).digest('hex'), hash, name);
  }
  const sources = { '__main__.py': 'scripts/premium/iphone-downloader/__main__.py',
    'runner.py': 'scripts/premium/iphone-downloader/runner.py', 'ui.js': 'scripts/premium/iphone-downloader/native-ui.js',
    'ui.css': 'public/css/iphone-downloader.css' };
  for (const [packed, source] of Object.entries(sources)) assert.ok(zip.readFile(packed).equals(fs.readFileSync(path.join(root, source))), source + ' requires package rebuild');
  const probe = new AdmZip(fs.readFileSync(path.join(root, 'public/downloads/linguistpro-iphone-probe-0744253a.zip')));
  assert.ok(zip.readFile('probe.py').equals(probe.readFile('LinguistPro-iPhone-probe/run.py')));
  for (const name of ['__init__.py', 'jobs.py', 'planner.py', 'receipts.py', 'media_verify.py']) {
    assert.ok(zip.readFile('acquisition_service/' + name).equals(probe.readFile('LinguistPro-iPhone-probe/acquisition_service/' + name)), name);
  }
  const copy = JSON.parse(zip.readAsText('copy.json'));
  for (const language of ['ru', 'en', 'he']) {
    const locale = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'public/i18n/locales/' + language + '.js'), 'utf8'), locale);
    assert.deepEqual(copy[language], JSON.parse(JSON.stringify(locale.window.I18N_LOCALES[language].phoneDownload)));
  }
  const bootstrap = Buffer.from(release.bootstrap, 'base64').toString('utf8');
  assert.ok(bootstrap.includes(release.sha256));
  assert.ok(bootstrap.includes('https://linguistpro.kolosei.com' + release.path));
  assert.equal(core.launch(request, release).length < 4096, true);
});

test('navigation and downloader assets do not call transcription or acquisition APIs', () => {
  const root = path.resolve(__dirname, '..');
  for (const file of ['public/js/iphone-downloader.js', 'public/js/iphone-downloader-entry.js', 'scripts/premium/iphone-downloader/native-ui.js']) {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|innerHTML|clipboard\.|transcribeAudio\s*\(|acceptRemoteAcquisition\s*\(/);
  }
  const shell = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(shell, /id="v3PhoneDownloader" hidden/);
  for (const asset of ['/download-media.html', '/js/iphone-downloader-core.js?v=1', '/js/iphone-downloader-entry.js?v=1',
    '/js/iphone-downloader.js?v=1', '/js/iphone-downloader-release.js?v=1', '/css/iphone-downloader.css?v=1']) {
    assert.ok(sw.includes('"' + asset + '"'), 'precache ' + asset);
    assert.ok(server.includes('"' + asset + '"'), 'integrity ' + asset);
  }
});
