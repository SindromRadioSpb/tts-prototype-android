// Heal the owner's saved card: replace the marks of the broken chunk (870–1800) with times
// measured by the HEALTHY re-run of the same chunk (probe run B, already paid for), matched to
// the card's existing segments by TEXT. Rows, translations and edits are untouched.
// Verified afterwards against a THIRD source (YouTube captions) that never took part in healing.
const fs = require("fs");

const CARD = "C:/Users/lletp/Downloads/text-card-заложница-миа-интервью.json";
const OUT = "text-card-заложница-миа-интервью-healed.json";

const norm = (s) => String(s || "").normalize("NFKC").replace(/[\u0591-\u05C7]/g, "")
  .replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

// ── banded LCS: our word stream -> reference word stream with times ──────────────────────────
function alignTimes(ours, ref, band) {
  const N = ours.length, M = ref.length, BAND = band || 400, width = 2 * BAND + 1;
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
          const sc = prev[dD] + (ours[i - 1].w === ref[j - 1].w ? 2 : -1);
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
    if (dir === 0) { if (ours[i - 1].w === ref[j - 1].w) tOf[i - 1] = ref[j - 1].t; i--; j--; }
    else if (dir === 1) i--;
    else { j--; if (j < 0) break; }
  }
  return tOf;
}
function segTimes(segs, ref, band) {
  const ours = [];
  segs.forEach((s, k) => { for (const p of norm(s.text).split(" ")) if (p) ours.push({ w: p, seg: k }); });
  const tOf = alignTimes(ours, ref, band);
  const out = new Array(segs.length).fill(null);
  for (let k = 0; k < ours.length; k++) { const s = ours[k].seg; if (out[s] == null && tOf[k] != null) out[s] = tOf[k]; }
  return out;
}

const card = JSON.parse(fs.readFileSync(CARD, "utf8"));
const audio = card.card.source_meta.source.audio;
const segs = audio.segments;

// ── reference: the healthy re-run of the broken chunk (probe B) ──────────────────────────────
const probes = JSON.parse(fs.readFileSync("probe-results.json", "utf8"));
const runB = probes["B prod window 870-1800 run2#0"];
const ref = [];
for (let si = 0; si < runB.segs.length; si++) {
  const s = runB.segs[si];
  if (typeof s.start !== "number") continue;
  const words = norm(s.text).split(" ").filter(Boolean);
  if (!words.length) continue;
  // Время слова ВНУТРИ сегмента раскладывается линейно между двумя ИЗМЕРЕННЫМИ границами
  // (start этого сегмента и start следующего). Это не восстановление времени из текста — обе
  // границы измерены здоровым прогоном; интерполируется только положение внутри ~10 секунд.
  let next = null;
  for (let j = si + 1; j < runB.segs.length; j++) { if (typeof runB.segs[j].start === "number") { next = runB.segs[j].start; break; } }
  const a = runB.startSec + s.start;
  const b = next == null ? a + words.length * 0.7 : runB.startSec + next;
  for (let w = 0; w < words.length; w++) ref.push({ w: words[w], t: a + ((b - a) * w) / words.length });
}
console.log(`reference (healthy re-run): ${runB.segs.length} segments, ${ref.length} words, ${runB.startSec.toFixed(0)}..${runB.endSec.toFixed(0)}s`);

// ── heal only the broken chunk's segments (74..208) ──────────────────────────────────────────
const W1f = 0.015510203579, frac = (x) => x - Math.floor(x);
const winOf = (s) => (Math.abs(frac(s.start)) < 1e-6 ? 0 : Math.abs(frac(s.start) - W1f) < 1e-6 ? 1 : 2);
const idx = segs.map((s, i) => i).filter((i) => winOf(segs[i]) === 1);
console.log(`broken chunk segments: ${idx[0]}..${idx[idx.length - 1]} (${idx.length})`);

const healed = segTimes(idx.map((i) => segs[i]), ref, 300);
let placed = 0;
for (let k = 0; k < idx.length; k++) if (healed[k] != null) placed++;
console.log(`aligned to the healthy run: ${placed}/${idx.length}`);

