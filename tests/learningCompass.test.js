const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const compass = require("../public/js/learning-compass-core.js");

const NOW = "2026-08-12T12:00:00.000Z";
const revisionHash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

function projection(states, scheduledKeys = [], extra = {}) {
  return {
    schema_version: "room.learner_projection.2.0.0",
    version: "profile-fixture-v2",
    generated_at: NOW,
    state_by_key: states,
    scheduled_keys: scheduledKeys,
    tracked_lexeme_count: new Set([...Object.keys(states), ...scheduledKeys]).size,
    ...extra,
  };
}

function ingredients(freq, extra = {}) {
  return {
    schema_version: "room.learning_ingredients.2.0.0",
    source_class: "fixture",
    source_key: "fixture:1",
    content_revision: "r1",
    content_sha256: "a".repeat(64),
    entitlement_revision: null,
    resolver_version: compass.RESOLVER_VERSION,
    key_frequencies: Object.entries(freq).map(([key, token_count]) => ({ key, token_count })),
    unresolved_token_count: 2,
    proper_name_token_count: 3,
    total_token_count: Object.values(freq).reduce((sum, n) => sum + n, 0) + 5,
    ...extra,
  };
}

test("recorded familiarity v2 returns exact auditable buckets and excludes ignore/proper names", () => {
  const result = compass.evaluateRecordedFamiliarityV2({
    ingredients: ingredients({ "pid:known": 4, "pid:learning": 3, "pid:new": 2, "pid:ignore": 5, "pid:untracked": 6 }),
    learner_projection: projection({
      "pid:known": "known",
      "pid:learning": "learning",
      "pid:new": "new",
      "pid:ignore": "ignore",
    }),
    now: NOW,
  });

  assert.equal(result.status, "AVAILABLE_LIMITED");
  assert.deepEqual(result.counts, {
    lexical_total: 25,
    eligible_denominator: 17,
    familiar: 7,
    explicit_new: 2,
    untracked: 6,
    unresolved: 2,
    ignored_excluded: 5,
    proper_names_excluded: 3,
  });
  assert.equal(result.recorded_familiar_pct_lower_bound, 41.18);
  assert.equal(result.unresolved_uncertainty_pp, 11.76);
  assert.equal(result.rank_eligible, false);
  assert.equal(result.reason_code, "UNRESOLVED_ABOVE_RANK_LIMIT");
  assert.equal("recommendation_band" in result, false);
});

test("manual new/ignore override a schedule; scheduled-only words count as familiar", () => {
  const result = compass.evaluateRecordedFamiliarityV2({
    ingredients: ingredients({ "pid:new": 2, "pid:ignore": 3, "pid:due": 5 }, {
      unresolved_token_count: 0,
      proper_name_token_count: 0,
      total_token_count: 10,
    }),
    learner_projection: projection({ "pid:new": "new", "pid:ignore": "ignore" }, ["pid:new", "pid:ignore", "pid:due"]),
    now: NOW,
  });

  assert.equal(result.status, "AVAILABLE");
  assert.equal(result.counts.familiar, 5);
  assert.equal(result.counts.explicit_new, 2);
  assert.equal(result.counts.ignored_excluded, 3);
  assert.equal(result.recorded_familiar_pct_lower_bound, 71.43);
});

test("empty profile is NEEDS_PROFILE while a valid non-empty profile may honestly report zero", () => {
  const item = ingredients({ "pid:x": 8 }, {
    unresolved_token_count: 0,
    proper_name_token_count: 0,
    total_token_count: 8,
  });
  const empty = compass.evaluateRecordedFamiliarityV2({ ingredients: item, learner_projection: projection({}), now: NOW });
  const zero = compass.evaluateRecordedFamiliarityV2({ ingredients: item, learner_projection: projection({ "pid:other": "known" }), now: NOW });

  assert.equal(empty.status, "NEEDS_PROFILE");
  assert.equal(empty.recorded_familiar_pct_lower_bound, null);
  assert.equal(zero.status, "AVAILABLE");
  assert.equal(zero.recorded_familiar_pct_lower_bound, 0);
  assert.equal(zero.counts.untracked, 8);
});

