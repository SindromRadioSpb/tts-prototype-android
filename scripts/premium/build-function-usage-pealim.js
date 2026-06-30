#!/usr/bin/env node
/**
 * build-function-usage-pealim.js — enrich the curated function-usage store with the
 * VERIFIED Pealim sense-id per entry (Epic-3b follow-up; fixes the homograph link bug
 * + enables the declension table).
 *
 * Why: the offline function-link map keyed Pealim ids by niqqud-stripped surface and
 * picked the WRONG homograph for some particles (אל → 5261 אַל «не», not 2682 אֶל «к»).
 * Here we resolve, from the offline Pealim dataset, the id whose lemma_niqqud + sense
 * is the FUNCTION-WORD reading — preferring the candidate that carries a pronominal
 * declension (P-* cells), which is exactly the preposition/existential sense.
 *
 * Output: adds per entry  pealim_id, pealim_url, declension(bool)  to
 *   public/data/usage/function-usage.v1.json  (idempotent — re-runnable).
 * Entries with NO function sense in the dataset (זו demonstrative ≠ זוּ relative; כל
 * absent) get NO id → the card honestly falls back to Pealim search.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const STORE = path.join(ROOT, 'public', 'data', 'usage', 'function-usage.v1.json');
const DICT = path.join(ROOT, 'public', 'data', 'inflection', 'pealim-infl-v12.json.gz');

const strip = (s) => String(s == null ? '' : s).replace(/[֑-ׇ]/g, '');
const pronCells = (c) => Object.keys(c || {}).filter((k) => /^P-/.test(k)).length;

// Particles whose FUNCTION sense is NOT in the offline dataset → link via search, no
// homograph direct-id. Documented so it is a conscious choice, not an omission.
const SEARCH_ONLY = {
  'זו': 'dataset has only זוּ (archaic relative); card sense is demonstrative זוֹ',
  'כל': 'no כֹּל paradigm in the offline dataset',
};

function main() {
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(DICT)).toString('utf8'));
  const pars = ds.paradigms;
  const byId = {};
  const byStrip = {};
  for (const p of pars) {
    byId[String(p.pealim_id)] = p;
    const k = strip(p.lemma_niqqud || p.lemma);
    (byStrip[k] = byStrip[k] || []).push(p);
  }

  // resolve the function-sense id for a key
  function resolve(w) {
    if (SEARCH_ONLY[w]) return { id: null, reason: SEARCH_ONLY[w] };
    const cands = byStrip[w] || [];
    const decl = cands.filter((p) => pronCells(p.cells) >= 6);
    if (decl.length === 1) return { id: decl[0].pealim_id, declension: true };
    if (decl.length > 1) return { id: decl[0].pealim_id, declension: true, ambiguous: true };
    const fn = cands.filter((p) => ['other', 'conjunction', 'pronoun', 'preposition', 'particle'].includes(p.pos));
    if (fn.length >= 1) return { id: fn[0].pealim_id, declension: false, ambiguous: fn.length > 1 };
    return { id: null, reason: 'no function sense in dataset' };
  }

  const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const report = [];
  for (const w of Object.keys(store.usage)) {
    const e = store.usage[w];
    // single-letter proclitics are Phase-2 (not reachable yet) — skip enrichment
    if (w.length === 1) { delete e.pealim_id; delete e.pealim_url; delete e.declension; continue; }
    const r = resolve(w);
    if (r.id) {
      const p = byId[r.id];
      e.pealim_id = String(r.id);
      e.pealim_url = p.pealim_url || ('https://www.pealim.com/ru/dict/' + r.id + '/');
      e.declension = !!r.declension;
      report.push(`${w} → ${r.id} (${p.lemma_niqqud})${r.declension ? ' [decl]' : ''}${r.ambiguous ? ' AMB' : ''}`);
    } else {
      delete e.pealim_id; delete e.pealim_url; delete e.declension;
      report.push(`${w} → search (${r.reason})`);
    }
  }
  store.pealim_enriched = true;
  fs.writeFileSync(STORE, JSON.stringify(store) + '\n', 'utf8');
  console.log('[fn-usage-pealim] enriched ' + Object.keys(store.usage).length + ' entries:');
  report.forEach((l) => console.log('  ' + l));
}

main();
