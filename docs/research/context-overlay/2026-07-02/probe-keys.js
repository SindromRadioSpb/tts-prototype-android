#!/usr/bin/env node
"use strict";
// R10 adversarial probes for build-context-overlay keying/replay.
const fs = require("fs");
const path = require("path");
const REPO = "E:/projects/tts-prototype-android";
const RM = require(path.join(REPO, "public", "js", "reader-morph.js"));
const strip = RM.stripNiqqud;
const WORKS = path.join(REPO, "public/data/benyehuda/works");
const CACHE = path.join(REPO, ".tmp/benyehuda/proclitic-overlay-dicta-cache.json");

const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
function tokenForCached(toks, s) {
  for (const t of toks) if (strip(t.word) === s || t.stem === s) return t;
  return null;
}

const st = {
  works: 0, rows: 0, rowsCached: 0, rowsNoNiq: 0, rowsWithNiq: 0,
  // A: runtime he-column key vs producer (niq-token) key
  pairs: 0, pairMaleNeChaser: 0, pairNoNiq: 0,
  // token-count drift between plain and niq tokenization
  rowsTokCountDiff: 0,
  // B: producer match decomposition (rows with niq only)
  prodToks: 0, prodMatched: 0, prodUnmatched: 0, prodUnmatchedButPlainMatches: 0,
  // C: same skeleton, different vocalization inside one row
  rowsHomogSameSkelDiffVoc: 0, toksHomogSameSkelDiffVoc: 0,
  exMale: [], exRecov: [], exHomog: [],
};

const files = fs.readdirSync(WORKS).filter((f) => /^[A-Za-z0-9_-]{1,40}\.json$/.test(f));
for (const f of files) {
  let w; try { w = JSON.parse(fs.readFileSync(path.join(WORKS, f), "utf8")); } catch (_) { continue; }
  st.works++;
  for (const tx of (w.library && w.library.texts) || []) {
    for (const r of tx.rows || []) {
      const plain = String(r.hebrew_plain || "").trim();
      if (!plain || !/[א-ת]/.test(plain)) continue;
      st.rows++;
      const toks = cache[plain];
      const cached = !!(toks && toks.length);
      if (cached) st.rowsCached++;
      const niq = String(r.hebrew_niqqud || "");
      if (!niq.trim()) { if (cached) st.rowsNoNiq++; continue; }
      if (cached) st.rowsWithNiq++;

      // A: what the runtime he-column produces
      const aligned = RM.alignSurfaceNiqqud(plain, niq);
      const plainWords = RM.words(plain);
      const niqWords = RM.words(niq);
      if (plainWords.length !== niqWords.length && cached) st.rowsTokCountDiff++;
      if (cached) {
        for (const p of aligned) {
          st.pairs++;
          if (!p.niqqud) { st.pairNoNiq++; continue; }
          if (strip(p.niqqud) !== p.surface) {
            st.pairMaleNeChaser++;
            if (st.exMale.length < 12) st.exMale.push(p.surface + " ≠ " + strip(p.niqqud));
          }
        }
      }

      // B: producer-side matching (mirror replayWork) — rows with cache only
      if (cached) {
        const wordToks = RM.tokenize(niq).filter((x) => x.isWord);
        const seen = new Set();
        // map niq-token index -> aligned plain surface (positional, mirrors wIdx pairing in niq col? producer has no pairing; approximate via alignSurfaceNiqqud inverse)
        // build skeleton->plain lookup from aligned pairs
        const chaser2plain = new Map();
        for (const p of aligned) if (p.niqqud) { const c = strip(p.niqqud); if (!chaser2plain.has(c)) chaser2plain.set(c, p.surface); }
        for (const tk of wordToks) {
          const s = strip(tk.text);
          if (!s || seen.has(s)) continue;
          seen.add(s);
          st.prodToks++;
          const dt = tokenForCached(toks, s);
          if (dt) { st.prodMatched++; continue; }
          st.prodUnmatched++;
          const pl = chaser2plain.get(s);
          if (pl && pl !== s && tokenForCached(toks, pl)) {
            st.prodUnmatchedButPlainMatches++;
            if (st.exRecov.length < 12) st.exRecov.push(s + " → " + pl);
          }
        }
        // C: same skeleton twice with different vocalization
        const bySkel = new Map();
        for (const tk of wordToks) {
          const s = strip(tk.text);
          if (!s) continue;
          if (!bySkel.has(s)) bySkel.set(s, new Set());
          bySkel.get(s).add(tk.text);
        }
        let hit = 0;
        for (const [s, set] of bySkel) if (set.size > 1) { hit++; if (st.exHomog.length < 8) st.exHomog.push(s + ": " + Array.from(set).join(" / ")); }
        if (hit) { st.rowsHomogSameSkelDiffVoc++; st.toksHomogSameSkelDiffVoc += hit; }
      }
    }
  }
}
st.exMale = st.exMale.slice(0, 12);
console.log(JSON.stringify(st, (k, v) => v instanceof Set ? Array.from(v) : v, 2));
console.log("A: he-column runtime key ≠ producer key rate (of vocalized pairs): " +
  (100 * st.pairMaleNeChaser / Math.max(1, st.pairs - st.pairNoNiq)).toFixed(2) + "%");
console.log("A2: pairs with NO runtime niqqud (align fail / partial coverage): " +
  (100 * st.pairNoNiq / Math.max(1, st.pairs)).toFixed(2) + "%");
console.log("B: producer unmatched " + st.prodUnmatched + "/" + st.prodToks + " (" + (100 * st.prodUnmatched / Math.max(1, st.prodToks)).toFixed(2) + "%), of which plain-key WOULD match: " + st.prodUnmatchedButPlainMatches);
console.log("D-class: cached rows with EMPTY niqqud (replay uses bare plain as n0): " + st.rowsNoNiq + "/" + st.rowsCached);
