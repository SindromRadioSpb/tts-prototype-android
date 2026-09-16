// tests/mediaBundleIo.test.js — writing and reading the transport container against real Blobs.
// The contract under test is that neither side ever holds the media payload as one buffer.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const MBC = require("../public/js/media-bundle-core.js");
const IO = require("../public/js/media-bundle-io.js");

const H = (char) => char.repeat(64);
const bytes = (text) => new TextEncoder().encode(text);

function collectingWritable() {
  const chunks = [];
  return {
    chunks,
    closed: false,
    async write(chunk) { chunks.push(Buffer.from(chunk)); },
    async close() { this.closed = true; },
    bytes() { return new Uint8Array(Buffer.concat(chunks)); },
  };
}

async function buildFixture() {
  const packageBytes = bytes("PK-inner-learning-package");
  const mediaBytes = new Uint8Array(4096).map((_value, index) => (index * 7) % 251);
  const packageBlob = new Blob([packageBytes]);
  const mediaBlob = new Blob([mediaBytes.subarray(0, 2048), mediaBytes.subarray(2048)]);
  const manifest = MBC.buildBundleManifest({
    package: { name: "learning.lplp.zip", size_bytes: packageBytes.length, sha256: H("a"), content_root_sha256: H("c") },
    media: { name: "episode-phone.mp4", size_bytes: mediaBytes.length, sha256: H("b"), mime: "video/mp4", rendition: "lite" },
    material: { title: "Episode", rows: 3 },
    app_version: "3.11.559",
    created_at: "2026-09-16T05:30:00.000Z",
  });
  return { packageBytes, mediaBytes, packageBlob, mediaBlob, manifest };
}

test("crc32OfBlob streams a payload without buffering it whole", async () => {
  const parts = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
  const value = await IO.crc32OfBlob(new Blob(parts));
  assert.equal(value >>> 0, MBC.crc32(new Uint8Array([1, 2, 3, 4, 5])) >>> 0);
  assert.equal((await IO.crc32OfBlob(new Blob([]))) >>> 0, 0);
});

test("writeBundle emits one archive whose own reader finds both payloads", async () => {
  const fixture = await buildFixture();
  const writable = collectingWritable();
  const progress = [];
  const result = await IO.writeBundle({
    writable,
    manifest: fixture.manifest,
    sources: {
      [fixture.manifest.package.entry]: fixture.packageBlob,
      [fixture.manifest.media.entry]: fixture.mediaBlob,
    },
    onProgress: (event) => progress.push(event.written),
  });
  const archive = writable.bytes();
  assert.equal(writable.closed, true);
  assert.equal(archive.length, result.total_size);
  assert.ok(progress.length >= 2 && progress[progress.length - 1] === archive.length);

  const eocd = MBC.locateEndOfCentralDirectory(archive, { fileSize: archive.length });
  const directory = MBC.parseCentralDirectory(
    archive.slice(eocd.central_offset, eocd.central_offset + eocd.central_size),
    { central_offset: eocd.central_offset, file_size: archive.length },
  );
  const checked = MBC.verifyBundleManifest(fixture.manifest, { entries: directory });
  const start = MBC.dataOffset(archive.slice(checked.media.local_header_offset, checked.media.local_header_offset + 128), checked.media.local_header_offset);
  assert.deepEqual(Array.from(archive.slice(start, start + fixture.mediaBytes.length)), Array.from(fixture.mediaBytes));
});

test("readBundle verifies the manifest against the directory and returns byte ranges", async () => {
  const fixture = await buildFixture();
  const writable = collectingWritable();
  await IO.writeBundle({
    writable, manifest: fixture.manifest,
    sources: {
      [fixture.manifest.package.entry]: fixture.packageBlob,
      [fixture.manifest.media.entry]: fixture.mediaBlob,
    },
  });
  const file = new Blob([writable.bytes()]);
  const read = await IO.readBundle({ file });
  assert.equal(read.manifest.schema, MBC.SCHEMA);
  assert.equal(read.manifest.media.rendition, "lite");
  assert.equal(read.media.size, fixture.mediaBytes.length);
  assert.equal(typeof read.media.data_offset, "number");
  assert.equal(read.package.size, fixture.packageBytes.length);
  const packageBlob = await IO.bundleEntryBlob({ file, entry: read.package });
  assert.deepEqual(Array.from(new Uint8Array(await packageBlob.arrayBuffer())), Array.from(fixture.packageBytes));

  const notABundle = new Blob([bytes("this is not an archive at all")]);
  await assert.rejects(() => IO.readBundle({ file: notABundle }), (error) => error.code === "BUNDLE_EOCD_MISSING");
});

test("importBundleMedia streams the media range into the store, never a buffer", async () => {
  const fixture = await buildFixture();
  const writable = collectingWritable();
  await IO.writeBundle({
    writable, manifest: fixture.manifest,
    sources: {
      [fixture.manifest.package.entry]: fixture.packageBlob,
      [fixture.manifest.media.entry]: fixture.mediaBlob,
    },
  });
  const file = new Blob([writable.bytes()]);
  const read = await IO.readBundle({ file });
  const seen = {};
  const store = {
    streamToOpfs: async (options) => {
      seen.options = options;
      const received = new Uint8Array(await new Response(options.response.body).arrayBuffer());
      seen.received = received.length;
      seen.crc = MBC.crc32(received);
      return { ok: true, opfsPath: "media/" + options.expectedSha256 + ".mp4", sha256: options.expectedSha256, sizeBytes: received.length };
    },
  };
  const stored = await IO.importBundleMedia({ file, read, store, maxBytes: 3 * 1024 * 1024 * 1024 });
  assert.equal(seen.options.expectedSha256, fixture.manifest.media.sha256);
  assert.equal(seen.options.expectedSize, fixture.manifest.media.size_bytes);
  assert.equal(seen.options.maxBytes, 3 * 1024 * 1024 * 1024);
  assert.equal(seen.received, fixture.mediaBytes.length);
  assert.equal(seen.crc >>> 0, MBC.crc32(fixture.mediaBytes) >>> 0);
  assert.equal(stored.opfsPath, "media/" + fixture.manifest.media.sha256 + ".mp4");
  assert.equal(stored.rendition, "lite");
});
