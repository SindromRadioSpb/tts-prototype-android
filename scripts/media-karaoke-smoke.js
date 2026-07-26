#!/usr/bin/env node
// scripts/media-karaoke-smoke.js
"use strict";

const { activeSegmentRange } = require("../public/js/studio-media-karaoke.js");

function test(desc, fn) {
  try {
    fn();
    console.log("  ✓ " + desc);
  } catch (e) {
    console.error("  ✗ " + desc);
    console.error("    " + e.message);
    process.exit(1);
  }
}

function eq(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error("Expected " + JSON.stringify(b) + " but got " + JSON.stringify(a));
  }
}

console.log("MEDIA-KARAOKE smoke tests:");

const e = [{ o: 0, t: 2 }, { o: 3, t: 10 }, { o: 4, t: 20 }];

test("before first → null", () => {
  eq(activeSegmentRange(e, 6, 0), null);
});

test("first segment at t=2", () => {
  eq(activeSegmentRange(e, 6, 2), { idx: 0, rowStart: 0, rowEnd: 3 });
});

test("second segment at t=11.5", () => {
  eq(activeSegmentRange(e, 6, 11.5), { idx: 1, rowStart: 3, rowEnd: 4 });
});

test("third segment at t=999", () => {
  eq(activeSegmentRange(e, 6, 999), { idx: 2, rowStart: 4, rowEnd: 6 });
});

test("empty entries", () => {
  eq(activeSegmentRange([], 6, 5), null);
});

test("null entries", () => {
  eq(activeSegmentRange(null, 6, 5), null);
});

console.log("\nMEDIA-KARAOKE SMOKE OK");
