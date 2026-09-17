// tests/subtitleMaterialImport.test.js — orchestration between the companion, the subtitle
// parser and OPFS. Every dependency is injected; nothing here touches a real browser.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const SMI = require("../public/js/subtitle-material-import.js");

const H = (char) => char.repeat(64);

test("speech assessment is local and bound to the selected source, audio and subtitle track", async () => {
  const track = { index: 7, sha256: H("b"), cues: [{ start: 1 }, { start: 5 }] };
  const evidence = { schema: "subtitle-speech-sync-v1", status: "correctable", apply_offset_ms: 750,
    source_sha256: H("a"), subtitle_sha256: H("b"), input_sha256: H("c"), audio_stream_index: 2 };
  const calls = [];
  const opts = { jobId: "job-1", track, sourceSha256: H("a"), audioStreamIndex: 2,
    client: { mediaSubtitleSync: async (...args) => { calls.push(args); return evidence; } } };
  assert.deepEqual(await SMI.assessSubtitleSync(opts), evidence);
  assert.deepEqual(calls, [["job-1", 7, H("b"), [1, 5]]]);
  for (const change of [{ source_sha256: H("d") }, { subtitle_sha256: H("d") },
    { audio_stream_index: 3 }, { input_sha256: null }, { apply_offset_ms: 1600 },
    { apply_offset_ms: 100 }, { status: "needs_review", apply_offset_ms: 750 }]) {
    const result = await SMI.assessSubtitleSync({ ...opts,
      client: { mediaSubtitleSync: async () => ({ ...evidence, ...change }) } });
    assert.equal(result.status, "unverified");
    assert.equal(result.apply_offset_ms, 0);
  }
  assert.deepEqual(track.cues, [{ start: 1 }, { start: 5 }], "assessment must not rewrite source times");
});

test("old or unavailable companion leaves timing unverified without a provider fallback", async () => {
  const opts = { jobId: "old", track: { index: 7, sha256: H("b"), cues: [{ start: 1 }] },
    sourceSha256: H("a"), audioStreamIndex: 2 };
  assert.equal((await SMI.assessSubtitleSync({ ...opts, client: {} })).reason, "companion_update_required");
  const result = await SMI.assessSubtitleSync({ ...opts,
    client: { mediaSubtitleSync: async () => { throw new Error("HTTP 404"); } } });
  assert.equal(result.status, "unverified");
  assert.equal(result.apply_offset_ms, 0);
});

function reportTracks() {
  return [
    { index: 4, status: "extracted", format: "srt", sha256: H("a"), language: "ru", title: null, disposition: {} },
    { index: 7, status: "extracted", format: "srt", sha256: H("b"), language: "he", title: null, disposition: {} },
    { index: 8, status: "extracted", format: "srt", sha256: H("c"), language: "he", title: "SDH", disposition: { hearing_impaired: 1 } },
    { index: 9, status: "image_based", format: null, sha256: null, language: "en", title: null, disposition: {} },
    { index: 10, status: "extracted", format: "srt", sha256: H("d"), language: "en", title: null, disposition: {} },
  ];
}

const parseSubtitles = (raw) => ({ ok: true, segments: [{ start_ms: 500, end_ms: 1500, text: raw + "|cue" }] });

test("subtitle tracks are loaded per item: one failure never cancels the rest", async () => {
  const asked = [];
  const client = {
    mediaSubtitleTrack: async (jobId, index) => {
      asked.push({ jobId, index });
      if (index === 8) throw Object.assign(new Error("bad hash"), { code: "LOCAL_MEDIA_SUBTITLE_SHA_MISMATCH" });
      if (index === 10) return { text: "eng", sha256: H("f"), format: "srt", bytes: 3 }; // not what the report recorded
      return { text: "track" + index, sha256: index === 4 ? H("a") : H("b"), format: "srt", bytes: 9 };
    },
  };
  const result = await SMI.loadSubtitleTracks({
    client, jobId: "job-1", readiness: { subtitle_tracks: reportTracks() }, parseSubtitles,
  });
  assert.deepEqual(asked.map((call) => call.index), [4, 7, 8, 10]);
  assert.deepEqual(result.tracks.map((track) => track.index), [4, 7]);
  assert.deepEqual(result.tracks[0].cues, [{ start: 0.5, end: 1.5, text: "track4|cue" }]);
  assert.equal(result.tracks[1].language, "he");
  assert.equal(result.tracks[1].title, null);
  assert.deepEqual(result.failed, [
    { index: 8, code: "LOCAL_MEDIA_SUBTITLE_SHA_MISMATCH" },
    { index: 10, code: "SUBTITLE_TRACK_SHA_MISMATCH" },
  ]);
  assert.equal(result.skipped_non_text, 1);
});

