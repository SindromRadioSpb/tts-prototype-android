// Add the owner's existing context layer to byte-verified published editions.
// No source text, edition identity, learner data or provider calls are changed.
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { loadClient, cleanEntities } = require('./build-modern-release.js');
const Archive = require('../../publication/materialArchive.js');
const W = loadClient();
const task = path.resolve('.tmp/context-ai'), data = path.resolve('public/data/benyehuda');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const enc = v => Buffer.from(JSON.stringify(v));
const put = (rel, value) => { const b = enc(value), p = path.join(task, 'candidate', rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); return { file: rel, sha256: sha(b), bytes: b.length }; };
const fields = ['hebrew_plain', 'hebrew_niqqud', 'russian', 'translit', 'translit_ru'];
const sig = r => JSON.stringify(fields.map(k => cleanEntities(r[k] || '')));
const inventory = read(path.join(task, 'inventory.json'));
const root = read(path.join(data, 'corpus-catalog-v11.json'));
const index = read(path.join(data, root.index_file));
const cards = new Map(index.ready.map(c => [String(c.id), c]));
const report = { schema: 'benyehuda-context-enrichment-v1', works: [], source_layer_rows: 0, mapped: 0, rekeyed: 0, unmatched: [], changed: 0, already_present: 0, preserved_published: [], source_archives: [] };
let archive, texts;
for (const record of inventory) {
  if (archive !== record.archive) {
    archive = record.archive;
    const raw = fs.readFileSync(archive), zip = new AdmZip(raw);
    texts = JSON.parse(zip.readAsText('library/library.json')).texts;
    report.source_archives.push({ name: path.basename(archive), sha256: sha(raw) });
  }
  const src = texts.find(t => t.text_id === record.text_id), card = cards.get(record.work_id);
  const parts = card.toc_file ? read(path.join(data, card.toc_file)).parts : [{ file: card.file, bundle_sha256: card.bundle_sha256, text_key: card.text_key, learning_edition_id: card.learning_edition_id }];
  const sourceRows = new Map(src.rows.map((r, i) => [Number(r.order_index ?? i), r]));
  const entries = new Map();
  for (const entry of src.word_gloss_ai_layer?.rows || []) {
    const row = sourceRows.get(Number(entry.order_index));
    const payload = W.rowPayloadFromData(row);
    if (!payload || payload.key !== entry.key || payload.words.length !== entry.glosses.length) throw Error('Invalid source layer ' + record.work_id + ':' + entry.order_index);
    const key = sig(row); if (!entries.has(key)) entries.set(key, []);
    entries.get(key).push({ entry, row }); report.source_layer_rows++;
  }
  const work = { work_id: record.work_id, source_layer_rows: record.layer_rows, parts: [], mapped: 0, missing_public_rows: 0 };
  for (const part of parts) {
    const bytes = fs.readFileSync(path.join(task, 'baseline', part.file));
    if (sha(bytes) !== part.bundle_sha256) throw Error('Baseline body hash ' + part.file);
    const bundle = JSON.parse(bytes), text = bundle.library.texts[0];
    if (String(text.corpus.byehuda_id) !== record.work_id) throw Error('Source work mismatch');
    const original = structuredClone(bundle), existing = new Map((text.word_gloss_ai_layer?.rows || []).map(e => [e.order_index, e]));
    const merged = new Map(existing); let added = 0;
    for (let i = 0; i < text.rows.length; i++) {
      const row = text.rows[i], matches = entries.get(sig(row));
      if (!matches?.length) { work.missing_public_rows++; continue; }
      const { entry } = matches.shift();
      const order = Number(row.order_index ?? i), p = W.rowPayloadFromData(row);
      if (!p || p.words.length !== entry.glosses.length) throw Error('Client word count mismatch ' + part.file + ':' + i);
      if (p.key !== entry.key) report.rekeyed++;
      const transferred = { ...entry, order_index: order, key: p.key };
      if (existing.has(order)) {
        if (JSON.stringify(existing.get(order)) !== JSON.stringify(transferred)) report.preserved_published.push({work_id: record.work_id, order_index: order});
        report.already_present++;
      } else { merged.set(order, transferred); added++; }
      work.mapped++; report.mapped++;
    }
    const rows = [...merged.values()].sort((a,b) => a.order_index - b.order_index);
    const checked = Archive.wordGlossLayerReport({ schema: 'word-gloss-ai-layer-v1', rows }, text.rows.length);
    if (checked.rejected.length) throw Error('Rejected public layer ' + JSON.stringify(checked.rejected.slice(0,3)));
    if (added) text.word_gloss_ai_layer = { schema: 'word-gloss-ai-layer-v1', rows };
    const without = b => { const x = structuredClone(b); delete x.library.texts[0].word_gloss_ai_layer; return JSON.stringify(x); };
    if (without(bundle) !== without(original)) throw Error('Source changed');
    const hash = sha(enc(bundle)), file = 'works/' + record.work_id + '-' + hash.slice(0,32) + '.json';
    const result = { ...part, old_file: part.file, old_sha256: sha(bytes), added, layer_rows: rows.length };
    if (added) { Object.assign(result, { file, bundle_sha256: hash }); put(file, bundle); report.changed++; }
    if (rows.length) {
      const sidecar = { library: { texts: [{ text_key: text.text_key, corpus: { byehuda_id: record.work_id }, word_gloss_ai_layer: { schema: 'word-gloss-ai-layer-v1', rows } }] } };
      const layerHash = sha(enc(sidecar)), layerFile = 'works/' + record.work_id + '-' + layerHash.slice(0,32) + '.json';
      put(layerFile, sidecar);
      result.word_gloss_ai = { rows: rows.length, file: layerFile, sha256: layerHash };
    }
    work.parts.push(result);
  }
  for (const matches of entries.values()) for (const {entry,row} of matches) report.unmatched.push({ work_id: record.work_id, order_index: entry.order_index, row_id: row.row_id });
  report.works.push(work);
  if (report.works.length % 100 === 0) console.log(JSON.stringify({checked:report.works.length,mapped:report.mapped}));
}
fs.writeFileSync(path.join(task, 'enrichment-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ works: report.works.length, source_layer_rows: report.source_layer_rows, mapped: report.mapped, already_present: report.already_present, changed: report.changed, unmatched: report.unmatched.length }));
