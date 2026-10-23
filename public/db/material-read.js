// One worker operation/snapshot for the shared Studio/Room read model.
// Keep source/provider/media metadata intact; source_text is hydrated separately.
export const MATERIAL_SENTENCES_SQL = `SELECT s.*,
       aa.asset_key AS audio_asset_key,
       aa.tts_profile_json AS audio_tts_profile_json
  FROM sentences s
  LEFT JOIN sentence_audio sa ON sa.sentence_id = s.id AND sa.is_default = 1
  LEFT JOIN audio_assets aa ON aa.id = sa.audio_id
  WHERE s.text_id = ? ORDER BY s.order_index`;

export async function readMaterial(textId, { query, exec, inTransaction }) {
  const ownSnapshot = !inTransaction();
  if (ownSnapshot) await exec('BEGIN');
  try {
    // Resolve the migrated schema in the same lease, including on a cold worker.
    const info = await query('PRAGMA table_info(texts)');
    const cols = info.map(c => c.name).filter(name => name && name !== 'source_text');
    if (!cols.length) throw new Error('MATERIAL_SCHEMA_UNAVAILABLE');
    const selection = cols.map(name => '"' + name.replace(/"/g, '""') + '"').join(', ');
    const texts = await query('SELECT ' + selection + ' FROM texts WHERE id = ?', [textId]);
    const text = texts[0] || null;
    const sentences = text ? await query(MATERIAL_SENTENCES_SQL, [textId]) : [];
    if (ownSnapshot) await exec('COMMIT');
    return { text, sentences };
  } catch (error) {
    // Never finish or undo the caller's transaction. OperationLease handles its
    // lifetime; this operation only releases the read snapshot it started.
    if (ownSnapshot && inTransaction()) await exec('ROLLBACK');
    throw error;
  }
}
