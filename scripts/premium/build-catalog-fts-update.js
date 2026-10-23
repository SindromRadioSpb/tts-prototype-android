#!/usr/bin/env node
'use strict';
// Catalog v(N+1) = sealed catalog vN + a full-text index that covers the Modern learning editions.
// Cards, sections, search rows and tables of contents are unchanged (only the version stamp moves); the FTS
// postings of every Modern work are replaced by the text of its published learning bodies, every other
// indexed work keeps its postings (verified), and a work made of parts records where each part starts in its
// shards which of its parts hold each word (key '#'+skeleton, the same delta encoding with part indices as
// positions; a query token is Hebrew letters only, so it never reads them), so a hit can open the right part. Writes only into --out; shards are volume-only (push-corpus-fts).
// Usage: node build-catalog-fts-update.js --data public/data/benyehuda --from 10 --to 11 \
//          --baseline-fts <dir with the sealed fts/ shards of vN> --bodies <dir with vN learning bodies> --out <dir>

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FTS = require('../../public/js/corpus-fts.js');
const { buildFormIndex, tokenToPid } = require('./build-corpus-vocab.js');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; }
const SHARD_LIMIT = 8 * 1024 * 1024;

function bodyTokens(file) {
  const body = read(file);
  const text = body.library.texts.flatMap((t) => t.rows.map((r) => r.hebrew_niqqud || r.hebrew_plain || '')).join('\n');
  return FTS.tokenizeText(text);
}

