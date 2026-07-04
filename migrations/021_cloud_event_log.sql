-- 021_cloud_event_log — CLG-P2 Cloud Event Log (AI_MENTOR_RECON_2026_07_04.md §6/§9 CLG-P2).
-- Two PARALLEL append-only streams (v3 критика B7 — review-факты живут ТОЛЬКО в review_log;
-- learner_events = телеметрия/аналитика, replay её никогда не читает).
--
-- Canon transition (§4.6): until the CLG-P3 lossless gate passes, this server copy is a MIRROR —
-- OPFS remains the operational source of truth. Nothing here is read by any learner-facing
-- decision yet (projections come in CLG-P4).
--
-- Uniqueness (§6, критика B1): client ids are content-deterministic but NOT user-scoped
-- ('seed:<item_key>' is literally 'seed:'+lemma) → PRIMARY KEY (user_id, id). All ingest
-- idempotency and existence pre-checks are user-scoped.
--
-- D3 (owner 2026-07-05): seed ids become content-hashed ('seed:<item_key>#<sha1(meta)>') when
-- the client starts minting them in CLG-P3; this schema stores BOTH forms verbatim (append-only,
-- ids are opaque here). The multi-seed replay rule (earliest-wins) lands in CLG-P4.
--
-- Envelope (§6): device_id comes from the authenticated session (never the body);
-- created-at semantics: reviewed_at/created_at_client = учебное время (canonical UTC-Z, validated
-- at ingest), ingested_at = аудит/sync only.

CREATE TABLE IF NOT EXISTS review_log (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id           TEXT NOT NULL,
  item_key     TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'review',   -- review | skip | seed | annul (annul: §1.3 carve-out (б))
  reviewed_at  TEXT NOT NULL,                    -- canonical UTC-Z (toISOString form)
  grade        INTEGER,                          -- 1..4 for review/skip; NULL for seed/annul
  source       TEXT NOT NULL,
  channel      TEXT,
  latency_ms   INTEGER,
  meta_json    TEXT NOT NULL DEFAULT '{}',       -- ALLOWLISTED keys only (§5 B5; enforced at ingest)
  device_id    TEXT,
  schema_version        INTEGER NOT NULL DEFAULT 1,
  source_client_version TEXT,
  keyer_version         INTEGER,
  ingested_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS ix_cloud_rl_user_item ON review_log(user_id, item_key, reviewed_at);
CREATE INDEX IF NOT EXISTS ix_cloud_rl_user_ingested ON review_log(user_id, ingested_at);

CREATE TABLE IF NOT EXISTS learner_events (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id           TEXT NOT NULL,
  type         TEXT NOT NULL,                    -- vocabulary enforced at ingest; review-facts FORBIDDEN (B7)
  payload_json TEXT NOT NULL DEFAULT '{}',       -- identifiers only (§5), size-capped
  created_at_client TEXT NOT NULL,               -- canonical UTC-Z
  device_id    TEXT,
  schema_version        INTEGER NOT NULL DEFAULT 1,
  source_client_version TEXT,
  ingested_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS ix_learner_ev_user_type ON learner_events(user_id, type, created_at_client);
CREATE INDEX IF NOT EXISTS ix_learner_ev_user_ingested ON learner_events(user_id, ingested_at);

-- Batch-level idempotency lives HERE, not in event rows (§6: конверт применяется к строкам,
-- батч-поля — в таблице пачек). A replayed batch returns its stored result verbatim.
CREATE TABLE IF NOT EXISTS ingest_batches (
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  device_id       TEXT,
  result_json     TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, idempotency_key)
);
