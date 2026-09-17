const test = require("node:test");
const assert = require("node:assert/strict");

const C = require("../public/js/local-asr-client.js");
const TOKEN = "t".repeat(48);

function store(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("subtitle speech assessment sends verified cue identity only to the paired loopback endpoint", async () => {
  const calls = [];
  const client = new C.Client({ tokenProvider: () => TOKEN,
    fetchFn: async (url, options) => { calls.push({ url, options }); return response(200, { status: "aligned" }); } });
  await client.mediaSubtitleSync("job/1", 7, "a".repeat(64), [1, 5]);
  assert.match(calls[0].url, /^http:\/\/127\.0\.0\.1:8799\/v1\/media\/jobs\/job%2F1\/subtitle-sync$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { stream_index: 7, subtitle_sha256: "a".repeat(64), cue_starts: [1, 5] });
});

test("experimental local ASR is strictly default-off and pairing token is session-scoped", () => {
  const local = store(), session = store();
  assert.equal(C.isExperimentalEnabled(local), false);
  local.setItem(C.EXPERIMENT_KEY, "1");
  assert.equal(C.isExperimentalEnabled(local), true);
  assert.throws(() => C.setPairingToken("short", session), /TOKEN_INVALID/);
  C.setPairingToken(TOKEN, session);
  assert.equal(C.getPairingToken(session), TOKEN);
});

test("product runtime gate fails closed and explicit enrollment uses the existing browser-local seam", () => {
  const local = store();
  C.setRuntimeConfig({ beta: false, companionDownloadUrl: "https://example.test/companion.exe" });
  local.setItem(C.EXPERIMENT_KEY, "1");
  assert.equal(C.runtimeConfig().beta, false);
  assert.equal(C.runtimeConfig().companionDownloadUrl, "");
  assert.throws(() => C.enroll(local), /BETA_DISABLED/);
  C.setRuntimeConfig({ beta: true, companionDownloadUrl: "/downloads/companion.exe" });
  C.enroll(local);
  assert.equal(C.runtimeConfig().beta, true);
  assert.equal(C.isExperimentalEnabled(local), true);
  C.unenroll(local);
  assert.equal(C.isExperimentalEnabled(local), false);
});

test("paired client exposes only loopback companion lifecycle actions", async () => {
  const calls = [];
  const client = new C.Client({
    tokenProvider: () => TOKEN,
    fetchFn: async (url, options) => { calls.push({ url, options }); return response(200, { ok: true }); },
  });
  await client.preflight();
  await client.installModel("72ad623a37947395efcc3933132353790e5a12f5");
  await client.cancelModelInstall();
  await client.deleteModel();
  await client.deleteAllJobs();
  assert.ok(calls.every((call) => call.url.startsWith(C.BASE_URL)));
  assert.ok(calls.some((call) => call.options.method === "DELETE" && call.url.endsWith("/v1/asr/model")));
  assert.ok(calls.some((call) => call.options.method === "DELETE" && call.url.endsWith("/v1/companion/jobs")));
});

test("client pins every request to canonical loopback and never sends credentials", async () => {
  const calls = [];
  const client = new C.Client({
    tokenProvider: () => TOKEN,
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return response(200, { ok: true });
    },
  });
  await client.capabilities();
  assert.equal(calls[0].url, "http://127.0.0.1:8799/v1/capabilities");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.headers.authorization, "Bearer " + TOKEN);
});

test("local niqqud uses paired loopback only and rejects oversized batches", async () => {
  const calls = [];
  const client = new C.Client({
    tokenProvider: () => TOKEN,
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return response(200, { results: ["שָׁלוֹם"], model_version: "local" });
    },
  });
  assert.deepEqual((await client.vocalizeTexts(["שלום"])).results, ["שָׁלוֹם"]);
  assert.equal(calls[0].url, C.BASE_URL + "/v1/niqqud");
  assert.equal(calls[0].options.headers.authorization, "Bearer " + TOKEN);
  assert.deepEqual(JSON.parse(calls[0].options.body), { texts: ["שלום"] });
  assert.throws(() => client.vocalizeTexts(Array(17).fill("שלום")), (error) => error.code === "LOCAL_NIQQUD_INVALID_INPUT");
  assert.equal(calls.length, 1);
});

test("run exposes queue/progress, resolves explicit audio-stream choice and normalizes result", async () => {
  const states = [], calls = [];
  const replies = [
    response(202, { job_id: "job-1", state: "QUEUED" }),
    response(200, { job_id: "job-1", state: "WAITING_FOR_INPUT", available_audio_streams: [{ index: 2 }] }),
    response(202, { job_id: "job-1", state: "QUEUED" }),
    response(200, { job_id: "job-1", state: "TRANSCRIBING", chunks_completed: 0, chunks_total: 1 }),
    response(200, { job_id: "job-1", state: "COMPLETE", chunks_completed: 1, chunks_total: 1 }),
    response(200, { schema: "studio-local-asr-result-v1" }),
  ];
  const client = new C.Client({
    tokenProvider: () => TOKEN,
    wait: async () => {},
    fetchFn: async (url, options) => { calls.push({ url, options }); return replies.shift(); },
    normalizer: async (_raw, opts) => ({ schema: "transcript-v1", codeVersion: opts.codeVersion }),
  });
  const result = await client.run(new Blob(["audio"], { type: "audio/wav" }), {
    codeVersion: "3.11.270",
    onStatus: (job) => states.push(job.state),
    chooseAudioStream: async (choices) => choices[0].index,
  });
  assert.deepEqual(states, ["QUEUED", "WAITING_FOR_INPUT", "QUEUED", "TRANSCRIBING", "COMPLETE"]);
  assert.equal(result.transcript.schema, "transcript-v1");
  assert.ok(calls.some((call) => call.url.endsWith("/audio-stream") && call.options.body.includes('"stream_index":2')));
});

