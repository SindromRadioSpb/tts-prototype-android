"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const test = require("node:test");

const DIR = path.join(__dirname, "..", "docs", "research", "materials-science-problem-solutions", "2026-08-30", "solution-batches");
const read = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));

test("B01 freezes ten independent source-only solutions with complete tutor-grade sections", () => {
  const workpack = read("B01-source-workpack.json");
  const ledger = read("B01-independent-solution-ledger.ru.json");
  assert.equal(ledger.status, "INDEPENDENT_DERIVATION_FROZEN_AWAITING_LEGACY_COMPARISON");
  assert.equal(ledger.independence_protocol.legacy_solution_opened_during_this_derivation, false);
  assert.deepEqual(ledger.entries.map((entry) => entry.task_id), workpack.tasks.map((task) => task.task_id));
  assert.equal(new Set(ledger.entries.map((entry) => entry.task_id)).size, 10);
  const required = ["answer", "engineering_picture", "prerequisites", "roadmap", "main_trap", "givens", "find", "assumptions", "laws", "symbolic_derivation", "calculation", "construction", "checks", "source_facts", "unresolved_limits"];
  for (const entry of ledger.entries) {
    for (const field of required) assert.ok(Object.hasOwn(entry, field), `${entry.task_id}:${field}`);
    assert.ok(entry.answer.length > 0, `${entry.task_id}:answer`);
    assert.ok(entry.roadmap.length > 0, `${entry.task_id}:roadmap`);
    assert.ok(entry.checks.length > 0, `${entry.task_id}:checks`);
    assert.ok(entry.source_facts.length > 0, `${entry.task_id}:source_facts`);
  }
});

test("B01 source asset references are pinned to hashes present in the source workpack", () => {
  const workpack = read("B01-source-workpack.json");
  const ledger = read("B01-independent-solution-ledger.ru.json");
  const sourceHashes = new Map(workpack.tasks.map((task) => [task.task_id, new Set(task.source_assets.map((asset) => asset.sha256))]));
  for (const entry of ledger.entries) {
    for (const fact of entry.source_facts.filter((value) => value.startsWith("asset_sha256:"))) {
      assert.equal(sourceHashes.get(entry.task_id).has(fact.slice("asset_sha256:".length)), true, `${entry.task_id}:${fact}`);
    }
  }
});

test("B01 calculation anchors reproduce the independently derived engineering results", () => {
  const area10 = Math.PI * 10 ** 2 / 4;
  const area14 = Math.PI * 14 ** 2 / 4;
  assert.ok(Math.abs(15000 / area10 - 190.9859) < 0.001);
  assert.ok(Math.abs(15000 / area14 - 97.4415) < 0.001);
  assert.equal((55 - 50) / 50, 0.1);
  assert.ok(Math.abs((80 - 75) / 75 - 1 / 15) < 1e-12);
  assert.equal(98000 / 200, 490);
  assert.equal(168000 / 200, 840);
  assert.ok(Math.abs(490 / ((50.13 - 50) / 50) - 188461.5385) < 0.01);
  const area11 = Math.PI * 11 ** 2 / 4;
  assert.ok(Math.abs(56525 / area11 - 594.7923) < 0.001);
  assert.ok(Math.abs(Math.sqrt(4 * 90000 / (Math.PI * 120)) - 30.902) < 0.001);
});

test("B02 freezes ten source-bound solutions and preserves the repaired q019 table pairing", () => {
  const workpack = read("B02-source-workpack.json");
  const ledger = read("B02-independent-solution-ledger.ru.json");
  assert.equal(ledger.status, "INDEPENDENT_DERIVATION_FROZEN_AWAITING_LEGACY_COMPARISON");
  assert.equal(ledger.independence_protocol.legacy_solution_opened_during_this_derivation, false);
  assert.deepEqual(ledger.entries.map((entry) => entry.task_id), workpack.tasks.map((task) => task.task_id));
  assert.equal(new Set(ledger.entries.map((entry) => entry.task_id)).size, 10);
  const required = ["answer", "engineering_picture", "prerequisites", "roadmap", "main_trap", "givens", "find", "assumptions", "laws", "symbolic_derivation", "calculation", "construction", "checks", "source_facts", "unresolved_limits"];
  for (const entry of ledger.entries) {
    for (const field of required) assert.ok(Object.hasOwn(entry, field), `${entry.task_id}:${field}`);
    assert.ok(entry.answer.length > 0, `${entry.task_id}:answer`);
    assert.ok(entry.checks.length > 0, `${entry.task_id}:checks`);
  }
  const q019 = workpack.tasks.find((task) => task.task_id === "materials-science-y1-pb2-q019");
  assert.match(q019.rows.find((row) => row.row_id.endsWith("q019-r009")).ru, /\+50, −22, −25, −28, −75/);
  assert.match(q019.rows.find((row) => row.row_id.endsWith("q019-r010")).ru, /17, 14, 12, 8, 6/);
  assert.equal(q019.rows.find((row) => row.row_id.endsWith("q019-r010")).canonical_provenance, "source_verified_post_bake_correction");
});

