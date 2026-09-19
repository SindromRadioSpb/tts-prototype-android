// tests/mediaEncoderChoice.test.js - Studio must show which encoder a conversion uses, and let
// the owner pick one where the machine can actually run it.
//
// Owner-live 2026-09-19: the compatible-copy conversion ran on h264_nvenc, confirmed by NVENC
// sitting at 100% for six samples - and the import dialog said nothing at all. The companion
// report already carried the field; the only way to read it was the API by hand. Two rules
// follow: the offer never exceeds what the machine proved, and the technical details name the
// encoder both before (planned) and after (used), including a fallback nobody asked for.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const MediaReadiness = require(path.join(root, "public/js/media-readiness.js"));
const LocalAsrClient = require(path.join(root, "public/js/local-asr-client.js"));
const studio = fs.readFileSync(path.join(root, "public/js/studio-import.js"), "utf8");
const shell = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

const OPTIONS = (gpuAvailable) => ([
  { value: "cpu", encoder: "libx264", quality: "crf 20 · preset medium", available: true, reason: null },
  { value: "gpu", encoder: "h264_nvenc", quality: "cq 22 · preset p5", available: gpuAvailable,
    reason: gpuAvailable ? null : "NVENC_UNAVAILABLE" },
]);

const transcodeJob = (gpuAvailable, plan) => ({
  job_id: "job-1", state: "WAITING_FOR_DECISION", progress: 0.2,
  report: {
    outcome: "TRANSCODE_REQUIRED", plan_sha256: "a".repeat(64),
    plan: Object.assign({
      mode: "transcode", video_encoder: "libx264", video_encoder_choice: "cpu",
      video_quality: "crf 20 · preset medium", video_encoder_fallback: null,
      video_encoder_options: OPTIONS(gpuAvailable),
    }, plan || {}),
  },
});

test("a plan names the encoder it would use, before anything has run", () => {
  const state = MediaReadiness.acceptReport(transcodeJob(true));
  const summary = MediaReadiness.encoderSummary(state);
  assert.equal(summary.stage, "planned");
  assert.equal(summary.encoder, "libx264");
  assert.equal(summary.quality, "crf 20 · preset medium");
});

test("a finished copy names the encoder that actually made it", () => {
  const state = MediaReadiness.acceptReport({
    job_id: "job-1", state: "COMPLETE", output_sha256: "b".repeat(64),
    report: { outcome: "READY", encoding: { requested: "gpu", choice: "gpu", encoder: "h264_nvenc",
      quality: "cq 22 · preset p5", fallback_reason: null } },
  });
  const summary = MediaReadiness.encoderSummary(state);
  assert.equal(summary.stage, "actual");
  assert.equal(summary.encoder, "h264_nvenc");
  assert.equal(summary.requested, "gpu");
});

test("a fallback the owner did not ask for is carried, not swallowed", () => {
  const state = MediaReadiness.acceptReport({
    job_id: "job-1", state: "COMPLETE", output_sha256: "b".repeat(64),
    report: { outcome: "READY", encoding: { requested: "gpu", choice: "cpu", encoder: "libx264",
      quality: "crf 20 · preset medium", fallback_reason: "NVENC_UNAVAILABLE" } },
  });
  const summary = MediaReadiness.encoderSummary(state);
  assert.equal(summary.encoder, "libx264");
  assert.equal(summary.requested, "gpu");
  assert.equal(summary.fallback_reason, "NVENC_UNAVAILABLE");
});

test("an unavailable encoder stays visible as unavailable instead of disappearing", () => {
  const state = MediaReadiness.acceptReport(transcodeJob(false));
  const options = MediaReadiness.encoderOptions(state);
  assert.deepEqual(options.map((option) => option.value), ["cpu", "gpu"]);
  assert.deepEqual(MediaReadiness.selectableEncoders(state).map((option) => option.value), ["cpu"]);
});

test("a machine that was never probed is not treated as a machine that said no", () => {
  const state = MediaReadiness.acceptReport(transcodeJob(null));
  assert.equal(MediaReadiness.selectableEncoders(state).length, 1);
  assert.equal(MediaReadiness.encoderOptions(state)[1].available, null);
});

test("reports without any encoder evidence produce no claim at all", () => {
  assert.equal(MediaReadiness.encoderSummary(MediaReadiness.acceptReport({
    job_id: "x", state: "WAITING_FOR_DECISION", report: { outcome: "LOSSLESS_REPAIR", plan: { mode: "lossless_repair", video_encoder: null } },
  })), null);
  assert.deepEqual(MediaReadiness.encoderOptions({}), []);
});

test("the client sends an encoder only when one was actually chosen", async () => {
  const sent = [];
  const client = new LocalAsrClient.Client({
    tokenProvider: () => "t".repeat(48),
    fetchFn: async (url, options) => {
      sent.push(JSON.parse(options.body));
      return { ok: true, status: 202, json: async () => ({ job_id: "job-1" }), headers: { get: () => null } };
    },
  });
  await client.prepareMediaJob("job-1", "transcode", "a".repeat(64), "full", "gpu");
  await client.prepareMediaJob("job-1", "transcode", "a".repeat(64), "full", null);
  await client.prepareMediaJob("job-1", "transcode", "a".repeat(64), "full", "quicksync");
  assert.equal(sent[0].video_encoder, "gpu");
  assert.equal("video_encoder" in sent[1], false, "no choice must mean the companion setting decides");
  assert.equal("video_encoder" in sent[2], false, "an unknown value is not a choice");
});

test("the import dialog wires the choice and shows the encoder in technical details", () => {
  assert.match(studio, /renderMediaEncoderChoice\(state\)/);
  assert.match(studio, /mediaEncoderTechnicalLine\(state\)/);
  assert.match(studio, /prepareMediaJob\(\s*\n?\s*pendingAudio\.mediaJobId, mode, state\.plan_sha256, "full", chosenEncoder\)/);
  assert.match(studio, /onMediaEncoderChanged: onMediaEncoderChanged/);
  // Only a picture re-encode has an encoder to choose.
  assert.match(studio, /mode === "transcode" \? pendingAudio\.mediaEncoderChoice : null/);
  assert.match(shell, /id="v3ImportMediaEncoderRow"/);
  assert.match(shell, /StudioImport\.onMediaEncoderChanged\(\)/);
  assert.match(shell, /data-i18n="studio\.import\.mediaEncoderLabel"/);
});

test("every new import string exists in all three locales", () => {
  const keys = ["mediaEncoderLabel", "mediaEncoderCpu", "mediaEncoderGpu", "mediaEncoderUnavailable",
    "mediaEncoderUnknown", "mediaEncoderPlanned", "mediaEncoderUsed", "mediaEncoderFallback"];
  for (const locale of ["ru", "en", "he"]) {
    const source = fs.readFileSync(path.join(root, "public/i18n/locales", locale + ".js"), "utf8");
    for (const key of keys) {
      assert.match(source, new RegExp(key + ':\\s*"'), locale + " is missing " + key);
    }
  }
});

test("the CSS keeps the row hidden despite its author display", () => {
  // An author display:flex beats the UA [hidden] rule; without the explicit rule the encoder
  // row would show on files that offer no choice.
  assert.match(shell, /\.v3-media-readiness-encoder\[hidden\] \{ display:none; \}/);
});
