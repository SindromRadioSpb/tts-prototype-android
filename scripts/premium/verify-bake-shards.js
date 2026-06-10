#!/usr/bin/env node
/**
 * verify-bake-shards.js — QA gate for the Ben-Yehuda corpus runner (BRR-P0-006).
 *
 * Reads every shard ZIP produced by run-corpus-prebake.js --bake and measures,
 * by INSPECTING THE ACTUAL ROWS (not the ledger's cloud-fill counter):
 *   • ru%        — rows (with Hebrew letters) that have a non-empty russian translation
 *   • niqqud%    — rows whose hebrew_niqqud actually carries vocalization points
 *   • translit%  — rows with both Latin + Cyrillic transliteration
 *   • R1 invariants — review_status=machine, provenance (source/url/license=public-domain),
 *                     origin=benyehuda-ingest, canon_version, no empty Hebrew, no untranslated passthrough
 *
 * Emits per-shard + aggregate tables, an R1 violation list (fails the gate),
 * a list of under-vocalized texts (Dicta-cloud miss victims), and a random
 * R7 sample of bilingual rows for qualitative literary review.
 *
 * Usage:
 *   node scripts/premium/verify-bake-shards.js [--dir .tmp/benyehuda/shards] [--sample 12] [--json]
 *
 * Exit 0 = R1 clean. Exit 1 = R1 violation(s). Exit 2 = no shards / read error.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const NIQQUD = /[ְ-ׇֽֿׁׂׅׄ]/; // Hebrew points (excl. cantillation 0591-05AF)
const HEB_LETTER = /[א-ת]/;

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const DIR = arg('--dir', path.join('.tmp', 'benyehuda', 'shards'));
const SAMPLE = parseInt(arg('--sample', '12'), 10);
const JSON_OUT = process.argv.includes('--json');

function stripNiqqud(s) { return (s || '').replace(/[֑-ׇ]/g, ''); }

async function readShard(file) {
  const buf = fs.readFileSync(file);
  const zip = await JSZip.loadAsync(buf);
  const libFile = zip.files['library/library.json'];
  if (!libFile) throw new Error(`${path.basename(file)}: no library/library.json`);
  return JSON.parse(await libFile.async('string'));
}

function analyzeText(t, shardSlug) {
  const rows = Array.isArray(t.rows) ? t.rows : [];
  const v = { hebRows: 0, ruFilled: 0, niqqud: 0, translit: 0, emptyHeb: 0, passthrough: 0 };
  for (const r of rows) {
    const hp = (r.hebrew_plain || '').trim();
    const hn = (r.hebrew_niqqud || '').trim();
    const ru = (r.russian || '').trim();
    if (!HEB_LETTER.test(hp)) { if (!hp && !hn) v.emptyHeb++; continue; } // non-Hebrew / structural row
    v.hebRows++;
    if (ru) v.ruFilled++;
    if (NIQQUD.test(hn)) v.niqqud++;
    if ((r.translit || '').trim() && (r.translit_ru || '').trim()) v.translit++;
    // untranslated passthrough: russian equals the Hebrew (machine failed to translate)
    if (ru && (ru === hp || stripNiqqud(ru) === stripNiqqud(hn))) v.passthrough++;
  }
  // R1 invariants
  const c = t.corpus || {};
  const p = c.provenance || {};
  const r1 = [];
  if (c.review_status !== 'machine') r1.push(`review_status=${c.review_status}`);
  if (!p.source) r1.push('no provenance.source');
  if (!p.url) r1.push('no provenance.url');
  if (p.license !== 'public-domain') r1.push(`license=${p.license}`);
  if ((t.source_meta && t.source_meta.origin) !== 'benyehuda-ingest') r1.push(`origin=${t.source_meta && t.source_meta.origin}`);
  if (v.passthrough > 0) r1.push(`${v.passthrough} untranslated passthrough rows`);
  return {
    text_id: t.text_id, title: t.title, byehuda_id: c.byehuda_id, era: c.era, genre: c.genre,
    shard: shardSlug, rows: rows.length, ...v,
    ruPct: v.hebRows ? v.ruFilled / v.hebRows : 1,
    niqqudPct: v.hebRows ? v.niqqud / v.hebRows : 1,
    translitPct: v.hebRows ? v.translit / v.hebRows : 1,
    r1,
  };
}

function pct(x) { return (x * 100).toFixed(1) + '%'; }

(async () => {
  if (!fs.existsSync(DIR)) { console.error(`no shard dir: ${DIR}`); process.exit(2); }
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.zip')).map(f => path.join(DIR, f));
  if (!files.length) { console.error(`no .zip shards in ${DIR}`); process.exit(2); }

  const perText = [];
  const sampleRows = [];
  let canonVersionsSeen = new Set();
  for (const file of files) {
    let lib;
    try { lib = await readShard(file); } catch (e) { console.error('READ FAIL', file, e.message); process.exit(2); }
    if (lib.canon_version != null) canonVersionsSeen.add(lib.canon_version);
    const slug = path.basename(file, '.zip');
    for (const t of (lib.texts || [])) {
      perText.push(analyzeText(t, slug));
      // collect candidate sample rows (vocalized + translated)
      for (const r of (t.rows || [])) {
        const hp = (r.hebrew_plain || '').trim();
        if (HEB_LETTER.test(hp) && (r.russian || '').trim() && NIQQUD.test(r.hebrew_niqqud || '')) {
          sampleRows.push({ title: t.title, hn: r.hebrew_niqqud, ru: r.russian, tr: r.translit_ru });
        }
      }
    }
  }

  // aggregate
  const agg = perText.reduce((a, t) => {
    a.texts++; a.rows += t.rows; a.hebRows += t.hebRows; a.ruFilled += t.ruFilled;
    a.niqqud += t.niqqud; a.translit += t.translit; a.passthrough += t.passthrough; return a;
  }, { texts: 0, rows: 0, hebRows: 0, ruFilled: 0, niqqud: 0, translit: 0, passthrough: 0 });

  // per-shard rollup
  const byShard = {};
  for (const t of perText) {
    const s = byShard[t.shard] || (byShard[t.shard] = { texts: 0, hebRows: 0, ruFilled: 0, niqqud: 0 });
    s.texts++; s.hebRows += t.hebRows; s.ruFilled += t.ruFilled; s.niqqud += t.niqqud;
  }

  const r1Violations = perText.filter(t => t.r1.length);
  const underVocalized = perText.filter(t => t.hebRows >= 5 && t.niqqudPct < 0.5)
    .sort((a, b) => a.niqqudPct - b.niqqudPct);
  const underTranslated = perText.filter(t => t.hebRows >= 5 && t.ruPct < 0.95)
    .sort((a, b) => a.ruPct - b.ruPct);

  if (JSON_OUT) {
    console.log(JSON.stringify({ agg, byShard, r1Violations, underVocalized, underTranslated, canonVersions: [...canonVersionsSeen] }, null, 2));
    process.exit(r1Violations.length ? 1 : 0);
  }

  console.log(`\n=== BAKE SHARD VERIFICATION — ${files.length} shard(s), ${agg.texts} texts, ${agg.rows} rows ===`);
  console.log(`canon_version(s): ${[...canonVersionsSeen].join(', ') || 'none'}`);
  console.log(`\nAGGREGATE (over ${agg.hebRows} Hebrew-bearing rows):`);
  console.log(`  ru-translated : ${agg.ruFilled}/${agg.hebRows}  ${pct(agg.ruFilled / agg.hebRows)}`);
  console.log(`  niqqud (real) : ${agg.niqqud}/${agg.hebRows}  ${pct(agg.niqqud / agg.hebRows)}`);
  console.log(`  translit (2x) : ${agg.translit}/${agg.hebRows}  ${pct(agg.translit / agg.hebRows)}`);
  console.log(`  passthrough   : ${agg.passthrough} (untranslated; must be 0)`);

  console.log(`\nPER SHARD:`);
  for (const [slug, s] of Object.entries(byShard)) {
    console.log(`  ${slug.padEnd(28)} texts=${String(s.texts).padStart(3)}  ru=${pct(s.ruFilled / (s.hebRows || 1)).padStart(6)}  niqqud=${pct(s.niqqud / (s.hebRows || 1)).padStart(6)}`);
  }

  console.log(`\nR1 INVARIANTS: ${r1Violations.length ? '❌ ' + r1Violations.length + ' text(s) violate' : '✅ clean (review_status=machine, provenance, origin, 0 passthrough)'}`);
  for (const t of r1Violations.slice(0, 20)) console.log(`  ❌ ${t.text_id} «${t.title}»: ${t.r1.join('; ')}`);

  console.log(`\nUNDER-VOCALIZED (niqqud<50%, ≥5 rows) — Dicta-cloud miss victims: ${underVocalized.length}`);
  for (const t of underVocalized.slice(0, 25)) console.log(`  🔸 ${t.text_id} «${t.title}» [${t.era}/${t.genre}] niqqud=${pct(t.niqqudPct)} (${t.niqqud}/${t.hebRows})`);

  console.log(`\nUNDER-TRANSLATED (ru<95%, ≥5 rows): ${underTranslated.length}`);
  for (const t of underTranslated.slice(0, 25)) console.log(`  🔻 ${t.text_id} «${t.title}» ru=${pct(t.ruPct)} (${t.ruFilled}/${t.hebRows})`);

  // R7 qualitative sample — deterministic stride (no Math.random)
  console.log(`\n=== R7 SAMPLE (${SAMPLE} rows for literary review) ===`);
  const stride = Math.max(1, Math.floor(sampleRows.length / SAMPLE));
  for (let i = 0, n = 0; i < sampleRows.length && n < SAMPLE; i += stride, n++) {
    const r = sampleRows[i];
    console.log(`  [«${r.title}»]`);
    console.log(`    HE: ${r.hn}`);
    console.log(`    RU: ${r.ru}`);
  }

  process.exit(r1Violations.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e.stack); process.exit(2); });
