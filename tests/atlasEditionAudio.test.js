'use strict';
// 97001 RC3.x recordings: an immutable edition gets its own audio index bound to the edition revision.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const T = require('../scripts/atlas/atlas-tts.cjs');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

test('edition audio index lists every section manifest by SHA and names the revision', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-audio-'));
  const data = path.join(dir, 'data'), out = path.join(dir, 'tts');
  fs.mkdirSync(path.join(out, 'audio'), { recursive: true }); fs.mkdirSync(data);
  const revision = 'a'.repeat(64);
  fs.writeFileSync(path.join(data, 'index.json'), JSON.stringify({ structure_revision: revision }));
  const m1 = Buffer.from('{"schema":"linguistpro.atlas-audio.1","items":{}}');
  fs.writeFileSync(path.join(out, 'audio', 's01-units.json'), m1);
  fs.writeFileSync(path.join(out, 'audio', 'index.json'), '{}');   // an older index is not a section
  T.selectAtlas('a97001rc32');
  try {
    const ix = T.editionAudioIndex({ out, data });
    assert.deepEqual(ix, { schema: 'linguistpro.atlas-audio-index.1', atlas_id: 'a97001rc32', edition_revision: revision, audio: { 's01-units': sha(m1) } });
  } finally { T.selectAtlas('a97002'); }
});

test('the 97002 book keeps its audio in its own index and refuses an edition audio index', () => {
  T.selectAtlas('a97002');
  assert.throws(() => T.editionAudioIndex({ out: os.tmpdir(), data: os.tmpdir() }), /EDITION_AUDIO_INDEX_ONLY_FOR_EDITIONS/);
});
