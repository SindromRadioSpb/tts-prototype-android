"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Ladder = require("../public/js/material-progress-ladder.js");

const tr = (key, params) => key + (params ? JSON.stringify(params) : "");
const humanBytes = (n) => Math.round(n / (1024 * 1024)) + " MB";

test("steps move todo → active → done and keep their own durations", () => {
  const m = Ladder.create();
  Ladder.begin(m, "upload", 1000);
  Ladder.update(m, "upload", { done: 50, total: 100, unit: "bytes" }, 2000);
  assert.equal(m.steps.upload.state, "active");
  Ladder.finish(m, "upload", 148000);
  assert.equal(m.steps.upload.state, "done");
  assert.equal(Ladder.durationMs(m.steps.upload), 147000);
  assert.equal(m.steps.probe.state, "todo");
  assert.equal(Ladder.activeKey(m), null);
});

test("update on a todo step starts it, and finishing a done step keeps its first duration", () => {
  const m = Ladder.create();
  Ladder.update(m, "niqqud", { done: 16, total: 1317, unit: "count" }, 5000);
  assert.equal(m.steps.niqqud.state, "active");
  assert.equal(m.steps.niqqud.startedAt, 5000);
  Ladder.finish(m, "niqqud", 9000);
  Ladder.begin(m, "niqqud", 20000);
  Ladder.finish(m, "niqqud", 30000);
  assert.equal(Ladder.durationMs(m.steps.niqqud), 4000);
});

test("remaining time stays unknown until ten seconds of steady data exist", () => {
  const m = Ladder.create();
  Ladder.begin(m, "upload", 0);
  Ladder.update(m, "upload", { done: 100, total: 1000, unit: "bytes" }, 1000);
  Ladder.update(m, "upload", { done: 200, total: 1000, unit: "bytes" }, 6000);
  assert.equal(Ladder.remainingMs(m.steps.upload, 6000), null);
  Ladder.update(m, "upload", { done: 300, total: 1000, unit: "bytes" }, 11000);
  // 200 units in 10 s since the first sample → 20/s; 700 left → 35 s.
  assert.equal(Ladder.remainingMs(m.steps.upload, 11000), 35000);
});

test("changing the counted unit restarts the estimate instead of mixing percent and bytes", () => {
  const m = Ladder.create();
  Ladder.update(m, "lite", { done: 0.1, total: 1, unit: "fraction" }, 0);
  Ladder.update(m, "lite", { done: 0.9, total: 1, unit: "fraction" }, 20000);
  Ladder.update(m, "lite", { done: 10, total: 400, unit: "bytes" }, 21000);
  assert.equal(m.steps.lite.done, 10);
  assert.equal(m.steps.lite.sampleAt, 21000);
  assert.equal(Ladder.remainingMs(m.steps.lite, 21000), null);
  assert.deepEqual(Ladder.STEPS.map((s) => s.key),
    ["upload", "probe", "tracks", "video", "store", "lite", "table", "niqqud", "niqqudCheck", "open"]);
});

test("a visible zero does not start the rate: model load time stays out of the estimate", () => {
  const m = Ladder.create();
  Ladder.update(m, "niqqud", { done: 0, total: 1382, unit: "count" }, 0);
  assert.equal(m.steps.niqqud.sampleAt, null);
  Ladder.update(m, "niqqud", { done: 16, total: 1382, unit: "count" }, 6000);
  Ladder.update(m, "niqqud", { done: 176, total: 1382, unit: "count" }, 16000);
  // 160 lines in 10 s after the model answered → 16/s; 1206 left → 75.4 s.
  assert.equal(Ladder.remainingMs(m.steps.niqqud, 16000), 75375);
  const html = Ladder.renderHtml(Ladder.create(), { tr: (k, p) => k + JSON.stringify(p || {}), now: 0, view: "build" });
  assert.ok(html.length > 0);
});

test("a failure is pinned to its step and cleared by beginning that step again", () => {
  const m = Ladder.create();
  Ladder.finish(m, "store", 10);
  Ladder.begin(m, "niqqud", 20);
  Ladder.fail(m, "niqqud", { code: "LOCAL_ASR_HTTP_503", message: "restart" }, 30);
  assert.equal(m.steps.niqqud.state, "failed");
  assert.equal(Ladder.failedKey(m), "niqqud");
  Ladder.begin(m, "niqqud", 40);
  assert.equal(m.steps.niqqud.state, "active");
  assert.equal(Ladder.failedKey(m), null);
});

