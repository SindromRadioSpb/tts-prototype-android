#!/usr/bin/env node
'use strict';
// Catalog v(N+1) whose sections ARE the official Ben-Yehuda periods (owner decision 2026-10-23).
// Input: the sealed catalog vN (public/data/benyehuda) + the official-period snapshot gathered by
// fetch-official-periods.js (+ per-work status of works absent from the public-domain listing).
// The app's own Wikidata «eras» stop being a category: card.era := official period key.
//   • every card carries source_period evidence (listing URL + page sha256 + fetch time);
//   • works the source gives no period → section «none», status checked-absent (owner: last section);
//   • works the source deleted (404) stay, marked source_removed (owner: keep with a mark);
//   • the search file keeps its ORDER (full-text ordinals) — only the period letter changes;
//   • FTS / vocab / transliteration data do not depend on sections: the v(N+1) manifests point at
//     the same shard files, nothing is re-uploaded.
// Writes into --out only. Usage:
//   node build-catalog-periods.js --data public/data/benyehuda --periods <dir> --from 8 --to 9 --out <dir>

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildAuthorNodes, validateAuthorNodes } = require('../../db/premium/authorNodes');

const PERIODS = {
  ancient:       { order: 1, he: 'עת עתיקה ופיוט',      title: 'Древность и пиют',                    gloss: 'Древнейший пласт словесности и литургическая поэзия' },
  medieval:      { order: 2, he: 'ימי הביניים והרנסאנס', title: 'Средние века и Ренессанс',             gloss: 'Поэзия и проза Средних веков и Ренессанса' },
  enlightenment: { order: 3, he: 'ההשכלה',              title: 'Хаскала (Просвещение)',                gloss: 'Еврейское Просвещение' },
  revival:       { order: 4, he: 'התחייה',              title: 'Тхия (Возрождение)',                   gloss: 'Национальное возрождение ивритской литературы' },
  modern:        { order: 5, he: 'ספרות עברית חדשה',     title: 'Новая ивритская литература',            gloss: 'Новая ивритская литература' },
  none:          { order: 90, he: null,                  title: 'Без периода в каталоге Бен-Иегуды',    gloss: 'Источник не указывает период этой работы' },
};
const CAP = 2000; // same author-block split as build-corpus-catalog.js --full
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const isReady = (c) => !!(c.coverage && c.coverage.text && c.coverage.translation && c.coverage.translation !== 'none');

function arg(name) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : null; }

// work id → { period, url, sha256, fetched_at } from the per-page records (ids were appended page by page).
function periodEvidence(dir) {
  const out = new Map();
  for (const p of Object.keys(PERIODS).filter((k) => k !== 'none')) {
    const c = read(path.join(dir, `period-${p}.json`));
    let at = 0;
    for (const page of c.pages) {
      for (const id of c.ids.slice(at, at + page.new_ids)) out.set(id, { period: p, url: page.url, sha256: page.sha256, fetched_at: page.fetched_at });
      at += page.new_ids;
    }
    if (at !== c.ids.length) throw new Error(`${p}: page records cover ${at} of ${c.ids.length} ids`);
  }
  return out;
}
function listingEvidence(dir) {
  const c = read(path.join(dir, 'period-all.json'));
  const out = new Map(); let at = 0;
  for (const page of c.pages) { for (const id of c.ids.slice(at, at + page.new_ids)) out.set(id, page); at += page.new_ids; }
  return out;
}

