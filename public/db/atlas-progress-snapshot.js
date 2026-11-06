// Read-only, committed snapshot on the existing worker connection; no transaction commands.
const W=['lemma_key','status','updated_at','srs_due','srs_interval','srs_reps','srs_lapses','srs_text_key','srs_sentence_id','srs_order_index','srs_surface','srs_stability','srs_difficulty','srs_reviewed_at','srs_scheme'],R=['id','item_key','kind','reviewed_at','grade','source','channel','latency_ms','meta_json'];
const pairs=cols=>cols.map(k=>"'"+k+"',"+k).join(',');
export const SQL="SELECT 'word_status' AS record_type,json_object("+pairs(W)+") AS record_json FROM word_status WHERE lemma_key LIKE 'at1:a97001:%' OR srs_text_key LIKE 'atlas-block-v1:a97001:%' UNION ALL SELECT 'review_log',json_object("+pairs(R)+") FROM review_log WHERE item_key LIKE 'at1:a97001:%' OR (json_valid(meta_json) AND (json_extract(meta_json,'$.text_key') LIKE 'atlas-block-v1:a97001:%' OR json_extract(meta_json,'$.textKey') LIKE 'atlas-block-v1:a97001:%' OR json_extract(meta_json,'$.source.text_key') LIKE 'atlas-block-v1:a97001:%' OR json_extract(meta_json,'$.source.textKey') LIKE 'atlas-block-v1:a97001:%'))";
export async function readCommittedAtlasProgress({inTransaction,query}) {
  if(inTransaction())throw Object.assign(new Error('ATLAS_PROGRESS_TRANSACTION_ACTIVE'),{code:'ATLAS_PROGRESS_TRANSACTION_ACTIVE'});
  const rows=await query(SQL,[]);
  if(inTransaction())throw Object.assign(new Error('ATLAS_PROGRESS_TRANSACTION_ACTIVE'),{code:'ATLAS_PROGRESS_TRANSACTION_ACTIVE'});
  return rows;
}
