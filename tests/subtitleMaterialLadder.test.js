"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const Ladder = require("../public/js/material-progress-ladder.js");

const source = fs.readFileSync(path.join(__dirname, "../public/js/studio-import.js"), "utf8");

function fakeHost() {
  const live = { textContent: "" }, body = { innerHTML: "" };
  return {
    hidden: true, innerHTML: "", body, live, listeners: [],
    querySelector: (sel) => (sel === ".lp-ladder-live" ? live : sel === ".lp-ladder-body" ? body : null),
    addEventListener(type, fn) { this.listeners.push(fn); },
    clickRetry() { this.listeners.forEach((fn) => fn({ target: { closest: () => ({}) } })); },
  };
}

function stateOf(host, key) {
  const m = host.body.innerHTML.match(new RegExp('data-step="' + key + '" data-state="([a-z]+)"'));
  return m && m[1];
}

function buildContext({ enrich, calls }) {
  const hosts = { v3ImportLadderCheck: fakeHost(), v3ImportLadderBuild: fakeHost() };
  const status = { hidden: false, textContent: "" };
  const rows = [{ he: "שלום", ru: "Привет" }];
  const material = { plan: { status: "ready", plan_sha256: "a".repeat(64), lite_plan_sha256: "b".repeat(64),
    lite: { available: true } } };
  const context = {
    pendingSubtitleMaterial: material,
    pendingAudio: { mediaJobId: "job", mediaReadiness: { plan: { mode: "transcode" } } },
    localAsrClient: { getMediaJob: async () => ({}) },
    mediaJobStatus() {}, setBusy() {}, setSubtitlePlanStatus() {}, renderSubtitlePlan() {}, renderMediaReadiness() {},
    tr: (key, params) => key + (params ? JSON.stringify(params) : ""),
    $: (id) => hosts[id] || (id === "v3ImportSubtitlePlanStatus" ? status
      : id === "v3ImportSubtitlePlanLite" ? { checked: false } : null),
    buildSubtitleTable: async () => { calls.push("table"); material.tableRows = rows; return rows; },
    applySubtitleMaterial: async () => { calls.push("apply"); return true; },
    Date,
    window: {
      MaterialProgressLadder: Ladder,
      MediaReadiness: { VIDEO_MAX_BYTES: 3 * 1024 ** 3, humanBytes: (n) => n + "B", acceptPrepared: () => ({}) },
      LocalTranslit: { transliterateWithProfile() {} },
      SubtitleMaterialImport: {
        materialImportKey: async () => null,
        confirmMediaPlan: async (opts) => {
          calls.push("prepare:" + (opts.rendition || "full"));
          opts.waitOptions.onStatus({ state: "TRANSCODING", progress: 0.575 });
          return { state: "COMPLETE", output_sha256: "c".repeat(64), output_bytes: 900 };
        },
        storePreparedMedia: async (opts) => {
          calls.push("store:" + (opts.rendition || "full"));
          opts.onProgress({ bytes: 450, total: 900 });
          return { opfsPath: "media/full", sizeBytes: 900, name: "u.mp4" };
        },
      },
      SubtitleMaterialVocalization: { enrich },
    },
  };
  const start = source.indexOf("  function showSubtitleSaveStep()");
  const end = source.indexOf("  function renderAudioMeta()", start);
  assert.ok(start > 0 && end > start);
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { context, hosts, status, material };
}

test("a niqqud failure stays on its step, promises the kept video, and retry resumes there", async () => {
  const calls = [];
  let attempts = 0;
  const enrich = async (tableRows, opts) => {
    attempts++;
    opts.onProgress(16, 32);
    if (attempts === 1) {
      const e = new Error("Local ASR request failed"); e.code = "LOCAL_ASR_HTTP_503"; throw e;
    }
    opts.onProgress(32, 32);
    return { rows: tableRows, warnings: [] };
  };
  const { context, hosts, status } = buildContext({ enrich, calls });
  await context.buildSubtitleMaterial();
  const build = hosts.v3ImportLadderBuild;
  assert.equal(build.hidden, false);
  assert.equal(status.hidden, true, "the old one-line status must not duplicate the ladder");
  assert.equal(stateOf(build, "video"), "done");
  assert.equal(stateOf(build, "store"), "done");
  assert.equal(stateOf(build, "lite"), "skipped");
  assert.equal(stateOf(build, "table"), "done");
  assert.equal(stateOf(build, "niqqud"), "failed");
  assert.match(build.body.innerHTML, /ladderErrNiqqudModel/);
  assert.match(build.body.innerHTML, /ladderKeptVideo/);
  assert.match(build.live.textContent, /ladderAnnounceFailed/);

  build.clickRetry();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["prepare:full", "store:full", "table", "table", "apply"],
    "retry must reuse the prepared and stored video");
  assert.equal(attempts, 2);
  assert.equal(build.hidden, true, "a finished build hands over to the table");
});

test("progress from the companion and the store reaches the ladder counters", async () => {
  const calls = [];
  let snapshot = null;
  const enrich = async (tableRows, opts) => {
    opts.onProgress(640, 1382);
    snapshot = hostsRef.v3ImportLadderBuild.body.innerHTML;
    return { rows: tableRows, warnings: [] };
  };
  const built = buildContext({ enrich, calls });
  var hostsRef = built.hosts;
  await built.context.buildSubtitleMaterial();
  assert.match(snapshot, /ladderCount\{"done":640,"total":1382\}/);
  const m = built.context.pendingAudio.ladder;
  assert.equal(m.steps.video.state, "done");
  assert.equal(m.steps.store.state, "done");
  assert.equal(m.steps.niqqud.state, "done");
  assert.equal(m.steps.open.state, "done");
  // Check-phase steps that ran before this attempt are shown as done, never as pending.
  assert.equal(m.steps.upload.state, "done");
});
