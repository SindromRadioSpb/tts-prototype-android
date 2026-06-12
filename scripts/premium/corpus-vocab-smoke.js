#!/usr/bin/env node
"use strict";
// corpus-vocab-smoke.js — gate `smoke:corpus-vocab` for BRR-P1-007 Slice 1.
// Enforces the invariants that keep the i+1 vocab sidecar honest + non-desyncing
// (the D4 lockstep is a GATE, not code-coupling — see DESIGN §5):
//   1. schema/header well-formed; id_encoding=delta; model_id present
//   2. LOCKSTEP — sidecar version == latest corpus-catalog-v<N> on disk
//   3. JOIN-KEY conformance — every dict key, re-formatted via the SAME
//      NotesAutoGen.lemmaKey the client uses, is byte-identical "pid:<digits>"
//      and the pid is in the pealim-infl-v12 id space (no invented lemmas, R1)
//   4. COMPLETENESS — every sidecar work ∈ catalog baked; every baked ∈ sidecar
//      (0 catalog-ids-absent — D4: stale users never intersect a fresh profile
//      against a missing work)
//   5. per-work payload integrity — delta-ids non-negative + reconstruct ascending
//      in-range; ids.length==tok.length; 0<m<=n; m==sum(tok); coverage join ∈ [0,1]
//   6. DETERMINISM — rebuild twice → byte-identical (stable sort, reproducible)
//   7. SIZE — gz bytes/1000-works ≤ ceiling (mobile budget guard; a bake-expansion
//      can't silently cross the first-paint cliff — R5)
//
//   node scripts/premium/corpus-vocab-smoke.js
//
// Builds the sidecar in-memory from the local baked works (does NOT require the
// committed file) so it runs in CI before publish.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const NA = require("../../public/js/notes-autogen.js");
const { buildCorpusVocab, detectCatalogVersion } = require("./build-corpus-vocab.js");

const REPO = path.resolve(__dirname, "..", "..");
const OUT = path.join(REPO, "public", "data", "benyehuda");
const CEILING_KB_PER_1K = 400;   // gz KB per 1000 works (delta-ids+tok ≈296 today → headroom)

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error("  ✗ " + m); } };

