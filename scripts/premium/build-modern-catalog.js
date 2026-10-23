#!/usr/bin/env node
'use strict';
// Modern release F4 data step: catalog v(N+1) = sealed catalog vN + the Modern learning editions built by
// build-modern-release.js (bodies + per-work candidate). Writes only into --out.
//   • one catalog card per work (sections stay the official Ben-Yehuda periods from vN);
//   • a multi-part work points its card at its FIRST text part (an old client opens the beginning, honestly),
//     carries parts/work_rows and a sealed table of contents file works/<id>-<hash16>-toc.json;
//   • notes/structure/appendix parts nest under the text part they belong to (owner 2026-10-23);
//   • a work already on readers' devices (older edition) keeps it: previous_text_keys;
//   • the release manifest lists every new body, preview and TOC by sha256; vN files stay byte-identical.
// Usage: node build-modern-catalog.js --data public/data/benyehuda --from 9 --to 10 --candidate <dir> --out <dir>

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildAuthorNodes, validateAuthorNodes } = require('../../db/premium/authorNodes');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const isReady = (c) => !!(c.coverage && c.coverage.text && c.coverage.translation && c.coverage.translation !== 'none');
const NIQQUD = /[ְ-ׇּׁׂ]/;
function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; }

// Notes / structure / appendix parts belong to the text part whose id they extend (…-notes, …-structure).
function parentOf(part, textParts) {
  if (part.track === 'text') return null;
  const own = String(part.source_part_id || part.part_id);
  const hit = textParts.filter((t) => own.startsWith(String(t.source_part_id || t.part_id) + '-')).sort((a, b) => b.part_id.length - a.part_id.length)[0];
  return hit ? hit.part_id : null;
}

