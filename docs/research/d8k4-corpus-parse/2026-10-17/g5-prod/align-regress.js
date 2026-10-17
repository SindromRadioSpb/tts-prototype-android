// O-092: old (arg 2) vs new (arg 3) placeUnits on rows the old code already aligned — the facts must sit on the same words. Read-only.
const fs = require("fs"), path = require("path"), zlib = require("zlib"), crypto = require("crypto");
const [WT, NEWC] = process.argv.slice(2);
const OLD = require(path.join(WT, "public/js/reader-morph.js"));
const k = require.resolve(path.join(NEWC, "public/js/reader-morph.js")); const NEW = require(k);
const ledger = JSON.parse(fs.readFileSync(path.join(WT, ".tmp/d8k4/ledger.json"), "utf8")).works;
const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
let rows = 0, same = 0, diff = 0, gained = 0; const ex = [];
for (const [ref, L] of Object.entries(ledger)) {
  if (!ref.startsWith("by:") || L.status !== "done") continue;
  const id = ref.slice(3), wf = path.join(WT, ".tmp/d8k4/by", id + ".json"), of = path.join(WT, L.file);
  if (!fs.existsSync(wf) || !fs.existsSync(of)) continue;
  const lib = JSON.parse(fs.readFileSync(wf, "utf8")).library;
  const file = JSON.parse(zlib.gunzipSync(fs.readFileSync(of)).toString("utf8"));
  const byKey = new Map(file.rows.map((r) => [r[0] + ":" + r[1], r[2]]));
  for (const t of lib.texts) for (const r of t.rows) {
    const plain = String(r.hebrew_plain || "").trim(); if (!plain) continue;
    const packed = byKey.get(sha(plain).slice(0, 16) + ":" + r.order_index); if (!packed) continue;
    const row = { he_plain: r.hebrew_plain, he_niqqud: r.hebrew_niqqud }, toks = packed.map((a) => ({ word: a[0] }));
    const o = OLD.placeUnits(row, toks), n = NEW.placeUnits(row, toks);
    const units = o.sk.filter(Boolean).length;
    if (!units || o.at.size < units * 0.9) continue;   // only rows the old code already accepted
    rows++;
    let changed = false;
    for (const [off, tk] of o.at) { const m = n.at.get(off); if (!m || m.word !== tk.word) changed = true; }
    for (const [off] of n.at) if (!o.at.has(off)) gained++;
    if (changed) { diff++; if (ex.length < 6) ex.push({ id, o: [...o.at].map(([a, b]) => a + ":" + b.word).join(" "), n: [...n.at].map(([a, b]) => a + ":" + b.word).join(" ") }); } else same++;
  }
}
console.log(JSON.stringify({ rows, same, diff, gainedWords: gained, ex }, null, 1));
