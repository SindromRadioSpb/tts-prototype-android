"use strict";
// Owner decision 2026-09-27: the size a file may have depends on where its bytes go. Local,
// LLM-free work (subtitle material, companion ASR) accepts up to 15 GiB; a paid cloud ASR call
// (Gemini) sends the file itself and is capped at 2 GiB. The refusal texts once said "300MB"
// long after the limit became 3 GiB, so every limit text now takes its number from the constant.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const MediaReadiness = require("../public/js/media-readiness.js");

const GiB = 1024 * 1024 * 1024;
const locales = ["ru", "en", "he"].map((lang) => {
  const src = fs.readFileSync(path.join(__dirname, `../public/i18n/locales/${lang}.js`), "utf8");
  return { lang, src };
});
function localeValue(src, key) {
  const line = src.split("\n").find((l) => l.trim().startsWith(key + ":"));
  return line ? JSON.parse(line.trim().slice(key.length + 1).trim().replace(/,$/, "")) : null;
}

test("cloud ASR has its own 2 GiB ceiling below the local 15 GiB one", () => {
  assert.equal(MediaReadiness.CLOUD_ASR_MAX_BYTES, 2 * GiB);
  assert.equal(MediaReadiness.VIDEO_MAX_BYTES, 15 * GiB);
  assert.equal(MediaReadiness.cloudAsrAllows({ size: 2 * GiB }), true);
  assert.equal(MediaReadiness.cloudAsrAllows({ size: 2 * GiB + 1 }), false);
  assert.equal(MediaReadiness.cloudAsrAllows({ size: 3.8e9 }), false);
});

test("sizes of a gigabyte and more read as GB", () => {
  assert.equal(MediaReadiness.humanBytes(15 * GiB), "15.0 GB");
  assert.equal(MediaReadiness.humanBytes(2 * GiB), "2.0 GB");
  assert.equal(MediaReadiness.humanBytes(1592.9 * 1024 * 1024), "1.6 GB");
  assert.equal(MediaReadiness.humanBytes(400 * 1024 * 1024), "400.0 MB");
});

test("every size-refusal text takes its number from a {limit} parameter, never a literal", () => {
  for (const { lang, src } of locales) {
    for (const key of ["errVideoTooLarge", "errAudioTooLarge", "errCloudAsrTooLarge"]) {
      const value = localeValue(src, key);
      assert.ok(value, `${lang}.${key} missing`);
      assert.match(value, /\{limit\}/, `${lang}.${key} must use {limit}`);
      assert.doesNotMatch(value, /\d/, `${lang}.${key} must not hardcode a number`);
    }
  }
});

test("Studio refuses files with the limit that applies, and gates Gemini before any upload", () => {
  const studio = fs.readFileSync(path.join(__dirname, "../public/js/studio-import.js"), "utf8");
  assert.match(studio, /errVideoTooLarge" : "studio\.import\.errAudioTooLarge",\s*\{ limit: window\.MediaReadiness\.humanBytes\(window\.MediaReadiness\.sizeLimitFor\(file\)\) \}/);
  const cloud = studio.indexOf('pendingAudio.asrMethod = "gemini-asr"');
  const gate = studio.indexOf("cloudAsrAllows(pendingAudio.file)");
  const lock = studio.indexOf("lockCanonicalMediaIdentity()", cloud);
  assert.ok(gate > 0 && gate < cloud, "the 2 GiB gate runs before the Gemini path starts");
  assert.ok(lock > cloud);
});

test("a file's SHA-256 is computed in slices and equals the one-shot digest", async () => {
  global.hashwasm = {
    createSHA256: async () => {
      const h = crypto.createHash("sha256");
      return { init() { return this; }, update(u8) { h.update(Buffer.from(u8)); }, digest() { return h.digest("hex"); } };
    },
  };
  const MediaStore = require("../public/js/media-store.js");
  const bytes = crypto.randomBytes(5 * 1024 * 1024 + 123);
  const slices = [];
  const file = {
    size: bytes.length,
    slice(a, b) { slices.push([a, b]); return { arrayBuffer: async () => bytes.subarray(a, b) }; },
  };
  const sha = await MediaStore.sha256File(file, { chunkBytes: 1024 * 1024 });
  assert.equal(sha, crypto.createHash("sha256").update(bytes).digest("hex"));
  assert.equal(slices.length, 6, "never reads the whole file at once");
  assert.ok(slices.every(([a, b]) => b - a <= 1024 * 1024));
  delete global.hashwasm;
});

test("video identity is hashed from the file and saved from the file, not from one big buffer", () => {
  const studio = fs.readFileSync(path.join(__dirname, "../public/js/studio-import.js"), "utf8");
  const start = studio.indexOf("async function lockCanonicalMediaIdentity()");
  const body = studio.slice(start, studio.indexOf("async function transcribeAudioLocal()", start));
  assert.match(body, /pendingAudio\.isVideo[\s\S]*MediaStore\.sha256File\(pendingAudio\.file/);
  assert.match(studio, /saveMedia\(pendingAudio\.buf \|\| pendingAudio\.file, fileName\)/);
});
