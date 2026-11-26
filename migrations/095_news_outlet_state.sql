-- News sources expansion W1–W2 (docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md §4, §6, §8):
-- the owner's switch and the harvest state of each outlet of the catalog (public/js/news-outlets.js), the journal
-- of switches, the revocable keys of the home PC and the batches it has sent (one answer per batch_id).
CREATE TABLE IF NOT EXISTS news_outlet_state (
  outlet_id      TEXT PRIMARY KEY,
  enabled        INTEGER NOT NULL DEFAULT 0,
  route          TEXT NOT NULL DEFAULT 'server' CHECK(route IN ('server','home_pc')),
  probe_json     TEXT,
  probe_at       TEXT,
  last_ok_at     TEXT,
  last_error     TEXT,
  last_error_at  TEXT,
  enabled_at     TEXT,
  updated_by     TEXT,
  updated_at     TEXT
);
CREATE TABLE IF NOT EXISTS news_outlet_journal (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_id    TEXT NOT NULL,
  action       TEXT NOT NULL,
  actor        TEXT NOT NULL,
  at           TEXT NOT NULL,
  detail_json  TEXT
);
CREATE INDEX IF NOT EXISTS ix_news_outlet_journal_outlet ON news_outlet_journal(outlet_id, at);
CREATE TABLE IF NOT EXISTS news_relay_keys (
  key_id        TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  key_sha256    TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  revoked_at    TEXT,
  last_used_at  TEXT
);
CREATE TABLE IF NOT EXISTS news_relay_batches (
  batch_id      TEXT PRIMARY KEY,
  key_id        TEXT NOT NULL,
  outlet_id     TEXT NOT NULL,
  harvested_at  TEXT NOT NULL,
  received_at   TEXT NOT NULL,
  result_json   TEXT NOT NULL
);
-- The outlets harvested before this migration keep going; C14 comes from the home PC; mako has no harvester.
INSERT OR IGNORE INTO news_outlet_state(outlet_id, enabled, route) VALUES
  ('ynet', 1, 'server'), ('walla', 1, 'server'), ('maariv', 1, 'server'), ('n12', 1, 'server'), ('haaretz', 1, 'server'),
  ('c14', 1, 'home_pc'), ('mako', 0, 'server');
