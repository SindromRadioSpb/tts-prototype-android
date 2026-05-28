// public/js/research.js — Direction 11.2 + 11.3 client.
//
// Privacy-preserving opt-in research mode. Mirrors the wire contract from
// docs/RESEARCH_METRICS_SCHEMA.md and pairs with server-side enforcement
// in research/storage.js + research/validate.js (Phase 11.4, commit 25b93b6).
//
// Privacy invariants (non-negotiable):
//   • Default OFF. Activation requires explicit consent click.
//   • Anonymous student_id (UUID v4 in localStorage.researchStudentId_v1).
//   • Aggregates only — no raw text, note bodies, search strings ever leave
//     this module's egress point (uploadPending → fetch).
//   • One-click withdrawal → DELETE /api/research/v1/student/<uuid> + local
//     cleanup, even if server unreachable (DELETE is queued for retry).
//   • Re-consent prompt fires when current consent doc version > the stored
//     researchConsentVersion_v1.
//
// Public surface (window.LinguistProResearch):
//   init()                    — boot hook (idempotent), schedules aggregator.
//   getState()                — { enabled, studentId, cohortCode, consentVersion, lastUploadDate, queueSize }.
//   acceptConsent(version)    — write researchConsentVersion_v1 + enable=true.
//   joinCohort(code)          — validate + write researchCohortCode_v1.
//   withdraw()                — DELETE + clear local state.
//   getRecentUploads(limit)   — array from researchUploadLog_v1.
//   getCurrentConsentVersion()— version this client expects (from CONSENT_VERSION).
//   _aggregateForRange(s,u)   — internal: build payload for [since, upload).
//   _uploadOnce(payload)      — internal: POST + handle status; returns result.
//   runDailyAggregator()      — manually trigger the daily aggregator (idempotent).
//   previewToday()            — pure (no upload, no state mutation): returns
//                                "what the next daily aggregator would send if
//                                it ran with today as a complete day". Powers
//                                the transparency UI's pending-upload preview.

