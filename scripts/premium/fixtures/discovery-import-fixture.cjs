'use strict';
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

module.exports=async function validFixture(){
  const value=fixture(),media=require('../../../public/js/media-package-core.js'),material=require('../../../public/js/material-revision-core.js');
  const raw=value.raw_revisions[0],corrected=value.corrected_revisions[0],table=value.table_revisions[0];
  raw.canonical_sha256=await media.revisionHash('raw_original',raw.segments,raw.operations);
  corrected.canonical_sha256=await media.revisionHash('user_corrected',corrected.segments,corrected.operations);
  table.bound_caption_revision_sha256=corrected.canonical_sha256;
  const snapshot=await material.createTableSnapshot({rows:table.rows,provider_context:table.provider_context});
  table.content_sha256=snapshot.content_sha256;table.mapping_sha256=snapshot.mapping_sha256;
  return value;
};
