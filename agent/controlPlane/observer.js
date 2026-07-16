"use strict";

const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const repo = require("../../db/cp0ObservationRepo");
const registry = require("./scenarioRegistry");
const contracts = require("./contracts");

const als = new AsyncLocalStorage();
const QUEUE_ITEMS_MAX = 512;
const QUEUE_BYTES_MAX = 512 * 1024;
const BATCH_MAX = 64;
const RETRIES_MAX = 2;
const RECORD_BYTES_MAX = 4096;
const bootId = "boot_" + crypto.randomUUID();
const startedAt = new Date().toISOString();
let sequence = 0;
let queue = [];
let queueBytes = 0;
let flushTimer = null;
let flushing = null;
let circuitOpen = false;
let lastCheckpoint = 0;
let flushFailures = 0;
const flushDurations = [];
const queueWaits = [];

const stats = {
  eligible_runs_total: 0, start_enqueued_total: 0, start_persisted_total: 0,
  terminal_expected_total: 0, terminal_enqueued_total: 0, terminal_persisted_total: 0,
  dropped_total: 0, rejected_total: 0, circuit_open_total: 0,
};
const reasons = Object.create(null);

function incReason(code, n = 1) { reasons[code] = (reasons[code] || 0) + n; }
function envOn() { return process.env.CP0_OBSERVER_ENABLED === "1"; }
function allowSet() { return new Set(String(process.env.CP0_OBSERVER_OWNER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean)); }
function scenarioSet() { return new Set(String(process.env.CP0_OBSERVER_SCENARIOS || "").split(",").map((s) => s.trim()).filter(Boolean)); }

function enabledFor(userId, scenarioId) {
  if (!envOn() || circuitOpen || !userId || !registry.get(scenarioId)) return false;
  const allow = allowSet();
  if (!allow.size || !allow.has(String(userId))) return false;
  const selected = scenarioSet();
  return !selected.size || selected.has(String(scenarioId));
}

function openCircuit(reason) {
  if (!circuitOpen) { circuitOpen = true; stats.circuit_open_total++; }
  incReason(reason || "CIRCUIT_OPEN");
}

function expiration(days) { return new Date(Date.now() + days * 86400000).toISOString(); }
function latencyBucket(ms) {
  for (const b of [10,25,50,100,250,500,1000,2000,5000,10000,30000]) if (ms <= b) return b;
  return 60000;
}
function safeOutcome(result, thrown) {
  if (thrown) return "EXCEPTION";
  const raw = result && result.ok === false ? String(result.error || "FAILED") : "OK";
  return /^[A-Z0-9_:-]{1,64}$/.test(raw) ? raw : "RESULT_ERROR";
}
function matchesAllowed(actual, allowed) {
  return allowed.some((x) => x.endsWith("*") ? actual.startsWith(x.slice(0, -1)) : actual === x);
}

function bootPayload(clean = false) {
  const now = new Date().toISOString();
  const counters = JSON.stringify(Object.fromEntries(Object.entries(reasons).sort()));
  return {
    process_boot_id: bootId, observer_schema_version: contracts.SCHEMA_VERSION,
    started_at: startedAt, last_checkpoint_at: now, finished_at: clean ? now : null,
    clean_shutdown: clean ? 1 : 0, ...stats, counters_json: counters,
    expires_at: expiration(90),
  };
}

async function checkpoint(clean = false) {
  if (!envOn()) return;
  try { await repo.checkpointBoot(bootPayload(clean)); lastCheckpoint = Date.now(); }
  catch (_) { incReason("BOOT_CHECKPOINT_FAILED"); }
}

function scheduleFlush() {
  if (flushTimer || flushing) return;
  flushTimer = setTimeout(() => { flushTimer = null; void flushNow(); }, 25);
  if (flushTimer.unref) flushTimer.unref();
}

