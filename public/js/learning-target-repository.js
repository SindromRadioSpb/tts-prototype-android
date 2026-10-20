// Form targets use the existing canonical review_log and word_status projection.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LearningTargetRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function createRepository(adapter, Targets, Canon) {
    var q = adapter.query, r = adapter.run, x = adapter.exec;
    async function mark(input) {
      var key = String(input && input.key || ''), st = String(input && input.status || '');
      if (!Targets.parse(key) || ['', 'new', 'l1', 'l2', 'l3', 'l4', 'known', 'ignore'].indexOf(st) < 0) throw new Error('LEARNING_TARGET_MARK_INVALID');
      var src = input.source || {}, seed = input.seedRow, sched = input.sched;
      if (seed && (seed.item_key !== key || seed.kind !== 'seed' || !sched || !seed.id || !seed.reviewed_at || !seed.source)) throw new Error('LEARNING_TARGET_SEED_INVALID');
      var at = (adapter.now ? adapter.now() : new Date().toISOString());
      var tx = false;
      try {
        await x('BEGIN IMMEDIATE;'); tx = true;
        var old = (await q('SELECT * FROM word_status WHERE lemma_key=?', [key]))[0];
        if (input.enrollOnly && old) {
          await x('ROLLBACK;'); tx = false;
          return { committed: true, created: false, status: old.status || '' };
        }
        if (!st && old && !old.srs_due) await r('DELETE FROM word_status WHERE lemma_key=?', [key]);
        else if (st || old) await r(`INSERT INTO word_status
          (lemma_key,status,updated_at,srs_text_key,srs_sentence_id,srs_order_index,srs_surface)
          VALUES (?,?,?,?,?,?,?) ON CONFLICT(lemma_key) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,
          srs_text_key=COALESCE(excluded.srs_text_key,srs_text_key),srs_sentence_id=COALESCE(excluded.srs_sentence_id,srs_sentence_id),
          srs_order_index=COALESCE(excluded.srs_order_index,srs_order_index),srs_surface=COALESCE(excluded.srs_surface,srs_surface)`,
          [key,st,at,src.textKey||null,src.sentenceId||null,src.orderIndex==null?null:Number(src.orderIndex),src.surface||null]);
        if (seed && !(old && old.srs_due) && !(await q("SELECT 1 x FROM review_log WHERE item_key=? AND kind='seed' LIMIT 1", [key])).length) {
          await r(`INSERT INTO review_log(id,item_key,kind,reviewed_at,grade,source,channel,latency_ms,meta_json)
            VALUES(?,?,'seed',?,NULL,?,NULL,NULL,?)`, [seed.id,key,seed.reviewed_at,seed.source,seed.meta_json||JSON.stringify(seed.meta||{})]);
          await r(`UPDATE word_status SET srs_due=?,srs_interval=?,srs_reps=?,srs_lapses=?,srs_stability=?,srs_difficulty=?,srs_reviewed_at=?,srs_scheme=? WHERE lemma_key=?`,
            [new Date(sched.due).toISOString(),sched.interval||0,sched.reps||0,sched.lapses||0,sched.stability,sched.difficulty,
              new Date(sched.reviewedAt).toISOString(),sched.scheme||'fsrs',key]);
        }
        if ((!old && st) || (old && old.status !== st)) {
          var nonce = adapter.newId ? adapter.newId() : globalThis.crypto.randomUUID();
          var id = 'mark:' + Canon.sha1Hex(key + '|' + at + '|' + st + '|' + nonce).slice(0, 24);
          await r(`INSERT INTO review_log(id,item_key,kind,reviewed_at,grade,source,channel,latency_ms,meta_json)
            VALUES(?,?,'mark',?,NULL,'word-mark',NULL,NULL,?)`, [id,key,at,JSON.stringify({status:st,keyer_version:Canon.KEYER_VERSION})]);
        }
        await x('COMMIT;'); tx = false;
        return { committed: true, created: !old, status: st };
      } catch (error) { if (tx) { try { await x('ROLLBACK;'); } catch (_) {} } throw error; }
    }
    async function list(parentKey) {
      var parent = /^pid:([1-9][0-9]{0,8})$/.exec(String(parentKey || ''));
      if (parentKey && !parent) return [];
      var rows = await q("SELECT * FROM word_status WHERE lemma_key LIKE ? ORDER BY lemma_key", [parent ? 'ft1:'+parent[1]+':%' : 'ft1:%']);
      return rows.filter(function (row) { var t = Targets.parse(row.lemma_key); return t && (!parentKey || t.parentKey === parentKey); });
    }
    return { mark: mark, list: list };
  }
  return { createRepository: createRepository };
});
