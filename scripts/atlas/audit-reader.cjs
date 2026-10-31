#!/usr/bin/env node
'use strict';
// Quality audit of the atlas reader data and of the page the reader builds from it.
// Checklist: docs/planning/ENGINEERING_ATLAS_QUALITY_STANDARD.md (rule numbers below match it).
// Usage: node scripts/atlas/audit-reader.cjs <dir with sections/*.json or sec-*.json> [--json out.json]
const fs = require('fs');
const path = require('path');
const { parseHTML } = require('linkedom');
const api = require('../../public/js/atlas-reader.js');

const dir = process.argv[2];
if (!dir) { console.error('usage: audit-reader.cjs <dir> [--json out.json]'); process.exit(2); }
const jsonOut = process.argv.indexOf('--json') > 0 ? process.argv[process.argv.indexOf('--json') + 1] : null;
const files = (fs.existsSync(path.join(dir, 'sections')) ? fs.readdirSync(path.join(dir, 'sections')).map((f) => path.join(dir, 'sections', f))
  : fs.readdirSync(dir).filter((f) => /^sec-.*\.json$/.test(f)).map((f) => path.join(dir, f))).sort();

const PIPELINE = /редакционн|редакторск|bbox|source_text|jsonl|описание пиктограммы|печатной текстовой подписи нет|\bnull\b|undefined|\[object Object\]/i;
const RAW_TEX = /\\(?:frac|tau|sigma|alpha|beta|cdot|sqrt|mathrm|text|left|right|Delta|pi|mu|varphi|phi|omega|lambda)\b|[_^]\{/;

const findings = [];
function add(level, rule, sec, page, what) { findings.push({ level, rule, sec, page, what }); }

const { document } = parseHTML('<!doctype html><html><body></body></html>');
const R = api.factory(document);
const T = (k, fb) => fb;

for (const file of files) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const p of d.pages) {
    const where = (o) => o && o.id ? o.id.split(':').pop() : '';
    // ---- data-level checks ----
    const seen = {};
    p.items.forEach((it, i) => {
      if (it.type === 'formula') {
        if (!it.mathml && !it.latex && !it.source_text) add('A', '1.4', d.id, p.page, 'formula without content ' + where(it));
        return;
      }
      const he = it.he || it.he_raw || '';
      if (!he.trim()) add('A', '1.7', d.id, p.page, 'empty text block ' + where(it));
      if (!it.ru && d.translated) add('B', '1.6', d.id, p.page, 'block without translation ' + where(it) + ' «' + he.slice(0, 40) + '»');
      for (const [field, val] of [['ru', it.ru], ['he', it.he], ['niqqud', it.he_niqqud], ['translit', it.translit], ['note', it.ambiguity_note]]) {
        if (!val) continue;
        if (PIPELINE.test(val)) add('A', '4.3', d.id, p.page, 'supplier/pipeline words in ' + field + ' ' + where(it) + ': «' + val.match(PIPELINE)[0] + '»');
        if (RAW_TEX.test(val)) add('A', '4.4', d.id, p.page, 'raw LaTeX in ' + field + ' ' + where(it) + ': «' + val.slice(0, 50) + '»');
      }
      const key = (he || '').replace(/[\u0591-\u05C7\s]/g, '');
      if (key.length > 12 && seen[key] != null && seen[key] === i - 1 && !R.layoutPage(p).duplicate[i]) add('B', '1.1', d.id, p.page, 'block repeated twice in a row ' + where(it));
      seen[key] = i;
    });
    (p.figures || []).forEach((f) => {
      const w = f.bbox[2] - f.bbox[0], h = f.bbox[3] - f.bbox[1];
      if ((w < 5 || h < 5) && R.markKindOf(f) !== 'junk') add('A', '1.7', d.id, p.page, 'figure ' + where(f) + ' is ' + Math.round(w) + '×' + Math.round(h));
      if (!f.crop) add('A', '1.2', d.id, p.page, 'figure without image ' + where(f));
      (f.regions || []).forEach((r) => {
        for (const val of [r.label_ru, r.label_he]) {
          if (val && RAW_TEX.test(val)) add('A', '4.4', d.id, p.page, 'raw LaTeX in figure label ' + where(f) + ': «' + val.slice(0, 40) + '»');
        }
      });
      if (f.number != null && !(f.caption_he || f.caption_ru)) add('B', '1.2', d.id, p.page, 'numbered figure ' + f.number + ' without caption');
    });
    (p.tables || []).forEach((t) => {
      const filled = (t.cells || []).filter((c) => (c.ru || c.he || '').trim());
      if (!filled.length) add('A', '1.3', d.id, p.page, 'empty table ' + where(t));
    });
    // ---- page as the reader builds it ----
    const el = R.renderPage(T, p, {});
    // what the reader sees: editor notes, formula sources and book crops are not reading text
    const shown = el.cloneNode(true);
    // errata explain a proposed correction to the editor-in-chief («редакционная гипотеза») and stay as they are
    shown.querySelectorAll('.atlas-editor, .atlas-math, .atlas-latex, .atlas-orig, .atlas-erratum').forEach((n) => n.remove());
    const text = shown.textContent;
    const bad = text.match(/undefined|\[object Object\]|\bNaN\b/);
    if (bad) add('A', '4.5', d.id, p.page, 'rendered page shows ' + bad[0]);
    const meta = text.match(/[^.;]{0,30}(?:редакционн|редакторск|печатной текстовой подписи нет|source_text|bbox|jsonl)[^.;]{0,20}/i);
    if (meta) add('A', '4.3', d.id, p.page, 'supplier words on screen: «' + meta[0].trim() + '»');
    el.querySelectorAll('.atlas-table td, .atlas-regions li, figcaption, .atlas-ru').forEach((n) => {
      if (/\\[A-Za-z]{2,}/.test(n.textContent)) add('A', '4.4', d.id, p.page, 'raw LaTeX on screen: «' + n.textContent.trim().slice(0, 40) + '»');
    });
    el.querySelectorAll('figure.atlas-fig').forEach((fig) => {
      const labels = [...fig.querySelectorAll('.atlas-regions li')].map((li) => li.textContent.replace(/^\s*\d+\s*/, '').trim());
      const dup = labels.length - new Set(labels).size;
      if (dup >= 2) add('B', '6.2', d.id, p.page, 'legend repeats ' + dup + ' of ' + labels.length + ' labels (' + fig.getAttribute('data-ref').split(':').pop() + ')');
      fig.querySelectorAll('.atlas-regions li').forEach((li) => { if (!li.textContent.replace(/^\s*\d+\s*/, '').trim()) add('A', '1.7', d.id, p.page, 'empty legend line'); });
    });
    el.querySelectorAll('figure.atlas-fig:not(.atlas-chipfig)').forEach((fig) => {
      const id = fig.getAttribute('data-ref');
      const f = p.figures.find((x) => x.id === id);
      if (f && f.number == null && (f.bbox[2] - f.bbox[0]) <= 60 && (f.bbox[3] - f.bbox[1]) <= 60 && f.regions.length <= 1)
        add('B', '3.2', d.id, p.page, 'small unnumbered picture shown as a figure ' + id.split(':').pop() + ' «' + ((f.regions[0] || {}).label_ru || '').slice(0, 40) + '»');
    });
  }
}

const by = {};
findings.forEach((f) => { const k = f.level + ' ' + f.rule; by[k] = (by[k] || 0) + 1; });
console.log('sections', files.length, 'findings', findings.length);
Object.keys(by).sort().forEach((k) => console.log('  ' + k + ': ' + by[k]));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(findings, null, 1));
process.exitCode = findings.some((f) => f.level === 'A') ? 1 : 0;
