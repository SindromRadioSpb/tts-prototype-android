"use strict";

const HOST = process.env.TTS_HEBREW_LOCAL_HOST || "127.0.0.1";
const PORT = process.env.TTS_HEBREW_LOCAL_PORT || "8766";
const BASE = `http://${HOST}:${PORT}`;
const DEFAULT_TIMEOUT_MS = Number(process.env.TTS_HEBREW_LOCAL_TIMEOUT_MS || 30000);

async function call(path, { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const diagnosticsHeader = response.headers.get("x-tts-diagnostics");
    let diagnostics = null;
    if (diagnosticsHeader) {
      try { diagnostics = JSON.parse(diagnosticsHeader); } catch (_) { diagnostics = null; }
    }

    let bodyPayload = null;
    let rawText = null;
    let rawBuffer = null;

    if (contentType.indexOf("application/json") >= 0) {
      rawText = await response.text();
      try { bodyPayload = rawText ? JSON.parse(rawText) : null; } catch { bodyPayload = rawText; }
    } else if (contentType.indexOf("audio/") >= 0) {
      rawBuffer = Buffer.from(await response.arrayBuffer());
      bodyPayload = null;
    } else {
      rawText = await response.text();
      try { bodyPayload = rawText ? JSON.parse(rawText) : null; } catch { bodyPayload = rawText; }
    }

    return {
      ok: response.ok,
      status: response.status,
      body: bodyPayload,
      buffer: rawBuffer,
      diagnostics,
      headers: {
        contentType: response.headers.get("content-type") || null,
        provider: response.headers.get("x-tts-provider") || null,
        runtime: response.headers.get("x-tts-runtime") || null,
        licenseStatus: response.headers.get("x-license-status") || null,
        qualityTier: response.headers.get("x-quality-tier") || null
      },
      error: response.ok
        ? null
        : ((bodyPayload && bodyPayload.error) || rawText || response.statusText || "upstream_error")
    };
  } catch (error) {
    const aborted = error && (error.name === "AbortError" || error.code === "ABORT_ERR");
    return {
      ok: false,
      status: 0,
      body: null,
      buffer: null,
      diagnostics: null,
      headers: {},
      error: aborted ? "timeout" : (error && error.message) || String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function healthz() {
  return call("/tts/hebrew/phonikud-piper/health", { timeoutMs: 3000 });
}

async function synthesize(body) {
  return call("/tts/hebrew/phonikud-piper", {
    method: "POST",
    body,
    timeoutMs: DEFAULT_TIMEOUT_MS
  });
}

module.exports = {
  BASE,
  healthz,
  synthesize
};
