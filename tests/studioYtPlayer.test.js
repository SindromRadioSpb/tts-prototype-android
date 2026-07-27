"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const YT = require("../public/js/studio-yt-player.js");

test("parseVideoId: watch, youtu.be, embed, shorts, with extra params", () => {
  assert.equal(YT.parseVideoId("https://www.youtube.com/watch?v=iG9CE55wbtY"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://www.youtube.com/watch?v=iG9CE55wbtY&t=42s"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://youtu.be/iG9CE55wbtY?si=abc"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://www.youtube.com/embed/iG9CE55wbtY"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://www.youtube.com/shorts/iG9CE55wbtY"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://m.youtube.com/watch?v=iG9CE55wbtY"), "iG9CE55wbtY");
});

test("parseVideoId: rejects non-YouTube and malformed ids", () => {
  assert.equal(YT.parseVideoId("https://vimeo.com/12345"), null);
  assert.equal(YT.parseVideoId("https://example.com/watch?v=iG9CE55wbtY"), null);
  assert.equal(YT.parseVideoId("https://www.youtube.com/watch?v=short"), null);
  assert.equal(YT.parseVideoId("не ссылка"), null);
  assert.equal(YT.parseVideoId(""), null);
  assert.equal(YT.parseVideoId(null), null);
});

test("capability() in Node reports unsupported without throwing", () => {
  const c = YT.capability();
  assert.equal(typeof c.supported, "boolean");
  assert.equal(c.supported, false);
  assert.equal(c.reason, "no-credentialless");
});
