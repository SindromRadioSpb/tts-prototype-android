#!/usr/bin/env node
'use strict';
// Independent check of the Modern catalog release (build-modern-catalog.js output) with the CLIENT's own
// verifier (public/js/benyehuda-learning-edition.js): what passes here is what a reader's device accepts.
//   • the root seals the release manifest; the client accepts the manifest for this catalog;
//   • every Modern card: its body passes verifyBundle exactly as the Room calls it;
//   • every multi-part work: the TOC matches its sealed hash; every part body passes verifyBundle as a part card;
//     parts are in order, each notes/structure part has a text parent or stands alone; no part twice;
//   • the previous catalog's search rows keep their positions (full-text ordinals);
//   • nothing ready before is lost; works that were on devices keep their old text_key in previous_text_keys.
// Usage: node modern-catalog-smoke.js --old <dir vN> --new <dir vN+1> --from N --to N+1 --candidate <dir>

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const Edition = require('../../public/js/benyehuda-learning-edition.js');

const args = {}; process.argv.slice(2).forEach((a, i, all) => { if (a.startsWith('--')) args[a.slice(2)] = all[i + 1]; });
const read = (d, f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
const bytes = (d, f) => { const b = fs.readFileSync(path.join(d, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const sha = (b) => crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
let checks = 0; const ok = (c, m) => { assert.ok(c, m); checks++; };

(async () => {
  const from = Number(args.from), to = Number(args.to);
  const oldRoot = read(args.old, `corpus-catalog-v${from}.json`), root = read(args.new, `corpus-catalog-v${to}.json`);
  await Edition.verifyManifest(root, bytes(args.new, root.release_manifest)); checks++;
  const cards = root.manifests.flatMap((m) => read(args.new, m.file).works);
  const byId = new Map(cards.map((c) => [String(c.id), c]));
  const candidate = read(args.candidate, 'modern-release-candidate.json');
  const oldReady = new Set(read(args.old, oldRoot.index_file).ready.map((c) => String(c.id)));
  const newReady = new Set(read(args.new, root.index_file).ready.map((c) => String(c.id)));
  ok([...oldReady].every((id) => newReady.has(id)), 'no ready work lost');
  const oldSearch = read(args.old, oldRoot.search_file).map((r) => String(r.id)), newSearch = read(args.new, root.search_file).map((r) => String(r.id));
  ok(oldSearch.every((id, i) => newSearch[i] === id), 'old search rows keep their positions');
  const oldCards = new Map(oldRoot.manifests.flatMap((m) => read(args.old, m.file).works).map((c) => [String(c.id), c]));
  let parts = 0, multipart = 0;
  for (const w of candidate.works) {
    const card = byId.get(String(w.work_id));
    ok(card && card.era === 'modern' && newReady.has(String(w.work_id)), `work ${w.work_id}: ready in Modern`);
    await Edition.verifyBundle(card, bytes(args.new, card.file)); checks++;
    ok(sha(bytes(args.new, card.preview_file)) === card.preview_sha256, `work ${w.work_id}: preview hash`);
    const before = oldCards.get(String(w.work_id));
    if (before && before.text_key && before.coverage && before.coverage.text) ok((card.previous_text_keys || []).includes(before.text_key), `work ${w.work_id}: device copy kept`);
    if (w.parts.length > 1) {
      multipart++;
      const tocBytes = bytes(args.new, card.toc_file);
      ok(sha(tocBytes) === card.toc_sha256, `work ${w.work_id}: TOC hash`);
      const toc = JSON.parse(Buffer.from(tocBytes).toString('utf8'));
      ok(toc.work_id === String(w.work_id) && toc.parts.length === card.parts, `work ${w.work_id}: TOC identity`);
      ok(new Set(toc.parts.map((p) => p.part_id)).size === toc.parts.length, `work ${w.work_id}: no part twice`);
      ok(toc.parts.every((p, i) => p.order === i + 1), `work ${w.work_id}: order`);
      const textIds = new Set(toc.parts.filter((p) => p.track === 'text').map((p) => p.part_id));
      ok(toc.parts.every((p) => p.track === 'text' ? p.parent === null : p.parent === null || textIds.has(p.parent)), `work ${w.work_id}: parents`);
      ok(toc.parts.find((p) => p.track === 'text').text_key === card.text_key, `work ${w.work_id}: card opens the first text part`);
      for (const p of toc.parts) {
        const partCard = { id: card.id, text_key: p.text_key, file: p.file, bundle_sha256: p.bundle_sha256, learning_edition_id: p.learning_edition_id, segments: p.rows };
        await Edition.verifyBundle(partCard, bytes(args.new, p.file)); checks++; parts++;
      }
    }
  }
  console.log(`modern-catalog-smoke: ${checks} checks passed · ${candidate.works.length} works · ${multipart} multi-part · ${parts} parts verified with the client verifier`);
})().catch((e) => { console.error(e); process.exit(1); });