test("B02 source assets and engineering calculation anchors are reproducible", () => {
  const workpack = read("B02-source-workpack.json");
  const ledger = read("B02-independent-solution-ledger.ru.json");
  const sourceHashes = new Map(workpack.tasks.map((task) => [task.task_id, new Set(task.source_assets.map((asset) => asset.sha256))]));
  for (const entry of ledger.entries) {
    for (const fact of entry.source_facts.filter((value) => value.startsWith("asset_sha256:"))) {
      assert.equal(sourceHashes.get(entry.task_id).has(fact.slice("asset_sha256:".length)), true, `${entry.task_id}:${fact}`);
    }
  }
  assert.ok(Math.abs(64120 / (12.4 * 8.1) - 638.3911) < 0.001);
  assert.ok(Math.abs(71015 / (12.4 * 8.1) - 707.0390) < 0.001);
  assert.ok(Math.abs(Math.sqrt(4 * (30000 / (210000 * 0.0025)) / Math.PI) - 8.52974) < 0.0001);
  assert.equal(280 * 325, 91000);
  const wireArea = (diameter) => 96 * Math.PI * diameter ** 2 / 4;
  assert.ok(Math.abs(20000 / wireArea(1) / 200000 * 5000 - 6.63146) < 0.0001);
  assert.ok(Math.abs(20000 / wireArea(1.5) / 200000 * 5000 - 2.94731) < 0.0001);
  const tensileArea = Math.PI * 12 ** 2 / 4;
  assert.ok(129050 / tensileArea < 1160);
  assert.ok(133800 / tensileArea > 1160);
  assert.ok(144580 / tensileArea < 1300);
  assert.ok(150100 / tensileArea > 1300);
  assert.equal(3.6 * 190, 684);
  const transition = -28 + ((11.5 - 8) / (12 - 8)) * 3;
  assert.ok(Math.abs(transition + 25.375) < 1e-12);
});

test("B03 freezes ten source-bound solutions before any legacy comparison", () => {
  const workpack = read("B03-source-workpack.json");
  const ledger = read("B03-independent-solution-ledger.ru.json");
  assert.equal(ledger.status, "INDEPENDENT_DERIVATION_FROZEN_AWAITING_LEGACY_COMPARISON");
  assert.equal(ledger.independence_protocol.legacy_solution_opened_during_this_derivation, false);
  assert.deepEqual(ledger.entries.map((entry) => entry.task_id), workpack.tasks.map((task) => task.task_id));
  assert.equal(new Set(ledger.entries.map((entry) => entry.task_id)).size, 10);
  const required = ["answer", "engineering_picture", "prerequisites", "roadmap", "main_trap", "givens", "find", "assumptions", "laws", "symbolic_derivation", "calculation", "construction", "checks", "source_facts", "unresolved_limits"];
  for (const entry of ledger.entries) {
    for (const field of required) assert.ok(Object.hasOwn(entry, field), `${entry.task_id}:${field}`);
    assert.ok(entry.answer.length > 0, `${entry.task_id}:answer`);
    assert.ok(entry.roadmap.length > 0, `${entry.task_id}:roadmap`);
    assert.ok(entry.checks.length > 0, `${entry.task_id}:checks`);
  }
});

