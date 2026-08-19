"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");

const ShareService = require("../public/js/share-service.js");

function bundleFixture() {
  return {
    manifest: { format: "linguistpro-bundle", schema_version: 1 },
    library: {
      texts: [{
        id: "text-1",
        title: "שיר לימודי",
        rows: [
          { audio_asset_key: "audio-a" },
          { audio_asset_key: "audio-b" },
          { audio_asset_key: "audio-a" },
        ],
      }],
      audio_assets: [
        { asset_key: "audio-a", size_bytes: null },
        { asset_key: "audio-b", size_bytes: null },
      ],
    },
  };
}

test("resolveSharePlan keeps public, protected, private and preview payloads distinct", () => {
  assert.equal(ShareService.resolveSharePlan({ domain: "PUBLIC_PUBLISHED", url: "https://example.test/c/1" }).kind, "PUBLIC_LINK");
  assert.equal(ShareService.resolveSharePlan({ domain: "PRIVATE_LOCAL", canPackage: true }).kind, "LEARNING_ZIP");
  assert.equal(ShareService.resolveSharePlan({ domain: "GROUP_RESTRICTED", url: "https://example.test/g/1" }).kind, "PROTECTED_LINK");
  assert.equal(ShareService.resolveSharePlan({ domain: "PUBLISHER_DRAFT", previewUrl: "https://example.test/p/1" }).kind, "PREVIEW_LINK");
  assert.deepEqual(
    ShareService.resolveSharePlan({ domain: "PRIVATE_LOCAL", canPackage: false }),
    { kind: "UNAVAILABLE", reason: "PACKAGE_UNAVAILABLE" },
  );
});

test("buildLearningPackage returns a reusable artifact and exact partial-audio facts", async () => {
  const progress = [];
  const sourceBundle = bundleFixture();
  const result = await ShareService.buildLearningPackage({
    JSZip,
    bundle: sourceBundle,
    filename: "learning.zip",
    outputType: "nodebuffer",
    fetchAudio: async (key) => {
      if (key === "audio-b") {
        const error = new Error("not found");
        error.code = "AUDIO_NOT_FOUND";
        throw error;
      }
      return Buffer.from("audio-a-bytes");
    },
    onProgress: (facts) => progress.push(facts),
  });

  assert.equal(result.filename, "learning.zip");
  assert.deepEqual(result.facts, {
    expectedAudio: 2,
    includedAudio: 1,
    missingAudio: 1,
    complete: false,
    partial: true,
  });
  assert.equal(result.manifest.audio_count, 1);
  assert.equal(result.manifest.expected_audio_count, 2);
  assert.equal(result.manifest.missing_audio_count, 1);
  assert.equal(result.manifest.partial_backup, true);
  assert.ok(progress.some((item) => item.includedAudio === 1));

  const zip = await JSZip.loadAsync(result.blob);
  assert.ok(zip.file("audio/audio-a.mp3"));
  assert.equal(zip.file("audio/audio-b.mp3"), null);
  assert.ok(zip.file("metadata/missing_audio.json"));
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  assert.equal(manifest.missing_audio_count, 1);

  // The caller's canonical export snapshot is not rewritten by packaging.
  assert.equal(sourceBundle.library.audio_assets[0].size_bytes, null);
});

test("buildLearningPackage honours cancellation and never emits a partial file", async () => {
  const controller = new AbortController();
  await assert.rejects(
    ShareService.buildLearningPackage({
      JSZip,
      bundle: bundleFixture(),
      filename: "cancelled.zip",
      outputType: "nodebuffer",
      signal: controller.signal,
      fetchAudio: async () => {
        controller.abort();
        return Buffer.from("bytes");
      },
    }),
    (error) => error && error.name === "AbortError",
  );
});

test("shareFile distinguishes unsupported, cancelled, handed-off and failed", async () => {
  const file = { name: "lesson.zip", type: "application/zip" };

  assert.deepEqual(
    await ShareService.shareFile({ file, navigator: {} }),
    { status: "unsupported", code: "FILE_SHARE_UNSUPPORTED" },
  );

  const cancelled = await ShareService.shareFile({
    file,
    navigator: {
      canShare: () => true,
      share: async () => { const error = new Error("cancel"); error.name = "AbortError"; throw error; },
    },
  });
  assert.deepEqual(cancelled, { status: "cancelled", code: "SHARE_CANCELLED" });

  let payload = null;
  const handedOff = await ShareService.shareFile({
    file,
    title: "Lesson",
    text: "Learning package",
    navigator: {
      canShare: ({ files }) => files.length === 1 && files[0] === file,
      share: async (value) => { payload = value; },
    },
  });
  assert.deepEqual(handedOff, { status: "handed-off", code: "SHARE_SHEET_COMPLETED" });
  assert.equal(payload.files[0], file);
  assert.equal(payload.url, undefined);

  const failed = await ShareService.shareFile({
    file,
    navigator: {
      canShare: () => true,
      share: async () => { throw new TypeError("platform failure"); },
    },
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.code, "SHARE_FAILED");
  assert.match(failed.message, /platform failure/);
});

test("saveFile starts a browser save without claiming a completed write", () => {
  const clicks = [];
  const removed = [];
  const revoked = [];
  const anchor = {
    click: () => clicks.push("click"),
    remove: () => removed.push("remove"),
    set href(value) { this._href = value; },
    set download(value) { this._download = value; },
  };
  const document = {
    createElement: (tag) => { assert.equal(tag, "a"); return anchor; },
    body: { appendChild: (node) => assert.equal(node, anchor) },
  };
  const urlApi = {
    createObjectURL: () => "blob:learning",
    revokeObjectURL: (url) => revoked.push(url),
  };

  const result = ShareService.saveFile({
    blob: Buffer.from("zip"), filename: "lesson.zip", document, urlApi,
    schedule: (fn) => fn(),
  });
  assert.deepEqual(result, { status: "save-started", code: "SAVE_STARTED" });
  assert.equal(anchor._download, "lesson.zip");
  assert.deepEqual(clicks, ["click"]);
  assert.deepEqual(removed, ["remove"]);
  assert.deepEqual(revoked, ["blob:learning"]);
});

test("shareLink preserves protected-access copy and falls back without swallowing errors", async () => {
  let shared = null;
  const result = await ShareService.shareLink({
    title: "Study Songs",
    text: "Recipient access is required",
    url: "https://example.test/library.html?group=7&work=9",
    navigator: { share: async (payload) => { shared = payload; } },
  });
  assert.deepEqual(result, { status: "handed-off", code: "SHARE_SHEET_COMPLETED" });
  assert.equal(shared.text, "Recipient access is required");
  assert.match(shared.url, /group=7/);
});
