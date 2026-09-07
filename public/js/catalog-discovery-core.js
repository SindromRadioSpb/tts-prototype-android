// Shared discovery rules. Source adapters retain their own authorization and storage.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CatalogDiscovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** @typedef {{q:string, tags:string[], tagMode:'all'|'any', scope:string, sort:string, smart:string, level:string, provider:string}} DiscoveryState */
  const SMART_FILTERS = Object.freeze([
    ['recent', 'discovery.smartRecent'], ['struggling', 'discovery.smartStruggling'],
    ['mastered', 'discovery.smartMastered'], ['fresh', 'discovery.smartNew'],
    ['with-note', 'discovery.smartWithNote'], ['audio-noted', 'discovery.smartAudio'],
    ['srs-noted', 'discovery.smartSrs'], ['templated', 'discovery.smartTemplated'],
  ].map(Object.freeze));
  const SORTS = Object.freeze(['position', 'opened_desc', 'updated_desc', 'title_asc', 'title_desc', 'level_asc', 'topic_asc', 'creator_asc', 'familiar_desc', 'length', 'progress']);
  const normalize = value => String(value == null ? '' : value).normalize('NFKC').replace(/[\u0591-\u05bd\u05bf-\u05c7]/g, '').toLocaleLowerCase().trim();
  const unique = values => {
    const seen = new Set();
    return values.filter(value => { const key = normalize(value); if (!key || seen.has(key)) return false; seen.add(key); return true; });
  };
  function parseQuery(raw) {
    const textTokens = [], tags = [];
    for (const match of String(raw || '').matchAll(/(?:#|tag:)(?:"([^"]+)"|([^\s]+))|"([^"]+)"|(\S+)/gi)) {
      if (match[1] || match[2]) tags.push((match[1] || match[2]).trim());
      else textTokens.push(normalize(match[3] || match[4]));
    }
    return { textTokens: unique(textTokens), tags: unique(tags), textQ: textTokens.join(' ') };
  }
  function matchesText(value, tokens) {
    const haystack = normalize(value);
    return (tokens || []).every(token => haystack.includes(normalize(token)));
  }
  function matchesTags(values, wanted, mode) {
    if (!wanted || !wanted.length) return true;
    const found = new Set((values || []).map(normalize));
    return mode === 'any' ? wanted.some(tag => found.has(normalize(tag))) : wanted.every(tag => found.has(normalize(tag)));
  }
  function familiarityValue(fit) {
    if (!fit || fit.status !== 'AVAILABLE' || !fit.rank_eligible) return null;
    const value = fit.recorded_familiar_pct_lower_bound;
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
  }
  function compareFamiliarity(left, right) {
    const a = familiarityValue(left), b = familiarityValue(right);
    if (a == null || b == null) return a == null ? b == null ? 0 : 1 : -1;
    return b - a;
  }
  function tagFacets(items, readTags, selected = [], limit = 18) {
    const counts = new Map();
    for (const item of items || []) for (const value of unique(readTags(item) || [])) {
      const key = normalize(value), old = counts.get(key);
      counts.set(key, { value: old ? old.value : String(value), count: (old ? old.count : 0) + 1 });
    }
    const all = Array.from(counts.values()).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    const visible = all.slice(0, limit);
    for (const tag of selected) if (!visible.some(x => normalize(x.value) === normalize(tag))) {
      visible.push(counts.get(normalize(tag)) || { value: tag, count: 0 });
    }
    return { items: visible, total: all.length };
  }
  function normalizeProvider(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'madlad' || value.startsWith('madlad-')) return 'madlad';
    if (value === 'gemini' || value.startsWith('gemini-')) return 'gemini';
    if (['gcp', 'google-cloud', 'google-cloud-translate', 'google-translate-v3'].includes(value)) return 'gcp';
    if (['google', 'google-free', 'google-translate', 'googletrans'].includes(value)) return 'google-free';
    return value;
  }
  function translationProvenance(text = {}, rows = []) {
    const object = value => { if (value && typeof value === 'object') return value; try { return JSON.parse(value) || {}; } catch (_) { return {}; } };
    const providers = new Set();
    let knownRows = 0, model = '', generatedAt = '';
    for (const row of rows) {
      const provider = normalizeProvider(row && (row.translation_provider ?? row.translationProvider ?? row._translationProvider));
      if (provider) { providers.add(provider); knownRows++; }
      const meta = object(row && (row.translation_meta_json ?? row.translationMetaJson ?? row._translationMetaJson));
      if (!model) model = String(meta.model || meta.translator_version || '').trim();
      if (!generatedAt) generatedAt = String(meta.generatedAt || meta.generated_at || '').trim();
    }
    if (!providers.size) {
      const raw = text.translation_providers ?? text.translationProviders ?? '';
      for (const value of Array.isArray(raw) ? raw : String(raw).split(',')) { const p = normalizeProvider(value); if (p) providers.add(p); }
    }
    const authority = providers.size ? rows.length ? 'sentences' : 'sentence-summary' : 'table-meta-fallback';
    const metas = [object(text.table_model_meta_json ?? text.tableModelMetaJson ?? text.tableModelMeta), object(text.source_meta_json ?? text.sourceMetaJson)];
    if (!providers.size) for (const meta of metas) {
      const p = normalizeProvider(meta.provider || meta.actual_provider || meta.translator_provider);
      if (p) { providers.add(p); break; }
    }
    for (const meta of metas) {
      if (!model) model = String(meta.model || meta.translator_version || '').trim();
      if (!generatedAt) generatedAt = String(meta.generatedAt || meta.generated_at || '').trim();
    }
    const list = Array.from(providers).sort();
    return { providers: list, kind: list.length > 1 ? 'mixed' : list.length ? 'single' : 'unknown', primary: list.length === 1 ? list[0] : '',
      model, generatedAt, knownRows, totalRows: rows.length, authority: list.length ? authority : 'unknown' };
  }
  function matchesProvider(provenance, provider) {
    return !provider || (provider === 'mixed' || provider === 'unknown' ? provenance.kind === provider : provenance.providers.includes(provider));
  }
  /** Normalize presentation input only; never infer corpus metadata or learner truth. */
  function state(input = {}, defaults = {}) {
    return {
      q: String(input.q || ''), tags: unique((Array.isArray(input.tags) ? input.tags : []).map(String)),
      tagMode: input.tagMode === 'any' ? 'any' : 'all', scope: String(input.scope || defaults.scope || 'texts'),
      sort: SORTS.includes(input.sort) ? input.sort : defaults.sort || 'opened_desc',
      smart: SMART_FILTERS.some(x => x[0] === input.smart) ? input.smart : '',
      level: String(input.level || ''), provider: String(input.provider || ''),
    };
  }
  return Object.freeze({ SMART_FILTERS, SORTS, normalize, parseQuery, matchesText, matchesTags, familiarityValue, compareFamiliarity, tagFacets, normalizeProvider, translationProvenance, matchesProvider, state });
});
