const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/js/material-revision-core.js');

const rows = [
  {
    stable_row_id: 'sentence-1', he_plain: 'שלום', he_niqqud: 'שָׁלוֹם',
    translit: 'shalom', translit_ru: 'шалом', ru: 'привет',
    caption_segment_id: 'cap-1', source_segment_ids: ['src-1'],
    field_meta: { ru: { authority: 'user', locked: true } },
  },
  {
    stable_row_id: 'sentence-2', he_plain: 'מיה', he_niqqud: '',
    translit: 'Mia', translit_ru: 'Мия', ru: 'Мия',
    caption_segment_id: 'cap-2', source_segment_ids: ['src-2'], field_meta: {},
  },
];

test('canonical table hash is deterministic and row identity participates', async () => {
  const a = await Core.createTableSnapshot({ rows, provider_context: { model: 'm', provider: 'p' } });
  const b = await Core.createTableSnapshot({ rows: JSON.parse(JSON.stringify(rows)), provider_context: { provider: 'p', model: 'm' } });
  assert.equal(a.content_sha256, b.content_sha256);
  assert.equal(a.mapping_sha256, b.mapping_sha256);
  const aliased = JSON.parse(JSON.stringify(rows));
  aliased[1].stable_row_id = 'sentence-x';
  assert.notEqual((await Core.createTableSnapshot({ rows: aliased })).content_sha256, a.content_sha256);
});

test('impact is deterministic: timing and speaker changes do not invalidate language fields', () => {
  const timing = Core.analyzeImpact({ rows, change: { kind: 'caption_timing', caption_segment_ids: ['cap-1'] } });
  const speaker = Core.analyzeImpact({ rows, change: { kind: 'caption_speaker', caption_segment_ids: ['cap-1'] } });
  assert.deepEqual(timing, { conflicts: [], impacted: [], reason: 'TIMING_ONLY' });
  assert.deepEqual(speaker, { conflicts: [], impacted: [], reason: 'SPEAKER_ONLY' });
});

test('text/provider impact is mapped, field-level and never selects locked user values', () => {
  const text = Core.analyzeImpact({ rows, change: { kind: 'caption_text', caption_segment_ids: ['cap-1'] } });
  assert.deepEqual(text.impacted.map((x) => [x.stable_row_id, x.fields]), [
    ['sentence-1', ['he_plain', 'he_niqqud', 'translit', 'translit_ru']],
  ]);
  const provider = Core.analyzeImpact({ rows, change: { kind: 'provider', fields: ['ru', 'translit'] } });
  assert.deepEqual(provider.impacted.map((x) => [x.stable_row_id, x.fields]), [
    ['sentence-1', ['translit']], ['sentence-2', ['ru', 'translit']],
  ]);
});

test('split/merge is an explicit mapping conflict and regeneration preflight is exact', () => {
  const impact = Core.analyzeImpact({ rows, change: { kind: 'mapping', caption_segment_ids: ['cap-1'], mapping: 'split' } });
  assert.equal(impact.conflicts[0].code, 'MAPPING_REVIEW_REQUIRED');
  assert.deepEqual(Core.buildRegenerationPreflight({ rows, impact, provider: 'gcp', model: 'nmt-v2' }), {
    provider: 'gcp', model: 'nmt-v2', row_count: 1,
    field_count: 4, request_ids: ['regen:sentence-1'], fallback: false,
  });
});

test('provider candidates require exact request ids/cardinality and preserve user locks', () => {
  const impact = Core.analyzeImpact({ rows, change: { kind: 'provider', fields: ['ru'] } });
  assert.throws(() => Core.applyProviderCandidates({ rows, impact, candidates: [] }), /REGEN_CARDINALITY_MISMATCH/);
  const out = Core.applyProviderCandidates({
    rows, impact,
    candidates: [{ request_id: 'regen:sentence-2', fields: { ru: 'Миа' }, provenance: { provider: 'gcp', model: 'nmt-v2', input_sha256: 'x' } }],
  });
  assert.equal(out[0].ru, 'привет');
  assert.equal(out[1].ru, 'Миа');
  assert.deepEqual({ authority: out[1].field_meta.ru.authority, status: out[1].field_meta.ru.status }, { authority: 'provider', status: 'current' });
});
