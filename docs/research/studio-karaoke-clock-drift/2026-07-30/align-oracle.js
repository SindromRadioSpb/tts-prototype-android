// Independent oracle: align our ASR segments to YouTube auto-caption word stream (iw-orig).
// Produces true start time per segment -> error curve vs stored marks.
const fs = require("fs");

const CARD = "C:/Users/lletp/Downloads/text-card-заложница-миа-интервью.json";
const SUB = "mia.iw-orig.json3";

const norm = (s) =>
  String(s || "")
    .normalize("NFKC")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// --- caption word stream ---
const sub = JSON.parse(fs.readFileSync(SUB, "utf8"));
const capt = [];
for (const e of sub.events || []) {
  if (!e.segs) continue;
  for (const s of e.segs) {
    const raw = String(s.utf8 || "");
    const w = norm(raw);
    if (!w) continue;
    for (const piece of w.split(" ")) {
      if (piece) capt.push({ w: piece, t: ((e.tStartMs || 0) + (s.tOffsetMs || 0)) / 1000 });
    }
  }
}

// --- our word stream ---
const card = JSON.parse(fs.readFileSync(CARD, "utf8"));
const segs = card.card.source_meta.source.audio.segments;
const ours = [];
segs.forEach((s, i) => {
  for (const piece of norm(s.text).split(" ")) if (piece) ours.push({ w: piece, seg: i });
});

console.log(`caption words=${capt.length}  our words=${ours.length}  segments=${segs.length}`);

// --- banded LCS alignment (Hirschberg not needed at this size) ---
const N = ours.length, M = capt.length;
const BAND = 400;
// dp over rows with band; store backpointers compactly via direction bytes
const width = 2 * BAND + 1;
const bp = new Uint8Array((N + 1) * width); // 0=diag-match,1=up(skip ours),2=left(skip capt)
let prev = new Int32Array(width).fill(-1e9);
let cur = new Int32Array(width).fill(-1e9);
const centerOf = (i) => Math.round((i * M) / N);
// init row 0
{
  const c0 = centerOf(0);
  for (let d = 0; d < width; d++) {
    const jj = c0 - BAND + d;
    if (jj < 0 || jj > M) continue;
    prev[d] = 0; // free leading skips of caption words
    bp[0 * width + d] = 2;
  }
}
for (let i = 1; i <= N; i++) {
  const c = centerOf(i), cp = centerOf(i - 1);
  cur.fill(-1e9);
  for (let d = 0; d < width; d++) {
    const j = c - BAND + d;
    if (j < 0 || j > M) continue;
    let best = -1e9, dir = 1;
    // up: skip our word i (cost -1)
    const dUp = j - cp + BAND;
    if (dUp >= 0 && dUp < width && prev[dUp] > -1e8) { best = prev[dUp] - 1; dir = 1; }
    // diag: match/mismatch
    if (j >= 1) {
      const dDiag = j - 1 - cp + BAND;
      if (dDiag >= 0 && dDiag < width && prev[dDiag] > -1e8) {
        const sc = prev[dDiag] + (ours[i - 1].w === capt[j - 1].w ? 2 : -1);
        if (sc > best) { best = sc; dir = 0; }
      }
    }
    // left: skip caption word j (cost -1)
    if (d >= 1 && cur[d - 1] > -1e8) {
      const sc = cur[d - 1] - 1;
      if (sc > best) { best = sc; dir = 2; }
    }
    cur[d] = best;
    bp[i * width + d] = dir;
  }
  const tmp = prev; prev = cur; cur = tmp;
}
// traceback from (N, M)
let i = N, j = M;
const timeOfOurWord = new Float64Array(N).fill(NaN);
const matched = new Uint8Array(N);
while (i > 0) {
  const c = centerOf(i);
  const d = j - c + BAND;
  if (d < 0 || d >= width) break;
  const dir = bp[i * width + d];
  if (dir === 0) {
    timeOfOurWord[i - 1] = capt[j - 1].t;
    matched[i - 1] = ours[i - 1].w === capt[j - 1].w ? 1 : 2;
    i--; j--;
  } else if (dir === 1) { i--; }
  else { j--; if (j < 0) break; }
}

let exact = 0, sub_ = 0, none = 0;
for (let k = 0; k < N; k++) { if (matched[k] === 1) exact++; else if (matched[k] === 2) sub_++; else none++; }
console.log(`aligned: exact=${exact} (${((exact / N) * 100).toFixed(1)}%) substituted=${sub_} unaligned=${none}`);

// --- true start per segment = earliest EXACT-matched word time in that segment ---
const trueStart = new Array(segs.length).fill(null);
for (let k = 0; k < N; k++) {
  if (matched[k] !== 1) continue;
  const s = ours[k].seg;
  if (trueStart[s] == null) trueStart[s] = timeOfOurWord[k];
}
// enforce monotonic sanity (report violations rather than fix)
let nonMono = 0;
for (let s = 1; s < trueStart.length; s++) {
  if (trueStart[s] != null && trueStart[s - 1] != null && trueStart[s] < trueStart[s - 1]) nonMono++;
}
const have = trueStart.filter((x) => x != null).length;
console.log(`segments with oracle time: ${have}/${segs.length}, non-monotonic: ${nonMono}`);

const rows = [];
for (let s = 0; s < segs.length; s++) {
  if (trueStart[s] == null) continue;
  rows.push({ seg: s, mark: segs[s].start, real: trueStart[s], err: segs[s].start - trueStart[s] });
}
const errs = rows.map((r) => Math.abs(r.err)).sort((a, b) => a - b);
const pct = (p) => errs[Math.min(errs.length - 1, Math.floor((errs.length - 1) * p))];
console.log(`|error| median=${pct(0.5).toFixed(1)}s p90=${pct(0.9).toFixed(1)}s max=${errs[errs.length - 1].toFixed(1)}s`);
console.log(`rows with |err|<=2s: ${((errs.filter((e) => e <= 2).length / errs.length) * 100).toFixed(1)}%   <=5s: ${((errs.filter((e) => e <= 5).length / errs.length) * 100).toFixed(1)}%`);

console.log("\nseg | UI row | mark      | real      | err");
for (const r of rows) {
  if (r.seg <= 6 || (r.seg >= 68 && r.seg <= 100) || r.seg % 20 === 0 || r.seg >= 205) {
    console.log(
      String(r.seg).padStart(4),
      String(r.seg + 1).padStart(6),
      r.mark.toFixed(1).padStart(9),
      r.real.toFixed(1).padStart(9),
      (r.err >= 0 ? "+" : "") + r.err.toFixed(1)
    );
  }
}

fs.writeFileSync("oracle-errors.json", JSON.stringify(rows, null, 1));
