/* cloud-sync.js — CLG-P3 Browser Sync Bridge engine (AI_MENTOR_RECON_2026_07_04.md §4.3).
 *
 * Two-way review_log sync between the OPFS canon and the Cloud Learner Graph:
 *   UP:   outbox = rowid-watermark over the append-only review_log itself (cursor-over-log —
 *         no separate queue, so every existing writer is in-scope by construction);
 *         batches are idempotent (deterministic key from the page's row ids) and CONTENT
 *         meta keys are stripped CLIENT-side before upload (§5 B5 — the local copy stays full;
 *         the server enforces the same allowlist independently).
 *   DOWN: server rows after the ingested_at high-water mark are merged into the local log via
 *         appendReviewLog (INSERT OR IGNORE by PK); projections for the NEW item_keys are
 *         recomputed from the merged log BEFORE the caller repaints (§4.3 down-sync rule).
 *   CUTOVER (§4.3): the up-cursor is trusted only after a full-scan VERIFY pass reports
 *         0 new rows server-side (verify uses fresh idempotency keys so the batch-replay
 *         cache cannot mask a hole).
 *
 * DORMANT BY DEFAULT: nothing calls this engine without an explicit user action (login +
 * sync) — local-first Tier 1 behavior is untouched (recon §5 tiers). Owner-only bootstrap.
 *
 * UMD + injected deps (ldb module, fetch) — Node gates drive it headless.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.CloudSync = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var UP_CURSOR = "up_cursor", DOWN_CURSOR = "down_cursor", CUTOVER_OK = "cutover_ok", LAST_SYNC = "last_sync_at";
  var BATCH_UP = 400, BATCH_DOWN = 500;

  // Lock-step with db/learnerLogRepo.js META_STRIP (server enforces independently).
  var CONTENT_META_KEYS = ["surface", "answer", "expected", "word", "lemma", "usage", "translation", "gloss", "niqqud"];

  var _csrf = null;
  function csrf() {
    if (_csrf) return _csrf;
    try { _csrf = localStorage.getItem("cloud.csrf") || null; } catch (_) {}
    return _csrf;
  }
  function setCsrf(v) {
    _csrf = v || null;
    try { if (v) localStorage.setItem("cloud.csrf", v); else localStorage.removeItem("cloud.csrf"); } catch (_) {}
  }

  async function jfetch(method, path, body, opts) {
    var h = { "Content-Type": "application/json" };
    if (method !== "GET" && csrf()) h["X-LP-CSRF"] = csrf();
    var res = await fetch(path, {
      method: method, headers: h, credentials: "same-origin",
      body: body != null ? JSON.stringify(body) : undefined,
    });
    var json = null; try { json = await res.json(); } catch (_) {}
    return { status: res.status, json: json };
  }

  // ── session ──────────────────────────────────────────────────────────────
  async function me() {
    var r = await jfetch("GET", "/api/auth/me");
    if (r.status !== 200 || !r.json || !r.json.ok) return null;
    setCsrf(r.json.csrf);
    return r.json;
  }
  async function login(secret, deviceLabel) {
    var r = await jfetch("POST", "/api/auth/bootstrap-login", { secret: secret, deviceLabel: deviceLabel || "" });
    if (r.status !== 200 || !r.json || !r.json.ok) return { ok: false, status: r.status, error: (r.json && r.json.error) || "LOGIN_FAILED" };
    setCsrf(r.json.csrf);
    return { ok: true, user: r.json.user };
  }
  async function logout() {
    try { await jfetch("POST", "/api/auth/logout"); } catch (_) {}
    setCsrf(null);
    return { ok: true };
  }

  // ── upload ───────────────────────────────────────────────────────────────
  function stripMeta(metaJson) {
    var meta = {};
    try { meta = typeof metaJson === "string" ? JSON.parse(metaJson || "{}") : (metaJson || {}); } catch (_) { meta = {}; }
    for (var i = 0; i < CONTENT_META_KEYS.length; i++) delete meta[CONTENT_META_KEYS[i]];
    return JSON.stringify(meta);
  }
  function rowForUpload(w) {
    return {
      id: w.id, item_key: w.item_key, kind: w.kind, reviewed_at: w.reviewed_at,
      grade: w.grade == null ? null : Number(w.grade), source: w.source,
      channel: w.channel != null ? w.channel : null,
      latency_ms: w.latency_ms != null ? Number(w.latency_ms) : null,
      meta_json: stripMeta(w.meta_json),
    };
  }
  // One page up. keyPrefix distinguishes the normal pass ('up') from the cutover VERIFY pass
  // ('vf': fresh idempotency keys → the server reports TRUE dup counts instead of replaying
  // the stored result of the original batch).
  async function _uploadFrom(ldb, fromRowid, keyPrefix, totals) {
    var LC = (typeof window !== "undefined") ? window.LemmaCanon : (typeof require === "function" ? null : null);
    var cur = fromRowid;
    for (;;) {
      var rows = await ldb.listReviewLogAfterRowid(cur, BATCH_UP);
      if (!rows.length) break;
      var payload = rows.map(rowForUpload);
      var idsFlat = rows.map(function (w) { return w.id; }).join("\n");
      var key = keyPrefix + ":" + (LC && LC.sha1Hex ? LC.sha1Hex(idsFlat).slice(0, 24) : String(cur) + "-" + rows.length);
      var r = await jfetch("POST", "/api/learner/ingest", {
        idempotency_key: key, schema_version: 1,
        keyer_version: LC ? LC.KEYER_VERSION : undefined,
        source_client_version: (typeof window !== "undefined" && window.APP_VERSION) || undefined,
        review_log: payload,
      });
      if (r.status !== 200 || !r.json || r.json.ok === false) {
        return { ok: false, status: r.status, error: (r.json && r.json.error) || "INGEST_FAILED", at: cur };
      }
      totals.sent += rows.length;
      totals.new += (r.json.review_log && r.json.review_log.new) || 0;
      totals.dup += (r.json.review_log && r.json.review_log.dup) || 0;
      totals.rejected += (r.json.review_log && r.json.review_log.rejected) || 0;
      cur = Number(rows[rows.length - 1].rid) || cur;
    }
    return { ok: true, cursor: cur };
  }
  async function syncUp(ldb) {
    var totals = { sent: 0, new: 0, dup: 0, rejected: 0 };
    var cur = Number(await ldb.getSyncState(UP_CURSOR)) || 0;
    var up = await _uploadFrom(ldb, cur, "up", totals);
    if (!up.ok) return { ok: false, error: up.error, status: up.status, totals: totals };
    await ldb.setSyncState(UP_CURSOR, String(up.cursor));
    // §4.3 cutover: trust the cursor only after a full-scan verify reports 0 new server-side.
    var cutover = await ldb.getSyncState(CUTOVER_OK);
    if (!cutover) {
      var vTotals = { sent: 0, new: 0, dup: 0, rejected: 0 };
      var vf = await _uploadFrom(ldb, 0, "vf-" + Date.now(), vTotals);
      if (!vf.ok) return { ok: false, error: vf.error, status: vf.status, totals: totals };
      if (vTotals.new === 0) {
        await ldb.setSyncState(CUTOVER_OK, "1");
      } else {
        // rows landed mid-scan (or a hole) — cursor catches up; next sync re-verifies
        await ldb.setSyncState(UP_CURSOR, String(vf.cursor));
        totals.new += vTotals.new;
      }
    }
    return { ok: true, totals: totals };
  }

  // ── download ─────────────────────────────────────────────────────────────
  async function syncDown(ldb) {
    var since = (await ldb.getSyncState(DOWN_CURSOR)) || "";
    var addedKeys = new Set(); var markKeys = new Set(); var pulled = 0;
    for (;;) {
      var r = await jfetch("GET", "/api/learner/log?limit=" + BATCH_DOWN + (since ? "&since=" + encodeURIComponent(since) : ""));
      if (r.status !== 200 || !r.json || !r.json.ok) return { ok: false, status: r.status, error: (r.json && r.json.error) || "READ_FAILED" };
      var rows = r.json.rows || [];
      if (!rows.length) break;
      for (var i = 0; i < rows.length; i++) {
        var w = rows[i];
        // per-row existence pre-check: appendReviewLog's OR IGNORE can't tell new from dup,
        // and we need the NEW item_keys for the projection recompute (§4.3: before repaint).
        var isNew = !(await ldb.hasReviewLogRow(w.id));
        var res = await ldb.appendReviewLog({
          id: w.id, item_key: w.item_key, kind: w.kind, reviewed_at: w.reviewed_at,
          grade: w.grade, source: w.source, channel: w.channel, latency_ms: w.latency_ms,
          meta_json: w.meta_json,
        });
        if (isNew && res && res.accepted >= 1) {
          addedKeys.add(String(w.item_key)); pulled++;
          if (w.kind === "mark") markKeys.add(String(w.item_key));
        }
      }
      since = r.json.next_since || since;
      await ldb.setSyncState(DOWN_CURSOR, since);
      if (rows.length < BATCH_DOWN) break;
    }
    // §4.7 manual-axis LWW: a NEW foreign mark row may or may not be the newest — fold the FULL
    // merged log per key (last mark by reviewed_at,id) and apply WITHOUT re-emitting (suppressed).
    var lwwApplied = 0;
    if (markKeys.size && typeof ldb.lastMarkStatus === "function" && typeof ldb.applyWordStatusFromSync === "function") {
      for (const mk of markKeys) {
        try {
          var target = await ldb.lastMarkStatus(mk);
          if (target == null) continue;
          var cur = await ldb.getWordStatus(mk);
          if (String(cur || "") !== target) { await ldb.applyWordStatusFromSync(mk, target); lwwApplied++; }
        } catch (_) {}
      }
    }
    if (addedKeys.size && typeof ldb.recomputeSrsFromLog === "function") {
      try { await ldb.recomputeSrsFromLog(Array.from(addedKeys)); } catch (_) {}
    }
    return { ok: true, pulled: pulled, lwwApplied: lwwApplied, recomputedKeys: Array.from(addedKeys) };
  }

  // ── full cycle + reconciliation ──────────────────────────────────────────
  async function fullSync(ldb) {
    var session = await me();
    if (!session) return { ok: false, error: "UNAUTHENTICATED" };
    // §4.7 backfill at cutover: manual разметка asserted BEFORE mark-emission existed gets its
    // synthetic mark rows ONCE, so the historic axis rides the same log channel (idempotent).
    try {
      if (!(await ldb.getSyncState(CUTOVER_OK)) && typeof ldb.backfillMarkRows === "function") {
        await ldb.backfillMarkRows();
      }
    } catch (_) {}
    var up = await syncUp(ldb);
    if (!up.ok) return up;
    var down = await syncDown(ldb);
    if (!down.ok) return down;
    try { await ldb.setSyncState(LAST_SYNC, new Date().toISOString()); } catch (_) {}
    return { ok: true, up: up.totals, down: { pulled: down.pulled }, user: session.user };
  }
  // Permanent reconciliation (§4.3): after a full two-way sync the local log and the server log
  // are the SAME SET — compare counts; on mismatch re-verify-upload from 0 + full re-download.
  async function reconcile(ldb) {
    var counts = await jfetch("GET", "/api/learner/counts");
    if (counts.status !== 200 || !counts.json || !counts.json.ok) return { ok: false, error: "COUNTS_FAILED" };
    var localCount = await ldb.countReviewLog();
    if (Number(counts.json.review_log) === localCount) return { ok: true, equal: true, count: localCount };
    await ldb.setSyncState(CUTOVER_OK, "");            // force a fresh full-scan verify
    await ldb.setSyncState(DOWN_CURSOR, "");           // full re-download
    var again = await fullSync(ldb);
    if (!again.ok) return again;
    var counts2 = await jfetch("GET", "/api/learner/counts");
    var local2 = await ldb.countReviewLog();
    return { ok: true, equal: Number(counts2.json && counts2.json.review_log) === local2, count: local2 };
  }

  return {
    me: me, login: login, logout: logout,
    syncUp: syncUp, syncDown: syncDown, fullSync: fullSync, reconcile: reconcile,
    stripMeta: stripMeta,
    CONTENT_META_KEYS: CONTENT_META_KEYS,
    KEYS: { UP_CURSOR: UP_CURSOR, DOWN_CURSOR: DOWN_CURSOR, CUTOVER_OK: CUTOVER_OK, LAST_SYNC: LAST_SYNC },
  };
});