function main() {
  const data = path.resolve(arg('data') || 'public/data/benyehuda'), from = Number(arg('from')), to = Number(arg('to'));
  const ftsDir = path.resolve(arg('baseline-fts')), bodies = path.resolve(arg('bodies')), out = path.resolve(arg('out'));
  if (!(to === from + 1)) throw new Error('--to must be --from + 1');
  const root = read(path.join(data, `corpus-catalog-v${from}.json`));
  const relBytes = fs.readFileSync(path.join(data, root.release_manifest));
  if (sha(relBytes) !== root.release_manifest_sha256) throw new Error('vN release manifest is not sealed by its catalog');
  const release = JSON.parse(relBytes);
  const files = {};
  const put = (rel, value, raw) => {
    const bytes = raw || Buffer.from(JSON.stringify(value));
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.writeFileSync(path.join(out, rel), bytes);
    files[rel] = { bytes: bytes.length, sha256: sha(bytes) };
    return files[rel];
  };
  const sealedBytes = (rel) => {   // every vN input is checked against the vN seal before it is used
    const b = fs.readFileSync(rel.startsWith('fts/') ? path.join(ftsDir, rel) : path.join(data, rel));
    const a = release.assets[rel];
    if (!a || a.sha256 !== sha(b) || a.bytes !== b.length) throw new Error('input differs from the vN seal: ' + rel);
    return b;
  };
  const stamp = (name) => name.replace(new RegExp(`-v${from}\\.json$`), `-v${to}.json`);

  // 1. Catalog files: same content, new version stamp.
  const manifests = root.manifests.map((m) => {
    const json = JSON.parse(sealedBytes(m.file)); json.version = to; for (const c of json.works) c.catalog_version = to;
    const file = stamp(m.file); put(file, json); return { ...m, file };
  });
  const cards = new Map(); for (const m of manifests) for (const c of read(path.join(out, m.file)).works) cards.set(String(c.id), c);
  const index = JSON.parse(sealedBytes(root.index_file)); index.version = to; index.generated_from = `v${from} + full-text index of Modern editions`;
  put(stamp(root.index_file), index);
  const searchBytes = sealedBytes(root.search_file); put(stamp(root.search_file), null, searchBytes);
  const authors = JSON.parse(sealedBytes(root.authors_file)); authors.version = to; put(stamp(root.authors_file), authors);
  put(`corpus-vocab-v${to}.json`, { ...JSON.parse(sealedBytes(`corpus-vocab-v${from}.json`)), version: to, catalog_version: to });
  put(`translit-ru-v${to}.json`, { ...JSON.parse(sealedBytes(`translit-ru-v${from}.json`)), version: to });
  for (const rel of Object.keys(release.assets).filter((f) => f.startsWith('toc/'))) put(rel, null, sealedBytes(rel));

  // 2. Which works get new postings: every Modern learning edition (bodies built by the Modern release).
  const search = JSON.parse(searchBytes);
  const ords = new Map(search.map((r, i) => [String(r.id), i]));
  const manifest = JSON.parse(sealedBytes(`corpus-fts-v${from}.json`));
  const shardVersion = Number((String(manifest.lemmamap_file).match(/-v(\d+)\.json$/) || [])[1]);   // ordinals of the shards = that version's search file
  const indexedSearch = read(path.join(data, `corpus-search-v${shardVersion}.json`));
  if (JSON.stringify(indexedSearch.map((r) => String(r.id))) !== JSON.stringify(search.slice(0, indexedSearch.length).map((r) => String(r.id)))) throw new Error('FTS ordinal drift');
  const modern = release.works.filter((w) => fs.existsSync(path.join(bodies, path.basename(w.body))));
  const expected = release.modern && release.modern.summary && release.modern.summary.works;
  if (modern.length !== expected) throw new Error(`found bodies for ${modern.length} works, the release lists ${expected} Modern works`);

  const { form2pid } = buildFormIndex();
  const addedExact = new Map(), addedLemma = new Map(), newLemmaMap = {}, workParts = {}, partPostings = new Map();
  const replaced = new Set(), indexed = new Set(); let addedTokens = 0, addedMatched = 0;
  for (const w of modern) {
    const id = String(w.work_id), ord = ords.get(id), card = cards.get(id);
    if (ord == null || !card) throw new Error('Modern work missing from the catalog: ' + id);
    replaced.add(ord);
    let streams;
    if (w.parts && w.parts.length > 1) {
      const toc = JSON.parse(sealedBytes(card.toc_file));
      const byId = new Map(w.parts.map((p) => [p.part_id, p]));
      if (toc.parts.length !== w.parts.length || toc.parts.some((p) => !byId.has(p.part_id))) throw new Error('TOC ≠ release parts: ' + id);
      streams = toc.parts.map((p) => { const b = byId.get(p.part_id); if (sha(fs.readFileSync(path.join(bodies, path.basename(b.body)))) !== b.body_sha256) throw new Error('part body sha: ' + b.body); return bodyTokens(path.join(bodies, path.basename(b.body))); });
      workParts[ord] = { work_id: id, toc_sha256: card.toc_sha256, parts: toc.parts.length };
      streams.forEach((s, pi) => { for (const token of s) { const skel = FTS.normalizeToken(token); if (!skel) continue;
        let byWork = partPostings.get(skel); if (!byWork) { byWork = new Map(); partPostings.set(skel, byWork); }
        let set = byWork.get(ord); if (!set) { set = []; byWork.set(ord, set); } if (set[set.length - 1] !== pi) set.push(pi); } });
    } else {
      if (sha(fs.readFileSync(path.join(bodies, path.basename(w.body)))) !== w.body_sha256) throw new Error('body sha: ' + w.body);
      streams = [bodyTokens(path.join(bodies, path.basename(w.body)))];
    }
    const tokens = streams.flat(); if (tokens.length) indexed.add(ord);
    for (const [position, token] of tokens.entries()) {
      addedTokens++;
      const skel = FTS.normalizeToken(token); if (!skel) continue;
      let postings = addedExact.get(skel); if (!postings) { postings = new Map(); addedExact.set(skel, postings); }
      let positions = postings.get(ord); if (!positions) { positions = []; postings.set(ord, positions); }
      if (positions.length < manifest.max_pos) positions.push(position);
      const pid = tokenToPid(form2pid, token);
      if (pid) { addedMatched++; let counts = addedLemma.get(pid); if (!counts) { counts = new Map(); addedLemma.set(pid, counts); } counts.set(ord, (counts.get(ord) || 0) + 1); if (newLemmaMap[skel] == null) newLemmaMap[skel] = pid; }
    }
  }

  // 3. Merge into the sealed vN shards: Modern ordinals are replaced, every other posting is kept.
  const oldIndexed = new Set();
  const encode = (map, positions) => { const flat = []; let w = 0; for (const [ord, value] of [...map].sort((a, b) => a[0] - b[0])) { flat.push(ord - w); w = ord; if (positions) { flat.push(value.length); let p = 0; for (const pos of value) { flat.push(pos - p); p = pos; } } else flat.push(value); } return flat; };
  const merge = (flat, extra, positions) => { const m = new Map(); for (const row of (positions ? FTS.decodePositions(flat) : FTS.decodePostings(flat))) { oldIndexed.add(row.w); if (!replaced.has(row.w)) { indexed.add(row.w); m.set(row.w, positions ? row.pos : row.c); } } for (const [ord, value] of extra || []) m.set(ord, value); return encode(m, positions); };
  const split = (obj, keys, name) => { const parts = []; let cur = {}, bytes = 0; for (const k of keys) { const size = Buffer.byteLength(JSON.stringify({ [k]: obj[k] })); if (bytes && bytes + size > SHARD_LIMIT) { parts.push(cur); cur = {}; bytes = 0; } cur[k] = obj[k]; bytes += size; } if (bytes) parts.push(cur); return parts.map((p, i) => { const file = name(i, parts.length); put(file, p); return file; }); };
  const bucketKey = (skel) => manifest.sharded_letters.includes(FTS.bucketOf(skel)) ? skel.slice(0, Math.min(2, skel.length)) : FTS.bucketOf(skel);
  const pending = new Map(); for (const [skel, postings] of addedExact) { const key = bucketKey(skel); if (!pending.has(key)) pending.set(key, new Map()); pending.get(key).set(skel, postings); }
  const bucketFiles = {}; let exactKeys = 0, storedPositions = 0, partKeys = 0;
  for (const key of [...new Set([...Object.keys(manifest.bucket_files), ...pending.keys()])].sort()) {
    const merged = {};
    for (const file of manifest.bucket_files[key] || []) for (const [skel, flat] of Object.entries(JSON.parse(sealedBytes(file)))) { const value = merge(flat, pending.get(key)?.get(skel), true); if (value.length) merged[skel] = value; pending.get(key)?.delete(skel); }
    for (const [skel, postings] of pending.get(key) || []) merged[skel] = encode(postings, true);
    for (const skel of Object.keys(merged)) { const pp = partPostings.get(skel); if (pp) { merged['#' + skel] = encode(pp, true); partKeys++; } }
    const keys = Object.keys(merged).sort(); exactKeys += keys.filter((k) => k[0] !== '#').length;
    for (const k of keys.filter((x) => x[0] !== '#')) storedPositions += FTS.decodePositions(merged[k]).reduce((n, x) => n + x.pos.length, 0);
    bucketFiles[key] = split(merged, keys, (i, n) => `fts/ex-${key}${n > 1 ? '-' + i : ''}-v${to}.json`);
  }
  const lemmas = {};
  for (const file of manifest.lemma_files) for (const [pid, flat] of Object.entries(JSON.parse(sealedBytes(file)))) { const value = merge(flat, addedLemma.get(pid), false); if (value.length) lemmas[pid] = value; addedLemma.delete(pid); }
  for (const [pid, postings] of addedLemma) lemmas[pid] = encode(postings, false);
  const lemmaFiles = split(lemmas, Object.keys(lemmas).sort((a, b) => Number(a) - Number(b)), (i) => `fts/lemma-${i}-v${to}.json`);
  const lemmaMap = JSON.parse(sealedBytes(manifest.lemmamap_file));
  for (const [key, pid] of Object.entries(newLemmaMap)) if (lemmaMap[key] == null && lemmas[pid]) lemmaMap[key] = pid;
  const mapFile = `fts/lemmamap-v${to}.json`; put(mapFile, lemmaMap);
  const untouched = [...oldIndexed].filter((x) => !replaced.has(x));
  if (untouched.some((x) => !indexed.has(x))) throw new Error('Lost unrelated search coverage');
  const newlyIndexed = [...replaced].filter((x) => !oldIndexed.has(x) && indexed.has(x)).length;
  const fts = { ...manifest, version: to, works_file: stamp(root.search_file), lemma_files: lemmaFiles, lemmamap_file: mapFile, bucket_files: bucketFiles,
    work_parts: workParts, part_postings: { key_prefix: '#', keys: 0 },
    counts: { ...manifest.counts, indexed: indexed.size, missing: search.length - indexed.size, exact_keys: exactKeys, lemma_keys: Object.keys(lemmas).length,
      lemma_shards: lemmaFiles.length, bucket_shards: Object.values(bucketFiles).flat().length, stored_positions: storedPositions },
    update: { schema: 'incoming-work-postings-v1', from: manifest.update || null, works: modern.length, multipart_works: Object.keys(workParts).length,
      new_edition_tokens: addedTokens, new_edition_matched_tokens: addedMatched, newly_indexed_works: newlyIndexed,
      unrelated_indexed_works_preserved: untouched.length, ordinal_identity_verified: true } };
  fts.part_postings.keys = partKeys;
  if (partKeys !== partPostings.size) throw new Error(`part postings written ${partKeys} of ${partPostings.size}`);
  put(`corpus-fts-v${to}.json`, fts);

  // 4. Seal: the release lists every v(N+1) asset; works and their bodies are unchanged.
  const newRelease = { ...release, catalog_version: to, baseline_catalog_version: from, assets: files,
    fts_update: { schema: 'modern-fts-v1', works: modern.length, multipart_works: Object.keys(workParts).length, indexed_before: manifest.counts.indexed, indexed_after: indexed.size } };
  const rel = put(`learning-release-v${to}.json`, newRelease);
  put(`corpus-catalog-v${to}.json`, { ...root, version: to, index_file: stamp(root.index_file), search_file: stamp(root.search_file), authors_file: stamp(root.authors_file),
    manifests, generated_from: `v${from} + full-text index of Modern editions`, release_manifest: `learning-release-v${to}.json`, release_manifest_sha256: rel.sha256 });
  const report = { works: modern.length, multipart: Object.keys(workParts).length, indexed_before: manifest.counts.indexed, indexed_after: indexed.size, newly_indexed: newlyIndexed,
    untouched_preserved: untouched.length, tokens: addedTokens, shards: fts.counts.bucket_shards + lemmaFiles.length + 1, files: Object.keys(files).length };
  fs.writeFileSync(path.join(out, `fts-update-report-v${to}.json`), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
}

main();
