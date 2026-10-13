// public/js/corpus-materialize.js — one way to put a public work on this device (Ф4 · Д6, spec
// docs/planning/word-layer/F4_D6_CATALOG_SETS_SPEC_2026_10_14.md). The Room (openCorpusWork / openPublicCorpusWork)
// and «Мой словарь» (a set of texts from the server's catalogs) download through these functions — the same
// verification, the same device-edition choice, the same import. Dependencies come as arguments (Node-testable):
//   db: { dbQuery(sql, params), getTextById(id), importBundle(bundle, { mode }) }, fetch,
//   Edition: BenYehudaLearningEdition, Adapter: PublicCorpusAdapter, catalogVersion: CORPUS_CATALOG_VERSION.
// A downloaded work is an ordinary text of the device; no learner state is written here.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CorpusMaterialize = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  async function localIdByKey(db, textKey) {
    try { var rows = await db.dbQuery("SELECT id FROM texts WHERE text_key = ?", [textKey]); return rows && rows[0] ? rows[0].id : null; }
    catch (_) { return null; }
  }
  function byehudaIdOf(text) {
    try { var m = JSON.parse((text && text.source_meta_json) || "{}"); return m && m.corpus ? m.corpus.byehuda_id : null; } catch (_) { return null; }
  }

  // A Ben-Yehuda work («ready» card of corpus-index): the device's copy if there is one; for a learning edition an
  // earlier edition carrying my marks wins unless openPublished; otherwise the verified publication is imported.
  // → { localId, edition: 'published'|'previous', imported }
  async function ensureBenYehudaWork(card, deps, opts) {
    deps = deps || {}; opts = opts || {};
    var db = deps.db, Edition = deps.Edition;
    if (!card || !card.text_key) throw new Error("BY_CARD_INCOMPLETE");
    var localId = await localIdByKey(db, card.text_key);
    if (localId && card.learning_edition_id) {
      var current = await db.getTextById(localId);
      if (String(byehudaIdOf(current)) !== String(card.id)) throw new Error("Published local key belongs to another source work");
    }
    var previousIds = [];
    if (!localId && card.learning_edition_id && !opts.openPublished) {
      var keys = card.previous_text_keys || [];
      for (var i = 0; i < keys.length; i++) {
        var id = await localIdByKey(db, keys[i]);
        if (!id) continue;
        var previous = await db.getTextById(id);
        if (String(byehudaIdOf(previous)) === String(card.id)) previousIds.push(id);
      }
    }
    var choice = Edition.deviceChoice(card, localId, previousIds, !!opts.openPublished);
    if (choice.id) return { localId: choice.id, edition: choice.edition, imported: false };
    if (!card.file) throw new Error("BY_CARD_INCOMPLETE");   // a copy on the device opens without it; a download needs it
    var res = await deps.fetch("/data/benyehuda/" + card.file + "?v=" + deps.catalogVersion, { cache: "force-cache" });
    if (!res.ok) throw new Error("fetch " + res.status);
    var bundle = await Edition.verifyBundle(card, await res.arrayBuffer());
    if (!bundle || !bundle.library) throw new Error("malformed work payload");
    if (opts.isCurrent && !opts.isCurrent()) return null;
    await db.importBundle(bundle, { mode: "skip" });
    localId = await localIdByKey(db, card.text_key);
    if (!localId) throw new Error("work not resolvable after import");
    return { localId: localId, edition: choice.edition, imported: true };
  }

  // Под одним workId публикуются новые снимки (правка карточки, повторный импорт того же архива). Неизменяем только
  // адрес конкретного снимка; пришедший снимок обязан совпасть.
  function publicWorkUrl(slug, workId, snapshot) {
    var base = "/api/public-corpora/" + encodeURIComponent(slug) + "/works/" + encodeURIComponent(workId);
    return /^[a-f0-9]{64}$/.test(String(snapshot || "")) ? base + "?snapshot=" + snapshot : base;
  }
  function expectPublicSnapshot(payload, snapshot) {
    var got = payload && payload.item && payload.item.snapshot_sha256;
    if (/^[a-f0-9]{64}$/.test(String(snapshot || "")) && got !== snapshot) throw new Error("PUBLIC_WORK_SNAPSHOT_MISMATCH");
    return payload;
  }
  // A work of a public corpus (any corpus listed by /api/public-corpora). → { localId, imported }
  async function ensurePublicWork(slug, card, deps, opts) {
    deps = deps || {}; opts = opts || {};
    var db = deps.db, Adapter = deps.Adapter;
    if (!card || !card.public_work_id) throw new Error("PUBLIC_CARD_INCOMPLETE");
    var textKey = Adapter.localTextKey(slug, card.public_work_id, card.snapshot_sha256);
    var localId = await localIdByKey(db, textKey);
    if (localId) return { localId: localId, imported: false };
    var response = await deps.fetch(publicWorkUrl(slug, card.public_work_id, card.snapshot_sha256), { cache: "force-cache" });
    if (!response.ok) throw new Error("public work " + response.status);
    var payload = expectPublicSnapshot(await response.json(), card.snapshot_sha256);
    var bundle = Adapter.prepareImportBundle(payload);
    if (opts.isCurrent && !opts.isCurrent()) return null;
    await db.importBundle(bundle, { mode: "skip" });
    localId = await localIdByKey(db, textKey);
    if (!localId) throw new Error("public work not resolvable after import");
    return { localId: localId, imported: true };
  }

  // Many works, one at a time (no parallel load on the server), never stopping at a failure.
  // fn(item) → { localId, … }; onProgress(done, total, item). → { ok: [{ item, localId, imported }], failed: [{ item, reason }] }
  async function materializeMany(items, fn, opts) {
    opts = opts || {};
    var ok = [], failed = [], list = items || [];
    for (var i = 0; i < list.length; i++) {
      if (opts.isCurrent && !opts.isCurrent()) break;
      if (opts.onProgress) { try { opts.onProgress(i, list.length, list[i]); } catch (_) {} }
      try {
        var r = await fn(list[i]);
        if (r && r.localId) ok.push({ item: list[i], localId: r.localId, imported: !!r.imported });
        else if (r !== null) failed.push({ item: list[i], reason: "not resolvable" });
      } catch (e) { failed.push({ item: list[i], reason: String((e && e.message) || e) }); }
    }
    if (opts.onProgress) { try { opts.onProgress(list.length, list.length, null); } catch (_) {} }
    return { ok: ok, failed: failed };
  }

  // Search a catalog by title (and author) without niqqud / cantillation; the first `limit` of `total` matches.
  function stripMarks(s) { return String(s == null ? "" : s).normalize("NFKC").replace(/[֑-ׇ]/g, "").toLocaleLowerCase(); }
  function searchCards(cards, q, fields, limit) {
    var needle = stripMarks(q).trim(), max = limit || 100, out = [], total = 0, words = needle.split(/\s+/).filter(Boolean);
    for (var i = 0; i < (cards || []).length; i++) {
      var c = cards[i];
      if (words.length) {
        var hay = (fields || ["title"]).map(function (f) { return stripMarks(c[f]); }).join(" ");
        if (!words.every(function (w) { return hay.indexOf(w) >= 0; })) continue;
      }
      total++;
      if (out.length < max) out.push(c);
    }
    return { items: out, total: total };
  }

  return { ensureBenYehudaWork: ensureBenYehudaWork, ensurePublicWork: ensurePublicWork, publicWorkUrl: publicWorkUrl,
    expectPublicSnapshot: expectPublicSnapshot, materializeMany: materializeMany, searchCards: searchCards, stripMarks: stripMarks, localIdByKey: localIdByKey };
});
