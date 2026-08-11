const test = require('node:test');
const assert = require('node:assert/strict');
const MediaReadiness = require('../public/js/media-readiness.js');

const H = (char) => char.repeat(64);

test('video selection is unresolved and blocks ASR until exact media is ready', () => {
  const selected = MediaReadiness.initialForFile({ name: 'lesson.mp4', type: 'video/mp4' });
  assert.equal(selected.outcome, 'PROBING');
  assert.equal(MediaReadiness.canStartAsr(selected), false);
  assert.equal(MediaReadiness.canStartAsr({ outcome: 'READY', canonical_sha256: H('a') }), true);
});

test('mobile media uses Gemini only and can prove the selected bytes on the device', () => {
  const ios = MediaReadiness.deviceAsrPolicy(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1',
    true,
  );
  assert.deepEqual(ios, {
    mobile: true,
    provider: 'gemini',
    show_provider: true,
    allow_local: false,
    show_local_setup: false,
    requires_device_gate: true,
  });
  const ready = MediaReadiness.acceptDeviceReady({
    file: { name: 'clip.mp4' },
    sha256: H('d'),
    receipt: { pass: true, device_family: 'iPhone/iPad' },
  });
  assert.equal(MediaReadiness.canStartAsr(ready), true);
  assert.equal(ready.outcome, 'DEVICE_READY');
  assert.equal(ready.canonical_sha256, H('d'));
  assert.equal(MediaReadiness.compatibilityEvidence(ready).contract, 'verified-on-selected-device');
});

test('repair, transcode and blocked reports never silently start ASR', () => {
  for (const outcome of ['LOSSLESS_REPAIR', 'TRANSCODE_REQUIRED', 'BLOCKED']) {
    assert.equal(MediaReadiness.canStartAsr({ outcome, canonical_sha256: H('a') }), false);
  }
});

test('prepared file becomes the single canonical package identity before ASR', () => {
  const state = MediaReadiness.acceptPrepared({
    state: 'COMPLETE', output_sha256: H('b'), output_name: 'lesson-mobile.mp4',
    report: { outcome: 'READY', target_contract: 'linguistpro-mobile-v1' },
  });
  assert.equal(state.outcome, 'READY');
  assert.equal(state.canonical_sha256, H('b'));
  assert.equal(state.canonical_name, 'lesson-mobile.mp4');
  assert.equal(MediaReadiness.canStartAsr(state), true);
});

test('audio is ready without a video compatibility claim and transcript-only is explicitly not bound', () => {
  const audio = MediaReadiness.initialForFile({ name: 'lesson.m4a', type: 'audio/mp4' });
  assert.equal(audio.outcome, 'AUDIO_READY');
  assert.equal(MediaReadiness.canStartAsr(audio), true);
  const transcriptOnly = MediaReadiness.transcriptOnly();
  assert.equal(transcriptOnly.bind_outcome, 'not_bound');
  assert.equal(MediaReadiness.canStartAsr(transcriptOnly), true);
});

test('portable codec hint is normalized while honest codec state remains structured', () => {
  const evidence = MediaReadiness.compatibilityEvidence({
    outcome: 'READY', canonical_sha256: H('c'), target_contract: 'linguistpro-mobile-v1',
    codec_summary: { container: 'mp4', faststart: false, video_codec: 'h264', profile: 'Main', declared_level: 32,
      required_level: 32, pixel_format: 'yuv420p', width: 1280, height: 720, fps: 50,
      audio_codec: 'aac', audio_profile: 'HE-AAC', sample_rate: 44100, channels: 2 },
  });
  assert.equal(evidence.codec_hint, 'avc1.4D0020,mp4a.40.5');
  assert.equal(evidence.codec_summary.audio_profile, 'HE-AAC');
  assert.equal(evidence.codec_summary.faststart, false);
  assert.equal(evidence.codec_summary.fps, '50');
});

test('post-relink device gate rechecks exact SHA before actual-file playback', async () => {
  const expected = H('d');
  let playbackCalls = 0;
  const receipt = await MediaReadiness.exactFileDeviceGate(
    { name: 'lesson.mp4', type: 'video/mp4', arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
    expected,
    {
      sha256Hex: async () => expected,
      playback: async () => { playbackCalls += 1; return { pass: true, device_family: 'iPhone/iPad', seek25: 25, seek75: 75 }; },
    },
  );
  assert.equal(playbackCalls, 1);
  assert.equal(receipt.media_sha256, expected);
  assert.equal(receipt.device_family, 'iPhone/iPad');
});

test('post-relink device gate names exact-SHA mismatch and never tries playback', async () => {
  let playbackCalls = 0;
  await assert.rejects(
    MediaReadiness.exactFileDeviceGate(
      { name: 'wrong.mp4', type: 'video/mp4', arrayBuffer: async () => new Uint8Array([9]).buffer },
      H('e'),
      { sha256Hex: async () => H('f'), playback: async () => { playbackCalls += 1; } },
    ),
    error => error && error.code === 'MEDIA_DEVICE_GATE_SHA_MISMATCH' && error.expected_sha === H('e') && error.actual_sha === H('f'),
  );
  assert.equal(playbackCalls, 0);
});

test('device receipt names deterministic browser and OS families', () => {
  assert.deepEqual(
    MediaReadiness.devicePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1'),
    { device_family: 'iPhone/iPad', os_family: 'iOS/iPadOS', browser_family: 'Safari' },
  );
  assert.deepEqual(
    MediaReadiness.devicePlatform('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/138.0 Mobile Safari/537.36'),
    { device_family: 'Android', os_family: 'Android', browser_family: 'Chrome' },
  );
});
