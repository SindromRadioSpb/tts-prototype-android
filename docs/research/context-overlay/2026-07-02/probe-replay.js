#!/usr/bin/env node
"use strict";
// Probe D: bake-vs-runtime OFFLINE-BASELINE divergence on niqqud-less rows.
// Producer: resolveCore(eng, surface, plainWord)  [n0 = bare consonantal token]
// Runtime:  resolveCore(eng, surface, "")         [data-niqqud="" on such rows]
// Count label/pid/selection differences.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const REPO = "E:/projects/tts-prototype-android";
const RM = require(path.join(REPO, "public", "js", "reader-morph.js"));
const NA = require(path.join(REPO, "public", "js", "notes-autogen.js"));
const strip = RM.stripNiqqud;

const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, "public/data/inflection/pealim-infl-v12.json.gz"))).toString("utf8"));
const maps = NA.buildResolverMaps(ds.paradigms);
const pidMap = new Map();
for (const p of ds.paradigms) if (p && p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p);
const lookup = (k, b) => { const ix = ds.index[String(k) + " " + String(b || "")]; return (ix != null && ds.paradigms[ix]) ? ds.paradigms[ix] : null; };
const eng = { NA, maps, pidMap, lookup, rootIndex: new Map(), procLex: null };

const WORKS = path.join(REPO, "public/data/benyehuda/works");
const CACHE = path.join(REPO, ".tmp/benyehuda/proclitic-overlay-dicta-cache.json");
const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
const CONTENT_POS = new Set(["noun", "verb", "adjective"]);
function tokenForCached(toks, s) { for (const t of toks) if (strip(t.word) === s || t.stem === s) return t; return null; }

(async () => {
  const st = { rowsNoNiq: 0, rowsNiqNoTok: 0, toks: 0, cardDiff: 0, labelDiff: 0, selDiff: 0, ex: [] };
  const files = fs.readdirSync(WORKS).filter((f) => /^[A-Za-z0-9_-]{1,40}\.json$/.test(f));
  let budget = 4000;
  outer:
  for (const f of files) {
    let w; try { w = JSON.parse(fs.readFileSync(path.join(WORKS, f), "utf8")); } catch (_) { continue; }
    for (const tx of (w.library && w.library.texts) || []) {
      for (const r of tx.rows || []) {
        const plain = String(r.hebrew_plain || "").trim();
        if (!plain || !/[א-ת]/.test(plain)) continue;
        const toks = cache[plain];
        if (!toks || !toks.length) continue;
        const niq = String(r.hebrew_niqqud || "");
        // count "niq truthy but yields no word tokens" hazard
        if (niq && !RM.tokenize(niq).some((x) => x.isWord)) { st.rowsNiqNoTok++; continue; }
        if (niq.trim()) continue;      // this probe: niq-less rows only
        st.rowsNoNiq++;
        const wordToks = RM.tokenize(plain).filter((x) => x.isWord);
        const seen = new Set();
        for (const tk of wordToks) {
          const s = strip(tk.text);
          if (!s || seen.has(s)) continue;
          seen.add(s);
          const dt = tokenForCached(toks, s);
          if (!dt) continue;
          st.toks++;
          let offBake, offRun;
          try { offBake = await RM.resolveCore(eng, s, tk.text); offRun = await RM.resolveCore(eng, s, ""); } catch (_) { continue; }
          const key = (o) => o.label + "|" + (o.pealim_id || "") + "|" + (o.ambiguous ? 1 : 0) + "|" + (o.meaning || "");
          if (key(offBake) !== key(offRun)) {
            st.cardDiff++;
            if (offBake.label !== offRun.label) st.labelDiff++;
            const decide = (off) => {
              let cx = null; // legacy rows have no nq
              const dec = RM.pickContextReading(off, cx, { posDicta: dt.pos || null }, s);
              const dictReachable = !!(off.ambiguous || off.pealim_id || off.meaning);
              const candidateA = dec.use === "offline" && !dt.nq && off.label !== "exact" && CONTENT_POS.has(dt.pos || "") && dictReachable;
              return dec.use === "offline" && !candidateA ? "skip" : (dec.use === "offline" ? "candA" : dec.use);
            };
            const a = decide(offBake), b = decide(offRun);
            if (a !== b) { st.selDiff++; if (st.ex.length < 12) st.ex.push(s + ": bake " + offBake.label + "/" + a + " vs run " + offRun.label + "/" + b); }
          }
          if (--budget <= 0) break outer;
        }
      }
    }
  }
  console.log(JSON.stringify(st, null, 2));
})();
