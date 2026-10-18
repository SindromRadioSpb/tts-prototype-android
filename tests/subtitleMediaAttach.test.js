// tests/subtitleMediaAttach.test.js — O-096: media chosen for a subtitle-file material.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const A = require("../public/js/subtitle-media-attach.js");
const R = require("../public/js/media-readiness.js");

const SRC = "a".repeat(64), OUT = "b".repeat(64), LITE = "c".repeat(64), PLAN = "d".repeat(64), LPLAN = "e".repeat(64);

function fakeCompanion(over) {
  const calls = [];
  const report = Object.assign({
    outcome: "TRANSCODE_REQUIRED", plan: { mode: "transcode" }, plan_sha256: PLAN,
    lite_plan_sha256: LPLAN, duration_seconds: 5400, disk_sufficient: true,
    codec_summary: { container: "mp4", video_codec: "h264", profile: "High", declared_level: 40, audio_codec: "aac" },
  }, over && over.report);
  const client = {
    calls,
    async createMediaJob(file) { calls.push(["create", file.name]); return { job_id: "j1", state: "QUEUED" }; },
    async waitForMediaJob(id, _o, initial) {
      calls.push(["wait", initial && initial.state]);
      if (initial && initial.state === "AUDIO_CHOSEN") return { job_id: id, state: "WAITING_FOR_DECISION", source_sha256: SRC, report: Object.assign({}, report, { outcome: "TRANSCODE_REQUIRED" }) };
      return { job_id: id, state: over && over.state || "WAITING_FOR_DECISION", source_sha256: SRC, report };
    },
    async chooseMediaAudioStream(id, index) { calls.push(["audio", index]); return { job_id: id, state: "AUDIO_CHOSEN" }; },
    async deleteMediaJob(id) { calls.push(["delete", id]); },
  };
  const importer = {
    async confirmMediaPlan(o) {
      calls.push(["prepare", o.mode, o.planSha256, o.rendition || "full"]);
      if (over && over.liteFails && o.rendition === "lite") throw Object.assign(new Error("ffmpeg exited 1"), { code: "MEDIA_JOB_FAILED", job: { error_detail: "lite: encoder refused 360p" } });
      if (over && over.prepareFails) throw Object.assign(new Error("MEDIA_JOB_FAILED"), { code: "MEDIA_JOB_FAILED" });
      return { job_id: "j1", state: "COMPLETE", source_sha256: SRC, output_sha256: OUT, output_name: "film.mp4", report };
    },
    async storePreparedMedia(o) {
      calls.push(["store", o.rendition || "full"]);
      return o.rendition === "lite"
        ? { rendition: "lite", opfsPath: "media/" + LITE + ".mp4", sha256: LITE, sizeBytes: 100, mimeType: "video/mp4" }
        : { rendition: "full", opfsPath: "media/" + OUT + ".mp4", sha256: OUT, sizeBytes: 1000, mimeType: "video/mp4" };
    },
  };
  return { client, importer };
}

test("an AVI is converted by the companion and bound by the prepared copy's hash", async () => {
  const { client, importer } = fakeCompanion();
  const steps = [];
  const media = await A.prepareLocalMedia({ client, importer, readiness: R, lite: true,
    file: { name: "Mivtza.Savta.avi", type: "video/x-msvideo", size: 700 }, onStep: (s) => steps.push(s) });
  assert.equal(media.sha256, OUT);
  assert.equal(media.opfsPath, "media/" + OUT + ".mp4");
  assert.equal(media.durationSec, 5400);
  assert.equal(media.originalName, "Mivtza.Savta.avi");
  assert.equal(media.renditions[0].sha256, LITE);
  assert.equal(media.compatibility.canonical_sha256, OUT);
  assert.deepEqual(client.calls.filter((c) => c[0] === "prepare"), [["prepare", "transcode", PLAN, "full"], ["prepare", "lite_transcode", LPLAN, "lite"]]);
  assert.deepEqual(client.calls.at(-1), ["delete", "j1"], "the companion job is released");
  assert.ok(["upload", "probe", "video", "store", "lite"].every((s) => steps.includes(s)));
});

