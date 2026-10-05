// Reading Room catalog/passport rules. No storage, fetch, DOM, imports or learner writes.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CorpusDiscovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PREVIEW_BYTES = 128 * 1024;
  const QID = /^Q[1-9]\d*$/;
  const NIQQUD = /[\u05b0-\u05bc\u05c1\u05c2\u05c7]/;
  const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const text = value => typeof value === 'string' || typeof value === 'number'
    ? String(value).trim() || null : null;
  const count = value => value == null || value === '' || typeof value === 'boolean'
    ? null : Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const qid = value => QID.test(text(value) || '') ? String(value).trim() : null;
  const unique = values => [...new Set(values.filter(value => value != null))];
  const url = value => {
    try { const parsed = new URL(text(value)); return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : null; }
    catch (_) { return null; }
  };
  const normalizeName = value => String(value == null ? '' : value).normalize('NFKC')
    .replace(/[\u0591-\u05bd\u05bf-\u05c7\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .toLowerCase().replace(/[\s,]+/g, ' ').trim();

  function layer(status = 'unknown', basis = 'unknown', numerator = null, denominator = null, scope = 'work') {
    return { status, basis, numerator, denominator, scope };
  }

  /** Count-backed layers only. Invalid/contradictory counts remain unknown. */
  function measuredLayer(numerator, denominator, options = {}) {
    const n = count(numerator), d = count(denominator);
    if (n == null || d == null || d === 0 || n > d) return layer('unknown', 'unknown', null, null, options.scope || 'work');
    return layer(n === 0 ? 'none' : n === d ? 'full' : 'partial', options.basis || 'measured', n, d, options.scope || 'work');
  }

  const rowText = row => text(row && (row.hebrew_plain || row.he_plain || row.hebrew_niqqud || row.he_niqqud));
  const rowRu = row => text(row && (row.russian || row.ru));
  const rowNiqqud = row => text(row && (row.hebrew_niqqud || row.he_niqqud)) || '';
  const rowTranslit = row => text(row && (row.translit_ru || row.translit || row.transliteration));
  const rowAudioRef = row => text(row && (row.audio_asset_key || row.audio_key || row.audio_file));

  /** Measures presence, not linguistic correctness. Audio references are not playable assets.
   * completeWork is an explicit caller assertion; expectedRows guards against sampling/part loss.
   */
  function measureCoverage(rows, options = {}) {
    const relevant = Array.isArray(rows) ? rows.filter(rowText) : [];
    const expected = count(options.expectedRows);
    const whole = options.completeWork === true && (expected == null || expected === relevant.length);
    const scope = whole ? 'work' : 'provided-rows';
    const denominator = relevant.length;
    const tally = predicate => relevant.reduce((n, row) => n + (predicate(row) ? 1 : 0), 0);
    const translation = measuredLayer(tally(rowRu), denominator, { scope });
    const niqqud = measuredLayer(tally(row => NIQQUD.test(rowNiqqud(row))), denominator, { scope });
    const transliteration = measuredLayer(tally(rowTranslit), denominator, { scope });
    let audio = layer('unknown', 'unknown', null, null, scope);
    if (Array.isArray(options.verifiedAudioRowIds)) {
      const verified = new Set(options.verifiedAudioRowIds.map(String));
      audio = measuredLayer(tally(row => {
        const rowId = row.row_id != null ? row.row_id : row.id;
        return rowId != null && verified.has(String(rowId));
      }), denominator, { scope, basis: 'verified-assets' });
    }
    return {
      translation, niqqud, transliteration, audio,
      audioReferences: measuredLayer(tally(rowAudioRef), denominator, { scope, basis: 'row-references' }),
      rows: denominator, completeWork: whole,
      warnings: options.completeWork === true && !whole ? ['row-count-mismatch'] : [],
    };
  }

  /** Only explicitly work-level, evidence-bound metadata can claim an official period.
   * Neither card.era nor author dates are accepted by this function.
   */
  function normalizeSourcePeriod(raw, workId) {
    const source = obj(raw), evidence = obj(source.provenance || source.source);
    const work = text(source.work_id || source.workId);
    const sourceUrl = url(source.source_url || source.sourceUrl || evidence.url);
    const snapshot = text(source.snapshot || source.source_snapshot || source.version || evidence.snapshot || evidence.version);
    const sourceLabel = text(source.source_label || source.original_label || source.sourceLabel);
    const value = text(source.value);
    const level = source.scope || source.level;
    const identity = work && (workId == null || work === String(workId));
    const verified = level === 'work' && identity && sourceUrl && snapshot;
    const unknown = reason => ({ status: 'unchecked', value: null, label: null, sourceLabel: null,
      sourceUrl: null, snapshot: null, workId: text(workId), reason });
    if (!verified) return unknown(Object.keys(source).length ? 'unverified-work-evidence' : 'source-not-checked');
    if (source.status === 'checked-absent' && !value && !sourceLabel) {
      return { status: 'checked-absent', value: null, label: null, sourceLabel: null, sourceUrl, snapshot, workId: work, reason: 'classification-absent-in-checked-source' };
    }
    if (source.status !== 'known' || !value || !sourceLabel) return unknown('classification-not-verified');
    return { status: 'known', value, label: text(source.label) || sourceLabel, sourceLabel, sourceUrl, snapshot, workId: work, reason: null };
  }

  function legacyCoverage(card) {
    const coverage = obj(card.coverage);
    const translation = text(coverage.translation);
    const audio = text(card.audio_status) || text(coverage.audio);
    return {
      translation: translation === 'none' ? layer('none', 'catalog') : translation ? layer('present', 'catalog') : layer(),
      // Catalog ratio establishes presence only; it is not a count or correctness check.
      niqqud: Number.isFinite(coverage.niqqud) && coverage.niqqud >= 0 && coverage.niqqud <= 1
        ? { ...layer(coverage.niqqud === 0 ? 'none' : 'present', 'catalog-ratio'), presenceRatio: coverage.niqqud }
        : layer(),
      transliteration: layer(),
      audio: audio === 'none' ? layer('none', 'catalog') : audio ? layer('present', 'catalog') : layer(),
    };
  }

  /** All context is read-only evidence supplied by the host; no writes or lookup happen here. */
  function describeMaterial(card, context = {}) {
    const source = obj(card), corpus = obj(source.corpus), coverage = obj(source.coverage);
    const published = typeof context.published === 'boolean' ? context.published
      : coverage.text === true && !!text(coverage.translation) && coverage.translation !== 'none';
    const state = context.loadError ? 'error' : published ? 'published' : 'metadata-only';
    const baseCoverage = legacyCoverage(source);
    const publication = obj(source.public_learning), filled = obj(publication.filled_rows);
    if (publication.schema === 'benyehuda-public-learning-v1' && publication.work_id === String(source.id)
      && publication.main_rows === source.segments && /^[a-f0-9]{64}$/.test(source.bundle_sha256 || '')
      && publication.complete_learning_edition === true) {
      baseCoverage.translation = measuredLayer(filled.russian, publication.main_rows, { basis: 'publication-manifest', scope: 'learning-edition' });
      baseCoverage.niqqud = measuredLayer(publication.niqqud_rows, publication.main_rows, { basis: 'publication-manifest', scope: 'learning-edition' });
      baseCoverage.transliteration = measuredLayer(Math.min(filled.translit, filled.translit_ru), publication.main_rows, { basis: 'publication-manifest', scope: 'learning-edition' });
    }
    const measured = Array.isArray(context.rows) ? measureCoverage(context.rows, {
      completeWork: context.rowsComplete === true, expectedRows: source.segments,
      verifiedAudioRowIds: context.verifiedAudioRowIds,
    }) : null;
    if (measured && measured.completeWork) {
      for (const key of ['translation', 'niqqud', 'transliteration']) baseCoverage[key] = measured[key];
      if (measured.audio.basis === 'verified-assets') baseCoverage.audio = measured.audio;
    }
    const review = text(source.review_status || corpus.review_status);
    const translationProvenance = obj(source.translation_provenance);
    const workId = text(source.byehuda_id || source.id);
    const era = text(source.era);
    const eraEvidence = obj(context.appEraEvidence);
    return {
      availability: { state, published, basis: typeof context.published === 'boolean' ? 'source-contract' : 'catalog',
        reason: state === 'error' ? 'load-failed' : state === 'metadata-only' ? 'learning-version-not-published' : null },
      coverage: baseCoverage, measuredSample: measured && !measured.completeWork ? measured : null,
      provenance: {
        processing: review === 'machine' ? 'machine' : review === 'machine_assisted' ? 'machine-assisted' : 'unknown',
        review: review === 'human_proofread' ? 'human-proofread' : review === 'machine_assisted' ? 'machine-assisted' : 'unknown',
        assertedReviewStatus: review,
        provider: text(translationProvenance.provider || source.translation_provider),
        model: text(translationProvenance.model),
        sourceUrl: url(source.source_url || obj(corpus.provenance).source_url),
        warnings: unique([...(Array.isArray(source.warnings) ? source.warnings.map(text) : []), ...(measured ? measured.warnings : [])]),
      },
      sourcePeriod: normalizeSourcePeriod(source.source_period || corpus.source_period, workId),
      appEra: { status: era && era !== 'unknown' ? 'derived' : 'unknown', value: era && era !== 'unknown' ? era : null,
        method: text(eraEvidence.method) || 'legacy-catalog-grouping', ruleVersion: text(eraEvidence.ruleVersion), official: false },
      localState: {
        text: context.localText === true ? 'available' : context.localText === false ? 'absent' : 'unknown',
        audio: context.localAudio === true ? 'available' : context.localAudio === false ? 'absent' : 'unknown',
        // localText alone never certifies offline media, dictionaries or source freshness.
        completeOffline: context.localText === true && context.allRequiredAssetsLocal === true,
      },
      version: { workId, sourceEditionId: text(source.source_edition_id), learningEditionId: text(source.learning_edition_id),
        revision: text(source.learning_revision || source.snapshot_sha256), catalogRevision: text(context.catalogRevision),
        currentLocalVersion: 'unverified' },
    };
  }

  function authorityNode(authority, id) {
    if (typeof authority === 'function') return obj(authority(id));
    if (authority instanceof Map) return obj(authority.get(id));
    if (Array.isArray(authority)) return obj(authority.find(node => node && node.qid === id));
    if (Array.isArray(obj(authority).authors)) return obj(authority.authors.find(node => node && node.qid === id));
    return obj(obj(authority)[id]);
  }

  /** Catalog groups, not a complete count of humans. Missing identities never merge by name. */
  function groupCatalogAuthors(rows, authority) {
    const groups = [], byQid = new Map();
    for (const [index, raw] of (Array.isArray(rows) ? rows : []).entries()) {
      const row = obj(raw), id = qid(row.qid), original = text(row.name) || '';
      let group = id && byQid.get(id);
      if (!group) {
        group = { groupId: id || `unidentified:${index}`, qid: id, name: original, primaryName: original,
          works: 0, ready: 0, blocks: [], name_variants: [], originalNames: [], contributors: [], coauthored: false, catalogRows: 0 };
        groups.push(group);
        if (id) byQid.set(id, group);
      }
      group.catalogRows++;
      group.works += count(row.works) || 0;
      group.ready += count(row.ready) || 0;
      group.blocks.push(...(Array.isArray(row.blocks) && row.blocks.length ? row.blocks.slice() : [null]));
      group.originalNames.push(original);
      group.name_variants.push(original, ...(Array.isArray(row.name_variants) ? row.name_variants.map(text) : []));
      const explicit = Array.isArray(row.contributors) ? row.contributors : [];
      group.contributors.push(...explicit.map(rawPerson => {
        const person = obj(rawPerson);
        return { name: text(person.name || person.display), qid: qid(person.qid), role: text(person.role) || 'unknown', basis: 'catalog' };
      }).filter(person => person.name));
      for (const name of original.split(';').map(text).filter(Boolean)) {
        group.contributors.push({ name, qid: null, role: 'unknown', basis: 'catalog-name' });
      }
      group.coauthored = group.coauthored || row.coauthored === true || original.includes(';') || explicit.length > 1;
    }
    for (const group of groups) {
      const node = group.qid ? authorityNode(authority, group.qid) : {};
      group.primaryName = text(node.display) || group.primaryName;
      group.originalNames = unique(group.originalNames);
      group.name_variants = unique(group.name_variants);
      group.blocks = [...new Set(group.blocks)];
      // Mixed solo/coauthored entries remain visible, rather than being renamed to one person.
      group.name = group.coauthored ? group.originalNames.join(' / ') : group.primaryName;
      const people = new Map();
      for (const person of group.contributors) {
        if (person.basis === 'catalog-name' && group.contributors.some(known => known.basis === 'catalog' && normalizeName(known.name) === normalizeName(person.name))) continue;
        const verifiedId = person.qid || (group.qid && normalizeName(person.name) === normalizeName(node.display) ? group.qid : null);
        const key = verifiedId ? `${verifiedId}:${person.role}` : `${normalizeName(person.name)}:${person.role}`;
        if (!people.has(key)) people.set(key, { ...person, qid: verifiedId });
      }
      group.contributors = [...people.values()];
    }
    return groups;
  }

  function aliasesForAuthor(authorId, sidecar, options = {}) {
    const id = qid(authorId);
    if (!id) return [];
    const names = [];
    for (const entry of (Array.isArray(sidecar) ? sidecar : obj(sidecar).entries || [])) {
      const evidence = obj(entry && entry.evidence);
      if (!entry || entry.qid !== id || entry.verified !== true || !url(evidence.source_url) || !text(evidence.snapshot)) continue;
      if (options.locale && entry.locale !== options.locale) continue;
      names.push(text(entry.label), ...(Array.isArray(entry.aliases) ? entry.aliases.map(text) : []));
    }
    return unique(names);
  }

  /** Each matching name may resolve to multiple identities. No title translation is synthesized. */
  function authorAliasMatches(query, sidecar, options = {}) {
    const normalized = normalizeName(query);
    if (!normalized || normalized.length > 256) return [];
    const tokens = normalized.split(' ');
    const matches = [];
    for (const entry of (Array.isArray(sidecar) ? sidecar : obj(sidecar).entries || [])) {
      const id = qid(entry && entry.qid), evidence = obj(entry && entry.evidence);
      if (!id || !url(evidence.source_url) || !text(evidence.snapshot) || entry.verified !== true) continue;
      if (options.locale && entry.locale !== options.locale) continue;
      const names = unique([text(entry.label), ...(Array.isArray(entry.aliases) ? entry.aliases.map(text) : [])]);
      if (names.some(name => tokens.every(token => normalizeName(name).includes(token))) && !matches.includes(id)) matches.push(id);
    }
    return matches;
  }

  /** Use before headers and before retaining each stream chunk; host cancels on cancel=true. */
  function previewPolicy(options = {}) {
    const budget = count(options.budgetBytes) || PREVIEW_BYTES;
    const declared = count(options.contentLength);
    const received = count(options.bytesRead) || 0;
    const next = count(options.nextChunkBytes) || 0;
    const invalidBytes = options.bytesRead != null && count(options.bytesRead) == null
      || options.nextChunkBytes != null && count(options.nextChunkBytes) == null;
    const tooLarge = declared != null && declared > budget || received > budget || next > budget - received;
    return { allowed: !tooLarge && !invalidBytes, cancel: tooLarge || invalidBytes,
      reason: invalidBytes ? 'preview-invalid-byte-count' : tooLarge ? 'preview-byte-budget' : null,
      budgetBytes: budget, contentLength: declared, retainedBytes: tooLarge || invalidBytes ? received : received + next };
  }

  /** Extract only the published row fields from a bounded, already fetched bundle. */
  function extractPreview(bundle, options = {}) {
    const library = obj(obj(bundle).library);
    const texts = Array.isArray(library.texts) ? library.texts : Array.isArray(obj(bundle).texts) ? bundle.texts : [];
    const rows = texts.flatMap(item => Array.isArray(item.rows) ? item.rows : []).filter(rowText);
    const maxRows = Math.max(3, Math.min(5, count(options.maxRows) || 5));
    return { rows: rows.slice(0, maxRows).map(row => ({ hebrew: rowNiqqud(row) || rowText(row),
      russian: rowRu(row), transliteration: rowTranslit(row) })), totalRows: rows.length,
      coverage: measureCoverage(rows, { completeWork: options.completeWork === true, expectedRows: options.expectedRows }), textCount: texts.length };
  }

  return Object.freeze({ PREVIEW_BYTES, normalizeName, measuredLayer, measureCoverage, normalizeSourcePeriod,
    describeMaterial, groupCatalogAuthors, aliasesForAuthor, authorAliasMatches, previewPolicy, extractPreview });
});
