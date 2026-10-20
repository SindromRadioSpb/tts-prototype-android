// Field-level evidence shared by Studio/Room/cards. Metadata is attribution, not linguistic proof.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LearningFieldProvenance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function obj(value) {
    try { var out = typeof value === 'string' ? JSON.parse(value) : value; return out && typeof out === 'object' && !Array.isArray(out) ? out : {}; } catch (_) { return {}; }
  }
  function clean(value) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 100) : ''; }
  function field(row, name) {
    row = row || {};
    var edit = obj(row.edit_meta_json || row.edit_meta), material = obj(edit._studio_material);
    var fields = obj(row.field_meta || material.field_meta);
    var meta = obj(fields[name]);
    if (!Object.keys(meta).length) meta = obj(obj(row.translation_meta_json || row.translation_meta).fields)[name] || {};
    if (obj(edit.edited)[name] === true) return {source:'',authority:'user',status:clean(meta.status),imported:!!material.imported,declared:true};
    if (Object.keys(meta).length) return { source: clean(meta.provider || meta.source), authority: clean(meta.authority),
      status: clean(meta.status), imported: !!material.imported, declared: true };
    if (name === 'he_niqqud') {
      var derived = obj(obj(row.meta_json || row.meta).niqqud_derived);
      var value = String(row.he_niqqud || row.hebrew_niqqud || '');
      if (derived.value && (!value || value === derived.value)) return { source: clean(derived.provenance || derived.provider || row.niqqud_provenance), authority: 'derived', status: 'current', declared: true };
      if (row.niqqud_provenance) {
        var niq = obj(row.niqqud_provenance);
        if (niq.source != null && String(niq.source) !== value) return {source:'',authority:'unknown',declared:false};
        return { source: clean(niq.provider || row.niqqud_provenance), authority: clean(row.niqqud_authority).toLowerCase(), declared: true };
      }
    }
    return { source: '', authority: 'unknown', status: '', declared: false };
  }
  function label(row, name, t) {
    t = t || function (_, fallback) { return fallback; };
    var p = field(row, name), text;
    if (p.authority === 'user') text = t('fieldProvenance.manual', 'ручная правка');
    else if (p.source) text = p.source + ' · ' + t(p.imported ? 'fieldProvenance.archive' : 'fieldProvenance.declared', p.imported ? 'указан в архиве' : 'указан в материале');
    else text = t('fieldProvenance.unknown', 'источник неизвестен');
    if (p.status === 'invalidated' || p.status === 'conflict') text += ' · ' + t('fieldProvenance.stale', 'требует перепроверки');
    return text;
  }
  function mergeImported(local, source) {
    var incoming = obj(obj(source.edit_meta || source.edit_meta_json)._studio_material).field_meta;
    if (!incoming) return null;
    var edit = obj(local.edit_meta_json), current = obj(edit._studio_material), fields = Object.assign({}, obj(current.field_meta));
    var changed = false, aliases = { he_plain:'hebrew_plain', he_niqqud:'hebrew_niqqud', ru:'russian', translit:'translit', translit_ru:'translit_ru' };
    Object.keys(aliases).forEach(function (key) {
      if (fields[key] || obj(edit.edited)[key] || !incoming[key]) return;
      if (String(local[key] || '') !== String(source[aliases[key]] || source[key] || '')) return;
      fields[key] = incoming[key]; changed = true;
    });
    return changed ? Object.assign({}, edit, { _studio_material: Object.assign({}, current, { schema:'material-projection-v1', imported:true, field_meta:fields }) }) : null;
  }
  return { field: field, label: label, mergeImported: mergeImported };
});
