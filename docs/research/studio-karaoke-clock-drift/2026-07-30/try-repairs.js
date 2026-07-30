// Score candidate offline re-timing strategies for the broken ASR window against the
// YouTube-caption oracle (oracle-errors.json produced by align-oracle.js).
const fs = require("fs");
const card = JSON.parse(fs.readFileSync("C:/Users/lletp/Downloads/text-card-заложница-миа-интервью.json", "utf8"));
const segs = card.card.source_meta.source.audio.segments;
const oracle = new Map(require("./oracle-errors.json").map((r) => [r.seg, r.real]));

const W1f = 0.015510203579;
const frac = (x) => x - Math.floor(x);
const winOf = (s) => (Math.abs(frac(s.start)) < 1e-6 ? 0 : Math.abs(frac(s.start) - W1f) < 1e-6 ? 1 : 2);
const chars = (t) => String(t || "").replace(/\s+/g, "").length;

const idx = segs.map((s, i) => i).filter((i) => winOf(segs[i]) === 1);
const first = idx[0], last = idx[idx.length - 1];
// anchors we legitimately know WITHOUT the model's in-window clock:
//   left  = real start of the first kept segment of this window (from the previous window's honest tail)
//   right = real start of the first segment of the NEXT window (its own honest head)
const leftAnchor = oracle.get(first);           // in prod: previous window's last honest mark + its span
const rightAnchor = oracle.get(last + 1) != null ? oracle.get(last + 1) : 1769.0;

function score(name, timeOf) {
  const errs = [];
  for (const i of idx) {
    const real = oracle.get(i);
    if (real == null) continue;
    errs.push(Math.abs(timeOf(i) - real));
  }
  errs.sort((a, b) => a - b);
  const p = (q) => errs[Math.min(errs.length - 1, Math.floor((errs.length - 1) * q))];
  console.log(
    name.padEnd(46),
    "n=" + String(errs.length).padStart(3),
    "median=" + p(0.5).toFixed(1).padStart(6),
    "p90=" + p(0.9).toFixed(1).padStart(7),
    "max=" + errs[errs.length - 1].toFixed(1).padStart(7),
    "<=2s:" + ((errs.filter((e) => e <= 2).length / errs.length) * 100).toFixed(0).padStart(3) + "%",
    "<=5s:" + ((errs.filter((e) => e <= 5).length / errs.length) * 100).toFixed(0).padStart(3) + "%"
  );
}

// S0 — what ships today (raw model marks)
score("S0 raw model marks (today)", (i) => segs[i].start);

// S1 — proportional by characters across the window span
{
  const total = idx.reduce((n, i) => n + chars(segs[i].text), 0);
  const span = rightAnchor - leftAnchor;
  let acc = 0; const t = {};
  for (const i of idx) { t[i] = leftAnchor + (acc / total) * span; acc += chars(segs[i].text); }
  score("S1 proportional by chars", (i) => t[i]);
}

// S2 — proportional by words
{
  const w = (i) => String(segs[i].text || "").trim().split(/\s+/).filter(Boolean).length;
  const total = idx.reduce((n, i) => n + w(i), 0);
  const span = rightAnchor - leftAnchor;
  let acc = 0; const t = {};
  for (const i of idx) { t[i] = leftAnchor + (acc / total) * span; acc += w(i); }
  score("S2 proportional by words", (i) => t[i]);
}

// S3 — monotone linear rescale of the model's own marks onto [left,right]
{
  const m0 = segs[first].start, m1 = segs[last].start;
  const t = {};
  for (const i of idx) t[i] = leftAnchor + ((segs[i].start - m0) / (m1 - m0)) * (rightAnchor - leftAnchor);
  score("S3 linear rescale of model marks", (i) => t[i]);
}

// S4 — blend: model marks trusted while they still correlate with text, proportional after
// (uses only in-window signals: rolling correlation between mark delta and text length)
{
  const t = {};
  // find the last index where the model clock still tracks text length (rolling r over 12 segs)
  let breakAt = last;
  for (let k = 0; k + 12 < idx.length; k++) {
    const win = idx.slice(k, k + 12);
    const d = [], c = [];
    for (let q = 0; q + 1 < win.length; q++) { d.push(segs[win[q + 1]].start - segs[win[q]].start); c.push(chars(segs[win[q]].text)); }
    const n = d.length, mx = d.reduce((a, b) => a + b) / n, my = c.reduce((a, b) => a + b) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let q = 0; q < n; q++) { sxy += (d[q] - mx) * (c[q] - my); sxx += (d[q] - mx) ** 2; syy += (c[q] - my) ** 2; }
    const r = sxy / Math.sqrt(sxx * syy || 1);
    if (r < 0.25) { breakAt = win[0]; break; }
  }
  const head = idx.filter((i) => i <= breakAt), tail = idx.filter((i) => i > breakAt);
  for (const i of head) t[i] = segs[i].start;
  const lA = head.length ? segs[head[head.length - 1]].start : leftAnchor;
  const total = tail.reduce((n, i) => n + chars(segs[i].text), 0) || 1;
  let acc = 0;
  for (const i of tail) { t[i] = lA + (acc / total) * (rightAnchor - lA); acc += chars(segs[i].text); }
  console.log("   (S4 trusts model marks up to seg " + breakAt + ", proportional after)");
  score("S4 trust-then-proportional", (i) => t[i]);
}