test("without the light copy only the full rendition is made", async () => {
  const { client, importer } = fakeCompanion();
  const media = await A.prepareLocalMedia({ client, importer, readiness: R, lite: false, file: { name: "x.mkv", size: 1 } });
  assert.equal(media.renditions, undefined);
  assert.equal(client.calls.filter((c) => c[0] === "prepare").length, 1);
});

test("several audio tracks: the Hebrew one is chosen and named", async () => {
  const { client, importer } = fakeCompanion({ report: { outcome: "AUDIO_STREAM_CHOICE_REQUIRED",
    audio_choices: [{ index: 1, language: "rus" }, { index: 2, language: "heb" }] } });
  const media = await A.prepareLocalMedia({ client, importer, readiness: R, file: { name: "x.mkv", size: 1 } });
  assert.deepEqual(client.calls.find((c) => c[0] === "audio"), ["audio", 2]);
  assert.equal(media.audio.reason, "hebrew");
});

test("a failed conversion still releases the companion job", async () => {
  const { client, importer } = fakeCompanion({ prepareFails: true });
  await assert.rejects(A.prepareLocalMedia({ client, importer, readiness: R, file: { name: "x.avi", size: 1 } }), /MEDIA_JOB_FAILED/);
  assert.deepEqual(client.calls.at(-1), ["delete", "j1"]);
});

test("a short disk is refused before converting", async () => {
  const { client, importer } = fakeCompanion({ report: { disk_sufficient: false, estimated_output_bytes: 9, disk_free_bytes: 1 } });
  await assert.rejects(A.prepareLocalMedia({ client, importer, readiness: R, file: { name: "x.avi", size: 1 } }), (e) => e.code === "MEDIA_DISK_SHORT");
  assert.equal(client.calls.filter((c) => c[0] === "prepare").length, 0);
});

test("a video without a companion says the companion is required", async () => {
  await assert.rejects(A.prepareLocalMedia({ client: null, readiness: R, file: { name: "x.avi", size: 1 } }), (e) => e.code === "COMPANION_REQUIRED");
});

test("an audio file is stored as it is, by its own hash", async () => {
  const saved = [];
  const store = { canWrite: () => true, mediaFileName: (sha, mime) => "media/" + sha + ".mp3",
    saveMedia: async (buf, path) => { saved.push(path); return { ok: true }; } };
  const media = await A.prepareLocalMedia({ store, sha256: async () => SRC, probeDuration: async () => 61,
    file: { name: "lesson.mp3", type: "audio/mpeg", size: 3, arrayBuffer: async () => new ArrayBuffer(3) } });
  assert.equal(media.sha256, SRC);
  assert.deepEqual(saved, ["media/" + SRC + ".mp3"]);
  assert.equal(media.durationSec, 61);
});

test("duration check: subtitles that run past the media are flagged", () => {
  assert.equal(A.durationCheck([{ start: 10, end: 12 }, { start: 5390, end: 5398 }], 5400).status, "fits");
  const bad = A.durationCheck([{ start: 6000, end: 6003 }], 5400);
  assert.equal(bad.status, "subtitles_outrun_media");
  assert.equal(bad.subtitle_end_sec, 6003);
  assert.equal(A.durationCheck([{ start: 1 }], null).status, "unknown");
});

test("file kind: video by type or extension, audio otherwise", () => {
  assert.equal(A.isVideoFile({ name: "a.avi", type: "" }), true);
  assert.equal(A.isVideoFile({ name: "a.mp3", type: "audio/mpeg" }), false);
  assert.equal(A.isVideoFile({ name: "a.bin", type: "video/mp4" }), true);
});

