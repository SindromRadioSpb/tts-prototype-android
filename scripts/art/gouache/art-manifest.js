// Gouache art baseline (3.11.907, owner: «сохранить эталон, чтобы избегать регрессий»).
//   node scripts/art/gouache/art-manifest.js          — print differences against the stored manifest
//   node scripts/art/gouache/art-manifest.js --write  — store the current art as the baseline
// The manifest lists every file under public/art/gouache with its size and sha256; the unit test
// tests/gouacheArtBaseline.test.js fails when a painting changes without the manifest being rewritten.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..", "..", "..");
const ART = path.join(ROOT, "public", "art", "gouache");
const MANIFEST = path.join(ROOT, "docs", "planning", "gouache-baseline", "art-manifest.json");
function current() {
  const out = {};
  for (const f of fs.readdirSync(ART).sort()) {
    const buf = fs.readFileSync(path.join(ART, f));
    out[f] = { bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
  }
  return out;
}
function diff(a, b) {
  const rows = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!a[k]) rows.push("added   " + k);
    else if (!b[k]) rows.push("removed " + k);
    else if (a[k].sha256 !== b[k].sha256) rows.push("changed " + k + " (" + a[k].bytes + " -> " + b[k].bytes + " bytes)");
  }
  return rows;
}
module.exports = { current, diff, MANIFEST };
if (require.main === module) {
  const cur = current();
  if (process.argv.includes("--write")) {
    fs.writeFileSync(MANIFEST, JSON.stringify({ note: "Baseline of public/art/gouache — rewrite only when a painting is changed on purpose.", files: cur }, null, 2) + "\n");
    console.log("written", Object.keys(cur).length, "files");
  } else {
    const rows = diff(JSON.parse(fs.readFileSync(MANIFEST, "utf8")).files, cur);
    console.log(rows.length ? rows.join("\n") : "art matches the baseline");
    process.exitCode = rows.length ? 1 : 0;
  }
}
