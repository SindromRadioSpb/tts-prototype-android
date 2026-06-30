#!/usr/bin/env node
/**
 * function-usage-smoke.js — Epic-3b gate for the curated function-word USAGE feature.
 *
 * Validates (R1/R9 honesty):
 *  - the live store schema + every entry's required fields + curated provenance/curator;
 *  - keys are niqqud-stripped; no DRAFT cruft (_review / confidence) leaked into the live store;
 *  - REACHABILITY is recomputed INDEPENDENTLY from reader-morph's FUNCTION_GLOSS (not the
 *    store's own claim): every standalone key must be in FUNCTION_GLOSS (so it renders on tap),
 *    and the only unreachable keys are exactly the single-letter proclitics (documented Phase-2);
 *  - the render + honesty-gate plumbing exists in reader-morph.js;
 *  - the loader exposes its API + the wiring (script tags, SW precache) is in place.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

const NIQQUD = /[֑-ׇ]/;
const PROCLITICS = new Set(['ה', 'ב', 'ל', 'ו', 'מ', 'כ', 'ש']);
const REQUIRED = ['lemma', 'pos', 'role', 'governs', 'position', 'pitfalls', 'register', 'examples'];

// ── 1. store ────────────────────────────────────────────────────────────────
const store = JSON.parse(rd('public/data/usage/function-usage.v1.json'));
ok(store.schema === 1 && store.version === 1, 'store schema/version = 1');
ok(store.provenance === 'curated', 'store provenance = curated');
ok(store.usage && typeof store.usage === 'object', 'store has usage map');
const keys = Object.keys(store.usage);
ok(keys.length >= 25, `store has >=25 entries (got ${keys.length})`);
ok(store.count === keys.length, 'store.count matches entry count');

for (const k of keys) {
  const e = store.usage[k];
  ok(!NIQQUD.test(k), `key "${k}" is niqqud-stripped`);
  for (const f of REQUIRED) ok(e[f] != null && e[f] !== '', `${k}.${f} present`);
  ok(Array.isArray(e.examples) && e.examples.length >= 1, `${k} has >=1 example`);
  for (const ex of e.examples) ok(ex.he && typeof ex.he === 'string', `${k} example has Hebrew`);
  ok(e.provenance === 'curated', `${k} provenance = curated`);
  ok(typeof e.curator === 'string' && e.curator.length > 0, `${k} has a curator`);
  // R9/R1 — no DRAFT cruft leaked into the live store
  ok(!('_review' in e), `${k} has no leaked _review`);
  ok(!('confidence' in e), `${k} has no leaked confidence`);
  ok(!/DRAFT/i.test(e.curator), `${k} curator is not a DRAFT placeholder`);
  // government, NOT case: never ASSERT Hebrew has падежи (analogy in «…» is fine)
  ok(!/иврит[^.]*падеж/i.test(JSON.stringify(e)), `${k} does not assert Hebrew case`);
}

// ── 2. INDEPENDENT reachability oracle (from reader-morph FUNCTION_GLOSS) ──────
const rm = rd('public/js/reader-morph.js');
const fgBlock = (rm.match(/var FUNCTION_GLOSS = \{([\s\S]*?)\n {2}\};/) || [, ''])[1];
const fgKeys = new Set();
let m; const re = /"([^"]+)"\s*:/g;
while ((m = re.exec(fgBlock))) fgKeys.add(m[1]);
ok(fgKeys.size > 100, `parsed FUNCTION_GLOSS (${fgKeys.size} keys)`);

const reachable = keys.filter((k) => fgKeys.has(k));
const unreachable = keys.filter((k) => !fgKeys.has(k));
ok(reachable.length >= 25, `>=25 keys reachable via FUNCTION_GLOSS (got ${reachable.length})`);
// the ONLY unreachable keys may be single-letter proclitics (documented Phase-2)
for (const k of unreachable) ok(PROCLITICS.has(k), `unreachable key "${k}" is a known proclitic (Phase-2), not an orphan`);

// ── 3. render + honesty-gate plumbing in reader-morph.js ──────────────────────
ok(/function usageHtml\(card\)/.test(rm), 'reader-morph has usageHtml renderer');
ok(/\+ usageHtml\(card\) \+/.test(rm), 'usageHtml is composed into the card');
ok(/card\.functionWord && !\(card\.contextPos && card\.contextPos !== card\.pos\)/.test(rm),
  'usage honesty-gate: functionWord AND not Dicta-disputed POS');
ok(/window\.FunctionUsage\.lookup/.test(rm), 'reader-morph looks up FunctionUsage');
ok(/window\.FunctionUsage\.ensureReady/.test(rm), 'reader-morph warms FunctionUsage');

// ── 4. loader API + wiring ────────────────────────────────────────────────────
const loader = rd('public/js/function-usage.js');
ok(/window\.FunctionUsage = \{/.test(loader), 'loader exposes window.FunctionUsage');
for (const fn of ['ensureReady', 'lookup', 'isReady']) ok(loader.includes(fn + ':'), `loader exposes ${fn}`);
ok(/\/data\/usage\/function-usage\.v1\.json\?rev=/.test(loader), 'loader fetches the versioned store');

for (const html of ['public/library.html', 'public/index.html']) {
  ok(/<script src="\/js\/function-usage\.js"><\/script>/.test(rd(html)), `${html} script-tags the loader`);
}
ok(/"\/js\/function-usage\.js"/.test(rd('public/sw.js')), 'sw precaches the loader');
ok(/CACHE_VERSION = "v3\.11\.64"/.test(rd('public/sw.js')), 'sw CACHE_VERSION bumped to v3.11.64');

console.log(`function-usage-smoke: ${pass} checks passed | ${keys.length} entries, ${reachable.length} reachable, ${unreachable.length} Phase-2 (${unreachable.join('')})`);
