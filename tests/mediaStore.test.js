"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../public/js/media-store.js");

test("mediaFileName: ext from mime, fallback from name, fallback bin", () => {
  const sha = "ab".repeat(32);
  assert.equal(M.mediaFileName(sha, "audio/mpeg", "x.mp3"), "media/" + sha + ".mp3");
  assert.equal(M.mediaFileName(sha, "audio/ogg", "voice.oga"), "media/" + sha + ".ogg");
  assert.equal(M.mediaFileName(sha, "audio/mp4", "Memo.m4a"), "media/" + sha + ".m4a");
  assert.equal(M.mediaFileName(sha, "", "Memo.M4A"), "media/" + sha + ".m4a");   // из имени, lower-case
  assert.equal(M.mediaFileName(sha, "application/x-junk", "noext"), "media/" + sha + ".bin");
});

test("mediaFileName: video mime types", () => {
  const sha = "cd".repeat(32);
  assert.equal(M.mediaFileName(sha, "video/mp4", "x.mp4"), "media/" + sha + ".mp4");
  assert.equal(M.mediaFileName(sha, "video/quicktime", "x.mov"), "media/" + sha + ".mov");
  // mime map itself (not filename fallback) resolves the extension:
  assert.equal(M.mediaFileName(sha, "video/mp4", "noext"), "media/" + sha + ".mp4");
  assert.equal(M.mediaFileName(sha, "video/quicktime", "noext"), "media/" + sha + ".mov");
  assert.equal(M.mediaFileName(sha, "video/webm", "noext"), "media/" + sha + ".webm");
  assert.equal(M.mediaFileName(sha, "video/3gpp", "noext"), "media/" + sha + ".3gp");
  assert.equal(M.mediaFileName(sha, "video/x-matroska", "noext"), "media/" + sha + ".mkv");
});

test("sha256Hex works in Node via webcrypto", async () => {
  const hex = await M.sha256Hex(new TextEncoder().encode("abc").buffer);
  assert.equal(hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
