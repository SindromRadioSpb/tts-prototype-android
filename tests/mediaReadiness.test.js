const test = require('node:test');
const assert = require('node:assert/strict');
const MediaReadiness = require('../public/js/media-readiness.js');

const H = (char) => char.repeat(64);

test('audio conversion and track choice are actionable preflight states, not blocked video', () => {
  for (const [outcome, key] of [['AUDIO_TRANSCODE_REQUIRED', 'mediaAudioTranscodeRequired'],
    ['AUDIO_CHOICE_REQUIRED', 'mediaAudioChoiceRequired']]) {
    const state = MediaReadiness.acceptReport({job_id:'fixture',state:'WAITING_FOR_DECISION',report:{outcome}});
    assert.equal(MediaReadiness.statusKey(state),key);
    assert.equal(MediaReadiness.canStartAsr(state),false, 'preparation is still required before recognition');
  }
  assert.equal(MediaReadiness.statusKey({outcome:'BLOCKED'}),'mediaBlocked');
});

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

test('a failed preparation keeps the companion contract diagnosis', () => {
  const state = MediaReadiness.acceptReport({
    job_id: 'job-failed', state: 'FAILED', progress: 1,
    error: 'MEDIA_PREPARE_OR_VERIFY_FAILED', error_type: 'MediaJobConflict',
    error_detail: 'prepared media does not satisfy target contract',
    report: { outcome: 'TRANSCODE_REQUIRED' },
  });
  assert.equal(state.state, 'FAILED');
  assert.equal(state.progress, 1);
  assert.equal(state.reason, 'prepared media does not satisfy target contract');
  assert.equal(state.error_type, 'MediaJobConflict');
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
      playback: async () => { playbackCalls += 1; return { pass: true, device_family: 'iPhone/iPad', duration: 1080.16907, seek25: 270.0422675, seek75: 810.1268025 }; },
    },
  );
  assert.equal(playbackCalls, 1);
  assert.equal(receipt.media_sha256, expected);
  assert.equal(receipt.device_family, 'iPhone/iPad');
  assert.equal(receipt.duration, 1080.16907);
  assert.equal(receipt.seek25, 270.0422675);
  assert.equal(receipt.seek75, 810.1268025);
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

test('companion container evidence survives into readiness and never starts ASR by itself', () => {
  const state = MediaReadiness.acceptReport({
    job_id: 'job-1', state: 'WAITING_FOR_DECISION', progress: 0.2,
    report: {
      outcome: 'AUDIO_TRANSCODE_REQUIRED', reason: 'audio_codec_or_layout_mismatch',
      next_action: 'review-and-confirm-audio-transcode',
      plan: { mode: 'audio_transcode', selected_audio_stream: 2 }, plan_sha256: H('a'),
      lite_plan: { mode: 'lite_transcode', height: 540 }, lite_plan_sha256: H('b'), lite_reason: null,
      audio_selection: { index: 2, language: 'he', reason: 'target_language_tag' },
      audio_choices: [{ index: 1, language: 'ru' }, { index: 2, language: 'he' }],
      track_inventory: { schema: 'media-track-inventory-v1', audio: [{ index: 2 }], subtitles: [{ index: 7 }] },
      subtitle_tracks: [{ index: 7, status: 'extracted', format: 'srt', sha256: H('c') }],
    },
  });
  assert.equal(state.outcome, 'AUDIO_TRANSCODE_REQUIRED');
  assert.equal(state.plan.mode, 'audio_transcode');
  assert.equal(state.lite_plan.height, 540);
  assert.equal(state.lite_plan_sha256, H('b'));
  assert.equal(state.lite_reason, null);
  assert.equal(state.audio_selection.language, 'he');
  assert.equal(state.audio_choices.length, 2);
  assert.equal(state.track_inventory.subtitles[0].index, 7);
  assert.equal(state.subtitle_tracks[0].sha256, H('c'));
  assert.equal(MediaReadiness.canStartAsr(state), false);
  assert.equal(MediaReadiness.canStartAsr({ outcome: 'AUDIO_STREAM_CHOICE_REQUIRED', canonical_sha256: H('a') }), false);
});

test('only verified text subtitle tracks can become a material', () => {
  const subtitle_tracks = [
    { index: 4, status: 'extracted', format: 'srt', sha256: H('a') },
    { index: 9, status: 'image_based', format: null, sha256: null },
    { index: 10, status: 'extraction_failed', format: null, sha256: null },
    { index: 11, status: 'extracted', format: 'srt', sha256: null },
  ];
  assert.deepEqual(MediaReadiness.usableSubtitleTracks({ subtitle_tracks }).map((track) => track.index), [4]);
  assert.deepEqual(MediaReadiness.usableSubtitleTracks({}), []);
});

test('video carries its own 3 GiB ceiling, separate from the audio upload limit', () => {
  assert.equal(MediaReadiness.VIDEO_MAX_BYTES, 3 * 1024 * 1024 * 1024);
  assert.equal(MediaReadiness.AUDIO_MAX_BYTES, 300 * 1024 * 1024);
  assert.equal(
    MediaReadiness.sizeLimitFor({ name: 'episode.mkv', type: 'video/x-matroska' }),
    MediaReadiness.VIDEO_MAX_BYTES,
  );
  assert.equal(
    MediaReadiness.sizeLimitFor({ name: 'lesson.mp3', type: 'audio/mpeg' }),
    MediaReadiness.AUDIO_MAX_BYTES,
  );
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
