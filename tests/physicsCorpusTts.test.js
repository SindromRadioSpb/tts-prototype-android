"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const AdmZip = require("adm-zip");
const tts = require("../scripts/premium/physics-corpus-tts");

const sourceBundle = path.join("G:", "Andasa", "📘 Учебная. 1 год", "Физика", "Корпус", "Физика — задачник, 1 год-learning.zip");

test("canonical Physics bundle plans exactly 74 cards and 425 rows", { skip: !fs.existsSync(sourceBundle) }, () => {
  const inventory = tts.inventoryBundle(sourceBundle, tts.DEFAULT_PROFILE);
  assert.equal(inventory.texts.length, 74);
  assert.equal(inventory.rows.length, 425);
  assert.ok(inventory.clips.size > 0 && inventory.clips.size <= 425);
  assert.equal(inventory.profile, undefined);
  assert.match(inventory.sourceSha256, /^[a-f0-9]{64}$/);
});

test("cache receipts fail closed on missing or changed MP3 bytes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "physics-tts-cache-"));
  const key = "a".repeat(64);
  const body = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(200, 7)]);
  fs.writeFileSync(path.join(dir, key + ".mp3"), body);
  const ledger = { assets: { [key]: { bytes: body.length, sha256: require("crypto").createHash("sha256").update(body).digest("hex") } } };
  assert.ok(tts.cachedReceipt(dir, ledger, key));
  fs.appendFileSync(path.join(dir, key + ".mp3"), Buffer.from("changed"));
  assert.equal(tts.cachedReceipt(dir, ledger, key), null);
});

test("output verifier requires all 425 row links and matching audio hashes", { skip: !fs.existsSync(sourceBundle) }, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "physics-tts-output-"));
  const inventory = tts.inventoryBundle(sourceBundle, tts.DEFAULT_PROFILE);
  const cacheDir = path.join(temp, "cache");
  fs.mkdirSync(cacheDir);
  const ledger = { assets: {} };
  for (const key of inventory.clips.keys()) {
    const body = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(140, Number.parseInt(key.slice(0, 2), 16))]);
    fs.writeFileSync(path.join(cacheDir, key + ".mp3"), body);
    ledger.assets[key] = { bytes: body.length, sha256: require("crypto").createHash("sha256").update(body).digest("hex") };
  }
  const output = path.join(temp, "physics-with-audio.zip");
  const result = tts.buildOutputBundle({ outputBundle: output, cacheDir, profile: tts.DEFAULT_PROFILE }, inventory, ledger);
  assert.equal(result.text_count, 74);
  assert.equal(result.row_count, 425);
  assert.equal(result.audio_assets, inventory.clips.size);
  const zip = new AdmZip(output);
  const library = JSON.parse(zip.readAsText("library/library.json"));
  assert.ok(library.texts.every(text => text.rows.every(row => /^[a-f0-9]{64}$/.test(row.audio_asset_key))));

  for (const validator of ["verify_zip_android_compat.js", "verify_zip_import_markers.js"]) {
    const result = spawnSync(process.execPath, [path.join(__dirname, validator), output], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(result.status, 0, [validator, result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
});
