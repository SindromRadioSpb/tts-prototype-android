'use strict';
// A news article version as a Reading Room text: the same snapshot shape as a published
// corpus work ({library:{texts:[text]}}), rows projected exactly like publication/materialArchive.js,
// so the Room opens it with the table, morphology card, word status and "in context (AI)".
const crypto = require('node:crypto');
const { boundedFieldMeta } = require('../publication/materialArchive');
const { canonicalizeUrl } = require('./newsPackCore');

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object')
    return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  return JSON.stringify(value === undefined ? null : value);
}
function workIdFor(articleId, level) { return articleId + '.' + String(level).toLowerCase(); }

// article: the stored article.json (without `check`); version: one of article.learning.versions;
// glossLayer: an already bounded word-gloss-ai-layer-v1 or null.
function buildNewsSnapshot(article, version, { workId, glossLayer = null } = {}) {
  const s = article.source, l = article.learning;
  const rows = version.rows.map((r, i) => ({
    // No niqqud from the producer: the Hebrew column still shows the unpointed text (the Room has no
    // pointing-on-open path); the ingest receipt warns NIQQUD_MISSING so the producer adds it.
    order_index: i, hebrew_plain: r.he_plain, hebrew_niqqud: r.he_niqqud || r.he_plain, translit: r.translit || '', translit_ru: r.translit_ru || '', russian: r.ru,
    edit_meta: { _studio_material: { schema: 'material-projection-v1', imported: true, field_meta: boundedFieldMeta(r.field_meta) } },
  }));
  let paragraph = null;
  const sourceText = version.rows.map((r, i) => {
    const sep = i === 0 ? '' : (r.p != null && r.p !== paragraph ? '\n' : ' ');
    paragraph = r.p; return sep + r.he_plain;
  }).join('');
  const text = {
    title: l.title_he, text_key: 'news:' + workId, source_text: sourceText, table_model_meta: null, rows,
    source_meta: { news: {
      outlet_id: s.outlet_id, canonical_url: canonicalizeUrl(s.canonical_url), published_at: s.published_at, author: s.author || null,
      section: s.section, section_original_he: s.section_original_he, content_type: s.content_type, original_title_he: s.original_title_he,
      paywalled: !!s.paywalled, image: article.image, prepared: article.prepared, quality: article.quality || null,
      level: version.level, levels: l.versions.map(v => v.level), title_ru: l.title_ru,
    } },
  };
  if (glossLayer) text.word_gloss_ai_layer = glossLayer;
  const snapshot = { library: { texts: [text] } };
  return { snapshot, snapshot_sha256: crypto.createHash('sha256').update(canonicalJson(snapshot)).digest('hex') };
}
module.exports = { buildNewsSnapshot, workIdFor, canonicalJson };