test("failure keys name what a person can do, not the transport code", () => {
  assert.equal(Ladder.failureKey("niqqud", { code: "LOCAL_ASR_HTTP_503" }), "studio.import.ladderErrNiqqudModel");
  assert.equal(Ladder.failureKey("upload", { code: "LOCAL_ASR_UNAVAILABLE" }), "studio.import.ladderErrCompanionDown");
  assert.equal(Ladder.failureKey("store", { name: "QuotaExceededError" }), "studio.import.ladderErrStorage");
  assert.equal(Ladder.failureKey("video", { code: "MEDIA_JOB_FAILED" }), "studio.import.ladderErrMediaJob");
  assert.equal(Ladder.failureKey("table", { code: "X_Y" }), "studio.import.ladderErrGeneric");
  assert.equal(Ladder.failureKey("upload", { code: "LOCAL_ASR_HTTP_413" }), "studio.import.ladderErrTooLargeForCompanion");
});

test("check view shows only file-check steps; build view shows every step with phases", () => {
  const m = Ladder.create();
  Ladder.begin(m, "upload", 0);
  const check = Ladder.renderHtml(m, { tr, humanBytes, now: 0, view: "check" });
  assert.match(check, /ladderStepUpload/);
  assert.doesNotMatch(check, /ladderStepNiqqud/);
  assert.doesNotMatch(check, /ladderPhaseBuild/);
  const build = Ladder.renderHtml(m, { tr, humanBytes, now: 0, view: "build" });
  assert.match(build, /ladderPhaseCheck/);
  assert.match(build, /ladderPhaseBuild/);
  assert.match(build, /ladderStepNiqqud/);
});

test("active row carries counter, bar and elapsed; done rows carry a check and duration", () => {
  const m = Ladder.create();
  Ladder.begin(m, "upload", 0);
  Ladder.finish(m, "upload", 147000);
  Ladder.begin(m, "niqqud", 200000);
  Ladder.update(m, "niqqud", { done: 640, total: 1382, unit: "count" }, 296000);
  const html = Ladder.renderHtml(m, { tr, humanBytes, now: 296000, view: "build" });
  assert.match(html, /data-step="upload" data-state="done"/);
  assert.match(html, /ladderDurMinSec\{"min":2,"sec":27\}/);
  assert.match(html, /data-step="niqqud" data-state="active"/);
  assert.match(html, /ladderCount\{"done":640,"total":1382\}/);
  assert.match(html, /role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="46"/);
  assert.match(html, /ladderElapsed\{"time":"1:36"\}/);
  assert.match(html, /ladderEtaCounting/);
});

test("byte and fraction counters are formatted for people", () => {
  const m = Ladder.create();
  Ladder.update(m, "upload", { done: 413 * 1048576, total: 1614 * 1048576, unit: "bytes" }, 0);
  Ladder.update(m, "video", { done: 0.64, total: 1, unit: "fraction" }, 0);
  const html = Ladder.renderHtml(m, { tr, humanBytes, now: 0, view: "build" });
  assert.match(html, /ladderBytes\{"done":"413 MB","total":"1614 MB"\}/);
  assert.match(html, /ladderPercent\{"pct":64\}/);
});

test("skipped steps say so; failed step shows the message, the kept-video note and a retry", () => {
  const m = Ladder.create();
  Ladder.skip(m, "lite");
  Ladder.finish(m, "store", 0);
  Ladder.begin(m, "niqqud", 0);
  Ladder.fail(m, "niqqud", { code: "LOCAL_ASR_HTTP_503", message: "Перезапустите <компаньон>" }, 1);
  const html = Ladder.renderHtml(m, { tr, humanBytes, now: 1, view: "build" });
  assert.match(html, /data-step="lite" data-state="skipped"/);
  assert.match(html, /ladderSkipped/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Перезапустите &lt;компаньон&gt;/);
  assert.match(html, /ladderKeptVideo/);
  assert.match(html, /data-ladder-action="retry"/);
});

test("no kept-video promise when the video never reached the browser", () => {
  const m = Ladder.create();
  Ladder.begin(m, "video", 0);
  Ladder.fail(m, "video", { code: "MEDIA_JOB_FAILED", message: "x" }, 1);
  const html = Ladder.renderHtml(m, { tr, humanBytes, now: 1, view: "build" });
  assert.doesNotMatch(html, /ladderKeptVideo/);
});

