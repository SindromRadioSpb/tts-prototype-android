"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../public/js/local-asr-client.js");

const TOKEN = "t".repeat(48);

function fakeXhr(script) {
  const xhr = {
    headers: {}, upload: {}, status: 0, responseText: "", responseURL: "",
    open(method, url) { this.method = method; this.url = url; },
    setRequestHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    send(body) { this.body = body; script(this); },
  };
  return xhr;
}

test("media upload with a progress callback reports bytes and resolves the created job", async () => {
  let xhr;
  const client = new C.Client({ tokenProvider: () => TOKEN, fetchFn: async () => { throw new Error("fetch must not run"); },
    xhrFactory: () => (xhr = fakeXhr((x) => {
      x.upload.onprogress({ loaded: 400, total: 1000, lengthComputable: true });
      x.upload.onprogress({ loaded: 1000, total: 1000, lengthComputable: true });
      x.status = 200; x.responseURL = x.url; x.responseText = JSON.stringify({ job_id: "j1", state: "UPLOADING" });
      x.onload();
    })) });
  const seen = [];
  const file = { name: "Ushpizin.mkv", type: "video/matroska", size: 1000 };
  const job = await client.createMediaJob(file, { onUploadProgress: (p) => seen.push(p) });
  assert.deepEqual(job, { job_id: "j1", state: "UPLOADING" });
  assert.deepEqual(seen, [{ bytes: 400, total: 1000 }, { bytes: 1000, total: 1000 }]);
  assert.equal(xhr.method, "POST");
  assert.equal(xhr.url, "http://127.0.0.1:8799/v1/media/jobs?filename=Ushpizin.mkv");
  assert.equal(xhr.headers.authorization, "Bearer " + TOKEN);
  assert.equal(xhr.headers["content-type"], "video/matroska");
  assert.equal(xhr.body, file);
  assert.equal(xhr.withCredentials, false);
});

test("upload errors keep the same codes as the fetch path", async () => {
  const file = { name: "a.mkv", type: "", size: 10 };
  const http = new C.Client({ tokenProvider: () => TOKEN, fetchFn: async () => ({}),
    xhrFactory: () => fakeXhr((x) => { x.status = 413; x.responseURL = x.url; x.responseText = JSON.stringify({ detail: "SOURCE_TOO_LARGE" }); x.onload(); }) });
  await assert.rejects(http.createMediaJob(file, { onUploadProgress() {} }),
    (e) => e.code === "LOCAL_ASR_HTTP_413" && e.status === 413 && /SOURCE_TOO_LARGE/.test(e.message));
  const down = new C.Client({ tokenProvider: () => TOKEN, fetchFn: async () => ({}),
    xhrFactory: () => fakeXhr((x) => x.onerror()) });
  await assert.rejects(down.createMediaJob(file, { onUploadProgress() {} }), (e) => e.code === "LOCAL_ASR_UNAVAILABLE");
  const moved = new C.Client({ tokenProvider: () => TOKEN, fetchFn: async () => ({}),
    xhrFactory: () => fakeXhr((x) => { x.status = 200; x.responseURL = "http://evil.test/"; x.responseText = "{}"; x.onload(); }) });
  await assert.rejects(moved.createMediaJob(file, { onUploadProgress() {} }), (e) => e.code === "LOCAL_ASR_UNAVAILABLE");
  const unpaired = new C.Client({ tokenProvider: () => "", fetchFn: async () => ({}), xhrFactory: () => fakeXhr(() => {}) });
  await assert.rejects(unpaired.createMediaJob(file, { onUploadProgress() {} }), (e) => e.code === "LOCAL_ASR_PAIRING_REQUIRED");
});

test("without a progress callback the upload stays on fetch", async () => {
  const calls = [];
  const client = new C.Client({ tokenProvider: () => TOKEN,
    fetchFn: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, json: async () => ({ job_id: "j2" }) }; },
    xhrFactory: () => { throw new Error("xhr must not run"); } });
  const job = await client.createMediaJob({ name: "b.mp4", type: "video/mp4", size: 5 });
  assert.equal(job.job_id, "j2");
  assert.equal(calls[0].options.redirect, "error");
});

test("aborting the upload cancels the transfer with the media-cancel code", async () => {
  const controller = new AbortController();
  let aborted = false;
  const client = new C.Client({ tokenProvider: () => TOKEN, fetchFn: async () => ({}),
    xhrFactory: () => {
      const x = fakeXhr(() => { controller.abort(); });
      x.abort = () => { aborted = true; x.onabort(); };
      return x;
    } });
  await assert.rejects(client.createMediaJob({ name: "a.mkv", type: "", size: 1 },
    { onUploadProgress() {}, signal: controller.signal }), (e) => e.code === "MEDIA_JOB_CANCELED");
  assert.equal(aborted, true);
});
