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
    localAsrClient: { getMediaJob: async () => ({}), deleteMediaJob: async (id) => { calls.push("delete:" + id); return {}; } },
    mediaJobStatus() {}, setBusy() {}, setSubtitlePlanStatus() {}, renderSubtitlePlan() {}, renderMediaReadiness() {},
    tr: (key, params) => key + (params ? JSON.stringify(params) : ""),
    $: (id) => hosts[id] || (id === "v3ImportSubtitlePlanStatus" ? status
      : id === "v3ImportSubtitlePlanLite" ? { checked: false } : null),
    buildSubtitleTable: async () => { calls.push("table"); material.tableRows = rows; return rows; },
    applySubtitleMaterial: async () => { calls.push("apply"); return true; },
    Date, AbortController,
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
  assert.deepEqual(calls, ["prepare:full", "store:full", "table", "table", "apply", "delete:job"],
    "retry must reuse the prepared and stored video, and the finished job is released");
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

function clickCancel(host) { host.listeners.forEach((fn) => fn({ target: { closest: (s) => (s === '[data-ladder-action="cancel"]' ? {} : null) } })); }
const tick = () => new Promise((r) => setImmediate(r));

test("Cancel during niqqud stops the step and Retry resumes there with the saved video", async () => {
  const calls = [];
  let attempts = 0;
  const enrich = async (rows, opts) => {
    attempts++;
    if (attempts === 1) {
      await new Promise((resolve) => opts.signal.addEventListener("abort", resolve));
      const e = new Error("stopped"); e.code = "MATERIAL_CANCELED"; throw e;
    }
    return { rows, warnings: [] };
  };
  const { context, hosts } = buildContext({ enrich, calls });
  const run = context.buildSubtitleMaterial();
  for (let i = 0; i < 5; i++) await tick();
  const build = hosts.v3ImportLadderBuild;
  assert.match(build.body.innerHTML, /data-ladder-action="cancel"/);
  clickCancel(build);
  await run;
  assert.equal(stateOf(build, "niqqud"), "failed");
  assert.match(build.body.innerHTML, /ladderCancelled/);
  assert.match(build.body.innerHTML, /ladderRetry/);
  build.clickRetry();
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(calls, ["prepare:full", "store:full", "table", "table", "apply", "delete:job"]);
  assert.equal(build.hidden, true);
});

test("Cancel during the video step cancels the companion job and offers a fresh start", async () => {
  const calls = [];
  const built = buildContext({ enrich: async (rows) => ({ rows, warnings: [] }), calls });
  let restarts = 0;
  built.context.startMediaPreflight = () => { restarts++; };
  built.context.window.SubtitleMaterialImport.confirmMediaPlan = async (opts) => {
    calls.push("prepare");
    await new Promise((resolve) => opts.waitOptions.signal.addEventListener("abort", resolve));
    const e = new Error("canceled"); e.code = "MEDIA_JOB_CANCELED"; throw e;
  };
  const run = built.context.buildSubtitleMaterial();
  for (let i = 0; i < 5; i++) await tick();
  clickCancel(built.hosts.v3ImportLadderBuild);
  await run;
  const html = built.hosts.v3ImportLadderBuild.body.innerHTML;
  assert.equal(stateOf(built.hosts.v3ImportLadderBuild, "video"), "failed");
  assert.match(html, /ladderCancelledRestart/);
  assert.match(html, /ladderRestart/);
  built.hosts.v3ImportLadderBuild.clickRetry();
  assert.equal(restarts, 1);
});

test("own abandoned checks are released from a full companion queue; others are only forgotten", async () => {
  const { context } = buildContext({ enrich: async (rows) => ({ rows, warnings: [] }), calls: [] });
  const store = new Map([["linguistpro.localAsr.ownMediaJobs", JSON.stringify(["waiting", "done", "gone"])]]);
  context.window.localStorage = { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) };
  const cancelled = [];
  context.localAsrClient = {
    getMediaJob: async (id) => {
      if (id === "gone") { const e = new Error("nf"); e.status = 404; throw e; }
      return { job_id: id, state: id === "waiting" ? "WAITING_FOR_DECISION" : "COMPLETE" };
    },
    cancelMediaJob: async (id) => { cancelled.push(id); return { state: "CANCELED" }; },
  };
  const released = await context.releaseOwnWaitingJobs(null);
  assert.equal(released, 1);
  assert.deepEqual(cancelled, ["waiting"]);
  assert.deepEqual(JSON.parse(store.get("linguistpro.localAsr.ownMediaJobs")), []);
  context.rememberMediaJob("next");
  assert.deepEqual(JSON.parse(store.get("linguistpro.localAsr.ownMediaJobs")), ["next"]);
});

test("a failed video step offers a fresh start, since the companion job is final", async () => {
  const calls = [];
  const built = buildContext({ enrich: async (rows) => ({ rows, warnings: [] }), calls });
  let restarts = 0;
  built.context.startMediaPreflight = () => { restarts++; };
  built.context.window.SubtitleMaterialImport.confirmMediaPlan = async () => {
    const e = new Error("MEDIA_DISK_FULL"); e.code = "MEDIA_JOB_FAILED"; e.job = { state: "FAILED", error: "MEDIA_DISK_FULL" }; throw e;
  };
  await built.context.buildSubtitleMaterial();
  const html = built.hosts.v3ImportLadderBuild.body.innerHTML;
  assert.match(html, /ladderErrDiskFull/);
  assert.match(html, /ladderRestart/);
  built.hosts.v3ImportLadderBuild.clickRetry();
  assert.equal(restarts, 1);
});

