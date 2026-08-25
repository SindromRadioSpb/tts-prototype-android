"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const publish = require("../scripts/premium/publish-physics-corpus");

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

test("Physics publication uses a separate slug and corpus-specific attestation", () => {
  assert.equal(publish.SLUG, "physics-year1-problems");
  assert.deepEqual(publish.ATTESTATION, {
    public_read_allowed: true,
    public_stream_allowed: true,
    package_download_allowed: true,
    basis: "OWNER_ATTESTATION_PHYSICS_YEAR1_2026_08_25",
    asserted_at: "2026-08-25",
  });
});

test("audio-cache materialization is idempotent and refuses a same-key byte collision", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-physics-cache-"));
  const dataDir = path.join(root, "data");
  const body = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(150, 4)]);
  const key = "b".repeat(64);
  const zip = new AdmZip();
  zip.addFile("audio/" + key + ".mp3", body);
  const source = { zip, assets: new Map([[key, { size_bytes: body.length, content_hash: sha256(body) }]]) };
  assert.deepEqual(publish.materializeAudioCache(source, dataDir).map(item => item.action), ["CREATED"]);
  assert.deepEqual(publish.materializeAudioCache(source, dataDir).map(item => item.action), ["EXISTING"]);
  fs.writeFileSync(path.join(dataDir, "audio-cache", key + ".mp3"), Buffer.from("different"));
  assert.throws(() => publish.materializeAudioCache(source, dataDir), /SHARED_CACHE_COLLISION/);
});
