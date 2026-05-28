"use strict";

// Premium translation pipeline orchestrator.
//
//   translateTable({ text, target_lang, provider, text_id? })
//     → { rows, fromCache, cacheKey, cachedAt, provenance }
//
// Responsibilities:
//   1. Check doc cache by full pipeline key → fast path on hit.
//   2. Segment, then check segment cache + overrides for each piece.
//   3. For segments that remain, call niqqudGateway (sidecar → Dicta cloud)
//      and the chosen translation provider in parallel.
//   4. Run local transliteration on niqqud output.
//   5. Apply overrides (field-level) on top of model output.
//   6. Assemble rows in original order, persist segment + doc caches.
//   7. If text_id provided, append to translation_history.

const cacheRepo    = require("../translationCacheRepo");
const overridesRepo = require("../translationOverridesRepo");
const historyRepo   = require("../translationHistoryRepo");

const { normalizeForDisplay, normalizeForKey } = require("./normalize");
const { buildDocKey, buildSegmentKey, hashString } = require("./keys");
const {
  SEGMENTER_VERSION, NIKUD_VERSION, TRANSLIT_PROFILE,
  translatorVersion,
} = require("./versions");
const { segment } = require("./segmenter");
const { transliterateWithProfile } = require("./translit");
const niqqudGateway = require("./niqqudGateway");
const pythonClient = require("./pythonClient");
const gcpProvider        = require("./providers/gcp");
const googleFreeProvider = require("./providers/googleFree");
const quota = require("./quota");

const SUPPORTED_PROVIDERS = new Set(["madlad", "gcp", "google-free"]);

// Both translits (SBL + Russian phonetic) are always computed for every row.
// The cache key reflects this with a single fixed string so the two profiles
// share one cache namespace and both values are always available for display.
const TRANSLIT_PROFILE_KEY_BOTH = "both-v2"; // v2: SBL DAGESH_CHAZAQ disabled

function nowIso() {
  return new Date().toISOString();
}

// Delegates to niqqudGateway: local sidecar → Dicta cloud → graceful degradation.
// Returns { results, model_version, provider, degraded, reason? }
async function fetchNiqqud(texts) {
  if (!texts.length) return { results: [], model_version: NIKUD_VERSION, provider: "none", degraded: false };
  return niqqudGateway.fetchNiqqud(texts);
}

async function _madladTranslate(segmentsForApi, target) {
  const r = await pythonClient.translate(segmentsForApi, target);
  if (!r.ok) {
    if (r.status === 0) {
      const err = new Error("Python sidecar (ai-local) не запущен на 127.0.0.1:8765 — MADLAD недоступен");
      err.provider = "madlad";
      err.upstream = "translate";
      err.status = 0;
      err.kind = "sidecar_down";
      err.fallbackable = false;
      throw err;
    }
    const err = new Error(`madlad upstream failed: ${r.status} ${r.error || ""}`);
    err.provider = "madlad";
    err.upstream = "translate";
    err.status = r.status;
    err.kind = (r.status >= 500 && r.status < 600) ? "transient" : "unknown";
    err.fallbackable = false; // madlad is the fallback target; don't fallback again
    throw err;
  }
  return { ...r.body, chars: 0 }; // chars not metered for local model
}

async function _gcpTranslate(segmentsForApi, target, apiKey) {
  // BYOK: per-request key via Cloud Translation v2 REST. Server-side service
  // account path (translateBatch via v3 SDK) is intentionally NOT used here —
  // see Phase 1 of the BYOK rollout. Without a key the provider throws config.
  const out = await gcpProvider.translateBatchWithApiKey(segmentsForApi, target, apiKey);
  // Persist usage on success (chars meter the free-tier).
  quota.recordGcpUsage({ chars: out.chars });
  return out;
}

async function _googleFreeTranslate(segmentsForApi, target) {
  const out = await googleFreeProvider.translateBatch(segmentsForApi, target);
  return { ...out, chars: 0 }; // not metered
}

