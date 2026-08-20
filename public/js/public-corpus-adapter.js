(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.PublicCorpusAdapter = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ID = /^[A-Za-z0-9_.:-]{1,160}$/;
  const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const HASH = /^[0-9a-f]{64}$/;
  const yes = value => value === true || Number(value) === 1;
  function invalid() { const error = new Error("PUBLIC_CORPUS_PAYLOAD_INVALID"); error.code = "PUBLIC_CORPUS_PAYLOAD_INVALID"; throw error; }
  function text(value, max, pattern) { const clean = String(value == null ? "" : value).trim(); if (!clean || clean.length > max || (pattern && !pattern.test(clean))) invalid(); return clean; }
  function count(value) { const number = Number(value); if (!Number.isInteger(number) || number < 0) invalid(); return number; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function parseMeta(value) { if (!value) return {}; if (typeof value === "object") return clone(value); try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch (_) { return {}; } }

  function normalizeItem(raw, edition) {
    const item = raw || {};
    const capabilities = { read: yes(item.public_read_allowed), stream: yes(item.public_stream_allowed), download: yes(item.package_download_allowed) };
    if (!capabilities.read) invalid();
    return Object.freeze({
      id: text(item.public_work_id, 160, ID), public_work_id: text(item.public_work_id, 160, ID),
      position_no: count(item.position_no), title: text(item.title || "Untitled", 500), creator: String(item.creator || "").slice(0, 500),
      snapshot_sha256: text(item.snapshot_sha256, 64, HASH), capabilities,
      expected_audio_count: count(item.expected_audio_count), included_audio_count: count(item.included_audio_count),
      asset_missing: count(item.asset_missing), package_complete: yes(item.package_complete),
      edition_id: edition.edition_id, manifest_sha256: edition.manifest_sha256,
    });
  }
  function normalizeCorpus(payload) {
    const value = payload || {}, rawCorpus = value.corpus || {}, rawEdition = value.edition || {};
    const edition = Object.freeze({
      edition_id: text(rawEdition.edition_id, 160, ID), edition_number: count(rawEdition.edition_number == null ? 1 : rawEdition.edition_number),
      manifest_sha256: text(rawEdition.manifest_sha256, 64, HASH), item_count: count(rawEdition.item_count), asset_count: count(rawEdition.asset_count),
      asset_missing: count(rawEdition.asset_missing), package_complete: yes(rawEdition.package_complete), published_at: String(rawEdition.published_at || ""),
    });
    const items = Array.isArray(value.items) ? value.items.map(item => normalizeItem(item, edition)) : invalid();
    if (items.length !== edition.item_count) invalid();
    return Object.freeze({ corpus_id: text(rawCorpus.corpus_id, 160, ID), slug: text(rawCorpus.slug, 80, SLUG), title: text(rawCorpus.title, 500), description: String(rawCorpus.description || "").slice(0, 4000), edition, items: Object.freeze(items) });
  }
  function normalizeWork(payload) {
    const raw = payload.item || {}, snapshot = raw.snapshot;
    if (!snapshot || typeof snapshot !== "object" || !snapshot.library || !Array.isArray(snapshot.library.texts) || !snapshot.library.texts.length) invalid();
    const rawAssets = Array.isArray(payload.assets) ? payload.assets : [];
    const corpus = normalizeCorpus({ corpus: payload && payload.corpus, edition: {
      ...(payload && payload.edition || {}), item_count: 1,
      asset_count: payload && payload.edition && payload.edition.asset_count != null ? payload.edition.asset_count : rawAssets.length,
      asset_missing: payload && payload.edition && payload.edition.asset_missing != null ? payload.edition.asset_missing : Number(raw.asset_missing) || 0,
      package_complete: payload && payload.edition && payload.edition.package_complete != null ? payload.edition.package_complete : raw.package_complete,
    }, items: [raw] });
    const assets = rawAssets.map(asset => Object.freeze({
      asset_key: text(asset.asset_key, 64, HASH), bytes: count(asset.bytes), sha256: text(asset.sha256, 64, HASH), mime: String(asset.mime || "audio/mpeg"),
      stream: yes(asset.public_stream_allowed), download: yes(asset.package_download_allowed),
    }));
    return Object.freeze({ corpus, item: corpus.items[0], snapshot: clone(snapshot), assets: Object.freeze(assets) });
  }
  function prepareImportBundle(payload) {
    const work = normalizeWork(payload), bundle = clone(work.snapshot);
    const streamable = new Set(work.assets.filter(asset => asset.stream).map(asset => asset.asset_key));
    for (const [index, sourceText] of bundle.library.texts.entries()) {
      const meta = parseMeta(sourceText.source_meta || sourceText.source_meta_json);
      delete meta.group_corpus;
      meta.public_corpus = {
        slug: work.corpus.slug, corpus_id: work.corpus.corpus_id, edition_id: work.corpus.edition.edition_id,
        public_work_id: work.item.public_work_id, manifest_sha256: work.corpus.edition.manifest_sha256,
        snapshot_sha256: work.item.snapshot_sha256,
      };
      sourceText.source_meta = meta;
      delete sourceText.source_meta_json;
      sourceText.text_key = "public:" + work.corpus.slug + ":" + work.item.public_work_id + ":" + work.item.snapshot_sha256.slice(0, 12) + (index ? ":" + index : "");
      for (const row of (Array.isArray(sourceText.rows) ? sourceText.rows : [])) {
        const key = String(row && row.audio_asset_key || "").toLowerCase();
        if (key && !streamable.has(key)) delete row.audio_asset_key;
      }
    }
    return bundle;
  }
  function deepLink(slug, workId) {
    return "/library.html?public_corpus=" + encodeURIComponent(text(slug, 80, SLUG)) + (workId ? "&public_work=" + encodeURIComponent(text(workId, 160, ID)) : "");
  }
  function localTextKey(slug, workId, snapshotHash, index) {
    return "public:" + text(slug, 80, SLUG) + ":" + text(workId, 160, ID) + ":" + text(snapshotHash, 64, HASH).slice(0, 12) + (Number(index) ? ":" + count(index) : "");
  }
  return Object.freeze({ normalizeCorpus, normalizeWork, prepareImportBundle, deepLink, localTextKey });
});
