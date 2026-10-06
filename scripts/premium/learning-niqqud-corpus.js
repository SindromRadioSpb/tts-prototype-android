#!/usr/bin/env node
'use strict';
// Public corpus only. Immutable input snapshots and a resumable ledger; never writes source bodies.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Layer = require('../../public/js/benyehuda-learning-niqqud');
const Plausibility = require('../../public/js/niqqud-plausibility');
const WORD = /[א-ת][א-ת\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]*/gu;
const VOWEL = /[\u05b0-\u05bb\u05c7]|וּ/u;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function auditRows(rows) {
  let words = 0, vocalized = 0, holamOnly = 0, letters = 0, vowelMarks = 0;
  const faults = [];
  rows.forEach((row, i) => {
    const plain = row.hebrew_plain ?? row.he_plain ?? '', pointed = row.hebrew_niqqud ?? row.he_niqqud ?? '';
    if (pointed && Layer.canonical(pointed) !== Layer.canonical(plain)) faults.push({ row: i, reason: 'SOURCE_LETTERS_DIFFER' });
    for (const match of String(pointed || plain).matchAll(WORD)) {
      const word = match[0], bare = Layer.canonical(word);
      if (bare.length < 2) continue; // chapter letters and isolated abbreviation fragments
      words++; letters += bare.length;
      if (VOWEL.test(word)) vocalized++;
      vowelMarks += (word.match(/[\u05b0-\u05bb\u05c7]/gu) || []).length;
      if (/ֹ/u.test(word) && !/[\u05b0-\u05b8\u05bb\u05c7]|וּ/u.test(word) && bare.length > 2) holamOnly++;
      const reasons = Plausibility.wordFaults(word);
      if (reasons.length) faults.push({ row: i, word, reasons });
    }
  });
  const vocalizedRatio = words ? vocalized / words : 1, density = letters ? vowelMarks / letters : 0;
  // Coverage is a triage signal, never an accuracy score. Sparse holams cannot pass as full niqqud.
  const needsPreparation = words > 0 && (vocalizedRatio < .97 || density < .28 || holamOnly / words > .08);
  return { words, vocalized_words: vocalized, unpointed_words: words - vocalized, holam_only_words: holamOnly,
    vowel_density: density, vocalized_ratio: vocalizedRatio, needs_preparation: needsPreparation, faults };
}
function validateSource(bytes, card) {
  const bundle = JSON.parse(bytes), text = bundle.library?.texts?.[0];
  if (bundle.library?.texts?.length !== 1 || Layer.workId(text) !== String(card.id) || !Array.isArray(text.rows) || !text.rows.length) throw new Error('Source identity mismatch');
  const pin = /-(\w{32})\.json$/.exec(card.file)?.[1];
  if (pin && hash(bytes).slice(0, 32) !== pin) throw new Error('Source immutable hash mismatch');
  text.rows.forEach((row, i) => { if (row.order_index !== i || typeof row.hebrew_plain !== 'string') throw new Error('Source row order mismatch'); });
  return text;
}
function atomic(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2)); fs.renameSync(file + '.tmp', file); }
async function inventory(options) {
  const indexBytes = fs.readFileSync(options.index), index = JSON.parse(indexBytes);
  if (!Array.isArray(index.ready) || !index.ready.length) throw new Error('Expected ready corpus index');
  const base = new URL(options.base || 'https://linguistpro.kolosei.com');
  fs.mkdirSync(path.join(options.out, 'sources'), { recursive: true });
  const entries = [], errors = []; let cursor = 0, bytesTotal = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < index.ready.length) {
      const card = index.ready[cursor++];
      if (!/^works\/\d{1,8}(?:-[a-f0-9]{32})?\.json$/.test(card.file || '')) { errors.push({ id: card.id, error: 'Unsafe source path' }); continue; }
      const source = path.join(options.out, 'sources', path.basename(card.file));
      try {
        let bytes;
        if (fs.existsSync(source)) bytes = fs.readFileSync(source);
        else if (options.sourceDir && fs.existsSync(path.join(options.sourceDir, path.basename(card.file)))) {
          bytes = fs.readFileSync(path.join(options.sourceDir, path.basename(card.file)));
          validateSource(bytes, card); fs.writeFileSync(source, bytes);
        }
        else {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const response = await fetch(new URL('/data/benyehuda/' + card.file, base), { signal: AbortSignal.timeout(30000) });
              if (!response.ok) throw new Error('Source HTTP ' + response.status);
              bytes = Buffer.from(await response.arrayBuffer()); validateSource(bytes, card); break;
            } catch (error) { if (attempt === 2) throw error; await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))); }
          }
          fs.writeFileSync(source + '.tmp', bytes); fs.renameSync(source + '.tmp', source);
        }
        const text = validateSource(bytes, card); bytesTotal += bytes.length;
        entries.push({ id: String(card.id), file: card.file, source: path.relative(options.out, source).replace(/\\/g, '/'),
          sha256: hash(bytes), bytes: bytes.length, rows: text.rows.length, era: card.era, genre: card.genre,
          learning_edition_id: card.learning_edition_id || null, ...auditRows(text.rows) });
      } catch (error) { errors.push({ id: String(card.id), error: error.message }); }
      if ((entries.length + errors.length) % 50 === 0) console.log('inventory ' + (entries.length + errors.length) + '/' + index.ready.length);
    }
  }));
  entries.sort((a, b) => Number(a.id) - Number(b.id));
  const result = { schema: 1, catalog_version: index.version, catalog_sha256: hash(indexBytes), expected: index.ready.length,
    works: entries.length, source_bytes: bytesTotal, needs_preparation: entries.filter(x => x.needs_preparation).length,
    rows: entries.reduce((n, x) => n + x.rows, 0), words: entries.reduce((n, x) => n + x.words, 0), errors, entries };
  atomic(path.join(options.out, 'inventory.json'), result);
  console.log(JSON.stringify({ ...result, entries: undefined }));
  if (errors.length) throw new Error(errors.length + ' sources unavailable; inventory is incomplete');
  return result;
}
async function prepareCorpus(options) {
  const inventoryFile = path.join(options.out, 'inventory.json'), data = JSON.parse(fs.readFileSync(inventoryFile));
  if (data.errors.length || data.works !== data.expected) throw new Error('Complete inventory required');
  const Builder = require('./build-learning-niqqud');
  const ledgerFile = path.join(options.out, 'preparation-ledger.json');
  let ledger = fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile)) : { schema: 1, works: {} };
  ledger.builder_version = Builder.BUILDER_VERSION; ledger.catalog_sha256 = data.catalog_sha256;
  let cursor = 0, providerUnavailable = false;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (cursor < data.entries.length) {
      const entry = data.entries[cursor++], source = path.join(options.out, entry.source), output = path.join(options.out, 'output', entry.id);
      const old = ledger.works[entry.id];
      if (old?.status === 'prepared' && old.source_sha256 === entry.sha256 && old.builder_version === Builder.BUILDER_VERSION) {
        const file = path.join(output, path.basename(old.report.file));
        if (fs.existsSync(file) && hash(fs.readFileSync(file)) === old.report.sha256) continue;
      }
      if (providerUnavailable) break;
      try {
        if (hash(fs.readFileSync(source)) !== entry.sha256) throw new Error('Source snapshot changed');
        const report = await Builder.build({ source, out: output, cache: options.cache || path.join(options.out, 'provider-cache'), quiet: true, cachedOnly: options.cachedOnly, localFallback: options.localFallback, cloudFirst: options.cloudFirst });
        ledger.works[entry.id] = { status: 'prepared', source_sha256: entry.sha256, builder_version: Builder.BUILDER_VERSION, report };
        console.log('prepared ' + entry.id + ': ' + report.row_count + ' rows, ' + report.unresolved_words + ' unresolved, ' + report.requested_fragments + ' requests');
      } catch (error) {
        ledger.works[entry.id] = { status: error.code === 'NIQQUD_CACHE_MISS' ? 'pending' : 'failed', source_sha256: entry.sha256, builder_version: Builder.BUILDER_VERSION, error: error.message, code: error.code || null };
        if (error.code === 'NIQQUD_PROVIDER_UNAVAILABLE') providerUnavailable = true;
        console.error('failed ' + entry.id + ': ' + error.message);
      }
      atomic(ledgerFile, ledger);
    }
  }));
  const states = Object.values(ledger.works), failed = states.filter(x => x.status === 'failed');
  console.log(JSON.stringify({ expected: data.expected, prepared: states.filter(x => x.status === 'prepared').length, failed: failed.length }));
  if (failed.length || states.some(x => x.status === 'pending') || states.length !== data.expected) throw new Error('Corpus preparation incomplete; see preparation-ledger.json');
  return ledger;
}
async function finalizeWork(out, entry, report) {
  const { transliterateWithProfile, TRANSLIT_PROFILE_VERSIONS } = require('../../db/premium/translit');
  const Display = require('../../public/js/translit-display');
    const file = path.join(out, 'output', entry.id, path.basename(report.file));
    const bytes = fs.readFileSync(file);
    if (hash(bytes) !== report.sha256 || report.source_bundle_sha256 !== entry.sha256) throw new Error('Prepared layer/source changed: ' + entry.id);
    const layer = Layer.validateLayer(JSON.parse(bytes));
    for (const fragment of layer.fragments || []) {
      if (fragment.authority === 'machine' && !fragment.provider) {
        fragment.provider = layer.provider; fragment.model_version = layer.model_version;
      }
    }
    const machineFragments = (layer.fragments || []).filter(fragment => fragment.authority === 'machine');
    if (!machineFragments.length) { layer.provider = 'source'; layer.model_version = 'source-pointing-v1'; }
    layer.translit_compiler = 'three-profiles-v1'; layer.translit_profile_versions = TRANSLIT_PROFILE_VERSIONS;
    for (const row of layer.rows) if (!/[א-ת]/u.test(row.he_plain) && !row.source_niqqud) row.learning_niqqud = '';
    // A resumed compilation may reuse only a byte-verified asset with identical
    // input layer, source, compiler and profile versions. Raw answers stay untouched.
    const targetDir = path.join(out,'release','learning-niqqud'), expectedBase = JSON.stringify(layer);
    let compiledRows;
    for (const name of fs.readdirSync(targetDir)) {
      if (!name.startsWith(entry.id+'-') || !/^[0-9]+-[a-f0-9]{32}\.json$/.test(name)) continue;
      try {
        const candidateBytes = fs.readFileSync(path.join(targetDir,name));
        if (name !== entry.id+'-'+hash(candidateBytes).slice(0,32)+'.json') continue;
        const candidate = Layer.validateLayer(JSON.parse(candidateBytes));
        const originalRows = candidate.rows;
        candidate.rows = originalRows.map(row => {const copy={...row}; delete copy.translit_profiles; delete copy.review_signals; return copy;});
        if (JSON.stringify(candidate) !== expectedBase || originalRows.some(row => Display.PROFILES.some(profile => typeof row.translit_profiles?.[profile] !== 'string'))) continue;
        compiledRows = originalRows; break;
      } catch (_) { /* corrupt/stale compilation is recomputed from verified input */ }
    }
    let unresolved = 0; const suspect = [];
    for (const row of layer.rows) {
      if (!/[א-ת]/u.test(row.he_plain) && !row.source_niqqud) row.learning_niqqud = '';
      row.translit_profiles = compiledRows ? compiledRows[row.order_index].translit_profiles : Object.fromEntries(Display.PROFILES.map(profile => [profile, transliterateWithProfile(row.learning_niqqud, profile)]));
      for (const [profile, value] of Object.entries(row.translit_profiles)) {
        if (typeof value !== 'string' || (/[א-ת]/u.test(row.learning_niqqud) && !value.trim() && !(profile === 'ru-phonetic' && /^[אע]$/u.test(row.learning_niqqud.trim()))) || /[א-ת]/u.test(value)) throw new Error('Invalid transliteration: ' + entry.id + ':' + row.order_index + ':' + profile);
      }
      unresolved += row.unresolved_words || 0;
      const faults = Plausibility.scan(row.learning_niqqud);
      if (faults.length) row.review_signals = faults.length;
      if (faults.length) suspect.push({ order_index: row.order_index, words: faults });
    }
    const sourceBytes = fs.readFileSync(path.join(out, entry.source));
    if (hash(sourceBytes) !== entry.sha256) throw new Error('Source snapshot changed: ' + entry.id);
    const text = JSON.parse(sourceBytes).library.texts[0];
    if (await Layer.sha256(Layer.sourceBytes(text.rows)) !== layer.source_rows_sha256 || layer.source_bundle_sha256 !== entry.sha256) throw new Error('Layer source fingerprint changed: ' + entry.id);
    const applied = await Layer.apply(text, text.rows, layer);
    const output = JSON.stringify(layer), sha256 = hash(output), name = entry.id + '-' + sha256.slice(0, 32) + '.json';
    fs.writeFileSync(path.join(out, 'release', 'learning-niqqud', name), output);
    return { pin: { file: 'learning-niqqud/' + name, sha256 },
      file: { id: entry.id, file: name, sha256, bytes: Buffer.byteLength(output), source_sha256: entry.sha256, source_file: entry.file },
      quality: { id: entry.id, rows: layer.row_count, applied_rows: applied.applied, unresolved_words: unresolved,
        total_words: layer.coverage.total_words, unresolved_rows: layer.rows.filter(row => row.unresolved_words).length,
        generated_fragments: machineFragments.length, providers: [...new Set(machineFragments.map(fragment => fragment.provider))], suspects: suspect } };
}
async function finalizeCorpus(options) {
  const data = JSON.parse(fs.readFileSync(path.join(options.out, 'inventory.json')));
  const ledger = JSON.parse(fs.readFileSync(path.join(options.out, 'preparation-ledger.json')));
  if (data.errors.length || data.expected !== data.works || ledger.catalog_sha256 !== data.catalog_sha256
    || data.entries.some(entry => ledger.works[entry.id]?.status !== 'prepared')) throw new Error('Every source must be successfully prepared before publication');
  const { transliterateWithProfile, TRANSLIT_PROFILE_VERSIONS } = require('../../db/premium/translit');
  const Display = require('../../public/js/translit-display');
  const manifest = { schema: 1, revision: Number(options.revision), catalog_version: data.catalog_version,
    catalog_sha256: data.catalog_sha256, works: {} }, files = [], quality = [];
  if (!Number.isInteger(manifest.revision) || manifest.revision < 1) throw new Error('Positive manifest revision required');
  const target = path.join(options.out, 'release', 'learning-niqqud'); fs.mkdirSync(target, { recursive: true });
  const results = new Map(); let complete = 0;
  const finish = (entry,result) => { results.set(entry.id,result); if (++complete % 50 === 0) console.log('finalized ' + complete + '/' + data.expected); };
  const count = Math.min(4, Math.max(1, Number(options.workers) || 3), data.entries.length);
  if (count === 1) {
    for (const entry of data.entries) finish(entry,await finalizeWork(options.out,entry,ledger.works[entry.id].report));
  } else {
    const { Worker } = require('node:worker_threads'); let cursor = 0; const workers = [];
    try {
      await Promise.all(Array.from({length:count}, () => new Promise((resolve,reject) => {
        const worker = new Worker(__filename,{workerData:{mode:'finalize',out:options.out},resourceLimits:{maxOldGenerationSizeMb:768}}); workers.push(worker);
        let assigned;
        function next() {
          if (cursor === data.entries.length) return resolve();
          assigned = data.entries[cursor++]; worker.postMessage({entry:assigned,report:ledger.works[assigned.id].report});
        }
        worker.on('error',reject); worker.on('exit',code => { if (code) reject(Error('Compiler worker exited: '+code)); });
        worker.on('message',message => { if (message.error) return reject(Error(message.error)); finish(assigned,message.result); next(); }); next();
      })));
    } finally { await Promise.all(workers.map(worker=>worker.terminate())); }
  }
  // Finish the manifest in catalog order, independent of worker completion order.
  for (const entry of data.entries) {
    const result = results.get(entry.id); manifest.works[entry.id] = result.pin;
    files.push(result.file); quality.push(result.quality);
  }
  const summary = { expected: data.expected, finalized: files.length, source_bytes: data.source_bytes,
    layer_bytes: files.reduce((n, f) => n + f.bytes, 0), changed_rows: quality.reduce((n, q) => n + q.applied_rows, 0),
    unresolved_words: quality.reduce((n, q) => n + q.unresolved_words, 0),
    total_words: quality.reduce((n, q) => n + q.total_words, 0),
    unresolved_rows: quality.reduce((n,q) => n + q.unresolved_rows, 0),
    generated_fragments: quality.reduce((n,q) => n + q.generated_fragments, 0),
    suspect_rows: quality.reduce((n, q) => n + q.suspects.length, 0), translit_profile_versions: TRANSLIT_PROFILE_VERSIONS };
  atomic(path.join(options.out, 'release', 'manifest.json'), manifest);
  atomic(path.join(options.out, 'release', 'files.json'), { summary, files });
  atomic(path.join(options.out, 'release', 'quality.json'), { summary, works: quality });
  if (options.manifest) fs.writeFileSync(options.manifest,
    '// Precomputed immutable study assets. No provider calls when opening a work.\n' +
    'globalThis.BenYehudaLearningNiqqudManifest = ' + JSON.stringify(manifest) + ';\n');
  console.log(JSON.stringify(summary)); return { manifest, summary };
}
function assertPublication(manifest, indexBytes) {
  const index = JSON.parse(indexBytes);
  if (manifest?.schema !== 1 || manifest.revision < 2 || manifest.catalog_version !== index.version
    || manifest.catalog_sha256 !== hash(indexBytes) || !Array.isArray(index.ready)) throw new Error('Study manifest does not match the prepared catalog');
  for (const card of index.ready) {
    const pin = manifest.works?.[String(card.id)];
    if (!/^\d{1,8}$/.test(String(card.id)) || !pin || !new RegExp('^learning-niqqud/' + String(card.id) + '-[a-f0-9]{32}\\.json$').test(pin.file || '') || !/^[a-f0-9]{64}$/.test(pin.sha256 || '') || !pin.file.endsWith('-' + pin.sha256.slice(0,32) + '.json')) throw new Error('Study layer missing for ready work ' + card.id);
  }
  return index.ready.length;
}
module.exports = { auditRows, validateSource, inventory, prepareCorpus, finalizeCorpus, finalizeWork, assertPublication, atomic, hash };
const {isMainThread,workerData,parentPort} = require('node:worker_threads');
if (!isMainThread && workerData?.mode === 'finalize') {
  parentPort.on('message', async ({entry,report}) => {
    try { parentPort.postMessage({result:await finalizeWork(workerData.out,entry,report)}); }
    catch(error) { parentPort.postMessage({error:error.message}); }
  });
} else if (require.main === module) {
  const arg = key => { const i = process.argv.indexOf('--' + key); return i >= 0 ? process.argv[i + 1] : ''; };
  const options = { index: arg('index'), out: arg('out'), base: arg('base'), revision: arg('revision'), manifest: arg('manifest'), cache: arg('cache'), workers:arg('workers'), sourceDir: arg('source-dir'), cachedOnly: process.argv.includes('--cached-only'), localFallback: process.argv.includes('--local-fallback'), cloudFirst: process.argv.includes('--cloud-first') };
  const operation = process.argv.includes('--build') ? prepareCorpus : process.argv.includes('--finalize') ? finalizeCorpus : inventory;
  if (!options.out || (operation === inventory && !options.index)) { console.error('Usage: --out durable-directory [--index corpus-index.json | --build | --finalize --revision N --manifest file]'); process.exitCode = 1; }
  else operation(options).catch(error => { console.error(error.message); process.exitCode = 1; });
}