// Cards carry the short filter URL + the exact page hash; the full page table (URL, time, hash) is sealed
// once in the release manifest (release.periods.pages) — 26K cards × long paginated URLs would add ~14 MB.
const filterUrl = (period) => 'https://benyehuda.org/works?' + (period === 'all' ? '' : 'ckb_periods%5B%5D=' + period + '&') + 'ckb_intellectual_property%5B%5D=public_domain';
let listingAbsence = null; // { url, sha256, fetched_at } — one hash over every page of the complete public-domain listing
function sourcePeriodFor(id, official, listed, unlisted) {
  const ev = official.get(id);
  if (ev) return { period: ev.period, source_period: { scope: 'work', work_id: id, status: 'known', value: ev.period,
    source_label: PERIODS[ev.period].he, source_url: filterUrl(ev.period), snapshot: 'sha256:' + ev.sha256 } };
  const page = listed.get(id);
  if (page) return { period: 'none', source_period: { scope: 'work', work_id: id, status: 'checked-absent', value: null,
    source_url: filterUrl('all'), snapshot: 'sha256:' + page.sha256 } };
  const u = unlisted[id];
  // Not in the source's complete public-domain listing and not checked one by one (owner 2026-10-23: the
  // per-work check is not needed for the build). Evidence = the complete listing it is absent from.
  if (!u || u.status === 'error') return { period: 'none', source_period: { scope: 'work', work_id: id, status: 'checked-absent', value: null,
    source_url: filterUrl('all'), snapshot: 'sha256:' + listingAbsence.sha256, basis: 'absent-from-public-domain-listing' } };
  const sp ={ scope: 'work', work_id: id, status: 'checked-absent', value: null, source_url: u.url,
    snapshot: u.sha256 ? 'sha256:' + u.sha256 : 'http:' + (u.http || 'error'), fetched_at: u.checked_at };
  return { period: 'none', source_period: sp, unlistedStatus: u.status,
    removed: u.status === 'removed' ? { http: u.http, url: u.url, checked_at: u.checked_at } : null,
    // The source now publishes the work under another rights status (e.g. «מוגש ברשות פרסום» — still copyrighted).
    rights: u.status !== 'removed' && u.status !== 'public-domain-unlisted' ? { status: u.status, label: u.rights_label || null, url: u.url, checked_at: u.checked_at } : null };
}