function enqueue(record) {
  try {
    contracts.validateRecord(record);
    const bytes = Buffer.byteLength(JSON.stringify(record), "utf8");
    if (bytes > RECORD_BYTES_MAX) throw new Error("CP0_RECORD_TOO_LARGE");
    if (queue.length >= QUEUE_ITEMS_MAX || queueBytes + bytes > QUEUE_BYTES_MAX) {
      stats.dropped_total++; incReason("QUEUE_FULL"); openCircuit("QUEUE_FULL"); return false;
    }
    queue.push({ record, bytes, enqueuedAt: Date.now() }); queueBytes += bytes;
    if (record.record_kind === "RUN_STARTED") stats.start_enqueued_total++;
    else stats.terminal_enqueued_total++;
    if (queue.length >= BATCH_MAX) void flushNow(); else scheduleFlush();
    return true;
  } catch (_) {
    stats.rejected_total++; incReason("SCHEMA_REJECTED"); openCircuit("SCHEMA_REJECTED"); return false;
  }
}

async function persistBatch(batch) {
  let last;
  for (let attempt = 0; attempt <= RETRIES_MAX; attempt++) {
    try { return await repo.insertBatch(batch.map((x) => x.record)); }
    catch (e) { last = e; if (attempt < RETRIES_MAX) await new Promise((r) => setTimeout(r, 25 * (attempt + 1))); }
  }
  throw last;
}

async function flushNow() {
  if (flushing) {
    await flushing;
    return queue.length ? flushNow() : undefined;
  }
  if (!queue.length) { if (Date.now() - lastCheckpoint >= 1000) await checkpoint(false); return; }
  const items = queue.splice(0, BATCH_MAX);
  queueBytes -= items.reduce((n, x) => n + x.bytes, 0);
  flushing = (async () => {
    const flushStarted = Date.now();
    for (const x of items) { queueWaits.push(Math.max(0, flushStarted - x.enqueuedAt)); if (queueWaits.length > 512) queueWaits.shift(); }
    try {
      await persistBatch(items); flushFailures = 0;
      for (const x of items) {
        if (x.record.record_kind === "RUN_STARTED") stats.start_persisted_total++;
        else stats.terminal_persisted_total++;
      }
    } catch (_) {
      flushFailures++; stats.dropped_total += items.length; incReason("FLUSH_FAILED", items.length);
      if (flushFailures >= 3 || items.length) openCircuit("FLUSH_FAILED");
    } finally {
      flushDurations.push(Date.now() - flushStarted); if (flushDurations.length > 512) flushDurations.shift();
      flushing = null;
      await checkpoint(false);
      if (queue.length && !circuitOpen) scheduleFlush();
    }
  })();
  return flushing;
}

function baseRecord(ctx, desc, kind, ids) {
  const now = new Date().toISOString();
  return {
    id: "obs_" + crypto.randomUUID(), user_id: String(ctx.userId), run_id: ids.runId,
    request_id: ids.requestId, parent_run_id: ids.parentRunId || null,
    process_boot_id: bootId, sequence: ids.sequence, record_kind: kind,
    role_id: desc.role, scenario_id: desc.scenarioId, surface: desc.surface,
    workflow_version: registry.WORKFLOW_VERSION, role_registry_version: registry.VERSION,
    observer_schema_version: contracts.SCHEMA_VERSION, terminal_status: null,
    live_outcome_code: null, shadow_decision: null, manifest_json: "{}",
    latency_bucket_ms: null, created_at: now, expires_at: expiration(30),
  };
}

