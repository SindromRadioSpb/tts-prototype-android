const test = require("node:test");
const assert = require("node:assert/strict");

const C = require("../public/js/local-asr-client.js");
const TOKEN = "t".repeat(48);

function store(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("experimental local ASR is strictly default-off and pairing token is session-scoped", () => {
  const local = store(), session = store();
  assert.equal(C.isExperimentalEnabled(local), false);
  local.setItem(C.EXPERIMENT_KEY, "1");
  assert.equal(C.isExperimentalEnabled(local), true);
  assert.throws(() => C.setPairingToken("short", session), /TOKEN_INVALID/);
  C.setPairingToken(TOKEN, session);
  assert.equal(C.getPairingToken(session), TOKEN);
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