function main() {
  const data = path.resolve(arg('data') || 'public/data/benyehuda');
  const pdir = path.resolve(arg('periods'));
  const from = Number(arg('from')), to = Number(arg('to'));
  const out = path.resolve(arg('out'));
  if (!from || !to || !arg('periods') || !arg('out')) throw new Error('usage: --data D --periods P --from N --to N+1 --out O');
  const official = periodEvidence(pdir);
  const listed = listingEvidence(pdir);
  const unlisted = fs.existsSync(path.join(pdir, 'unlisted-status.json')) ? read(path.join(pdir, 'unlisted-status.json')) : {};
  const all = read(path.join(pdir, 'period-all.json'));
  listingAbsence = { url: all.pages[0].url, sha256: sha(all.pages.map((p) => p.sha256).join(',')), fetched_at: all.pages[all.pages.length - 1].fetched_at };

  const root = read(path.join(data, `corpus-catalog-v${from}.json`));
  const index = read(path.join(data, root.index_file));
  const search = read(path.join(data, root.search_file));
  const cards = [];
  for (const m of root.manifests) for (const c of read(path.join(data, m.file)).works) cards.push(c);
  if (cards.length !== root.counts.works) throw new Error('manifests hold ' + cards.length + ' cards, root says ' + root.counts.works);

  const report = { moved: {}, by_period: {}, ready_by_period: {}, removed: 0, unchecked: [], previous_evidence_disagrees: [] };
  const assign = new Map();
  for (const c of cards) {
    const id = String(c.id);
    const r = sourcePeriodFor(id, official, listed, unlisted);
    if (c.source_period && c.source_period.status === 'known' && r.source_period.status === 'known' && c.source_period.value !== r.source_period.value)
      report.previous_evidence_disagrees.push({ id, previous: c.source_period.value, now: r.source_period.value });
    const key = (c.era || 'null') + ' → ' + r.period;
    report.moved[key] = (report.moved[key] || 0) + 1;
    if (r.unchecked) report.unchecked.push(id);
    assign.set(id, r);
  }
  const apply = (c) => {
    const r = assign.get(String(c.id));
    c.era = r.period;
    c.source_period = r.source_period;
    if (r.removed) c.source_removed = r.removed; else delete c.source_removed;
    if (r.rights) c.source_rights = r.rights; else delete c.source_rights;
    if (c.coverage) c.coverage.era_known = r.period !== 'none';
    c.catalog_version = to;
  };
  for (const c of cards) apply(c);
  for (const c of index.ready) apply(c);

  // Sections, manifests, author index and facets — the same shape the --full producer emits.
  const byPeriod = new Map();
  for (const c of cards) { if (!byPeriod.has(c.era)) byPeriod.set(c.era, []); byPeriod.get(c.era).push(c); }
  const manifests = [], taxonomy = [], writes = [], authors = {}, facets = {};
  for (const p of [...byPeriod.keys()].sort((a, b) => PERIODS[a].order - PERIODS[b].order)) {
    const list = byPeriod.get(p);
    list.sort((a, b) => String(a.author || '').localeCompare(String(b.author || '')) || String(a.id).localeCompare(String(b.id)));
    const blockOf = new Map();
    if (list.length <= CAP) {
      const rel = `catalog/era-${p}-v${to}.json`;
      writes.push({ rel, json: { schema: 1, version: to, era: p, block: null, count: list.length, works: list } });
      manifests.push({ era: p, block: null, file: rel, count: list.length });
      for (const c of list) blockOf.set(c, null);
    } else {
      for (let i = 0, blk = 0; i < list.length; i += CAP, blk++) {
        const chunk = list.slice(i, i + CAP), bb = String(blk).padStart(2, '0');
        const rel = `catalog/era-${p}-b${bb}-v${to}.json`;
        writes.push({ rel, json: { schema: 1, version: to, era: p, block: bb, count: chunk.length, works: chunk } });
        manifests.push({ era: p, block: bb, file: rel, count: chunk.length });
        for (const c of chunk) blockOf.set(c, bb);
      }
    }
    const aMap = new Map(), genre = {}, lang = {};
    for (const c of list) {
      const name = c.author || '(без автора)';
      let a = aMap.get(name);
      if (!a) { a = { name, qid: c.author_qid || null, works: 0, ready: 0, blocks: new Set() }; aMap.set(name, a); }
      a.works++; if (isReady(c)) a.ready++; a.blocks.add(blockOf.get(c));
      if (!a.qid && c.author_qid) a.qid = c.author_qid;
      genre[c.genre || '(none)'] = (genre[c.genre || '(none)'] || 0) + 1;
      lang[c.orig_language || 'he'] = (lang[c.orig_language || 'he'] || 0) + 1;
    }
    authors[p] = [...aMap.values()].map((a) => ({ name: a.name, qid: a.qid, works: a.works, ready: a.ready, blocks: [...a.blocks] }))
      .sort((x, y) => (y.ready - x.ready) || (y.works - x.works) || String(x.name).localeCompare(String(y.name)));
    facets[p] = { genre, lang };
    const ready = list.filter(isReady).length;
    report.by_period[p] = list.length; report.ready_by_period[p] = ready;
    taxonomy.push({ era: p, title: PERIODS[p].title, source_label: PERIODS[p].he, range: '', gloss: PERIODS[p].gloss, order: PERIODS[p].order,
      count: list.length, author_count: aMap.size, ready_count: ready, classification: 'benyehuda-official' });
  }
  report.removed = cards.filter((c) => c.source_removed).length;
  report.rights_changed = cards.filter((c) => c.source_rights).map((c) => ({ id: String(c.id), status: c.source_rights.status, label: c.source_rights.label, ready: isReady(c) }));
  if (report.rights_changed.some((x) => x.ready)) throw new Error('a READY (published) work is no longer public domain at the source: ' + JSON.stringify(report.rights_changed.filter((x) => x.ready)));

  // Search rows: same order (FTS ordinals), period letter only.
  const before = search.map((r) => r.id).join(',');
  for (const row of search) { const r = assign.get(String(row.id)); if (!r) throw new Error('search row without card ' + row.id); row.e = r.period; }
  if (search.map((r) => r.id).join(',') !== before) throw new Error('FTS ordinal drift');

  // Author nodes: life dates stay as information; the Wikidata «era» is no longer a category.
  const eraMap = read(path.join(data, 'author-era-map-v1.json'));
  const datesOnly = { ...eraMap, authors: Object.fromEntries(Object.entries(eraMap.authors || {}).map(([q, a]) => [q, { ...a, era: null }])) };
  const nodes = buildAuthorNodes(authors, datesOnly);
  const valid = validateAuthorNodes(nodes, authors);
  if (!valid.ok) throw new Error('author nodes: ' + valid.errors.slice(0, 5).join('; '));

  const files = {};
  const put = (rel, json) => { const bytes = Buffer.from(JSON.stringify(json)); fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true }); fs.writeFileSync(path.join(out, rel), bytes); files[rel] = { bytes: bytes.length, sha256: sha(bytes) }; };
  for (const w of writes) put(w.rel, w.json);
  const INDEX = `corpus-index-v${to}.json`, SEARCH = `corpus-search-v${to}.json`, AUTH = `corpus-authors-v${to}.json`;
  put(INDEX, { ...index, version: to, generated_from: `v${from} + benyehuda official periods`, authors, facets });
  put(SEARCH, search);
  put(AUTH, { schema: 1, version: to, generated_from: `v${to} index (authorNodes.js, life dates only)`, count: nodes.length, authors: nodes });

  // Section-independent data: same content, new version stamp; FTS shards are referenced, not copied.
  const fts = read(path.join(data, `corpus-fts-v${from}.json`));
  put(`corpus-fts-v${to}.json`, { ...fts, version: to, works_file: SEARCH });
  const vocab = read(path.join(data, `corpus-vocab-v${from}.json`));
  put(`corpus-vocab-v${to}.json`, { ...vocab, version: to, catalog_version: to });
  const translit = read(path.join(data, `translit-ru-v${from}.json`));
  put(`translit-ru-v${to}.json`, { ...translit, version: to });
  const shards = [...new Set([...Object.values(fts.bucket_files).flat(), ...fts.lemma_files, fts.lemmamap_file])];

  const prevRelease = read(path.join(data, root.release_manifest));
  const shardAssets = Object.fromEntries(shards.map((s) => { if (!prevRelease.assets[s]) throw new Error('shard not sealed in v' + from + ': ' + s); return [s, prevRelease.assets[s]]; }));
  const release = { ...prevRelease, catalog_version: to, baseline_catalog_version: from,
    periods: { schema: 'benyehuda-official-periods-v1', source: 'benyehuda.org/works ckb_periods filter, public_domain', snapshot_date: read(path.join(pdir, 'official-periods.json')).fetched_at,
      pages: ['ancient', 'medieval', 'enlightenment', 'revival', 'modern', 'all'].flatMap((p) => read(path.join(pdir, `period-${p}.json`)).pages.map((x) => ({ period: p, url: x.url, sha256: x.sha256, fetched_at: x.fetched_at }))),
      absence_snapshot_sha256: listingAbsence.sha256 },
    assets: { ...Object.fromEntries(Object.entries(files)), ...shardAssets } };
  put(`learning-release-v${to}.json`, release);
  const releaseSha = files[`learning-release-v${to}.json`].sha256;
  const newRoot = { ...root, version: to, index_file: INDEX, search_file: SEARCH, authors_file: AUTH,
    generated_from: `v${from} + benyehuda official periods (${release.periods.snapshot_date})`,
    counts: { ...root.counts, by_era: report.by_period }, era_taxonomy: taxonomy, manifests,
    taxonomy_source: 'benyehuda-official', release_manifest: `learning-release-v${to}.json`, release_manifest_sha256: releaseSha };
  put(`corpus-catalog-v${to}.json`, newRoot);
  fs.writeFileSync(path.join(out, `periods-report-v${to}.json`), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ by_period: report.by_period, ready_by_period: report.ready_by_period, removed: report.removed, rights_changed: report.rights_changed.length,
    unchecked: report.unchecked.length, previous_evidence_disagrees: report.previous_evidence_disagrees.length, files: Object.keys(files).length }, null, 1));
  if (report.unchecked.length) process.exitCode = 1;
}

main();
