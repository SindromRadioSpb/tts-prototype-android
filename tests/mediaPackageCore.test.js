const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../public/js/media-package-core.js');

const MEDIA_SHA = '094164e9c94ce623df765600bb0bd2f2b1715fb08bd5050ae53de7427eae8b90';

function rawInput() {
  return [
    { start_ms: 1000, end_ms: 2600, text: 'שלום מיה', source_line_index: 0 },
    { start_ms: 2800, end_ms: 5100, text: 'מה שלומך?', source_line_index: 1, quality_flags: ['blind'] },
  ];
}

test('raw normalization is deterministic and volatile provenance cannot alter source ids', async () => {
  const a = await Core.createRawRevision({
    media_sha256: MEDIA_SHA,
    format: 'asr',
    provider: 'local-faster-whisper',
    model: 'ivrit-ai/whisper-large-v3-turbo-ct2',
    model_revision: '72ad623a37947395efcc3933132353790e5a12f5',
    segments: rawInput(),
    provenance: { imported_at: '2026-07-31T10:00:00Z', hardware: 'gpu-a' },
  });
  const b = await Core.createRawRevision({
    media_sha256: MEDIA_SHA,
    format: 'asr',
    provider: 'local-faster-whisper',
    model: 'ivrit-ai/whisper-large-v3-turbo-ct2',
    model_revision: '72ad623a37947395efcc3933132353790e5a12f5',
    segments: rawInput(),
    provenance: { imported_at: 'tomorrow', hardware: 'gpu-b' },
  });
  assert.equal(a.canonical_sha256, b.canonical_sha256);
  assert.deepEqual(a.segments.map((s) => s.source_segment_id), b.segments.map((s) => s.source_segment_id));
  assert.match(a.segments[0].source_segment_id, new RegExp(`^srcseg:${MEDIA_SHA}:`));
});

test('raw track operations fail closed', async () => {
  const raw = await Core.createRawRevision({ media_sha256: MEDIA_SHA, format: 'vtt', segments: rawInput() });
  for (const op of [
    { type: 'edit_text', caption_segment_id: 'x', text: 'changed' },
    { type: 'edit_timing', caption_segment_id: 'x', start_ms: 0, end_ms: 10 },
    { type: 'split', caption_segment_id: 'x', at_ms: 5, text_left: 'a', text_right: 'b' },
    { type: 'merge', caption_segment_ids: ['a', 'b'] },
    { type: 'offset', delta_ms: 100 },
  ]) assert.throws(() => Core.applyOperation('raw_original', raw.segments, op), /RAW_IMMUTABLE/);
});

test('corrected edit retains id; split and merge mint ids with complete lineage', async () => {
  const raw = await Core.createRawRevision({ media_sha256: MEDIA_SHA, format: 'vtt', segments: rawInput() });
  let corrected = Core.createCorrectedDraft(raw.segments, { id_factory: (() => { let n = 0; return () => `cseg:${++n}`; })() });
  const firstId = corrected[0].caption_segment_id;
  corrected = Core.applyOperation('user_corrected', corrected, { type: 'edit_text', caption_segment_id: firstId, text: 'שלום, מיה!' }).segments;
  assert.equal(corrected[0].caption_segment_id, firstId);
  assert.equal(corrected[0].authority.text, 'user');
  const split = Core.applyOperation('user_corrected', corrected, {
    type: 'split', caption_segment_id: firstId, at_ms: 1800,
    text_left: 'שלום,', text_right: 'מיה!', id_factory: (() => { let n = 20; return () => `cseg:${++n}`; })(),
  });
  assert.deepEqual(split.segments.slice(0, 2).map((s) => s.source_segment_ids), [[raw.segments[0].source_segment_id], [raw.segments[0].source_segment_id]]);
  assert.notEqual(split.segments[0].caption_segment_id, firstId);
  const merged = Core.applyOperation('user_corrected', split.segments, {
    type: 'merge', caption_segment_ids: split.segments.slice(0, 2).map((s) => s.caption_segment_id),
    id_factory: () => 'cseg:merged',
  });
  assert.equal(merged.segments[0].caption_segment_id, 'cseg:merged');
  assert.deepEqual(merged.segments[0].source_segment_ids, [raw.segments[0].source_segment_id]);
  assert.equal(merged.operation.type, 'merge');
});