// Не сматченные (модель второго прогона написала эти слова иначе) — линейная интерполяция между
// СОСЕДНИМИ доказанными метками. Это не выдумка времени из текста (§6 отчёта): обе границы
// измерены, интерполируется только положение внутри короткого промежутка.
for (let k = 0; k < healed.length; k++) {
  if (healed[k] != null) continue;
  let a = k - 1; while (a >= 0 && healed[a] == null) a--;
  let b = k + 1; while (b < healed.length && healed[b] == null) b++;
  if (a >= 0 && b < healed.length) healed[k] = healed[a] + ((healed[b] - healed[a]) * (k - a)) / (b - a);
  else if (a >= 0) healed[k] = healed[a];
  else if (b < healed.length) healed[k] = healed[b];
}
// монотонность (караоке требует неубывания)
for (let k = 1; k < healed.length; k++) if (healed[k] < healed[k - 1]) healed[k] = healed[k - 1];

const before = idx.map((i) => segs[i].start);
for (let k = 0; k < idx.length; k++) segs[idx[k]].start = Math.round(healed[k] * 1000) / 1000;

// ── verify against a THIRD source that took no part in healing ───────────────────────────────
const sub = JSON.parse(fs.readFileSync("mia.iw-orig.json3", "utf8"));
const capt = [];
for (const e of sub.events || []) {
  if (!e.segs) continue;
  for (const s of e.segs) {
    const w = norm(s.utf8);
    if (!w) continue;
    for (const p of w.split(" ")) if (p) capt.push({ w: p, t: ((e.tStartMs || 0) + (s.tOffsetMs || 0)) / 1000 });
  }
}
const oracle = new Map(require("./oracle-errors.json").map((r) => [r.seg, r.real]));
function score(label, getMark) {
  const errs = [];
  for (const i of idx) { const real = oracle.get(i); if (real == null) continue; errs.push(Math.abs(getMark(i) - real)); }
  errs.sort((a, b) => a - b);
  const q = (x) => errs[Math.min(errs.length - 1, Math.floor((errs.length - 1) * x))];
  console.log(label.padEnd(28), "n=" + errs.length, "median=" + q(0.5).toFixed(2) + "s", "p90=" + q(0.9).toFixed(1) + "s",
    "max=" + errs[errs.length - 1].toFixed(1) + "s",
    "<=2s:" + ((errs.filter((e) => e <= 2).length / errs.length) * 100).toFixed(0) + "%",
    "<=5s:" + ((errs.filter((e) => e <= 5).length / errs.length) * 100).toFixed(0) + "%");
}
console.log("\nчанк 870–1800, независимый оракул (субтитры YouTube — в лечении не участвовали):");
score("  БЫЛО (в карточке)", (i) => before[idx.indexOf(i)]);
score("  СТАЛО (вылечено)", (i) => segs[i].start);

// ── rebuild the row timing exactly as the app would ──────────────────────────────────────────
const A = require("E:/projects/tts-prototype-android/public/js/asr-transcript.js");
const rowSegIdx = segs.map((s, i) => i);
const timing = A.buildRowTiming(segs, rowSegIdx);
audio.timing = timing;
audio.timingDropReason = null;
audio.timingDropDetail = null;
audio.timingHeal = { v: 1, at: new Date().toISOString(), chunk: { fromSec: 870, toSec: 1800 },
                     source: "asr-rerun-aligned", alignedSegments: placed, totalSegments: idx.length,
                     note: "docs/research/studio-karaoke-clock-drift/2026-07-30" };
// сжатых диапазонов больше нет — чанк переспрошен и оказался здоров
if (audio.asr) { audio.asr.clockCompressedRanges = []; audio.asr.warnings = (audio.asr.warnings || []).filter((w) => w !== "ASR_MARKS_UNRELIABLE"); }

fs.writeFileSync(OUT, JSON.stringify(card, null, 1));
console.log(`\nвылеченная карточка: ${OUT} (${timing.entries.length} записей тайминга)`);

// строки владельца, о которых шла речь
for (const r of [86, 87, 88, 89, 90]) {
  console.log(`  строка ${r + 1}: было ${before[idx.indexOf(r)] !== undefined ? before[idx.indexOf(r)].toFixed(1) : segs[r].start.toFixed(1)} → стало ${segs[r].start.toFixed(1)} (оракул ${(oracle.get(r) || 0).toFixed(1)})`);
}
