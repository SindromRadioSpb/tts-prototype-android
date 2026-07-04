-- 020_identity — CLG-P1 Identity & Account Layer (AI_MENTOR_RECON_2026_07_04.md §9 CLG-P1, §13.1).
-- Owner-only bootstrap on a FULL multi-tenant schema: every learner-facing table from CLG-P2 on
-- will carry user_id; identity/session/consent/audit live here from day one.
--
-- Deletion semantics (recon §1.3 carve-out (а) forget-the-stream + §11 deletion-journal):
--   account delete = physical deletion of the user's ENTIRE stream (children via ON DELETE CASCADE
--   or the dynamic user_id-table sweep in identityRepo). deletion_journal is the ONE deliberate
--   exemption from the "no table keeps this user_id" completeness gate — it is the GDPR Art.17
--   record of erasure, kept outside the restore scope and replayed after any backup restore so a
--   restore can never resurrect a deleted account (recon §11).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  role          TEXT NOT NULL DEFAULT 'owner',
  display_name  TEXT,
  email         TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at  TEXT,
  revoked_at    TEXT
);
CREATE INDEX IF NOT EXISTS ix_devices_user ON devices(user_id);

-- Session secret is NEVER stored: cookie carries "<id>.<secret>", the row keeps sha256(secret).
-- csrf_token is the double-submit value required on every cookie-authenticated mutation
-- (X-LP-CSRF header) — the server.js:369 "no sessions → no CSRF" invariant is retired by this
-- table (recon v3, критика M-R14).
CREATE TABLE IF NOT EXISTS user_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id     TEXT REFERENCES devices(id) ON DELETE SET NULL,
  token_hash    TEXT NOT NULL,
  csrf_token    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at    TEXT NOT NULL,
  last_used_at  TEXT,
  revoked_at    TEXT,
  ip            TEXT,
  user_agent    TEXT
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON user_sessions(user_id);

-- Consent history (recon §5): every grant/revoke is a ROW (append-only history, never an update);
-- purged_at records when the revoke-purge actually executed (recon §5 revoke semantics).
CREATE TABLE IF NOT EXISTS consent_records (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_key     TEXT NOT NULL,
  granted         INTEGER NOT NULL,
  consent_version TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  purged_at       TEXT
);
CREATE INDEX IF NOT EXISTS ix_consent_user ON consent_records(user_id, consent_key, created_at);

-- Critical-action audit (recon §6). Cascade-deletes with the user (the completeness gate stays
-- clean); the durable record of the deletion itself lives in deletion_journal below.
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_audit_user ON audit_log(user_id, created_at);

-- Deliberate completeness-gate exemption (see header).
CREATE TABLE IF NOT EXISTS deletion_journal (
  user_id            TEXT NOT NULL,
  deleted_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  tables_purged_json TEXT NOT NULL DEFAULT '[]'
);