// Dispatcher with optional fallback. Returns:
//   { results, model_version, chars, actualProvider, fallbackReason? }
async function fetchTranslations(segmentsForApi, target, requestedProvider, gcpApiKey) {
  if (!segmentsForApi.length) {
    return { results: [], model_version: "", chars: 0, actualProvider: requestedProvider };
  }

  if (requestedProvider === "google-free") {
    try {
      const out = await _googleFreeTranslate(segmentsForApi, target);
      return { ...out, actualProvider: "google-free" };
    } catch (e) {
      e.provider = "google-free";
      throw e;
    }
  }

  if (requestedProvider === "gcp") {
    if (!gcpApiKey) {
      const err = new Error("GCP Translate API key required (BYOK)");
      err.provider = "gcp";
      err.upstream = "translate";
      err.kind = "config";
      err.fallbackable = false;
      throw err;
    }
    try {
      const out = await _gcpTranslate(segmentsForApi, target, gcpApiKey);
      return { ...out, actualProvider: "gcp" };
    } catch (e) {
      // Quota errors propagate to the caller — no auto-fallback per project policy.
      if (e.kind === "quota") {
        quota.recordGcpUsage({ chars: 0, error: { kind: "quota", at: nowIso() } });
        throw e;
      }
      // Transient: try once more, then fall back to madlad.
      if (e.fallbackable) {
        try {
          const out = await _gcpTranslate(segmentsForApi, target, gcpApiKey);
          return { ...out, actualProvider: "gcp" };
        } catch (e2) {
          if (e2.kind === "quota") {
            quota.recordGcpUsage({ chars: 0, error: { kind: "quota", at: nowIso() } });
            throw e2;
          }
          // Fall through to madlad.
          const fb = await _madladTranslate(segmentsForApi, target);
          return { ...fb, actualProvider: "madlad", fallbackReason: e2.kind || "transient" };
        }
      }
      throw e;
    }
  }

  // Default: madlad.
  const out = await _madladTranslate(segmentsForApi, target);
  return { ...out, actualProvider: "madlad" };
}

