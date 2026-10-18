// tests/roomMediaAttach.test.js — O-102: media attached to a material built without it.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.window = global.window || {};
const M = require("../public/js/room-media-attach.js");

test("a stretch and a shift recompute every timed row; untimed rows stay untimed", () => {
  const revision = { segments: [{ text: "א", start_ms: 1000, end_ms: 2000 }, { text: "ב", start_ms: null, end_ms: null }] };
  const times = M.correctedTimes(revision, { apply_scale: 1.04, apply_offset_ms: 500 });
  assert.deepEqual(times, [{ text: "א", startSec: 1.54, endSec: 2.58 }, { text: "ב", startSec: null, endSec: null }]);
  assert.deepEqual(M.correctedTimes(revision, { apply_offset_ms: -400 })[0], { text: "א", startSec: 0.6, endSec: 1.6 });
});

test("the Room loads every piece the attach path needs, at the URLs the service worker precaches", () => {
  const room = fs.readFileSync(path.join(__dirname, "../public/library.html"), "utf8");
  const sw = fs.readFileSync(path.join(__dirname, "../public/sw.js"), "utf8");
  for (const name of ["media-readiness", "local-asr-client", "subtitle-material-import", "subtitle-media-attach", "room-media-attach", "media-store", "media-stream-store"]) {
    const m = room.match(new RegExp('<script src="(/js/' + name + '\\.js\\?v=\\d+)"'));
    assert.ok(m, name + " is loaded in the Room");
    assert.ok(sw.includes(JSON.stringify(m[1])), m[1] + " is precached exactly");
  }
  const ui = fs.readFileSync(path.join(__dirname, "../public/js/study-video-source-ui.js"), "utf8");
  assert.match(ui, /RoomMediaAttach\.mount\(dialog,String\(id\)\)/);
});
