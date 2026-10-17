// usage: node misalign-measure.js <worktree with .tmp/d8k4> [code worktree]
// Read-only: how many baked Ben-Yehuda rows does the device drop as «misaligned» (< 90 % of words matched), and why.
// No Dicta, no network. One work at a time (memory).
const fs = require("fs"), path = require("path"), zlib = require("zlib"), crypto = require("crypto");
const WT = process.argv[2];
const RM = require(path.join(process.argv[3] || WT, "public/js/reader-morph.js"));
const ledger = JSON.parse(fs.readFileSync(path.join(WT, ".tmp/d8k4/ledger.json"), "utf8")).works;
const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const QUOTE = /["״׳']/;
const strip = (s) => String(s || "").replace(/[֑-ׇ]/g, "");
let works = 0, rows = 0, mis = 0, misQuote = 0, misOther = 0, unitsLost = 0;
const otherSamples = [], quoteSamples = [];
for (const [ref, L] of Object.entries(ledger)) {
  if (!ref.startsWith("by:") || L.status !== "done") continue;
  const id = ref.slice(3), wf = path.join(WT, ".tmp/d8k4/by", id + ".json"), of = path.join(WT, L.file);
  if (!fs.existsSync(wf) || !fs.existsSync(of)) continue;
  const lib = JSON.parse(fs.readFileSync(wf, "utf8")).library;
  const file = JSON.parse(zlib.gunzipSync(fs.readFileSync(of)).toString("utf8"));
  const byKey = new Map(file.rows.map((r) => [r[0] + ":" + r[1], r[2]]));
  works++;
  for (const t of lib.texts) for (const r of t.rows) {
    const plain = String(r.hebrew_plain || "").trim(); if (!plain) continue;
    const packed = byKey.get(sha(plain).slice(0, 16) + ":" + r.order_index); if (!packed) continue;
    rows++;
    const pu = RM.placeUnits({ he_plain: r.hebrew_plain, he_niqqud: r.hebrew_niqqud }, packed.map((a) => ({ word: a[0] })));
    const units = pu.sk.filter(Boolean);
    if (!units.length || pu.at.size + (pu.cover ? pu.cover.size : 0) >= units.length * 0.9) continue;
    mis++; unitsLost += units.length;
    const q = QUOTE.test(plain);
    if (q) { misQuote++; if (quoteSamples.length < 4) quoteSamples.push({ id, sk: units.join(" ").slice(0, 120), d: packed.map((a) => a[0]).join(" ").slice(0, 120) }); }
    else { misOther++; if (otherSamples.length < 8) otherSamples.push({ id, n: units.length, at: pu.at.size, sk: units.join(" ").slice(0, 140), d: packed.map((a) => strip(a[0])).join(" ").slice(0, 140) }); }
  }
}
console.log(JSON.stringify({ works, rows, misaligned: mis, share: +(100 * mis / rows).toFixed(2), withQuote: misQuote, other: misOther, unitsLost, quoteSamples, otherSamples }, null, 1));
