const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = require('../public/js/remote-media-acquisition.js');

test('format presentation exposes complete video and audio as separate choices', () => {
  const matrix = R.presentOptions([
    { id: 'v360', kind: 'video', quality: 360, container: 'mp4', has_audio: true, size_bytes: 100 },
    { id: 'v720', kind: 'video', quality: 720, container: 'mp4', has_audio: true, size_bytes: 90, recommended: true },
    { id: 'raw', kind: 'video_track', quality: 1080, container: 'mp4', has_audio: false, size_bytes: 60 },
    { id: 'a1', kind: 'audio', container: 'm4a', size_bytes: 30 },
    { id: 'c1', kind: 'captions', language: 'he', source_kind: 'auto' },
  ]);
  assert.deepEqual(matrix.video.map(x => x.id), ['v360', 'v720']);
  assert.deepEqual(matrix.audio.map(x => x.id), ['a1']);
  assert.equal(matrix.video.some(x => x.has_audio === false), false);
});

test('job request requires explicit rights basis and immutable plan selection', () => {
  assert.throws(() => R.buildJobRequest({ planToken: 'p', optionId: 'v720', rightsConfirmed: false }), /RIGHTS_REQUIRED/);
  assert.deepEqual(R.buildJobRequest({ planToken: 'p', optionId: 'v720', rightsConfirmed: true }), {
    plan_token: 'p', option_id: 'v720', rights_basis: { kind: 'rights_holder_permission' },
  });
});

test('audio remains available when no complete video fits; captions are a separate existing flow', () => {
  const matrix = R.presentOptions([
    { id: 'raw', kind: 'video_track', quality: 1080, has_audio: false },
    { id: 'audio', kind: 'audio', container: 'm4a' },
    { id: 'captions', kind: 'captions', language: 'he', source_kind: 'manual' },
  ]);
  assert.deepEqual(matrix.audio.map(x => x.id), ['audio']);
  assert.deepEqual(matrix.video, []);
});

test('Node app exposes only a signed capability mint and contains no media proxy route', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /\/api\/media-acquisition\/capability/);
  assert.match(server, /requireUser/);
  assert.match(server, /requireCsrf/);
  assert.match(server, /parsed\.origin \+ \(pathname === "\/" \? "" : pathname\)/);
  assert.doesNotMatch(server, /media-acquisition\/.*(?:pipe|createReadStream)/);
});

test('draft lifecycle stays in Import Center and cannot reappear as an Add Material shelf', () => {
  const shelf = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'studio-media-package.js'), 'utf8');
  // 26ddba76 moved the full lifecycle out of the Add Material composer.
  assert.doesNotMatch(shelf, /renderActiveWorkspace|renderWorkspaceShelf/);
  assert.match(shelf, /StudioPortableLearningPackage\.open\(\{\s*view:\s*'materials'\s*\}\)/);
  assert.doesNotMatch(shelf, /StudioImport\.open\(\{\s*tab:\s*['"]file['"]/);
});

test('link acquisition is embedded while video preview remains independent of the worker', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const studio = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'studio-import.js'), 'utf8');
  const videoButton = html.match(/<button[^>]+id="v3ImportVideoBtn"[^>]*>/)?.[0] || '';

  assert.match(videoButton, /onclick="StudioImport\.mountVideoFromField\(\)"/);
  assert.match(videoButton, /data-i18n="studio\.import\.videoUrlBtn"/);
  assert.doesNotMatch(videoButton, /RemoteMediaAcquisition/);
  assert.match(html, /<script[^>]+remote-media-acquisition\.js/);
  assert.match(html, /id="v3RemoteMediaResolve"[^>]+onclick="RemoteMediaAcquisition\.resolveFromField\(\)"/);
  assert.doesNotMatch(html, /href="https:\/\/downr\.org\/"/);
  assert.match(studio, /verification\.method !== "ffprobe-and-faststart-remux-v1"/);
});

test('recovery journal rejects malformed paths and retains no competing media bytes', () => {
  const record = { version: 1, requestId: 'a'.repeat(32), scope: 'b'.repeat(64), source: { video_id: 'dH_OkB7Uym4' },
    option: { kind: 'video' }, state: 'complete', stored: { opfsPath: 'media/' + 'c'.repeat(64) + '.mp4',
      sha256: 'c'.repeat(64), sizeBytes: 10 }, receipt: { output_sha256: 'c'.repeat(64), output_size_bytes: 10 } };
  assert.equal(R.validateRecord(record), true);
  assert.equal(R.validateRecord({ ...record, receipt: null }), false);
  assert.equal(R.validateRecord({ ...record, stored: { ...record.stored, opfsPath: '../outside.mp4' } }), false);
  assert.deepEqual(R.readRecords({ getItem: () => '{malformed' }), []);
});