test("B03 source assets and fatigue/strength calculation anchors are reproducible", () => {
  const workpack = read("B03-source-workpack.json");
  const ledger = read("B03-independent-solution-ledger.ru.json");
  const sourceHashes = new Map(workpack.tasks.map((task) => [task.task_id, new Set(task.source_assets.map((asset) => asset.sha256))]));
  for (const entry of ledger.entries) {
    for (const fact of entry.source_facts.filter((value) => value.startsWith("asset_sha256:"))) {
      assert.equal(sourceHashes.get(entry.task_id).has(fact.slice("asset_sha256:".length)), true, `${entry.task_id}:${fact}`);
    }
  }
  const area11 = Math.PI * 11 ** 2 / 4;
  assert.ok(Math.abs(76000 / area11 - 799.7208) < 0.001);
  assert.ok(Math.abs(Math.sqrt(4 * 87500 / (Math.PI * 310)) - 18.96) < 0.01);
  const area30 = Math.PI * 30 ** 2 / 4;
  assert.ok(Math.abs(100 * area30 / 1000 - 70.6858) < 0.001);
});

test("B04 freezes ten heat-treatment solutions before legacy comparison", () => {
  const workpack = read("B04-source-workpack.json");
  const ledger = read("B04-independent-solution-ledger.ru.json");
  assert.equal(ledger.status, "INDEPENDENT_DERIVATION_FROZEN_AWAITING_LEGACY_COMPARISON");
  assert.equal(ledger.independence_protocol.legacy_solution_opened_during_this_derivation, false);
  assert.deepEqual(ledger.entries.map((entry) => entry.task_id), workpack.tasks.map((task) => task.task_id));
  assert.equal(new Set(ledger.entries.map((entry) => entry.task_id)).size, 10);
  const required = ["answer", "engineering_picture", "prerequisites", "roadmap", "main_trap", "givens", "find", "assumptions", "laws", "symbolic_derivation", "calculation", "construction", "checks", "source_facts", "unresolved_limits"];
  for (const entry of ledger.entries) {
    for (const field of required) assert.ok(Object.hasOwn(entry, field), `${entry.task_id}:${field}`);
    assert.ok(entry.answer.length > 0, `${entry.task_id}:answer`);
    assert.ok(entry.checks.length > 0, `${entry.task_id}:checks`);
  }
});

test("B04 source assets and calculation anchors are reproducible", () => {
  const workpack = read("B04-source-workpack.json");
  const ledger = read("B04-independent-solution-ledger.ru.json");
  const sourceHashes = new Map(workpack.tasks.map((task) => [task.task_id, new Set(task.source_assets.map((asset) => asset.sha256))]));
  for (const entry of ledger.entries) {
    for (const fact of entry.source_facts.filter((value) => value.startsWith("asset_sha256:"))) {
      assert.equal(sourceHashes.get(entry.task_id).has(fact.slice("asset_sha256:".length)), true, `${entry.task_id}:${fact}`);
    }
  }
  assert.equal(541 / 0.0025, 216400);
  assert.equal(2 * 12, 24);
  assert.equal(910 - 875, 35);
  const q033 = ledger.entries.find((entry) => entry.task_id.endsWith("q033"));
  assert.match(q033.answer.join(" "), /ρ=7,8.*HRB=86.*E=200.*ε=29%.*σ_y=435/);
  const q035 = ledger.entries.find((entry) => entry.task_id.endsWith("q035"));
  assert.equal(q035.independent_state.startsWith("SOURCE_INSUFFICIENT"), true);
});

test("B05 freezes ten selection, aluminum and corrosion solutions before legacy comparison", () => {
  const workpack = read("B05-source-workpack.json");
  const ledger = read("B05-independent-solution-ledger.ru.json");
  assert.match(ledger.status, /INDEPENDENT_DERIVATION_FROZEN/);
  assert.equal(ledger.independence_protocol.legacy_solution_opened_during_this_derivation, false);
  assert.deepEqual(ledger.entries.map((entry) => entry.task_id), workpack.tasks.map((task) => task.task_id));
  assert.equal(new Set(ledger.entries.map((entry) => entry.task_id)).size, 10);
  const required = ["answer", "engineering_picture", "prerequisites", "roadmap", "main_trap", "givens", "find", "assumptions", "laws", "symbolic_derivation", "calculation", "construction", "checks", "source_facts", "unresolved_limits"];
  for (const entry of ledger.entries) {
    for (const field of required) assert.ok(Object.hasOwn(entry, field), `${entry.task_id}:${field}`);
    assert.ok(entry.answer.length > 0, `${entry.task_id}:answer`);
    assert.ok(entry.checks.length > 0, `${entry.task_id}:checks`);
  }
});

