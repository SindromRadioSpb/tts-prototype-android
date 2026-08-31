"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("content-addressed uploader sends MP3 and its timing sidecar in one idempotent write", async () => {
  const previousFetch = global.fetch;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "push-audio-timing-"));
  const mp3 = path.join(root, "clip.mp3"), timing = path.join(root, "clip.timing.json");
  fs.writeFileSync(mp3, Buffer.from("ID3-test"));
  fs.writeFileSync(timing, JSON.stringify({ v: 1, n: 1, got: 1, words: [{ o: 0, t: 0 }] }));
  let body = null;
  global.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ ok: true, written: true, timingWritten: true }) };
  };
  try {
    const { uploadOne } = require("../scripts/premium/push-canon-audio.js");
    await uploadOne("https://example.test", "a".repeat(64), mp3, timing, 1);
    assert.equal(Buffer.from(body.mp3Base64, "base64").toString(), "ID3-test");
    assert.equal(body.timingJson.words[0].o, 0);
  } finally {
    global.fetch = previousFetch;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