test("the plan refuses to start when the companion reported too little disk space", () => {
  const source = fs.readFileSync(path.join(__dirname, "../public/js/studio-import.js"), "utf8");
  const start = source.indexOf("  function subtitlePlanRowItems(plan)");
  const end = source.indexOf("  function renderSubtitlePlanQuestion(plan)", start);
  const context = {
    pendingSubtitleMaterial: { failed: [] },
    pendingAudio: { mediaReadiness: { disk_sufficient: false, estimated_output_bytes: 3.5 * 1024 ** 3, disk_free_bytes: 3.1 * 1024 ** 3 } },
    tr: (k, p) => k + (p ? JSON.stringify(p) : ""),
    window: { MediaReadiness: { humanBytes: (n) => (n / 1024 ** 3).toFixed(1) + " GB" } },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const plan = { status: "ready", video: { action: "copy" }, audio: null, text: null, translation: null,
    size: {}, lite: { available: false } };
  const rows = context.subtitlePlanRowItems(plan);
  const disk = rows.find((r) => /subtitlePlanDiskShort/.test(r.text));
  assert.ok(disk, "a row names the shortage");
  assert.equal(disk.state, "error");
  assert.match(disk.text, /3\.5 GB/);
  assert.match(disk.text, /3\.1 GB/);
  assert.equal(context.subtitlePlanDiskShort(), true);
});

function planRows(plan) {
  const source = fs.readFileSync(path.join(__dirname, "../public/js/studio-import.js"), "utf8");
  const start = source.indexOf("  function subtitlePlanRowItems(plan)");
  const end = source.indexOf("  function renderSubtitlePlanQuestion(plan)", start);
  const context = { pendingSubtitleMaterial: { failed: [] }, pendingAudio: { mediaReadiness: {} },
    tr: (k, p) => k + (p ? JSON.stringify(p) : ""), window: { MediaReadiness: { humanBytes: String } } };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return context.subtitlePlanRowItems(Object.assign({ status: "ready", video: { action: "copy" }, audio: null,
    text: null, translation: null, size: {}, lite: { available: false }, translation_min_coverage: 0.85 }, plan));
}

test("the translation row states partial coverage and why a track was not taken", () => {
  const partial = planRows({ translation: { index: 3, language: "ru", coverage: 0.823 } });
  const row = partial.find((r) => /subtitlePlanTranslationPartial/.test(r.text));
  assert.ok(row && row.state === "warn");
  assert.match(row.text, /"coverage":82/);
  const rejected = planRows({ translation_rejected: { index: 3, language: "ru", coverage: 0.823 } });
  const low = rejected.find((r) => /subtitlePlanTranslationLow/.test(r.text));
  assert.ok(low, "the refusal names the track and its coverage");
  assert.match(low.text, /"index":3/);
  assert.match(low.text, /"min":85/);
  assert.ok(!rejected.some((r) => /subtitlePlanTranslationNone/.test(r.text)));
});

function labelContext(readiness, tracks) {
  const source = fs.readFileSync(path.join(__dirname, "../public/js/studio-import.js"), "utf8");
  const start = source.indexOf("  function subtitlePlanRowItems(plan)");
  const end = source.indexOf("  function renderSubtitlePlanQuestion(plan)", start);
  const context = { pendingSubtitleMaterial: { failed: [], tracks }, pendingAudio: { mediaReadiness: readiness },
    tr: (k, p) => k + (p ? JSON.stringify(p) : ""), window: { MediaReadiness: { humanBytes: String }, appGetLocale: () => "ru" }, Intl };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return context;
}
// Sweet Mud, 2026-09-28: the player shows audio 1 [Russian], 2 [Hebrew] and subtitles
// 1 [Russian], 2 [English], 3 [Hebrew]; Studio said "track 5" and "#5 · he".
const SWEET_MUD = { track_inventory: { audio: [{ index: 1, language: "rus" }, { index: 2, language: "heb" }] },
  subtitle_tracks: [{ index: 3, language: "rus" }, { index: 4, language: "eng" }, { index: 5, language: "heb" }] };

test("tracks are numbered per kind and named by language, as a player shows them", () => {
  const c = labelContext(SWEET_MUD, []);
  assert.equal(c.trackOrdinal("subtitle", 5), 3);
  assert.equal(c.trackOrdinal("audio", 2), 2);
  assert.equal(c.languageName("heb"), "иврит");
  assert.equal(c.languageName("ru"), "русский");
  assert.match(c.trackLabel("subtitle", { index: 4, language: "en", title: "SDH" }), /trackLabel\{"n":2,"language":"английский"\} · SDH/);
  const rows = c.subtitlePlanRowItems({ status: "ready", video: { action: "copy" }, audio: { index: 2, language: "he" },
    text: { index: 5, cue_count: 874 }, translation: null, size: {}, lite: { available: false }, translation_min_coverage: 0.85 });
  assert.ok(rows.some((r) => /subtitlePlanAudio\{"language":"иврит","index":2\}/.test(r.text)));
  assert.ok(rows.some((r) => /subtitlePlanText\{"index":3,"count":874\}/.test(r.text)));
});
