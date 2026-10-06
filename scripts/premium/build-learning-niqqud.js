#!/usr/bin/env node
'use strict';
// Explicit, resumable preparation of public-text pointing; does not upload or write source bundles.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Layer = require('../../public/js/benyehuda-learning-niqqud');
const { fillMatres, normalizeMatres } = require('../../public/js/subtitle-material-vocalization');
const cloud = require('../../db/premium/providers/dictaCloud');
const { auditRows, atomic } = require('./learning-niqqud-corpus');
const BUILDER_VERSION = 'source-preserving-context-v2';
const LOCAL_MODEL_VERSION = 'dictabert-large-char-menaked@2025-03';
const WORD = /[א-ת][א-ת\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]*/g;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function groups(rows, limit = 1400) {
  const result = []; let pending = [], length = 0;
  for (let i = 0; i < rows.length; i++) {
    const plain = rows[i].hebrew_plain;
    if (pending.length && length + plain.length > limit) { result.push(pending); pending = []; length = 0; }
    pending.push(i); length += plain.length + 1;
    if (length >= 650 && /[.!?…]["״׳'”»)]*$/.test(plain.trim())) { result.push(pending); pending = []; length = 0; }
  }
  if (pending.length) result.push(pending);
  return result;
}
function alignWords(input, answer) {
  const source = Array.from(input.matchAll(WORD)), target = Array.from(String(answer).matchAll(WORD));
  if (source.length === target.length) return target.map(match => ({ value: match[0] }));
  // Only exact joins across source quotes/hyphens (abbreviations), or an exact model split
  // of a source token, may repair tokenization. No insertion/deletion or loose letter matching.
  const n = source.length, m = target.length, memo = new Map();
  function solve(i, j) {
    if (i === n && j === m) return { cost: 0, pairs: [] };
    if (i >= n || j >= m) return null;
    const key = i + ':' + j; if (memo.has(key)) return memo.get(key);
    let best = null;
    function offer(a, b, cost, pairs) {
      const tail = solve(i + a, j + b); if (!tail) return;
      const value = { cost: cost + tail.cost, pairs: pairs.concat(tail.pairs) };
      if (!best || value.cost < best.cost) best = value;
    }
    const same = fillMatres(source[i][0], target[j][0]);
    offer(1, 1, same ? 0 : 5, [{ value: target[j][0] }]);
    for (let count = 2; count <= 3; count++) {
      if (i + count <= n) {
        const selected = source.slice(i, i + count);
        const quoteOnly = selected.slice(1).every((match, k) => /^["'״׳-]+$/.test(input.slice(selected[k].index + selected[k][0].length, match.index)));
        if (quoteOnly && Layer.canonical(selected.map(x => x[0]).join('')) === Layer.canonical(target[j][0]))
          offer(count, 1, 1, selected.map(() => ({ value: null, tokenization_review: true })));
      }
      if (j + count <= m && Layer.canonical(source[i][0]) === Layer.canonical(target.slice(j,j+count).map(x => x[0]).join('')))
        offer(1, count, 1, [{ value: null, tokenization_review: true }]);
    }
    memo.set(key, best); return best;
  }
  const aligned = solve(0,0);
  if (!aligned) throw new Error('Provider token count changed: ' + n + ' -> ' + m);
  return aligned.pairs;
}
function projectRows(rows, answer) {
  const sourceWords = rows.flatMap(row => Array.from(row.hebrew_plain.matchAll(WORD), x => x[0]));
  const words = alignWords(rows.map(row => row.hebrew_plain).join(' '), answer);
  if (words.length !== sourceWords.length) throw new Error('Provider token count changed: ' + sourceWords.length + ' -> ' + words.length);
  let at = 0, matched = 0, total = 0;
  const failures = [];
  const entries = rows.map(row => {
    const oldWords = Array.from(String(row.hebrew_niqqud || '').matchAll(WORD), x => x[0]);
    let inRow = 0;
    const misses = [];
    const learning = /[א-ת]/u.test(row.hebrew_plain) ? row.hebrew_plain.replace(WORD, source => {
      const candidate = words[at++].value, old = oldWords[inRow++];
      if (source.length > 1) total++;
      const projected = candidate ? fillMatres(source, candidate) : null;
      if (projected && /[\u05b0-\u05bb\u05c7]|וּ/u.test(projected)) { if (source.length > 1) matched++; return projected; }
      // One-letter chapter markers and quote-separated abbreviation fragments have no vowels to restore.
      if (source.length > 1) misses.push({ source, answer: candidate });
      return old ? fillMatres(source, old) || source : source;
    }) : row.hebrew_niqqud || '';
    if (misses.length) failures.push({ order_index: row.order_index, words: misses });
    return { order_index: row.order_index, he_plain: row.hebrew_plain,
      source_niqqud: row.hebrew_niqqud || '', learning_niqqud: learning, unresolved_words: misses.length };
  });
  return { entries, failures, matched, total };
}
async function build(options) {
  const bytes = fs.readFileSync(options.source), bundle = JSON.parse(bytes);
  if (bundle.library?.texts?.length !== 1) throw new Error('Expected one source work');
  const text = bundle.library.texts[0], id = Layer.workId(text), rows = text.rows;
  if (!id || !rows?.length) throw new Error('Missing source identity');
  rows.forEach((row, i) => { if (row.order_index !== i || typeof row.hebrew_plain !== 'string') throw new Error('Invalid source row order'); });
  fs.mkdirSync(options.cache, { recursive: true }); fs.mkdirSync(options.out, { recursive: true });
  const sets = groups(rows), results = [], failures = [], fragments = []; let matched = 0, total = 0, requested = 0;
  for (let i = 0; i < sets.length; i++) {
    const subset = sets[i].map(index => rows[index]), input = subset.map(row => row.hebrew_plain).join(' ');
    // Keep complete source pointing. Project it onto exact source spelling before requesting anything.
    let sourceProjection;
    try { sourceProjection = projectRows(subset, subset.map(row => row.hebrew_niqqud || row.hebrew_plain).join(' ')); } catch (_) {}
    const sourceAudit = auditRows(subset);
    if (!sourceAudit.needs_preparation && sourceProjection && !sourceProjection.failures.length) {
      results.push(...sourceProjection.entries); matched += sourceProjection.matched; total += sourceProjection.total;
      fragments.push({ input_sha256: hash(input), authority: 'source' });
      continue;
    }
    let config = { provider: 'dicta-cloud', adapter: cloud.MODEL_VERSION, genre: 'modern', context: 'connected-source-fragments', builder: BUILDER_VERSION };
    let cacheKey = hash(JSON.stringify(config) + '\n' + input), file = path.join(options.cache, cacheKey + '.json');
    if (!fs.existsSync(file) && options.localFallback) {
      const localConfig = { provider: 'dictabert-local', adapter: LOCAL_MODEL_VERSION, matres: '¤', context: 'connected-source-fragments', builder: BUILDER_VERSION };
      const localKey = hash(JSON.stringify(localConfig) + '\n' + input), localFile = path.join(options.cache, localKey + '.json');
      // Never regenerate an existing local answer when the free cloud service recovers.
      if (fs.existsSync(localFile) || !options.cloudFirst) { config = localConfig; cacheKey = localKey; file = localFile; }
    }
    let response;
    if (fs.existsSync(file)) response = JSON.parse(fs.readFileSync(file));
    else {
      if (options.cachedOnly) throw Object.assign(new Error('Unprepared provider fragment ' + (i + 1)), { code: 'NIQQUD_CACHE_MISS' });
      let raw, answer;
      for (let attempt = 0; attempt < 3; attempt++) {
        raw = config.provider === 'dictabert-local' ? await require('../../db/premium/pythonClient').nakdan([input], '¤') : await (options.provider || cloud.nakdan)([input]);
        answer = raw.body?.results?.[0];
        if (answer) break;
        if (raw.body?.errors?.length) throw Object.assign(new Error('Provider unavailable: ' + raw.body.errors[0].message), { code: 'NIQQUD_PROVIDER_UNAVAILABLE', status: raw.body.errors[0].status });
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
      }
      if (!answer) throw Object.assign(new Error('Provider failed at fragment ' + (i + 1)), { code: 'NIQQUD_PROVIDER_UNAVAILABLE' });
      response = { input_sha256: hash(input), cache_key: cacheKey, config, provider: config.provider, model_version: raw.body.model_version,
        ...(config.provider === 'dictabert-local' ? { raw_answer: answer } : {}), answer: config.provider === 'dictabert-local' ? normalizeMatres(answer) : answer };
      atomic(file, response); requested++;
    }
    if (response.input_sha256 !== hash(input) || response.cache_key !== cacheKey || response.model_version !== config.adapter) throw new Error('Incompatible cached response');
    let projection;
    try { projection = projectRows(subset, response.answer); }
    catch (error) {
      if (!options.localFallback || response.provider !== 'dicta-cloud') throw error;
      const localConfig = { provider: 'dictabert-local', adapter: LOCAL_MODEL_VERSION, matres: '¤', context: 'connected-source-fragments', builder: BUILDER_VERSION };
      const localKey = hash(JSON.stringify(localConfig) + '\n' + input), localFile = path.join(options.cache, localKey + '.json');
      if (fs.existsSync(localFile)) response = JSON.parse(fs.readFileSync(localFile));
      else {
        if (options.cachedOnly) throw Object.assign(error, { code: 'NIQQUD_CACHE_MISS' });
        const raw = await require('../../db/premium/pythonClient').nakdan([input], '¤'), answer = raw.body?.results?.[0];
        if (!answer) throw Object.assign(new Error('Local fallback unavailable for unsafe cloud alignment'), { code: 'NIQQUD_PROVIDER_UNAVAILABLE' });
        response = { input_sha256: hash(input), cache_key: localKey, config: localConfig, provider: 'dictabert-local',
          model_version: raw.body.model_version, raw_answer: answer, answer: normalizeMatres(answer) };
        atomic(localFile, response); requested++;
      }
      if (response.input_sha256 !== hash(input) || response.cache_key !== localKey || response.model_version !== LOCAL_MODEL_VERSION) throw new Error('Incompatible local fallback');
      projection = projectRows(subset, response.answer); cacheKey = localKey;
    }
    // In a mixed fragment, a complete source row remains authoritative. Its neighbours still supply context.
    if (sourceProjection) {
      subset.forEach((row, j) => {
        const old = sourceProjection.entries[j], quality = auditRows([row]);
        if (!quality.needs_preparation && !old.unresolved_words) projection.entries[j] = old;
      });
    }
    fragments.push({ input_sha256: hash(input), authority: 'machine', provider: response.provider,
      model_version: response.model_version, answer_sha256: hash(response.answer), cache_key: cacheKey });
    results.push(...projection.entries); failures.push(...projection.failures);
    matched += projection.matched; total += projection.total;
    if (!options.quiet) console.log('fragment ' + (i + 1) + '/' + sets.length + ': ' + projection.matched + '/' + projection.total + ' words aligned');
  }
  const providers = Array.from(new Set(fragments.filter(x => x.provider).map(x => x.provider))).sort();
  const models = Array.from(new Set(fragments.filter(x => x.model_version).map(x => x.model_version))).sort();
  const layer = { schema: Layer.SCHEMA, work_id: id, row_count: rows.length,
    source_bundle_sha256: hash(bytes), source_rows_sha256: await Layer.sha256(Layer.sourceBytes(rows)),
    provider: providers.join('+') || 'source', model_version: models.join('+') || 'source-pointing-v1', builder_version: BUILDER_VERSION,
    source_text_key: text.text_key || null,
    review_status: 'machine', context: 'connected-source-fragments',
    fragments,
    coverage: { matched_words: matched, total_words: total, unresolved_words: results.reduce((n, row) => n + row.unresolved_words, 0) }, rows: results };
  Layer.validateLayer(layer);
  const output = JSON.stringify(layer), sha256 = hash(output), name = id + '-' + sha256.slice(0, 32) + '.json';
  fs.writeFileSync(path.join(options.out, name), output);
  const report = { work_id: id, source_bundle_sha256: layer.source_bundle_sha256, source_rows_sha256: layer.source_rows_sha256,
    row_count: rows.length, fragments: sets.length, requested_fragments: requested, ...layer.coverage, failures,
    file: 'learning-niqqud/' + name, sha256, provider: layer.provider, model_version: layer.model_version };
  fs.writeFileSync(path.join(options.out, 'report.json'), JSON.stringify(report, null, 2));
  if (!options.quiet) console.log(JSON.stringify({ ...report, failures: failures.length }));
  return report;
}
if (require.main === module) {
  const arg = key => { const i = process.argv.indexOf('--' + key); return i >= 0 ? process.argv[i + 1] : ''; };
  const options = { source: arg('source'), out: arg('out'), cache: arg('cache') };
  if (Object.values(options).some(x => !x)) { console.error('Usage: --source bundle.json --out directory --cache directory (public source only)'); process.exitCode = 1; }
  else build(options).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { BUILDER_VERSION, alignWords, groups, projectRows, build };
