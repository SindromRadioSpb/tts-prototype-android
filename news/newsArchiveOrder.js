'use strict';

const C = require('./newsPackCore');
const ARCHIVE_ORDER_ID = /^nso_[0-9a-f]{32}$/;
const ARTICLE_ID = /^na_[0-9a-f]{24}$/;
const ORDER_TTL_MS = 6 * 3600e3;
const ARCHIVE_WINDOW_MS = 72 * 3600e3;

const fields = (object, keys) => keys.map(key => object && object[key] != null ? object[key] : null);
function archiveDraftHash(article, images) {
  // Ignore translated layers only. Source metadata, exact plain-Hebrew sentence boundaries,
  // paragraph positions, story, source-image metadata and bytes are fixed by the server.
  const original = article.learning.versions.find(C.isOriginal);
  return C.sha256(JSON.stringify([
    article.revision,
    fields(article.source, ['outlet_id', 'url', 'canonical_url', 'section_original_he', 'section',
      'content_type', 'published_at', 'updated_at', 'retrieved_at', 'author', 'original_title_he', 'paywalled', 'language']),
    article.learning.story_key || null,
    original && original.rows.map(r => [r.p, r.he_plain]),
    fields(article.image, ['mode', 'url', 'file', 'credit_he', 'alt_he']),
    (article.images || []).map(im => [
      ...fields(im, ['file', 'role', 'after_p', 'source_url', 'credit_he', 'caption_he', 'alt_he']),
      images[im.file] || null,
    ]),
  ]));
}

module.exports = { ARCHIVE_ORDER_ID, ARTICLE_ID, ORDER_TTL_MS, ARCHIVE_WINDOW_MS, archiveDraftHash };
