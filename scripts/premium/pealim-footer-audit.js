#!/usr/bin/env node
"use strict";

// pealim-footer-audit.js — guard for the "single source of truth" Pealim link.
//
// The word card's footer «перепроверка (Pealim)» link must be the SAME DIRECT page the
// conjugation accordion / editor resolve to — never a generic search when an exact page is
// known. This audit replicates the client helper `v3WordCardBestPealimUrl` over a bundle:
//   • content note → DIRECT iff it carries a form-disambiguated `pealim_id`.
//   • function word → DIRECT iff the function-links map has its word/lemma.
//   • else → honest SEARCH.
// It FAILS (gate) if any note has a DIRECT source available but the helper would still
// emit a SEARCH link (a desync/regression). Soft: reports direct-coverage %.
//
//   node scripts/premium/pealim-footer-audit.js [--zip Library/test-enriched.zip] [--json]

const fs = require("fs");
const path = require("path");
const JSZip = require("../../public/db/jszip.min.js");

const REPO = path.resolve(__dirname, "..", "..");
function arg(name, def) { const i = process.argv.indexOf("--" + name); if (i < 0) return def; const v = process.argv[i + 1]; return v && !v.startsWith("--") ? v : true; }
const ZIP_IN = String(arg("zip", path.join(REPO, "Library", "test-enriched.zip")));
const AS_JSON = !!arg("json", false);
const FLINKS = path.join(REPO, "public", "data", "inflection", "pealim-function-links.v1.json");

const NIQ = /[֑-ׇ]/g;
const sp = (s) => String(s == null ? "" : s).replace(NIQ, "").trim();
const CONTENT_POS = new Set(["verb", "noun", "adjective"]);

// Faithful replica of public/index.html v3WordCardBestPealimUrl (keep in sync).
function bestPealim(bj, links) {
  const word = sp(bj.word), pos = String(bj.pos || bj.part_of_speech || ""), kind = String(bj.kind || "");
  const pid = String(bj.pealim_id || "").trim();
  if (pid) return { direct: true, via: "pealim_id", id: pid };
  if (kind !== "propernoun" && !CONTENT_POS.has(pos)) {
    for (const k of [word, sp(bj.lemma)]) {
      const e = k && links[k];
      if (e && e.id && (!pos || !e.pos || e.pos === pos)) return { direct: true, via: "funclink", id: e.id };
    }
    // POS-mismatched same-spelling entry is the helper's last resort too
    for (const k of [word, sp(bj.lemma)]) { const e = k && links[k]; if (e && e.id) return { direct: true, via: "funclink-posmismatch", id: e.id }; }
  }
  return { direct: false, via: "search", id: null };
}

(async () => {
  if (!fs.existsSync(ZIP_IN)) { console.error("[footer-audit] no zip:", ZIP_IN); process.exit(2); }
  const links = (() => { try { return JSON.parse(fs.readFileSync(FLINKS, "utf8")).links || {}; } catch (_) { return {}; } })();
  const zip = await JSZip.loadAsync(fs.readFileSync(ZIP_IN));
  const adv = JSON.parse(await (zip.file("library/notes_advanced.json") || zip.file("notes_advanced.json")).async("string"));
  const notes = (adv.notes || []).filter((n) => n.note_type === "word_study");

  let total = 0, direct = 0, search = 0, desync = 0;
  const byVia = {}; const desyncEx = [];
  for (const n of notes) {
    let b; try { b = JSON.parse(n.body_json); } catch (_) { continue; }
    total++;
    const r = bestPealim(b, links);
    byVia[r.via] = (byVia[r.via] || 0) + 1;
    if (r.direct) direct++; else search++;
    // a DIRECT source EXISTS iff content has pealim_id, or function word is in the map
    const pos = String(b.pos || b.part_of_speech || "");
    const hasDirectSource = !!String(b.pealim_id || "").trim()
      || (b.kind !== "propernoun" && !CONTENT_POS.has(pos) && !!(links[sp(b.word)] || links[sp(b.lemma)]));
    if (hasDirectSource && !r.direct) { desync++; if (desyncEx.length < 12) desyncEx.push(b.word + " [" + pos + "]"); }
  }

  const pct = (n) => total ? Math.round((1000 * n) / total) / 10 : 0;
  const out = { generated_at: new Date().toISOString(), zip_in: ZIP_IN, notes_total: total,
    direct, search, direct_pct: pct(direct), by_via: byVia, desync, desync_examples: desyncEx };
  fs.mkdirSync(path.join(REPO, ".tmp"), { recursive: true });
  fs.writeFileSync(path.join(REPO, ".tmp", "pealim-footer-audit.json"), JSON.stringify(out, null, 2));

  if (AS_JSON) console.log(JSON.stringify(out, null, 2));
  else {
    console.log("\n[pealim-footer-audit]", path.basename(ZIP_IN), "—", total, "word_study notes");
    console.log("  direct:", direct, "(" + out.direct_pct + "%) | search:", search, "| by source:", JSON.stringify(byVia));
    console.log("  DESYNC (direct source but search link):", desync, desyncEx.length ? "→ " + desyncEx.join(", ") : "");
    console.log("  report → .tmp/pealim-footer-audit.json");
  }
  process.exit(desync === 0 ? 0 : 1);   // gate: any desync fails
})().catch((e) => { console.error("[footer-audit] fatal:", e); process.exit(1); });
