"use strict";

// Fixed transport identity, never the user's UA. Umami 3.0.3's isbot rejects
// bare Product/1 agents with HTTP 200 {beep:"boop"} and stores nothing.
const SEND_USER_AGENT = "Mozilla/5.0 (LinguistPro Product Pulse)";

function boolEnv(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function configFromEnv(env = process.env) {
  const baseUrl = String(env.UMAMI_BASE_URL || "").trim().replace(/\/$/, "");
  const websiteId = String(env.UMAMI_WEBSITE_ID || "").trim();
  return {
    enabled: boolEnv(env.PRODUCT_PULSE_ENABLED) && !!baseUrl && !!websiteId,
    baseUrl,
    websiteId,
    username: String(env.UMAMI_USERNAME || "").trim(),
    password: String(env.UMAMI_PASSWORD || ""),
    token: String(env.UMAMI_API_TOKEN || "").trim(),
    hostname: String(env.PRODUCT_PULSE_HOSTNAME || "linguistpro.kolosei.com").trim(),
  };
}

function safeBaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.toString().replace(/\/$/, "");
    if (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      return url.toString().replace(/\/$/, "");
    }
  } catch (_) {}
  return "";
}

async function fetchJson(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`UMAMI_HTTP_${response.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function createUmamiClient(getConfig = () => configFromEnv()) {
  let cachedToken = "";
  let tokenExpiresAt = 0;
  let tokenPending;

  async function authToken(config) {
    if (config.token) return config.token;
    if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
    if (!config.username || !config.password) throw new Error("UMAMI_READ_AUTH_NOT_CONFIGURED");
    if (tokenPending) return tokenPending;
    tokenPending = (async () => { const body = await fetchJson(`${config.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "LinguistPro-Product-Pulse/1" },
      body: JSON.stringify({ username: config.username, password: config.password }),
    });
    if (!body || !body.token) throw new Error("UMAMI_AUTH_INVALID_RESPONSE");
    cachedToken = String(body.token);
    tokenExpiresAt = Date.now() + 10 * 60 * 1000;
    return cachedToken; })().finally(() => { tokenPending = null; });
    return tokenPending;
  }

  async function send(event) {
    const config = getConfig();
    config.baseUrl = safeBaseUrl(config.baseUrl);
    if (!config.enabled || !config.baseUrl) return { accepted: false, reason: "not_configured" };
    for (const body of buildSendPayloads(config, event)) {
      const receipt = await fetchJson(`${config.baseUrl}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": SEND_USER_AGENT },
        body: JSON.stringify(body),
      });
      // HTTP success alone does not prove storage. Do not log the cache token.
      if (!receipt || typeof receipt.sessionId !== "string" || !receipt.sessionId ||
          typeof receipt.visitId !== "string" || !receipt.visitId || receipt.beep) {
        throw new Error("UMAMI_SEND_NOT_CONFIRMED");
      }
    }
    return { accepted: true };
  }

  async function stats(startAt, endAt = Date.now()) {
    return read("stats", startAt, endAt);
  }
  async function read(path, startAt, endAt = Date.now(), filters = {}) {
    const config = getConfig();
    config.baseUrl = safeBaseUrl(config.baseUrl);
    if (!config.enabled || !config.baseUrl) throw new Error("UMAMI_NOT_CONFIGURED");
    const token = await authToken(config);
    const query = new URLSearchParams({ startAt: String(startAt), endAt: String(endAt), tag: "eq.pulse-v2", ...filters });
    return fetchJson(`${config.baseUrl}/api/websites/${encodeURIComponent(config.websiteId)}/${path}?${query}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "User-Agent": "LinguistPro-Product-Pulse/1" },
    }, 3500);
  }

  return { send, stats, read, configured: () => { const c = getConfig(); return c.enabled && !!safeBaseUrl(c.baseUrl); } };
}

function buildSendPayloads(config, event) {
  const common = {
    website: config.websiteId,
    hostname: config.hostname,
    url: event.event_name === "operation_result" ? `/pulse-v2/operations/${event.properties.operation}/${event.properties.result}` : `/${event.properties.surface}`,
    title: "LinguistPro",
    id: event.session_id,
    tag: "pulse-v2",
    timestamp: Math.floor(Date.parse(event.occurred_at) / 1000),
  };
  const eventPayload = {
    type: "event",
    payload: {
      ...common,
      name: event.event_name,
      data: {
        schema_version: event.schema_version,
        app_version: event.app_version,
        ...event.properties,
      },
    },
  };
  return event.event_name === "app_open"
    ? [{ type: "event", payload: common }, eventPayload]
    : [eventPayload];
}

module.exports = { configFromEnv, safeBaseUrl, createUmamiClient, buildSendPayloads };
