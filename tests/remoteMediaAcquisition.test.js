const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = require('../public/js/remote-media-acquisition.js');

test('format presentation keeps complete video primary and hides raw tracks', () => {
  const matrix = R.presentOptions([
    { id: 'v360', kind: 'video', quality: 360, container: 'mp4', has_audio: true, size_bytes: 100 },
    { id: 'v720', kind: 'video', quality: 720, container: 'mp4', has_audio: true, size_bytes: 90, recommended: true },
    { id: 'raw', kind: 'video_track', quality: 1080, container: 'mp4', has_audio: false, size_bytes: 60 },
    { id: 'a1', kind: 'audio', container: 'm4a', size_bytes: 30 },
    { id: 'c1', kind: 'captions', language: 'he', source_kind: 'auto' },
  ]);
  assert.deepEqual(matrix.primary.map(x => x.id), ['v720', 'v360']);
  assert.deepEqual(matrix.more.map(x => x.id), ['a1', 'c1']);
  assert.equal(matrix.primary.some(x => x.has_audio === false), false);
});

test('job request requires explicit rights basis and immutable plan selection', () => {
  assert.throws(() => R.buildJobRequest({ planToken: 'p', optionId: 'v720', rightsConfirmed: false }), /RIGHTS_REQUIRED/);
  assert.deepEqual(R.buildJobRequest({ planToken: 'p', optionId: 'v720', rightsConfirmed: true }), {
    plan_token: 'p', option_id: 'v720', rights_basis: { kind: 'rights_holder_permission' },
  });
});

test('audio or captions remain immediately actionable when no complete video fits', () => {
  const matrix = R.presentOptions([
    { id: 'raw', kind: 'video_track', quality: 1080, has_audio: false },
    { id: 'audio', kind: 'audio', container: 'm4a' },
    { id: 'captions', kind: 'captions', language: 'he', source_kind: 'manual' },
  ]);
  assert.deepEqual(matrix.primary.map(x => x.id), ['audio', 'captions']);
  assert.deepEqual(matrix.more, []);
});

test('Node app exposes only a signed capability mint and contains no media proxy route', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /\/api\/media-acquisition\/capability/);
  assert.match(server, /requireUser/);
  assert.match(server, /requireCsrf/);
  assert.match(server, /parsed\.origin \+ \(pathname === "\/" \? "" : pathname\)/);
  assert.doesNotMatch(server, /media-acquisition\/.*(?:pipe|createReadStream)/);
});

test('Add Material keeps one recent shortcut and routes the complete list to Import Center', () => {
  const shelf = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'studio-media-package.js'), 'utf8');
  assert.match(shelf, /models\.slice\(0,\s*1\)/);
  assert.match(shelf, /StudioPortableLearningPackage\.open\(\{\s*view:\s*'materials'\s*\}\)/);
  assert.doesNotMatch(shelf, /StudioImport\.open\(\{\s*tab:\s*['"]file['"]/);
});

test('Video preview is independent from the failed worker and Downr is an explicit external handoff', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const studio = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'studio-import.js'), 'utf8');
  const videoButton = html.match(/<button[^>]+id="v3ImportVideoBtn"[^>]*>/)?.[0] || '';

  assert.match(videoButton, /onclick="StudioImport\.mountVideoFromField\(\)"/);
  assert.match(videoButton, /data-i18n="studio\.import\.videoUrlBtn"/);
  assert.doesNotMatch(videoButton, /RemoteMediaAcquisition/);
  assert.doesNotMatch(html, /<script[^>]+remote-media-acquisition\.js/);
  assert.match(html, /id="v3DownrOpen"[^>]+onclick="StudioImport\.openDownrFromField\(\)"/);
  assert.match(html, /href="https:\/\/downr\.org\/"[^>]+rel="noopener noreferrer"/);
  assert.match(studio, /var canonicalUrl = "https:\/\/www\.youtube\.com\/watch\?v=" \+ videoId/);
  assert.match(studio, /externalWindow\.opener = null/);
  assert.match(studio, /externalWindow\.location\.replace\(DOWNR_URL\)/);
  assert.match(studio, /function chooseDownloadedMedia\(\) \{[\s\S]*?switchTab\("file"\);[\s\S]*?v3ImportAudio/);
});
