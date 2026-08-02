const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/js/media-package-core.js');
const StudioMediaPackage = require('../public/js/studio-media-package.js');

const SHA = '094164e9c94ce623df765600bb0bd2f2b1715fb08bd5050ae53de7427eae8b90';

test('legacy audio passport promotes seconds to bounded millisecond raw cues without confusing ordinals', () => {
  const input = StudioMediaPackage.passportToPromotionInput({
    kind: 'audio', method: 'local-faster-whisper',
    audio: {
      media: { sha256: SHA, mime: 'audio/mpeg', durationSec: 7, originalName: 'mia.mp3', opfsPath: `media/${SHA}.mp3` },
      asr: { method: 'local-faster-whisper', model: 'ivrit-ai/turbo', codeVersion: '3.11.279' },
      segments: [
        { i: 0, id: 'provider-7', start: 1, end: 2.5, text: 'שלום' },
        { i: 1, start: 3, text: 'מיה' },
      ],
    },
  });
  assert.equal(input.format, 'asr');
  assert.equal(input.media.sha256, SHA);
  assert.deepEqual(input.segments.map((s) => [s.start_ms, s.end_ms, s.source_line_index]), [[1000, 2500, 0], [3000, 7000, 1]]);
  assert.equal(input.segments[0].source_segment_id, undefined, 'provider id is not promoted as canonical raw id');
});

test('scalar source label inside a real Studio passport is not mistaken for a wrapper', () => {
  const input = StudioMediaPackage.passportToPromotionInput({
    kind: 'upload', source: 'local-file', method: 'local',
    audio: { media: { sha256: 'a'.repeat(64) }, asr: { language: 'he' }, segments: [{ start: 0, end: 1, text: 'שלום' }] },
  });
  assert.equal(input.kind, 'audio');
  assert.equal(input.segments.length, 1);
  assert.equal(input.media.sha256, 'a'.repeat(64));
});

test('captions passport with unknown final end remains honest and blocks export later', () => {
  const input = StudioMediaPackage.passportToPromotionInput({
    kind: 'captions', captions: {
      captions: { format: 'youtube-panel', language: 'he' },
      segments: [{ i: 0, start: 4, text: 'אחד' }, { i: 1, start: 7, text: 'שתיים' }],
    },
  });
  assert.deepEqual(input.segments.map((s) => s.end_ms), [7000, null]);
  assert.equal(input.media.sha256, null);
});

test('caption rawSource is parsed before fallback segments and keeps subtitle timing', () => {
  const input = StudioMediaPackage.passportToPromotionInput({
    kind: 'captions', captions: {
      captions: { format: 'vtt', language: 'he', fileName: 'fixture.vtt' },
      rawSource: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nשלום\n',
      segments: [{ start: 9, end: 10, text: 'fallback' }],
    },
  });
  assert.equal(input.format, 'vtt');
  assert.deepEqual(input.segments.map((segment) => [segment.start_ms, segment.end_ms, segment.text]), [[1000, 2000, 'שלום']]);
});

test('revision projection is hash-labelled and lives at one explicit compatibility home', async () => {
  const raw = await Core.createRawRevision({ media_sha256: SHA, format: 'asr', segments: [{ start_ms: 0, end_ms: 1000, text: 'שלום' }] });
  const corrected = Core.createCorrectedDraft(raw.segments, { id_factory: () => 'cseg:1' });
  const hash = await Core.revisionHash('user_corrected', corrected, []);
  const projection = StudioMediaPackage.buildCompatibilityProjection({
    package_id: 'mpkg:1', track_id: 'track:1', revision_id: 'rev:1', canonical_sha256: hash,
    segments: corrected,
  }, { kind: 'audio', media: { sha256: SHA, mime: 'audio/mpeg' } });
  assert.equal(projection.media_package_ref.projection_sha256, hash);
  assert.equal(projection.audio.projection_of_revision_id, 'rev:1');
  assert.equal(projection.audio.segments[0].caption_segment_id, 'cseg:1');
  assert.equal(projection.table_model_meta, undefined);
});

test('compatibility projection keeps the table player on the canonical OPFS media', async () => {
  const raw = await Core.createRawRevision({ media_sha256: SHA, format: 'asr', segments: [{ start_ms: 0, end_ms: 1000, text: 'שלום' }] });
  const corrected = Core.createCorrectedDraft(raw.segments, { id_factory: () => 'cseg:media' });
  const hash = await Core.revisionHash('user_corrected', corrected, []);
  const projection = StudioMediaPackage.buildCompatibilityProjection({
    package_id: 'mpkg:media', track_id: 'track:media', revision_id: 'rev:media', canonical_sha256: hash, segments: corrected,
  }, { kind: 'audio', media: {
    sha256: SHA, mime: 'video/mp4', opfs_path: `media/${SHA}.mp4`, duration_ms: 2177000,
    original_name: 'interview.mp4', size_bytes: 42, session_only: false,
  } });
  assert.deepEqual(projection.audio.media, {
    sha256: SHA, mime: 'video/mp4', opfsPath: `media/${SHA}.mp4`, durationSec: 2177,
    originalName: 'interview.mp4', sizeBytes: 42, sessionOnly: false,
  });
  assert.equal(projection.audio.media.opfs_path, undefined, 'legacy table playback has one normalized media shape');
});

