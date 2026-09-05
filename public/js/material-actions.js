(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.MaterialActions = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const HASH = /^[0-9a-f]{64}$/i;
  const clean = value => String(value == null ? "" : value).trim();
  function source(value) {
    const raw = value || {}, kind = clean(raw.kind || "local");
    if (!["local", "benyehuda", "public", "group"].includes(kind)) throw new Error("MATERIAL_SOURCE_INVALID");
    if (kind === "public" && !clean(raw.slug)) throw new Error("MATERIAL_PUBLIC_SLUG_REQUIRED");
    if (kind === "group" && !clean(raw.corpusId)) throw new Error("MATERIAL_GROUP_ID_REQUIRED");
    return Object.freeze({ kind, slug: clean(raw.slug), corpusId: clean(raw.corpusId) });
  }
  function capabilities(value) {
    const normalized = source(value);
    return Object.freeze({
      share: true,
      morphology: true,
      obsidian: normalized.kind !== "group",
      machineNiqqud: normalized.kind === "local",
      protectedLinkOnly: normalized.kind === "group",
    });
  }
  function audioUrl(value, assetKey) {
    const normalized = source(value), key = clean(assetKey);
    if (!key || (!HASH.test(key) && key.length > 240)) throw new Error("MATERIAL_AUDIO_KEY_INVALID");
    if (normalized.kind === "public") return "/api/public-corpora/" + encodeURIComponent(normalized.slug) + "/assets/" + encodeURIComponent(key);
    if (normalized.kind === "group") return "/api/group-corpora/" + encodeURIComponent(normalized.corpusId) + "/audio/" + encodeURIComponent(key);
    return "/api/audio/" + encodeURIComponent(key);
  }
  async function fetchAudioAsset(value, assetKey, options) {
    const opts = options || {}, fetcher = opts.fetch || (typeof fetch === "function" ? fetch : null);
    if (!fetcher) throw new Error("MATERIAL_AUDIO_FETCH_UNAVAILABLE");
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutMs = Math.max(1000, Math.min(30000, Number(opts.timeoutMs) || 8000));
    let timer = null;
    if (controller && opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(audioUrl(value, assetKey), { signal: controller ? controller.signal : opts.signal, cache: "force-cache" });
      if (!response || !response.ok) {
        const error = new Error("MATERIAL_AUDIO_HTTP_" + (response && response.status || 0)); error.code = "AUDIO_HTTP_" + (response && response.status || 0); throw error;
      }
      return await response.arrayBuffer();
    } finally { if (timer) clearTimeout(timer); }
  }
  return Object.freeze({ source, capabilities, audioUrl, fetchAudioAsset });
});
