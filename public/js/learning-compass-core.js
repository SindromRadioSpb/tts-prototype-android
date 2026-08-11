// Learning Compass 2.0 — shared, content-free learner-fit and calibration contracts.
// UMD on purpose: the browser Room and Agent Access must execute the same rules.
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.LearningCompassCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var RESOLVER_VERSION = "recorded-familiarity-v2";
  var INGREDIENTS_SCHEMA = "room.learning_ingredients.2.0.0";
  var PROJECTION_SCHEMA = "room.learner_projection.2.0.0";
  var COVERAGE_SCHEMA = "room.recorded_familiarity.2.0.0";
  var CALIBRATION_SCHEMA = "room.reading_calibration.2.0.0";
  var CALIBRATION_MAX_BYTES = 8 * 1024;
  var CALIBRATION_MAX_SAMPLES = 12;
  var CALIBRATION_STALE_DAYS = 180;
  var MAX_TOKENS = 250000;
  var MAX_TYPES = 50000;
  var RANK_UNRESOLVED_LIMIT_PP = 5;

  var FAMILIAR = Object.freeze({
    known: true, learning: true, weak: true, stale: true,
    l1: true, l2: true, l3: true, l4: true,
  });
  var PROVENANCE = Object.freeze({ curated: true, asserted: true, derived: true, unknown: true });

  function finite(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function nonNegativeInt(value) {
    var n = finite(value);
    return n != null && n >= 0 ? Math.floor(n) : 0;
  }
  function iso(value) {
    var d = new Date(value || 0);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  function round2(value) { return Math.round(value * 100) / 100; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function opaqueId() {
    try { if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID(); } catch (_) {}
    return "lc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 14);
  }

  function unavailable(status, reason, extra) {
    return Object.assign({
      schema_version: COVERAGE_SCHEMA,
      status: status,
      reason_code: reason,
      counts: null,
      recorded_familiar_pct_lower_bound: null,
      unresolved_uncertainty_pp: null,
      rank_eligible: false,
      learner_projection_version: null,
      resolver_version: RESOLVER_VERSION,
      generated_at: new Date().toISOString(),
    }, extra || {});
  }

  function normalizedFrequencies(raw) {
    var rows = Array.isArray(raw) ? raw : [];
    var merged = Object.create(null);
    for (var i = 0; i < rows.length; i += 1) {
      var key = rows[i] && String(rows[i].key || "").trim();
      var count = nonNegativeInt(rows[i] && rows[i].token_count);
      if (!key || !count) continue;
      merged[key] = (merged[key] || 0) + count;
    }
    return Object.keys(merged).sort().map(function (key) {
      return { key: key, token_count: merged[key] };
    });
  }

  function evaluateRecordedFamiliarityV2(input) {
    input = input || {};
    var ingredients = input.ingredients;
    var projection = input.learner_projection;
    var now = iso(input.now) || new Date().toISOString();

    if (!ingredients) return unavailable("NOT_PREPARED", "INGREDIENTS_NOT_PREPARED", { generated_at: now });
    if (ingredients.resolver_version !== RESOLVER_VERSION || ingredients.schema_version && ingredients.schema_version !== INGREDIENTS_SCHEMA) {
      return unavailable("STALE", "INGREDIENTS_VERSION_MISMATCH", { generated_at: now });
    }
    if (!projection || typeof projection !== "object") {
      return unavailable("UNAVAILABLE", "LEARNER_PROJECTION_UNAVAILABLE", { generated_at: now });
    }
    var states = projection.state_by_key && typeof projection.state_by_key === "object" ? projection.state_by_key : {};
    var scheduled = Object.create(null);
    (Array.isArray(projection.scheduled_keys) ? projection.scheduled_keys : []).forEach(function (key) {
      if (key != null) scheduled[String(key)] = true;
    });
    var tracked = nonNegativeInt(projection.tracked_lexeme_count);
    if (!tracked) tracked = new Set(Object.keys(states).concat(Object.keys(scheduled))).size;
    if (!tracked) {
      return unavailable("NEEDS_PROFILE", "EMPTY_LEARNER_PROFILE", {
        learner_projection_version: projection.version || null,
        generated_at: now,
      });
    }

    var frequencies = normalizedFrequencies(ingredients.key_frequencies);
    if (frequencies.length > MAX_TYPES) return unavailable("UNSUPPORTED", "TYPE_LIMIT_EXCEEDED", { generated_at: now });
    var familiar = 0, explicitNew = 0, untracked = 0, ignored = 0;
    var frontier = [];
    for (var i = 0; i < frequencies.length; i += 1) {
      var row = frequencies[i], state = states[row.key] == null ? null : String(states[row.key]);
      // Explicit manual states are higher-authority learner truth than a schedule row.
      if (state === "ignore") ignored += row.token_count;
      else if (state === "new") { explicitNew += row.token_count; frontier.push(row); }
      else if (FAMILIAR[state] || scheduled[row.key]) familiar += row.token_count;
      else { untracked += row.token_count; frontier.push(row); }
    }
    var unresolved = nonNegativeInt(ingredients.unresolved_token_count);
    var properNames = nonNegativeInt(ingredients.proper_name_token_count);
    var keyedTotal = frequencies.reduce(function (sum, row) { return sum + row.token_count; }, 0);
    var computedTotal = keyedTotal + unresolved + properNames;
    var assertedTotal = nonNegativeInt(ingredients.total_token_count);
    if (assertedTotal && assertedTotal !== computedTotal) return unavailable("UNSUPPORTED", "INGREDIENT_COUNTS_MISMATCH", { generated_at: now });
    var lexicalTotal = computedTotal;
    if (lexicalTotal > MAX_TOKENS) return unavailable("UNSUPPORTED", "TOKEN_LIMIT_EXCEEDED", { generated_at: now });
    var denominator = familiar + explicitNew + untracked + unresolved;
    if (!denominator) return unavailable("UNSUPPORTED", "NO_ELIGIBLE_LEXICAL_TOKENS", {
      learner_projection_version: projection.version || null,
      generated_at: now,
    });
    var lower = round2((familiar * 100) / denominator);
    var uncertainty = round2((unresolved * 100) / denominator);
    var rankEligible = uncertainty <= RANK_UNRESOLVED_LIMIT_PP;
    frontier.sort(function (a, b) { return b.token_count - a.token_count || a.key.localeCompare(b.key); });
    return {
      schema_version: COVERAGE_SCHEMA,
      status: rankEligible ? "AVAILABLE" : "AVAILABLE_LIMITED",
      reason_code: rankEligible ? "RECORDED_FAMILIARITY_READY" : "UNRESOLVED_ABOVE_RANK_LIMIT",
      counts: {
        lexical_total: lexicalTotal,
        eligible_denominator: denominator,
        familiar: familiar,
        explicit_new: explicitNew,
        untracked: untracked,
        unresolved: unresolved,
        ignored_excluded: ignored,
        proper_names_excluded: properNames,
      },
      recorded_familiar_pct_lower_bound: lower,
      unresolved_uncertainty_pp: uncertainty,
      rank_eligible: rankEligible,
      top_unknown: frontier.slice(0, 20).map(function (row) { return { key: row.key, token_count: row.token_count }; }),
      learner_projection_version: projection.version || null,
      resolver_version: RESOLVER_VERSION,
      generated_at: now,
    };
  }

  function reconstructIds(delta) {
    var out = [], cursor = 0;
    if (!Array.isArray(delta)) return out;
    for (var i = 0; i < delta.length; i += 1) {
      cursor += nonNegativeInt(delta[i]);
      out.push(cursor);
    }
    return out;
  }

  function ingredientsFromBenV7(work, dict, meta) {
    meta = meta || {};
    if (!work || !Array.isArray(work.ids) || !Array.isArray(work.tok) || !Array.isArray(dict)) return null;
    var ids = reconstructIds(work.ids), frequencies = [];
    for (var i = 0; i < ids.length; i += 1) {
      if (ids[i] < 0 || ids[i] >= dict.length) return null;
      var count = nonNegativeInt(work.tok[i]);
      if (count) frequencies.push({ key: "pid:" + String(dict[ids[i]]), token_count: count });
    }
    var matched = nonNegativeInt(work.m) || frequencies.reduce(function (sum, row) { return sum + row.token_count; }, 0);
    var total = nonNegativeInt(work.n) || matched;
    return {
      schema_version: INGREDIENTS_SCHEMA,
      source_class: "benyehuda",
      source_key: meta.source_key || null,
      content_revision: meta.content_revision || null,
      content_sha256: meta.content_sha256 || null,
      entitlement_revision: null,
      resolver_version: RESOLVER_VERSION,
      key_frequencies: frequencies,
      unresolved_token_count: Math.max(0, total - matched),
      proper_name_token_count: 0,
      total_token_count: total,
      built_at: meta.built_at || new Date().toISOString(),
    };
  }

  function makeSignal(input) {
    input = input || {};
    var p = input.provenance || {};
    var type = p.type == null ? "unknown" : String(p.type);
    if (!PROVENANCE[type]) throw new Error("Invalid signal provenance type");
    return {
      kind: String(input.kind || "unknown"),
      value: input.value == null ? null : input.value,
      provenance: {
        type: type,
        source: p.source == null ? null : String(p.source),
        revision: p.revision == null ? null : String(p.revision),
      },
      caveats: Array.isArray(input.caveats) ? input.caveats.filter(Boolean).map(String) : [],
    };
  }

  function choosePrimaryReason(input) {
    input = input || {};
    if (input.continue_reading) return "CONTINUE_READING";
    if (input.group_assignment) return "GROUP_ASSIGNMENT";
    if (input.recorded_familiarity && input.recorded_familiarity.status === "AVAILABLE" && input.recorded_familiarity.rank_eligible) return "RECORDED_FAMILIARITY";
    if (input.curated_start) return "CURATED_START";
    if (input.asserted_level) return "ASSERTED_LEVEL";
    if (input.derived_lexical_load) return "DERIVED_LEXICAL_LOAD";
    if (input.audio_or_length) return "AUDIO_OR_LENGTH";
    return "NEUTRAL";
  }

  function emptyCalibrationLedger() {
    return { schema_version: CALIBRATION_SCHEMA, samples: [] };
  }

  function resetCalibrationLedger() { return emptyCalibrationLedger(); }

  function qualifyReadingSample(input) {
    input = input || {};
    var tokens = nonNegativeInt(input.token_count);
    var elapsed = nonNegativeInt(input.elapsed_foreground_ms);
    if (!input.completed_explicitly) return { accepted: false, reason_code: "EXPLICIT_COMPLETION_REQUIRED" };
    if (elapsed < 30000) return { accepted: false, reason_code: "FOREGROUND_TOO_SHORT" };
    if (elapsed > 90 * 60 * 1000) return { accepted: false, reason_code: "FOREGROUND_TOO_LONG" };
    if (tokens < 100) return { accepted: false, reason_code: "TOO_FEW_TOKENS" };
    if (!input.content_revision || !input.resolver_version) return { accepted: false, reason_code: "REVISION_REQUIRED" };
    var revisionHash = String(input.content_sha256 || "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(revisionHash)) return { accepted: false, reason_code: "REVISION_HASH_REQUIRED" };
    var completedAt = iso(input.completed_at) || new Date().toISOString();
    return {
      accepted: true,
      reason_code: "QUALIFYING_SAMPLE",
      sample: {
        sample_id: input.sample_id ? String(input.sample_id).slice(0, 80) : opaqueId(),
        revision_hash: revisionHash,
        resolver_version: String(input.resolver_version),
        token_count: tokens,
        elapsed_foreground_ms: elapsed,
        modality: "FOREGROUND_READING",
        completed_at: completedAt,
      },
    };
  }

  function sanitizeSample(sample) {
    if (sample && /^[a-f0-9]{64}$/.test(String(sample.revision_hash || "").toLowerCase())
        && sample.modality === "FOREGROUND_READING") {
      var tokens = nonNegativeInt(sample.token_count), elapsed = nonNegativeInt(sample.elapsed_foreground_ms);
      var completedAt = iso(sample.completed_at);
      if (tokens >= 100 && elapsed >= 30000 && elapsed <= 90 * 60 * 1000 && completedAt && sample.resolver_version) {
        return {
          sample_id: String(sample.sample_id || opaqueId()).slice(0, 80),
          revision_hash: String(sample.revision_hash).toLowerCase(),
          resolver_version: String(sample.resolver_version), token_count: tokens,
          elapsed_foreground_ms: elapsed, modality: "FOREGROUND_READING", completed_at: completedAt,
        };
      }
    }
    var q = qualifyReadingSample(Object.assign({}, sample, { completed_explicitly: true }));
    return q.accepted ? q.sample : null;
  }

  function appendCalibrationSample(ledger, sample) {
    var clean = sanitizeSample(sample);
    var current = ledger && ledger.schema_version === CALIBRATION_SCHEMA && Array.isArray(ledger.samples)
      ? ledger.samples.map(sanitizeSample).filter(Boolean) : [];
    if (clean) current.push(clean);
    current = current.slice(-CALIBRATION_MAX_SAMPLES);
    var next = { schema_version: CALIBRATION_SCHEMA, samples: current };
    while (current.length && JSON.stringify(next).length > CALIBRATION_MAX_BYTES) {
      current.shift();
      next = { schema_version: CALIBRATION_SCHEMA, samples: current };
    }
    return clone(next);
  }

  function median(values) {
    if (!values.length) return null;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function quantile(values, q) {
    if (!values.length) return null;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var position = (sorted.length - 1) * q;
    var base = Math.floor(position), rest = position - base;
    return sorted[base + 1] == null ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }

  function calibrationState(ledger, options) {
    options = options || {};
    var now = new Date(options.now || Date.now()).getTime();
    var samples = ledger && ledger.schema_version === CALIBRATION_SCHEMA && Array.isArray(ledger.samples)
      ? ledger.samples.map(sanitizeSample).filter(Boolean).slice(-CALIBRATION_MAX_SAMPLES) : [];
    var tokenCount = samples.reduce(function (sum, s) { return sum + s.token_count; }, 0);
    var revisions = new Set(samples.map(function (s) { return s.revision_hash; })).size;
    var base = { observation_count: samples.length, revision_count: revisions, token_count: tokenCount };
    if (samples.length < 5 || revisions < 3 || tokenCount < 2500) {
      return Object.assign({ status: "NEEDS_CALIBRATION", remaining_observations: Math.max(0, 5 - samples.length), remaining_revisions: Math.max(0, 3 - revisions), remaining_tokens: Math.max(0, 2500 - tokenCount) }, base);
    }
    var latest = Math.max.apply(null, samples.map(function (s) { return new Date(s.completed_at).getTime(); }));
    if (Number.isFinite(now) && Number.isFinite(latest) && now - latest > CALIBRATION_STALE_DAYS * 86400000) {
      return Object.assign({ status: "STALE" }, base);
    }
    var pace = samples.map(function (s) { return s.elapsed_foreground_ms / s.token_count; }).filter(function (n) { return Number.isFinite(n) && n > 0; });
    var q1 = quantile(pace, 0.25), q3 = quantile(pace, 0.75);
    if (!pace.length || !q1 || q3 / q1 > 3) return Object.assign({ status: "UNSTABLE" }, base);
    return Object.assign({ status: "READY", median_ms_per_token: median(pace), q1_ms_per_token: q1, q3_ms_per_token: q3 }, base);
  }

  function estimateReadingRange(tokenCount, ledger, options) {
    var state = calibrationState(ledger, options);
    if (state.status !== "READY") return { status: state.status, min_minutes: null, max_minutes: null };
    var tokens = nonNegativeInt(tokenCount);
    if (!tokens) return { status: "UNAVAILABLE", min_minutes: null, max_minutes: null };
    var samples = ledger.samples.slice(-CALIBRATION_MAX_SAMPLES).map(sanitizeSample).filter(Boolean);
    var pace = samples.map(function (s) { return s.elapsed_foreground_ms / s.token_count; });
    var med = median(pace);
    var factor = samples.length < 8 ? 0.25 : 0.20;
    var lowPace = Math.min(med * (1 - factor), quantile(pace, 0.25));
    var highPace = Math.max(med * (1 + factor), quantile(pace, 0.75));
    return {
      status: "AVAILABLE",
      min_minutes: Math.max(1, Math.floor((tokens * lowPace) / 60000)),
      max_minutes: Math.max(1, Math.ceil((tokens * highPace) / 60000)),
      observation_count: samples.length,
      range_factor: factor,
      observed_iqr_ms_per_token: [round2(quantile(pace, 0.25)), round2(quantile(pace, 0.75))],
    };
  }

  function pickByRecordedFamiliarity(items, limit) {
    return (Array.isArray(items) ? items : []).filter(function (item) {
      var c = item && item.recorded_familiarity;
      return c && c.status === "AVAILABLE" && c.rank_eligible;
    }).sort(function (a, b) {
      return b.recorded_familiarity.recorded_familiar_pct_lower_bound - a.recorded_familiarity.recorded_familiar_pct_lower_bound
        || String(a.id).localeCompare(String(b.id));
    }).slice(0, Math.max(0, nonNegativeInt(limit) || 12));
  }

  return Object.freeze({
    RESOLVER_VERSION: RESOLVER_VERSION,
    INGREDIENTS_SCHEMA: INGREDIENTS_SCHEMA,
    PROJECTION_SCHEMA: PROJECTION_SCHEMA,
    COVERAGE_SCHEMA: COVERAGE_SCHEMA,
    CALIBRATION_SCHEMA: CALIBRATION_SCHEMA,
    CALIBRATION_MAX_BYTES: CALIBRATION_MAX_BYTES,
    CALIBRATION_MAX_SAMPLES: CALIBRATION_MAX_SAMPLES,
    MAX_TOKENS: MAX_TOKENS,
    MAX_TYPES: MAX_TYPES,
    evaluateRecordedFamiliarityV2: evaluateRecordedFamiliarityV2,
    ingredientsFromBenV7: ingredientsFromBenV7,
    makeSignal: makeSignal,
    choosePrimaryReason: choosePrimaryReason,
    emptyCalibrationLedger: emptyCalibrationLedger,
    resetCalibrationLedger: resetCalibrationLedger,
    qualifyReadingSample: qualifyReadingSample,
    appendCalibrationSample: appendCalibrationSample,
    calibrationState: calibrationState,
    estimateReadingRange: estimateReadingRange,
    pickByRecordedFamiliarity: pickByRecordedFamiliarity,
  });
});
