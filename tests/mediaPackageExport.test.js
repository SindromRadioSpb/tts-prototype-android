const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/js/media-package-core.js');
const StudioMediaPackage = require('../public/js/studio-media-package.js');

async function snapshot() {
  const raw = await Core.createRawRevision({
    media_sha256: 'd'.repeat(64), format: 'vtt', language: 'he',
    segments: [{ start_ms: 0, end_ms: 1500, text: 'שלום' }, { start_ms: 1600, end_ms: 3000, text: 'מיה', quality_flags: ['blind'] }],
    provenance: { source: 'fixture' },
  });
  const corrected = Core.createCorrectedDraft(raw.segments, { id_factory: (() => { let n = 0; return () => `cseg:${++n}`; })() });
  const correctedHash = await Core.revisionHash('user_corrected', corrected, []);
  return {
    package: { package_id: 'mpkg:' + 'd'.repeat(64), media_sha256: 'd'.repeat(64), mime: 'audio/mpeg', duration_ms: 3000, original_name: 'fixture.mp3', opfs_path: 'media/' + 'd'.repeat(64) + '.mp3' },
    raw_track: { track_id: 'track:raw', role: 'raw_original', language: 'he' },
    raw_revision: { revision_id: 'rev:raw', track_id: 'track:raw', revision_no: 1, segments: raw.segments, operations: [], canonical_sha256: raw.canonical_sha256, author_kind: 'import', provenance: raw.provenance },
    corrected_track: { track_id: 'track:corrected', role: 'user_corrected', language: 'he', parent_track_id: 'track:raw' },
    corrected_revision: { revision_id: 'rev:corrected', track_id: 'track:corrected', parent_revision_id: 'rev:raw', revision_no: 1, segments: corrected, operations: [], canonical_sha256: correctedHash, author_kind: 'import', provenance: { copied_from_raw_revision_id: 'rev:raw' } },
    binding: { text_id: 'text-1', package_id: 'mpkg:' + 'd'.repeat(64), track_id: 'track:corrected', revision_id: 'rev:corrected', revision_sha256: correctedHash, mapping: { schema: 'studio-row-source-v2' } },
  };
}

test('slim package file set is media-free and preserves IDs, lineage, provenance and hashes', async () => {
  const original = await snapshot();
  const files = await StudioMediaPackage.buildSlimPackageFiles(original, { app_version: '3.11.280', exported_at: '2026-07-31T12:00:00Z' });
  assert.deepEqual(Object.keys(files).sort(), [
    'README.txt', 'manifest.json', 'mapping/text-binding.json', 'quality/import-run.json',
    'tracks/raw-original.json', 'tracks/raw-original.vtt', 'tracks/user-corrected.json', 'tracks/user-corrected.vtt',
  ]);
  assert.equal(Object.keys(files).some((p) => p.startsWith('media/')), false);
  const verified = await StudioMediaPackage.verifySlimPackageFiles(files);
  assert.equal(verified.package.package_id, original.package.package_id);
  assert.equal(verified.corrected_revision.canonical_sha256, original.corrected_revision.canonical_sha256);
  assert.deepEqual(verified.corrected_revision.segments.map((s) => s.source_segment_ids), original.corrected_revision.segments.map((s) => s.source_segment_ids));
  assert.equal(verified.manifest.media_included, false);
});

test('slim package checksum mismatch and unknown schema fail hard', async () => {
  const files = await StudioMediaPackage.buildSlimPackageFiles(await snapshot(), {});
  const corrupt = { ...files, 'tracks/user-corrected.json': files['tracks/user-corrected.json'] + ' ' };
  await assert.rejects(() => StudioMediaPackage.verifySlimPackageFiles(corrupt), /PACKAGE_CHECKSUM_MISMATCH/);
  const unknown = { ...files, 'manifest.json': files['manifest.json'].replace('linguistpro-media-package-v1', 'v99') };
  await assert.rejects(() => StudioMediaPackage.verifySlimPackageFiles(unknown), /PACKAGE_SCHEMA_UNKNOWN/);
});

test('slim export keeps untimed blind text in canonical JSON and declares the bounded VTT projection', async () => {
  const original = await snapshot();
  original.raw_revision.segments[1].start_ms = null;
  original.raw_revision.segments[1].end_ms = null;
  original.raw_revision.segments[1].quality_flags = ['blind'];
  original.raw_revision.segments[1].authority.timing = 'unknown';
  original.raw_revision.canonical_sha256 = await Core.revisionHash('raw_original', original.raw_revision.segments, []);
  original.corrected_revision.segments[1].start_ms = null;
  original.corrected_revision.segments[1].end_ms = null;
  original.corrected_revision.segments[1].quality_flags = ['blind'];
  original.corrected_revision.segments[1].authority.timing = 'unknown';
  original.corrected_revision.canonical_sha256 = await Core.revisionHash('user_corrected', original.corrected_revision.segments, []);
  original.binding.revision_sha256 = original.corrected_revision.canonical_sha256;
  const files = await StudioMediaPackage.buildSlimPackageFiles(original, {});
  const manifest = JSON.parse(files['manifest.json']);
  assert.deepEqual(manifest.vtt_projection.raw_original, {
    source_segment_count: 2, exported_segment_count: 1, omitted_segment_indexes: [1],
  });
  assert.match(files['tracks/raw-original.json'], /"start_ms": null/);
  assert.doesNotMatch(files['tracks/raw-original.vtt'], /מיה/);
  const verified = await StudioMediaPackage.verifySlimPackageFiles(files);
  assert.equal(verified.raw_revision.segments.length, 2);
  assert.equal(verified.raw_revision.segments[1].start_ms, null);
});

test('relink hash equality is exact and one-byte mismatch cannot be accepted', async () => {
  const expected = await Core.sha256Hex(new Uint8Array([1, 2, 3]));
  assert.equal(await StudioMediaPackage.verifyRelinkBytes(expected, new Uint8Array([1, 2, 3])), true);
  await assert.rejects(() => StudioMediaPackage.verifyRelinkBytes(expected, new Uint8Array([1, 2, 4])), /MEDIA_SHA_MISMATCH/);
});
