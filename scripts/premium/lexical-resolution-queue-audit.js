#!/usr/bin/env node
"use strict";

// Read-only, exhaustive audit of the morphology resolution queue. It delegates
// report construction to the production preview CLI, then assigns every cluster
// to one mutually exclusive remediation lane. JSON goes to stdout; no owner data
// or LinguistPro state is changed.

const path = require("path");
const { execFileSync } = require("child_process");

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  if (i < 0) return fallback;
  const value = process.argv[i + 1];
  return value && !String(value).startsWith("--") ? value : true;
}

function classifyCluster(cluster) {
  const reasons = new Set(cluster.reasons || []);
  const first = (cluster.occurrences || [])[0] || {};
  const guard = first.identity_guard_reason || "";
  if (reasons.has("skipped_token")) return {
    lane: "tokenization_or_source_repair", automation: "source-gated",
    action: "Inspect punctuation/proclitic tokenization and repair the source or shared tokenizer; never guess a lexeme."
  };
  if (guard === "propernoun-vs-dictionary-sense") return {
    lane: "named_entity_identity", automation: "owner-or-gazetteer",
    action: "Confirm the named entity once per stable cluster or match it to a reviewed name gazetteer; do not attach a homographic dictionary sense."
  };
  if (guard === "context-vs-pealim-pos" && first.lp_pos === "numeral") return {
    lane: "pealim_pos_override_candidate", automation: "curated-rule-candidate",
    action: "Verify the exact Pealim number entry, then add a versioned ID-to-numeral override covered by a regression test."
  };
  if (guard === "context-vs-pealim-pos") return {
    lane: "wrong_dictionary_candidate", automation: "resolver-fix-candidate",
    action: "Re-resolve by exact vocalized form and contextual POS; replace the candidate only when the winning Pealim sense is unique."
  };
  if (reasons.has("ambiguous") && reasons.has("unknown_pos")) return {
    lane: "ambiguity_and_pos_gap", automation: "occurrence-review",
    action: "Choose the contextual reading and POS for this occurrence; do not batch until all contexts agree."
  };
  if (reasons.has("ambiguous")) return {
    lane: "genuine_context_ambiguity", automation: "occurrence-review",
    action: "Review the sentence context; batch only after every occurrence has been inspected and the cluster is eligible."
  };
  if (reasons.has("unknown_pos")) return {
    lane: "pos_coverage_gap", automation: "lexicon-rule-candidate",
    action: "Classify as discourse marker, closed class, abbreviation or content word; promote only reviewed reusable mappings into the resolver."
  };
  if (reasons.has("collision")) return {
    lane: "evidence_collision", automation: "fail-closed",
    action: "Reconcile canonical Pealim metadata and distinct senses before any batch decision."
  };
  return { lane: "unclassified", automation: "fail-closed", action: "Keep visible for owner review." };
}

function auditReport(report, baseline) {
  const laneCounts = {};
  const clusters = (report.resolution_queue.clusters || []).map((cluster) => {
    const classification = classifyCluster(cluster);
    if (!laneCounts[classification.lane]) laneCounts[classification.lane] = { clusters: 0, occurrences: 0 };
    laneCounts[classification.lane].clusters++;
    laneCounts[classification.lane].occurrences += cluster.occurrence_count || 0;
    const candidates = (cluster.alternatives || []).concat(cluster.candidate_evidence || []).map((candidate) => {
      const id = String(candidate && (candidate.pealim_id || candidate.id || candidate.pid) || "");
      return {
        lemma: String(candidate && (candidate.lemma || candidate.word || candidate.infinitive) || ""),
        pos: String(candidate && (candidate.lp_pos || candidate.pos || candidate.part_of_speech) || ""),
        pealim_id: id,
        pealim_url: id ? "https://www.pealim.com/ru/dict/" + id + "/" : ""
      };
    });
    return {
      cluster_id: cluster.lp_resolution_cluster_id,
      surface: cluster.surface || "",
      niqqud: cluster.niqqud || "",
      lemma: cluster.lemma || "",
      context_pos: cluster.lp_pos || "",
      occurrence_count: cluster.occurrence_count || 0,
      reasons: cluster.reasons || [],
      identity_guard_reason: ((cluster.occurrences || [])[0] || {}).identity_guard_reason || "",
      lane: classification.lane,
      automation: classification.automation,
      recommended_action: classification.action,
      batch_review_eligible: !!cluster.batch_review_eligible,
      candidates,
      occurrence_ids: (cluster.occurrence_ids || []).slice(),
      context_samples: (cluster.occurrences || []).slice(0, 3).map((occurrence) => ({
        occurrence_id: occurrence.lp_occurrence_id,
        sentence_he: occurrence.sentence_he_niqqud || occurrence.sentence_he || "",
        sentence_ru: occurrence.sentence_ru || ""
      }))
    };
  });
  const activeOccurrences = report.resolution_queue.uncertain_occurrences || 0;
  const activeClusters = clusters.length;
  const out = {
    schema: "linguistpro-lexical-resolution-queue-audit-v1",
    read_only: true,
    exhaustive: true,
    text: report.text,
    queue: {
      occurrences: activeOccurrences,
      clusters: activeClusters,
      coverage_pct: report.resolution_queue.coverage_pct,
      reason_counts: report.resolution_queue.reason_counts,
      lanes: laneCounts
    },
    clusters
  };
  if (baseline && baseline.occurrences != null && baseline.clusters != null) {
    out.reduction = {
      baseline_occurrences: baseline.occurrences,
      current_occurrences: activeOccurrences,
      removed_occurrences: baseline.occurrences - activeOccurrences,
      removed_occurrences_pct: baseline.occurrences ? Math.round((baseline.occurrences - activeOccurrences) / baseline.occurrences * 1000) / 10 : 0,
      baseline_clusters: baseline.clusters,
      current_clusters: activeClusters,
      removed_clusters: baseline.clusters - activeClusters
    };
  }
  return out;
}

function main() {
  const zip = arg("zip", "");
  const title = arg("title", "");
  const textId = arg("text-id", "");
  if (!zip || (!title && !textId)) {
    console.error("Usage: node scripts/premium/lexical-resolution-queue-audit.js --zip <bundle.zip> (--title <title> | --text-id <id>) [--baseline-occurrences N --baseline-clusters N]");
    process.exit(2);
  }
  const preview = path.join(__dirname, "obsidian-lexical-preview.js");
  const args = [preview, "--zip", String(zip), "--details"];
  if (title) args.push("--title", String(title)); else args.push("--text-id", String(textId));
  const raw = execFileSync(process.execPath, args, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  const baselineOccurrences = Number(arg("baseline-occurrences", NaN));
  const baselineClusters = Number(arg("baseline-clusters", NaN));
  const baseline = Number.isFinite(baselineOccurrences) && Number.isFinite(baselineClusters)
    ? { occurrences: baselineOccurrences, clusters: baselineClusters } : null;
  process.stdout.write(JSON.stringify(auditReport(JSON.parse(raw), baseline), null, 2) + "\n");
}

if (require.main === module) main();
module.exports = { classifyCluster, auditReport };