test('VTT and SRT standalone round-trip preserve semantic tuples and blind warnings', async () => {
  const source = [
    { caption_segment_id: 'cseg:a', source_segment_ids: ['src:a'], start_ms: 1200, end_ms: 3456, text: 'שלום\nמיה', speaker: null, authority: { text: 'user', timing: 'provider', speaker: 'unknown' }, quality_flags: [] },
    { caption_segment_id: 'cseg:b', source_segment_ids: ['src:b'], start_ms: 4000, end_ms: 6010, text: 'מה שלומך?', speaker: 'מראיינת', authority: { text: 'provider', timing: 'provider', speaker: 'user' }, quality_flags: ['blind'] },
  ];
  const before = await Core.semanticHash(source);
  for (const format of ['vtt', 'srt']) {
    const serialized = Core.serializeSubtitles(format, source);
    const parsed = Core.parseSubtitles(serialized, { hint: format });
    assert.equal(parsed.ok, true);
    assert.equal(await Core.semanticHash(parsed.segments), before);
    if (format === 'vtt') {
      assert.equal(parsed.segments[0].caption_segment_id, 'cseg:a');
      assert.deepEqual(parsed.segments[1].quality_flags, ['blind']);
    }
  }
  assert.throws(() => Core.parseSubtitles('not subtitles'), /SUBTITLES_UNKNOWN_FORMAT/);
  assert.throws(() => Core.serializeSubtitles('vtt', [{ start_ms: 0, end_ms: null, text: 'tail' }]), /SEGMENT_END_REQUIRED/);
});

test('overlap is warned, gap remains a fact, invalid timing is rejected', () => {
  const report = Core.validateSegments([
    { start_ms: 0, end_ms: 2000, text: 'a' },
    { start_ms: 1500, end_ms: 2500, text: 'b' },
    { start_ms: 5000, end_ms: 6000, text: 'c' },
  ]);
  assert.deepEqual(report.warnings.map((w) => w.code), ['SEGMENT_OVERLAP', 'SEGMENT_GAP']);
  assert.throws(() => Core.validateSegments([{ start_ms: 2, end_ms: 1, text: 'bad' }]), /SEGMENT_TIMING_INVALID/);
});

test('blind ASR text may remain honestly untimed without inventing a timestamp', async () => {
  const input = [
    { start_ms: 1000, end_ms: 2000, text: 'known' },
    { start_ms: null, end_ms: null, text: 'provider text without a usable mark', quality_flags: ['blind'] },
    { start_ms: 3000, end_ms: 4000, text: 'known again' },
  ];
  const report = Core.validateSegments(input);
  assert.deepEqual(report.warnings.map((warning) => warning.code), ['SEGMENT_TIMING_MISSING']);
  const raw = await Core.createRawRevision({ media_sha256: MEDIA_SHA, format: 'asr', segments: input });
  assert.equal(raw.segments[1].start_ms, null);
  assert.equal(raw.segments[1].end_ms, null);
  assert.equal(raw.segments[1].authority.timing, 'unknown');
  assert.ok(raw.segments[1].quality_flags.includes('blind'));
  assert.throws(
    () => Core.validateSegments([{ start_ms: null, end_ms: null, text: 'not marked blind' }]),
    /SEGMENT_TIMING_INVALID/,
  );
  assert.throws(
    () => Core.validateSegments([{ start_ms: null, end_ms: 2000, text: 'half invented', quality_flags: ['blind'] }]),
    /SEGMENT_TIMING_INVALID/,
  );
});

test('preview resegmentation never mutates raw and collapses corrected with complete lineage', async () => {
  const raw = await Core.createRawRevision({ media_sha256: 'f'.repeat(64), format: 'asr', segments: [
    { start_ms: 0, end_ms: 1000, text: 'אחד' }, { start_ms: 1100, end_ms: 2000, text: 'שתיים' },
  ] });
  const rawBefore = JSON.stringify(raw.segments);
  const corrected = Core.createCorrectedDraft(raw.segments, { id_factory: (() => { let i = 0; return () => `cseg:${i++}`; })() });
  const result = Core.applyOperation('user_corrected', corrected, { type: 'replace_text_layout', text: 'אחד מתוקן\nשתיים ושלוש', id_factory: () => 'cseg:replacement' });
  assert.equal(JSON.stringify(raw.segments), rawBefore);
  assert.equal(result.segments.length, 1);
  assert.deepEqual(result.segments[0].source_segment_ids, raw.segments.map((segment) => segment.source_segment_id).sort());
  assert.ok(result.segments[0].quality_flags.includes('PREVIEW_RESEGMENTED'));
  assert.equal(result.segments[0].authority.timing, 'derived');
});
