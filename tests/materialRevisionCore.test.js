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

test('offline alignment repair maps complete 1:N rows without changing content or authority', () => {
  const legacy = rows.map(({ caption_segment_id, source_segment_ids, ...row }) => ({
    ...row, caption_segment_id: null, source_segment_ids: [],
  }));
  const result = Core.applyExactAlignedMapping({
    rows: legacy,
    segments: [{ caption_segment_id: 'cap-1', source_segment_ids: ['raw-1', 'raw-2'] }],
    row_segment_indexes: [0, 0],
    provenance: {
      authority: 'aligned-offline', algorithm_version: 'align-rows-v1',
      bound_caption_revision_id: 'caption-revision-1',
      bound_caption_revision_sha256: 'a'.repeat(64),
    },
  });
  assert.equal(result.mapped_count, 2);
  assert.equal(result.caption_count, 1);
  assert.deepEqual(result.rows.map((row) => row.caption_segment_id), ['cap-1', 'cap-1']);
  assert.deepEqual(result.rows[0].source_segment_ids, ['raw-1', 'raw-2']);
  assert.equal(result.rows[0].ru, legacy[0].ru);
  assert.deepEqual(result.rows[0].field_meta, Core.normalizeRow(legacy[0], 0).field_meta);
  assert.deepEqual(result.rows[0].mapping_meta, {
    authority: 'aligned-offline', algorithm_version: 'align-rows-v1',
    bound_caption_revision_id: 'caption-revision-1',
    bound_caption_revision_sha256: 'a'.repeat(64), segment_index: 0,
  });
});

test('offline alignment repair is fail-closed for partial, non-monotonic or conflicting proof', () => {
  const segments = [
    { caption_segment_id: 'cap-1', source_segment_ids: ['raw-1'] },
    { caption_segment_id: 'cap-2', source_segment_ids: ['raw-2'] },
  ];
  const provenance = { authority: 'aligned-offline', algorithm_version: 'align-rows-v1', bound_caption_revision_id: 'caption-revision-1', bound_caption_revision_sha256: 'a'.repeat(64) };
  const unmapped = rows.map((row) => ({ ...row, caption_segment_id: null, source_segment_ids: [] }));
  assert.throws(() => Core.applyExactAlignedMapping({ rows, segments, row_segment_indexes: [0], provenance }), /MAPPING_CARDINALITY_MISMATCH/);
  assert.throws(() => Core.applyExactAlignedMapping({ rows: unmapped, segments, row_segment_indexes: [1, 0], provenance }), /MAPPING_NOT_MONOTONIC/);
  assert.throws(() => Core.applyExactAlignedMapping({ rows, segments, row_segment_indexes: [0, 0], provenance }), /MAPPING_DISAGREEMENT/);
  assert.throws(() => Core.applyExactAlignedMapping({ rows, segments: [{}], row_segment_indexes: [0, 0], provenance }), /CAPTION_SEGMENT_ID_REQUIRED/);
});

test('mixed legacy mapping repair previews missing and conflicting links without changing learning content', () => {
  const segments = [
    { caption_segment_id: 'cap-1', source_segment_ids: ['raw-1'] },
    { caption_segment_id: 'cap-2', source_segment_ids: ['raw-2'] },
  ];
  const mixed = [
    { ...rows[0], caption_segment_id: null, source_segment_ids: [] },
    { ...rows[1], caption_segment_id: 'cap-1', source_segment_ids: ['wrong-raw'] },
  ];
  const provenance = {
    authority: 'aligned-offline', algorithm_version: 'align-rows-v1',
    bound_caption_revision_id: 'caption-revision-1',
    bound_caption_revision_sha256: 'a'.repeat(64),
  };
  const result = Core.planExactAlignedMappingRepair({
    rows: mixed, segments, row_segment_indexes: [0, 1], provenance,
  });
  assert.deepEqual({
    mapped_count: result.mapped_count,
    caption_count: result.caption_count,
    missing_count: result.missing_count,
    conflict_count: result.conflict_count,
    unchanged_count: result.unchanged_count,
    conflict_row_ids: result.conflict_row_ids,
  }, {
    mapped_count: 2, caption_count: 2, missing_count: 1,
    conflict_count: 1, unchanged_count: 0, conflict_row_ids: ['sentence-2'],
  });
  assert.deepEqual(result.rows.map((row) => row.caption_segment_id), ['cap-1', 'cap-2']);
  assert.equal(result.rows[0].ru, mixed[0].ru);
  assert.equal(result.rows[1].he_niqqud, mixed[1].he_niqqud);
  assert.deepEqual(result.rows[0].field_meta, Core.normalizeRow(mixed[0], 0).field_meta);
  assert.deepEqual(result.rows[1].field_meta, Core.normalizeRow(mixed[1], 1).field_meta);
});

