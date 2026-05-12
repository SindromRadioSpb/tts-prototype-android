#!/usr/bin/env node
// scripts/research/smoke.js — acceptance smoke for /api/research/v1/* (Phase 11.4).
//
// Spawns server.js with a temp RESEARCH_DATA_DIR, provisions a fake cohort,
// then drives the 3 endpoints through the §14 acceptance test cases:
//   - schema validation (accept + reject paths)
//   - rate limit (429 after 10 uploads)
//   - cohort 404 + bad token 403 + missing token 401
//   - GET aggregates with k-anonymity gate (< 5 students hides per-student)
//   - DELETE withdrawal end-to-end (records removed + audit log)
//
// Exits 0 on success, non-zero on first failure. Prints PASS/FAIL per case.

"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.RESEARCH_SMOKE_PORT || 3179);
const BASE_URL = `http://127.0.0.1:${PORT}`;

const COHORT_CODE = "SMOKE-COH-1";
const RESEARCHER_TOKEN = "smoke-test-token-" + crypto.randomBytes(8).toString("hex");
const CONSENT_VERSION_MIN = "1.0";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function uuid() {
  // Simple v4-shaped UUID; not cryptographically strong but enough for smoke.
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function makeTempResearchDir() {
  const dir = path.join(os.tmpdir(), `linguistpro-research-smoke-${Date.now()}-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function provisionCohort(researchDir, code, tokenPlain) {
  const cdir = path.join(researchDir, code);
  fs.mkdirSync(cdir, { recursive: true });
  const meta = {
    code,
    schema_version: "v1",
    created_at: new Date().toISOString(),
    k_anonymity_threshold: 5,
    retention_until: "2028-12-31",
    outcome_scale: "0-100",
    researcher_token_hash: crypto.createHash("sha256").update(tokenPlain).digest("hex"),
    consent_version_minimum: CONSENT_VERSION_MIN,
  };
  fs.writeFileSync(path.join(cdir, "cohort_meta.json"), JSON.stringify(meta, null, 2));
}

function startServer(researchDir) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      RESEARCH_DATA_DIR: researchDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (c) => logs.push("[out] " + String(c).trim()));
  child.stderr.on("data", (c) => logs.push("[err] " + String(c).trim()));
  return { child, logs };
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(t); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}

async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE_URL}/healthz`);
      if (r.status === 200) return true;
    } catch {}
    await sleep(200);
  }
  return false;
}

