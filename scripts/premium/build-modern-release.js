#!/usr/bin/env node
'use strict';
// Modern release F2: builds public per-part learning bodies from the owner's archives, guided by the
// F0 registry and the owner's decisions. Read-only for the archives; writes only into --out.
//
// Transfer contract (docs/planning/modern-release/2026-10-22/README.md §6):
//  • rows and text fields pass through an explicit allowlist; every dropped field is reported;
//  • the AI word layer («в контексте (ИИ)», text-level word_gloss_ai_layer) travels with its text and is
//    re-proved per row with the LIVE client code (reader-morph.js + word-gloss-ai.js), so a key that the
//    browser would reject can never be shipped as "transferred";
//  • owner decisions move service rows (byline, editorial note) into «О материале»;
//  • HTML entities (&nbsp; …) are cleaned; a row whose AI key changes is re-keyed only when its word
//    count is unchanged, otherwise its layer row is reported as dropped.
// Usage: node build-modern-release.js --registry R --decisions D --library-root L --out O [--works id,id]

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const AdmZip = require('adm-zip');
const Archive = require(path.join(REPO, 'publication', 'materialArchive.js'));

const ROW_FIELDS = ['row_id', 'order_index', 'hebrew_plain', 'hebrew_niqqud', 'russian', 'translit', 'translit_ru',
  'translation_provider', 'niqqud_authority'];
const META_FIELDS = ['stanza_index', 'source_line_index', 'source_block_index', 'source_sentence_index', 'source_sentence_id',
  'segmentation', 'content_form', 'original_language', 'language', 'foreign_script', 'footnote_marker', 'entry_date', 'unit_type',
  'source_note_number', 'source_note_numbers', 'source_note_url', 'source_note_authorship', 'linked_sentence_ids',
  'source_char_start', 'source_char_end_exclusive', 'source_author_he', 'niqqud_origin', 'human_review', 'whole_entry_complete',
  'source_pointing_preserved'];
const TRANSLATION_META = ['model', 'review_status', 'human_philological_review', 'source_url', 'niqqud_origin', 'transliteration_profile'];
const DERIVED_FIELDS = ['value', 'authority', 'provider', 'source_hash', 'generated_at', 'model_version'];
const ENTITY = /&(nbsp|amp|lt|gt|quot|#\d+);/g;
const ENTITY_TEXT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"' };
const MAX_BODY_BYTES = 10 * 1024 * 1024; // server.js /api/benyehuda/works/upload WORK_TOO_LARGE

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const enc = (v) => Buffer.from(JSON.stringify(v), 'utf8');
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o && o[k] !== undefined) r[k] = o[k]; return r; };
const dropped = (o, keys) => Object.keys(o || {}).filter((k) => !keys.includes(k));

function loadClient() {
  const noop = () => {};
  const el = () => ({ addEventListener: noop, setAttribute: noop, appendChild: noop, querySelector: () => null, querySelectorAll: () => [], classList: { add: noop, remove: noop }, style: {} });
  const win = { addEventListener: noop, removeEventListener: noop, console, setTimeout, clearTimeout, crypto: globalThis.crypto,
    document: { addEventListener: noop, createElement: el, querySelector: () => null, querySelectorAll: () => [], body: el(), documentElement: el(), readyState: 'complete' },
    localStorage: { getItem: () => null, setItem: noop }, navigator: { language: 'ru' }, location: { search: '', hash: '' } };
  win.window = win; win.self = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  for (const f of ['public/js/reader-morph.js', 'public/js/word-gloss-ai.js']) vm.runInContext(fs.readFileSync(path.join(REPO, f), 'utf8'), ctx, { filename: f });
  if (!win.WordGlossAI || !win.WordGlossAI.rowPayloadFromData) throw new Error('client word-gloss module did not load');
  return win.WordGlossAI;
}