(function main() {
  const V = detectCatalogVersion(OUT);
  if (!V) { console.error("✗ no corpus-catalog on disk"); process.exit(2); }
  const built = buildCorpusVocab({ quiet: true });
  const s = built.sidecar;
  const workIds = Object.keys(s.works);

  // 1 — header
  ok(s.schema === 1, "schema!=1");
  ok(s.id_encoding === "delta", "id_encoding!=delta");
  ok(typeof s.model_id === "string" && s.model_id, "model_id missing");
  ok(Array.isArray(s.dict) && s.dict.length > 0, "dict empty");

  // 2 — LOCKSTEP version
  ok(s.version === V, `version ${s.version} != latest catalog v${V}`);
  ok(s.catalog_version === V, `catalog_version ${s.catalog_version} != v${V}`);

  // 3 — join-key conformance (same lemmaKey core; valid pid space)
  const validPid = new Set();
  { const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(OUT, "..", "inflection", "pealim-infl-v12.json.gz"))));
    for (const p of d.paradigms) if (p.pealim_id != null) validPid.add(String(p.pealim_id)); }
  let badKey = 0, badPid = 0;
  for (const pidStr of s.dict) {
    const canonical = NA.lemmaKey({ pealim_id: pidStr });   // the client's exact formatter
    if (canonical !== "pid:" + pidStr || !/^pid:\d+$/.test(canonical)) badKey++;
    if (!validPid.has(pidStr)) badPid++;
  }
  ok(badKey === 0, `${badKey} dict keys not byte-identical to NotesAutoGen.lemmaKey`);
  ok(badPid === 0, `${badPid} dict pids outside pealim-infl-v12 space (invented lemma, R1)`);

  // 4 — completeness vs catalog baked set
  const catalog = JSON.parse(fs.readFileSync(path.join(OUT, "corpus-catalog-v" + V + ".json"), "utf8"));
  const bakedIds = (catalog.pointers && Array.isArray(catalog.pointers.ready))
    ? catalog.pointers.ready.map(String) : [];
  ok(bakedIds.length > 0, "catalog has no pointers.ready");
  const sidecarSet = new Set(workIds);
  // every sidecar work is a baked work
  const bakedSet = new Set(bakedIds);
  const strayWorks = workIds.filter((id) => !bakedSet.has(id));
  ok(strayWorks.length === 0, `${strayWorks.length} sidecar works absent from catalog baked set`);
  // every baked work WITH a body on disk is in the sidecar (missing-body baked are skipped honestly)
  const missingFromSidecar = bakedIds.filter((id) => fs.existsSync(path.join(OUT, "works", id + ".json")) && !sidecarSet.has(id));
  ok(missingFromSidecar.length === 0, `${missingFromSidecar.length} baked works with bodies missing from sidecar`);

  // 5 — per-work payload integrity + coverage join sanity
  const D = s.dict.length;
  let badPayload = 0, badCov = 0;
  // synthetic "known" = half the dict (stable) → coverage must be a valid ratio
  const known = new Set(s.dict.slice(0, Math.floor(D / 2)).map((p) => "pid:" + p));
  for (const id of workIds) {
    const w = s.works[id];
    if (!Array.isArray(w.ids) || !Array.isArray(w.tok) || w.ids.length !== w.tok.length) { badPayload++; continue; }
    // reconstruct absolute ids from deltas (first delta = abs id, prefix-sum from 0)
    // → must be strictly ascending distinct + in range
    let prev = 0, absOk = true, sumTok = 0;
    for (let i = 0; i < w.ids.length; i++) {
      if (w.ids[i] < (i === 0 ? 0 : 1)) { absOk = false; break; }   // first delta≥0, rest≥1 (ascending distinct)
      prev += w.ids[i];
      if (prev < 0 || prev >= D) { absOk = false; break; }
      sumTok += w.tok[i];
    }
    if (!absOk) { badPayload++; continue; }
    if (!(w.m > 0 && w.m <= w.n && w.m === sumTok)) { badPayload++; continue; }
    if (typeof w.ez !== "number" || w.ez < 0 || w.ez > 1) { badPayload++; continue; }   // S3 intrinsic easiness
    // coverage join: known ∩ work over matched (token-weighted) ∈ [0,1]
    let num = 0, den = 0, p2 = 0;
    for (let i = 0; i < w.ids.length; i++) { p2 += w.ids[i]; const key = "pid:" + s.dict[p2]; den += w.tok[i]; if (known.has(key)) num += w.tok[i]; }
    const cov = den ? num / den : -1;
    if (!(cov >= 0 && cov <= 1)) badCov++;
  }
  ok(badPayload === 0, `${badPayload} works with malformed payload (ids/tok/delta/m/n)`);
  ok(badCov === 0, `${badCov} works with out-of-range coverage join`);

  // 6 — determinism
  const a = JSON.stringify(buildCorpusVocab({ quiet: true }).sidecar);
  const b = JSON.stringify(buildCorpusVocab({ quiet: true }).sidecar);
  ok(a === b, "non-deterministic rebuild (unstable sort)");

  // 7 — size ceiling
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(s)), { level: 9 }).length;
  const per1k = gz / Math.max(1, workIds.length) * 1000;
  ok(per1k / 1024 <= CEILING_KB_PER_1K, `size ${(per1k / 1024).toFixed(0)}KB-gz/1000-works > ceiling ${CEILING_KB_PER_1K}KB`);

  console.log(`[corpus-vocab-smoke] v${V} · ${workIds.length} works · ${D} lemmas · ` +
    `${(gz / 1024).toFixed(0)}KB-gz (${(per1k / 1024).toFixed(0)}KB/1k) · ${pass} pass / ${fail} fail`);
  if (fail) { console.error(`✗ smoke:corpus-vocab FAILED (${fail})`); process.exit(1); }
  console.log("✓ smoke:corpus-vocab PASS");
})();
