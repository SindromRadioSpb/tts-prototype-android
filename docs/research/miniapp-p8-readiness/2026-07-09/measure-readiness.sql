-- =============================================================================
-- CLG-P8 (Telegram Mini App) — READINESS MEASUREMENT QUERIES
-- =============================================================================
-- WHAT THIS IS: read-only SQL that fills the §3.2 "measured readiness" table of
--   docs/planning/TELEGRAM_MINI_APP_P8_RECON_2026_07_09.md.
--
-- WHY IT EXISTS SEPARATELY: the LOCAL dev DB (data/app.db) has ZERO owner rows in
--   every CLG/P7 table (review_log, agent_challenges, channel_links,
--   srs_projections, users = 0; only `sentences` is populated = shipped dataset).
--   The REAL owner learner-graph profile lives ONLY on the prod volume
--   (/app/data/app.db on the Hetzner host). These numbers therefore CANNOT be
--   produced locally and MUST be run against prod — an owner-gated action.
--
-- HOW TO RUN (owner, on prod host, read-only):
--   sqlite3 -readonly /app/data/app.db < measure-readiness.sql
--   (or copy the volume DB out and run locally; do NOT run write statements)
--
-- DISCIPLINE: this file emits DISTRIBUTIONS, not verdicts. Do NOT hardcode
--   overdue / almost-lapsed thresholds before seeing the histogram (§7,
--   measure-before-code). Thresholds are an owner fork set FROM these numbers.
--
-- SCHEMA PROVENANCE: every column referenced below was confirmed by reading
--   sqlite_master on data/app.db at commit-time of this recon (migrations 001–033).
-- =============================================================================
.headers on
.mode column

SELECT '===== 0. profile sanity =====' AS section;
SELECT COUNT(*) AS users, MIN(created_at) AS first_user FROM users;
SELECT status, COUNT(*) AS n FROM channel_links GROUP BY status;
SELECT consent_key, granted, consent_version, COUNT(*) AS n
  FROM consent_records WHERE purged_at IS NULL
  GROUP BY consent_key, granted, consent_version;

SELECT '===== 1. due volume (srs_projections) =====' AS section;
-- Total tracked items and how many are currently due.
SELECT
  COUNT(*)                                                              AS tracked_items,
  SUM(CASE WHEN due IS NOT NULL AND due <= strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 1 ELSE 0 END) AS due_now,
  SUM(CASE WHEN due IS NULL THEN 1 ELSE 0 END)                         AS no_due_yet
FROM srs_projections;

SELECT '===== 2. overdue distribution (set thresholds FROM this) =====' AS section;
-- Bucket by how many whole days OVERDUE (negative = not yet due). Feeds the
-- "overdue threshold" and "almost-lapsed predicate" owner forks (§7).
SELECT
  CASE
    WHEN due IS NULL THEN 'never_scheduled'
    WHEN julianday(strftime('%Y-%m-%dT%H:%M:%fZ','now')) - julianday(due) < -7 THEN 'due_in_>7d'
    WHEN julianday(strftime('%Y-%m-%dT%H:%M:%fZ','now')) - julianday(due) < 0  THEN 'due_within_7d'
    WHEN julianday(strftime('%Y-%m-%dT%H:%M:%fZ','now')) - julianday(due) < 1  THEN 'overdue_<1d'
    WHEN julianday(strftime('%Y-%m-%dT%H:%M:%fZ','now')) - julianday(due) < 3  THEN 'overdue_1-3d'
    WHEN julianday(strftime('%Y-%m-%dT%H:%M:%fZ','now')) - julianday(due) < 7  THEN 'overdue_3-7d'
    WHEN julianday(strftime('%Y-%m-%dT%H:%M:%fZ','now')) - julianday(due) < 21 THEN 'overdue_7-21d'
    ELSE 'overdue_>21d'
  END AS bucket,
  COUNT(*) AS n
FROM srs_projections
GROUP BY bucket
ORDER BY MIN(julianday(due));