function cleanEntities(s) {
  if (typeof s !== 'string' || !ENTITY.test(s)) { ENTITY.lastIndex = 0; return s; }
  ENTITY.lastIndex = 0;
  return s.replace(ENTITY, (m, name) => (name[0] === '#' ? String.fromCodePoint(Number(name.slice(1))) : ENTITY_TEXT[name]))
    .replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim();
}

function publicDerived(value) {
  const out = pick(value, DERIVED_FIELDS);
  let prov = value.provenance;
  if (typeof prov === 'string') { try { prov = JSON.parse(prov); } catch (_) { prov = null; } }
  if (prov && typeof prov === 'object') {
    const safe = pick(prov, ['source_original', 'review']);
    if (Array.isArray(prov.changes)) safe.changes = prov.changes.filter((c) => c && typeof c === 'object')
      .map((c) => pick(c, ['kind', 'original', 'learning_form', 'added_codepoint', 'location', 'reason', 'source_modified']));
    out.provenance = JSON.stringify(safe);
  }
  return out;
}

function publicRow(row, report) {
  const out = pick(row, ROW_FIELDS);
  for (const k of dropped(row, [...ROW_FIELDS, 'meta', 'translation_meta'])) report.droppedRowFields[k] = (report.droppedRowFields[k] || 0) + 1;
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const m = pick(meta, META_FIELDS);
  for (const k of dropped(meta, [...META_FIELDS, 'niqqud_derived'])) report.droppedMetaFields[k] = (report.droppedMetaFields[k] || 0) + 1;
  if (meta.niqqud_derived && typeof meta.niqqud_derived === 'object') m.niqqud_derived = publicDerived(meta.niqqud_derived);
  if (Object.keys(m).length) out.meta = m;
  const tm = pick(row.translation_meta || {}, TRANSLATION_META);
  if (Object.keys(tm).length) out.translation_meta = tm;
  return out;
}

function cleanRow(row) {
  let changed = false;
  for (const k of ['hebrew_plain', 'hebrew_niqqud', 'russian', 'translit', 'translit_ru']) {
    const v = cleanEntities(row[k]);
    if (v !== row[k]) { row[k] = v; changed = true; }
  }
  const d = row.meta && row.meta.niqqud_derived;
  if (d && typeof d.value === 'string') { const v = cleanEntities(d.value); if (v !== d.value) { d.value = v; changed = true; } }
  return changed;
}

function buildPart(W, text, part, decisionsRows, about) {
  const report = { part_uid: part.part_uid, archive: part.archive, text_id_in: text.text_id, rows_in: (text.rows || []).length,
    moved_to_about: [], cleaned_rows: 0, rekeyed_layer_rows: 0, droppedRowFields: {}, droppedMetaFields: {},
    layer_in: 0, layer_out: 0, layer_dropped: [], client_rejected: 0, client_stored: 0 };
  const moveIdx = new Map(decisionsRows.map((m) => [m.order_index, m]));
  const srcRows = text.rows || [];
  const layerIn = text.word_gloss_ai_layer && Array.isArray(text.word_gloss_ai_layer.rows) ? text.word_gloss_ai_layer.rows : [];
  report.layer_in = layerIn.length;
  const layerByOrder = new Map(layerIn.map((r) => [r.order_index, r]));
  const rows = []; const layerRows = [];
  srcRows.forEach((row, i) => {
    const order = Number.isFinite(Number(row.order_index)) ? Number(row.order_index) : i;
    if (moveIdx.has(order)) {
      const m = moveIdx.get(order);
      about.push({ kind: m.about_kind, text: cleanEntities(String(row.hebrew_plain || '')) });
      report.moved_to_about.push({ order_index: order, kind: m.about_kind, had_layer: layerByOrder.has(order) });
      return;
    }
    const before = W.rowPayloadFromData(row);
    const pub = publicRow(row, report);
    const cleaned = cleanRow(pub);
    if (cleaned) report.cleaned_rows++;
    pub.order_index = rows.length; // contiguous after moves; the layer follows the same renumbering
    rows.push(pub);
    const lr = layerByOrder.get(order);
    if (!lr) return;
    const after = W.rowPayloadFromData(pub);
    const entry = { ...lr, order_index: pub.order_index };
    if (before && after && lr.key === before.key && after.key !== before.key) {
      if (after.words.length === before.words.length) { entry.key = after.key; report.rekeyed_layer_rows++; }
      else { report.layer_dropped.push({ order_index: order, reason: 'WORD_COUNT_CHANGED_BY_CLEANING' }); return; }
    }
    layerRows.push(entry);
  });
  // Same structural rule as the Mediatheque route (materialArchive.wordGlossLayerReport), by construction.
  const checked = Archive.wordGlossLayerReport(layerRows.length ? { schema: 'word-gloss-ai-layer-v1', rows: layerRows } : null, rows.length);
  for (const r of checked.rejected) report.layer_dropped.push(r);
  const layer = checked.layer;
  report.layer_out = layer ? layer.rows.length : 0;
  // Client re-proof: exactly what WordGlossAI.remember() accepts on a clean device.
  if (layer) {
    for (const e of layer.rows) {
      const p = W.rowPayloadFromData(rows[e.order_index]);
      if (p && p.key === e.key && e.glosses.length === p.words.length) report.client_stored++; else report.client_rejected++;
    }
  }
  report.rows_out = rows.length;
  return { rows, layer, report };
}

