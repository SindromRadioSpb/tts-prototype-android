"use strict";
// Owner decision 2026-09-28: paid recognition of a video hears only its speech track. Studio sent
// the whole prepared video to Gemini (frames cost ~2.6x the audio) on the ranged-file transport,
// the one that returned foreign content at deep offsets (S12.5). The companion's mono MP3 is sliced
// per window like an MP3 file, and a film above 2 GiB no longer blocks paid recognition.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const Mp3Slice = require("../public/js/mp3-slice.js");
const C = require("../public/js/local-asr-client.js");

function mp3(seconds) {
  const frames = Math.ceil((seconds * 16000) / 576);
  const u8 = new Uint8Array(frames * 216);
  for (let i = 0; i < frames; i++) u8.set([0xff, 0xf3, 0x68, 0xc0], i * 216);
  return u8;
}

function run(overrides) {
  const source = fs.readFileSync(path.join(__dirname, "../public/js/studio-import.js"), "utf8");
  const start = source.indexOf("  // Paid recognition of a video hears only its speech track");
  const end = source.indexOf("  // ── S12.5 T4", start);
  assert.ok(start > 0 && end > start);
  const uploads = [];
  const statuses = [];
  const video = { size: 3.6e9, name: "Sweet.Mud.mkv" };
  const context = Object.assign({
    pendingAudio: { isVideo: true, mediaJobId: "job", durationSec: 1200, file: video, mime: "video/x-matroska",
      name: "Sweet.Mud.mkv", mediaReadiness: {} },
    localAsrClient: { mediaSpeechAudio: async () => ({ bytes: mp3(1200), sha256: "a".repeat(64) }) },
    preparedCopyPending: () => false, selectedAudioProvider: () => "gemini", pageIsStale: async () => false,
    lockCanonicalMediaIdentity: async () => true, setBusy() {}, setStatus: (k) => statuses.push(k), showPreview() {},
    errKey: (k) => k, tr: (k) => k, Blob, Date,
    window: {
      MediaReadiness: { canStartAsr: () => true, cloudAsrAllows: (f) => f.size <= 2 * 1024 ** 3, humanBytes: String, CLOUD_ASR_MAX_BYTES: 2 * 1024 ** 3 },
      AsrTranscript: { ASR_MODEL: "gemini-x", asrWindows: () => [[0, 600], [600, 1200]], parseAsrResponse: () => ({}),
        ASR_RANGE_PROMPT: () => "range", summarizeAsrRun: () => ({}),
        validateSegments: (segments) => ({ timingOk: true, segments }) },
      geminiKeyGet: () => "key",
      Mp3Slice,
      GeminiFiles: {
        uploadFile: async (key, body, mime) => { uploads.push({ size: body.size, mime }); return { state: "ACTIVE", fileUri: "u" + uploads.length, name: "n" }; },
        waitActive: async () => {}, transcribeAudio: async () => "{}",
      },
      StudioImport: { runWindowedAsr: async (deps) => {
        await deps.transcribe(0, 600); await deps.transcribe(600, 1200);
        return { language: "he", segments: [{ start: 0, end: 1, text: "שלום" }], warnings: [], windows: [] };
      } },
    },
  }, overrides || {});
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { context, uploads, statuses, video };
}

test("a video with a companion job sends only sliced speech MP3, even above 2 GiB", async () => {
  const { context, uploads, statuses } = run();
  assert.equal(context.cloudAsrSendsVideo(), false);
  await context.transcribeAudio();
  assert.ok(!statuses.includes("studio.import.errCloudAsrTooLarge"));
  assert.equal(uploads.length, 2, "one upload per window");
  assert.ok(uploads.every((u) => u.mime === "audio/mpeg" && u.size < 5 * 1024 * 1024));
  assert.equal(context.pendingAudio.asrAudioSource, "companion-speech-mp3");
  assert.equal(context.pendingAudio.asrTransport, "sliced-mp3");
  assert.ok(statuses.includes("studio.import.audioExtracting"));
});

test("without a companion job the old path and its 2 GiB gate still apply", async () => {
  const { context, uploads, statuses } = run({ localAsrClient: null });
  assert.equal(context.cloudAsrSendsVideo(), true);
  await context.transcribeAudio();
  assert.ok(statuses.includes("studio.import.errCloudAsrTooLarge"));
  assert.equal(uploads.length, 0);
});

test("speech bytes are accepted only when they hash to the companion's digest", async () => {
  const bytes = Buffer.from("mp3-bytes");
  const good = crypto.createHash("sha256").update(bytes).digest("hex");
  const client = (sha) => new C.Client({ tokenProvider: () => "t".repeat(48), fetchFn: async () => ({
    ok: true, status: 200, headers: { get: (h) => (h.toLowerCase() === "x-lp-media-sha256" ? sha : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }) });
  const result = await client(good).mediaSpeechAudio("job");
  assert.equal(result.sha256, good);
  await assert.rejects(client("b".repeat(64)).mediaSpeechAudio("job"), (e) => e.code === "LOCAL_MEDIA_SPEECH_SHA_MISMATCH");
});

test("an older companion without the speech route is asked to update, never billed for frames", async () => {
  const err = Object.assign(new Error("Not Found"), { status: 404, code: "LOCAL_ASR_HTTP_404" });
  const { context, uploads, statuses } = run({ localAsrClient: { mediaSpeechAudio: async () => { throw err; } } });
  await context.transcribeAudio();
  assert.ok(statuses.includes("studio.import.audioSpeechNeedsUpdate"));
  assert.equal(uploads.length, 0);
});