function main() {
  const data = path.resolve(arg('data') || 'public/data/benyehuda'), from = Number(arg('from')), to = Number(arg('to'));
  const cand = path.resolve(arg('candidate')), out = path.resolve(arg('out'));
  const root = read(path.join(data, `corpus-catalog-v${from}.json`));
  const index = read(path.join(data, root.index_file));
  const search = read(path.join(data, root.search_file));
  const release = read(path.join(data, root.release_manifest));
  const candidate = read(path.join(cand, 'modern-release-candidate.json'));
  const manifests = root.manifests.map((m) => ({ meta: m, json: read(path.join(data, m.file)) }));
  const cardById = new Map();
  for (const m of manifests) for (const c of m.json.works) cardById.set(String(c.id), c);
  const files = {}; const report = { added: 0, replaced: 0, enriched: 0, multipart: 0, toc_files: 0, bodies: 0 };
  const put = (rel, value, raw) => {
    const bytes = raw || Buffer.from(JSON.stringify(value));
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.writeFileSync(path.join(out, rel), bytes);
    files[rel] = { bytes: bytes.length, sha256: sha(bytes) };
    return files[rel];
  };
  const releaseWorks = [];

  // Works newer than the public-domain dump the catalog was built from get a new card in the official
  // Modern section, with the same period evidence as every other card; their search rows go to the END
  // of the search file so existing full-text ordinals never move.
  const periodsDir = arg('periods') ? path.resolve(arg('periods')) : null;
  const modernPage = new Map();
  if (periodsDir) {
    const c = read(path.join(periodsDir, 'period-modern.json')); let at = 0;
    for (const page of c.pages) { for (const id of c.ids.slice(at, at + page.new_ids)) modernPage.set(id, page); at += page.new_ids; }
  }
  const qidByName = new Map();
  for (const c of cardById.values()) if (c.author && c.author_qid) { const s = qidByName.get(c.author) || new Set(); s.add(c.author_qid); qidByName.set(c.author, s); }
  const modernManifest = manifests.find((m) => m.meta.era === 'modern');
  report.new_cards = 0;
  for (const w of candidate.works) {
    if (cardById.has(String(w.work_id))) continue;
    const page = modernPage.get(String(w.work_id));
    if (!page) throw new Error('work ' + w.work_id + ' is neither in the catalog nor in the official Modern listing');
    const body = read(path.join(cand, w.parts[0].file)).library.texts[0];
    const corpus = body.corpus || {};
    const qids = qidByName.get(corpus.author || w.author || '');
    const card = { id: String(w.work_id), title: w.title, author: corpus.author || w.author || null,
      author_qid: qids && qids.size === 1 ? [...qids][0] : null, era: 'modern', register: null, track: 'literary',
      genre: corpus.genre || null, orig_language: corpus.orig_language || 'he', catalog_version: to,
      source_period: { scope: 'work', work_id: String(w.work_id), status: 'known', value: 'modern', source_label: 'ספרות עברית חדשה',
        source_url: 'https://benyehuda.org/works?ckb_periods%5B%5D=modern&ckb_intellectual_property%5B%5D=public_domain', snapshot: 'sha256:' + page.sha256 },
      coverage: { text: false, niqqud: 0, translation: 'none', audio: 'none', era_known: true, tier: 'unprocessed' } };
    modernManifest.json.works.push(card); modernManifest.json.count = modernManifest.json.works.length; modernManifest.meta.count = modernManifest.json.count;
    cardById.set(card.id, card);
    search.push({ id: card.id, t: card.title || '', a: card.author || '', e: 'modern', g: card.genre, l: card.orig_language, r: 0, ...(card.author_qid ? { q: card.author_qid } : {}) });
    report.new_cards++;
  }
  modernManifest.json.works.sort((a, b) => String(a.author || '').localeCompare(String(b.author || '')) || String(a.id).localeCompare(String(b.id)));

  for (const w of candidate.works) {
    const card = cardById.get(String(w.work_id));
    if (!card) throw new Error('work ' + w.work_id + ' has no catalog card in v' + from);
    if (card.era !== 'modern') throw new Error('work ' + w.work_id + ' is not in the official Modern section (' + card.era + ')');
    // Bodies are content-addressed; copy them (upload to the volume is a separate, reviewed step).
    for (const p of w.parts) { const raw = fs.readFileSync(path.join(cand, p.file)); if (sha(raw) !== p.body_sha256) throw new Error('body hash ' + p.file); put(p.file, null, raw); report.bodies++; }
    const textParts = w.parts.filter((p) => p.track === 'text');
    const first = textParts[0] || w.parts[0];
    const firstBody = read(path.join(cand, first.file));
    const t0 = firstBody.library.texts[0];
    const pl = t0.source_meta.public_learning;
    const rows0 = t0.rows;
    pl.filled_rows = Object.fromEntries(['hebrew_plain', 'hebrew_niqqud', 'russian', 'translit', 'translit_ru'].map((k) => [k, rows0.filter((r) => String(r[k] || '').trim()).length]));
    pl.niqqud_rows = rows0.filter((r) => NIQQUD.test(r.hebrew_niqqud || '')).length;
    const preview = { library: { texts: [{ rows: rows0.slice(0, 4).map((r) => ({ hebrew_plain: r.hebrew_plain, hebrew_niqqud: r.hebrew_niqqud, russian: r.russian, translit: r.translit, translit_ru: r.translit_ru })) }] } };
    const pBytes = Buffer.from(JSON.stringify(preview)), pSha = sha(pBytes);
    const previewFile = `works/${w.work_id}-${pSha.slice(0, 16)}-preview.json`;
    put(previewFile, null, pBytes);
    const wasReady = isReady(card);
    const previous = [...new Set([...(card.previous_text_keys || []), ...(wasReady && card.text_key ? [card.text_key] : [])])].filter((k) => k !== first.text_key);
    const action = wasReady ? (card.learning_edition_id ? 'enriched' : 'replaced') : 'added';
    report[action]++;
    const textRows = textParts.reduce((s, p) => s + p.rows, 0);
    Object.assign(card, {
      title: card.title || w.title, parts: w.parts.length, segments: first.rows, work_rows: textRows,
      vocalized_ratio: Math.round((pl.niqqud_rows / Math.max(1, rows0.length)) * 100) / 100,
      review_status: 'machine', audio_status: 'none', text_key: first.text_key, file: first.file, bundle_sha256: first.body_sha256,
      preview_file: previewFile, preview_sha256: pSha, learning_edition_id: first.edition_id, learning_revision: t0.updated_at || null,
      source_edition_id: pl.source_version, translation_provenance: { provider: 'OpenAI assistant' }, public_learning: pl,
      previous_text_keys: previous, catalog_version: to, scope: w.scope, source_coverage: w.source_coverage,
      word_gloss_ai: w.parts.some((p) => p.word_gloss_ai_rows) ? { rows: w.parts.reduce((s, p) => s + p.word_gloss_ai_rows, 0) } : null,
      about: w.about && w.about.length ? w.about : undefined,
      coverage: { text: true, niqqud: Math.round((pl.niqqud_rows / Math.max(1, rows0.length)) * 100) / 100, translation: 'machine', audio: 'none', era_known: true, tier: 'machine-known' },
    });
    if (!card.about) delete card.about;
    if (!card.word_gloss_ai) delete card.word_gloss_ai;
    const entry = { work_id: w.work_id, action, edition_text_key: first.text_key, learning_edition_id: first.edition_id, body: first.file, body_sha256: first.body_sha256,
      preview: previewFile, preview_sha256: pSha, rows: first.rows, parts: w.parts.map((p) => ({ part_id: p.part_id, body: p.file, body_sha256: p.body_sha256, rows: p.rows })) };
    if (w.parts.length > 1) {
      report.multipart++;
      const toc = { schema: 'benyehuda-work-toc-v1', work_id: w.work_id, title: card.title, author: card.author || null, scope: w.scope,
        source_coverage: w.source_coverage, about: w.about || [], work_rows: textRows,
        parts: w.parts.map((p, i) => ({ part_id: p.part_id, order: i + 1, track: p.track, parent: parentOf(p, textParts), title: p.title,
          fragment: p.fragment || null, rows: p.rows, file: p.file, bundle_sha256: p.body_sha256, text_key: p.text_key,
          learning_edition_id: p.edition_id, word_gloss_ai_rows: p.word_gloss_ai_rows, previous_text_keys: [] })) };
      const tBytes = Buffer.from(JSON.stringify(toc)), tSha = sha(tBytes);
      // A table of contents is catalog metadata (tiny, sealed by the card and the release manifest): it ships
      // with the catalog files, not with the work bodies on the volume.
      const tocFile = `toc/${w.work_id}-${tSha.slice(0, 16)}.json`;
      put(tocFile, null, tBytes); report.toc_files++;
      card.toc_file = tocFile; card.toc_sha256 = tSha;
      entry.toc = tocFile; entry.toc_sha256 = tSha;
    }
    releaseWorks.push(entry);
  }

  // Ready list, search flags, per-section counts and authors — recomputed from the cards.
  const allCards = manifests.flatMap((m) => m.json.works);
  index.ready = allCards.filter(isReady).map((c) => ({ ...c }));
  const readyIds = new Set(index.ready.map((c) => String(c.id)));
  for (const row of search) row.r = readyIds.has(String(row.id)) ? 1 : 0;
  const authors = {};
  for (const m of manifests) {
    const era = m.meta.era; if (!authors[era]) authors[era] = new Map();
    for (const c of m.json.works) {
      const name = c.author || '(без автора)';
      let a = authors[era].get(name);
      if (!a) { a = { name, qid: c.author_qid || null, works: 0, ready: 0, blocks: new Set() }; authors[era].set(name, a); }
      a.works++; if (isReady(c)) a.ready++; a.blocks.add(m.meta.block);
      if (!a.qid && c.author_qid) a.qid = c.author_qid;
    }
  }
  index.authors = Object.fromEntries(Object.entries(authors).map(([era, map]) => [era, [...map.values()]
    .map((a) => ({ name: a.name, qid: a.qid, works: a.works, ready: a.ready, blocks: [...a.blocks] }))
    .sort((x, y) => (y.ready - x.ready) || (y.works - x.works) || String(x.name).localeCompare(String(y.name)))]));
  index.version = to; index.generated_from = `v${from} + Modern learning editions`;
  for (const m of manifests) { m.json.version = to; for (const c of m.json.works) c.catalog_version = to; }

  const newManifests = manifests.map((m) => { const file = m.meta.file.replace(new RegExp(`-v${from}\\.json$`), `-v${to}.json`); put(file, m.json); return { ...m.meta, file }; });
  const INDEX = `corpus-index-v${to}.json`, SEARCH = `corpus-search-v${to}.json`, AUTH = `corpus-authors-v${to}.json`;
  put(INDEX, index); put(SEARCH, search);
  const eraMap = read(path.join(data, 'author-era-map-v1.json'));
  const datesOnly = { ...eraMap, authors: Object.fromEntries(Object.entries(eraMap.authors || {}).map(([q, a]) => [q, { ...a, era: null }])) };
  const nodes = buildAuthorNodes(index.authors, datesOnly); const valid = validateAuthorNodes(nodes, index.authors);
  if (!valid.ok) throw new Error('author nodes: ' + valid.errors.slice(0, 3).join('; '));
  put(AUTH, { schema: 1, version: to, generated_from: `v${to} index (authorNodes.js, life dates only)`, count: nodes.length, authors: nodes });
  // Section-independent sidecars: new version stamp; the full-text index does not yet cover the new works (separate step).
  const fts = read(path.join(data, `corpus-fts-v${from}.json`));
  put(`corpus-fts-v${to}.json`, { ...fts, version: to, works_file: SEARCH });
  put(`corpus-vocab-v${to}.json`, { ...read(path.join(data, `corpus-vocab-v${from}.json`)), version: to, catalog_version: to });
  put(`translit-ru-v${to}.json`, { ...read(path.join(data, `translit-ru-v${from}.json`)), version: to });
  const shards = Object.fromEntries(Object.entries(release.assets).filter(([f]) => f.startsWith('fts/')));
  const newIds = new Set(releaseWorks.map((x) => x.work_id));
  const newRelease = { ...release, catalog_version: to, baseline_catalog_version: from,
    works: [...release.works.filter((x) => !newIds.has(String(x.work_id))), ...releaseWorks],
    retained_works: release.retained_works.filter((x) => !newIds.has(String(x.work_id))),
    modern: { schema: 'modern-release-v1', summary: candidate.summary, added: report.added, replaced: report.replaced, enriched: report.enriched, multipart: report.multipart },
    assets: { ...Object.fromEntries(Object.entries(files).filter(([f]) => !f.startsWith('works/'))), ...shards } };
  const ids = [...newRelease.works, ...newRelease.retained_works].map((x) => String(x.work_id));
  if (new Set(ids).size !== ids.length) throw new Error('duplicate work in release manifest');
  if (ids.length !== index.ready.length) throw new Error(`release lists ${ids.length} works, catalog has ${index.ready.length} ready`);
  const rel = put(`learning-release-v${to}.json`, newRelease);
  const byEra = {}; for (const c of allCards) byEra[c.era] = (byEra[c.era] || 0) + 1;
  const counts = { ...root.counts, works: allCards.length, baked: index.ready.length, by_era: byEra };
  if (search.length !== allCards.length) throw new Error(`search rows ${search.length} ≠ cards ${allCards.length}`);
  const taxonomy = root.era_taxonomy.map((t) => ({ ...t, count: byEra[t.era] || 0, author_count: (index.authors[t.era] || []).length,
    ready_count: allCards.filter((c) => c.era === t.era && isReady(c)).length }));
  put(`corpus-catalog-v${to}.json`, { ...root, version: to, index_file: INDEX, search_file: SEARCH, authors_file: AUTH, manifests: newManifests,
    counts, era_taxonomy: taxonomy, pointers: { ...root.pointers, ready: search.filter((r) => r.r).map((r) => r.id) },
    generated_from: `v${from} + Modern learning editions`, release_manifest: `learning-release-v${to}.json`, release_manifest_sha256: rel.sha256 });
  fs.writeFileSync(path.join(out, `modern-catalog-report-v${to}.json`), JSON.stringify({ ...report, ready: index.ready.length, ready_by_period: Object.fromEntries(taxonomy.map((t) => [t.era, t.ready_count])) }, null, 1));
  console.log(JSON.stringify({ ...report, ready: index.ready.length, ready_by_period: Object.fromEntries(taxonomy.map((t) => [t.era, t.ready_count])) }, null, 1));
}

main();
