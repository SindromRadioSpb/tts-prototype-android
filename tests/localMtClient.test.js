const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../public/js/local-mt-client.js");

const TOKEN = "p".repeat(48);
function response(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
function store(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) };
}

test("local MT is independently default-off and cannot enroll before runtime invitation", () => {
  const local = store();
  C.setRuntimeConfig({ beta: false });
  assert.throws(() => C.enroll(local), /BETA_DISABLED/);
  C.setRuntimeConfig({ beta: true });
  C.enroll(local);
  assert.equal(C.isExperimentalEnabled(local), true);
  C.unenroll(local);
  assert.equal(C.isExperimentalEnabled(local), false);
});

test("all MT lifecycle and translation traffic is pinned to authenticated loopback v1", async () => {
  const calls = [];
  const client = new C.Client({ tokenProvider: () => TOKEN, fetchFn: async (url, options) => {
    calls.push({ url, options }); return response(200, { ok: true });
  }});
  await client.installModel(true);
  await client.cancelModelInstall();
  await client.deleteModel();
  await client.warmup();
  await client.unload();
  assert.ok(calls.every((call) => call.url.startsWith("http://127.0.0.1:8799/v1/mt/")));
  assert.ok(calls.every((call) => call.options.credentials === "omit" && call.options.redirect === "error"));
  assert.ok(calls.every((call) => call.options.headers.authorization === "Bearer " + TOKEN));
});

test("deterministic request checksum and exact result mapping survive duplicates and empty rows", async () => {
  const urls = [], bodies = [], states = ["WAITING_FOR_GPU", "RUNNING", "COMPLETE"];
  const client = new C.Client({ tokenProvider: () => TOKEN, wait: async () => {}, fetchFn: async (url, options) => {
    urls.push(url);
    if (url.endsWith("/v1/mt/jobs")) {
      bodies.push(JSON.parse(options.body));
      return response(202, { job_id: "job-1", state: "QUEUED" });
    }
    if (url.endsWith("/result")) return response(200, {
      complete: true, provider: "madlad", local_execution: true,
      results: [{ index: 0, text: "x" }, { index: 1, text: "" }, { index: 2, text: "x" }],
    });
    return response(200, { job_id: "job-1", state: states.shift() });
  }});
  const result = await client.translate(["א", "", "א"], "he", "ru");
  assert.equal(result.results.length, 3);
  assert.equal(bodies[0].request_id.length, 64);
  assert.equal(bodies[0].input_checksum.length, 64);
  assert.ok(urls.every((url) => url.startsWith(C.BASE_URL)));
});

test("mapping mismatch and loopback failure are terminal with zero cloud fallback", async () => {
  let calls = 0;
  const broken = new C.Client({ tokenProvider: () => TOKEN, wait: async () => {}, fetchFn: async (url, options) => {
    calls++;
    if (url.endsWith("/v1/mt/jobs")) return response(202, { job_id: "job-2" });
    if (url.endsWith("/result")) return response(200, { complete: true, provider: "madlad", local_execution: true, results: [] });
    return response(200, { state: "COMPLETE" });
  }});
  await assert.rejects(broken.translate(["א"], "he", "ru"), (error) => error.code === "LOCAL_MT_RESULT_MAPPING_INVALID");
  assert.equal(calls, 3);

  const absent = new C.Client({ tokenProvider: () => TOKEN, fetchFn: async () => { throw new Error("refused"); } });
  await assert.rejects(absent.capabilities(), (error) => error.code === "LOCAL_MT_ABSENT");
});

test("abort sends only the local cancel endpoint", async () => {
  const controller = new AbortController(), urls = [];
  let polls = 0;
  const client = new C.Client({ tokenProvider: () => TOKEN, wait: async () => controller.abort(), fetchFn: async (url) => {
    urls.push(url);
    if (url.endsWith("/v1/mt/jobs")) return response(202, { job_id: "job-3" });
    if (url.endsWith("/cancel")) return response(200, { state: "CANCEL_REQUESTED" });
    polls++;
    return response(200, { state: polls > 1 ? "CANCELED" : "WAITING_FOR_GPU", error_code: "MT_JOB_CANCELED" });
  }});
  await assert.rejects(client.translate(["א"], "he", "ru", { signal: controller.signal }), /MT_JOB_CANCELED/);
  assert.ok(urls.some((url) => url.endsWith("/cancel")));
  assert.ok(urls.every((url) => url.startsWith(C.BASE_URL)));
});