test("an unparsable track is reported, not turned into an empty material", async () => {
  const client = { mediaSubtitleTrack: async () => ({ text: "not subtitles", sha256: H("b"), format: "srt", bytes: 4 }) };
  const result = await SMI.loadSubtitleTracks({
    client, jobId: "job-1",
    readiness: { subtitle_tracks: [reportTracks()[1]] },
    parseSubtitles: () => { throw Object.assign(new Error("bad"), { code: "SUBTITLES_UNKNOWN_FORMAT" }); },
  });
  assert.deepEqual(result.tracks, []);
  assert.deepEqual(result.failed, [{ index: 7, code: "SUBTITLES_UNKNOWN_FORMAT" }]);
});

test("a media plan is confirmed by its own hash and rendition, never by mode alone", async () => {
  const calls = [];
  const client = {
    prepareMediaJob: async (jobId, mode, planSha256, rendition) => {
      calls.push({ jobId, mode, planSha256, rendition });
      return { job_id: jobId, state: rendition === "lite" ? "TRANSCODING_LITE" : "TRANSCODING" };
    },
    waitForMediaJob: async (jobId) => ({ job_id: jobId, state: "COMPLETE", output_sha256: H("e") }),
  };
  const job = await SMI.confirmMediaPlan({ client, jobId: "job-1", mode: "audio_transcode", planSha256: H("a") });
  assert.equal(job.state, "COMPLETE");
  assert.deepEqual(calls[0], { jobId: "job-1", mode: "audio_transcode", planSha256: H("a"), rendition: "full" });

  await SMI.confirmMediaPlan({ client, jobId: "job-1", mode: "lite_transcode", planSha256: H("b"), rendition: "lite" });
  assert.equal(calls[1].rendition, "lite");

  await assert.rejects(
    () => SMI.confirmMediaPlan({ client, jobId: "job-1", mode: "audio_transcode", planSha256: null }),
    (error) => error.code === "MEDIA_PLAN_UNCONFIRMED",
  );
  assert.equal(calls.length, 2);
});

test("prepared media is streamed into OPFS against the verified hash, never buffered whole", async () => {
  const seen = {};
  const response = {
    headers: { get: (name) => (name.toLowerCase() === "x-lp-media-sha256" ? H("e") : null) },
    blob: () => { throw new Error("blob() would buffer the whole file"); },
    arrayBuffer: () => { throw new Error("arrayBuffer() would buffer the whole file"); },
  };
  const client = { mediaFileResponse: async (jobId, rendition) => { seen.rendition = rendition; return response; } };
  const store = {
    streamToOpfs: async (options) => {
      seen.options = options;
      return { ok: true, opfsPath: "media/" + options.expectedSha256 + ".mp4", sha256: options.expectedSha256, sizeBytes: 1024 };
    },
  };
  const stored = await SMI.storePreparedMedia({
    client, store, jobId: "job-1",
    job: { state: "COMPLETE", output_sha256: H("e"), output_bytes: 1024, output_name: "episode-mobile-ready.mp4" },
    maxBytes: 3 * 1024 * 1024 * 1024,
  });
  assert.equal(stored.opfsPath, "media/" + H("e") + ".mp4");
  assert.equal(stored.sha256, H("e"));
  assert.equal(seen.rendition, "full");
  assert.equal(seen.options.expectedSha256, H("e"));
  assert.equal(seen.options.expectedSize, 1024);
  assert.equal(seen.options.maxBytes, 3 * 1024 * 1024 * 1024);
  assert.equal(seen.options.response, response);
  assert.match(seen.options.fileName, /^[a-f0-9]{64}\.mp4$/);
});

test("unverified output is never written to OPFS", async () => {
  const store = { streamToOpfs: async () => { throw new Error("must not be called"); } };
  const client = { mediaFileResponse: async () => ({ headers: { get: () => null } }) };
  await assert.rejects(
    () => SMI.storePreparedMedia({ client, store, jobId: "job-1", job: { state: "COMPLETE", output_sha256: null } }),
    (error) => error.code === "MEDIA_OUTPUT_UNVERIFIED",
  );
  await assert.rejects(
    () => SMI.storePreparedMedia({ client, store, jobId: "job-1", job: { state: "TRANSCODING", output_sha256: H("e") } }),
    (error) => error.code === "MEDIA_OUTPUT_UNVERIFIED",
  );
});

test("a light copy is stored beside the full one, with its own hash from the job renditions", async () => {
  const seen = {};
  const client = {
    mediaFileResponse: async (_jobId, rendition) => {
      seen.rendition = rendition;
      return { headers: { get: () => null } };
    },
  };
  const store = {
    streamToOpfs: async (options) => { seen.options = options; return { ok: true, opfsPath: "media/x.mp4", sha256: options.expectedSha256, sizeBytes: 64 }; },
  };
  const stored = await SMI.storePreparedMedia({
    client, store, jobId: "job-1", rendition: "lite",
    job: {
      state: "COMPLETE", output_sha256: H("e"),
      renditions: { lite: { sha256: H("c"), size_bytes: 64, name: "episode-phone.mp4" } },
    },
  });
  assert.equal(seen.rendition, "lite");
  assert.equal(seen.options.expectedSha256, H("c"));
  assert.equal(seen.options.expectedSize, 64);
  assert.equal(stored.sha256, H("c"));
});
