// scripts/premium/captions-parse-smoke.js
// W2-S5a гейт: разбор .vtt сверяется с json3-сериализацией ТОЙ ЖЕ дорожки (independent oracle).
// Планка зафиксирована прототипом разведки 2026-07-27 и не должна падать.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const CP = require("../../public/js/captions-parse.js");

const FIX = path.join(__dirname, "fixtures", "captions");
const norm = (s) => String(s).replace(/\s+/g, " ").trim();

function oracle(file) {
  const j = JSON.parse(fs.readFileSync(path.join(FIX, file), "utf8"));
  return (j.events || [])
    .filter((e) => e.segs)
    .map((e) => ({ start: (e.tStartMs || 0) / 1000, text: norm(e.segs.map((s) => s.utf8 || "").join("")) }))
    .filter((e) => e.text);
}

const CASES = [
  { label: "manual-hebrew", vtt: "ted-hebrew-manual.vtt", json: "ted-hebrew-manual.json3.json",
    expectRolling: false, minSegments: 411 },
  { label: "rolling-auto-hebrew", vtt: "hebrew-auto-rolling.vtt", json: "hebrew-auto-rolling.json3.json",
    expectRolling: true, minSegments: 65 },
];

let failed = 0;
for (const c of CASES) {
  // Оракул хранит по событию на РЕПЛИКУ, поэтому паритет сверяется до слияния (merge:false).
  // Инварианты самого слияния проверяются отдельным блоком ниже.
  const r = CP.parse(fs.readFileSync(path.join(FIX, c.vtt), "utf8"), { merge: false });
  const o = oracle(c.json);
  const problems = [];
  if (!r.ok) problems.push(`parse failed: ${r.error_code}`);
  if (r.rolling !== c.expectRolling) problems.push(`rolling=${r.rolling}, expected ${c.expectRolling}`);
  if (r.segments.length !== o.length) problems.push(`segments=${r.segments.length}, oracle=${o.length}`);
  if (r.segments.length < c.minSegments) problems.push(`segments < ${c.minSegments}`);
  let textOk = 0, startOk = 0;
  const n = Math.min(r.segments.length, o.length);
  for (let i = 0; i < n; i++) {
    if (norm(r.segments[i].text) === o[i].text) textOk++;
    if (Math.abs(r.segments[i].start - o[i].start) <= 0.05) startOk++;
  }
  if (textOk !== n) problems.push(`text parity ${textOk}/${n} (must be 100%)`);
  if (startOk !== n) problems.push(`start parity ${startOk}/${n} within 50ms (must be 100%)`);
  for (const s of r.segments) {
    if (/<[^>]*>|&[a-z]+;/i.test(s.text)) { problems.push(`tag/entity leaked: ${s.text.slice(0, 40)}`); break; }
  }
  console.log(`${problems.length ? "FAIL" : "ok  "} ${c.label}: segments=${r.segments.length} oracle=${o.length} text=${textOk}/${n} start=${startOk}/${n}`);
  problems.forEach((p) => console.log(`      - ${p}`));
  failed += problems.length ? 1 : 0;
}

// Инварианты слияния (§4.5 дизайна): текст не теряется, старты честные, кап достижим.
for (const c of CASES) {
  const raw = fs.readFileSync(path.join(FIX, c.vtt), "utf8");
  const un = CP.parse(raw, { merge: false });
  const me = CP.parse(raw);
  const flat = (r) => r.segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  const problems = [];
  if (!me.ok) problems.push(`merged parse failed: ${me.error_code}`);
  if (flat(me) !== flat(un)) problems.push("merging changed the text (lost or reordered content)");
  if (me.cueCount !== un.segments.length) problems.push(`cueCount=${me.cueCount}, cues=${un.segments.length}`);
  if (!(me.segments.length <= un.segments.length)) problems.push("merging produced MORE segments than cues");
  if (me.segments.length > CP.MAX_SEGMENTS) problems.push(`merged segments ${me.segments.length} exceed the cap`);
  const starts = new Set(un.segments.map((s) => s.start));
  for (const s of me.segments) {
    if (!starts.has(s.start)) { problems.push(`invented start ${s.start} — not the start of any cue`); break; }
  }
  for (let i = 1; i < me.segments.length; i++) {
    if (me.segments[i].start < me.segments[i - 1].start) { problems.push(`non-monotonic at ${i}`); break; }
  }
  console.log(`${problems.length ? "FAIL" : "ok  "} merge/${c.label}: ${un.segments.length} cues -> ${me.segments.length} segments`);
  problems.forEach((p) => console.log(`      - ${p}`));
  failed += problems.length ? 1 : 0;
}

for (const f of ["youtube-panel-en.txt", "youtube-panel-he.txt"]) {
  const r = CP.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
  const problems = [];
  if (!r.ok) problems.push(`parse failed: ${r.error_code}`);
  if (r.format !== "youtube-panel") problems.push(`format=${r.format}`);
  if (!r.segments.length) problems.push("no segments");
  if (r.droppedHeadings < 2) problems.push(`droppedHeadings=${r.droppedHeadings}, expected >= 2`);
  for (let i = 1; i < r.segments.length; i++) {
    if (r.segments[i].start < r.segments[i - 1].start) { problems.push(`non-monotonic at ${i}`); break; }
  }
  if (r.segments.some((s) => /Three themes|Introduction/.test(s.text))) problems.push("heading leaked into cue text");
  console.log(`${problems.length ? "FAIL" : "ok  "} ${f}: segments=${r.segments.length} droppedHeadings=${r.droppedHeadings}`);
  problems.forEach((p) => console.log(`      - ${p}`));
  failed += problems.length ? 1 : 0;
}

if (failed) { console.error(`\ncaptions-parse gate FAILED (${failed} case(s))`); process.exit(1); }
console.log("\ncaptions-parse gate OK");