async function observe(ctx, descriptor, execute) {
  const scenarioId = String(descriptor && descriptor.scenarioId || "");
  if (!enabledFor(ctx && ctx.userId, scenarioId)) return execute();
  const reg = registry.get(scenarioId);
  const surface = contracts.normalizeSurface((descriptor && descriptor.surface) || (ctx && ctx.surface));
  const desc = { scenarioId, role: reg.role, surface };
  const ids = { runId: "run_" + crypto.randomUUID(), requestId: "req_" + crypto.randomUUID(), sequence: ++sequence };
  const state = { desc, ids, capabilities: new Set(), artifacts: new Set(), consents: new Set(), model_attempts: new Set(), canonical_events: new Set(), deliveries: new Set(), degradations: new Set() };
  stats.eligible_runs_total++; stats.terminal_expected_total++;
  enqueue(baseRecord(ctx, desc, "RUN_STARTED", ids));
  const start = Date.now();
  let result, thrown;
  try { result = await als.run(state, execute); return result; }
  catch (e) { thrown = e; throw e; }
  finally {
    try {
      const mismatches = [];
      if (!reg.surfaces.includes(surface)) mismatches.push("SURFACE_SCOPE_MISMATCH");
      for (const c of state.capabilities) if (!matchesAllowed(c, reg.capabilities)) mismatches.push("CAPABILITY_NOT_ALLOWED_SHADOW");
      const terminal = baseRecord(ctx, desc, "RUN_TERMINAL", ids);
      terminal.terminal_status = thrown ? "FAILED" : (state.degradations.size ? "DEGRADED" : "SUCCEEDED");
      terminal.live_outcome_code = safeOutcome(result, thrown);
      terminal.shadow_decision = mismatches.length ? "MISMATCH" : "ALLOW";
      terminal.manifest_json = contracts.buildManifest({
        capabilities: [...state.capabilities], artifacts: [...state.artifacts], consents: [...state.consents],
        model_attempts: [...state.model_attempts], canonical_events: [...state.canonical_events],
        deliveries: [...state.deliveries], mismatches, degradations: [...state.degradations],
      });
      terminal.latency_bucket_ms = latencyBucket(Date.now() - start);
      enqueue(terminal);
    } catch (_) {
      stats.rejected_total++; incReason("TERMINAL_CONSTRUCTION_FAILED"); openCircuit("TERMINAL_CONSTRUCTION_FAILED");
    }
  }
}

function note(setName, code) {
  const s = als.getStore(); if (!s) return;
  try { s[setName].add(contracts.safeCode(code)); } catch (_) { stats.rejected_total++; openCircuit("NOTE_REJECTED"); }
}
function noteCapability(id, outcome = "OK") { note("capabilities", id); if (outcome !== "OK") note("degradations", `CAPABILITY_${String(outcome).replace(/[^A-Z0-9_]/g, "_")}`); }
function noteConsent(code) { note("consents", code); }
function noteRoute(route, model, schemaMode, attempt, reservation) { note("model_attempts", [route,model,schemaMode,attempt,reservation].filter(Boolean).map((x) => String(x).replace(/[^A-Za-z0-9_.:@/-]/g, "_")).join(":")); note("capabilities", "model:generate"); }
function noteArtifact(type, ref, publication) { note("artifacts", [type,ref,publication].filter(Boolean).join(":")); }
function noteCanonicalEvent(kind, ref) { note("canonical_events", [kind,ref].filter(Boolean).join(":")); note("capabilities", "canonical:review_event"); }
function noteDelivery(decision, channel, outcome) { note("deliveries", [decision,channel,outcome].filter(Boolean).join(":")); note("capabilities", `delivery:${channel}`); }
function noteDegradation(code) { note("degradations", code); }

async function shutdownForEvidence() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  while (queue.length || flushing) { if (flushing) await flushing; else await flushNow(); }
  await checkpoint(true);
  return snapshot();
}
function percentile(values, q) { if (!values.length) return 0; const x=[...values].sort((a,b)=>a-b); return x[Math.min(x.length-1,Math.floor(x.length*q))]; }
function snapshot() { return { boot_id: bootId, circuit_open: circuitOpen, queue_items: queue.length, queue_bytes: queueBytes, stats: { ...stats }, transport: { queue_wait_p95_ms: percentile(queueWaits,.95), queue_wait_p99_ms: percentile(queueWaits,.99), flush_p95_ms: percentile(flushDurations,.95), flush_p99_ms: percentile(flushDurations,.99), flush_max_ms: flushDurations.length ? Math.max(...flushDurations) : 0 }, reasons: { ...reasons } }; }

if (envOn()) {
  let signalClosing = false;
  const closeOnSignal = () => {
    if (signalClosing) return;
    signalClosing = true;
    const hard = setTimeout(() => process.exit(0), 1000);
    if (hard.unref) hard.unref();
    shutdownForEvidence().catch(() => {}).finally(() => process.exit(0));
  };
  process.once("SIGTERM", closeOnSignal);
  process.once("SIGINT", closeOnSignal);
}

module.exports = { observe, enabledFor, noteCapability, noteConsent, noteRoute, noteArtifact, noteCanonicalEvent, noteDelivery, noteDegradation, flushNow, shutdownForEvidence, snapshot, _openCircuit: openCircuit };
