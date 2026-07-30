// Score every probe run against the YouTube-caption oracle, and check which cheap in-run
// detector (r / markSpan ratio) predicts the measured accuracy.
const fs = require("fs");

const norm = (s) => String(s || "").normalize("NFKC").replace(/[\u0591-\u05C7]/g, "")
  .replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

const sub = JSON.parse(fs.readFileSync("mia.iw-orig.json3", "utf8"));
const capt = [];
for (const e of sub.events || []) {
  if (!e.segs) continue;
  for (const s of e.segs) {
    const w = norm(s.utf8);
    if (!w) continue;
    for (const piece of w.split(" ")) if (piece) capt.push({ w: piece, t: ((e.tStartMs || 0) + (s.tOffsetMs || 0)) / 1000 });
  }
}

// banded LCS alignment of our word stream onto the caption word stream, restricted to a
// caption time range (the probe covers only part of the file).
function alignTimes(ours, captSlice) {
  const N = ours.length, M = captSlice.length, BAND = 350, width = 2 * BAND + 1;
  const bp = new Uint8Array((N + 1) * width);
  let prev = new Int32Array(width).fill(-1e9), cur = new Int32Array(width).fill(-1e9);
  const centerOf = (i) => Math.round((i * M) / N);
  { const c0 = centerOf(0); for (let d = 0; d < width; d++) { const jj = c0 - BAND + d; if (jj < 0 || jj > M) continue; prev[d] = 0; bp[d] = 2; } }
  for (let i = 1; i <= N; i++) {
    const c = centerOf(i), cp = centerOf(i - 1);
    cur.fill(-1e9);
    for (let d = 0; d < width; d++) {
      const j = c - BAND + d;
      if (j < 0 || j > M) continue;
      let best = -1e9, dir = 1;
      const dUp = j - cp + BAND;
      if (dUp >= 0 && dUp < width && prev[dUp] > -1e8) { best = prev[dUp] - 1; dir = 1; }
      if (j >= 1) {
        const dD = j - 1 - cp + BAND;
        if (dD >= 0 && dD < width && prev[dD] > -1e8) {
          const sc = prev[dD] + (ours[i - 1].w === captSlice[j - 1].w ? 2 : -1);
          if (sc > best) { best = sc; dir = 0; }
        }
      }
      if (d >= 1 && cur[d - 1] > -1e8) { const sc = cur[d - 1] - 1; if (sc > best) { best = sc; dir = 2; } }
      cur[d] = best; bp[i * width + d] = dir;
    }
    const t = prev; prev = cur; cur = t;
  }
  let i = N, j = M;
  const tOf = new Array(N).fill(null);
  while (i > 0) {
    const d = j - centerOf(i) + BAND;
    if (d < 0 || d >= width) break;
    const dir = bp[i * width + d];
    if (dir === 0) { if (ours[i - 1].w === captSlice[j - 1].w) tOf[i - 1] = captSlice[j - 1].t; i--; j--; }
    else if (dir === 1) i--;
    else { j--; if (j < 0) break; }
  }
  return tOf;
}

function scoreRun(label, segs, offsetSec, fromSec, toSec) {
  const ours = [];
  segs.forEach((s, k) => { for (const p of norm(s.text).split(" ")) if (p) ours.push({ w: p, seg: k }); });
  const captSlice = capt.filter((c) => c.t >= fromSec - 30 && c.t <= toSec + 30);
  const tOf = alignTimes(ours, captSlice);
  const trueStart = new Array(segs.length).fill(null);
  for (let k = 0; k < ours.length; k++) { const s = ours[k].seg; if (trueStart[s] == null && tOf[k] != null) trueStart[s] = tOf[k]; }
  const errs = [];
  for (let s = 0; s < segs.length; s++) {
    if (trueStart[s] == null || typeof segs[s].start !== "number") continue;
    errs.push(Math.abs(offsetSec + segs[s].start - trueStart[s]));
  }
  errs.sort((a, b) => a - b);
  if (!errs.length) { console.log(label.padEnd(34), "no alignment"); return; }
  const q = (x) => errs[Math.min(errs.length - 1, Math.floor((errs.length - 1) * x))];
  console.log(label.padEnd(34), "n=" + String(errs.length).padStart(3),
    "median=" + q(0.5).toFixed(2).padStart(7), "p90=" + q(0.9).toFixed(1).padStart(7), "max=" + errs[errs.length - 1].toFixed(1).padStart(7),
    "<=2s:" + ((errs.filter((e) => e <= 2).length / errs.length) * 100).toFixed(0).padStart(4) + "%",
    "<=5s:" + ((errs.filter((e) => e <= 5).length / errs.length) * 100).toFixed(0).padStart(4) + "%");
}

const probes = JSON.parse(fs.readFileSync("probe-results.json", "utf8"));
console.log("detector values (from the run itself) vs measured accuracy against the oracle:\n");
for (const k of Object.keys(probes)) {
  const p = probes[k];
  console.log(`-- ${k}  [slice ${p.startSec.toFixed(0)}..${p.endSec.toFixed(0)}]  r=${p.honesty.r}  markSpan/slice=${p.honesty.span}`);
  scoreRun("   accuracy", p.segs, p.startSec, p.startSec, p.endSec);
}

// baseline: what actually shipped in the card, same region
const card = JSON.parse(fs.readFileSync("C:/Users/lletp/Downloads/text-card-заложница-миа-интервью.json", "utf8"));
const shipped = card.card.source_meta.source.audio.segments.filter((s) => s.start >= 869 && s.start <= 1806);
console.log("\n-- SHIPPED card marks, same region (prod run)");
scoreRun("   accuracy", shipped, 0, 869, 1806);
