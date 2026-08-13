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
    schema_version: "room.learning_ingredients.2.0.1",
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

test("compact cache tuples preserve the exact familiarity result", () => {
  const verbose = ingredients({ "pid:one": 7, "pid:two": 3 }, {
    unresolved_token_count: 0, proper_name_token_count: 0, total_token_count: 10,
  });
  const compact = { ...verbose, key_frequencies: verbose.key_frequencies.map((row) => [row.key, row.token_count]) };
  const learner = projection({ "pid:one": "known", "pid:two": "new" });
  assert.deepEqual(
    compass.evaluateRecordedFamiliarityV2({ ingredients: compact, learner_projection: learner, now: NOW }),
    compass.evaluateRecordedFamiliarityV2({ ingredients: verbose, learner_projection: learner, now: NOW }),
  );
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

test("all corpus presenters expose one honest audio coverage contract", async () => {
  const { pathToFileURL } = require("node:url");
  const presenter = await import(pathToFileURL(path.join(__dirname, "../public/js/corpus-item-presenter.js")).href);
  const partial = presenter.adaptGroupCorpusItem({
    work_id: "g-partial", text_key: "g-partial", title: "שיר", rows_count: 34, audio_count: 20,
  }, { corpusId: "c1" });
  const absent = presenter.adaptBenYehudaItem({ id: "b1", text_key: "b1", title: "יצירה", segments: 12, audio_status: "none" });
  const personal = presenter.adaptMyTextItem({ id: "m1", text_key: "m1", title: "Текст" }, {
    media: { kind: "audio", coverage: "full", countLabel: "42/42", videoAvailable: true },
  });

  assert.deepEqual(partial.readiness.caveats, []);
  assert.deepEqual({ kind: partial.media.kind, coverage: partial.media.coverage, countLabel: partial.media.countLabel },
    { kind: "audio", coverage: "partial", countLabel: "20/34" });
  assert.deepEqual({ kind: absent.media.kind, coverage: absent.media.coverage, countLabel: absent.media.countLabel },
    { kind: "audio", coverage: "none", countLabel: null });
  assert.deepEqual({ kind: personal.media.kind, coverage: personal.media.coverage, countLabel: personal.media.countLabel, videoAvailable: personal.media.videoAvailable },
    { kind: "audio", coverage: "full", countLabel: "42/42", videoAvailable: true });
});

test("unmaterialized group familiarity is actionable and never claims a derived value", async () => {
  const { pathToFileURL } = require("node:url");
  const presenter = await import(pathToFileURL(path.join(__dirname, "../public/js/corpus-item-presenter.js")).href);
  const item = presenter.adaptGroupCorpusItem({
    work_id: "g-cold", text_key: "g-cold", title: "שיר", rows_count: 4, audio_count: 0,
  }, {
    corpusId: "c1",
    compass: {
      status: "NOT_PREPARED", reason_code: "INGREDIENTS_MISSING", counts: null,
      recorded_familiar_pct_lower_bound: null, unresolved_uncertainty_pp: null,
      rank_eligible: false, resolver_version: compass.RESOLVER_VERSION,
    },
    copy: {
      groupNotPreparedAction: "Откройте текст для анализа",
      groupNotPreparedDetail: "Анализ выполнится локально после первого открытия текста.",
    },
  });
  const familiarity = item.signals.find((signal) => signal.kind === "familiarity");
  assert.equal(familiarity.provenance.type, "unknown");
  assert.equal(familiarity.provenance.source, null);
  assert.equal(familiarity.value.action_label, "Откройте текст для анализа");
  assert.deepEqual(familiarity.caveats, ["prepare-on-open"]);
  assert.deepEqual(familiarity.detail_labels, ["Анализ выполнится локально после первого открытия текста."]);
});

test("limited familiarity exposes a localized no-ranking caveat while retaining derived provenance", async () => {
  const { pathToFileURL } = require("node:url");
  const presenter = await import(pathToFileURL(path.join(__dirname, "../public/js/corpus-item-presenter.js")).href);
  const item = presenter.adaptMyTextItem({ id: "m1", text_key: "m1", title: "טקסט" }, {
    compass: {
      status: "AVAILABLE_LIMITED", reason_code: "UNRESOLVED_ABOVE_RANK_LIMIT",
      counts: { familiar: 4, eligible_denominator: 10, explicit_new: 1, untracked: 3, unresolved: 2 },
      recorded_familiar_pct_lower_bound: 40, unresolved_uncertainty_pp: 20,
      rank_eligible: false, learner_projection_version: "profile-v2", resolver_version: compass.RESOLVER_VERSION,
    },
    copy: { limitedFamiliarityDetail: "Неоднозначность слишком велика для сортировки; показана только нижняя граница." },
  });
  const familiarity = item.signals.find((signal) => signal.kind === "familiarity");
  assert.equal(familiarity.provenance.type, "derived");
  assert.equal(familiarity.provenance.source, "recorded-familiarity-v2");
  assert.deepEqual(familiarity.caveats, ["unresolved-above-rank-limit"]);
  assert.deepEqual(familiarity.detail_labels, ["Неоднозначность слишком велика для сортировки; показана только нижняя граница."]);
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
  assert.match(localDb, /_COMPASS_INGREDIENTS_SCHEMA = 'room\.learning_ingredients\.2\.0\.1'/);
  assert.match(localDb, /return \[key, count\]/);
  assert.match(localDb, /_COMPASS_CACHE_MAX_ITEMS = 6000/);
  assert.match(localDb, /_COMPASS_CACHE_MAX_BYTES = 64 \* 1024 \* 1024/);
});

test("all three readable corpora fully prepare and expose the same familiarity sort", () => {
  const ui = fs.readFileSync(path.join(__dirname, "../public/js/library-ui.js"), "utf8");
  const shell = fs.readFileSync(path.join(__dirname, "../public/library.html"), "utf8");
  assert.match(ui, /COMPASS_FULL_CATALOG_MAX = 5000/);
  assert.doesNotMatch(ui, /COMPASS_IDLE_SESSION_MAX/);
  assert.match(ui, /startPersonalCompassSweep\(\)/);
  assert.match(ui, /loadPersonalFamiliarityRanking\(/);
  assert.match(ui, /ensureGroupLearningIndex\(/);
  assert.match(ui, /ensureBenFamiliarityScores\(/);
  assert.match(ui, /reliableFamiliarityCount/);
  assert.match(ui, /sortNoReliable/);
  assert.match(ui, /\['familiar_desc',\s*'room\.compass\.sortFamiliar'/);
  assert.match(ui, /roomGroupSort[\s\S]*?familiar_desc/);
  assert.match(ui, /roomCorpusSort[\s\S]*?familiar_desc/);
  assert.doesNotMatch(ui, /function groupCompassDescriptor\([^)]*\) \{\s*if \(!work \|\| !localRow/);
  assert.doesNotMatch(ui, /filter\(\(item\) => item && item\.local_id\)\.slice\(0, 8\)/);
  assert.doesNotMatch(ui, /familiar_desc[\s\S]{0,240}(?:70|90|95|98)/);
  assert.match(ui, /paintLearningCompass\(learnRow, view, \{ showMedia: true, showDetails: true \}\)/);
  assert.doesNotMatch(shell, /\.work-card \.learning-compass-details \{ display: none; \}/);
  assert.match(ui, /learning-compass-details\[open\]/);
  assert.match(ui, /event\.key !== 'Escape'/);
});

test("B7 finishing keeps cards locale-aligned and disclosures single-open and dismissible", () => {
  const ui = fs.readFileSync(path.join(__dirname, "../public/js/library-ui.js"), "utf8");
  const shell = fs.readFileSync(path.join(__dirname, "../public/library.html"), "utf8");
  assert.match(ui, /DISMISSIBLE_DETAILS_SELECTOR/);
  assert.match(ui, /document\.addEventListener\('pointerdown'/);
  assert.match(ui, /\.closest\(DISMISSIBLE_DETAILS_SELECTOR/);
  assert.match(ui, /room-study-total-help/);
  assert.match(ui, /room\.morph\.study\.countHelp/);
  assert.match(shell, /html\[dir="ltr"\][^{]*\.corpus-next-title\[dir="rtl"\][\s\S]*?text-align:\s*left/);
  assert.match(shell, /\.room-preview-list \.work-card-difficulty[\s\S]*?justify-content:\s*flex-start/);
  assert.match(shell, /\.learning-media\.media-none/);
});

test("cloud sync never advances past rejected rows and refreshes every local projection", () => {
  const sync = fs.readFileSync(path.join(__dirname, "../public/js/cloud-sync.js"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "../public/js/library-ui.js"), "utf8");
  assert.match(sync, /INGEST_REJECTED/);
  assert.match(sync, /rejectedRows/);
  assert.match(sync, /setSyncState\(UP_CURSOR, ""\)/);
  assert.match(ui, /morphHost\.invalidateWordStates\(\)/);
  assert.match(ui, /ensureLearningCompassProjection\(true\)/);
  assert.match(ui, /window\.addEventListener\('pageshow',[\s\S]*?roomCloudMaybeResync/);
  assert.match(ui, /window\.addEventListener\('online',[\s\S]*?roomCloudMaybeResync/);
});

test("syncUp returns an explicit failure and preserves its cursor on a row reject", async () => {
  const cloud = require("../public/js/cloud-sync.js");
  const originalFetch = global.fetch;
  const writes = [];
  global.fetch = async () => new Response(JSON.stringify({
    ok: true,
    review_log: { total: 1, new: 0, dup: 0, rejected: 1 },
    rejected: [{ id: "bad-row", reason: "fixture_reject" }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const ldb = {
    getSyncState: async (key) => key === cloud.KEYS.CUTOVER_OK ? "1" : "0",
    setSyncState: async (key, value) => { writes.push([key, value]); },
    listReviewLogAfterRowid: async (cursor) => Number(cursor) === 0 ? [{
      rid: 7, id: "bad-row", item_key: "pid:1", kind: "mark",
      reviewed_at: "2026-08-13T00:00:00.000Z", grade: null, source: "word-mark", meta_json: "{}",
    }] : [],
  };
  try {
    const result = await cloud.syncUp(ldb);
    assert.equal(result.ok, false);
    assert.equal(result.error, "INGEST_REJECTED");
    assert.equal(result.rejectedRows, 1);
    assert.equal(writes.some(([key]) => key === cloud.KEYS.UP_CURSOR), false);
  } finally { global.fetch = originalFetch; }
});

test("dedicated worker enforces local limits and emits aggregates rather than content", () => {
  const worker = fs.readFileSync(path.join(__dirname, "../public/js/learning-compass-worker.js"), "utf8");
  const ingredientCore = fs.readFileSync(path.join(__dirname, "../public/js/learning-compass-ingredients.js"), "utf8");
  assert.match(worker, /importScripts\("\/js\/learning-compass-ingredients\.js"\)/);
  assert.match(worker, /DecompressionStream/);
  assert.match(ingredientCore, /MAX_TOKENS = 250000/);
  assert.match(ingredientCore, /MAX_TYPES = 50000/);
  assert.match(ingredientCore, /key_frequencies/);
  assert.match(ingredientCore, /unresolved_token_count/);
  assert.match(worker, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(ingredientCore, /PACKET_LIMIT_EXCEEDED/);
  const returned = ingredientCore.match(/var result = \{\n\s+schema_version: "room\.learning_ingredients\.2\.0\.1"[\s\S]*?\n\s+\};/)[0];
  assert.doesNotMatch(returned, /\brows\b|\btitle\b|\bbody\b|hebrew/);
});

test("protected group familiarity index is membership-gated and content-free", () => {
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const repo = fs.readFileSync(path.join(__dirname, "../db/groupCorpusRepo.js"), "utf8");
  assert.match(server, /\/api\/group-corpora\/:corpusId\/learning-index/);
  assert.match(server, /private, no-store/);
  assert.match(server, /prewarmLearningIndexes\(\)/);
  assert.match(repo, /getLearningIndex/);
  assert.match(repo, /async function prewarmLearningIndexes/);
  assert.match(repo, /group_learning_index\.1\.0\.0/);
  assert.doesNotMatch(repo.match(/async function getLearningIndex[\s\S]*?\n\}/)[0], /learner|review_log|word_status/);
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