(function () {
  'use strict';

  const LS = {
    enabled:          'researchEnabled_v1',
    studentId:        'researchStudentId_v1',
    cohortCode:       'researchCohortCode_v1',
    consentVersion:   'researchConsentVersion_v1',
    uploadLog:        'researchUploadLog_v1',
    uploadQueue:      'researchUploadQueue_v1',
    lastUploadDate:   'researchLastUploadDate_v1',
    nextRetryAt:      'researchNextRetryAt_v1',
  };

  // Bump this when docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md materially
  // changes (additions to "what we collect", retention extension, etc).
  // Re-consent is required when stored < CONSENT_VERSION.
  const CONSENT_VERSION = '1.0';

  const SCHEMA_FORMAT = 'linguistpro-research-v1';
  const ENDPOINT_METRICS  = '/api/research/v1/metrics';
  const ENDPOINT_DELETE   = (sid) => `/api/research/v1/student/${encodeURIComponent(sid)}`;

  // Aggregator cadence: opportunistic. We schedule an attempt:
  //   • shortly after init() (5s delay to let app boot settle)
  //   • every UPLOAD_CHECK_INTERVAL_MS thereafter
  // Each attempt is a no-op unless lastUploadDate < yesterday.
  const UPLOAD_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1h
  const POST_INIT_DELAY_MS = 5_000;

  // Retry backoff for transient failures (5xx / network). Schedule is
  // persisted in researchNextRetryAt_v1 so it survives reloads.
  const RETRY_BACKOFF_MS = [
    60_000,        // 1 min
    5  * 60_000,   // 5 min
    30 * 60_000,   // 30 min
    2  * 60 * 60_000, // 2h
  ];
  const MAX_QUEUE_SIZE = 30;
  const MAX_LOG_SIZE = 30;

  const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const COHORT_CODE_RE = /^[A-Z0-9-]{4,16}$/;

  // ── localStorage helpers ───────────────────────────────────────────────
  function lsGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch (_) { return fallback; }
  }
  function lsGetJson(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      if (v == null) return fallback;
      return JSON.parse(v);
    } catch (_) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (_) {}
  }
  function lsSetJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }
  function lsDel(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  // ── UUID v4 generator (crypto-quality, no external deps) ───────────────
  function generateUuidV4() {
    const c = (typeof crypto !== 'undefined' && crypto) || (typeof window !== 'undefined' && window.crypto);
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    // Fallback for very old browsers.
    const b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b);
    else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }

  // ── platform detection (no fingerprinting) ─────────────────────────────
  function detectPlatform() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    const isPwa = (typeof window !== 'undefined') &&
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
       (navigator && navigator.standalone === true));
    if (isPwa) return 'web/pwa';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'web/mobile-ios';
    if (/Android/i.test(ua)) return 'web/mobile-android';
    return 'web/desktop';
  }

  function readAppVersionFromPackage() {
    // Embedded at build/deploy time; the app today exposes it via meta tag
    // generated by the morphology build pipeline. Fall back to a stable
    // placeholder so the validator never trips on a missing semver.
    try {
      const meta = document.querySelector('meta[name="linguistpro-version"]');
      if (meta && meta.content) return String(meta.content);
    } catch (_) {}
    return '3.2.0';
  }

  // ── state ──────────────────────────────────────────────────────────────
  function getState() {
    return {
      enabled:        lsGet(LS.enabled, '') === '1',
      studentId:      lsGet(LS.studentId, '') || null,
      cohortCode:     lsGet(LS.cohortCode, '') || null,
      consentVersion: lsGet(LS.consentVersion, '') || null,
      lastUploadDate: lsGet(LS.lastUploadDate, '') || null,
      queueSize:      (lsGetJson(LS.uploadQueue, []) || []).length,
      logSize:        (lsGetJson(LS.uploadLog, []) || []).length,
      nextRetryAt:    Number(lsGet(LS.nextRetryAt, '0')) || 0,
    };
  }

  function ensureStudentId() {
    let sid = lsGet(LS.studentId, '');
    if (!sid || !UUID_RE.test(sid)) {
      sid = generateUuidV4();
      lsSet(LS.studentId, sid);
    }
    return sid;
  }

  function needsReconsent() {
    const stored = lsGet(LS.consentVersion, '');
    if (!stored) return true; // never consented
    return compareSemver(stored, CONSENT_VERSION) < 0;
  }

  // ── consent + cohort + withdrawal ──────────────────────────────────────
  function acceptConsent(version) {
    const v = String(version || CONSENT_VERSION);
    lsSet(LS.consentVersion, v);
    lsSet(LS.enabled, '1');
    ensureStudentId();
    return { ok: true, studentId: lsGet(LS.studentId, '') };
  }

  function joinCohort(code) {
    const c = String(code || '').trim().toUpperCase();
    if (!COHORT_CODE_RE.test(c)) {
      return { ok: false, error: 'BAD_COHORT_CODE', message: 'Cohort code must be 4–16 uppercase chars [A-Z0-9-].' };
    }
    lsSet(LS.cohortCode, c);
    return { ok: true, cohortCode: c };
  }

  function disable() {
    lsSet(LS.enabled, '');
  }

  async function withdraw() {
    const sid = lsGet(LS.studentId, '');
    const cohort = lsGet(LS.cohortCode, '');
    let serverOk = false;
    let serverError = null;
    if (sid && UUID_RE.test(sid)) {
      try {
        const qs = cohort ? `?cohort_code=${encodeURIComponent(cohort)}` : '';
        const resp = await fetch(ENDPOINT_DELETE(sid) + qs, { method: 'DELETE' });
        serverOk = resp.ok;
        if (!resp.ok) {
          try { const body = await resp.json(); serverError = body && body.error; } catch (_) { serverError = 'HTTP_' + resp.status; }
        }
      } catch (e) {
        // Network failure — queue the DELETE for retry on next online.
        serverError = 'NETWORK';
        const queue = lsGetJson(LS.uploadQueue, []) || [];
        queue.push({ kind: 'delete', sid, cohort, queuedAt: Date.now() });
        if (queue.length > MAX_QUEUE_SIZE) queue.splice(0, queue.length - MAX_QUEUE_SIZE);
        lsSetJson(LS.uploadQueue, queue);
      }
    }
    // Local cleanup ALWAYS happens — the user opted out, end of story.
    lsDel(LS.enabled);
    lsDel(LS.studentId);
    lsDel(LS.cohortCode);
    lsDel(LS.uploadLog);
    lsDel(LS.lastUploadDate);
    lsDel(LS.nextRetryAt);
    // Keep consentVersion as a passive audit signal so re-enable doesn't
    // ambiguously skip re-consent — but reset enabled so any future flow
    // re-affirms.
    return { ok: true, serverOk, serverError };
  }

  // ── helpers: dates ─────────────────────────────────────────────────────
  function isoDay(date) {
    const d = (date instanceof Date) ? date : new Date(date);
    return d.toISOString().slice(0, 10);
  }
  function todayIsoDay() { return isoDay(new Date()); }
  function yesterdayIsoDay() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return isoDay(d);
  }
  function tomorrowIsoDay() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    return isoDay(d);
  }
  function compareSemver(a, b) {
    const pa = String(a).split(/[-+]/)[0].split('.').map((x) => Number(x) || 0);
    const pb = String(b).split(/[-+]/)[0].split('.').map((x) => Number(x) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const ai = pa[i] || 0;
      const bi = pb[i] || 0;
      if (ai !== bi) return ai < bi ? -1 : 1;
    }
    return 0;
  }

  // ── aggregator ─────────────────────────────────────────────────────────
  // Build a daily-aggregate payload for window [sinceTs, uploadTs] from the
  // events table. Strict adherence to RESEARCH_METRICS_SCHEMA.md — no raw
  // text, search strings, or note bodies ever placed in fields.

  async function _q(sql, params) {
    // Resolve local-db at call time (it loads lazily during boot).
    const ldb = (typeof window !== 'undefined') && window.__localDB;
    if (!ldb || typeof ldb.dbQuery !== 'function') {
      throw new Error('research: local-db not ready');
    }
    return ldb.dbQuery(sql, params || []);
  }

  async function _aggregateForRange(sinceIsoDay, uploadIsoDay) {
    // Time-range filter: events.ts is ISO 8601 string; we compare lexicographically
    // by including the full prefix `YYYY-MM-DD`. Window is inclusive at both ends
    // by clamping to start-of-day and end-of-day strings.
    const sinceTs = sinceIsoDay + 'T00:00:00.000Z';
    const untilTs = uploadIsoDay + 'T23:59:59.999Z';

    // Sessions + active days.
    const sessRows = await _q(
      `SELECT
         SUM(CASE WHEN event_type = 'session_start' THEN 1 ELSE 0 END) AS sessions,
         COUNT(DISTINCT substr(ts, 1, 10))            AS active_days
       FROM events
       WHERE event_type IN ('session_start', 'session_heartbeat', 'session_end')
         AND ts >= ? AND ts <= ?`,
      [sinceTs, untilTs]
    );
    const sessRow = sessRows[0] || {};
    const sessions_count = Number(sessRow.sessions || 0);
    const active_days_count = Number(sessRow.active_days || 0);

    // Active minutes (heartbeat + session_end precision overlay).
    let active_ms_real = 0;
    try {
      const ldb = window.__localDB;
      if (ldb && typeof ldb.getActiveMsReal === 'function') {
        active_ms_real = await ldb.getActiveMsReal({ sinceIso: sinceTs });
      }
    } catch (_) {}
    const active_minutes_real = Math.round(active_ms_real / 60000);

    // Time-of-day histogram (24 buckets) — by hour of session_start ts.
    const hourRows = await _q(
      `SELECT substr(ts, 12, 2) AS hour, COUNT(*) AS n
       FROM events
       WHERE event_type = 'session_start'
         AND ts >= ? AND ts <= ?
       GROUP BY substr(ts, 12, 2)`,
      [sinceTs, untilTs]
    );
    const time_of_day_histogram = {};
    for (const row of hourRows) {
      const h = String(Number(row.hour || 0)); // strip leading zero (validator wants 0..23)
      time_of_day_histogram[h] = Number(row.n || 0);
    }

    // Volume metrics from the 12-event-type set established in Phase 11.0.
    const textOpenRows = await _q(
      `SELECT COUNT(DISTINCT text_id) AS distinct_, COUNT(*) AS total_
       FROM events
       WHERE event_type = 'text_open'
         AND ts >= ? AND ts <= ?`,
      [sinceTs, untilTs]
    );
    const texts_opened_distinct = Number((textOpenRows[0] || {}).distinct_ || 0);
    const texts_opened_total    = Number((textOpenRows[0] || {}).total_    || 0);

    const sentRows = await _q(
      `SELECT COUNT(DISTINCT sentence_id) AS distinct_, COUNT(*) AS total_
       FROM events
       WHERE event_type IN ('row_tts', 'play_audio')
         AND ts >= ? AND ts <= ?`,
      [sinceTs, untilTs]
    );
    const sentences_read_distinct = Number((sentRows[0] || {}).distinct_ || 0);
    const sentences_read_total    = Number((sentRows[0] || {}).total_    || 0);

    // Audio playback ms — sum payload_json.duration_ms across play_audio.
    const audioRows = await _q(
      `SELECT payload_json FROM events
       WHERE event_type = 'play_audio' AND ts >= ? AND ts <= ?`,
      [sinceTs, untilTs]
    );
    let audio_play_ms_total = 0;
    const replayBuckets = { '1': 0, '2': 0, '3': 0, '4plus': 0 };
    for (const row of audioRows) {
      try {
        const obj = JSON.parse(row.payload_json || '{}');
        audio_play_ms_total += Math.max(0, Number(obj.duration_ms) || 0);
        const rc = Number(obj.replay_count) || 1;
        if (rc <= 1) replayBuckets['1']++;
        else if (rc === 2) replayBuckets['2']++;
        else if (rc === 3) replayBuckets['3']++;
        else replayBuckets['4plus']++;
      } catch (_) {}
    }

    // SRS metrics.
    const srsRows = await _q(
      `SELECT payload_json FROM events
       WHERE event_type = 'srs_review' AND ts >= ? AND ts <= ?`,
      [sinceTs, untilTs]
    );
    let cards_reviewed = 0, cards_correct = 0, cards_again = 0;
    for (const row of srsRows) {
      cards_reviewed++;
      try {
        const obj = JSON.parse(row.payload_json || '{}');
        const g = String(obj.grade || '').toLowerCase();
        if (g === 'again') cards_again++;
        else if (g === 'good' || g === 'easy') cards_correct++;
      } catch (_) {}
    }
    const srs_error_rate = cards_reviewed > 0
      ? Math.round((cards_again / cards_reviewed) * 100) / 100
      : 0;

    const addedRows = await _q(
      `SELECT COUNT(*) AS n FROM events
       WHERE event_type = 'card_added_to_srs' AND ts >= ? AND ts <= ?`,
      [sinceTs, untilTs]
    );
    const cards_added_to_srs = Number((addedRows[0] || {}).n || 0);

    // Notes metrics — counts only (no body, no titles).
    const notesCreatedRows = await _q(
      `SELECT COUNT(*) AS n FROM events
       WHERE event_type = 'save_note' AND ts >= ? AND ts <= ?`,
      [sinceTs, untilTs]
    );
    const notes_created = Number((notesCreatedRows[0] || {}).n || 0);

    const notesEditedRows = await _q(
      `SELECT COUNT(*) AS n FROM events
       WHERE event_type = 'note_edit' AND ts >= ? AND ts <= ?`,
      [sinceTs, untilTs]
    );
    const notes_edited = Number((notesEditedRows[0] || {}).n || 0);

    // Search queries — count only (the query strings themselves never enter
    // events.payload_json per the Phase 11.0 privacy invariant).
    const searchRows = await _q(
      `SELECT COUNT(*) AS n FROM events
       WHERE event_type = 'search_query' AND ts >= ? AND ts <= ?`,
      [sinceTs, untilTs]
    );
    const search_queries_count = Number((searchRows[0] || {}).n || 0);

    // Smart-tag overrides.
    const tagRows = await _q(
      `SELECT COUNT(*) AS n FROM events
       WHERE event_type = 'smart_tag_override' AND ts >= ? AND ts <= ?`,
      [sinceTs, untilTs]
    );
    const smart_tag_overrides_count = Number((tagRows[0] || {}).n || 0);

    // Translit toggle count.
    const trRows = await _q(
      `SELECT COUNT(*) AS n FROM events
       WHERE event_type = 'translit_toggle' AND ts >= ? AND ts <= ?`,
      [sinceTs, untilTs]
    );
    const translit_toggles_count = Number((trRows[0] || {}).n || 0);

    // V3 (CVP) supplementary engagement metrics — passive listening and
    // passive reading exposure, derived from already-collected events.
    // Implementation in public/db/local-db.js; thesis §6.7 multitrait-
    // multimethod report. Pre-registered on OSF deviation log §9.4.
    const audio_exposure_minutes = Math.round((audio_play_ms_total || 0) / 60000);
    let text_exposure_minutes = 0;
    try {
      if (typeof ldb.getTextExposureMs === 'function') {
        const tms = await ldb.getTextExposureMs({ sinceIso: sinceTs });
        text_exposure_minutes = Math.round((tms || 0) / 60000);
      }
    } catch (_) { /* CVP supplementary; never block primary aggregation */ }

    const metrics = {
      // Layer 1
      sessions_count,
      active_minutes_real,
      active_days_count,
      time_of_day_histogram,
      // Layer 2
      texts_opened_distinct,
      texts_opened_total,
      sentences_read_distinct,
      sentences_read_total,
      audio_play_ms_total,
      audio_exposure_minutes,           // V3 CVP — passive listening proxy
      text_exposure_minutes,            // V3 CVP — passive reading proxy
      cards_reviewed,
      cards_added_to_srs,
      notes_created,
      notes_edited,
      search_queries_count,
      // Layer 3
      cards_correct,
      cards_again,
      srs_error_rate,
      smart_tag_overrides_count,
      // Layer 4
      translit_toggles_count,
      audio_replay_distribution: replayBuckets,
    };

    return {
      format: SCHEMA_FORMAT,
      student_id: ensureStudentId(),
      cohort_code: lsGet(LS.cohortCode, '') || null,
      upload_ts: uploadIsoDay,
      since_ts: sinceIsoDay,
      consent_version: lsGet(LS.consentVersion, '') || CONSENT_VERSION,
      context: { app_version: readAppVersionFromPackage(), platform: detectPlatform() },
      metrics,
    };
  }

  // ── uploader ───────────────────────────────────────────────────────────
  async function _uploadOnce(payload) {
    // Returns { ok, status, dedupe?, error? } for the route handler in the
    // aggregator to decide retry behavior.
    let resp;
    try {
      resp = await fetch(ENDPOINT_METRICS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        // No credentials — research-mode does not authenticate against the
        // app's regular session machinery. student_id is the implicit token.
        credentials: 'omit',
      });
    } catch (e) {
      return { ok: false, status: 0, error: 'NETWORK', message: String((e && e.message) || e) };
    }
    let body = null;
    try { body = await resp.json(); } catch (_) { body = null; }
    if (resp.ok) {
      return { ok: true, status: resp.status, stored: !!(body && body.stored), dedupe: !!(body && body.dedupe), remaining: body && body.rate_limit_remaining };
    }
    return {
      ok: false,
      status: resp.status,
      error: (body && body.error) || ('HTTP_' + resp.status),
      field: body && body.field,
      message: body && body.message,
    };
  }

  function appendLog(entry) {
    const log = lsGetJson(LS.uploadLog, []) || [];
    log.push(entry);
    if (log.length > MAX_LOG_SIZE) log.splice(0, log.length - MAX_LOG_SIZE);
    lsSetJson(LS.uploadLog, log);
  }

  function getRecentUploads(limit = MAX_LOG_SIZE) {
    const log = lsGetJson(LS.uploadLog, []) || [];
    const lim = Math.max(1, Math.min(MAX_LOG_SIZE, Number(limit) || MAX_LOG_SIZE));
    return log.slice(-lim).reverse();
  }

  function scheduleRetry(attemptIdx) {
    const idx = Math.min(attemptIdx, RETRY_BACKOFF_MS.length - 1);
    lsSet(LS.nextRetryAt, String(Date.now() + RETRY_BACKOFF_MS[idx]));
  }

  function clearRetry() { lsDel(LS.nextRetryAt); }

  // Main loop: idempotent. Will:
  //   1. No-op if disabled, no studentId, no cohort, or no events to aggregate.
  //   2. No-op if researchNextRetryAt_v1 > now (backoff).
  //   3. Determine since_ts (lastUploadDate or earliest event date or yesterday).
  //   4. Aggregate for [since, today-1] (we never upload "today" — it's not
  //      a complete day; wait until tomorrow).
  //   5. Upload via _uploadOnce; persist log + lastUploadDate or schedule retry.

  async function runDailyAggregator(opts) {
    const state = getState();
    if (!state.enabled || !state.studentId || !state.cohortCode) {
      return { ok: false, skipped: 'NOT_ENABLED' };
    }
    if (needsReconsent()) {
      return { ok: false, skipped: 'RECONSENT_NEEDED' };
    }
    const now = Date.now();
    if (state.nextRetryAt && now < state.nextRetryAt) {
      return { ok: false, skipped: 'BACKOFF', retryAt: state.nextRetryAt };
    }

    const uploadDay = (opts && opts.uploadDay) || yesterdayIsoDay();
    // since: last upload + 1, or events.min(date), or uploadDay (single-day window).
    let sinceDay = state.lastUploadDate || null;
    if (sinceDay) {
      // Advance to the day AFTER the last upload (we already covered that day).
      const d = new Date(sinceDay + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      sinceDay = isoDay(d);
    } else {
      // No prior upload — pick earliest event date in window or fall back
      // to uploadDay itself (single-day window).
      try {
        const earliest = await _q(`SELECT MIN(substr(ts, 1, 10)) AS first_day FROM events`);
        sinceDay = (earliest[0] && earliest[0].first_day) || uploadDay;
      } catch (_) {
        sinceDay = uploadDay;
      }
    }
    if (sinceDay > uploadDay) {
      return { ok: false, skipped: 'NOTHING_NEW', sinceDay, uploadDay };
    }

    let payload;
    try {
      payload = await _aggregateForRange(sinceDay, uploadDay);
    } catch (e) {
      return { ok: false, skipped: 'AGGREGATE_ERROR', error: String((e && e.message) || e) };
    }

    const result = await _uploadOnce(payload);

    if (result.ok) {
      clearRetry();
      lsSet(LS.lastUploadDate, uploadDay);
      appendLog({
        upload_ts: uploadDay,
        since_ts: sinceDay,
        sent_at: new Date().toISOString(),
        dedupe: !!result.dedupe,
        stored: !!result.stored,
        bytes: JSON.stringify(payload).length,
        metric_summary: {
          active_minutes_real: payload.metrics.active_minutes_real,
          audio_play_ms_total: payload.metrics.audio_play_ms_total,
          sessions_count: payload.metrics.sessions_count,
          cards_reviewed: payload.metrics.cards_reviewed,
          notes_created: payload.metrics.notes_created,
        },
      });
      return { ok: true, status: result.status, dedupe: result.dedupe, stored: result.stored };
    }

    // Decide retry vs hard-fail.
    if (result.status === 400) {
      // Schema violation or consent below min — hard fail. Don't retry; log.
      appendLog({
        upload_ts: uploadDay,
        since_ts: sinceDay,
        sent_at: new Date().toISOString(),
        error: result.error,
        field: result.field,
        message: result.message,
      });
      clearRetry();
      return { ok: false, status: 400, error: result.error, field: result.field };
    }
    if (result.status === 404) {
      // Cohort not found — leave enabled state alone, but log + clear retry.
      // The user should join a different cohort or contact teacher.
      appendLog({
        upload_ts: uploadDay,
        since_ts: sinceDay,
        sent_at: new Date().toISOString(),
        error: 'COHORT_NOT_FOUND',
      });
      clearRetry();
      return { ok: false, status: 404, error: 'COHORT_NOT_FOUND' };
    }
    if (result.status === 429) {
      // Rate-limited — backoff for an hour-ish.
      scheduleRetry(2); // 30 min slot
      return { ok: false, status: 429, error: 'RATE_LIMIT' };
    }
    // 5xx or network: queue + backoff escalating.
    const queue = lsGetJson(LS.uploadQueue, []) || [];
    queue.push({ kind: 'metrics', payload, queuedAt: Date.now() });
    if (queue.length > MAX_QUEUE_SIZE) queue.splice(0, queue.length - MAX_QUEUE_SIZE);
    lsSetJson(LS.uploadQueue, queue);
    const attemptIdx = Math.min(queue.length - 1, RETRY_BACKOFF_MS.length - 1);
    scheduleRetry(attemptIdx);
    return { ok: false, status: result.status, error: result.error, queued: true };
  }

  // Pure preview: build today's pending-upload payload WITHOUT uploading,
  // WITHOUT mutating any local state (no log entry, no lastUploadDate change,
  // no queue push, no retry scheduling). Used by the transparency UI to show
  // the user what their next aggregator run will send.
  //
  // Returns:
  //   { ok: true,  reason: null,           sinceDay, uploadDay, willUploadOn,
  //                metrics, payloadBytes }
  //   { ok: false, reason: 'NOT_ENABLED' | 'NOT_JOINED' | 'RECONSENT_NEEDED'
  //                       | 'AGGREGATE_ERROR', sinceDay, uploadDay, willUploadOn,
  //                metrics: null, payloadBytes: 0, message? }
  //
  // Range semantics mirror runDailyAggregator exactly so preview = "what would
  // be sent if today's aggregator fired right now and treated today as a
  // complete day". sinceDay = lastUploadDate + 1 (or earliest event day, or
  // today). uploadDay = today. Range is clamped so sinceDay never exceeds
  // uploadDay (i.e. if last upload already covered today, preview window is
  // empty rather than negative).
  async function previewToday() {
    const uploadDay = todayIsoDay();
    const willUploadOn = tomorrowIsoDay();
    const state = getState();
    const baseSkip = (reason) => ({
      ok: false, reason, sinceDay: uploadDay, uploadDay, willUploadOn,
      metrics: null, payloadBytes: 0,
    });
    if (!state.enabled || !state.studentId) return baseSkip('NOT_ENABLED');
    if (!state.cohortCode)                  return baseSkip('NOT_JOINED');
    if (needsReconsent())                    return baseSkip('RECONSENT_NEEDED');

    // Resolve sinceDay using the same rules as runDailyAggregator, clamped
    // upward to uploadDay (today) so the preview window is always sane.
    let sinceDay = state.lastUploadDate || null;
    if (sinceDay) {
      const d = new Date(sinceDay + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      sinceDay = isoDay(d);
    } else {
      try {
        const earliest = await _q(`SELECT MIN(substr(ts, 1, 10)) AS first_day FROM events`);
        sinceDay = (earliest[0] && earliest[0].first_day) || uploadDay;
      } catch (_) {
        sinceDay = uploadDay;
      }
    }
    if (sinceDay > uploadDay) sinceDay = uploadDay; // clamp: empty window > negative window

    let payload;
    try {
      payload = await _aggregateForRange(sinceDay, uploadDay);
    } catch (e) {
      return {
        ok: false, reason: 'AGGREGATE_ERROR',
        sinceDay, uploadDay, willUploadOn,
        metrics: null, payloadBytes: 0,
        message: String((e && e.message) || e),
      };
    }

    return {
      ok: true, reason: null,
      sinceDay, uploadDay, willUploadOn,
      metrics: payload.metrics,
      payloadBytes: JSON.stringify(payload).length,
    };
  }

  // Phase 11.6 §11.6.1 — student self-report exam score. ONE-OFF POST
  // /api/research/v1/metrics with metrics.outcome populated; the regular
  // daily aggregator continues independently. Server merges into outcomes
  // (CSV upload from teacher overrides, since teacher is authoritative).
  async function submitOutcome({ post_test_score, confidence_self_report } = {}) {
    const state = getState();
    if (!state.enabled || !state.studentId || !state.cohortCode) {
      return { ok: false, error: "NOT_ENABLED" };
    }
    if (needsReconsent()) {
      return { ok: false, error: "RECONSENT_NEEDED" };
    }
    const post = post_test_score != null ? Number(post_test_score) : null;
    if (post != null && (!Number.isFinite(post) || post < 0)) {
      return { ok: false, error: "BAD_SCORE", message: "post_test_score must be a non-negative number or null" };
    }
    const conf = confidence_self_report != null ? Math.round(Number(confidence_self_report)) : null;
    if (conf != null && (!Number.isInteger(conf) || conf < 1 || conf > 5)) {
      return { ok: false, error: "BAD_CONFIDENCE", message: "confidence_self_report must be int 1..5 or null" };
    }
    const today = todayIsoDay();
    const payload = {
      format: SCHEMA_FORMAT,
      student_id: ensureStudentId(),
      cohort_code: state.cohortCode,
      upload_ts: today,
      since_ts: today,
      consent_version: state.consentVersion || CONSENT_VERSION,
      context: { app_version: readAppVersionFromPackage(), platform: detectPlatform() },
      metrics: {
        outcome: {
          ...(post != null ? { post_test_score: post } : {}),
          ...(conf != null ? { confidence_self_report: conf } : {}),
          outcome_capture_method: "self-report",
        },
      },
    };
    const result = await _uploadOnce(payload);
    if (result.ok) {
      appendLog({
        upload_ts: today,
        since_ts: today,
        sent_at: new Date().toISOString(),
        dedupe: !!result.dedupe,
        stored: !!result.stored,
        bytes: JSON.stringify(payload).length,
        outcome_submission: true,
        metric_summary: { outcome_post_test_score: post, outcome_confidence: conf },
      });
      return { ok: true, dedupe: result.dedupe };
    }
    appendLog({
      upload_ts: today,
      since_ts: today,
      sent_at: new Date().toISOString(),
      error: result.error,
      field: result.field,
      outcome_submission: true,
    });
    return { ok: false, status: result.status, error: result.error, message: result.message, field: result.field };
  }

  // ── v3.3.5 Direction 13 — calibrated-quiz outcome submission ───────────
  //
  // Wire shape per docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md §9:
  //
  //   POST /api/research/v1/metrics
  //   body.metrics.outcome = {
  //     quiz_score_normalized:  number 0-100,
  //     quiz_cefr_band:         "A1" | "A2" | "B1" | "B2" | "C1",
  //     quiz_se:                number ≥ 0,
  //     quiz_completed_at:      ISO day (YYYY-MM-DD),
  //     quiz_version:           "^[a-z0-9_]+_v\d+$",
  //     outcome_capture_method: "calibrated-quiz",
  //   }
  //
  // Privacy invariant: item-level responses are never accepted. The caller
  // (quiz-ui.js) has already stripped responses_transient from the payload
  // by the time it reaches this function; we double-check here and reject
  // any payload containing item-level keys.
  const QUIZ_BAND_ENUM = new Set(["A1", "A2", "B1", "B2", "C1"]);
  const QUIZ_VERSION_RE = /^[a-z0-9_]+_v\d+$/;
  const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const QUIZ_ITEM_KEY_RE = /^Q\d{2}$/;

  async function submitQuizOutcome(payload = {}) {
    const state = getState();
    if (!state.enabled || !state.studentId || !state.cohortCode) {
      return { ok: false, error: "NOT_ENABLED" };
    }
    if (needsReconsent()) {
      return { ok: false, error: "RECONSENT_NEEDED" };
    }

    // Defensive: refuse anything that smells like a per-item leak.
    const keys = Object.keys(payload || {});
    for (const k of keys) {
      if (QUIZ_ITEM_KEY_RE.test(k) || k === "responses_transient") {
        return { ok: false, error: "ITEM_LEVEL_LEAK", field: k,
                 message: "submitQuizOutcome refuses per-item keys" };
      }
    }

    const score = payload.quiz_score_normalized;
    if (!Number.isFinite(Number(score)) || score < 0 || score > 100) {
      return { ok: false, error: "BAD_SCORE", message: "quiz_score_normalized must be number in [0,100]" };
    }
    const band = payload.quiz_cefr_band;
    if (!QUIZ_BAND_ENUM.has(band)) {
      return { ok: false, error: "BAD_BAND", message: "quiz_cefr_band must be one of A1,A2,B1,B2,C1" };
    }
    const se = payload.quiz_se;
    if (!Number.isFinite(Number(se)) || se < 0) {
      return { ok: false, error: "BAD_SE", message: "quiz_se must be non-negative number" };
    }
    const completedAt = payload.quiz_completed_at;
    if (!ISO_DAY_RE.test(String(completedAt || ""))) {
      return { ok: false, error: "BAD_COMPLETED_AT", message: "quiz_completed_at must be ISO day YYYY-MM-DD" };
    }
    const version = payload.quiz_version;
    if (!QUIZ_VERSION_RE.test(String(version || ""))) {
      return { ok: false, error: "BAD_VERSION", message: "quiz_version must match ^[a-z0-9_]+_v\\d+$" };
    }
    if (payload.outcome_capture_method && payload.outcome_capture_method !== "calibrated-quiz") {
      return { ok: false, error: "BAD_METHOD", message: "outcome_capture_method must be 'calibrated-quiz' for this path" };
    }

    const today = todayIsoDay();
    const wire = {
      format: SCHEMA_FORMAT,
      student_id: ensureStudentId(),
      cohort_code: state.cohortCode,
      upload_ts: today,
      since_ts: today,
      consent_version: state.consentVersion || CONSENT_VERSION,
      context: { app_version: readAppVersionFromPackage(), platform: detectPlatform() },
      metrics: {
        outcome: {
          quiz_score_normalized: Number(score),
          quiz_cefr_band: band,
          quiz_se: Number(se),
          quiz_completed_at: completedAt,
          quiz_version: version,
          outcome_capture_method: "calibrated-quiz",
        },
      },
    };
    const result = await _uploadOnce(wire);
    if (result.ok) {
      appendLog({
        upload_ts: today,
        since_ts: today,
        sent_at: new Date().toISOString(),
        dedupe: !!result.dedupe,
        stored: !!result.stored,
        bytes: JSON.stringify(wire).length,
        outcome_submission: true,
        quiz_submission: true,
        metric_summary: { quiz_score: Number(score), quiz_band: band },
      });
      return { ok: true, dedupe: result.dedupe };
    }
    appendLog({
      upload_ts: today,
      since_ts: today,
      sent_at: new Date().toISOString(),
      error: result.error,
      field: result.field,
      outcome_submission: true,
      quiz_submission: true,
    });
    return { ok: false, status: result.status, error: result.error, message: result.message, field: result.field };
  }

  // Pump the queue: try queued metric uploads + delete retries. Called on
  // each aggregator tick.
  async function _drainQueue() {
    const queue = lsGetJson(LS.uploadQueue, []) || [];
    if (!queue.length) return;
    const remaining = [];
    for (const item of queue) {
      if (item.kind === 'delete') {
        try {
          const qs = item.cohort ? `?cohort_code=${encodeURIComponent(item.cohort)}` : '';
          const r = await fetch(ENDPOINT_DELETE(item.sid) + qs, { method: 'DELETE' });
          if (!r.ok) remaining.push(item);
        } catch (_) { remaining.push(item); }
      } else if (item.kind === 'metrics') {
        const r = await _uploadOnce(item.payload);
        if (r.ok) {
          appendLog({
            upload_ts: item.payload.upload_ts,
            since_ts: item.payload.since_ts,
            sent_at: new Date().toISOString(),
            dedupe: !!r.dedupe,
            stored: !!r.stored,
            bytes: JSON.stringify(item.payload).length,
            replayed: true,
            metric_summary: {
              active_minutes_real: item.payload.metrics.active_minutes_real,
              audio_play_ms_total: item.payload.metrics.audio_play_ms_total,
            },
          });
        } else if (r.status === 400 || r.status === 404) {
          // Drop — hard-fail.
          appendLog({
            upload_ts: item.payload.upload_ts,
            since_ts: item.payload.since_ts,
            sent_at: new Date().toISOString(),
            error: r.error,
            field: r.field,
            dropped: true,
          });
        } else {
          remaining.push(item);
        }
      }
    }
    lsSetJson(LS.uploadQueue, remaining);
  }

  // ── boot ───────────────────────────────────────────────────────────────
  let _bootTimer = null;
  let _intervalTimer = null;

  function init() {
    if (_bootTimer || _intervalTimer) return; // already initialized
    _bootTimer = setTimeout(async () => {
      _bootTimer = null;
      try {
        await _drainQueue();
        await runDailyAggregator();
      } catch (e) {
        console.warn('[research] init aggregator failed:', e && e.message);
      }
    }, POST_INIT_DELAY_MS);
    _intervalTimer = setInterval(async () => {
      try {
        await _drainQueue();
        await runDailyAggregator();
      } catch (e) {
        console.warn('[research] periodic aggregator failed:', e && e.message);
      }
    }, UPLOAD_CHECK_INTERVAL_MS);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', async () => {
        try { await _drainQueue(); } catch (_) {}
      });
    }
  }

  function stop() {
    if (_bootTimer) { clearTimeout(_bootTimer); _bootTimer = null; }
    if (_intervalTimer) { clearInterval(_intervalTimer); _intervalTimer = null; }
  }

  function getCurrentConsentVersion() { return CONSENT_VERSION; }

  // ── expose ─────────────────────────────────────────────────────────────
  const api = {
    init,
    stop,
    getState,
    acceptConsent,
    joinCohort,
    disable,
    withdraw,
    needsReconsent,
    getRecentUploads,
    getCurrentConsentVersion,
    runDailyAggregator,
    submitOutcome,
    submitQuizOutcome,
    previewToday,
    // internals exposed for testing only — UI should not call these
    _aggregateForRange,
    _uploadOnce,
    _drainQueue,
    _lsKeys: LS,
    _ENDPOINTS: { metrics: ENDPOINT_METRICS, delete: ENDPOINT_DELETE },
  };
  if (typeof window !== 'undefined') {
    window.LinguistProResearch = api;
  }
})();
