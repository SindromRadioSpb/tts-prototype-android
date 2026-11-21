// Tags, ★ and «прочитано» of a visitor without an account (findability spec §8а п.1): kept in this browser
// only (IndexedDB). Storage may be blocked (private mode, Node): then ok:false and every call is harmless —
// the page says the marks are not kept on this device.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NewsMarksLocal = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var DB = "lp-news-marks", STORE = "marks";

  function idbBackend(idb) {
    var dbp = null;
    function db() {
      if (!dbp) dbp = new Promise(function (res, rej) {
        var req = idb.open(DB, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: "item_key" }); };
        req.onsuccess = function () { res(req.result); };
        req.onerror = function () { rej(req.error || new Error("IDB_OPEN")); };
        req.onblocked = function () { rej(new Error("IDB_BLOCKED")); };
      });
      return dbp;
    }
    function tx(mode, fn) {
      return db().then(function (d) {
        return new Promise(function (res, rej) {
          var t = d.transaction(STORE, mode), s = t.objectStore(STORE), out = fn(s);
          t.oncomplete = function () { res(out && out.result !== undefined ? out.result : undefined); };
          t.onerror = function () { rej(t.error || new Error("IDB_TX")); };
          t.onabort = function () { rej(t.error || new Error("IDB_ABORT")); };
        });
      });
    }
    return {
      load: function () { return tx("readonly", function (s) { return s.getAll(); }); },
      put: function (r) { return tx("readwrite", function (s) { s.put(r); }); },
      del: function (k) { return tx("readwrite", function (s) { s.delete(k); }); },
    };
  }

  // opts.backend: { load() → Promise<records>, put(record), del(key) } — IndexedDB by default.
  function open(opts) {
    opts = opts || {};
    var backend = opts.backend;
    if (!backend) {
      var idb = null;
      try { idb = typeof indexedDB !== "undefined" ? indexedDB : null; } catch (_) { idb = null; }
      if (!idb) return Promise.resolve(disabled());
      backend = idbBackend(idb);
    }
    var byKey = {};
    return Promise.resolve().then(function () { return backend.load(); }).then(function (rows) {
      (rows || []).forEach(function (r) { if (r && r.item_key) byKey[r.item_key] = { item_key: r.item_key, tags: Array.isArray(r.tags) ? r.tags.slice() : [], read: !!r.read }; });
      function save(k) {
        var r = byKey[k];
        if (!r.tags.length && !r.read) { delete byKey[k]; return Promise.resolve(backend.del(k)).catch(function () {}); }
        return Promise.resolve(backend.put({ item_key: k, tags: r.tags, read: r.read })).catch(function () {});
      }
      function rec(k) { return byKey[k] || (byKey[k] = { item_key: k, tags: [], read: false }); }
      return {
        ok: true,
        marks: function (k) { return byKey[k] ? byKey[k].tags.slice() : []; },
        isRead: function (k) { return !!(byKey[k] && byKey[k].read); },
        toggle: function (k, tag) {
          var r = rec(k), i = r.tags.indexOf(tag);
          if (i >= 0) r.tags.splice(i, 1); else r.tags.push(tag);
          var out = r.tags.slice();
          return save(k).then(function () { return out; });
        },
        read: function (k) { rec(k).read = true; return save(k); },
        tags: function () {
          var n = {};
          Object.keys(byKey).forEach(function (k) { byKey[k].tags.forEach(function (t) { n[t] = (n[t] || 0) + 1; }); });
          return Object.keys(n).sort(function (a, b) { return (n[b] - n[a]) || (a < b ? -1 : a > b ? 1 : 0); }).map(function (t) { return { tag: t, n: n[t] }; });
        },
        keysWith: function (tag) { return Object.keys(byKey).filter(function (k) { return byKey[k].tags.indexOf(tag) >= 0; }); },
      };
    }).catch(function () { return disabled(); });
  }
  function disabled() {
    return { ok: false, marks: function () { return []; }, isRead: function () { return false; }, toggle: function () { return Promise.resolve([]); },
      read: function () { return Promise.resolve(); }, tags: function () { return []; }, keysWith: function () { return []; } };
  }
  return { open: open };
});
