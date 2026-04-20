"use strict";

// Niqqud annotation gateway.
//
// Implements a two-provider chain for Hebrew vowel-pointing:
//   1. Local Python sidecar  (http://127.0.0.1:8765/nakdan)
//   2. Dicta cloud API       (https://nakdan-5-1.loadbalancer.dicta.org.il/api)
//
// Fallback to cloud happens ONLY when the sidecar is unreachable (status === 0).
// If the sidecar is reachable but rejects a request, cloud is NOT tried — the
// error is treated as a model failure, not an infrastructure failure.
//
// Public API:
//
//   fetchNiqqud(texts, opts?) → {
//     results: string[],        // one niqqud string per input text (empty string on failure)
//     model_version: string,
//     provider: "local-sidecar" | "dicta-cloud" | "none",
//     degraded: boolean,
//     reason?: string,          // present only when degraded
//   }
//
//   annotate(text, opts?) → {
//     ok: boolean,
//     input: string,
//     niqqud: string,
//     translit: { sblAcademic: string, ruPhonetic: string },
//     provider: string,
//     degraded: boolean,
//     warnings: string[],
//   }

const pythonClient               = require("./pythonClient");
const dictaCloud                 = require("./providers/dictaCloud");
const { transliterateWithProfile } = require("./translit");
const { NIKUD_VERSION }          = require("./versions");

// ── Provider chain ────────────────────────────────────────────────────────────

async function fetchNiqqud(texts /* , _opts = {} */) {
  if (!Array.isArray(texts) || !texts.length) {
    return { results: [], model_version: NIKUD_VERSION, provider: "none", degraded: false };
  }

  // ── Provider 1: local Python sidecar ────────────────────────────────────────
  const sidecarResp = await pythonClient.nakdan(texts);

  if (sidecarResp.ok) {
    console.log(`[niqqud-gateway] provider=local-sidecar texts=${texts.length}`);
    return {
      results:       sidecarResp.body.results,
      model_version: sidecarResp.body.model_version || NIKUD_VERSION,
      provider:      "local-sidecar",
      degraded:      false,
    };
  }

  const sidecarReason = sidecarResp.status === 0  ? "sidecar_unreachable"
                      : sidecarResp.status >= 500 ? "sidecar_error"
                      : "sidecar_rejected";

  // ── Provider 2: Dicta cloud (only when sidecar is unreachable) ───────────────
  if (sidecarResp.status === 0) {
    console.warn(`[niqqud-gateway] sidecar unreachable — trying Dicta cloud (texts=${texts.length})`);
    try {
      const cloudResp = await dictaCloud.nakdan(texts);
      if (!cloudResp.ok) {
        console.warn(`[niqqud-gateway] Dicta cloud failed: ${cloudResp.error}`);
      } else {
        const anyFilled = cloudResp.body.results.some(r => r && r.trim());
        if (anyFilled) {
          console.log(`[niqqud-gateway] provider=dicta-cloud texts=${texts.length}`);
          return {
            results:       cloudResp.body.results,
            model_version: cloudResp.body.model_version || NIKUD_VERSION,
            provider:      "dicta-cloud",
            degraded:      false,
          };
        }
        console.warn(`[niqqud-gateway] Dicta cloud returned empty results`);
      }
    } catch (cloudErr) {
      console.warn(`[niqqud-gateway] Dicta cloud failed: ${cloudErr.message}`);
    }
  } else {
    console.warn(`[niqqud-gateway] sidecar error (${sidecarReason}) — no cloud fallback for non-unreachable failures`);
  }

  // ── All providers failed ─────────────────────────────────────────────────────
  console.warn(`[niqqud-gateway] all providers failed, degraded (reason=${sidecarReason})`);
  return {
    results:       texts.map(() => ""),
    model_version: NIKUD_VERSION,
    provider:      "none",
    degraded:      true,
    reason:        sidecarReason,
  };
}

// ── High-level single-text annotation (used by /api/niqqud) ──────────────────

async function annotate(text /* , opts = {} */) {
  const input = String(text || "").trim();
  const warnings = [];

  const result = await fetchNiqqud([input]);
  const niqqud = (result.results && result.results[0]) || "";

  let sblAcademic = "";
  let ruPhonetic  = "";
  if (niqqud) {
    try { sblAcademic = transliterateWithProfile(niqqud, "sbl")         || ""; } catch (_) {}
    try { ruPhonetic  = transliterateWithProfile(niqqud, "ru-phonetic") || ""; } catch (_) {}
  }

  if (result.degraded) warnings.push("Niqqud provider unavailable");

  return {
    ok:      !result.degraded,
    input,
    niqqud,
    translit: { sblAcademic, ruPhonetic },
    provider: result.provider || "none",
    degraded: result.degraded || false,
    warnings,
  };
}

module.exports = { fetchNiqqud, annotate };
