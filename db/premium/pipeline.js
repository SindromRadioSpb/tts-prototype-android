"use strict";

// Premium translation pipeline orchestrator.
//
//   translateTable({ text, target_lang, provider, text_id? })
//     → { rows, fromCache, cacheKey, cachedAt, provenance }
//
// Responsibilities:
//   1. Check doc cache by full pipeline key → fast path on hit.
//   2. Segment, then check segment cache + overrides for each piece.
//   3. For segments that remain, call Python sidecar: /nakdan + /translate.
//   4. Run local transliteration on niqqud output.
//   5. Apply overrides (field-level) on top of model output.
//   6. Assemble rows in original order, persist segment + doc caches.
//   7. If text_id provided, append to translation_history.
//
// GCP-specific translation lives in Phase 1.8 and will plug in behind the
// `provider` switch without changing this file's shape.

const cacheRepo    = require("../translationCacheRepo");
const overridesRepo = require("../translationOverridesRepo");
const historyRepo   = require("../translationHistoryRepo");

const { normalizeForDisplay, normalizeForKey } = require("./normalize");
const { buildDocKey, buildSegmentKey, hashString } = require("./keys");
const { SEGMENTER_VERSION, NIKUD_VERSION, TRANSLIT_PROFILE, translatorVersion } =
  require("./versions");
const { segment } = require("./segmenter");
const { transliterate } = require("./translit");
const pythonClient = require("./pythonClient");

const SUPPORTED_PROVIDERS = new Set(["madlad"]); // GCP added in Phase 1.8.

function nowIso() {
  return new Date().toISOString();
}

async function fetchNiqqud(texts) {
  if (!texts.length) return { results: [], model_version: NIKUD_VERSION };
  const r = await pythonClient.nakdan(texts);
  if (!r.ok) {
    const err = new Error(`nakdan upstream failed: ${r.status} ${r.error || ""}`);
    err.upstream = "nakdan";
    err.status = r.status;
    throw err;
  }
  return r.body;
}

async function fetchTranslations(segmentsForApi, target) {
  if (!segmentsForApi.length) return { results: [], model_version: "" };
  const r = await pythonClient.translate(segmentsForApi, target);
  if (!r.ok) {
    const err = new Error(`translate upstream failed: ${r.status} ${r.error || ""}`);
    err.upstream = "translate";
    err.status = r.status;
    throw err;
  }
  return r.body;
}

async function translateTable({ text, target_lang = "ru", provider = "madlad", text_id = null, note = null } = {}) {
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

  const displaySource = normalizeForDisplay(text);
  const keySource = normalizeForKey(text);
  const sourceHash = hashString(keySource);

  const docKey = buildDocKey({ provider, target_lang, normalizedSource: keySource });

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
      provenance: _provenance(provider, target_lang, "none"),
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
      cacheKey: buildSegmentKey({ provider, target_lang, normalizedSegment: heNormKey }),
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
      translit: null,
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

  // 5) Call Python sidecar in parallel for nikud + translation work sets.
  const [nikudResp, transResp] = await Promise.all([
    fetchNiqqud(needNikud.map((s) => s.he)),
    fetchTranslations(needTrans, target_lang),
  ]);

  // Merge nikud results back by position (input order preserved by sidecar).
  nikudResp.results.forEach((heNiqqud, i) => {
    const idx = needNikud[i].index;
    const row = resolved.get(idx);
    row.he_niqqud = heNiqqud;
    row._sources.he_niqqud = "model";
  });

  // Run transliteration locally on whatever he_niqqud we now have (model or cache).
  for (const m of segMeta) {
    const row = resolved.get(m.index);
    if (!row.translit && row.he_niqqud) {
      const t = transliterate(row.he_niqqud);
      if (t) {
        row.translit = t;
        row._sources.translit = "translit-local";
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
        translitProfile: TRANSLIT_PROFILE,
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
    translitProfile: TRANSLIT_PROFILE,
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
      translitProfile: TRANSLIT_PROFILE,
      translatorVersion: modelTranslatorVersion,
      rows,
      note,
    }).catch((e) => {
      // History is nice-to-have; don't fail the request over it.
      console.error("[premium] history append failed:", e.message);
    });
  }

  return {
    rows,
    fromCache: false,
    cacheKey: docKey,
    cachedAt: nowIso(),
    provenance: _provenance(provider, target_lang, "mixed", modelTranslatorVersion),
  };
}

function _provenance(provider, target_lang, cacheLevel, translator_version) {
  return {
    provider,
    target_lang,
    segmenter_version: SEGMENTER_VERSION,
    nikud_version: NIKUD_VERSION,
    translit_profile: TRANSLIT_PROFILE,
    translator_version: translator_version || translatorVersion(provider),
    cache_level: cacheLevel,
  };
}

module.exports = {
  translateTable,
  SUPPORTED_PROVIDERS,
};
