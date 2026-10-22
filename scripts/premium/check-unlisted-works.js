#!/usr/bin/env node
'use strict';
// Per-work source status of catalog works absent from Ben-Yehuda's public-domain listing.
// Read-only and deliberately slow: one request every --delay-ms (default 4000); on HTTP 429 it waits for
// Retry-After (or 90 s) and retries the same work. Errors are re-checked on the next run; results resume.
// Rights are read from the work page's own rights badge (its help-link title), not from page-wide text:
//   «מה פירוש נחלת הכלל?» → public-domain · «מה פירוש ברשות פרסום?» → by-permission (still copyrighted).
// Usage: node check-unlisted-works.js --ids <json array file> --out <status json> [--delay-ms 4000]

const fs = require('fs');
const crypto = require('crypto');

const UA = 'LinguistPro-catalog-research/1 (read-only; rights and period check)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rightsOf(html) {
  const i = html.indexOf('copyright-icon');
  if (i < 0) return { rights: 'unknown', label: null };
  const block = html.slice(i, i + 3000);
  const title = (block.match(/title="([^"]*)"/) || [])[1] || '';
  const label = ((block.match(/href="#">([^<]*)<\/a>/) || [])[1] || '').trim();
  if (/נחלת הכלל/.test(title)) return { rights: 'public-domain', label };
  if (/ברשות/.test(title)) return { rights: 'by-permission', label };
  return { rights: 'other', label: label || title };
}

async function check(id) {
  const url = 'https://benyehuda.org/read/' + id;
  for (let attempt = 1; attempt <= 6; attempt++) {
    let r;
    try { r = await fetch(url, { headers: { 'User-Agent': UA } }); } catch (e) { await sleep(15000 * attempt); continue; }
    if (r.status === 429 || r.status >= 500) {
      const wait = Math.max(30, Number(r.headers.get('retry-after')) || 90) * 1000;
      process.stdout.write(`  ${id}: HTTP ${r.status}, waiting ${wait / 1000}s\n`);
      await sleep(wait); continue;
    }
    const base = { url, checked_at: new Date().toISOString(), http: r.status };
    if (r.status === 404) return { ...base, status: 'removed' };
    if (!r.ok) return { ...base, status: 'error' };
    const html = await r.text();
    const { rights, label } = rightsOf(html);
    return { ...base, status: rights === 'public-domain' ? 'public-domain-unlisted' : rights === 'by-permission' ? 'by-permission' : 'rights-' + rights,
      rights_label: label, sha256: crypto.createHash('sha256').update(html).digest('hex') };
  }
  return { url, checked_at: new Date().toISOString(), status: 'error', http: 'gave-up' };
}

async function main() {
  const args = {}; process.argv.slice(2).forEach((a, i, all) => { if (a.startsWith('--')) args[a.slice(2)] = all[i + 1]; });
  const ids = JSON.parse(fs.readFileSync(args.ids, 'utf8')).map(String);
  const out = fs.existsSync(args.out) ? JSON.parse(fs.readFileSync(args.out, 'utf8')) : {};
  const delay = Number(args['delay-ms'] || 4000);
  // Earlier fast-pass results with a guessed rights reading are re-checked too.
  const todo = ids.filter((id) => !out[id] || out[id].status === 'error' || out[id].status === 'not-public-domain' || !('rights_label' in out[id] || out[id].status === 'removed'));
  console.log(`checking ${todo.length} of ${ids.length}`);
  for (const id of todo) {
    out[id] = await check(id);
    fs.writeFileSync(args.out, JSON.stringify(out));
    await sleep(delay);
  }
  const c = {}; for (const v of Object.values(out)) c[v.status] = (c[v.status] || 0) + 1;
  console.log(JSON.stringify(c));
}

main().catch((e) => { console.error(e); process.exit(1); });
