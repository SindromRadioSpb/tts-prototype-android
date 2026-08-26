"use strict";

const TOOL_LIMITS = Object.freeze({
  get_learning_brief: Object.freeze({ minute: 12, day: 240 }),
  get_review_summary: Object.freeze({ minute: 12, day: 240 }),
  search_public_reading_catalog: Object.freeze({ minute: 30, day: 1000 }),
  get_recent_explanation_metadata: Object.freeze({ minute: 12, day: 240 }),
  get_agent_connection: Object.freeze({ minute: 30, day: 500 }),
  get_access_window: Object.freeze({ minute: 30, day: 500 }),
  // AA3: get_due_review_items triggers the heavy keyingService lexicon (lazy 306MB);
  // keep it deliberately tight so an external caller cannot force repeated cold loads.
  get_due_review_items: Object.freeze({ minute: 6, day: 120 }),
  get_learner_profile: Object.freeze({ minute: 12, day: 240 }),
  get_explanation_body: Object.freeze({ minute: 20, day: 400 }),
  get_reading_content: Object.freeze({ minute: 20, day: 400 }),
  // Handoff mints a DB token — keep it tight to bound table churn.
  create_reading_handoff: Object.freeze({ minute: 6, day: 60 }),
  // Propose writes a PENDING row (idempotent by dedupe); tight to bound owner-panel churn.
  propose_action: Object.freeze({ minute: 6, day: 120 }),
  // Delta walks the user's review_log window + keyingService enrichment (lazy heavy).
  get_progress_delta: Object.freeze({ minute: 6, day: 120 }),
  // Review handoff mints a DB token — same tight budget as the corpus handoff.
  create_review_handoff: Object.freeze({ minute: 6, day: 60 }),
  // S1: каталог из sidecar-меты (дёшев; числа канона BRIDGE_RECON §6).
  list_personal_texts: Object.freeze({ minute: 6, day: 120 }),
  // S2: окна тел (канон §6: дневной паритет с get_reading_content — текст в 500 строк
  // прочитываем за день; per-min асимметрия = data-minimization).
  get_personal_text_content: Object.freeze({ minute: 6, day: 200 }),
  // H2.1 canonical read budget.
  get_word_morphology: Object.freeze({ minute: 6, day: 200 }),
  // H2.2 scans one full text against a derived learner projection.
  get_text_coverage: Object.freeze({ minute: 6, day: 200 }),
  // Restricted group-corpus reads use the canonical H2 read budget.
  search_group_reading_catalog: Object.freeze({ minute: 6, day: 200 }),
  get_group_reading_content: Object.freeze({ minute: 6, day: 200 }),
  get_group_text_coverage: Object.freeze({ minute: 6, day: 200 }),
  propose_import_text: Object.freeze({ minute: 6, day: 60 }),
  propose_track_word: Object.freeze({ minute: 6, day: 60 }),
  propose_goal: Object.freeze({ minute: 6, day: 60 }),
  get_current_goal: Object.freeze({ minute: 6, day: 200 }),
  // Public-publication namespace: metadata discovery is cheap; item windows
  // and descriptors remain bounded and use the canonical H2 read budget.
  list_published_public_corpora: Object.freeze({ minute: 30, day: 1000 }),
  search_published_public_items: Object.freeze({ minute: 20, day: 600 }),
  get_published_public_item: Object.freeze({ minute: 20, day: 600 }),
  list_published_item_resources: Object.freeze({ minute: 20, day: 600 }),
  read_published_text_window: Object.freeze({ minute: 20, day: 400 }),
});
const MINUTE = 60_000;
const DAY = 86_400_000;

function createMcpRateLimiter({ now = () => Date.now(), maxBuckets = 20000 } = {}) {
  const buckets = new Map();
  function prune(at = now()) { for (const [key, value] of buckets) if (value.reset_at <= at) buckets.delete(key); }
  function consume(checks) {
    const at = now(); prune(at);
    const prepared = checks.map(({ key, limit, window, dimension }) => ({
      key, limit, dimension, bucket: buckets.get(key) || { count: 0, reset_at: at + window },
    }));
    const denied = prepared.find((entry) => entry.bucket.count >= entry.limit);
    if (denied) return Object.freeze({ ok: false, error: "AA_MCP_RATE_LIMITED", dimension: denied.dimension, retry_after_ms: Math.max(1, denied.bucket.reset_at - at) });
    if (buckets.size + prepared.filter((entry) => !buckets.has(entry.key)).length > maxBuckets) return Object.freeze({ ok: false, error: "AA_MCP_RATE_CAPACITY", dimension: "global", retry_after_ms: MINUTE });
    for (const entry of prepared) { entry.bucket.count += 1; buckets.set(entry.key, entry.bucket); }
    return Object.freeze({ ok: true });
  }
  function takeAuthFailure(ip) {
    return consume([{ key: `auth-failure:${String(ip)}`, limit: 10, window: 10 * MINUTE, dimension: "ip" }]);
  }
  function takeRequest(principal, ip, toolName = null) {
    const tool = toolName == null ? null : TOOL_LIMITS[toolName];
    if (toolName != null && !tool) return Object.freeze({ ok: false, error: "AA_MCP_UNKNOWN_TOOL", dimension: "tool", retry_after_ms: MINUTE });
    const p = principal || {};
    const dimensions = [
      { name: "ip", value: ip, minute: 300 },
      { name: "client", value: p.oauth_client_id, minute: 600, day: 10000 },
      { name: "connection", value: p.connection_id, minute: 60, day: 2000 },
      { name: "user", value: p.user_id, minute: 120, day: 3000 },
    ];
    if (tool) dimensions.push({ name: "tool", value: `${p.connection_id}:${toolName}`, minute: tool.minute, day: tool.day });
    if (dimensions.some((entry) => typeof entry.value !== "string" || !entry.value || entry.value.length > 256)) return Object.freeze({ ok: false, error: "AA_MCP_RATE_DIMENSION_INVALID", dimension: "global", retry_after_ms: MINUTE });
    const checks = [];
    for (const entry of dimensions) {
      checks.push({ key: `${entry.name}:minute:${entry.value}`, limit: entry.minute, window: MINUTE, dimension: entry.name });
      if (entry.day) checks.push({ key: `${entry.name}:day:${entry.value}`, limit: entry.day, window: DAY, dimension: entry.name });
    }
    return consume(checks);
  }
  return Object.freeze({ takeAuthFailure, takeRequest, prune, size: () => buckets.size });
}

module.exports = { TOOL_LIMITS, createMcpRateLimiter };