test('mixed repair reports the production-shaped 514 missing and 71 conflicting links exactly', () => {
  const segments = Array.from({ length: 585 }, (_, index) => ({
    caption_segment_id: `cap-${index}`,
    source_segment_ids: [`raw-${index}`],
  }));
  const sourceRows = Array.from({ length: 585 }, (_, index) => ({
    stable_row_id: `sentence-${index}`,
    caption_segment_id: index < 514 ? null : 'cap-0',
    source_segment_ids: index < 514 ? [] : ['raw-0'],
    he_plain: `he-${index}`,
    ru: `ru-${index}`,
    field_meta: { ru: { authority: 'user', locked: true, status: 'current' } },
  }));
  const result = Core.planExactAlignedMappingRepair({
    rows: sourceRows,
    segments,
    row_segment_indexes: segments.map((_, index) => index),
    provenance: {
      authority: 'aligned-offline', algorithm_version: 'align-rows-v1',
      bound_caption_revision_id: 'caption-revision-1', bound_caption_revision_sha256: 'b'.repeat(64),
    },
  });
  assert.equal(result.missing_count, 514);
  assert.equal(result.conflict_count, 71);
  assert.equal(result.unchanged_count, 0);
  assert.equal(result.mapped_count, 585);
  assert.deepEqual(result.rows.map((row) => row.ru), sourceRows.map((row) => row.ru));
  assert.deepEqual(result.rows.map((row) => row.field_meta), sourceRows.map((row, index) => Core.normalizeRow(row, index).field_meta));
});

test('playback review can anchor the current row in the first visible slot', () => {
  const target = Core.computeContextScrollTop({
    scroll_top: 100,
    container_top: 20,
    container_height: 1000,
    row_top: 420,
    previous_row_height: 96,
    gap: 10,
    max_scroll_top: 2000,
    anchor_slot: 'first',
  });
  assert.equal(target, 500);
});

// ── F2 (packet 2026-08-06): один медиа-трек может обслуживать НЕСКОЛЬКО карточек (вторая таблица
// по тому же медиа — законный поток). Прежний резолвер брал 'ORDER BY updated_at DESC LIMIT 1',
// поэтому вторая карточка не могла быть промоутнута никогда и исчезала из Import Center.
test('pickTextForTrack never guesses which card a shared track belongs to', () => {
  const pick = Core.pickTextForTrack;
  const two = [{ text_id: 'text-new' }, { text_id: 'text-old' }];

  assert.deepEqual(pick([], 'text-new'), { text_id: null, ambiguous: false, candidates: [] }, 'nothing bound');
  assert.deepEqual(pick([{ text_id: 'only' }], null), { text_id: 'only', ambiguous: false, candidates: ['only'] }, 'one binding needs no context');
  assert.deepEqual(pick(two, 'text-old'), { text_id: 'text-old', ambiguous: false, candidates: ['text-new', 'text-old'] }, 'explicit context wins over recency');
  assert.deepEqual(pick(two, null), { text_id: null, ambiguous: true, candidates: ['text-new', 'text-old'] }, 'shared track without context is ambiguous, not "the newest"');
  assert.deepEqual(pick(two, 'text-elsewhere'), { text_id: null, ambiguous: true, candidates: ['text-new', 'text-old'] }, 'a context that is not bound here is not honoured');
  assert.deepEqual(pick([{ text_id: 'only' }], 'text-elsewhere'), { text_id: null, ambiguous: false, candidates: ['only'] }, 'wrong context does not silently fall back to the single binding');
});

test('W3 coverage reports proven rows as a fraction, never a binary karaoke verdict', () => {
  assert.deepEqual(Core.summarizeProvenAlignment([0, null, 2, 2, null], 5), {
    mapped_rows: 3, total_rows: 5, unmapped_rows: 2,
    ratio: 0.6, label: '3/5', complete: false,
  });
  assert.deepEqual(Core.summarizeProvenAlignment([], 0), {
    mapped_rows: 0, total_rows: 0, unmapped_rows: 0,
    ratio: 0, label: '0/0', complete: false,
  });
});
