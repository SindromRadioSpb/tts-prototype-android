#!/usr/bin/env node
'use strict';
// Explicit, resumable preparation of public-text pointing; does not upload or write source bundles.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Layer = require('../../public/js/benyehuda-learning-niqqud');
const { fillMatres } = require('../../public/js/subtitle-material-vocalization');
const cloud = require('../../db/premium/providers/dictaCloud');
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
function projectRows(rows, answer) {
  const sourceWords = rows.flatMap(row => Array.from(row.hebrew_plain.matchAll(WORD), x => x[0]));
  const words = Array.from(String(answer).matchAll(WORD), x => x[0]);
  if (words.length !== sourceWords.length) throw new Error('Provider token count changed: ' + sourceWords.length + ' -> ' + words.length);
  let at = 0, matched = 0, total = 0;
  const failures = [];
  const entries = rows.map(row => {
    const oldWords = Array.from(String(row.hebrew_niqqud || '').matchAll(WORD), x => x[0]);
    let inRow = 0;
    const misses = [];
    const learning = row.hebrew_plain.replace(WORD, source => {
      const candidate = words[at++], old = oldWords[inRow++];
      total++;
      const projected = fillMatres(source, candidate);
      if (projected && /[\u05b0-\u05bb\u05c7]|וּ/u.test(projected)) { matched++; return projected; }
      misses.push({ source, answer: candidate });
      return old ? fillMatres(source, old) || source : source;
    });
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
  const sets = groups(rows), results = [], failures = []; let matched = 0, total = 0;
  for (let i = 0; i < sets.length; i++) {
    const subset = sets[i].map(index => rows[index]), input = subset.map(row => row.hebrew_plain).join(' ');
    const file = path.join(options.cache, hash(input) + '.json');
    let response;
    if (fs.existsSync(file)) response = JSON.parse(fs.readFileSync(file));
    else {
      const raw = await cloud.nakdan([input]);
      const answer = raw.body?.results?.[0];
      if (!answer) throw new Error('Provider failed at fragment ' + (i + 1));
      response = { input_sha256: hash(input), provider: 'dicta-cloud', model_version: raw.body.model_version, answer };
      fs.writeFileSync(file, JSON.stringify(response, null, 2));
    }
    if (response.input_sha256 !== hash(input) || response.model_version !== cloud.MODEL_VERSION) throw new Error('Incompatible cached response');
    const projection = projectRows(subset, response.answer);
    results.push(...projection.entries); failures.push(...projection.failures);
    matched += projection.matched; total += projection.total;
    console.log('fragment ' + (i + 1) + '/' + sets.length + ': ' + projection.matched + '/' + projection.total + ' words aligned');
  }
  const layer = { schema: Layer.SCHEMA, work_id: id, row_count: rows.length,
    source_bundle_sha256: hash(bytes), source_rows_sha256: await Layer.sha256(Layer.sourceBytes(rows)),
    provider: 'dicta-cloud', model_version: cloud.MODEL_VERSION, created_at: new Date().toISOString(),
    review_status: 'machine', context: 'connected-source-fragments',
    coverage: { matched_words: matched, total_words: total, unresolved_words: total - matched }, rows: results };
  Layer.validateLayer(layer);
  const output = JSON.stringify(layer), sha256 = hash(output), name = id + '-' + sha256.slice(0, 32) + '.json';
  fs.writeFileSync(path.join(options.out, name), output);
  const report = { work_id: id, source_bundle_sha256: layer.source_bundle_sha256, source_rows_sha256: layer.source_rows_sha256,
    row_count: rows.length, fragments: sets.length, ...layer.coverage, failures,
    file: 'learning-niqqud/' + name, sha256, provider: layer.provider, model_version: layer.model_version };
  fs.writeFileSync(path.join(options.out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, failures: failures.length }));
  return report;
}
if (require.main === module) {
  const arg = key => { const i = process.argv.indexOf('--' + key); return i >= 0 ? process.argv[i + 1] : ''; };
  const options = { source: arg('source'), out: arg('out'), cache: arg('cache') };
  if (Object.values(options).some(x => !x)) { console.error('Usage: --source bundle.json --out directory --cache directory (public source only)'); process.exitCode = 1; }
  else build(options).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { groups, projectRows, build };
