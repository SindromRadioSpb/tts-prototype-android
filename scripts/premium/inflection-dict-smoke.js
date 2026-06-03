#!/usr/bin/env node
// scripts/premium/inflection-dict-smoke.js — validate the shipped offline dict.
// Checks: gz decompresses; meta matches dataset; every index value points to a
// real paradigm; multi-alias keying present (a verb is reachable BY ROOT, the
// make-or-break invariant); no obviously-empty verb paradigms. Self-skips if the
// dataset isn't built yet.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const MODEL = require("../../db/premium/providers/pealim").MODEL_VERSION;
const ROOT = path.resolve(__dirname, "..", "..");
const BASE = path.join(ROOT, "public", "data", "inflection", MODEL);

let pass = 0, fail = 0;
const t = (n, c, e) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (e ? " — " + e : "")); } };

function main() {
  if (!fs.existsSync(BASE + ".json.gz") || !fs.existsSync(BASE + ".meta.json")) {
    console.log("SKIPPED: dataset not built (" + path.relative(ROOT, BASE) + ".json.gz). Run scrape-pealim-all.js.");
    process.exit(0);
  }
  const meta = JSON.parse(fs.readFileSync(BASE + ".meta.json", "utf8"));
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(BASE + ".json.gz")));

  t("gz decompresses to {model_version,paradigms[],index{}}",
    ds && ds.model_version === MODEL && Array.isArray(ds.paradigms) && ds.index && typeof ds.index === "object",
    JSON.stringify({ model: ds && ds.model_version, paradigms: ds && ds.paradigms && ds.paradigms.length }));

  t("meta.entry_count == paradigms.length",
    meta.entry_count === ds.paradigms.length, `${meta.entry_count} vs ${ds.paradigms.length}`);
  t("meta.key_count == index size",
    meta.key_count === Object.keys(ds.index).length, `${meta.key_count} vs ${Object.keys(ds.index).length}`);

  // every index value points to a real paradigm
  let broken = 0;
  for (const k in ds.index) { const p = ds.paradigms[ds.index[k]]; if (!p || typeof p !== "object") broken++; }
  t("every index key → a valid paradigm (no broken refs)", broken === 0, "broken=" + broken);

  // make-or-break: a known verb reachable BY ROOT (כתב paal) AND by lemma (לכתוב paal)
  const byRoot = ds.index["כתב paal"], byLemma = ds.index["לכתוב paal"];
  const rootP = byRoot != null && ds.paradigms[byRoot];
  t("verb reachable by ROOT 'כתב paal' (multi-alias keying)",
    !!rootP && rootP.pos === "verb" && rootP.cells && Object.keys(rootP.cells).length > 0,
    JSON.stringify({ byRoot, byLemma, lemma: rootP && rootP.lemma }));

  // verbs should carry non-empty cells (sanity on the parse)
  const verbs = ds.paradigms.filter((p) => p.pos === "verb");
  const emptyVerbs = verbs.filter((p) => !p.cells || Object.keys(p.cells).length === 0).length;
  t("verbs have non-empty paradigm cells (≥90%)",
    verbs.length > 0 && emptyVerbs / verbs.length < 0.10, `verbs=${verbs.length} empty=${emptyVerbs}`);

  // proclitic demonstrative present as invariant (כזאת case → זאת base)
  const zot = ds.index["זאת "] != null && ds.paradigms[ds.index["זאת "]];
  t("invariant base 'זאת' present (proclitic words resolve to it)", !!zot, JSON.stringify({ has: !!zot }));

  console.log(`\nmeta: entries=${meta.entry_count} keys=${meta.key_count} collisions=${meta.collision_count} gz=${(meta.gz_bytes / 1048576).toFixed(2)}MB raw=${(meta.raw_bytes / 1048576).toFixed(2)}MB`);
  console.log(`[inflection-dict-smoke] ${pass}/${pass + fail} passed`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