async function translateTable({ text, target_lang = "ru", provider = "madlad", text_id = null, note = null, gcpApiKey = null } = {}) {
  if (typeof text !== "string" || !text.trim()) {
    const err = new Error("text is required");
    err.code = "BAD_INPUT";
    throw err;
  }
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    const err = new Error(`unsupported provider: ${provider}`);
    err.code = "BAD_INPUT";
    throw err;
  }

  const tProfileKey = TRANSLIT_PROFILE_KEY_BOTH;

  const displaySource = normalizeForDisplay(text);
  const keySource = normalizeForKey(text);
  const sourceHash = hashString(keySource);

  const docKey = buildDocKey({ provider, target_lang, normalizedSource: keySource, translitProfile: tProfileKey });

  // 1) Doc cache fast path
  const hit = await cacheRepo.getDocByKey(docKey);
  if (hit) {
    return {
      rows: hit.rows,
      fromCache: true,
      cacheKey: docKey,
      cachedAt: hit.created_at,
      provenance: {
        provider: hit.provider,
        target_lang: hit.target_lang,
        segmenter_version: hit.segmenter_version,
        nikud_version: hit.nikud_version,
        translit_profile: hit.translit_profile,
        translator_version: hit.translator_version,
        cache_level: "doc",
      },
    };
  }

  // 2) Segment
  const segs = segment(displaySource);
  if (!segs.length) {
    return {
      rows: [],
      fromCache: false,
      cacheKey: docKey,
      cachedAt: null,
      provenance: _provenance(provider, target_lang, "none", undefined, tProfileKey),
    };
  }

  // 3) Segment cache + overrides lookup
  const segMeta = segs.map((s) => {
    const heNormKey = normalizeForKey(s.he);
    return {
      index: s.index,
      heDisplay: s.he,
      heKey: heNormKey,
      heHash: hashString(heNormKey),
      cacheKey: buildSegmentKey({ provider, target_lang, normalizedSegment: heNormKey, translitProfile: tProfileKey }),
    };
  });

  const [segHits, overrideHits] = await Promise.all([
    cacheRepo.getSegments(segMeta.map((m) => m.cacheKey)),
    overridesRepo.lookupByHashes({
      heHashes: segMeta.map((m) => m.heHash),
      targetLang: target_lang,
      provider,
    }),
  ]);

  // 4) Figure out which segments need model work.
  const needNikud = [];  // [{index, he}]
  const needTrans = [];  // [{index, he}]
  const resolved = new Map(); // index -> { he, he_niqqud, translit, ru, source }

  for (const m of segMeta) {
    const ov = overrideHits.get(m.heHash);
    const cached = segHits.get(m.cacheKey);

    const row = {
      he: m.heDisplay,
      he_niqqud: null,
      translit: null,    // SBL Academic (always computed)
      translit_ru: null, // Russian phonetic (always computed)
      ru: null,
      _sources: { he_niqqud: null, translit: null, ru: null },
    };

    if (cached) {
      row.he_niqqud = cached.he_niqqud || null;
      row.translit  = cached.translit  || null;
      row.ru        = cached.ru        || null;
      if (row.he_niqqud) row._sources.he_niqqud = "segment-cache";
      if (row.translit)  row._sources.translit  = "segment-cache";
      if (row.ru)        row._sources.ru        = "segment-cache";
    }

    if (ov) {
      if (ov.he_niqqud) { row.he_niqqud = ov.he_niqqud; row._sources.he_niqqud = "override"; }
      if (ov.translit)  { row.translit  = ov.translit;  row._sources.translit  = "override"; }
      if (ov.ru)        { row.ru        = ov.ru;        row._sources.ru        = "override"; }
    }

    if (!row.he_niqqud) needNikud.push({ index: m.index, he: m.heDisplay });
    if (!row.ru)        needTrans.push({ index: m.index, he: m.heDisplay });

    resolved.set(m.index, row);
  }

  // 5) Call sidecar (nikud) and the chosen translation provider in parallel.
  const [nikudResp, transResp] = await Promise.all([
    fetchNiqqud(needNikud.map((s) => s.he)),
    fetchTranslations(needTrans, target_lang, provider, gcpApiKey),
  ]);

  // Merge nikud results back by position (input order preserved by sidecar).
  nikudResp.results.forEach((heNiqqud, i) => {
    const idx = needNikud[i].index;
    const row = resolved.get(idx);
    row.he_niqqud = heNiqqud || null;
    if (heNiqqud) row._sources.he_niqqud = "model";
  });

  // Compute both translits for every row that has he_niqqud.
  // translit     = SBL Academic (scholarly diacritics)
  // translit_ru  = Russian phonetic (Cyrillic, dagesh chazaq suppressed)
  for (const m of segMeta) {
    const row = resolved.get(m.index);
    if (row.he_niqqud) {
      if (!row.translit) {
        const t = transliterateWithProfile(row.he_niqqud, "sbl");
        if (t) { row.translit = t; row._sources.translit = "translit-local"; }
      }
      if (!row.translit_ru) {
        const t = transliterateWithProfile(row.he_niqqud, "ru-phonetic");
        if (t) row.translit_ru = t;
      }
    }
  }

  // Merge translation results back.
  (transResp.results || []).forEach((seg) => {
    const row = resolved.get(seg.index);
    if (row) {
      row.ru = seg.ru;
      row._sources.ru = "model";
    }
  });

  // 6) Assemble rows in original order.
  const rows = segMeta.map((m) => {
    const r = resolved.get(m.index);
    return {
      segment_index: m.index,
      he: r.he,
      he_niqqud: r.he_niqqud || "",
      translit: r.translit || "",
      translit_ru: r.translit_ru || "",
      ru: r.ru || "",
    };
  });

  // 7) Write segment cache for everything that got non-empty output.
  const modelTranslatorVersion = transResp.model_version || translatorVersion(provider);
  await Promise.all(
    segMeta.map((m) => {
      const row = resolved.get(m.index);
      if (!row.he_niqqud && !row.translit && !row.ru) return null;
      return cacheRepo.putSegment({
        cacheKey: m.cacheKey,
        heHash: m.heHash,
        he: m.heDisplay,
        heNiqqud: row.he_niqqud,
        translit: row.translit,
        ru: row.ru,
        provider,
        targetLang: target_lang,
        nikudVersion: NIKUD_VERSION,
        translitProfile: tProfileKey,
        translatorVersion: modelTranslatorVersion,
      });
    })
  );

  // 8) Write doc cache.
  await cacheRepo.putDoc({
    cacheKey: docKey,
    sourceHash,
    provider,
    targetLang: target_lang,
    segmenterVersion: SEGMENTER_VERSION,
    nikudVersion: NIKUD_VERSION,
    translitProfile: tProfileKey,
    translatorVersion: modelTranslatorVersion,
    rows,
  });

  // 9) Append history if the caller gave us a text_id.
  if (text_id) {
    await historyRepo.append({
      textId: text_id,
      provider,
      targetLang: target_lang,
      segmenterVersion: SEGMENTER_VERSION,
      nikudVersion: NIKUD_VERSION,
      translitProfile: tProfileKey,
      translatorVersion: modelTranslatorVersion,
      rows,
      note,
    }).catch((e) => {
      // History is nice-to-have; don't fail the request over it.
      console.error("[premium] history append failed:", e.message);
    });
  }

  const prov = _provenance(provider, target_lang, "mixed", modelTranslatorVersion, tProfileKey);
  if (transResp.actualProvider && transResp.actualProvider !== provider) {
    prov.actual_provider = transResp.actualProvider;
    prov.fallback_reason = transResp.fallbackReason || "transient";
  }
  prov.nikud_provider = nikudResp.provider || "local-sidecar";
  if (nikudResp.degraded) {
    prov.nikud_degraded = true;
    prov.nikud_degraded_reason = nikudResp.reason || "sidecar_unreachable";
    prov.nikud_provider = "none";
  }

  return {
    rows,
    fromCache: false,
    cacheKey: docKey,
    cachedAt: nowIso(),
    provenance: prov,
  };
}

function _provenance(provider, target_lang, cacheLevel, translator_version, tProfileKey) {
  return {
    provider,
    target_lang,
    segmenter_version: SEGMENTER_VERSION,
    nikud_version: NIKUD_VERSION,
    translit_profile: tProfileKey || TRANSLIT_PROFILE,
    translator_version: translator_version || translatorVersion(provider),
    cache_level: cacheLevel,
  };
}

module.exports = {
  translateTable,
  SUPPORTED_PROVIDERS,
};
