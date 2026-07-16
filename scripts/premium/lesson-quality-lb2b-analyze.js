#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_RUN = path.join(ROOT, "docs", "research", "lesson-quality", "2026-07-16", "lb2b-run");
const DIMENSIONS = ["linguistic_correctness", "naturalness", "level_fit", "source_grounding", "answerability", "pedagogical_value", "cognitive_load"];

function parseArgs(argv) {
  const args = { run: DEFAULT_RUN };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--run") args.run = path.resolve(argv[++i]);
    else throw new Error("LB2B_ANALYZE_UNKNOWN_ARGUMENT");
  }
  return args;
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n"); }
function readTsv(file) {
  const lines = fs.readFileSync(file, "utf8").trimEnd().split(/\r?\n/);
  const header = lines.shift().split("\t");
  return lines.filter(Boolean).map((line) => Object.fromEntries(line.split("\t").map((value, index) => [header[index], value || ""])));
}
function round(value, places = 3) { const scale = 10 ** places; return Math.round((Number(value) || 0) * scale) / scale; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }

function humanRow(row) {
  const scores = {};
  let complete = true;
  for (const dimension of DIMENSIONS) {
    const value = String(row[dimension] || "UNSCORED").trim();
    const score = Number(value);
    if (!Number.isInteger(score) || score < 1 || score > 5) complete = false;
    else scores[dimension] = score;
  }
  const criticalText = String(row.critical_errors || "UNSCORED").trim();
  const criticalComplete = criticalText !== "" && criticalText !== "UNSCORED";
  return { blind_id: row.blind_id, complete: complete && criticalComplete, scores,
    has_critical_error: criticalComplete ? criticalText !== "NONE" : null, critical_errors: criticalText,
    confidence: row.reviewer_confidence || "UNSCORED", notes: row.reviewer_notes || "" };
}

function thresholdOption(rows, id, minDimension, minMean) {
  const complete = rows.filter((row) => row.complete);
  const accepted = complete.filter((row) => !row.has_critical_error && Math.min(...Object.values(row.scores)) >= minDimension && mean(Object.values(row.scores)) >= minMean);
  return { id, rule: `no critical error; every dimension >= ${minDimension}; mean >= ${minMean}`,
    evaluated_candidates: complete.length, accepted_candidates: accepted.length,
    acceptance_rate: complete.length ? round(accepted.length / complete.length) : null };
}

function groupHuman(rows, key) {
  const groups = new Map();
  for (const row of rows.filter((entry) => entry.complete)) {
    const value = row.identity[key];
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return Object.fromEntries([...groups.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([value, entries]) => {
    const dimensions = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, round(mean(entries.map((entry) => entry.scores[dimension]))) ]));
    return [value, { candidates: entries.length, dimension_means: dimensions,
      overall_mean: round(mean(entries.flatMap((entry) => Object.values(entry.scores)))),
      critical_error_candidates: entries.filter((entry) => entry.has_critical_error).length }];
  }));
}

function shadowAgreement(rows) {
  const paired = rows.filter((row) => row.complete && row.artifact.shadow_evaluation && row.artifact.shadow_evaluation.status === "SCORED_ADVISORY");
  if (!paired.length) return { status: "NOT_AVAILABLE", paired_candidates: 0 };
  const absoluteErrors = [];
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const row of paired) {
    for (const dimension of DIMENSIONS) absoluteErrors.push(Math.abs(row.scores[dimension] - row.artifact.shadow_evaluation.scores[dimension]));
    const human = row.has_critical_error;
    const shadow = row.artifact.shadow_evaluation.critical_failure_codes.length > 0;
    if (human && shadow) tp += 1; else if (!human && shadow) fp += 1; else if (human && !shadow) fn += 1; else tn += 1;
  }
  return { status: "PILOT_SINGLE_REVIEWER", paired_candidates: paired.length, dimension_mae: round(mean(absoluteErrors)),
    critical_detection: { tp, fp, fn, tn, recall: tp + fn ? round(tp / (tp + fn)) : null, false_positive_rate: fp + tn ? round(fp / (fp + tn)) : null },
    authority_eligibility: "NOT_ELIGIBLE_SINGLE_REVIEWER_ADVISORY_ONLY" };
}