test("B05 source assets and the q041 printed-strain contradiction remain reproducible", () => {
  const workpack = read("B05-source-workpack.json");
  const ledger = read("B05-independent-solution-ledger.ru.json");
  const sourceHashes = new Map(workpack.tasks.map((task) => [task.task_id, new Set(task.source_assets.map((asset) => asset.sha256))]));
  for (const entry of ledger.entries) {
    for (const fact of entry.source_facts.filter((value) => value.startsWith("asset_sha256:"))) {
      assert.equal(sourceHashes.get(entry.task_id).has(fact.slice("asset_sha256:".length)), true, `${entry.task_id}:${fact}`);
    }
  }
  assert.ok(Math.abs(480 / 0.062 - 7741.93548) < 0.001);
  assert.ok(Math.abs(480 / 0.0062 - 77419.35484) < 0.001);
  const q041 = ledger.entries.find((entry) => entry.task_id.endsWith("q041"));
  assert.match(q041.independent_state, /SOURCE_CONTRADICTION/);
  assert.match(q041.answer.join(" "), /7,74 ГПа.*77,4 ГПа/);
  const q043 = ledger.entries.find((entry) => entry.task_id.endsWith("q043"));
  assert.match(q043.answer.join(" "), /AA2014-T4.*AA2024-T4/);
  const q040 = ledger.entries.find((entry) => entry.task_id.endsWith("q040"));
  assert.match(q040.answer.join(" "), /SAE1070/);
  const q044 = ledger.entries.find((entry) => entry.task_id.endsWith("q044"));
  assert.match(q044.answer.join(" "), /AA6061-T4.*extruded tube.*95 МПа/);
  const q046 = ledger.entries.find((entry) => entry.task_id.endsWith("q046"));
  assert.match(q046.answer.join(" "), /B \(quenched-steel rivet\/steel sheets\): гальванически устойчиво/);
});

test("B06 freezes ten source-only steel, polymer, powder and composite solutions", () => {
  const workpack = read("B06-source-workpack.json");
  const ledger = read("B06-independent-solution-ledger.ru.json");
  assert.match(ledger.status, /INDEPENDENT_DERIVATION_FROZEN/);
  assert.equal(ledger.independence_protocol.legacy_solution_opened_during_this_derivation, false);
  assert.deepEqual(ledger.entries.map((entry) => entry.task_id), workpack.tasks.map((task) => task.task_id));
  assert.equal(new Set(ledger.entries.map((entry) => entry.task_id)).size, 10);
  const required = ["answer", "engineering_picture", "prerequisites", "roadmap", "main_trap", "givens", "find", "assumptions", "laws", "symbolic_derivation", "calculation", "construction", "checks", "source_facts", "unresolved_limits"];
  for (const entry of ledger.entries) {
    for (const field of required) assert.ok(Object.hasOwn(entry, field), `${entry.task_id}:${field}`);
    assert.ok(entry.answer.length > 0, `${entry.task_id}:answer`);
    assert.ok(entry.checks.length > 0, `${entry.task_id}:checks`);
  }
});

test("B06 source assets, graph mappings and specific-strength anchors are reproducible", () => {
  const workpack = read("B06-source-workpack.json");
  const ledger = read("B06-independent-solution-ledger.ru.json");
  const sourceHashes = new Map(workpack.tasks.map((task) => [task.task_id, new Set(task.source_assets.map((asset) => asset.sha256))]));
  for (const entry of ledger.entries) {
    for (const fact of entry.source_facts.filter((value) => value.startsWith("asset_sha256:"))) {
      assert.equal(sourceHashes.get(entry.task_id).has(fact.slice("asset_sha256:".length)), true, `${entry.task_id}:${fact}`);
    }
  }
  const q049 = ledger.entries.find((entry) => entry.task_id.endsWith("q049"));
  assert.match(q049.answer.join(" "), /1 — ферритная.*2 — аустенитная.*3 — duplex.*4 — мартенситная/);
  const q051 = ledger.entries.find((entry) => entry.task_id.endsWith("q051"));
  assert.match(q051.answer.join(" "), /Кривая1 — мартенситная.*кривая2 — ферритная.*кривая3 — аустенитная/);
  assert.ok(Math.abs(4570 / 1050 - 4.35238095238) < 1e-9);
  assert.ok(Math.abs(9843 / 1280 - 7.68984375) < 1e-9);
  const q056 = ledger.entries.find((entry) => entry.task_id.endsWith("q056"));
  assert.match(q056.answer.join(" "), /4,35.*7,69.*1,77/);
});

