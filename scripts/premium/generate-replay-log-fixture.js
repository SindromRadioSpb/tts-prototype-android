#!/usr/bin/env node
"use strict";
// generate-replay-log-fixture.js — produces the PINNED replay-over-log golden fixture for
// smoke:server-replay (CLG-P4, AI_MENTOR_RECON §9). Scenarios exercise the LOG-level contracts
// the per-step golden (fsrs6-golden-v1) can't see: seed watermark (incl. D3 multi-seed
// earliest-wins), skip-fold, annul/mark neutrality, out-of-order input, mixed time precision,
// mixed sources. Expected states come from the INDEPENDENT reference replay (ts-fsrs@5.4.1 +
// spec-reimplemented product contracts — scripts/premium/lib/fsrs-reference-replay.js).
// Re-run ONLY on a deliberate generation bump. Writes: fixtures/fsrs/replay-log-golden-v1.json

const fs = require("fs");
const path = require("path");
const { referenceReplay, PARAMS } = require("./lib/fsrs-reference-replay");
const refPkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "node_modules", "ts-fsrs", "package.json"), "utf8"));

const KEY = "שלום#noun";
const T = (d, extra) => `2026-01-0${d}T10:00:00${extra != null ? extra : ".000"}Z`;
const seed = (at, interval, reps, lapses, idSuffix) => ({
  id: "seed:" + KEY + "#" + (idSuffix || "aaaaaaaaaaaa"), item_key: KEY, kind: "seed", reviewed_at: at,
  grade: null, source: "seed-sm2", meta_json: JSON.stringify({ interval, reps, lapses, scheme: "sm2-lite" }),
});
const rev = (at, grade, src, ch) => ({
  id: "app:" + at + ":" + grade, item_key: KEY, kind: "review", reviewed_at: at, grade,
  source: src || "room-recall", channel: ch || "read:mc", meta_json: "{}",
});
const skip = (at) => ({ id: "app:skip:" + at, item_key: KEY, kind: "skip", reviewed_at: at, grade: 1, source: "room-recall", channel: "read:mc", meta_json: "{}" });
const mark = (at, status) => ({ id: "mark:" + at, item_key: KEY, kind: "mark", reviewed_at: at, grade: null, source: "word-mark", meta_json: JSON.stringify({ status }) });
const annul = (at) => ({ id: "annul:" + at, item_key: KEY, kind: "annul", reviewed_at: at, grade: null, source: "op", meta_json: JSON.stringify({ annul_of: "x" }) });

const SCENARIOS = [
  { name: "plain-chain", rows: [rev(T(1), 3), rev(T(2), 3), rev(T(3), 1), rev(T(4), 3)] },
  { name: "seed-then-reviews", rows: [seed(T(1), 12, 4, 1), rev(T(2), 3), rev(T(3), 4)] },
  { name: "seed-interval-0", rows: [seed(T(1), 0, 2, 2), rev(T(2), 3)] },
  { name: "skip-folds-like-again", rows: [seed(T(1), 5, 1, 0), rev(T(2), 3), skip(T(3))] },
  { name: "multi-seed-earliest-wins", rows: [seed(T(1), 10, 3, 0, "aaaaaaaaaaaa"), rev(T(2), 3), seed(T(1), 1, 1, 0, "bbbbbbbbbbbb"), rev(T(3), 3)] },
  { name: "mark-annul-neutral", rows: [seed(T(1), 7, 2, 0), mark(T(2), "l2"), rev(T(3), 3), annul(T(4)), mark(T(5), "l3")] },
  { name: "rows-before-seed-ignored", rows: [rev(T(1), 3, "studio-trainer", null), rev(T(2), 1), seed(T(3), 20, 6, 2), rev(T(4), 3)] },
  { name: "mixed-time-precision", rows: [rev("2026-01-01T10:00:00Z", 3), rev("2026-01-02T10:00:00.500Z", 3), rev(T(3), 4)] },
  { name: "out-of-order-input", shuffleNote: "input array intentionally unordered — replay must sort by (epoch, id)", rows: [rev(T(4), 3), seed(T(1), 3, 1, 0), rev(T(2), 3), rev(T(3), 1)] },
  { name: "mixed-sources", rows: [seed(T(1), 2, 1, 0), rev(T(2), 3, "anki", null), rev(T(3), 3, "reading-tap", "reading:tap"), rev(T(4), 2, "studio-trainer", null)] },
];

const out = {
  provenance: {
    reference: "ts-fsrs", reference_version: refPkg.version, generation: "FSRS-6.0",
    params: { request_retention: PARAMS.request_retention, maximum_interval: PARAMS.maximum_interval, scheduler: "long-term" },
    contracts: "seed watermark earliest-wins (D3) · skip folds as its grade · annul/mark neutral · epoch+id ordering · M10 Δt clamp · product interval/due",
    generated_by: "scripts/premium/generate-replay-log-fixture.js",
    note: "committed fixture — smoke:server-replay asserts server repo replay AND fsrs-core.replay AND the live ts-fsrs reference against these vectors",
  },
  scenarios: [],
};

for (const sc of SCENARIOS) {
  const expected = referenceReplay(sc.rows);
  out.scenarios.push({ name: sc.name, rows: sc.rows, expected });
}

const dest = path.join(__dirname, "fixtures", "fsrs", "replay-log-golden-v1.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 1));
console.log("written", dest, "scenarios:", out.scenarios.length);
