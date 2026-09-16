// tests/mediaBundleCore.test.js — transport container that carries an unchanged learning package
// next to one prepared media file. Everything here is pure byte work: the media entry is never
// buffered by the product, so the reader must work from a tail slice and byte offsets alone.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const MBC = require("../public/js/media-bundle-core.js");

const H = (char) => char.repeat(64);
const bytes = (text) => new TextEncoder().encode(text);

function assemble(parts, payloads) {
  const chunks = [];
  for (const part of parts) {
    if (part.kind === "data") chunks.push(payloads[part.name]);
    else chunks.push(part.bytes);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

test("crc32 matches the standard vector and streams incrementally", () => {
  assert.equal(MBC.crc32(bytes("123456789")) >>> 0, 0xcbf43926);
  const incremental = MBC.createCrc32();
  incremental.update(bytes("12345"));
  incremental.update(bytes("6789"));
  assert.equal(incremental.value() >>> 0, 0xcbf43926);
  assert.equal(MBC.crc32(new Uint8Array(0)) >>> 0, 0);
});

test("the bundle manifest names both payloads with their hashes", () => {
  const manifest = MBC.buildBundleManifest({
    package: { name: "learning.lplp.zip", size_bytes: 1234, sha256: H("a"), content_root_sha256: H("c") },
    media: { name: "episode-phone.mp4", size_bytes: 4096, sha256: H("b"), mime: "video/mp4",
             rendition: "lite", canonical_sha256: H("e"), derived_from_source_sha256: H("d"), duration_seconds: 2672.68 },
    material: { title: "Episode", rows: 167 },
    app_version: "3.11.559",
    created_at: "2026-09-16T05:00:00.000Z",
  });
  assert.equal(manifest.schema, "lplp-media-bundle-v1");
  assert.equal(manifest.app_version, "3.11.559");
  assert.equal(manifest.package.entry, "package/learning.lplp.zip");
  assert.equal(manifest.media.entry, "media/" + H("b") + ".mp4");
  assert.equal(manifest.media.rendition, "lite");
  assert.equal(manifest.media.canonical_sha256, H("e"));
  assert.equal(manifest.media.derived_from_source_sha256, H("d"));
  assert.deepEqual(manifest.entries, ["manifest.json", manifest.package.entry, manifest.media.entry]);

  assert.throws(() => MBC.buildBundleManifest({ package: { name: "x", size_bytes: 1, sha256: "nope" }, media: {} }),
    (error) => error.code === "BUNDLE_MANIFEST_INVALID");
  assert.throws(() => MBC.buildBundleManifest({
    package: { name: "learning.lplp.zip", size_bytes: 1, sha256: H("a") },
    media: { name: "m.mp4", size_bytes: 1, sha256: H("b"), mime: "video/mp4", rendition: "huge" },
  }), (error) => error.code === "BUNDLE_MANIFEST_INVALID");
});

test("a stored bundle round-trips through its own tail reader", () => {
  const manifestJson = bytes(JSON.stringify({ schema: "lplp-media-bundle-v1" }));
  const packageBytes = bytes("PK-learning-package-bytes");
  const mediaBytes = new Uint8Array(512).map((_value, index) => index % 251);
  const entries = [
    { name: "manifest.json", size: manifestJson.length, crc32: MBC.crc32(manifestJson) },
    { name: "package/learning.lplp.zip", size: packageBytes.length, crc32: MBC.crc32(packageBytes) },
    { name: "media/" + H("b") + ".mp4", size: mediaBytes.length, crc32: MBC.crc32(mediaBytes) },
  ];
  const layout = MBC.storedZipLayout(entries);
  assert.equal(layout.parts.filter((part) => part.kind === "data").length, 3);
  const archive = assemble(layout.parts, {
    "manifest.json": manifestJson,
    "package/learning.lplp.zip": packageBytes,
    ["media/" + H("b") + ".mp4"]: mediaBytes,
  });
  assert.equal(archive.length, layout.total_size);

  // The reader only ever sees the tail plus the byte ranges it computes.
  const tail = archive.slice(Math.max(0, archive.length - 4096));
  const eocd = MBC.locateEndOfCentralDirectory(tail, { fileSize: archive.length });
  assert.equal(eocd.entry_count, 3);
  const central = archive.slice(eocd.central_offset, eocd.central_offset + eocd.central_size);
  const directory = MBC.parseCentralDirectory(central, { central_offset: eocd.central_offset, file_size: archive.length });
  assert.deepEqual(directory.map((entry) => entry.name), entries.map((entry) => entry.name));

  for (const entry of directory) {
    const header = archive.slice(entry.local_header_offset, entry.local_header_offset + 64);
    const start = MBC.dataOffset(header, entry.local_header_offset);
    const payload = archive.slice(start, start + entry.size);
    assert.equal(payload.length, entry.size);
    assert.equal(MBC.crc32(payload) >>> 0, entry.crc32 >>> 0, entry.name);
  }
});

test("only stored, unencrypted entries are accepted", () => {
  const payload = bytes("body");
  const layout = MBC.storedZipLayout([{ name: "a.bin", size: payload.length, crc32: MBC.crc32(payload) }]);
  const archive = assemble(layout.parts, { "a.bin": payload });
  const eocd = MBC.locateEndOfCentralDirectory(archive, { fileSize: archive.length });

  const deflated = archive.slice(eocd.central_offset, eocd.central_offset + eocd.central_size);
  deflated[10] = 8; // compression method
  assert.throws(() => MBC.parseCentralDirectory(deflated, { central_offset: eocd.central_offset, file_size: archive.length }),
    (error) => error.code === "BUNDLE_ENTRY_NOT_STORED");

  const encrypted = archive.slice(eocd.central_offset, eocd.central_offset + eocd.central_size);
  encrypted[8] = 1; // general purpose flags
  assert.throws(() => MBC.parseCentralDirectory(encrypted, { central_offset: eocd.central_offset, file_size: archive.length }),
    (error) => error.code === "BUNDLE_ENTRY_ENCRYPTED");

  assert.throws(() => MBC.locateEndOfCentralDirectory(bytes("not a zip at all"), { fileSize: 16 }),
    (error) => error.code === "BUNDLE_EOCD_MISSING");
});

test("the manifest and the directory must agree before anything is imported", () => {
  const manifest = MBC.buildBundleManifest({
    package: { name: "learning.lplp.zip", size_bytes: 25, sha256: H("a"), content_root_sha256: H("c") },
    media: { name: "episode.mp4", size_bytes: 512, sha256: H("b"), mime: "video/mp4", rendition: "full" },
  });
  const directory = [
    { name: "manifest.json", size: 40, crc32: 1, local_header_offset: 0 },
    { name: manifest.package.entry, size: 25, crc32: 2, local_header_offset: 100 },
    { name: manifest.media.entry, size: 512, crc32: 3, local_header_offset: 200 },
  ];
  const checked = MBC.verifyBundleManifest(manifest, { entries: directory });
  assert.equal(checked.package.local_header_offset, 100);
  assert.equal(checked.media.size, 512);

  assert.throws(() => MBC.verifyBundleManifest(manifest, { entries: directory.filter((entry) => entry.name !== manifest.media.entry) }),
    (error) => error.code === "BUNDLE_MEDIA_ENTRY_MISSING");
  assert.throws(() => MBC.verifyBundleManifest(manifest, {
    entries: directory.map((entry) => (entry.name === manifest.media.entry ? Object.assign({}, entry, { size: 511 }) : entry)),
  }), (error) => error.code === "BUNDLE_MEDIA_SIZE_MISMATCH");
  assert.throws(() => MBC.verifyBundleManifest({ schema: "something-else" }, { entries: directory }),
    (error) => error.code === "BUNDLE_MANIFEST_UNKNOWN_SCHEMA");
});
