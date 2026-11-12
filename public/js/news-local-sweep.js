// News section: removes the device copies of opened news articles that hold no user data
// (plan Task 6). Opening a public work materializes it in the local DB; without this sweep every
// read article would stay on the device forever. A copy stays when it carries anything the learner
// made: a bookmark, a note, own tags, a word place in "My dictionary" or a sentence review card.
// Reading traces that opening alone creates (position, recents, history) are not user data.
// Any doubt — a missing table, a failed query — keeps the copy.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NewsLocalSweep = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var FRESH_MS = 72 * 3600 * 1000;
  var KEY = /^public:news-([a-z0-9]+):(na_[0-9a-f]{24}\.[a-z0-9]{2}):([0-9a-f]{12})$/;
  var BY_TEXT_ID = ["bookmarks", "sentence_notes", "note_occurrences", "notes_v2", "studio_learning_materials", "studio_text_media_bindings"];
  var STATE_KEY = "news_sweep_at", INTERVAL_MS = 24 * 3600 * 1000;

  function parseKey(textKey) {
    var m = KEY.exec(String(textKey || ""));
    return m ? { outlet: m[1], workId: m[2], snapshot: m[3] } : null;
  }
  function publishedMs(row) {
    try { var meta = JSON.parse(row.source_meta_json || "{}"); return Date.parse(meta && meta.news && meta.news.published_at); } catch (_) { return NaN; }
  }
  async function tableSet(ldb) {
    var rows = await ldb.dbQuery("SELECT name FROM sqlite_master WHERE type='table'", []);
    var out = new Set();
    (rows || []).forEach(function (r) { out.add(String(r.name)); });
    return out;
  }
  async function hasUserState(ldb, tables, row) {
    for (var i = 0; i < BY_TEXT_ID.length; i++) {
      var t = BY_TEXT_ID[i];
      if (!tables.has(t)) continue;
      var hit = await ldb.dbQuery("SELECT 1 AS x FROM " + t + " WHERE text_id = ? LIMIT 1", [row.id]);
      if (hit && hit.length) return true;
    }
    // A sentence card never reviewed has no review_log row yet; deleting the text would cascade its sentences.
    if (tables.has("srs_cards") && tables.has("sentences") && ((await ldb.dbQuery("SELECT 1 AS x FROM srs_cards c JOIN sentences s ON s.id = c.source_sentence_id WHERE s.text_id = ? LIMIT 1", [row.id])) || []).length) return true;
    if (tables.has("text_user_meta") && ((await ldb.dbQuery("SELECT 1 AS x FROM text_user_meta WHERE text_key = ? LIMIT 1", [row.text_key])) || []).length) return true;
    if (tables.has("word_context") && ((await ldb.dbQuery("SELECT 1 AS x FROM word_context WHERE text_key = ? LIMIT 1", [row.text_key])) || []).length) return true;
    if (tables.has("review_log") && ((await ldb.dbQuery("SELECT 1 AS x FROM review_log WHERE substr(item_key, 1, ?) = ? LIMIT 1",
      [("sent:" + row.text_key + "#").length, "sent:" + row.text_key + "#"])) || []).length) return true;
    return false;
  }

  // → { removed, kept }. `keepIds`: text ids that must stay (e.g. the text open right now).
  async function run(ldb, opts) {
    opts = opts || {};
    var now = typeof opts.now === "number" ? opts.now : Date.now();
    var keep = new Set((opts.keepIds || []).map(String));
    var rows = await ldb.dbQuery("SELECT id, text_key, source_meta_json, updated_at FROM texts WHERE text_key LIKE 'public:news-%'", []);
    var tables = await tableSet(ldb);
    var newestByWork = new Map(), list = [];
    (rows || []).forEach(function (row) {
      var k = parseKey(row.text_key); if (!k) return;
      list.push({ row: row, key: k });
      var best = newestByWork.get(k.workId);
      if (!best || String(row.updated_at || "") > String(best.updated_at || "")) newestByWork.set(k.workId, row);
    });
    var removed = 0, kept = 0;
    for (var i = 0; i < list.length; i++) {
      var row = list[i].row, k = list[i].key;
      var superseded = newestByWork.get(k.workId) !== row;
      var age = now - publishedMs(row);
      var stale = superseded || (isFinite(age) && age > FRESH_MS);
      var removable = false;
      if (stale && !keep.has(String(row.id))) {
        try { removable = !(await hasUserState(ldb, tables, row)); } catch (_) { removable = false; }
      }
      if (!removable) { kept++; continue; }
      try { await ldb.deleteText(row.id); removed++; } catch (_) { kept++; }
    }
    return { removed: removed, kept: kept };
  }
  // At most once a day; never throws.
  async function maybeRun(ldb, opts) {
    try {
      var now = opts && typeof opts.now === "number" ? opts.now : Date.now();
      var last = Number(await ldb.getSyncState(STATE_KEY)) || 0;
      if (now - last < INTERVAL_MS) return null;
      await ldb.setSyncState(STATE_KEY, String(now));
      return await run(ldb, opts);
    } catch (_) { return null; }
  }
  return { run: run, maybeRun: maybeRun, parseKey: parseKey, FRESH_MS: FRESH_MS };
});
