"use strict";

// Thin client for the ai-local FastAPI sidecar. Uses global fetch (Node 18+).
// Every call returns { ok, status, body, error } — callers decide how to react
// to non-2xx; this module never throws for upstream errors, only for network
// failures (which are reflected as ok=false with error set).

const HOST = process.env.AI_LOCAL_HOST || "127.0.0.1";
// Default 8799 (NOT 8765 — that's AnkiConnect's well-known port, which this project
// uses; a sidecar on 8765 collides and AnkiConnect's 200 reply could be mistaken for
// niqqud, see niqqudGateway foreign-responder guard). Override with AI_LOCAL_PORT.
const PORT = process.env.AI_LOCAL_PORT || "8799";
const BASE = `http://${HOST}:${PORT}`;

// Conservative default; /translate on MADLAD can take ~1-3s per batch,
// /nakdan up to ~500ms per batch of 32 on CPU.
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_LOCAL_TIMEOUT_MS || 60000);

async function call(path, { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await r.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { ok: r.ok, status: r.status, body: parsed, error: r.ok ? null : (parsed && parsed.error) || r.statusText };
  } catch (e) {
    const isAbort = e && (e.name === "AbortError" || e.code === "ABORT_ERR");
    return { ok: false, status: 0, body: null, error: isAbort ? "timeout" : (e.message || String(e)) };
  } finally {
    clearTimeout(timer);
  }
}

async function healthz() {
  return call("/healthz", { timeoutMs: 3000 });
}

async function warmup(name) {
  return call("/models/warmup", { method: "POST", body: { name }, timeoutMs: 120000 });
}

async function nakdan(texts, markMatresLectionis) {
  const body = { texts };
  if (markMatresLectionis) body.mark_matres_lectionis = markMatresLectionis;
  return call("/nakdan", { method: "POST", body });
}

async function translate(segments, target = "ru") {
  return call("/translate", {
    method: "POST",
    body: { segments, target },
    timeoutMs: Number(process.env.AI_LOCAL_TRANSLATE_TIMEOUT_MS || 180000),
  });
}

async function modelsStatus() {
  return call("/models/status", { timeoutMs: 3000 });
}

module.exports = {
  BASE,
  healthz,
  warmup,
  nakdan,
  translate,
  modelsStatus,
};
