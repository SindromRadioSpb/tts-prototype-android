#!/usr/bin/env node
"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const RUNNER = path.join(ROOT, "scripts", "premium", "lesson-quality-lb2b.js");
const ANALYZER = path.join(ROOT, "scripts", "premium", "lesson-quality-lb2b-analyze.js");
const FLASH_LITE_CONFIG = path.join(ROOT, "docs", "research", "lesson-quality", "2026-07-16", "lb2b-run-config-flash-lite-free.json");
const contract = require(path.join(ROOT, "agent", "lessonCompositionContract"));
const base = path.join(ROOT, ".tmp", `lb2b-smoke-${process.pid}`);
const dry = path.join(base, "dry");
const flashLiteDry = path.join(base, "flash-lite-dry");
const controls = path.join(base, "controls");
const sentinel = "LB2B_SMOKE_SECRET_SENTINEL_4d91";
let checks = 0;

function ok(condition, message) { checks += 1; if (!condition) throw new Error(message); }
function run(file, args, env) { return childProcess.spawnSync(process.execPath, [file, ...args], { cwd: ROOT, env, encoding: "utf8", timeout: 120000 }); }
function json(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

try {
  fs.mkdirSync(base, { recursive: true });
  const cleanEnv = { ...process.env };
  delete cleanEnv.LB2B_GEMINI_KEY;
  delete cleanEnv.LB2B_OPENROUTER_KEY;
  const dryResult = run(RUNNER, ["--dry-run", "--out", dry], { ...cleanEnv, LB2B_GEMINI_KEY: sentinel });
  ok(dryResult.status === 0, "dry run must pass");
  ok(fs.readdirSync(path.join(dry, "raw")).length === 52, "dry matrix must contain 52 slots");
  const dryText = fs.readdirSync(dry, { recursive: true }).filter((entry) => !fs.statSync(path.join(dry, entry)).isDirectory())
    .map((entry) => fs.readFileSync(path.join(dry, entry), "utf8")).join("\n");
  ok(!dryText.includes(sentinel), "credential sentinel must not persist");
  const sourcePackets = json(path.join(dry, "source-packets.json"));
  ok(sourcePackets.cases.length === 13, "source packet count");
  const counts = Object.fromEntries(sourcePackets.cases.map((entry) => [entry.case_id, entry.source.row_count]));
  ok(counts.overview_146_b1_grammar_synthetic === 146, "146-row overview");
  ok(counts.series_241_b2_writing_public_domain >= 241, "241-plus public-domain series");
  ok(counts.double_reject_safe_plan >= 220, "220-plus double-reject series");

  const flashLiteDryResult = run(RUNNER, ["--dry-run", "--config", FLASH_LITE_CONFIG, "--out", flashLiteDry], cleanEnv);
  ok(flashLiteDryResult.status === 0, "Flash Lite free-tier dry run must pass");
  const flashLiteMetrics = json(path.join(flashLiteDry, "metrics.json"));
  const flashLiteManifest = json(path.join(flashLiteDry, "run-manifest.json"));
  ok(fs.readdirSync(path.join(flashLiteDry, "raw")).length === 26, "Flash Lite matrix must contain 26 slots");
  ok(flashLiteMetrics.request_spacing_ms === 5200 && flashLiteMetrics.max_provider_calls === 60,
    "Flash Lite free-tier rate guard must remain frozen");
  ok(flashLiteManifest.composer_cells.length === 1 && flashLiteManifest.composer_cells[0].model === "gemini-3.1-flash-lite",
    "Flash Lite probe must use one composer model");
  ok(flashLiteManifest.shadow_critic_enabled_offline_only === false, "single-model probe must not self-review");

  const controlResult = run(RUNNER, ["--out", controls], cleanEnv);
  ok(controlResult.status === 0, "no-key control run must pass");
  const metrics = json(path.join(controls, "metrics.json"));
  ok(metrics.generated_candidates === 8 && metrics.not_run === 44, "only deterministic controls run without keys");
  ok(metrics.calls === 0 && metrics.observed_non_thought_cost_estimate_usd === 0 && metrics.conservative_cost_bound_usd === 0,
    "no-key run makes no provider calls or cost claims");
  ok(metrics.latency_ms.p50 === null, "no fake zero latency");
  const blindKey = json(path.join(controls, "blind-key.json"));
  ok(blindKey.candidates.length === 8, "blind control packet count");
  const shadowStatuses = [];
  for (const entry of blindKey.candidates) {
    const artifact = json(path.join(controls, entry.raw_artifact));
    shadowStatuses.push(artifact.shadow_evaluation && artifact.shadow_evaluation.status);
    const result = contract.validateCompositionDetailed(artifact.lesson, { sourceIds: [artifact.source.id],
      anchorIds: artifact.source.anchor_windows.map((anchor) => anchor.id), focuses: artifact.request.focuses, maxItems: 7 });
    const controllerRejectedConstruct = artifact.delivery && artifact.delivery.reason === "SIMULATED_CONTROLLER_REJECT_INVENTED_CONSTRUCT";
    ok(result.ok || (controllerRejectedConstruct && JSON.stringify(result.codes) === JSON.stringify(["MISSING_FOCUS"])),
      `deterministic controls either validate or honestly omit a rejected construct (${entry.blind_id}: ${result.codes.join(",")})`);
  }
  ok(shadowStatuses.filter((status) => status === "NOT_RUN_NO_CLI_KEY").length === 2, "one stratified critic slot per generated control case");
  ok(shadowStatuses.filter((status) => status === "NOT_RUN_STRATIFIED_SAMPLE").length === 6, "non-sampled critic slots make no call");
  const blindText = fs.readdirSync(path.join(controls, "blind")).map((entry) => fs.readFileSync(path.join(controls, "blind", entry), "utf8")).join("\n");
  for (const leak of ["adversarial_", "provider_absent", "double_reject", "gemini", "premium_draft", "basic_plan"]) ok(!blindText.includes(leak), `blind identity leak: ${leak}`);
  const pairRows = fs.readFileSync(path.join(controls, "pairwise_worksheet.tsv"), "utf8").trimEnd().split(/\r?\n/);
  ok(pairRows.length === 5, "two control cases yield four balanced blind pairs");
  const analysisResult = run(ANALYZER, ["--run", controls], cleanEnv);
  ok(analysisResult.status === 0, "pending human analysis must pass");
  ok(json(path.join(controls, "analysis.json")).status === "HUMAN_REVIEW_PENDING", "analysis stays pending");
  const resumeResult = run(RUNNER, ["--resume", "--out", controls], cleanEnv);
  ok(resumeResult.status !== 0 && resumeResult.stderr.includes("LB2B_COMPLETED_RUN_IMMUTABLE"), "completed run must be immutable");
  process.stdout.write(`smoke:lesson-quality-lb2b OK (${checks} checks)\n`);
} catch (error) {
  process.stderr.write(`smoke:lesson-quality-lb2b FAIL: ${error && error.message ? error.message : "UNKNOWN"}\n`);
  process.exitCode = 1;
} finally {
  const resolved = path.resolve(base);
  const safeRoot = path.resolve(ROOT, ".tmp") + path.sep;
  if (resolved.startsWith(safeRoot) && path.basename(resolved).startsWith("lb2b-smoke-")) fs.rmSync(resolved, { recursive: true, force: true });
}
