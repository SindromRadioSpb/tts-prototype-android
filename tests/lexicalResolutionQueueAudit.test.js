"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Audit = require("../scripts/premium/lexical-resolution-queue-audit.js");

test("assigns every queue cluster to one mutually exclusive remediation lane", () => {
  const report = {
    text: { text_id: "t" },
    resolution_queue: { uncertain_occurrences: 3, coverage_pct: 100, reason_counts: { identity_guarded: 2, unknown_pos: 1 }, clusters: [
      { lp_resolution_cluster_id: "names", occurrence_count: 2, reasons: ["identity_guarded"], occurrences: [{ identity_guard_reason: "propernoun-vs-dictionary-sense" }], occurrence_ids: ["1", "2"] },
      { lp_resolution_cluster_id: "unknown", occurrence_count: 1, reasons: ["unknown_pos"], occurrences: [{}], occurrence_ids: ["3"] }
    ] }
  };
  const out = Audit.auditReport(report, { occurrences: 5, clusters: 3 });
  assert.equal(out.exhaustive, true);
  assert.equal(out.clusters.length, 2);
  assert.deepEqual(out.queue.lanes.named_entity_identity, { clusters: 1, occurrences: 2 });
  assert.deepEqual(out.queue.lanes.pos_coverage_gap, { clusters: 1, occurrences: 1 });
  assert.equal(out.reduction.removed_occurrences, 2);
});

test("numeral metadata conflicts are not mislabeled as general ambiguity", () => {
  const lane = Audit.classifyCluster({ reasons: ["identity_guarded"], lp_pos: "numeral", occurrences: [{ lp_pos: "numeral", identity_guard_reason: "context-vs-pealim-pos" }] });
  assert.equal(lane.lane, "pealim_pos_override_candidate");
  assert.equal(lane.automation, "curated-rule-candidate");
});
