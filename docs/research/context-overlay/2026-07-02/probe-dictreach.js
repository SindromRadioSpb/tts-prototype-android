#!/usr/bin/env node
"use strict";
// Refute the producer's dictReachable exclusion: can a word whose OFFLINE card is fully
// unknown (no ambiguous/pid/meaning) still PROMOTE once Dicta nq is fed? (comment in
// build-context-overlay.js says it "can never promote, whatever its niqqud")
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

const audit = JSON.parse(fs.readFileSync(path.join(REPO, ".tmp/benyehuda/reader-morph-audit-dicta-cache.json"), "utf8"));
const dir = path.join(REPO, "public/data/benyehuda/works");
const plain2niq = new Map();
for (const f of fs.readdirSync(dir).filter((x) => /^[A-Za-z0-9_-]+\.json$/.test(x))) {
  let w; try { w = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (_) { continue; }
  for (const tx of (w.library && w.library.texts) || []) for (const r of tx.rows || []) {
    const p = String(r.hebrew_plain || "").trim();
    if (p && !plain2niq.has(p)) plain2niq.set(p, String(r.hebrew_niqqud || ""));
  }
}
const CONTENT = new Set(["noun", "verb", "adjective"]);
(async () => {
  const st = { unreachableCand: 0, unreachablePromote: 0, unreachableGlossSoften: 0, ex: [] };
  for (const sent of Object.keys(audit)) {
    const niqRow = plain2niq.get(String(sent).trim());
    if (niqRow == null) continue;
    const toks = audit[sent];
    const wordToks = RM.tokenize(niqRow || sent).filter((x) => x.isWord);
    const seen = new Set();
    for (const tk of wordToks) {
      const surface = strip(tk.text);
      if (!surface || seen.has(surface)) continue;
      seen.add(surface);
      const dt = toks.find((t) => strip(t.word) === surface || t.stem === surface);
      if (!dt || !dt.niqqud) continue;
      let off; try { off = await RM.resolveCore(eng, surface, tk.text); } catch (_) { continue; }
      const dictReachable = !!(off.ambiguous || off.pealim_id || off.meaning);
      const isExcluded = off.label !== "exact" && CONTENT.has(dt.posDicta || "") && !dictReachable;
      if (!isExcluded) continue;
      st.unreachableCand++;
      let cx = null; try { cx = await RM.resolveCore(eng, surface, dt.niqqud); } catch (_) { cx = null; }
      const dec = RM.pickContextReading(off, cx, { posDicta: dt.posDicta || null }, surface);
      if (dec.use === "context") { st.unreachablePromote++; if (st.ex.length < 10) st.ex.push(surface + " (" + (cx && cx.meaning || "").slice(0, 24) + ")"); }
      else if (dec.use !== "offline") st.unreachableGlossSoften++;
    }
  }
  console.log(JSON.stringify(st, null, 2));
})();
