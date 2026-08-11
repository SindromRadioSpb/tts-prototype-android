const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../public/js/media-package-core.js');
const StudioMediaPackage = require('../public/js/studio-media-package.js');

const SHA = '094164e9c94ce623df765600bb0bd2f2b1715fb08bd5050ae53de7427eae8b90';
const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

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

test('owner-shaped ASR promotion keeps missing and duplicate marks blind instead of blocking the package', async () => {
  const input = StudioMediaPackage.passportToPromotionInput({
    kind: 'audio', method: 'gemini-asr', audio: {
      media: { sha256: SHA, mime: 'video/mp4', durationSec: 60, originalName: 'owner-shape.mp4' },
      asr: { method: 'gemini-asr', model: 'gemini-flash-latest' },
      segments: [
        { i: 0, start: 30, text: 'known before' },
        { i: 1, start: null, text: 'honestly untimed', blind: true, quality_flags: ['blind'] },
        { i: 2, start: 40, text: 'duplicate left' },
        { i: 3, start: 40, text: 'duplicate right' },
        { i: 4, start: 50, text: 'known after' },
      ],
    },
  });
  assert.deepEqual(input.segments.map((segment) => [segment.start_ms, segment.end_ms]), [
    [30000, null], [null, null], [40000, null], [40000, 50000], [50000, 60000],
  ]);
  assert.ok(input.segments[1].quality_flags.includes('blind'));
  assert.ok(input.segments[2].quality_flags.includes('blind'));
  const raw = await Core.createRawRevision({
    media_sha256: input.media.sha256, format: input.format, segments: input.segments,
  });
  assert.equal(raw.segments.length, 5, 'no ASR text is discarded to make timing validate');
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

test('exact text binding hydrates canonical OPFS video and 1:N row replay timing', () => {
  const passport = StudioMediaPackage.buildExactBindingPassport({
    revision_id:'rev:bound',track_id:'track:bound',canonical_sha256:'f'.repeat(64),
    segments:[
      {caption_segment_id:'cue:1',source_segment_ids:['source:1'],start_ms:0,end_ms:1200,text:'שלום'},
      {caption_segment_id:'cue:2',source_segment_ids:['source:2'],start_ms:1300,end_ms:2400,text:'עולם'},
    ],
  },{
    package_id:'mpkg:bound',track_id:'track:bound',revision_id:'rev:bound',revision_sha256:'f'.repeat(64),
    mapping:{rows:[
      {row_index:0,corrected_caption_segment_id:'cue:1'},
      {row_index:1,corrected_caption_segment_id:'cue:1'},
      {row_index:2,corrected_caption_segment_id:'cue:2'},
    ]},
  },{
    package_id:'mpkg:bound',media_sha256:SHA,mime:'video/mp4',duration_ms:2400,
    original_name:'Бибас.mp4',opfs_path:`media/${SHA}.mp4`,size_bytes:84247081,
  });
  assert.equal(passport.media.opfsPath,`media/${SHA}.mp4`);
  assert.equal(passport.media.originalName,'Бибас.mp4');
  assert.equal(passport.projection_of_revision_id,'rev:bound');
  assert.equal(passport.timingSource,'studio-exact-binding');
  assert.deepEqual(passport.timing.entries,[{o:0,t:0,end:1.2},{o:2,t:1.3,end:2.4}]);
  assert.deepEqual(passport.timingMap.row_caption_segment_ids,['cue:1','cue:1','cue:2']);
});

test('exact text binding accepts the canonical caption_segment_id written by new text cards', () => {
  const passport = StudioMediaPackage.buildExactBindingPassport({
    revision_id:'rev:canonical',track_id:'track:canonical',canonical_sha256:'e'.repeat(64),
    segments:[
      {caption_segment_id:'cue:canonical',source_segment_ids:['source:canonical'],start_ms:500,end_ms:1750,text:'שלום'},
    ],
  },{
    package_id:'mpkg:canonical',track_id:'track:canonical',revision_id:'rev:canonical',revision_sha256:'e'.repeat(64),
    mapping:{schema:'studio-row-source-v2',rows:[
      {row_index:0,caption_segment_id:'cue:canonical',source_segment_ids:['source:canonical']},
    ]},
  },{
    package_id:'mpkg:canonical',media_sha256:SHA,mime:'video/mp4',duration_ms:1750,
    original_name:'canonical.mp4',opfs_path:`media/${SHA}.mp4`,size_bytes:42,
  });
  assert.equal(passport.timingSource,'studio-exact-binding');
  assert.deepEqual(passport.timing.entries,[{o:0,t:0.5,end:1.75}]);
  assert.deepEqual(passport.timingMap.row_caption_segment_ids,['cue:canonical']);
  assert.equal(passport.timingDropReason,null);
});

test('compatibility and exact-binding projections never coerce blind null timing to zero', async () => {
  const raw = await Core.createRawRevision({ media_sha256: SHA, format: 'asr', segments: [
    { start_ms: null, end_ms: null, text: 'untimed', quality_flags: ['blind'] },
    { start_ms: 1500, end_ms: 2500, text: 'timed' },
  ] });
  const corrected = Core.createCorrectedDraft(raw.segments, { id_factory: (() => { let i = 0; return () => `cseg:blind:${i++}`; })() });
  const hash = await Core.revisionHash('user_corrected', corrected, []);
  const revision = { package_id: 'mpkg:blind', track_id: 'track:blind', revision_id: 'rev:blind', canonical_sha256: hash, segments: corrected };
  const projection = StudioMediaPackage.buildCompatibilityProjection(revision, { kind: 'audio', media: { sha256: SHA } });
  assert.equal(projection.audio.segments[0].start, null);
  const passport = StudioMediaPackage.buildExactBindingPassport(revision, {
    package_id: 'mpkg:blind', track_id: 'track:blind', revision_id: 'rev:blind', revision_sha256: hash,
    mapping: { rows: [
      { row_index: 0, caption_segment_id: corrected[0].caption_segment_id },
      { row_index: 1, caption_segment_id: corrected[1].caption_segment_id },
    ] },
  }, { package_id: 'mpkg:blind', media_sha256: SHA });
  assert.deepEqual(passport.timing.entries, [{ o: 1, t: 1.5, end: 2.5 }]);
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

test('workspace reopen preserves the exact corrected track when a media package has multiple histories', async () => {
  const opened = [], lookups = [];
  const previousWindow = global.window;
  global.window = { StudioMediaEditor: { open: async (trackId) => opened.push(trackId) } };
  StudioMediaPackage.setRepositoryForTests({
    getWorkspace: async (packageId, trackId) => {
      lookups.push([packageId, trackId]);
      return {
        package_id: packageId, corrected_track_id: trackId, current_revision_id: 'rev:portable',
        current_revision_sha256: 'c'.repeat(64), revision_no: 7, original_name: 'shared.mp4',
        duration_ms: 65000, mime: 'video/mp4', media_sha256: SHA, media_available: true,
      };
    },
    listWorkspaces: async () => [],
  });
  try {
    const workspace = await StudioMediaPackage.openWorkspace('mpkg:shared', 'track:portable');
    assert.equal(workspace.corrected_track_id, 'track:portable');
    assert.deepEqual(opened, ['track:portable']);
    assert.ok(lookups.length >= 1);
    assert.ok(lookups.every((entry) => entry[0] === 'mpkg:shared' && entry[1] === 'track:portable'));
  } finally {
    StudioMediaPackage.setRepositoryForTests(null);
    if (previousWindow === undefined) delete global.window; else global.window = previousWindow;
  }
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

// ── F1 (packet 2026-08-06): цель привязки выводится из провенанса строк, а не из ambient
// «последнего активного воркспейса». Живой инцидент: строки одного видео уехали в пакет другого.
const SHA_X = 'a'.repeat(64), SHA_Y = 'b'.repeat(64);
const refFor = (pkg) => ({ package_id: pkg, track_id: pkg + ':track', revision_id: pkg + ':rev', revision_sha256: pkg + ':sha' });
const mapFor = (sha) => ({ schema: 'studio-row-source-v2', rows: [{ row_index: 0, source_segment_id: 'asrseg:' + sha + ':0' }] });

function fakeRepo(packages) {
  return {
    findPackageByMediaSha: async (sha) => packages.find((p) => p.media_sha256 === sha) || null,
    getWorkspace: async (packageId) => {
      const p = packages.find((x) => x.package_id === packageId);
      return p ? { package_id: p.package_id, corrected_track_id: p.package_id + ':live-track', current_revision_id: p.package_id + ':live-rev', current_revision_sha256: p.package_id + ':live-sha' } : null;
    },
  };
}

test('resolveBindTarget keeps the exact ambient revision when the rows agree with it', async () => {
  StudioMediaPackage.setRepositoryForTests(fakeRepo([{ package_id: 'mpkg:X', media_sha256: SHA_X }]));
  const target = await StudioMediaPackage.resolveBindTarget(refFor('mpkg:X'), mapFor(SHA_X));
  assert.deepEqual(target, { ...refFor('mpkg:X'), source: 'ambient-verified' }, 'the revision the table was actually built against is preserved, not silently advanced');
});

test('resolveBindTarget follows the rows to their real package when ambient state is wrong', async () => {
  StudioMediaPackage.setRepositoryForTests(fakeRepo([
    { package_id: 'mpkg:X', media_sha256: SHA_X }, { package_id: 'mpkg:Y', media_sha256: SHA_Y },
  ]));
  const target = await StudioMediaPackage.resolveBindTarget(refFor('mpkg:X'), mapFor(SHA_Y));
  assert.deepEqual(target, {
    package_id: 'mpkg:Y', track_id: 'mpkg:Y:live-track',
    revision_id: 'mpkg:Y:live-rev', revision_sha256: 'mpkg:Y:live-sha', source: 'provenance-healed',
  });
});

test('resolveBindTarget binds nothing rather than something plausible', async () => {
  StudioMediaPackage.setRepositoryForTests(fakeRepo([{ package_id: 'mpkg:X', media_sha256: SHA_X }]));
  assert.equal(await StudioMediaPackage.resolveBindTarget(refFor('mpkg:X'), mapFor(SHA_Y)), null, 'rows name a media this device does not have');
  const mixed = { rows: [{ source_segment_id: 'asrseg:' + SHA_X + ':0' }, { source_segment_id: 'asrseg:' + SHA_Y + ':1' }] };
  assert.equal(await StudioMediaPackage.resolveBindTarget(refFor('mpkg:X'), mixed), null, 'rows from two media are never resolved by majority');
  assert.equal(await StudioMediaPackage.resolveBindTarget(null, mapFor(SHA_X)), null, 'no ambient ref and no reason to invent one');
});

test('resolveBindTarget does not judge rows that make no claim', async () => {
  StudioMediaPackage.setRepositoryForTests(fakeRepo([{ package_id: 'mpkg:X', media_sha256: SHA_X }]));
  const legacy = { schema: 'studio-row-source-v2', rows: [{ row_index: 0, caption_segment_id: 'cseg:x:0' }] };
  assert.deepEqual(await StudioMediaPackage.resolveBindTarget(refFor('mpkg:X'), legacy), { ...refFor('mpkg:X'), source: 'ambient-unverified' });
  assert.deepEqual(await StudioMediaPackage.resolveBindTarget(refFor('mpkg:X'), null), { ...refFor('mpkg:X'), source: 'ambient-unverified' });
});

// W2 (honest import -> card, 2026-08-06): saving a table has exactly one named,
// persistent media outcome. Only the verified case is quiet; every exceptional
// case carries a durable next action for the card UI.
test('buildMediaSaveOutcome records the three honest save states', () => {
  const ref = refFor('mpkg:X');
  const verified = StudioMediaPackage.buildMediaSaveOutcome({
    binding: { mapping: { provenance_checked: true } }, target: ref,
  });
  assert.deepEqual(verified, {
    schema: 'studio-media-binding-outcome-v1', status: 'bound_verified',
    provenance_checked: true, reason: null, package_id: 'mpkg:X',
    next_action: null,
  });

  const legacy = StudioMediaPackage.buildMediaSaveOutcome({
    binding: { mapping: { provenance_checked: false } }, target: ref,
  });
  assert.equal(legacy.status, 'bound_unverified');
  assert.equal(legacy.provenance_checked, false);
  assert.equal(legacy.reason, 'ROW_PROVENANCE_UNVERIFIABLE');
  assert.equal(legacy.next_action, 'VERIFY_OR_RELINK_FROM_TRANSCRIPTS');

  const absent = StudioMediaPackage.buildMediaSaveOutcome({
    reason: 'NO_EXACT_REVISION', resolution: { reason: 'NO_EXACT_REVISION' },
  });
  assert.equal(absent.status, 'not_bound');
  assert.equal(absent.provenance_checked, null);
  assert.equal(absent.package_id, null);
  assert.equal(absent.reason, 'NO_EXACT_REVISION');
  assert.equal(absent.next_action, 'IMPORT_MEDIA_OR_RELINK_FROM_TRANSCRIPTS');

  const disagreement = StudioMediaPackage.buildMediaSaveOutcome({ reason: 'PROVENANCE_DISAGREES' });
  assert.equal(disagreement.status, 'not_bound');
  assert.equal(disagreement.next_action, 'RELINK_CORRECT_ORIGINAL_FROM_TRANSCRIPTS');
});

test('attachMediaSaveOutcome preserves the source passport and replaces only the outcome', () => {
  const meta = { source: { kind: 'audio', audio: { media: { sha256: SHA } } }, provider: 'gemini' };
  const outcome = { schema: 'studio-media-binding-outcome-v1', status: 'not_bound', next_action: 'IMPORT_MEDIA_OR_RELINK_FROM_TRANSCRIPTS' };
  const attached = StudioMediaPackage.attachMediaSaveOutcome(meta, outcome);
  assert.notEqual(attached, meta);
  assert.deepEqual(attached.source.audio, meta.source.audio);
  assert.deepEqual(attached.media_binding_outcome, outcome);
  assert.equal(meta.media_binding_outcome, undefined, 'caller metadata is not mutated');
});

test('W2 contract: local save resolves canon and persists an outcome outside the optional bind branch', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const start = html.indexOf('async function v3LibrarySaveCurrentCore(meta)');
  const end = html.indexOf('async function v3LibraryUpdateCurrentCore', start);
  const save = html.slice(start, end);
  assert.match(save, /await v3ResolveMediaContext\(\)/, 'save must resolve canonical context itself');
  assert.match(save, /attachMediaSaveOutcome/, 'named outcome must be written into card metadata');
  assert.match(save, /await ldb\.updateText\(newTextId/, 'outcome must be persisted before commit');
  assert.match(save, /mediaBindingOutcome\.status === ["']not_bound["']/, 'toast decision lives after the binding attempt, including no-ref saves');
  assert.match(save, /promoteLegacyText\(newTextId\)/, 'a saved media card becomes a first-class learning material');
  assert.match(save, /OPEN_IMPORT_CENTER_PREPARE_TRANSFER/, 'promotion refusal records its next action');
});

test('W3 derived partial timing is never written into the card canon', () => {
  const meta = { source: { kind: 'audio', audio: {
    segments: [{ text: 'שלום', start: 0, end: 1 }],
    timing: { entries: [{ o: 0, t: 0 }, { o: 2, t: 2 }] },
    timingSource: 'aligned-partial-proven', timingMap: { row_seg_idx: [0, null, 2] },
    timingAlign: { mode: 'partial-proven', coverage: { mapped_rows: 2, total_rows: 3 } },
  } } };
  const clean = StudioMediaPackage.withoutDerivedMediaTiming(meta);
  assert.equal(clean.source.audio.timing, null);
  assert.equal(clean.source.audio.timingSource, undefined);
  assert.equal(clean.source.audio.timingMap, undefined);
  assert.equal(clean.source.audio.timingAlign, undefined);
  assert.deepEqual(clean.source.audio.segments, meta.source.audio.segments, 'canonical segments remain intact');
  assert.ok(meta.source.audio.timing, 'input is not mutated');
});

test('W4 deletion requires a consequence preview and cancellation performs no write', async () => {
  const preview = {
    package_id: 'mpkg:X', package_name: 'owner.mp4', media_sha256: SHA,
    materials_losing_source_count: 2,
    materials_losing_source: [
      { material_id: 'material:1', text_id: 'text:1', name: 'Lesson one' },
      { material_id: 'material:2', text_id: 'text:2', name: 'Lesson two' },
    ],
    caption_revisions_destroyed: 4, caption_revisions_are_only_timing_copy: true,
    reimport_same_sha_restores_identity: true,
  };
  const calls = [];
  StudioMediaPackage.setRepositoryForTests({
    previewDeletePackage: async (id) => { calls.push(['preview', id]); return preview; },
    deletePackage: async (id) => { calls.push(['delete', id]); return { errors: [] }; },
  });
  const message = StudioMediaPackage.formatDeletePreview(preview, (key, vars) => key + ':' + JSON.stringify(vars));
  assert.match(message, /Lesson one/);
  assert.match(message, /Lesson two/);
  assert.match(message, /4/);
  assert.match(message, new RegExp(SHA));

  await assert.rejects(() => StudioMediaPackage.deletePackageAndGc('mpkg:X', true, {
    confirm_preview: async (text) => { assert.equal(text, message); return false; },
    translate: (key, vars) => key + ':' + JSON.stringify(vars),
  }), (error) => error.cancelled === true && error.preview === preview);
  assert.deepEqual(calls, [['preview', 'mpkg:X']], 'delete is impossible before accepting the preview');
});

test('mobile Studio has one onboarding overlay and one state authority', () => {
  assert.equal(
    (INDEX_HTML.match(/id="v3OnboardingModal"/g) || []).length,
    1,
    'duplicate fullscreen onboarding overlays can make the Studio surface untappable',
  );
  assert.equal(
    (INDEX_HTML.match(/function v3OnboardingShouldShow\s*\(/g) || []).length,
    1,
    'onboarding visibility must not be decided by competing functions',
  );
  assert.doesNotMatch(INDEX_HTML, /v3OnboardingMaybeShow|V3_ONBOARDING_SEEN_KEY/);
});

test('canonical onboarding honours the legacy dismissal without another blocking layer', () => {
  assert.match(INDEX_HTML, /localStorage\.getItem\("v3OnboardingSeenV1"\)/);
  assert.match(INDEX_HTML, /localStorage\.removeItem\("v3OnboardingSeenV1"\)/);
});

test('premium rebuild chunks proven media lines instead of sending more than 250 rows once', () => {
  assert.match(
    INDEX_HTML,
    /async function v3TranslateTablePremiumChunked\s*\(/,
    'premium long-media needs its own bounded client loop',
  );
  assert.match(
    INDEX_HTML,
    /if \(usePremium && segsForChunks[^]*v3TranslateTablePremiumChunked/,
    'premium must enter the bounded loop from the same canonical segment decision',
  );
  assert.match(
    INDEX_HTML,
    /source_line_index\s*=\s*r\.source_line_index\s*\+\s*base/,
    'chunk-local premium provenance must be restored to the full transcript line index',
  );
  assert.match(
    INDEX_HTML,
    /apiCall\("\/api\/translate-table-v2"[^]*text:\s*chunkText/,
    'each premium request must contain only the current bounded text chunk',
  );
});

test('google-free long-table confirmation never quotes Gemini price or duration', () => {
  const start = INDEX_HTML.indexOf('async function v3TranslateTablePremiumChunked');
  const end = INDEX_HTML.indexOf('// W2-S12: чанк-цикл', start);
  const premiumChunker = INDEX_HTML.slice(start, end);
  assert.match(premiumChunker, /provider === "google-free"/);
  assert.match(premiumChunker, /classic\.tableGoogleFreeCostConfirm/);
  assert.match(premiumChunker, /classic\.tableGcpCostConfirm/);
  assert.doesNotMatch(
    premiumChunker,
    /t\("classic\.tableCostConfirm"\)/,
    'Gemini token-price estimate must remain exclusive to the Gemini chunk path',
  );
});