SELECT '===== 3. memory-strength distribution (almost-lapsed signal) =====' AS section;
-- FSRS stability / lapses — an "almost-lapsed" predicate may key on low stability
-- and/or prior lapses rather than raw overdue days. Look before deciding.
SELECT
  CASE
    WHEN stability IS NULL THEN 'null'
    WHEN stability < 1  THEN 's<1'
    WHEN stability < 3  THEN 's_1-3'
    WHEN stability < 7  THEN 's_3-7'
    WHEN stability < 21 THEN 's_7-21'
    ELSE 's_>=21'
  END AS stability_bucket,
  COUNT(*) AS n,
  SUM(CASE WHEN lapses > 0 THEN 1 ELSE 0 END) AS with_prior_lapse
FROM srs_projections
GROUP BY stability_bucket;

SELECT '===== 4. review history by channel + kind (bot usage so far) =====' AS section;
-- channel encodes modality:surface (e.g. 'reverse:tg', 'cloze:tg', 'dictate:tg').
-- This shows how much real reviewing has happened through Telegram vs elsewhere,
-- and the modality mix — the baseline the Mini App must not cannibalize.
SELECT channel, kind, COUNT(*) AS n,
       ROUND(AVG(latency_ms)) AS avg_latency_ms,
       MIN(reviewed_at) AS first, MAX(reviewed_at) AS last
FROM review_log
GROUP BY channel, kind
ORDER BY n DESC;

SELECT '===== 5. reviews per day (completion cadence) =====' AS section;
SELECT substr(reviewed_at,1,10) AS day, channel, COUNT(*) AS reviews
FROM review_log WHERE kind='review'
GROUP BY day, channel ORDER BY day DESC LIMIT 60;

SELECT '===== 6. challenge lifecycle outcomes (abandonment proxy) =====' AS section;
-- status: active|processing|completed|declined|expired|cancelled. The ratio of
-- expired/cancelled to completed is the closest honest server-side abandonment
-- signal (true UI abandonment needs the Mini App telemetry that P8 will add).
SELECT status, review_mode, COUNT(*) AS n
FROM agent_challenges
GROUP BY status, review_mode ORDER BY n DESC;

SELECT '===== 7. context-anchor coverage of the challenge history =====' AS section;
-- Of challenges actually built, how many carried a source-sentence anchor
-- (anchor_text_key + anchor_order_index NOT NULL) vs lexeme-only. This is the
-- retrospective proxy for "% of items that CAN be shown context-first".
-- NOTE: the forward-looking "% of CURRENT due items with an available anchor"
-- depends on the builder's anchor-resolution logic (see recon §3.1, agent-2
-- findings) and is computed by a separate builder-driven probe, not pure SQL.
SELECT
  review_mode,
  COUNT(*) AS challenges,
  SUM(CASE WHEN anchor_text_key IS NOT NULL AND anchor_order_index IS NOT NULL THEN 1 ELSE 0 END) AS with_anchor,
  SUM(CASE WHEN expected_surface IS NOT NULL THEN 1 ELSE 0 END) AS with_expected_surface
FROM agent_challenges
GROUP BY review_mode;

SELECT '===== 8. stimulus exposure (cross-surface cooldown ledger) =====' AS section;
SELECT exposure_kind, COUNT(*) AS n, MAX(shown_at) AS last
FROM tg_stimulus_exposure GROUP BY exposure_kind;

SELECT '===== 9. select_reason mix (deterministic selector output) =====' AS section;
SELECT select_reason, COUNT(*) AS n
FROM agent_challenges WHERE select_reason IS NOT NULL
GROUP BY select_reason ORDER BY n DESC;

-- =============================================================================
-- PENDING (builder-driven, not pure SQL — see recon §3.1):
--   P1. % of CURRENT due items with a resolvable source sentence anchor
--   P2. % of CURRENT due items eligible for cloze / dictate / reverse assets
--   These require running the live context-first challenge builder over the due
--   set (homophone filter, vocalized-surface match, gloss strictness), NOT a
--   static join. Deferred to a builder probe once agent-2 anchor logic is mapped.
-- =============================================================================
