"use strict";

const { RATE_LIMITS } = require("./oauthDeploymentContracts");

function createOAuthRateLimiter({ now = () => Date.now(), maxBuckets = 5000 } = {}) {
  const buckets = new Map();
  function prune(at = now()) {
    for (const [key, bucket] of buckets) if (bucket.reset_at <= at) buckets.delete(key);
  }
  function take(routeClass, dimensions) {
    const policy = RATE_LIMITS[routeClass];
    if (!policy) return Object.freeze({ ok: false, error: "AA_OAUTH_RATE_BAD_ROUTE" });
    prune();
    const checks = [];
    for (const [dimension, value] of Object.entries(dimensions || {})) {
      const limit = policy[dimension];
      if (!limit || typeof value !== "string" || !value || value.length > 128) continue;
      const key = `${routeClass}:${dimension}:${value}`;
      const bucket = buckets.get(key) || { count: 0, reset_at: now() + policy.window_ms };
      checks.push({ key, dimension, limit, bucket });
    }
    if (!checks.length) return Object.freeze({ ok: false, error: "AA_OAUTH_RATE_DIMENSION_REQUIRED" });
    const denied = checks.find((x) => x.bucket.count >= x.limit);
    if (denied) return Object.freeze({ ok: false, error: "AA_OAUTH_RATE_LIMITED", dimension: denied.dimension, retry_after_ms: Math.max(0, denied.bucket.reset_at - now()) });
    if (buckets.size + checks.filter((x) => !buckets.has(x.key)).length > maxBuckets) return Object.freeze({ ok: false, error: "AA_OAUTH_RATE_CAPACITY" });
    for (const check of checks) { check.bucket.count += 1; buckets.set(check.key, check.bucket); }
    return Object.freeze({ ok: true });
  }
  return Object.freeze({ take, prune, size: () => buckets.size });
}

module.exports = { createOAuthRateLimiter };