// A part heavier than the target is cut at row boundaries into fragments, each its own body and
// table-of-contents entry. Layer keys depend only on row content, so they survive the cut; each
// fragment is re-proved with the client code on its own renumbered rows.
const SPLIT_TARGET_BYTES = 4 * 1024 * 1024;
function splitBuilt(W, built, target) {
  const layerByOrder = new Map((built.layer ? built.layer.rows : []).map((r) => [r.order_index, r]));
  const weight = (r) => Buffer.byteLength(JSON.stringify(r)) + (layerByOrder.has(r.order_index) ? Buffer.byteLength(JSON.stringify(layerByOrder.get(r.order_index))) : 0);
  const total = built.rows.reduce((s, r) => s + weight(r), 0);
  const count = Math.max(1, Math.ceil(total / target));
  const goal = total / count;
  const groups = [[]]; let acc = 0;
  for (const r of built.rows) {
    const w = weight(r);
    if (groups[groups.length - 1].length && acc + w > goal && groups.length < count) { groups.push([]); acc = 0; }
    groups[groups.length - 1].push(r); acc += w;
  }
  return groups.map((rows) => {
    const layerRows = [];
    const renumbered = rows.map((r, i) => {
      const lr = layerByOrder.get(r.order_index);
      if (lr) layerRows.push({ ...lr, order_index: i });
      return { ...r, order_index: i };
    });
    let stored = 0, rejected = 0;
    for (const e of layerRows) {
      const p = W.rowPayloadFromData(renumbered[e.order_index]);
      if (p && p.key === e.key && e.glosses.length === p.words.length) stored++; else rejected++;
    }
    return { rows: renumbered, layer: layerRows.length ? { schema: 'word-gloss-ai-layer-v1', rows: layerRows } : null, client_stored: stored, client_rejected: rejected };
  });
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? acc.concat([[a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]]) : acc), []));
  for (const k of ['registry', 'decisions', 'library-root', 'out']) if (!args[k]) throw new Error('missing --' + k);
  const registry = JSON.parse(fs.readFileSync(args.registry, 'utf8'));
  const decisions = JSON.parse(fs.readFileSync(args.decisions, 'utf8'));
  const only = args.works && args.works !== true ? new Set(String(args.works).split(',')) : null;
  const W = loadClient();
  const out = path.resolve(args.out);
  fs.mkdirSync(path.join(out, 'works'), { recursive: true });
  const partsByWork = new Map();
  for (const p of registry.parts) { if (!partsByWork.has(p.work_id)) partsByWork.set(p.work_id, []); partsByWork.get(p.work_id).push(p); }
  const zips = new Map();
  const library = (rel) => { if (!zips.has(rel)) { const z = new AdmZip(path.join(args['library-root'], rel)); const e = z.getEntries().find((x) => x.entryName.endsWith('library.json')); zips.set(rel, JSON.parse(e.getData().toString('utf8'))); } return zips.get(rel); };

  const works = []; const reports = [];
  for (const w of registry.works) {
    if (w.action === 'published' || w.blocked || w.shelf !== 'modern') continue;
    if (only && !only.has(w.work_id)) continue;
    const decided = decisions.works && decisions.works[w.work_id];
    const parts = (partsByWork.get(w.work_id) || []).filter((p) => p.status !== 'published').sort((a, b) => a.reading_order - b.reading_order);
    const about = [];
    const outParts = [];
    for (const part of parts) {
      const text = library(part.archive).texts.find((t) => t.text_id === part.text_id && (t.rows || []).length === part.rows);
      if (!text) throw new Error('part not found in its archive: ' + part.part_uid);
      const moves = part.rows_to_about || [];
      const built = buildPart(W, text, part, moves, about);
      const chunks = splitBuilt(W, built, SPLIT_TARGET_BYTES);
      const sm = text.source_meta || {}; const learning = sm.text_learning || {};
      const corpusSrc = text.corpus || sm.corpus || {};
      chunks.forEach((chunk, k) => {
        const title = chunks.length > 1 ? `${text.title} · ${k + 1}/${chunks.length}` : text.title;
        const passport = { work_id: w.work_id, part_id: (part.passport.section_id || part.text_id) + (chunks.length > 1 ? '#' + (k + 1) : ''),
          source_part_id: part.passport.section_id || part.text_id, fragment: chunks.length > 1 ? { index: k + 1, of: chunks.length } : null,
          track: part.passport.track, title, source_sha256: w.source.sha256, source_origin: w.source.origin,
          source_char_start: k === 0 && part.anchor ? part.anchor.char_start : null,
          source_char_end: k === chunks.length - 1 && part.anchor ? part.anchor.char_end : null };
        const publicLearning = { schema: 'benyehuda-public-learning-v1', work_id: w.work_id, source_version: learning.source_version || (w.source.origin === 'dump' ? 'public_domain_dump' : 'official_full_download'),
          source_sha256: learning.source_sha256 || null, raw_source_sha256: learning.raw_source_sha256 || null, revision_date: text.updated_at || null,
          main_rows: chunk.rows.length, complete_learning_edition: true, review: 'machine; no human philological certification', human_philological_review: false,
          source_reported_rights: corpusSrc.provenance ? corpusSrc.provenance.license || null : null,
          rights_scope: 'Source-reported rights; no independent legal clearance', official_period: learning.official_period || null,
          scope: w.scope, source_coverage: w.source.coverage, provenance: w.provenance || 'ben-yehuda-source-verified',
          word_gloss_ai: chunk.layer ? { rows: chunk.layer.rows.length, of_rows: chunk.rows.length } : null, part: passport };
        if (decided && decided.provenance_confirmed_by_owner) publicLearning.owner_note = 'provenance confirmed by owner';
        const corpus = JSON.parse(JSON.stringify(corpusSrc));
        const normalized = { text_id: 'by-' + w.work_id, title, level: null, tags: text.tags || [], source_label: 'Project Ben-Yehuda', topic: null,
          source_text: '', source_meta: { origin: 'benyehuda-ingest', corpus, public_learning: publicLearning }, corpus, table_model_meta: null,
          text_audio_asset_key: null, created_at: text.created_at || null, updated_at: text.updated_at || null, is_archived: false, rows: chunk.rows };
        if (chunk.layer) normalized.word_gloss_ai_layer = chunk.layer;
        const edition = sha(enc(normalized));
        normalized.text_key = sha(Buffer.from('benyehuda-learning:' + w.work_id + ':' + edition));
        normalized.text_id = 'by-' + w.work_id + '-learning-' + edition.slice(0, 16);
        publicLearning.edition_id = edition;
        const bundle = { library: { schema_version: 1, corpus_meta_version: 1, texts: [normalized], shelves: [], audio_assets: [] } };
        const bytes = enc(bundle); const bodySha = sha(bytes);
        const file = 'works/' + w.work_id + '-' + bodySha.slice(0, 32) + '.json';
        if (bytes.length > MAX_BODY_BYTES) built.report.too_large = Math.max(built.report.too_large || 0, bytes.length);
        fs.writeFileSync(path.join(out, file), bytes);
        outParts.push({ part_id: passport.part_id, source_part_id: passport.source_part_id, fragment: passport.fragment, track: passport.track, title,
          rows: chunk.rows.length, file, body_sha256: bodySha, body_bytes: bytes.length, text_key: normalized.text_key, edition_id: edition,
          word_gloss_ai_rows: chunk.layer ? chunk.layer.rows.length : 0 });
      });
      built.report.fragments = chunks.length;
      built.report.client_stored = chunks.reduce((s, c) => s + c.client_stored, 0);
      built.report.client_rejected = chunks.reduce((s, c) => s + c.client_rejected, 0);
      reports.push({ work_id: w.work_id, ...built.report, files: outParts.slice(-chunks.length).map((p) => p.file), body_bytes: Math.max(...outParts.slice(-chunks.length).map((p) => p.body_bytes)) });
    }
    outParts.forEach((p, i) => { p.reading_order = i + 1; });
    // «О материале» carries what left the learning rows; the byline once per work.
    const aboutUnique = about.filter((a, i) => about.findIndex((b) => b.kind === a.kind && b.text === a.text) === i);
    works.push({ work_id: w.work_id, title: w.title, author: w.author, action: w.action, scope: w.scope, source_coverage: w.source.coverage,
      parts: outParts, rows: outParts.reduce((s, p) => s + p.rows, 0), about: aboutUnique, provenance: w.provenance || null });
  }
  const sum = (k) => reports.reduce((s, r) => s + (r[k] || 0), 0);
  const summary = { works: works.length, parts: reports.length, rows_in: sum('rows_in'), rows_out: sum('rows_out'),
    moved_to_about: reports.reduce((s, r) => s + r.moved_to_about.length, 0), moved_with_layer: reports.reduce((s, r) => s + r.moved_to_about.filter((m) => m.had_layer).length, 0),
    cleaned_rows: sum('cleaned_rows'), rekeyed_layer_rows: sum('rekeyed_layer_rows'),
    layer_in: sum('layer_in'), layer_out: sum('layer_out'), layer_dropped: reports.reduce((s, r) => s + r.layer_dropped.length, 0),
    client_stored: sum('client_stored'), client_rejected: sum('client_rejected'),
    too_large: reports.filter((r) => r.too_large).map((r) => r.files[0]), fragmented_parts: reports.filter((r) => r.fragments > 1).length, max_body_bytes: Math.max(0, ...reports.map((r) => r.body_bytes)),
    dropped_row_fields: reports.reduce((a, r) => { for (const [k, v] of Object.entries(r.droppedRowFields)) a[k] = (a[k] || 0) + v; return a; }, {}),
    dropped_meta_fields: reports.reduce((a, r) => { for (const [k, v] of Object.entries(r.droppedMetaFields)) a[k] = (a[k] || 0) + v; return a; }, {}) };
  fs.writeFileSync(path.join(out, 'modern-release-candidate.json'), JSON.stringify({ schema: 'modern-release-candidate-v1', registry_schema: registry.schema, summary, works }, null, 1));
  fs.writeFileSync(path.join(out, 'transfer-report.json'), JSON.stringify({ summary, parts: reports }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  const ok = summary.client_rejected === 0 && summary.layer_dropped === 0 && !summary.too_large.length && summary.rows_out + summary.moved_to_about === summary.rows_in;
  process.exitCode = ok ? 0 : 1;
}

if (require.main === module) main();
module.exports = { cleanEntities, publicRow, cleanRow, buildPart, splitBuilt, loadClient };