test("abort sends local cancel and never falls back to a cloud endpoint", async () => {
  const controller = new AbortController(), urls = [];
  let poll = 0;
  const client = new C.Client({
    tokenProvider: () => TOKEN,
    wait: async () => { controller.abort(); },
    fetchFn: async (url) => {
      urls.push(url);
      if (url.endsWith("/v1/asr/jobs")) return response(202, { job_id: "job-1", state: "QUEUED" });
      if (url.endsWith("/cancel")) return response(200, { job_id: "job-1", state: "CANCEL_REQUESTED" });
      poll++;
      return response(200, { job_id: "job-1", state: poll > 1 ? "CANCELED" : "WAITING_FOR_GPU" });
    },
  });
  await assert.rejects(
    client.run(new Blob(["audio"]), { signal: controller.signal }),
    (error) => error.code === "LOCAL_ASR_CANCELED"
  );
  assert.ok(urls.some((url) => url.endsWith("/cancel")));
  assert.ok(urls.every((url) => url.startsWith(C.BASE_URL)));
});

test("loopback failure is terminal and does not trigger implicit Gemini fallback", async () => {
  let calls = 0;
  const client = new C.Client({
    tokenProvider: () => TOKEN,
    fetchFn: async () => { calls++; throw new Error("connection refused"); },
  });
  await assert.rejects(client.capabilities(), (error) => error.code === "LOCAL_ASR_UNAVAILABLE");
  assert.equal(calls, 1);
});

function rawResponse(status, body, headers = {}) {
  const map = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => map.has(String(name).toLowerCase()) ? map.get(String(name).toLowerCase()) : null },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

test("media job accepts one probed audio choice and serves subtitle text verified by hash", async () => {
  const crypto = require("node:crypto");
  const srt = "1\n00:00:00,500 --> 00:00:01,500\nשלום\n\n";
  const sha = crypto.createHash("sha256").update(Buffer.from(srt, "utf8")).digest("hex");
  const calls = [];
  const client = new C.Client({
    tokenProvider: () => TOKEN,
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      if (url.includes("/subtitles/")) {
        return rawResponse(200, srt, { "x-lp-subtitle-sha256": sha, "content-type": "application/x-subrip; charset=utf-8" });
      }
      return response(200, { job_id: "job-1", state: "WAITING_FOR_DECISION" });
    },
  });
  const chosen = await client.chooseMediaAudioStream("job-1", 3);
  assert.equal(chosen.state, "WAITING_FOR_DECISION");
  assert.ok(calls[0].url.endsWith("/v1/media/jobs/job-1/audio-stream"));
  assert.deepEqual(JSON.parse(calls[0].options.body), { stream_index: 3 });

  const track = await client.mediaSubtitleTrack("job-1", 7);
  assert.equal(track.text, srt);
  assert.equal(track.sha256, sha);
  assert.equal(track.format, "srt");
  assert.ok(calls[1].url.endsWith("/v1/media/jobs/job-1/subtitles/7"));
});

test("subtitle text that does not match the companion hash is refused, not imported", async () => {
  const client = new C.Client({
    tokenProvider: () => TOKEN,
    fetchFn: async () => rawResponse(200, "tampered", { "x-lp-subtitle-sha256": "0".repeat(64) }),
  });
  await assert.rejects(
    client.mediaSubtitleTrack("job-1", 7),
    (error) => error.code === "LOCAL_MEDIA_SUBTITLE_SHA_MISMATCH",
  );
});

test("prepared media is handed over as a stream, by rendition, never as one buffered blob", async () => {
  const calls = [];
  const client = new C.Client({
    tokenProvider: () => TOKEN,
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return rawResponse(200, "bytes", { "x-lp-media-sha256": "a".repeat(64) });
    },
  });
  const full = await client.mediaFileResponse("job-1");
  assert.equal(typeof full.text, "function");
  assert.equal(full.headers.get("x-lp-media-sha256"), "a".repeat(64));
  await client.mediaFileResponse("job-1", "lite");
  assert.ok(calls[0].url.endsWith("/v1/media/jobs/job-1/file"));
  assert.ok(calls[1].url.endsWith("/v1/media/jobs/job-1/file?rendition=lite"));
});

test("light copy preparation names its rendition in the confirmed plan call", async () => {
  const calls = [];
  const client = new C.Client({
    tokenProvider: () => TOKEN,
    fetchFn: async (url, options) => { calls.push({ url, options }); return response(202, { state: "TRANSCODING_LITE" }); },
  });
  await client.prepareMediaJob("job-1", "lite_transcode", "b".repeat(64), "lite");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    mode: "lite_transcode", plan_sha256: "b".repeat(64), rendition: "lite",
  });
});

test("gate retry names exact physical chunks and never re-uploads source bytes", async () => {
  const calls = [];
  const client = new C.Client({
    tokenProvider: () => TOKEN,
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return response(202, { job_id: "job-1", state: "QUEUED" });
    },
  });
  await client.retryChunks("job-1", [1, 3], "s12_7");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/v1/asr/jobs/job-1/retry-chunks"));
  assert.deepEqual(JSON.parse(calls[0].options.body), { chunk_indexes: [1, 3], reason: "s12_7" });
});
