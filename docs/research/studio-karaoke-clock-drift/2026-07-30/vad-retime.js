// PROTOTYPE (measure-before-code): derive row timing from the AUDIO itself instead of the
// model's self-reported marks. Scored against the YouTube-caption oracle.
//
// Model: speaking rate is ~constant in SPEECH time (silence excluded). Build S(t) = cumulative
// speech seconds; place each segment boundary where cumulative speech equals its expected share
// of the text; snap to the nearest detected pause.
const fs = require("fs");

const SR = 16000, HOP = 0.01, WIN = 0.025;
const pcm = fs.readFileSync("mia.raw");
const nSamp = pcm.length / 2;
const hopS = Math.round(SR * HOP), winS = Math.round(SR * WIN);
const nFrames = Math.floor((nSamp - winS) / hopS);

// frame energy (dBFS)
const db = new Float32Array(nFrames);
for (let f = 0; f < nFrames; f++) {
  let sum = 0;
  const off = f * hopS;
  for (let k = 0; k < winS; k += 2) { const v = pcm.readInt16LE((off + k) * 2) / 32768; sum += v * v; }
  const rms = Math.sqrt(sum / (winS / 2));
  db[f] = 20 * Math.log10(rms + 1e-9);
}
const sorted = Float32Array.from(db).sort();
const pct = (p) => sorted[Math.floor((sorted.length - 1) * p)];
const floor = pct(0.05), loud = pct(0.95);
console.log(`frames=${nFrames} noiseFloor=${floor.toFixed(1)}dB p95=${loud.toFixed(1)}dB`);

// hysteresis VAD
const ON = floor + 12, OFF = floor + 7;
const speech = new Uint8Array(nFrames);
let on = false;
for (let f = 0; f < nFrames; f++) {
  if (!on && db[f] > ON) on = true;
  else if (on && db[f] < OFF) on = false;
  speech[f] = on ? 1 : 0;
}
// smooth: drop speech runs < 120ms, drop silence runs < 150ms
function runs(arr) {
  const out = []; let s = 0;
  for (let i = 1; i <= arr.length; i++) if (i === arr.length || arr[i] !== arr[s]) { out.push({ v: arr[s], a: s, b: i }); s = i; }
  return out;
}
for (const r of runs(speech)) {
  const durMs = (r.b - r.a) * HOP * 1000;
  if (r.v === 1 && durMs < 120) for (let i = r.a; i < r.b; i++) speech[i] = 0;
}
for (const r of runs(speech)) {
  const durMs = (r.b - r.a) * HOP * 1000;
  if (r.v === 0 && durMs < 150) for (let i = r.a; i < r.b; i++) speech[i] = 1;
}
const rs = runs(speech);
const speechFrames = rs.filter((r) => r.v === 1).reduce((n, r) => n + (r.b - r.a), 0);
console.log(`speech=${(speechFrames * HOP).toFixed(0)}s of ${(nFrames * HOP).toFixed(0)}s (${((speechFrames / nFrames) * 100).toFixed(0)}%), pauses=${rs.filter((r) => r.v === 0).length}`);

// cumulative speech seconds per frame
const cum = new Float64Array(nFrames + 1);
for (let f = 0; f < nFrames; f++) cum[f + 1] = cum[f] + (speech[f] ? HOP : 0);
const totalSpeech = cum[nFrames];

// pause candidates: onset frame of every speech run (a boundary lands where speech resumes)
const cand = rs.filter((r) => r.v === 1).map((r) => ({ f: r.a, t: r.a * HOP, c: cum[r.a] }));
console.log(`boundary candidates (speech onsets): ${cand.length}`);

// ---- segments ----
const card = JSON.parse(fs.readFileSync("C:/Users/lletp/Downloads/text-card-заложница-миа-интервью.json", "utf8"));
const segs = card.card.source_meta.source.audio.segments;
const chars = (t) => String(t || "").replace(/[^\p{L}\p{N}]/gu, "").length;
const w = segs.map((s) => chars(s.text));
const totalChars = w.reduce((a, b) => a + b, 0);

// expected cumulative speech at the START of segment i
const expCum = [];
let acc = 0;
for (let i = 0; i < segs.length; i++) { expCum.push((acc / totalChars) * totalSpeech); acc += w[i]; }

// snap: monotone nearest-candidate by cumulative speech
const placed = new Array(segs.length).fill(null);
let p = 0;
for (let i = 0; i < segs.length; i++) {
  while (p + 1 < cand.length && Math.abs(cand[p + 1].c - expCum[i]) <= Math.abs(cand[p].c - expCum[i])) p++;
  placed[i] = cand[p].t;
}

// ---- score vs oracle ----
const oracle = new Map(require("./oracle-errors.json").map((r) => [r.seg, r.real]));
function score(name, timeOf, filter) {
  const errs = [];
  for (let i = 0; i < segs.length; i++) {
    if (filter && !filter(i)) continue;
    const real = oracle.get(i);
    if (real == null) continue;
    errs.push(Math.abs(timeOf(i) - real));
  }
  errs.sort((a, b) => a - b);
  const q = (x) => errs[Math.min(errs.length - 1, Math.floor((errs.length - 1) * x))];
  console.log(
    name.padEnd(40), "n=" + String(errs.length).padStart(3),
    "median=" + q(0.5).toFixed(1).padStart(6), "p90=" + q(0.9).toFixed(1).padStart(6),
    "max=" + errs[errs.length - 1].toFixed(1).padStart(6),
    "<=1s:" + ((errs.filter((e) => e <= 1).length / errs.length) * 100).toFixed(0).padStart(3) + "%",
    "<=2s:" + ((errs.filter((e) => e <= 2).length / errs.length) * 100).toFixed(0).padStart(3) + "%",
    "<=5s:" + ((errs.filter((e) => e <= 5).length / errs.length) * 100).toFixed(0).padStart(3) + "%"
  );
}
const W1f = 0.015510203579, frac = (x) => x - Math.floor(x);
const winOf = (s) => (Math.abs(frac(s.start)) < 1e-6 ? 0 : Math.abs(frac(s.start) - W1f) < 1e-6 ? 1 : 2);

console.log("\n--- whole file ---");
score("S0 model marks (today)", (i) => segs[i].start);
score("V1 audio-derived (global rate)", (i) => placed[i]);
console.log("--- broken window 1 only ---");
score("S0 model marks (today)", (i) => segs[i].start, (i) => winOf(segs[i]) === 1);
score("V1 audio-derived (global rate)", (i) => placed[i], (i) => winOf(segs[i]) === 1);
console.log("--- healthy window 0 only ---");
score("S0 model marks (today)", (i) => segs[i].start, (i) => winOf(segs[i]) === 0);
score("V1 audio-derived (global rate)", (i) => placed[i], (i) => winOf(segs[i]) === 0);

fs.writeFileSync("vad-placed.json", JSON.stringify({ placed, totalSpeech, cand: cand.length }, null, 1));
