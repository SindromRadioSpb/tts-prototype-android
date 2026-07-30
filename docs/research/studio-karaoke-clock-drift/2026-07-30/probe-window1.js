#!/usr/bin/env node
"use strict";
// PROBE (root-cause phase 3): is the "counted, not measured" clock reproducible for the window
// that broke, and does a SHORTER slice stay honest? Uses the production modules and the same
// transport as prod (sliced-mp3 + plain ASR_PROMPT).
//
// Honesty detectors (independent of what the model says about itself):
//   r      = Pearson r between segment text length and the mark delta to the next segment.
//            An honest clock tracks how much was said (owner file window 0: r=0.81);
//            a counted clock does not (broken window 1: r=0.05).
//   span   = (last mark - first mark) / audio length of the slice. Compressed clock < 1.
const fs = require("fs");
const path = require("path");
const https = require("https");
const REPO = "E:/projects/tts-prototype-android";
try { require(path.join(REPO, "node_modules", "dotenv")).config({ path: path.join(REPO, ".env") }); } catch (e) { console.error("dotenv:", e.message); }
const A = require(path.join(REPO, "public", "js", "asr-transcript.js"));
const GF = require(path.join(REPO, "public", "js", "gemini-files.js"));
const MS = require(path.join(REPO, "public", "js", "mp3-slice.js"));

const KEY = process.env.INGEST_SMOKE_GEMINI_KEY || process.env.GEMINI_API_KEY;
if (!KEY) { console.error("no key"); process.exit(1); }
const MIME = "audio/mpeg";
const FILE = "C:/Users/lletp/Downloads/Freed Israeli hostage Mia Schem in first interview since her release from Hamas captivity in Gaza.mp3";
const OUT = "probe-results.json";

function asrCall(fileUri) {
  const r = GF.buildAsrRequest(KEY, fileUri, MIME, A.ASR_PROMPT);
  const u = new URL(r.url);
  return new Promise((resolve, reject) => {
    const req = https.request({ host: u.host, path: u.pathname + u.search, method: "POST", headers: r.init.headers }, (res) => {
      const parts = [];
      res.on("data", (c) => parts.push(c));
      res.on("end", () => {
        const body = Buffer.concat(parts).toString("utf8");
        if (res.statusCode !== 200) return reject(Object.assign(new Error("HTTP " + res.statusCode + ": " + body.slice(0, 300)), { body }));
        try {
          const data = JSON.parse(body);
          const content = ((data.candidates || [])[0] || {}).content;
          resolve(((content && content.parts) || []).map((p) => p.text || "").join(""));
        } catch (e) { reject(e); }
      });
    });
    req.setTimeout(0);
    req.on("error", reject);
    req.write(r.init.body); req.end();
  });
}

const chars = (t) => String(t || "").replace(/[^\p{L}\p{N}]/gu, "").length;
function honesty(segs, sliceSec) {
  const d = [], c = [];
  for (let i = 0; i + 1 < segs.length; i++) {
    const a = segs[i].start, b = segs[i + 1].start;
    if (typeof a !== "number" || typeof b !== "number") continue;
    d.push(b - a); c.push(chars(segs[i].text));
  }
  if (d.length < 5) return { r: null, span: null, n: d.length };
  const n = d.length, mx = d.reduce((a, b) => a + b) / n, my = c.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (d[i] - mx) * (c[i] - my); sxx += (d[i] - mx) ** 2; syy += (c[i] - my) ** 2; }
  const marks = segs.map((s) => s.start).filter((x) => typeof x === "number");
  return {
    r: +(sxy / Math.sqrt(sxx * syy || 1)).toFixed(3),
    span: +(((marks[marks.length - 1] - marks[0]) / sliceSec)).toFixed(3),
    meanDelta: +mx.toFixed(2), n: segs.length,
    words: segs.reduce((s, x) => s + String(x.text || "").trim().split(/\s+/).filter(Boolean).length, 0),
  };
}

(async () => {
  const u8 = new Uint8Array(fs.readFileSync(FILE));
  const map = MS.buildFrameMap(u8);
  console.log(`frame map: ${map.frames} frames, ${map.totalSec.toFixed(1)}s, badResync=${map.badResync}`);

  // A/B: the exact production window that broke (870..1800). C..E: same audio in 310s slices.
  const plan = [
    { id: "A prod window 870-1800 run1", wins: [{ startSec: 870, endSec: 1800 }] },
    { id: "B prod window 870-1800 run2", wins: [{ startSec: 870, endSec: 1800 }] },
    { id: "C 310s slices of the same region", wins: [{ startSec: 870, endSec: 1180 }, { startSec: 1180, endSec: 1490 }, { startSec: 1490, endSec: 1800 }] },
  ];
  const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  for (const p of plan) {
    const chunks = MS.sliceChunks(u8, p.wins, map);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const key = p.id + "#" + i;
      if (results[key]) { console.log("cached: " + key); continue; }
      const sliceSec = c.endSec - c.startSec;
      console.log(`\n${key}: [${c.startSec.toFixed(1)}..${c.endSec.toFixed(1)}] ${(c.bytes.length / 1048576).toFixed(1)}MB uploading…`);
      const ab = c.bytes.buffer.slice(c.bytes.byteOffset, c.bytes.byteOffset + c.bytes.byteLength);
      const up = await GF.uploadFile(KEY, ab, MIME);
      if (up.state !== "ACTIVE") await GF.waitActive(KEY, up.name, { timeoutMs: 120000 });
      const t0 = Date.now();
      const parsed = A.parseAsrResponse(await asrCall(up.fileUri));
      const ms = Date.now() - t0;
      const h = honesty(parsed.segments || [], sliceSec);
      results[key] = { startSec: c.startSec, endSec: c.endSec, sliceSec, ms, honesty: h,
                       segs: (parsed.segments || []).map((s) => ({ start: s.start, text: s.text })) };
      fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
      console.log(`  ${ms}ms  segments=${h.n} words=${h.words} meanDelta=${h.meanDelta}s  r=${h.r}  markSpan/slice=${h.span}`);
    }
  }
  console.log("\n=== summary ===");
  for (const k of Object.keys(results)) {
    const r = results[k];
    console.log(k.padEnd(36), `slice=${r.sliceSec.toFixed(0)}s segs=${String(r.honesty.n).padStart(3)} r=${String(r.honesty.r).padStart(6)} span=${String(r.honesty.span).padStart(5)} meanDelta=${r.honesty.meanDelta}s`);
  }
})().catch((e) => { console.error("FAILED:", e.message, String(e.body || "").slice(0, 400)); process.exit(1); });