test('cloud slim filter removes local track snapshots but leaves an honest package stub', () => {
  const sourceMeta = { source: {
    kind: 'audio', media_package_ref: { package_id: 'mpkg:1', track_id: 'track:1', revision_id: 'rev:1', projection_sha256: 'b'.repeat(64) },
    audio: { media: { sha256: SHA }, segments: [{ text: 'personal speech' }], raw: { text: 'secret' }, timing: { entries: [] } },
    captions: { segments: [{ text: 'also secret' }] },
  } };
  const filtered = StudioMediaPackage.filterForCloudSlim(sourceMeta);
  assert.equal(filtered.source.audio.segments, undefined);
  assert.equal(filtered.source.audio.raw, undefined);
  assert.equal(filtered.source.captions.segments, undefined);
  assert.deepEqual(filtered.source.media_package_ref, {
    package_id: 'mpkg:1', local_only: true, media_included: false, revision_sha256: 'b'.repeat(64),
  });
  assert.equal(sourceMeta.source.audio.segments[0].text, 'personal speech', 'input must not be mutated');
});

test('preview correction retains IDs when cue count matches and preserves text when it changes', () => {
  const segments = [
    { caption_segment_id: 'c1', source_segment_ids: ['s1'], start_ms: 0, end_ms: 1000, text: 'אחד', speaker: null, authority: { text: 'provider', timing: 'provider', speaker: 'unknown' }, quality_flags: [] },
    { caption_segment_id: 'c2', source_segment_ids: ['s2'], start_ms: 1100, end_ms: 2000, text: 'שתיים', speaker: null, authority: { text: 'provider', timing: 'provider', speaker: 'unknown' }, quality_flags: [] },
  ];
  const sameCount = StudioMediaPackage.reconcileCorrectedPreview(segments, 'אחד מתוקן\nשתיים');
  assert.deepEqual(sameCount.segments.map((segment) => segment.caption_segment_id), ['c1', 'c2']);
  assert.equal(sameCount.segments[0].text, 'אחד מתוקן');
  const changedCount = StudioMediaPackage.reconcileCorrectedPreview(segments, 'אחד\nשתיים\nשלוש');
  assert.equal(changedCount.segments.length, 1);
  assert.equal(changedCount.segments[0].text, 'אחד\nשתיים\nשלוש');
  assert.deepEqual(changedCount.segments[0].source_segment_ids, ['s1', 's2']);
});

test('workspace view model exposes honest lifecycle state without copying transcript content', () => {
  const model = StudioMediaPackage.workspaceViewModel({
    package_id: 'mpkg:1', corrected_track_id: 'track:1', current_revision_id: 'rev:2',
    current_revision_sha256: 'b'.repeat(64), revision_no: 2, original_name: 'mia.mp3',
    duration_ms: 122000, mime: 'audio/mpeg', media_sha256: SHA, media_available: false,
    has_draft: true, binding_count: 1, updated_at: '2026-08-01T12:00:00.000Z',
  }, { stale: true, active: true });
  assert.deepEqual(model, {
    package_id: 'mpkg:1', track_id: 'track:1', revision_id: 'rev:2', revision_sha256: 'b'.repeat(64),
    title: 'mia.mp3', duration_ms: 122000, media_kind: 'audio', revision_no: 2,
    has_draft: true, media_missing: true, binding_count: 1, stale: true, active: true,
    updated_at: '2026-08-01T12:00:00.000Z', raw_immutable: true,
  });
  assert.equal(JSON.stringify(model).includes('segments'), false, 'catalog model must not duplicate transcript content');
});

test('media relink keeps exact SHA security and exposes actionable mismatch evidence', async () => {
  const expected = await Core.sha256Hex(new Uint8Array([1, 2, 3]));
  const actual = await Core.sha256Hex(new Uint8Array([1, 2, 4]));
  await assert.rejects(
    StudioMediaPackage.verifyRelinkBytes(expected, new Uint8Array([1, 2, 4])),
    (error) => {
      assert.equal(error.code, 'MEDIA_SHA_MISMATCH');
      assert.equal(error.expected_sha, expected);
      assert.equal(error.actual_sha, actual);
      assert.match(error.actual_sha, /^[0-9a-f]{64}$/);
      return true;
    },
  );
  assert.equal(await StudioMediaPackage.verifyRelinkBytes(expected, new Uint8Array([1, 2, 3]).buffer), true, 'File.arrayBuffer() must be hashed as bytes, not as "[object ArrayBuffer]"');
});
