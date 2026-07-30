// How accurate does row timing get if we NEVER trust the model's in-slice clock and instead
// rely on (a) honest anchors every T seconds — what small ASR slices would give us by
// construction — plus (b) deterministic in-slice placement from the audio itself?
// Anchors are simulated from the oracle (a real slice boundary is honest by construction:
// absolute time = our own byte-offset).
const fs = require("fs");
const SR = 16000, HOP = 0.01, WIN = 0.025;
const pcm = fs.readFileSync("mia.raw");
const nSamp = pcm.length / 2, hopS = Math.round(SR * HOP), winS = Math.round(SR * WIN);
const nFrames = Math.floor((nSamp - winS) / hopS);
const db = new Float32Array(nFrames);
for (let f = 0; f < nFrames; f++) {
  let sum = 0; const off = f * hopS;
  for (let k = 0; k < winS; k += 2) { const v = pcm.readInt16LE((off + k) * 2) / 32768; sum += v * v; }
  db[f] = 20 * Math.log10(Math.sqrt(sum / (winS / 2)) + 1e-9);
}
const sorted = Float32Array.from(db).sort();
const floor = sorted[Math.floor(sorted.length * 0.05)];
const ON = floor + 12, OFF = floor + 7;
const speech = new Uint8Array(nFrames); let on = false;
for (let f = 0; f < nFrames; f++) { if (!on && db[f] > ON) on = true; else if (on && db[f] < OFF) on = false; speech[f] = on ? 1 : 0; }
function runs(a) { const o = []; let s = 0; for (let i = 1; i <= a.length; i++) if (i === a.length || a[i] !== a[s]) { o.push({ v: a[s], a: s, b: i }); s = i; } return o; }
for (const r of runs(speech)) if (r.v === 1 && (r.b - r.a) * HOP < 0.12) for (let i = r.a; i < r.b; i++) speech[i] = 0;
for (const r of runs(speech)) if (r.v === 0 && (r.b - r.a) * HOP < 0.15) for (let i = r.a; i < r.b; i++) speech[i] = 1;
const cum = new Float64Array(nFrames + 1);
for (let f = 0; f < nFrames; f++) cum[f + 1] = cum[f] + (speech[f] ? HOP : 0);
const onsets = runs(speech).filter((r) => r.v === 1).map((r) => ({ t: r.a * HOP, c: cum[r.a] }));
const cumAt = (t) => cum[Math.max(0, Math.min(nFrames, Math.round(t / HOP)))];

const card = JSON.parse(fs.readFileSync("C:/Users/lletp/Downloads/text-card-заложница-миа-интервью.json", "utf8"));
const segs = card.card.source_meta.source.audio.segments;
const oracle = new Map(require("./oracle-errors.json").map((r) => [r.seg, r.real]));
const chars = (t) => String(t || "").replace(/[^\p{L}\p{N}]/gu, "").length;
const w = segs.map((s) => chars(s.text));

function place(anchorIdx, snap) {
  // anchorIdx: sorted list of segment indices whose time is known honestly
  const t = new Array(segs.length).fill(null);
  for (const i of anchorIdx) t[i] = oracle.get(i);
  for (let a = 0; a + 1 < anchorIdx.length; a++) {
    const i0 = anchorIdx[a], i1 = anchorIdx[a + 1];
    const t0 = t[i0], t1 = t[i1];
    const c0 = cumAt(t0), c1 = cumAt(t1);
    let total = 0; for (let i = i0; i < i1; i++) total += w[i];
    if (!total) continue;
    let acc = 0;
    for (let i = i0 + 1; i < i1; i++) {
      acc += w[i - 1];
      const targetCum = c0 + (acc / total) * (c1 - c0);
      if (!snap) { // linear in speech-time -> convert back to wall time by scanning cum
        let lo = Math.round(t0 / HOP), hi = Math.round(t1 / HOP);
        while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < targetCum) lo = mid + 1; else hi = mid; }
        t[i] = lo * HOP;
      } else {   // snap to nearest speech onset by cumulative-speech distance, inside (t0,t1)
        let best = null, bd = Infinity;
        for (const o of onsets) {
          if (o.t <= t0 || o.t >= t1) continue;
          const d = Math.abs(o.c - targetCum);
          if (d < bd) { bd = d; best = o.t; }
        }
        t[i] = best == null ? t0 : best;
      }
    }
  }
  return t;
}

function score(name, t) {
  const errs = [];
  for (let i = 0; i < segs.length; i++) { const r = oracle.get(i); if (r == null || t[i] == null) continue; errs.push(Math.abs(t[i] - r)); }
  errs.sort((a, b) => a - b);
  const q = (x) => errs[Math.min(errs.length - 1, Math.floor((errs.length - 1) * x))];
  console.log(name.padEnd(34), "n=" + String(errs.length).padStart(3),
    "median=" + q(0.5).toFixed(2).padStart(6), "p90=" + q(0.9).toFixed(2).padStart(6), "max=" + errs[errs.length - 1].toFixed(1).padStart(6),
    "<=1s:" + ((errs.filter((e) => e <= 1).length / errs.length) * 100).toFixed(0).padStart(3) + "%",
    "<=2s:" + ((errs.filter((e) => e <= 2).length / errs.length) * 100).toFixed(0).padStart(3) + "%",
    "<=5s:" + ((errs.filter((e) => e <= 5).length / errs.length) * 100).toFixed(0).padStart(3) + "%");
}

const known = segs.map((s, i) => i).filter((i) => oracle.get(i) != null);
for (const T of [900, 300, 180, 120, 60, 30]) {
  // anchors: first known segment at or after each multiple of T
  const anchors = [];
  for (let mark = 0; mark <= 1806; mark += T) {
    const cand = known.find((i) => oracle.get(i) >= mark);
    if (cand != null && anchors[anchors.length - 1] !== cand) anchors.push(cand);
  }
  if (anchors[anchors.length - 1] !== known[known.length - 1]) anchors.push(known[known.length - 1]);
  const segsPerAnchor = (segs.length / anchors.length).toFixed(1);
  console.log(`\n=== anchors every ~${T}s → ${anchors.length} anchors (${segsPerAnchor} segments per anchor interval) ===`);
  score("  proportional in speech-time", place(anchors, false));
  score("  + snapped to speech onsets", place(anchors, true));
}
