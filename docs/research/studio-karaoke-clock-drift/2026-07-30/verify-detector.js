// Does the new detector fire on the real broken run and stay silent on the real good ones?
const fs = require("fs");
const A = require("E:/projects/tts-prototype-android/public/js/asr-transcript.js");

const card = JSON.parse(fs.readFileSync("C:/Users/lletp/Downloads/text-card-заложница-миа-интервью.json", "utf8"));
const audio = card.card.source_meta.source.audio;

console.log("=== 1. the shipped card, judged from its OWN stored speechDensity passport ===");
const v = A.classifyClockCompression(audio.speechDensity || audio.asr.speechDensity);
console.log(JSON.stringify(v, null, 1));

// rebuild per-window segments from the shipped stitched segments (by chunk offset fingerprint),
// so we also exercise runSpeechDensity on real text rather than trusting the stored passport.
const W1f = 0.015510203579, W2f = 0.0122448959985, frac = (x) => x - Math.floor(x);
const winOf = (s) => (Math.abs(frac(s.start)) < 1e-6 ? 0 : Math.abs(frac(s.start) - W1f) < 1e-6 ? 1 : 2);
const per = [[], [], []];
for (const s of audio.segments) per[winOf(s)].push(s);
const wins = audio.asr.windows.map((w) => ({ startSec: w.startSec, endSec: w.endSec }));
console.log("\n=== 2. same card, density recomputed from raw text (independent of the passport) ===");
const d2 = A.runSpeechDensity(per, wins);
console.log("coverage/expected per window:");
d2.windows.forEach((s) => {
  const cov = s.markToSec === null ? null : (s.markToSec - s.markFromSec) / s.windowSec;
  console.log(`  win${s.windowIdx}: segs=${String(s.segments).padStart(3)} coverage=${cov === null ? "-" : cov.toFixed(3)} density=${s.densityRatio === null ? "-" : s.densityRatio.toFixed(3)}`);
});
console.log(JSON.stringify(A.classifyClockCompression(d2)));

console.log("\n=== 3. live probe runs: each one judged in a run alongside the healthy window 0 ===");
const probes = JSON.parse(fs.readFileSync("probe-results.json", "utf8"));
const healthy0 = { segs: per[0], win: { startSec: 0, endSec: 900 } };
for (const k of Object.keys(probes)) {
  const p = probes[k];
  const abs = p.segs.filter((s) => typeof s.start === "number").map((s) => ({ start: p.startSec + s.start, text: s.text }));
  const dd = A.runSpeechDensity([healthy0.segs, abs], [healthy0.win, { startSec: p.startSec, endSec: p.endSec }]);
  const s = dd.windows[1];
  const cov = (s.markToSec - s.markFromSec) / s.windowSec;
  const fired = A.classifyClockCompression(dd).some((x) => x.windowIdx === 1);
  console.log(`  ${k.padEnd(36)} coverage=${cov.toFixed(3)} density=${s.densityRatio.toFixed(3)} → ${fired ? "СЖАТО (гейт сработал)" : "ok"}`);
}
