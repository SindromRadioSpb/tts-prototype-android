// Provider-neutral Studio L1 local-ASR normalizer and independent S12.5-S12.7 reports.
// Pure dual export: browser window.LocalAsrNormalizer + Node module.exports.
(function () {
  "use strict";

  var A = typeof window !== "undefined" && window.AsrTranscript
    ? window.AsrTranscript
    : (typeof require === "function" ? require("./asr-transcript.js") : null);

  var MODEL_ID = "ivrit-ai/whisper-large-v3-turbo-ct2";
  var MODEL_REVISION = "72ad623a37947395efcc3933132353790e5a12f5";
  var MODEL_BIN_SHA256 = "db2a2265aa012c16c7db9edda3d699c99f984efdd3f2e22a72a8ce7e9720f3a2";
  var SAMPLE_RATE = 16000;
  var SAMPLE_TOLERANCE = 1600; // mirrors the documented 100 ms codec-tail slicer tolerance

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === "object") {
      var out = {};
      Object.keys(value).sort().forEach(function (key) { out[key] = stableValue(value[key]); });
      return out;
    }
    return value;
  }

  function canonicalJson(value) { return JSON.stringify(stableValue(value)); }

  async function sha256(text) {
    var bytes = new TextEncoder().encode(String(text));
    var webCrypto = typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle;
    if (webCrypto) {
      var digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map(function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    }
    if (typeof require === "function") {
      return require("node:crypto").createHash("sha256").update(bytes).digest("hex");
    }
    throw new Error("SHA-256 is unavailable");
  }

  function finite(value) { return typeof value === "number" && isFinite(value); }
  function near(a, b, tolerance) { return finite(a) && finite(b) && Math.abs(a - b) <= tolerance; }
  function hex64(value) { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); }
  function report(verdict, reasons, evidence) {
    return { verdict: verdict, reasons: Array.from(new Set(reasons)), evidence: evidence };
  }

  function allWords(perWindow) {
    var words = [];
    (perWindow || []).forEach(function (segments) {
      (segments || []).forEach(function (segment) {
        words.push.apply(words, A.stitchNormalizeWords(segment && segment.text));
      });
    });
    return words;
  }

  function duplicateNgramRatio(perWindow, n) {
    var words = allWords(perWindow), seen = new Set(), duplicate = 0, total = 0;
    for (var i = 0; i + n <= words.length; i++) {
      var gram = words.slice(i, i + n).join(" ");
      total++;
      if (seen.has(gram)) duplicate++;
      seen.add(gram);
    }
    return { n: n, total: total, duplicate: duplicate, ratio: total ? duplicate / total : null };
  }

  async function normalizeLocalAsrResult(payload, options) {
    if (!A) throw new Error("AsrTranscript is required before LocalAsrNormalizer");
    var source = payload || {}, opts = options || {};
    var physicalReasons = [], envelopeReasons = [], warnings = [];
    var duration = Number(source.duration_sec);
    if (!finite(duration) || duration <= 0) physicalReasons.push("INVALID_SOURCE_DURATION");
    var windows = A.asrWindows(finite(duration) ? duration : 0);
    var chunks = Array.isArray(source.chunks) ? source.chunks : [];
    var model = source.model || {};

    if (source.schema !== "studio-local-asr-result-v1") physicalReasons.push("RESULT_SCHEMA_MISMATCH");
    if (source.sidecar_protocol !== "studio-local-asr-l1-v1") physicalReasons.push("SIDECAR_PROTOCOL_MISMATCH");
    if (source.selected_provider !== "local" || source.actual_provider !== "local-faster-whisper") {
      physicalReasons.push("PROVIDER_PROVENANCE_MISMATCH");
    }
    if (model.model_id !== MODEL_ID || model.revision !== MODEL_REVISION ||
        model.model_bin_sha256 !== MODEL_BIN_SHA256) physicalReasons.push("MODEL_PIN_MISMATCH");
    if (!hex64(source.source_sha256)) physicalReasons.push("SOURCE_HASH_INVALID");
    if (typeof opts.codeVersion !== "string" || !opts.codeVersion) physicalReasons.push("CODE_VERSION_MISSING");
    if (chunks.length !== windows.length) physicalReasons.push("PHYSICAL_CHUNK_SET_INCOMPLETE");

    var perWindow = windows.map(function () { return []; });
    var manifestEvidence = [];
    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i] || {}, manifest = chunk.manifest || {}, raw = chunk.raw || {};
      var expected = windows[i];
      var chunkReasons = [];
      if (!expected || manifest.index !== i) chunkReasons.push("CHUNK_ORDER_OR_INDEX_MISMATCH");
      if (manifest.source_sha256 !== source.source_sha256) chunkReasons.push("CHUNK_SOURCE_HASH_MISMATCH");
      if (!expected || !near(manifest.start_sec, expected.startSec, 1 / SAMPLE_RATE) ||
          !near(manifest.end_sec, expected.endSec, 1 / SAMPLE_RATE)) chunkReasons.push("CHUNK_WINDOW_MISMATCH");
      var expectedSamples = Math.round((Number(manifest.end_sec) - Number(manifest.start_sec)) * SAMPLE_RATE);
      if (manifest.sample_rate !== SAMPLE_RATE || manifest.channels !== 1 || manifest.pcm !== "s16le") {
        chunkReasons.push("CHUNK_PCM_CONTRACT_MISMATCH");
      }
      if (!Number.isInteger(manifest.actual_samples) ||
          Math.abs(manifest.actual_samples - expectedSamples) > SAMPLE_TOLERANCE) {
        chunkReasons.push("CHUNK_SAMPLE_COUNT_MISMATCH");
      }
      if (!hex64(manifest.chunk_sha256) || !hex64(chunk.raw_file_sha256) ||
          manifest.raw_sha256 !== chunk.raw_file_sha256) chunkReasons.push("CHUNK_HASH_LINK_INVALID");
      if (!chunk.worker_input || chunk.worker_input.kind !== "physical-chunk" ||
          chunk.worker_input.chunk_sha256 !== manifest.chunk_sha256 ||
          chunk.worker_input.source_handle_exposed !== false) chunkReasons.push("WORKER_INPUT_NOT_ISOLATED");
      var canonicalRawHash = await sha256(canonicalJson(raw));
      if (chunk.raw_canonical_sha256 !== canonicalRawHash) chunkReasons.push("RAW_OUTPUT_HASH_MISMATCH");
      physicalReasons.push.apply(physicalReasons, chunkReasons);

      var rawSegments = Array.isArray(raw.segments) ? raw.segments : null;
      if (!rawSegments) {
        envelopeReasons.push("RAW_SEGMENTS_MISSING");
        rawSegments = [];
      }
      var prior = -Infinity, chunkDuration = Number(manifest.end_sec) - Number(manifest.start_sec);
      for (var j = 0; j < rawSegments.length; j++) {
        var rawSegment = rawSegments[j] || {};
        var start = rawSegment.start, end = rawSegment.end;
        if (rawSegment.ordinal !== j) envelopeReasons.push("RAW_SEGMENT_ORDINAL_MISMATCH");
        if (!finite(start) || !finite(end) || start < 0 || end < start ||
            end > chunkDuration + (1 / SAMPLE_RATE) || start < prior) {
          envelopeReasons.push("RAW_SEGMENT_TIMING_ENVELOPE");
          continue;
        }
        prior = start;
        var idMaterial = [source.source_sha256, model.revision, manifest.chunk_sha256, j].join("|");
        var segment = {
          id: "lasr_" + (await sha256(idMaterial)).slice(0, 32),
          start: start + Number(manifest.start_sec),
          end: end + Number(manifest.start_sec),
          text: String(rawSegment.text || "").trim(),
          chunkIndex: i,
          rawSegmentOrdinal: j,
        };
        if (perWindow[i]) perWindow[i].push(segment);
      }
      manifestEvidence.push({
        index: manifest.index,
        chunk_sha256: manifest.chunk_sha256,
        raw_file_sha256: chunk.raw_file_sha256,
        raw_canonical_sha256: canonicalRawHash,
        reasons: chunkReasons,
      });
    }

    var seen = new Set(), replayEvidence = [], rejectedRanges = [], acceptedPerWindow = [];
    for (var w = 0; w < perWindow.length; w++) {
      var skip = w > 0 ? A.replaySeamSkipWords(perWindow[w - 1], perWindow[w]) : 0;
      var ratio = A.replayRatio(perWindow[w], seen, skip);
      var rejected = ratio !== null && ratio >= A.REPLAY_REJECT_RATIO;
      replayEvidence.push({ windowIdx: w, ratio: ratio, seamSkipWords: skip, rejected: rejected });
      if (rejected) {
        rejectedRanges.push({ startSec: windows[w].startSec, endSec: windows[w].endSec });
        acceptedPerWindow.push([]);
      } else {
        acceptedPerWindow.push(perWindow[w]);
        A.collectShingles(perWindow[w], seen);
      }
    }

    var stitched = A.stitchWindowSegments(acceptedPerWindow, A.asrSeams(windows));
    var coverage = A.classifyCoverageGaps(stitched.segments, duration, acceptedPerWindow, windows);
    var density = coverage.density;
    var compressed = A.classifyClockCompression(density);
    var densityStats = Array.isArray(density.windows) ? density.windows : [];
    var compressionApplicable = densityStats.some(function (candidate, idx) {
      if (candidate.densityRatio === null || candidate.markFromSec === null || candidate.markToSec === null ||
          candidate.segments < A.CLOCK_MIN_SEGMENTS || candidate.windowSec < A.CLOCK_MIN_WINDOW_SEC) return false;
      return densityStats.some(function (other, otherIdx) { return otherIdx !== idx && other.inBaseline; });
    });
    var zeroText = [];
    perWindow.forEach(function (segments, idx) {
      if (!allWords([segments]).length) zeroText.push(idx);
    });
    var knownSpeech = new Set(Array.isArray(opts.knownSpeechChunkIndexes) ? opts.knownSpeechChunkIndexes : []);
    var significantZero = zeroText.filter(function (idx) { return knownSpeech.has(idx); });
    var unknownZero = zeroText.filter(function (idx) { return !knownSpeech.has(idx); });
    if (unknownZero.length) warnings.push("ZERO_TEXT_SPEECH_UNKNOWN");

    var completenessReasons = [];
    if (rejectedRanges.length) completenessReasons.push("WINDOW_REPLAY_DETECTED");
    if (coverage.gaps.length) completenessReasons.push("COVERAGE_GAP");
    if (significantZero.length) completenessReasons.push("ZERO_TEXT_SIGNIFICANT_CHUNK");
    var completenessVerdict = completenessReasons.length ? "FAIL" : (unknownZero.length ? "NOT_APPLICABLE" : "PASS");
    var clockReasons = envelopeReasons.slice();
    if (compressed.length) clockReasons.push("CLOCK_COMPRESSION");
    var clockVerdict = clockReasons.length ? "FAIL" : "PASS";
    var transcriptHash = await sha256(canonicalJson(stitched.segments));
    var physicalVerdict = physicalReasons.length ? "FAIL" : "PASS";
    var fourGram = duplicateNgramRatio(perWindow, 4);
    var summary = A.summarizeAsrRun({
      durationSec: duration,
      windows: windows.map(function (win, idx) {
        return Object.assign({}, win, { rejectedReplay: replayEvidence[idx].rejected ? replayEvidence[idx].ratio : null });
      }),
      coverageGaps: coverage.gaps,
      rejectedRanges: rejectedRanges,
      unreliableMarkRanges: coverage.unreliableMarkRanges,
      clockCompressedRanges: compressed,
      warnings: warnings,
    });

    return {
      schema: "transcript-v1",
      job_id: source.job_id,
      attempt_id: source.attempt_id,
      selected_provider: source.selected_provider,
      actual_provider: source.actual_provider,
      source_sha256: source.source_sha256,
      duration_sec: duration,
      model: model,
      codeVersion: opts.codeVersion || null,
      segments: stitched.segments,
      normalization_sha256: transcriptHash,
      seams: stitched.seamsMeta,
      blindRanges: compressed.map(function (item) { return { fromSec: item.fromSec, toSec: item.toSec }; }),
      warnings: warnings,
      summary: summary,
      gates: {
        s12_5: report(physicalVerdict, physicalReasons, {
          chunks_expected: windows.length,
          chunks_received: chunks.length,
          sample_tolerance: SAMPLE_TOLERANCE,
          manifests: manifestEvidence,
          normalized_sha256: transcriptHash,
          model_revision: model.revision,
          codeVersion: opts.codeVersion || null,
        }),
        s12_6: report(completenessVerdict, completenessReasons, {
          zero_text_chunks: zeroText,
          significant_zero_text_chunks: significantZero,
          speech_unknown_zero_text_chunks: unknownZero,
          replay: replayEvidence,
          duplicate_4gram: fourGram,
          coverage_gaps: coverage.gaps,
          unreliable_mark_ranges: coverage.unreliableMarkRanges,
          density: density,
        }),
        s12_7: report(clockVerdict, clockReasons, {
          envelope: envelopeReasons.length ? "FAIL" : "PASS",
          density_clock_subgate: compressed.length ? "FAIL" :
            (compressionApplicable ? "PASS" : "NOT_APPLICABLE"),
          clock_compressed_ranges: compressed,
          blind_ranges: compressed.map(function (item) { return { fromSec: item.fromSec, toSec: item.toSec }; }),
        }),
      },
      provenance: {
        sidecar_protocol: source.sidecar_protocol,
        runtime: source.runtime || null,
        telemetry: source.telemetry || null,
        raw_result_schema: source.schema,
      },
    };
  }

  var API = {
    MODEL_ID: MODEL_ID,
    MODEL_REVISION: MODEL_REVISION,
    MODEL_BIN_SHA256: MODEL_BIN_SHA256,
    canonicalJson: canonicalJson,
    normalizeLocalAsrResult: normalizeLocalAsrResult,
    duplicateNgramRatio: duplicateNgramRatio,
  };
  if (typeof window !== "undefined") window.LocalAsrNormalizer = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