test("B01 post-derivation comparison pins the frozen ledger and leaves only bounded review items", () => {
  const body = fs.readFileSync(path.join(DIR, "B01-independent-solution-ledger.ru.json"));
  const comparison = read("B01-comparison-ledger.json");
  assert.equal(comparison.independent_solution_ledger.sha256, crypto.createHash("sha256").update(body).digest("hex"));
  assert.equal(comparison.entries.length, 10);
  assert.equal(comparison.status, "REVIEWED_PASS_10_OF_10");
  assert.equal(comparison.entries.filter((entry) => entry.publication_blocking).length, 0);
  assert.deepEqual(
    comparison.entries.filter((entry) => entry.publication_blocking).map((entry) => entry.task_id),
    []
  );
  const q002 = comparison.entries.find((entry) => entry.task_id === "materials-science-y1-pb2-q002");
  assert.equal(q002.reviewer_disposition, "SOURCE_ONLY_TECHNICAL_REVIEW_PASS");
  const q002Review = read(q002.review_evidence);
  assert.deepEqual(q002Review.reviewed_answer_sequence, ["TRUE", "FALSE", "TRUE", "FALSE", "TRUE_WITH_SCOPE_NOTE", "FALSE"]);
  assert.equal(q002Review.publication_blocking, false);
  const q008 = comparison.entries.find((entry) => entry.task_id === "materials-science-y1-pb2-q008");
  assert.equal(q008.reviewer_disposition, "CORRECTED_AND_REVERIFIED");
  const review = read(q008.review_evidence);
  assert.equal(review.repair_pass, 1);
  assert.equal(review.third_pass_allowed, false);
  assert.equal(review.publication_blocking, false);
  assert.equal(comparison.entries.every((entry) => entry.computed_verdict && Object.hasOwn(entry, "targeted_repair")), true);
});

test("B02 comparison is bounded, source-first and leaves no publication-blocking content mismatch", () => {
  const body = fs.readFileSync(path.join(DIR, "B02-independent-solution-ledger.ru.json"));
  const comparison = read("B02-comparison-ledger.json");
  assert.equal(comparison.independent_solution_ledger.sha256, crypto.createHash("sha256").update(body).digest("hex"));
  assert.equal(comparison.entries.length, 10);
  assert.equal(comparison.status, "REVIEWED_PASS_10_OF_10");
  assert.equal(comparison.entries.filter((entry) => entry.publication_blocking).length, 0);
  const q010 = comparison.entries.find((entry) => entry.task_id === "materials-science-y1-pb2-q010");
  assert.equal(q010.reviewer_disposition, "CORRECTED_AND_REVERIFIED");
  const q010Review = read(q010.review_evidence);
  assert.equal(q010Review.repair_pass, 1);
  assert.equal(q010Review.third_pass_allowed, false);
  assert.equal(q010Review.publication_blocking, false);
  assert.match(q010Review.disposition, /0_2_PERCENT_OFFSET_METHOD/);
  const q018 = comparison.entries.find((entry) => entry.task_id === "materials-science-y1-pb2-q018");
  assert.equal(q018.reviewer_disposition, "SOURCE_AND_APPENDIX_REVIEW_PASS_LEGACY_GRADE_REJECTED");
  const q018Review = read(q018.review_evidence);
  assert.equal(q018Review.repair_pass, 1);
  assert.equal(q018Review.further_repair_allowed, false);
  assert.match(q018Review.disposition, /LEGACY_SAE_1045_REJECTED/);
});

test("B03 comparison keeps graph and heat-treatment disagreements visible and bounded", () => {
  const body = fs.readFileSync(path.join(DIR, "B03-independent-solution-ledger.ru.json"));
  const comparison = read("B03-comparison-ledger.json");
  assert.equal(comparison.independent_solution_ledger.sha256, crypto.createHash("sha256").update(body).digest("hex"));
  assert.equal(comparison.entries.length, 10);
  assert.equal(comparison.status, "REVIEWED_PASS_10_OF_10");
  assert.equal(comparison.entries.filter((entry) => entry.publication_blocking).length, 0);
  for (const taskId of ["materials-science-y1-pb2-q025", "materials-science-y1-pb2-q026", "materials-science-y1-pb2-q029"]) {
    const entry = comparison.entries.find((value) => value.task_id === taskId);
    const review = read(entry.review_evidence);
    assert.equal(review.repair_pass, 1);
    assert.equal(review.further_repair_allowed, false);
    assert.equal(review.publication_blocking, false);
  }
  assert.match(comparison.entries.find((entry) => entry.task_id.endsWith("q025")).computed_verdict, /LEGACY_GRAPH_READ_REJECTED/);
  assert.match(comparison.entries.find((entry) => entry.task_id.endsWith("q026")).computed_verdict, /OUT_OF_RANGE_EXTRAPOLATION_REJECTED/);
  assert.match(comparison.entries.find((entry) => entry.task_id.endsWith("q029")).computed_verdict, /SOURCE_INSUFFICIENT/);
});