test("missing, stale, or mismatched ingredients never become a fabricated zero", () => {
  const profile = projection({ "pid:x": "known" });
  assert.equal(compass.evaluateRecordedFamiliarityV2({ ingredients: null, learner_projection: profile }).status, "NOT_PREPARED");
  assert.equal(compass.evaluateRecordedFamiliarityV2({ ingredients: { resolver_version: "old" }, learner_projection: profile }).status, "STALE");
  assert.equal(compass.evaluateRecordedFamiliarityV2({ ingredients: ingredients({ "pid:x": 1 }), learner_projection: null }).status, "UNAVAILABLE");
  const mismatch = compass.evaluateRecordedFamiliarityV2({
    ingredients: ingredients({ "pid:x": 1 }, { total_token_count: 2 }), learner_projection: profile,
  });
  assert.equal(mismatch.status, "UNSUPPORTED");
  assert.equal(mismatch.reason_code, "INGREDIENT_COUNTS_MISMATCH");
});

test("Ben-Yehuda v7 sidecar adapter preserves exact counts and revision", () => {
  const adapted = compass.ingredientsFromBenV7({
    ids: [1, 2], tok: [4, 3], m: 7, n: 10,
  }, ["10", "20", "30", "40"], {
    source_key: "benyehuda:25450",
    content_revision: "catalog-v7",
    content_sha256: "b".repeat(64),
  });

  assert.deepEqual(adapted.key_frequencies, [
    { key: "pid:20", token_count: 4 },
    { key: "pid:40", token_count: 3 },
  ]);
  assert.equal(adapted.unresolved_token_count, 3);
  assert.equal(adapted.total_token_count, 10);
  assert.equal(adapted.content_revision, "catalog-v7");
});

test("typed field provenance stays unknown unless a source really asserts or derives it", () => {
  assert.deepEqual(compass.makeSignal({ kind: "audio", value: "full" }), {
    kind: "audio",
    value: "full",
    provenance: { type: "unknown", source: null, revision: null },
    caveats: [],
  });
  assert.equal(compass.makeSignal({
    kind: "level", value: "B1", provenance: { type: "asserted", source: "studio", revision: "r7" },
  }).provenance.type, "asserted");
  assert.throws(() => compass.makeSignal({ kind: "level", value: "B1", provenance: { type: "guessed" } }), /provenance/i);
});

test("group presentation never invents TTS or an audio revision", async () => {
  const { pathToFileURL } = require("node:url");
  const presenter = await import(pathToFileURL(path.join(__dirname, "../public/js/corpus-item-presenter.js")).href);
  const item = presenter.adaptGroupCorpusItem({
    work_id: "g1", text_key: "g1", title: "שיר", rows_count: 4, audio_count: 4,
  }, { corpusId: "c1" });
  assert.equal(item.media.humanOrTts, null);
  assert.equal(item.media.revision, null);
  const audio = item.signals.find((signal) => signal.kind === "audio");
  assert.equal(audio.provenance.type, "unknown");
  assert.equal(audio.value.kind, null);
});

test("reason ladder is deterministic and does not use coverage thresholds", () => {
  assert.equal(compass.choosePrimaryReason({ continue_reading: true, group_assignment: true, recorded_familiarity: { status: "AVAILABLE" } }), "CONTINUE_READING");
  assert.equal(compass.choosePrimaryReason({ group_assignment: true, recorded_familiarity: { status: "AVAILABLE" } }), "GROUP_ASSIGNMENT");
  assert.equal(compass.choosePrimaryReason({ recorded_familiarity: { status: "AVAILABLE", rank_eligible: true } }), "RECORDED_FAMILIARITY");
  assert.equal(compass.choosePrimaryReason({ curated_start: true, asserted_level: true }), "CURATED_START");
  assert.equal(compass.choosePrimaryReason({ asserted_level: true, derived_lexical_load: true }), "ASSERTED_LEVEL");
  assert.equal(compass.choosePrimaryReason({}), "NEUTRAL");
});

