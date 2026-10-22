#!/usr/bin/env node
'use strict';
// Official Ben-Yehuda period of every public-domain work, read from the site's own period filter
// (benyehuda.org/works?ckb_periods[]=<period>&ckb_intellectual_property[]=public_domain).
// Read-only, polite (one request at a time, pause between pages), resumable from its cache.
// Every page is kept as evidence: URL, fetch time, sha256 of the HTML and the work ids it listed.
// Usage: node fetch-official-periods.js --out <dir> [--delay-ms 1200] [--periods modern,ancient]

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PERIODS = ['ancient', 'medieval', 'enlightenment', 'revival', 'modern'];
const BASE = 'https://benyehuda.org/works';
const UA = 'LinguistPro-catalog-research/1 (read-only; periods of public-domain works)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function pageUrl(period, after) {
  const q = new URLSearchParams();
  if (period !== 'all') q.append('ckb_periods[]', period);   // 'all' = every public-domain work, with or without a period
  q.append('ckb_intellectual_property[]', 'public_domain');
  q.append('sort_by', 'alphabetical_asc');
  if (after) { q.append('search_after_value', after.title); q.append('search_after_id', after.id); q.append('page', String(after.page)); q.append('reverse', 'false'); }
  return BASE + '?' + q.toString();
}

// The listing renders each work as a link to /read/<id> with its title. Order on the page = sort order.
function parseListing(html) {
  const items = [];
  const seen = new Set();
  const re = /<a[^>]+href="\/read\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    const title = m[2].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (!seen.has(id) && title) { seen.add(id); items.push({ id, title }); }
  }
  // The site's own «next page» button carries the exact continuation key (its sort value, not the shown title).
  // Pick the forward button only: page 2+ also shows «first» and «previous» with the same class.
  const btn = [...html.matchAll(/<button([^>]*browse_paging[^>]*)>/g)].find((b) => /data-search-after-reverse="false"/.test(b[1]));
  const attr = (name) => { const m = btn && btn[1].match(new RegExp(name + '="([^"]*)"')); return m ? m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : null; };
  const next = btn && attr('data-search-after-id') ? { id: attr('data-search-after-id'), title: attr('data-search-after-value'), page: Number(attr('data-search-after-page')) } : null;
  const pagesTotal = (html.match(/דף\s+\d+\s+מתוך\s+(\d+)/) || [])[1];
  return { items, next, pagesTotal: pagesTotal ? Number(pagesTotal) : null };
}

async function fetchText(url) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) return await r.text();
      if (r.status === 429 || r.status >= 500) { await sleep(5000 * attempt); continue; }
      throw new Error('HTTP ' + r.status);
    } catch (e) { if (attempt === 4) throw e; await sleep(3000 * attempt); }
  }
}

async function crawlPeriod(period, outDir, delay) {
  const cacheFile = path.join(outDir, `period-${period}.json`);
  if (fs.existsSync(cacheFile)) { const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); if (c.complete) return c; }
  const pages = []; const ids = new Map();
  let after = null; let page = 1;
  for (;;) {
    const url = pageUrl(period, after);
    const html = await fetchText(url);
    const { items, next, pagesTotal } = parseListing(html);
    const fresh = items.filter((x) => !ids.has(x.id));
    pages.push({ page, url, fetched_at: new Date().toISOString(), sha256: sha(html), listed: items.length, new_ids: fresh.length });
    for (const x of fresh) ids.set(x.id, x.title);
    process.stdout.write(`${period} p${page}: ${items.length} listed, ${fresh.length} new, total ${ids.size}\n`);
    pages[pages.length - 1].pages_total = pagesTotal;
    if (!items.length || !next) break;                   // the site shows no «next page» button on the last page
    if (!fresh.length) throw new Error(period + ': page ' + page + ' repeated earlier works — continuation key not honoured');
    page = next.page; after = next;
    await sleep(delay);
  }
  const announced = pages[0] && pages[0].pages_total;
  if (announced && pages.length !== announced) throw new Error(`${period}: collected ${pages.length} pages, the site announced ${announced}`);
  const result = { period, complete: true, works: ids.size, pages, ids: [...ids.keys()] };
  fs.writeFileSync(cacheFile, JSON.stringify(result, null, 1));
  return result;
}

async function main() {
  const args = {}; process.argv.slice(2).forEach((a, i, all) => { if (a.startsWith('--')) args[a.slice(2)] = all[i + 1]; });
  if (!args.out) throw new Error('missing --out');
  fs.mkdirSync(args.out, { recursive: true });
  const delay = Number(args['delay-ms'] || 1200);
  const periods = args.periods ? String(args.periods).split(',') : PERIODS;
  if (args['all-public-domain']) {
    const all = await crawlPeriod('all', args.out, delay);
    console.log(JSON.stringify({ all_public_domain: all.works, pages: all.pages.length }));
    return;
  }
  const byWork = {}; const summary = {};
  for (const p of periods) {
    const res = await crawlPeriod(p, args.out, delay);
    summary[p] = { works: res.works, pages: res.pages.length };
    for (const id of res.ids) (byWork[id] = byWork[id] || []).push(p);
  }
  const multi = Object.entries(byWork).filter(([, v]) => v.length > 1);
  const out = { schema: 'benyehuda-official-periods-v1', fetched_at: new Date().toISOString(), source: BASE + ' (ckb_periods filter, public_domain)',
    summary, works: Object.keys(byWork).length, works_in_several_periods: multi.length, periods: byWork };
  fs.writeFileSync(path.join(args.out, 'official-periods.json'), JSON.stringify(out));
  console.log(JSON.stringify({ summary, works: out.works, works_in_several_periods: multi.length }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
