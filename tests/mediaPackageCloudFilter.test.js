const test = require('node:test');
const assert = require('node:assert/strict');

test('local-db slim filter strips L3a snapshots even if UI module is unavailable', async () => {
  const ldb = await import('../public/db/local-db.js');
  assert.equal(typeof ldb.filterMediaPackageMetaForSlim, 'function');
  const input = { source: {
    media_package_ref: { package_id: 'mpkg:1', revision_id: 'rev:1', revision_sha256: 'a'.repeat(64), track_id: 'track:1' },
    audio: { media: { sha256: 'b'.repeat(64) }, segments: [{ text: 'private' }], corrected: [{ text: 'private correction' }], timing: { entries: [] } },
  } };
  const output = ldb.filterMediaPackageMetaForSlim(input);
  assert.equal(output.source.audio.segments, undefined);
  assert.equal(output.source.audio.corrected, undefined);
  assert.equal(output.source.audio.timing, undefined);
  assert.deepEqual(output.source.media_package_ref, { package_id: 'mpkg:1', local_only: true, media_included: false, revision_sha256: 'a'.repeat(64) });
  assert.equal(input.source.audio.segments[0].text, 'private');
});