test("the compact summary counts finished steps for narrow screens", () => {
  const m = Ladder.create();
  Ladder.begin(m, "upload", 0); Ladder.finish(m, "upload", 60000);
  Ladder.begin(m, "probe", 60000); Ladder.finish(m, "probe", 64000);
  Ladder.begin(m, "video", 64000);
  const html = Ladder.renderHtml(m, { tr, humanBytes, now: 70000, view: "build" });
  assert.match(html, /class="lp-ladder-summary"/);
  assert.match(html, /ladderSummary\{"count":2,"time":"studio\.import\.ladderDurMinSec\{\\"min\\":1,\\"sec\\":4\}"\}/);
});

test("announcement changes only when the active or failed step changes", () => {
  const m = Ladder.create();
  Ladder.begin(m, "upload", 0);
  const a1 = Ladder.announcement(m, { tr });
  Ladder.update(m, "upload", { done: 10, total: 100, unit: "bytes" }, 500);
  assert.equal(Ladder.announcement(m, { tr }), a1);
  Ladder.finish(m, "upload", 1000);
  Ladder.begin(m, "probe", 1000);
  assert.notEqual(Ladder.announcement(m, { tr }), a1);
});

test("renderInto keeps one live region and wires retry once", () => {
  const listeners = [];
  const live = { textContent: "" };
  const body = { innerHTML: "" };
  const host = {
    innerHTML: "", hidden: true,
    querySelector: (sel) => (sel === ".lp-ladder-live" ? live : sel === ".lp-ladder-body" ? body : null),
    addEventListener: (type, fn) => listeners.push([type, fn]),
  };
  let retries = 0;
  const m = Ladder.create();
  Ladder.begin(m, "upload", 0);
  Ladder.renderInto(host, m, { tr, humanBytes, now: 0, view: "check", onRetry: () => retries++ });
  Ladder.renderInto(host, m, { tr, humanBytes, now: 0, view: "check", onRetry: () => retries++ });
  assert.equal(host.hidden, false);
  assert.equal(listeners.length, 1);
  assert.match(body.innerHTML, /ladderStepUpload/);
  assert.match(live.textContent, /ladderAnnounceActive/);
  listeners[0][1]({ target: { closest: (s) => (s === '[data-ladder-action="retry"]' ? {} : null) } });
  assert.equal(retries, 1);
});

test("an active step offers Cancel when the caller can cancel; a finished ladder does not", () => {
  const m = Ladder.create();
  Ladder.begin(m, "video", 0);
  const on = Ladder.renderHtml(m, { tr, humanBytes, now: 0, view: "build", onCancel() {} });
  assert.match(on, /data-ladder-action="cancel"[^>]*>studio\.import\.ladderCancel</);
  const off = Ladder.renderHtml(m, { tr, humanBytes, now: 0, view: "build" });
  assert.doesNotMatch(off, /data-ladder-action="cancel"/);
  Ladder.fail(m, "video", { code: "MATERIAL_CANCELED", message: "x", action: "restart" }, 1);
  const failed = Ladder.renderHtml(m, { tr, humanBytes, now: 1, view: "build", onCancel() {} });
  assert.doesNotMatch(failed, /data-ladder-action="cancel"/);
  assert.match(failed, /data-ladder-action="retry"[^>]*>studio\.import\.ladderRestart</);
});

test("renderInto wires Cancel to the current handler", () => {
  const listeners = [];
  const host = { innerHTML: "", hidden: true, querySelector: () => ({ innerHTML: "", textContent: "" }),
    addEventListener: (t, fn) => listeners.push(fn) };
  let cancels = 0;
  const m = Ladder.create();
  Ladder.begin(m, "upload", 0);
  Ladder.renderInto(host, m, { tr, humanBytes, now: 0, view: "check", onCancel: () => cancels++ });
  listeners[0]({ target: { closest: (s) => (s === '[data-ladder-action="cancel"]' ? {} : null) } });
  assert.equal(cancels, 1);
});

test("a companion job that failed on a full disk is named as such", () => {
  const job = { state: "FAILED", error: "MEDIA_DISK_FULL" };
  assert.equal(Ladder.failureKey("video", { code: "MEDIA_JOB_FAILED", message: "MEDIA_DISK_FULL", job }), "studio.import.ladderErrDiskFull");
});