test("a failed light copy keeps the verified full copy and says why", async () => {
  const { client, importer } = fakeCompanion({ liteFails: true });
  const media = await A.prepareLocalMedia({ client, importer, readiness: R, lite: true, file: { name: "x.avi", size: 1 } });
  assert.equal(media.sha256, OUT);
  assert.equal(media.renditions, undefined);
  assert.deepEqual(media.lite_error, { code: "MEDIA_JOB_FAILED", detail: "lite: encoder refused 360p" });
  assert.deepEqual(client.calls.at(-1), ["delete", "j1"]);
});

test("a failed conversion carries the companion's reason after the job is released", async () => {
  const { client, importer } = fakeCompanion();
  importer.confirmMediaPlan = async () => { throw Object.assign(new Error("MEDIA_JOB_FAILED"), { code: "MEDIA_JOB_FAILED", job: { error: "disk full" } }); };
  await assert.rejects(A.prepareLocalMedia({ client, importer, readiness: R, file: { name: "x.avi", size: 1 } }), (e) => e.detail === "disk full");
});

const FILE = "f".repeat(64);
const goodSync = (over) => ({ schema: "subtitle-speech-sync-v1", status: "correctable", reason: "frame_rate_stretch",
  apply_offset_ms: 0, apply_scale: 25 / 23.976, subtitle_source: "external", subtitle_sha256: FILE,
  source_sha256: SRC, input_sha256: PLAN, audio_stream_index: 1, ...over });

test("O-099: the speech check runs before the job is released and binds to the file's hash", async () => {
  const { client, importer } = fakeCompanion();
  client.mediaSubtitleSync = async (id, index, sha, starts, source) => { client.calls.push(["sync", index, sha, starts.length, source]); return goodSync(); };
  const media = await A.prepareLocalMedia({ client, importer, readiness: R, file: { name: "x.avi", size: 1 },
    syncInput: async () => ({ sha256: FILE, cueStarts: [1, 2, 3] }) });
  assert.deepEqual(client.calls.find((c) => c[0] === "sync"), ["sync", null, FILE, 3, "external"]);
  assert.ok(client.calls.findIndex((c) => c[0] === "sync") < client.calls.findIndex((c) => c[0] === "delete"));
  assert.equal(media.subtitleSync.status, "correctable");
  assert.equal(media.subtitleSync.apply_scale, 25 / 23.976);
});

test("O-099: an old Companion (422) or a foreign answer moves nothing", async () => {
  const { client, importer } = fakeCompanion();
  client.mediaSubtitleSync = async () => { throw Object.assign(new Error("HTTP 422"), { status: 422 }); };
  const media = await A.prepareLocalMedia({ client, importer, readiness: R, file: { name: "x.avi", size: 1 },
    syncInput: async () => ({ sha256: FILE, cueStarts: [1] }) });
  assert.equal(media.subtitleSync.status, "unverified");
  assert.equal(media.subtitleSync.reason, "companion_update_required");
  for (const change of [{ subtitle_sha256: "0".repeat(64) }, { subtitle_source: "container" }, { audio_stream_index: null }]) {
    assert.equal(A.acceptExternalSync(goodSync(change), FILE).reason, "assessment_identity_mismatch");
  }
  for (const change of [{ apply_scale: 1.2 }, { apply_scale: 1, apply_offset_ms: 100 }, { apply_offset_ms: 2000 },
    { status: "needs_review", apply_offset_ms: 500, apply_scale: 1 }]) {
    assert.equal(A.acceptExternalSync(goodSync(change), FILE).reason, "unsafe_timing_correction", JSON.stringify(change));
  }
  assert.equal(A.acceptExternalSync(goodSync({ status: "aligned", apply_scale: 1 }), FILE).status, "aligned");
  assert.equal(A.acceptExternalSync(goodSync({ apply_scale: 1, apply_offset_ms: 800 }), FILE).status, "correctable");
});
