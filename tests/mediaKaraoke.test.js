// tests/mediaKaraoke.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { activeSegmentRange } = require("../public/js/studio-media-karaoke.js");

test("activeSegmentRange: before first → null, ranges, tail to rowCount", () => {
  const e = [{ o: 0, t: 2 }, { o: 3, t: 10 }, { o: 4, t: 20 }];
  assert.equal(activeSegmentRange(e, 6, 0), null);
  assert.deepEqual(activeSegmentRange(e, 6, 2), { idx: 0, rowStart: 0, rowEnd: 3 });
  assert.deepEqual(activeSegmentRange(e, 6, 11.5), { idx: 1, rowStart: 3, rowEnd: 4 });
  assert.deepEqual(activeSegmentRange(e, 6, 999), { idx: 2, rowStart: 4, rowEnd: 6 });
  assert.equal(activeSegmentRange([], 6, 5), null);
  assert.equal(activeSegmentRange(null, 6, 5), null);
});
