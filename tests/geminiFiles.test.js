"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const G = require("../public/js/gemini-files.js");

test("buildStartUploadRequest: resumable headers + key header, no key in URL", () => {
  const r = G.buildStartUploadRequest("AIzaTest", { sizeBytes: 123, mimeType: "audio/mpeg", displayName: "x" });
  assert.equal(r.url, "https://generativelanguage.googleapis.com/upload/v1beta/files");
  assert.equal(r.init.headers["x-goog-api-key"], "AIzaTest");
  assert.equal(r.init.headers["X-Goog-Upload-Command"], "start");
  assert.equal(r.init.headers["X-Goog-Upload-Header-Content-Length"], "123");
  assert.equal(r.init.headers["X-Goog-Upload-Header-Content-Type"], "audio/mpeg");
  assert.ok(!r.url.includes("AIzaTest")); // ключ НЕ в URL (не светится в логах прокси)
  assert.equal(JSON.parse(r.init.body).file.display_name, "x");
});

test("buildAsrRequest: file_data + prompt + temperature 0", () => {
  const r = G.buildAsrRequest("AQ.k", "https://gl/files/abc", "audio/mp4", "PROMPT");
  const body = JSON.parse(r.init.body);
  assert.equal(body.generationConfig.temperature, 0);
  assert.equal(body.contents[0].parts[0].file_data.file_uri, "https://gl/files/abc");
  assert.equal(body.contents[0].parts[0].file_data.mime_type, "audio/mp4");
  assert.equal(body.contents[0].parts[1].text, "PROMPT");
  assert.ok(r.url.endsWith(":generateContent"));
});

test("buildAsrRequest: opts.mediaResolution added to generationConfig; omitted without opts", () => {
  const withRes = G.buildAsrRequest("k", "uri", "video/mp4", "p", { mediaResolution: "MEDIA_RESOLUTION_LOW" });
  const bodyWith = JSON.parse(withRes.init.body);
  assert.equal(bodyWith.generationConfig.mediaResolution, "MEDIA_RESOLUTION_LOW");
  assert.equal(bodyWith.generationConfig.temperature, 0);

  const without = G.buildAsrRequest("k", "uri", "audio/mp3", "p");
  const bodyWithout = JSON.parse(without.init.body);
  assert.ok(!("mediaResolution" in bodyWithout.generationConfig));
  assert.equal(bodyWithout.generationConfig.temperature, 0);
});