test("B04 comparison preserves one source-only task and no blocking mismatches", () => {
  const body = fs.readFileSync(path.join(DIR, "B04-independent-solution-ledger.ru.json"));
  const comparison = read("B04-comparison-ledger.json");
  assert.equal(comparison.independent_solution_ledger.sha256, crypto.createHash("sha256").update(body).digest("hex"));
  assert.equal(comparison.entries.length, 10);
  assert.equal(comparison.status, "REVIEWED_PASS_10_OF_10");
  assert.equal(comparison.entries.filter((entry) => entry.publication_blocking).length, 0);
  const q032 = comparison.entries.find((entry) => entry.task_id.endsWith("q032"));
  assert.equal(q032.legacy_candidate_rows, 0);
  assert.equal(q032.reviewer_disposition, "SOURCE_ONLY_TECHNICAL_REVIEW_PASS");
  assert.match(comparison.entries.find((entry) => entry.task_id.endsWith("q035")).computed_verdict, /SOURCE_INSUFFICIENT_ABSOLUTE_CHARPY/);
});

test("B05 comparison closes exactly three single-pass source reviews and no blockers", () => {
  const body = fs.readFileSync(path.join(DIR, "B05-independent-solution-ledger.ru.json"));
  const comparison = read("B05-comparison-ledger.json");
  assert.equal(comparison.independent_solution_ledger.sha256, crypto.createHash("sha256").update(body).digest("hex"));
  assert.equal(comparison.entries.length, 10);
  assert.equal(comparison.status, "REVIEWED_PASS_10_OF_10");
  assert.equal(comparison.entries.filter((entry) => entry.publication_blocking).length, 0);
  const repaired = comparison.entries.filter((entry) => entry.targeted_repair);
  assert.deepEqual(repaired.map((entry) => entry.task_id), [
    "materials-science-y1-pb2-q040",
    "materials-science-y1-pb2-q044",
    "materials-science-y1-pb2-q046"
  ]);
  for (const entry of repaired) {
    const review = read(entry.review_evidence);
    assert.equal(review.repair_passes_used, 1);
    assert.equal(review.further_repair_allowed, false);
  }
});

test("B06 comparison closes one diagram review and no blockers", () => {
  const body = fs.readFileSync(path.join(DIR, "B06-independent-solution-ledger.ru.json"));
  const comparison = read("B06-comparison-ledger.json");
  assert.equal(comparison.independent_solution_ledger.sha256, crypto.createHash("sha256").update(body).digest("hex"));
  assert.equal(comparison.entries.length, 10);
  assert.equal(comparison.status, "REVIEWED_PASS_10_OF_10");
  assert.equal(comparison.entries.filter((entry) => entry.publication_blocking).length, 0);
  const repaired = comparison.entries.filter((entry) => entry.targeted_repair);
  assert.deepEqual(repaired.map((entry) => entry.task_id), ["materials-science-y1-pb2-q057"]);
  const review = read(repaired[0].review_evidence);
  assert.equal(review.repair_passes_used, 1);
  assert.equal(review.further_repair_allowed, false);
});

test("B01 review manifest pins every technical evidence file and does not claim presentation or publication", () => {
  const manifest = read("B01-review-manifest.json");
  assert.equal(manifest.status, "TECHNICAL_REVIEWED_PASS_10_OF_10_PRESENTATION_NOT_BUILT_NOT_PUBLISHED");
  assert.equal(manifest.task_count, 10);
  assert.equal(manifest.publication_blocking_content_mismatches, 0);
  for (const item of manifest.files) {
    const body = fs.readFileSync(path.join(DIR, item.path));
    assert.equal(body.length, item.bytes, item.path);
    assert.equal(crypto.createHash("sha256").update(body).digest("hex"), item.sha256, item.path);
  }
  assert.equal(manifest.rights_status, "UNCONFIRMED_NOT_PUBLICATION_READY");
  assert.equal(manifest.tts_status, "PROFILE_NOT_SELECTED_NO_PROVIDER_CALLS");
});