test("calibration accepts only foreground explicit-completion samples and becomes ready at 5x3x2500", () => {
  const rejected = compass.qualifyReadingSample({
    content_revision: "r1", resolver_version: compass.RESOLVER_VERSION, token_count: 600,
    elapsed_foreground_ms: 20_000, completed_explicitly: true,
  });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason_code, "FOREGROUND_TOO_SHORT");

  let ledger = compass.emptyCalibrationLedger();
  const samples = [
    ["r1", 500, 300_000], ["r1", 500, 330_000], ["r2", 500, 360_000],
    ["r2", 500, 390_000], ["r3", 500, 420_000],
  ];
  for (let i = 0; i < samples.length; i += 1) {
    const [revision, tokens, elapsed] = samples[i];
    const qualified = compass.qualifyReadingSample({
      content_revision: revision,
      content_sha256: revisionHash(revision),
      resolver_version: compass.RESOLVER_VERSION,
      token_count: tokens,
      elapsed_foreground_ms: elapsed,
      completed_explicitly: true,
      completed_at: `2026-08-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
    });
    assert.equal(qualified.accepted, true);
    ledger = compass.appendCalibrationSample(ledger, qualified.sample);
  }

  const state = compass.calibrationState(ledger, { now: NOW });
  assert.equal(state.status, "READY");
  assert.equal(state.observation_count, 5);
  assert.equal(state.revision_count, 3);
  assert.equal(state.token_count, 2500);
  const range = compass.estimateReadingRange(1000, ledger, { now: NOW });
  assert.equal(range.status, "AVAILABLE");
  assert.ok(range.min_minutes < range.max_minutes);
  assert.equal("wpm" in range, false);
});

test("calibration is bounded, content-free, resettable, stale after 180 days and unstable above 3x", () => {
  let ledger = compass.emptyCalibrationLedger();
  for (let i = 0; i < 14; i += 1) {
    ledger = compass.appendCalibrationSample(ledger, {
      content_revision: `r${(i % 3) + 1}`,
      content_sha256: revisionHash(`r${(i % 3) + 1}`),
      resolver_version: compass.RESOLVER_VERSION,
      token_count: 500,
      elapsed_foreground_ms: i === 13 ? 1_800_000 : 300_000,
      completed_at: `2026-01-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
    });
  }
  assert.equal(ledger.samples.length, 12);
  assert.ok(Buffer.byteLength(JSON.stringify(ledger), "utf8") <= compass.CALIBRATION_MAX_BYTES);
  assert.equal(JSON.stringify(ledger).includes("title"), false);
  assert.equal(JSON.stringify(ledger).includes("content_revision"), false);
  assert.ok(ledger.samples.every((sample) => sample.sample_id && sample.modality === "FOREGROUND_READING" && /^[a-f0-9]{64}$/.test(sample.revision_hash)));
  assert.equal(compass.calibrationState(ledger, { now: "2026-08-12T12:00:00.000Z" }).status, "STALE");

  const unstableLedger = { ...ledger, samples: ledger.samples.map((sample, index) => ({
    ...sample,
    elapsed_foreground_ms: index < 6 ? 60_000 : 600_000,
    completed_at: `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
  })) };
  assert.equal(compass.calibrationState(unstableLedger, { now: NOW }).status, "UNSTABLE");
  assert.deepEqual(compass.resetCalibrationLedger(), compass.emptyCalibrationLedger());
});

test("local cache is additive, revision-keyed, page-batched and content-free by contract", () => {
  const migrations = fs.readFileSync(path.join(__dirname, "../public/db/migrations.js"), "utf8");
  const localDb = fs.readFileSync(path.join(__dirname, "../public/db/local-db.js"), "utf8");
  assert.match(migrations, /room_learning_compass_cache/);
  assert.match(migrations, /content_revision[\s\S]*content_sha256[\s\S]*entitlement_revision[\s\S]*resolver_version/);
  assert.doesNotMatch(migrations.match(/CREATE TABLE IF NOT EXISTS room_learning_compass_cache[\s\S]*?;`/)[0], /\btitle\b|\bbody\b|reading_session|learner_state/);
  assert.match(localDb, /export async function getLearningCompassProjection\(/);
  assert.match(localDb, /export async function getLearningCompassIngredientsBatch\(/);
  assert.match(localDb, /export async function getPersonalTextCompassProgress\(/);
  assert.match(localDb, /_COMPASS_BATCH_MAX_ITEMS = 48/);
  assert.match(localDb, /_COMPASS_BATCH_MAX_BYTES = 256 \* 1024/);
  assert.match(localDb, /_COMPASS_CACHE_MAX_ITEMS = 1000/);
  assert.match(localDb, /_COMPASS_CACHE_MAX_BYTES = 64 \* 1024 \* 1024/);
});

test("cold personal libraries self-prepare and expose only relative familiarity sorting", () => {
  const ui = fs.readFileSync(path.join(__dirname, "../public/js/library-ui.js"), "utf8");
  assert.match(ui, /COMPASS_IDLE_SESSION_MAX = 240/);
  assert.match(ui, /COMPASS_IDLE_CATALOG_WINDOW = 1000/);
  assert.match(ui, /startPersonalCompassSweep\(\)/);
  assert.match(ui, /loadPersonalFamiliarityRanking\(/);
  assert.match(ui, /sortFamiliar/);
  assert.doesNotMatch(ui, /filter\(\(item\) => item && item\.local_id\)\.slice\(0, 8\)/);
  assert.doesNotMatch(ui, /familiar_desc[\s\S]{0,240}(?:70|90|95|98)/);
});

test("dedicated worker enforces local limits and emits aggregates rather than content", () => {
  const worker = fs.readFileSync(path.join(__dirname, "../public/js/learning-compass-worker.js"), "utf8");
  assert.match(worker, /MAX_TOKENS = 250000/);
  assert.match(worker, /MAX_TYPES = 50000/);
  assert.match(worker, /DecompressionStream/);
  assert.match(worker, /key_frequencies/);
  assert.match(worker, /unresolved_token_count/);
  assert.match(worker, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(worker, /PACKET_LIMIT_EXCEEDED/);
  const returned = worker.match(/const result = \{\n\s+schema_version: "room\.learning_ingredients\.2\.0\.0"[\s\S]*?\n\s+\};/)[0];
  assert.doesNotMatch(returned, /\brows\b|\btitle\b|\bbody\b|hebrew/);
});

test("Agent Access delegates to the same v2 core and exposes no readiness band", async () => {
  const resolver = require("../agent/access/textCoverageResolver");
  const result = await resolver.calculate([
    { he: "לכתוב לכתוב", he_niqqud: "לִכְתּוֹב לִכְתּוֹב" },
  ], { version: "agent-fixture", generated_at_ms: Date.parse(NOW), manual: { "pid:1": "known" }, scheduled: [] });
  assert.equal(result.status, "AVAILABLE");
  assert.equal(result.counts.familiar, 2);
  assert.equal(result.recorded_familiar_pct_lower_bound, 100);
  assert.equal("recommendation_band" in result, false);
  const source = fs.readFileSync(path.join(__dirname, "../agent/access/textCoverageResolver.js"), "utf8");
  assert.match(source, /require\("\.\.\/\.\.\/public\/js\/learning-compass-core"\)/);
});
