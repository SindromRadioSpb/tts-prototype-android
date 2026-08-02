const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/js/portable-learning-package-core.js');
const Oracle = require('../scripts/premium/portable-learning-package-oracle.js');

function fixture() {
  const mediaSha = 'a'.repeat(64);
  const rawSha = 'b'.repeat(64);
  const correctedSha = 'c'.repeat(64);
  const contentSha = 'd'.repeat(64);
  const mappingSha = 'e'.repeat(64);
  return {
    package: { package_id: 'mpkg:' + mediaSha, media_sha256: mediaSha, mime: 'video/mp4', duration_ms: 120000, size_bytes: 987654, original_name: 'שיעור Мия.mp4' },
    raw_track: { track_id: 'track:raw:fixture', package_id: 'mpkg:' + mediaSha, role: 'raw_original', language: 'he', current_revision_id: 'rev:raw' },
    raw_revisions: [{ revision_id: 'rev:raw', track_id: 'track:raw:fixture', parent_revision_id: null, revision_no: 1, canonical_sha256: rawSha, operations: [], provenance: { source: 'fixture' }, segments: [
      { source_segment_id: 'src:0', start_ms: 0, end_ms: 1000, text: 'שלום', authority: { text: 'import', timing: 'import', speaker: 'unknown' } },
    ] }],
    corrected_track: { track_id: 'track:corrected:fixture', package_id: 'mpkg:' + mediaSha, role: 'user_corrected', language: 'he', parent_track_id: 'track:raw:fixture', current_revision_id: 'rev:corrected' },
    corrected_revisions: [{ revision_id: 'rev:corrected', track_id: 'track:corrected:fixture', parent_revision_id: 'rev:raw', revision_no: 1, canonical_sha256: correctedSha, operations: [], provenance: { copied_from_raw_revision_id: 'rev:raw' }, segments: [
      { caption_segment_id: 'caption:0', source_segment_ids: ['src:0'], start_ms: 0, end_ms: 1000, text: 'שלום', authority: { text: 'user', timing: 'import', speaker: 'unknown' } },
    ] }],
    material: { material_id: 'material-local-uuid', text_id: 'text-local-uuid', portable_text_key: 'owner-lesson-1', current_table_revision_id: 'table-local-uuid', package_id: 'mpkg:' + mediaSha },
    table_revisions: [{ table_revision_id: 'table-local-uuid', material_id: 'material-local-uuid', revision_no: 1, parent_revision_id: null, bound_caption_revision_id: 'rev:corrected', bound_caption_revision_sha256: correctedSha, content_sha256: contentSha, mapping_sha256: mappingSha, provider_context: {}, impact: { kind: 'legacy_promotion', zero_provider_calls: true }, rows: [
      { stable_row_id: 'sentence-local-uuid', he_plain: 'שלום', he_niqqud: 'שָׁלוֹם', translit: 'shalom', translit_ru: 'шалом', ru: 'привет', caption_segment_id: 'caption:0', source_segment_ids: ['src:0'], field_meta: { ru: { authority: 'user', locked: true, status: 'current' } }, mapping_meta: { authority: 'aligned-offline' } },
    ] }],
    selected_caption_revision_id: 'rev:corrected',
    selected_table_revision_id: 'table-local-uuid',
    text: { id: 'text-local-uuid', text_key: 'owner-lesson-1', title: 'שיעור Мия', source_text: 'שלום', tags_json: '[]' },
    text_card: { format: 'linguistpro-text-card-v2', exported_at: 'volatile', exported_by_app: 'fixture', card: { title: 'שיעור Мия', source_text: 'שלום', rows: [{ row_id: 'sentence-local-uuid', order_index: 0, hebrew_plain: 'שלום', hebrew_niqqud: 'שָׁלוֹם', translit: 'shalom', translit_ru: 'шалом', russian: 'привет' }] } },
    import_run: { provider: 'local', model: 'fixture', warnings: [] },
    quality_report: { ok: true, row_count: 1 },
  };
}

test('snapshot is canonical, media-free and independent from local text/sentence UUIDs', async () => {
  const first = await Core.buildPackageFiles(fixture(), { mode: 'snapshot', exported_at: '2026-08-02T00:00:00Z', app_version: '3.11.287' });
  const second = await Core.buildPackageFiles(fixture(), { mode: 'snapshot', exported_at: '2026-08-02T01:00:00Z', app_version: '3.11.287' });
  const verified = await Core.verifyPackageFiles(first);
  assert.equal(verified.manifest.schema_version, 2);
  assert.equal(verified.manifest.media.included, false);
  assert.equal(verified.manifest.history.caption_complete, false);
  assert.equal(verified.manifest.content_root_sha256, JSON.parse(second['manifest.json']).content_root_sha256, 'export time is non-semantic');
  const graph = first['graph/artifacts.json'] + first['graph/edges.json'];
  assert.equal(graph.includes('text-local-uuid'), false);
  assert.equal(graph.includes('sentence-local-uuid'), false);
  assert.ok(verified.graph.artifacts.some((node) => node.type === 'learning_material'));
  assert.ok(verified.graph.edges.some((edge) => edge.relation === 'bound_to_revision'));
});

test('archive is history-complete and preserves immutable field authority/mapping', async () => {
  const input = fixture();
  const files = await Core.buildPackageFiles(input, { mode: 'archive' });
  const verified = await Core.verifyPackageFiles(files);
  assert.equal(verified.manifest.history.caption_complete, true);
  assert.equal(verified.manifest.history.table_complete, true);
  const table = verified.payload.table_revisions[0];
  assert.deepEqual(table.rows[0].field_meta.ru, { authority: 'user', locked: true, status: 'current' });
  assert.equal(table.rows[0].caption_segment_id, 'caption:0');
});

test('strict serializer rejects floats, lone surrogates and duplicate JSON keys', async () => {
  assert.throws(() => Core.canonicalJson({ value: 1.5 }), /CANONICAL_NUMBER_INVALID/);
  assert.throws(() => Core.canonicalJson({ value: '\ud800' }), /CANONICAL_STRING_INVALID/);
  assert.throws(() => Core.parseJsonStrict('{"a":1,"a":2}'), /JSON_DUPLICATE_KEY/);
});

test('no-write dry-run exposes exact reuse/conflict/missing-media plan', async () => {
  const verified = await Core.verifyPackageFiles(await Core.buildPackageFiles(fixture(), { mode: 'snapshot' }));
  const empty = await Core.dryRun(verified, { nodes: {}, texts: {}, media_sha256: [] });
  assert.equal(empty.conflicts.length, 0);
  assert.equal(empty.media.status, 'missing');
  assert.ok(empty.actions.some((item) => item.action === 'insert'));
  const material = verified.graph.artifacts.find((node) => node.type === 'learning_material');
  const conflict = await Core.dryRun(verified, { nodes: { [material.id]: { canonical_hash: 'f'.repeat(64) } }, texts: {}, media_sha256: [] });
  assert.equal(conflict.conflicts[0].code, 'PORTABLE_ID_HASH_CONFLICT');
});

test('independent oracle accepts re-export semantic equality and rejects drift', async () => {
  const source=await Core.buildPackageFiles(fixture(),{mode:'archive',exported_at:'2026-08-02T00:00:00Z'});
  const target=await Core.buildPackageFiles(fixture(),{mode:'archive',exported_at:'2026-08-02T02:00:00Z'});
  assert.equal(Oracle.compare(source,target).ok,true);
  const drift={...target,'learning/text-card.json':target['learning/text-card.json'].replace('привет','ошибка')};
  assert.throws(()=>Oracle.verify(drift),/ORACLE_SHA/);
});