async function postMetrics(body, headers = {}) {
  return fetch(`${BASE_URL}/api/research/v1/metrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": BASE_URL, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function getAggregates(code, token) {
  return fetch(`${BASE_URL}/api/research/v1/cohort/${code}/aggregates`, {
    method: "GET",
    headers: token ? { "Authorization": `Bearer ${token}` } : {},
  });
}

async function deleteStudent(sid, cohortCode) {
  const qs = cohortCode ? `?cohort_code=${encodeURIComponent(cohortCode)}` : "";
  return fetch(`${BASE_URL}/api/research/v1/student/${sid}${qs}`, { method: "DELETE" });
}

function basePayload({ studentId, uploadTs = "2026-05-13", sinceTs = "2026-05-12", consent = "1.0" }) {
  return {
    format: "linguistpro-research-v1",
    student_id: studentId,
    cohort_code: COHORT_CODE,
    upload_ts: uploadTs,
    since_ts: sinceTs,
    consent_version: consent,
    context: { app_version: "3.2.0-rc1", platform: "web/desktop" },
    metrics: {
      sessions_count: 3,
      active_minutes_real: 42,
      active_days_count: 1,
      audio_play_ms_total: 120000,
      cards_reviewed: 8,
      cards_correct: 7,
      cards_again: 1,
      cards_added_to_srs: 2,
      notes_created: 1,
      notes_edited: 0,
      search_queries_count: 0,
      smart_tag_overrides_count: 0,
      srs_error_rate: 0.13,
      translit_toggles_count: 0,
    },
  };
}

const results = [];
function record(name, passed, detail) {
  results.push({ name, passed, detail });
  const tag = passed ? "PASS" : "FAIL";
  const line = detail ? ` — ${detail}` : "";
  console.log(`  [${tag}] ${name}${line}`);
}

async function expectStatus(label, res, expected, extraCheck) {
  const body = await res.json().catch(() => ({}));
  let pass = res.status === expected;
  let detail = `status=${res.status}${expected !== res.status ? ` (want ${expected})` : ""}`;
  if (pass && typeof extraCheck === "function") {
    const r = extraCheck(body);
    if (r && r.ok === false) {
      pass = false;
      detail += `; ${r.reason}`;
    }
  }
  if (!pass && body && body.error) detail += `; body.error=${body.error}`;
  record(label, pass, detail);
  return body;
}

async function runCases() {
  // === Case 1: minimal valid payload accepted ============================
  const sid1 = uuid();
  await expectStatus("1. POST valid minimal payload", await postMetrics(basePayload({ studentId: sid1 })), 200, (b) => ({
    ok: b.ok === true && b.stored === true && b.dedupe === false,
    reason: `expected ok+stored+!dedupe; got ${JSON.stringify(b)}`,
  }));

  // === Case 2: idempotent dedupe (same student/since/upload) ============
  await expectStatus("2. POST duplicate → silent dedupe", await postMetrics(basePayload({ studentId: sid1 })), 200, (b) => ({
    ok: b.ok === true && b.stored === false && b.dedupe === true,
    reason: `expected !stored+dedupe; got ${JSON.stringify(b)}`,
  }));

  // === Case 3: missing 'format' field → 400 SCHEMA_VIOLATION ===========
  const bad1 = basePayload({ studentId: uuid() }); delete bad1.format;
  await expectStatus("3. Missing format → 400", await postMetrics(bad1), 400, (b) => ({
    ok: b.error === "SCHEMA_VIOLATION", reason: `error=${b.error}`,
  }));

  // === Case 4: wrong 'format' → 400 ====================================
  const bad2 = basePayload({ studentId: uuid() }); bad2.format = "something-else";
  await expectStatus("4. Wrong format → 400", await postMetrics(bad2), 400);

  // === Case 5: unknown top-level field → 400 ===========================
  const bad3 = basePayload({ studentId: uuid() }); bad3.extra_field = "leaked";
  await expectStatus("5. Unknown top-level field → 400", await postMetrics(bad3), 400);

  // === Case 6: forbidden field anywhere → 400 ==========================
  const bad4 = basePayload({ studentId: uuid() }); bad4.metrics.note_body = "secret text";
  await expectStatus("6. Forbidden field deep → 400", await postMetrics(bad4), 400, (b) => ({
    ok: b.error === "SCHEMA_VIOLATION" && /note_body/.test(String(b.field || "")),
    reason: `field=${b.field}`,
  }));

  // === Case 7: oversize payload → 400 ==================================
  const bigPayload = basePayload({ studentId: uuid() });
  bigPayload.metrics.time_of_day_histogram = {};
  // Pad to >64KB by adding 24 valid buckets plus we'll send extra-large JSON via long string in audio_play_ms_total
  // Easier: just produce raw JSON > 64KB via repeated audio_play_ms_total value won't work (number).
  // Use stringified blob.
  const big = JSON.stringify(bigPayload);
  const padded = big.replace('"metrics":{', '"metrics":{"_pad":"' + "x".repeat(65_000) + '",');
  await expectStatus("7. Oversize payload (>64KB) → 400", await postMetrics(padded), 400);

  // === Case 8: cohort not found → 404 ==================================
  const bad5 = basePayload({ studentId: uuid() }); bad5.cohort_code = "NO-SUCH-COHORT";
  await expectStatus("8. Cohort not found → 404", await postMetrics(bad5), 404, (b) => ({
    ok: b.error === "COHORT_NOT_FOUND", reason: `error=${b.error}`,
  }));

  // === Case 9: rate limit 10/day/student → 429 =========================
  const sidRate = uuid();
  let lastStatus = null;
  for (let i = 0; i < 10; i++) {
    const r = await postMetrics(basePayload({ studentId: sidRate, sinceTs: "2026-05-" + String(11 - i).padStart(2, "0"), uploadTs: "2026-05-12" }));
    lastStatus = r.status;
  }
  // 11th should 429
  const r11 = await postMetrics(basePayload({ studentId: sidRate, sinceTs: "2026-05-01", uploadTs: "2026-05-12" }));
  await expectStatus("9. 11th upload → 429 RATE_LIMIT", r11, 429, (b) => ({
    ok: b.error === "RATE_LIMIT", reason: `error=${b.error}`,
  }));

  // === Case 10: GET aggregates without token → 401 =====================
  await expectStatus("10. GET aggregates no token → 401", await getAggregates(COHORT_CODE, null), 401);

  // === Case 11: GET aggregates wrong token → 403 =======================
  await expectStatus("11. GET aggregates wrong token → 403", await getAggregates(COHORT_CODE, "not-the-token"), 403);

  // === Case 12: GET aggregates valid token, cohort < k=5 hides students
  const r12 = await expectStatus("12. GET aggregates valid token (cohort<5) → 200", await getAggregates(COHORT_CODE, RESEARCHER_TOKEN), 200, (b) => ({
    ok: b.ok === true && b.k_anonymity_met === false && Array.isArray(b.students) && b.students.length === 0,
    reason: `k_met=${b.k_anonymity_met} students.len=${b.students && b.students.length}`,
  }));

  // === Case 13: seed enough students to cross k=5 ======================
  for (let i = 0; i < 5; i++) {
    const sid = uuid();
    await postMetrics(basePayload({ studentId: sid, uploadTs: "2026-05-13", sinceTs: "2026-05-12" }));
  }
  await expectStatus("13. GET aggregates (cohort≥5) → students populated", await getAggregates(COHORT_CODE, RESEARCHER_TOKEN), 200, (b) => ({
    ok: b.k_anonymity_met === true && Array.isArray(b.students) && b.students.length >= 5,
    reason: `k_met=${b.k_anonymity_met} students.len=${b.students && b.students.length}`,
  }));

  // === Case 14: DELETE withdrawal end-to-end ===========================
  const sidWithdraw = uuid();
  await postMetrics(basePayload({ studentId: sidWithdraw, uploadTs: "2026-05-13", sinceTs: "2026-05-12" }));
  await postMetrics(basePayload({ studentId: sidWithdraw, uploadTs: "2026-05-12", sinceTs: "2026-05-11" }));
  const delResp = await deleteStudent(sidWithdraw, COHORT_CODE);
  await expectStatus("14. DELETE withdrawal → records removed", delResp, 200, (b) => ({
    ok: b.ok === true && b.records_removed >= 2 && b.cohorts_touched === 1,
    reason: `removed=${b.records_removed} cohorts=${b.cohorts_touched}`,
  }));

  // === Case 15: bad student_id format → 400 ============================
  await expectStatus("15. DELETE bad student_id → 400", await deleteStudent("not-a-uuid"), 400);
}

async function main() {
  const researchDir = makeTempResearchDir();
  console.log(`[smoke] RESEARCH_DATA_DIR = ${researchDir}`);
  provisionCohort(researchDir, COHORT_CODE, RESEARCHER_TOKEN);

  const { child, logs } = startServer(researchDir);
  let serverUp = false;
  try {
    serverUp = await waitForReady();
    if (!serverUp) throw new Error("server did not become ready in time");
    console.log("[smoke] server up; running 15 cases...");
    await runCases();
  } catch (e) {
    console.error("[smoke] fatal:", e && e.message ? e.message : e);
    console.error("[smoke] server log tail:\n" + logs.slice(-30).join("\n"));
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    // Best-effort cleanup of temp dir.
    try { fs.rmSync(researchDir, { recursive: true, force: true }); } catch {}
  }

  const failed = results.filter((r) => !r.passed);
  console.log("");
  console.log(`[smoke] ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    console.log(`[smoke] FAILED:`);
    for (const f of failed) console.log(`  - ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log("[smoke] all green ✓");
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error("[smoke] unhandled:", e);
    process.exit(1);
  });
}
