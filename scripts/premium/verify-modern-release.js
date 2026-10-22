#!/usr/bin/env node
'use strict';
// Modern release F2 — INDEPENDENT oracle for build-modern-release.js. It does not reuse the builder:
// it re-reads the owner's source ZIPs and the candidate bodies and checks, with its own code, that
//  1. every source row reaches the public body exactly once and in order (Hebrew, vowels, translation),
//     except the rows the owner moved to «О материале»; HTML entities are the only text change allowed;
//  2. every AI word gloss of the source reaches the same row of the public body unchanged
//     (matched by row content, not by index) — no new generation, nothing lost;
//  3. public bodies carry nothing private or technical (edit_meta, notes, progress, paths, keys).
// The row-key check uses the live client code — the browser is the authority on what it accepts.
// Usage: node verify-modern-release.js --candidate C --library-root L --registry R

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { loadClient } = require('./build-modern-release.js');

const FORBIDDEN_KEYS = ['edit_meta', 'notes', 'word_studies', 'progress', 'bookmarks', 'srs', 'review_log', 'imported_at', 'local_path', 'api_key', 'apiKey', 'password'];
const SECRET = [/[A-Za-z]:\\\\/, /[A-Za-z]:\/(Users|projects)\//, /AIza[0-9A-Za-z_-]{20,}/, /\bsk-[A-Za-z0-9]{20,}/];

const norm = (s) => String(s == null ? '' : s).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
const rowSig = (r) => norm(r.hebrew_niqqud) + '\u0001' + norm(r.hebrew_plain) + '\u0001' + norm(r.russian);
const glossSig = (lr) => JSON.stringify({ g: lr.glosses.map((g) => [g.gloss, !!g.wrong_hint, !!g.manual, g.ai_gloss || null]), m: (lr.mwe || []).map((m) => [m.from, m.to, m.gloss]), model: lr.model || '' });

function walkKeys(v, found, at = '') {
  if (Array.isArray(v)) { v.forEach((x, i) => walkKeys(x, found, at)); return; }
  if (!v || typeof v !== 'object') return;
  for (const [k, x] of Object.entries(v)) { if (FORBIDDEN_KEYS.includes(k)) found.add(at + k); walkKeys(x, found, k + '.'); }
}

function main() {
  const args = {}; process.argv.slice(2).forEach((a, i, all) => { if (a.startsWith('--')) args[a.slice(2)] = all[i + 1]; });
  const cand = JSON.parse(fs.readFileSync(path.join(args.candidate, 'modern-release-candidate.json'), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(args.registry, 'utf8'));
  const W = loadClient();
  const partsByWork = new Map();
  for (const p of registry.parts) { if (!partsByWork.has(p.work_id)) partsByWork.set(p.work_id, []); partsByWork.get(p.work_id).push(p); }
  const zipCache = new Map();
  const srcText = (archive, textId) => {
    if (!zipCache.has(archive)) { const z = new AdmZip(path.join(args['library-root'], archive)); zipCache.set(archive, JSON.parse(z.getEntries().find((e) => e.entryName.endsWith('library.json')).getData().toString('utf8'))); }
    return zipCache.get(archive).texts.find((t) => t.text_id === textId);
  };
  const res = { works: 0, bodies: 0, source_rows: 0, public_rows: 0, moved_rows: 0, row_mismatches: [], source_glosses_rows: 0, glosses_preserved: 0,
    glosses_lost: [], glosses_changed: [], client_key_rejected: 0, forbidden: [], secrets: [], text_changes_other_than_entities: 0 };
  for (const w of cand.works) {
    res.works++;
    // Public side: all bodies of the work, in reading order, grouped by their source part.
    const bodies = w.parts.slice().sort((a, b) => a.reading_order - b.reading_order).map((p) => {
      const raw = fs.readFileSync(path.join(args.candidate, p.file), 'utf8');
      res.bodies++;
      for (const rx of SECRET) if (rx.test(raw)) res.secrets.push(p.file + ' ' + rx);
      const body = JSON.parse(raw); const found = new Set(); walkKeys(body, found); if (found.size) res.forbidden.push(p.file + ': ' + [...found].join(','));
      return { meta: p, text: body.library.texts[0] };
    });
    const bySource = new Map();
    for (const b of bodies) { const k = b.meta.source_part_id || b.meta.part_id; if (!bySource.has(k)) bySource.set(k, []); bySource.get(k).push(b); }
    const regParts = (partsByWork.get(w.work_id) || []).filter((p) => p.status !== 'published');
    for (const rp of regParts) {
      const src = srcText(rp.archive, rp.text_id);
      const key = rp.passport.section_id || rp.text_id;
      const pub = bySource.get(key) || [];
      const moved = new Set((rp.rows_to_about || []).map((m) => m.order_index));
      const srcRows = (src.rows || []).filter((r, i) => !moved.has(Number.isFinite(Number(r.order_index)) ? Number(r.order_index) : i));
      res.moved_rows += moved.size;
      const pubRows = pub.flatMap((b) => b.text.rows.map((r) => ({ r, b })));
      res.source_rows += srcRows.length; res.public_rows += pubRows.length;
      if (srcRows.length !== pubRows.length) { res.row_mismatches.push({ work: w.work_id, part: key, source: srcRows.length, public: pubRows.length }); continue; }
      srcRows.forEach((r, i) => {
        if (rowSig(r) !== rowSig(pubRows[i].r)) res.row_mismatches.push({ work: w.work_id, part: key, row: i });
      });
      // AI glosses: source layer rows → same content row in the public body → identical glosses.
      const srcLayer = new Map(((src.word_gloss_ai_layer || {}).rows || []).map((l) => [l.order_index, l]));
      const pubLayer = new Map();
      for (const b of pub) for (const l of ((b.text.word_gloss_ai_layer || {}).rows || [])) pubLayer.set(b.text.rows[l.order_index], l);
      (src.rows || []).forEach((r, i) => {
        const order = Number.isFinite(Number(r.order_index)) ? Number(r.order_index) : i;
        const sl = srcLayer.get(order);
        if (!sl || moved.has(order)) return;
        res.source_glosses_rows++;
        const j = srcRows.indexOf(r);
        const target = pubRows[j] && pubRows[j].r;
        const pl = target && pubLayer.get(target);
        if (!pl) { res.glosses_lost.push({ work: w.work_id, part: key, row: order }); return; }
        if (glossSig(sl) !== glossSig(pl)) { res.glosses_changed.push({ work: w.work_id, part: key, row: order }); return; }
        const p = W.rowPayloadFromData(target);
        if (!p || p.key !== pl.key || p.words.length !== pl.glosses.length) { res.client_key_rejected++; return; }
        res.glosses_preserved++;
      });
    }
  }
  const ok = !res.row_mismatches.length && !res.glosses_lost.length && !res.glosses_changed.length && !res.client_key_rejected && !res.forbidden.length && !res.secrets.length;
  const outFile = path.join(args.candidate, 'independent-verification.json');
  fs.writeFileSync(outFile, JSON.stringify({ ok, ...res, row_mismatches: res.row_mismatches.slice(0, 50), glosses_lost: res.glosses_lost.slice(0, 50), glosses_changed: res.glosses_changed.slice(0, 50) }, null, 1));
  console.log(JSON.stringify({ ok, works: res.works, bodies: res.bodies, source_rows: res.source_rows, public_rows: res.public_rows, moved_rows: res.moved_rows,
    row_mismatches: res.row_mismatches.length, source_glosses_rows: res.source_glosses_rows, glosses_preserved: res.glosses_preserved,
    glosses_lost: res.glosses_lost.length, glosses_changed: res.glosses_changed.length, client_key_rejected: res.client_key_rejected,
    forbidden: res.forbidden.length, secrets: res.secrets.length }, null, 1));
  process.exitCode = ok ? 0 : 1;
}

main();