function pairwiseSummary(rows, identityByBlind) {
  const scored = rows.filter((row) => row.preferred_candidate && row.preferred_candidate !== "UNSCORED");
  const wins = {};
  let ties = 0, invalid = 0;
  for (const row of scored) {
    if (row.preferred_candidate === "TIE") { ties += 1; continue; }
    if (row.preferred_candidate !== row.candidate_a && row.preferred_candidate !== row.candidate_b) { invalid += 1; continue; }
    const identity = identityByBlind.get(row.preferred_candidate);
    if (!identity) { invalid += 1; continue; }
    const label = `${identity.provider}::${identity.model}::${identity.prompt_variant}`;
    wins[label] = (wins[label] || 0) + 1;
  }
  return { status: scored.length ? "PILOT_SINGLE_REVIEWER" : "UNSCORED", scored_pairs: scored.length, ties, invalid, wins };
}

function latencyOptions(metrics) {
  const latency = metrics.latency_ms || {};
  if (latency.p90 == null) return [{ id: "pending", rule: "No latency threshold until provider calls exist." }];
  return [
    { id: "measured_p90", rule: `candidate-generation p90 <= ${latency.p90} ms`, note: "Measured service target, not a hard kill threshold." },
    { id: "measured_p95", rule: `candidate-generation p95 <= ${latency.p95} ms`, note: "More tolerant offline target." },
    { id: "existing_timeout", rule: "each provider attempt <= 30000 ms", note: "Existing fail-closed adapter timeout; one repair remains separate." }
  ];
}

function markdown(result) {
  const lines = ["# LB2-B threshold options", "", `**Status:** \`${result.status}\`; no production decision.`, "",
    "## Human-quality options", ""];
  for (const option of result.threshold_options.human_quality) lines.push(`- **${option.id}:** ${option.rule}; accepted ${option.accepted_candidates}/${option.evaluated_candidates}${option.acceptance_rate == null ? "" : ` (${Math.round(option.acceptance_rate * 100)}%)`}.`);
  lines.push("", "A critical error vetoes every option. These are comparison scenarios, not approved promotion gates.", "", "## Latency options", "");
  for (const option of result.threshold_options.latency) lines.push(`- **${option.id}:** ${option.rule}${option.note ? ` — ${option.note}` : ""}`);
  lines.push("", "## Shadow boundary", "", `- ${result.shadow_agreement.authority_eligibility || "No paired human-shadow evidence; critic remains advisory."}`,
    "- One reviewer plus one adjudicator is pilot evidence; it cannot establish inter-rater reliability.",
    "- No critic may edit, repair, select or publish a learner-visible lesson in LB2-B.");
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const key = readJson(path.join(args.run, "blind-key.json"));
  const metrics = readJson(path.join(args.run, "metrics.json"));
  const reviewerRows = readTsv(path.join(args.run, "reviewer_worksheet.tsv"));
  const pairRows = readTsv(path.join(args.run, "pairwise_worksheet.tsv"));
  const identityByBlind = new Map(key.candidates.map((entry) => [entry.blind_id, entry]));
  const humans = reviewerRows.map(humanRow).map((row) => {
    const identity = identityByBlind.get(row.blind_id);
    if (!identity) throw new Error("LB2B_ANALYZE_UNKNOWN_BLIND_ID");
    return { ...row, identity, artifact: readJson(path.join(args.run, identity.raw_artifact)) };
  });
  const complete = humans.filter((row) => row.complete);
  const result = { schema_version: "lesson-quality-lb2b-analysis-v1",
    status: complete.length === humans.length && humans.length ? "HUMAN_REVIEW_COMPLETE_PILOT" : "HUMAN_REVIEW_PENDING",
    candidates_in_packet: humans.length, human_scored_candidates: complete.length,
    structural_metrics: metrics, human_by_model: groupHuman(humans, "model"), human_by_prompt: groupHuman(humans, "prompt_variant"),
    shadow_agreement: shadowAgreement(humans), pairwise: pairwiseSummary(pairRows, identityByBlind),
    threshold_options: { human_quality: [thresholdOption(humans, "strict", 4, 4.5), thresholdOption(humans, "balanced", 3, 4), thresholdOption(humans, "exploratory", 3, 3.7)], latency: latencyOptions(metrics) },
    promotion_result: "NO_DECISION", limitations: ["single human reviewer", "one adjudicator", "no inter-rater reliability", "cost is estimated rather than provider-billed"] };
  writeJson(path.join(args.run, "analysis.json"), result);
  fs.writeFileSync(path.join(args.run, "threshold-options.md"), markdown(result) + "\n");
  process.stdout.write(`[lb2b-analysis] status=${result.status} scored=${result.human_scored_candidates}/${result.candidates_in_packet}\n`);
}

try { main(); } catch (error) {
  const code = error && /^LB2B_[A-Z0-9_]+$/.test(String(error.message)) ? error.message : "LB2B_ANALYZE_FAILED";
  process.stderr.write(`[lb2b-analysis] ${code}\n`);
  process.exitCode = 1;
}