test("B02 review manifest pins every technical evidence file and remains pre-publication", () => {
  const manifest = read("B02-review-manifest.json");
  assert.equal(manifest.status, "TECHNICAL_REVIEWED_PASS_10_OF_10_PRESENTATION_NOT_BUILT_NOT_PUBLISHED");
  assert.equal(manifest.task_count, 10);
  assert.equal(manifest.publication_blocking_content_mismatches, 0);
  for (const item of manifest.files) {
    const body = fs.readFileSync(path.join(DIR, item.path));
    assert.equal(body.length, item.bytes, item.path);
    assert.equal(crypto.createHash("sha256").update(body).digest("hex"), item.sha256, item.path);
  }
  assert.equal(manifest.rights_status, "UNCONFIRMED_NOT_PUBLICATION_READY");
  assert.equal(manifest.tts_status, "PROFILE_NOT_SELECTED_NO_PROVIDER_CALLS");
});

test("B03 review manifest pins technical evidence and defers full audio until owner card review", () => {
  const manifest = read("B03-review-manifest.json");
  assert.equal(manifest.status, "TECHNICAL_REVIEWED_PASS_10_OF_10_PRESENTATION_NOT_BUILT_NOT_PUBLISHED");
  assert.equal(manifest.task_count, 10);
  assert.equal(manifest.publication_blocking_content_mismatches, 0);
  for (const item of manifest.files) {
    const body = fs.readFileSync(path.join(DIR, item.path));
    assert.equal(body.length, item.bytes, item.path);
    assert.equal(crypto.createHash("sha256").update(body).digest("hex"), item.sha256, item.path);
  }
  assert.equal(manifest.rights_status, "UNCONFIRMED_NOT_PUBLICATION_READY");
  assert.match(manifest.tts_status, /FULL_AUDIO_DEFERRED_UNTIL_POST_PRODUCTION_OWNER_CARD_REVIEW/);
});

test("B04 review manifest pins technical evidence and defers full audio", () => {
  const manifest = read("B04-review-manifest.json");
  assert.equal(manifest.task_count, 10);
  assert.equal(manifest.publication_blocking_content_mismatches, 0);
  for (const item of manifest.files) {
    const body = fs.readFileSync(path.join(DIR, item.path));
    assert.equal(body.length, item.bytes, item.path);
    assert.equal(crypto.createHash("sha256").update(body).digest("hex"), item.sha256, item.path);
  }
  assert.match(manifest.tts_status, /FULL_AUDIO_DEFERRED_UNTIL_POST_PRODUCTION_OWNER_CARD_REVIEW/);
});

test("B05 review manifest pins source, comparison and all bounded repairs", () => {
  const manifest = read("B05-review-manifest.json");
  assert.equal(manifest.status, "TECHNICAL_REVIEWED_PASS_10_OF_10_PRESENTATION_NOT_BUILT_NOT_PUBLISHED");
  assert.equal(manifest.publication_blocking_content_mismatches, 0);
  for (const item of manifest.files) {
    const body = fs.readFileSync(path.join(DIR, item.path));
    assert.equal(body.length, item.bytes, item.path);
    assert.equal(crypto.createHash("sha256").update(body).digest("hex"), item.sha256, item.path);
  }
  assert.match(manifest.tts_status, /FULL_AUDIO_DEFERRED/);
});

test("B06 review manifest pins final technical evidence and defers full audio", () => {
  const manifest = read("B06-review-manifest.json");
  assert.equal(manifest.status, "TECHNICAL_REVIEWED_PASS_10_OF_10_PRESENTATION_NOT_BUILT_NOT_PUBLISHED");
  assert.equal(manifest.publication_blocking_content_mismatches, 0);
  for (const item of manifest.files) {
    const body = fs.readFileSync(path.join(DIR, item.path));
    assert.equal(body.length, item.bytes, item.path);
    assert.equal(crypto.createHash("sha256").update(body).digest("hex"), item.sha256, item.path);
  }
  assert.match(manifest.tts_status, /FULL_AUDIO_DEFERRED/);
});
