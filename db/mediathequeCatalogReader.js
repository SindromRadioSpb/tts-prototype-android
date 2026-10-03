'use strict';
const Metadata = require('../public/js/mediatheque-metadata');

// Published snapshots are immutable. Cache only their small metadata projection;
// current edition, public-read permission and download rights are queried anew
// on every call. This cache never grants access and never retains source bodies.
function createMediathequeCatalogReader({ all, maxEntries = 1024 }) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error('Invalid catalog cache limit');
  const cache = new Map();
  let fill = Promise.resolve();
  const source = "COALESCE(json_extract(ei.snapshot_json,'$.library.texts[0].source_meta'),json_extract(ei.snapshot_json,'$.library.texts[0].source_meta_json'),'{}')";
  const table = "COALESCE(json_extract(ei.snapshot_json,'$.library.texts[0].table_model_meta'),json_extract(ei.snapshot_json,'$.library.texts[0].table_model_meta_json'),'{}')";
  const key = row => row.edition_item_id + ':' + row.snapshot_sha256;
  async function project(rows) {
    // Request results outlive cache eviction: a catalog larger than the cache
    // must still return all its items, including the earliest chunks.
    const available = new Map(rows.filter(row => cache.has(key(row))).map(row => [key(row), cache.get(key(row))]));
    const missing = rows.filter(row => !available.has(key(row)));
    for (let offset = 0; offset < missing.length; offset += 64) {
      const chunk = missing.slice(offset, offset + 64);
      const projected = await all(`SELECT ei.edition_item_id,ei.snapshot_sha256,
        (json_extract(ei.snapshot_json,'$.library.texts[0].source_meta.publication_media.sha256') IS NOT NULL) has_media_file,
        SUBSTR(COALESCE(json_extract(ei.snapshot_json,'$.library.texts[0].topic'),''),1,256) topic,
        COALESCE(json_extract(ei.snapshot_json,'$.library.texts[0].tags'),json_extract(ei.snapshot_json,'$.library.texts[0].tags_json'),'[]') tags_json,
        ${Metadata.projectionSql(source, table)} media_projection,
        EXISTS(SELECT 1 FROM json_each(ei.snapshot_json,'$.library.texts[0].rows') r
          WHERE LENGTH(TRIM(COALESCE(json_extract(r.value,'$.russian'),json_extract(r.value,'$.ru'),'')))>0) has_translation
        FROM published_corpus_edition_items ei WHERE ei.public_read_allowed=1
          AND ei.edition_item_id IN (${chunk.map(() => '?').join(',')})`, chunk.map(row => row.edition_item_id));
      for (const row of projected) {
        let tags; try { tags = JSON.parse(row.tags_json); } catch (_) {}
        const metadata = { has_media_file: row.has_media_file, topic: row.topic, has_translation: row.has_translation,
          tags: Array.isArray(tags) ? tags.filter(tag => typeof tag === 'string').map(tag => tag.slice(0, 80)).slice(0, 30) : [],
          media: Metadata.normalize(row.media_projection) };
        available.set(key(row), metadata); cache.set(key(row), metadata);
        while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
      }
    }
    return available;
  }
  return async function readCatalog() {
    const rows = await all(`SELECT ei.edition_item_id,c.slug,c.title corpus_title,e.published_at,
      ei.public_work_id,ei.snapshot_sha256,ei.title,ei.creator,ei.position_no,
      ei.package_download_allowed download_allowed
      FROM published_corpora c JOIN published_corpus_editions e ON e.edition_id=c.current_edition_id
      JOIN published_corpus_edition_items ei ON ei.edition_id=e.edition_id
      WHERE c.status='PUBLISHED' AND ei.public_read_allowed=1 ORDER BY c.slug,ei.position_no,ei.public_work_id`);
    // Coalesce overlapping cold requests; a failed projection does not poison
    // future reads. The rows/permissions above remain local to each request.
    const pending = fill.then(() => project(rows));
    // The queue tail must not retain a completed request's unbounded result map.
    fill = pending.then(() => {}, () => {});
    const projections = await pending;
    return rows.flatMap(({ edition_item_id, ...row }) => {
      const metadata = projections.get(key({ edition_item_id, ...row }));
      if (!metadata || metadata.media.kind === 'text') return [];
      return [{ ...row, ...metadata, tags: metadata.tags.slice(), media: { ...metadata.media },
        ref: { kind: 'public', slug: row.slug, workId: row.public_work_id, snapshotHash: row.snapshot_sha256 } }];
    });
  };
}
module.exports = { createMediathequeCatalogReader };
