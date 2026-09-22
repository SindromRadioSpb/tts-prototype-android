"use strict";

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

  async function authToken(config) {
    if (config.token) return config.token;
    if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
    if (!config.username || !config.password) throw new Error("UMAMI_READ_AUTH_NOT_CONFIGURED");
    const body = await fetchJson(`${config.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "LinguistPro-Product-Pulse/1" },
      body: JSON.stringify({ username: config.username, password: config.password }),
    });
    if (!body || !body.token) throw new Error("UMAMI_AUTH_INVALID_RESPONSE");
    cachedToken = String(body.token);
    tokenExpiresAt = Date.now() + 10 * 60 * 1000;
    return cachedToken;
  }

  async function send(event) {
    const config = getConfig();
    config.baseUrl = safeBaseUrl(config.baseUrl);
    if (!config.enabled || !config.baseUrl) return { accepted: false, reason: "not_configured" };
    await fetchJson(`${config.baseUrl}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "LinguistPro-Product-Pulse/1" },
      body: JSON.stringify({
        type: "event",
        payload: {
          website: config.websiteId,
          hostname: config.hostname,
          url: `/${event.properties.surface}`,
          title: "LinguistPro",
          id: event.session_id,
          name: event.event_name,
          data: {
            schema_version: event.schema_version,
            app_version: event.app_version,
            ...event.properties,
          },
        },
      }),
    });
    return { accepted: true };
  }

  async function stats(startAt, endAt = Date.now()) {
    const config = getConfig();
    config.baseUrl = safeBaseUrl(config.baseUrl);
    if (!config.enabled || !config.baseUrl) throw new Error("UMAMI_NOT_CONFIGURED");
    const token = await authToken(config);
    const query = new URLSearchParams({ startAt: String(startAt), endAt: String(endAt) });
    return fetchJson(`${config.baseUrl}/api/websites/${encodeURIComponent(config.websiteId)}/stats?${query}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "User-Agent": "LinguistPro-Product-Pulse/1" },
    }, 5000);
  }

  return { send, stats, configured: () => configFromEnv().enabled };
}

module.exports = { configFromEnv, safeBaseUrl, createUmamiClient };
