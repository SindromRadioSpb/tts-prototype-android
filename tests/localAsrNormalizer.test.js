const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const A = require("../public/js/asr-transcript.js");
const L = require("../public/js/local-asr-normalizer.js");

function hash(value) {
  return crypto.createHash("sha256").update(L.canonicalJson(value)).digest("hex");
}

function words(prefix, count = 20) {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`).join(" ");
}

function rawSegments(windowIdx, durationSec, opts = {}) {
  const out = [];
  const step = opts.step || 60;
  const span = opts.clockSpan == null ? durationSec : opts.clockSpan;
  const count = Math.max(1, Math.floor(durationSec / step));
  for (let i = 0; i < count; i++) {
    const start = count === 1 ? 0 : Math.min(durationSec - 1, (i / (count - 1)) * Math.max(0, span - 10));
    out.push({ ordinal: i, start, end: Math.min(durationSec, start + 8), text: words(`w${windowIdx}_${i}_`) });
  }
  return out;
}

function makeFixture(durationSec = 1800) {
  const windows = A.asrWindows(durationSec);
  const sourceHash = "a".repeat(64);
  const chunks = windows.map((window, i) => {
    const duration = window.endSec - window.startSec;
    const raw = { ok: true, language: "he", segments: rawSegments(i, duration) };
    const chunkHash = String((i + 1) % 10).repeat(64);
    const rawFileHash = String((i + 5) % 10).repeat(64);
    return {
      manifest: {
        index: i,
        source_sha256: sourceHash,
        start_sec: window.startSec,
        end_sec: window.endSec,
        expected_duration_sec: duration,
        actual_samples: Math.round(duration * 16000),
        sample_rate: 16000,
        channels: 1,
        sample_width_bytes: 2,
        pcm: "s16le",
        chunk_sha256: chunkHash,
        ffmpeg_version: "8.1",
        audio_stream_index: 0,
        file_name: `chunk-${String(i).padStart(4, "0")}.wav`,
        completed: true,
        raw_file: `chunk-${String(i).padStart(4, "0")}.json`,
        raw_sha256: rawFileHash,
      },
      worker_input: { kind: "physical-chunk", chunk_sha256: chunkHash, source_handle_exposed: false },
      raw_file_sha256: rawFileHash,
      raw_canonical_sha256: hash(raw),
      raw,
    };
  });
  return {
    schema: "studio-local-asr-result-v1",
    sidecar_protocol: "studio-local-asr-l1-v1",
    job_id: "job-1",
    attempt_id: "attempt-1",
    selected_provider: "local",
    actual_provider: "local-faster-whisper",
    source_sha256: sourceHash,
    source_bytes: 123,
    duration_sec: durationSec,
    model: {
      model_id: L.MODEL_ID,
      revision: L.MODEL_REVISION,
      model_bin_sha256: L.MODEL_BIN_SHA256,
    },
    runtime: { faster_whisper: "1.1.1", ctranslate2: "4.5.0", ffmpeg: "8.1" },
    telemetry: { samples: 10, thermal_throttle: false },
    chunks,
  };
}

function refreshRaw(chunk) {
  chunk.raw_canonical_sha256 = hash(chunk.raw);
}

test("local normalizer returns stable transcript-v1 and three independent PASS reports", async () => {
  const fixture = makeFixture();
  const first = await L.normalizeLocalAsrResult(fixture, { codeVersion: "3.11.270" });
  const second = await L.normalizeLocalAsrResult(fixture, { codeVersion: "3.11.270" });
  assert.equal(first.schema, "transcript-v1");
  assert.equal(first.gates.s12_5.verdict, "PASS");
  assert.equal(first.gates.s12_6.verdict, "PASS");
  assert.equal(first.gates.s12_7.verdict, "PASS");
  assert.equal(first.normalization_sha256, second.normalization_sha256);
  assert.deepEqual(first.segments.map((s) => s.id), second.segments.map((s) => s.id));
  assert.ok(first.segments.some((s) => s.chunkIndex === 1 && s.start >= 870));
});

test("S12.5 mutations catch whole-source input, offset, swap, stale manifest, missing chunk and raw mutation", async () => {
  const mutations = [
    (f) => { f.chunks[0].worker_input.kind = "source-media"; },
    (f) => { f.chunks[1].manifest.start_sec += 1; },
    (f) => { f.chunks.reverse(); },
    (f) => { f.chunks[0].manifest.source_sha256 = "b".repeat(64); },
    (f) => { f.chunks.pop(); },
    (f) => { f.chunks[0].raw.segments[0].text += " mutation"; },
  ];
  for (const mutate of mutations) {
    const fixture = makeFixture();
    mutate(fixture);
    const result = await L.normalizeLocalAsrResult(fixture, { codeVersion: "3.11.270" });
    assert.equal(result.gates.s12_5.verdict, "FAIL");
    assert.ok(result.gates.s12_6 && result.gates.s12_7, "reports must remain independent");
  }
});

test("S12.6 rejects replay while physical provenance and clock envelope remain valid", async () => {
  const fixture = makeFixture();
  fixture.chunks[1].raw.segments.forEach((segment, i) => {
    segment.text = fixture.chunks[0].raw.segments[i % fixture.chunks[0].raw.segments.length].text;
  });
  refreshRaw(fixture.chunks[1]);
  const result = await L.normalizeLocalAsrResult(fixture, { codeVersion: "3.11.270" });
  assert.equal(result.gates.s12_5.verdict, "PASS");
  assert.equal(result.gates.s12_6.verdict, "FAIL");
  assert.ok(result.gates.s12_6.reasons.includes("WINDOW_REPLAY_DETECTED"));
  assert.equal(result.gates.s12_7.verdict, "PASS");
});

test("S12.6 distinguishes known significant zero-text from unknown speech", async () => {
  const known = makeFixture();
  known.chunks[1].raw.segments = [];
  refreshRaw(known.chunks[1]);
  const failed = await L.normalizeLocalAsrResult(known, {
    codeVersion: "3.11.270", knownSpeechChunkIndexes: [1],
  });
  assert.equal(failed.gates.s12_6.verdict, "FAIL");
  assert.ok(failed.gates.s12_6.reasons.includes("ZERO_TEXT_SIGNIFICANT_CHUNK"));

  const unknown = makeFixture(60);
  unknown.chunks[0].raw.segments = [];
  refreshRaw(unknown.chunks[0]);
  const undecidable = await L.normalizeLocalAsrResult(unknown, { codeVersion: "3.11.270" });
  assert.equal(undecidable.gates.s12_6.verdict, "NOT_APPLICABLE");
  assert.ok(undecidable.warnings.includes("ZERO_TEXT_SPEECH_UNKNOWN"));
});

test("S12.7 fails an out-of-chunk clock without changing S12.5 physical provenance", async () => {
  const fixture = makeFixture();
  fixture.chunks[1].raw.segments[0].end = 9999;
  refreshRaw(fixture.chunks[1]);
  const result = await L.normalizeLocalAsrResult(fixture, { codeVersion: "3.11.270" });
  assert.equal(result.gates.s12_5.verdict, "PASS");
  assert.equal(result.gates.s12_7.verdict, "FAIL");
  assert.ok(result.gates.s12_7.reasons.includes("RAW_SEGMENT_TIMING_ENVELOPE"));
});

test("S12.7 detects clock compression and emits blind ranges", async () => {
  const fixture = makeFixture();
  const duration = fixture.chunks[1].manifest.end_sec - fixture.chunks[1].manifest.start_sec;
  fixture.chunks[1].raw.segments = rawSegments(1, duration, { clockSpan: 100 });
  refreshRaw(fixture.chunks[1]);
  const result = await L.normalizeLocalAsrResult(fixture, { codeVersion: "3.11.270" });
  assert.equal(result.gates.s12_5.verdict, "PASS");
  assert.equal(result.gates.s12_7.verdict, "FAIL");
  assert.ok(result.gates.s12_7.reasons.includes("CLOCK_COMPRESSION"));
  assert.ok(result.blindRanges.length > 0);
});

test("single-window density subgate is NOT_APPLICABLE without creating a false S12.7 failure", async () => {
  const result = await L.normalizeLocalAsrResult(makeFixture(600), { codeVersion: "3.11.270" });
  assert.equal(result.gates.s12_7.verdict, "PASS");
  assert.equal(result.gates.s12_7.evidence.density_clock_subgate, "NOT_APPLICABLE");
});
