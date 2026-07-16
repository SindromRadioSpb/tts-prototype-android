-- Agent Access AA2-B0: OAuth connection and credential-lifecycle substrate.
-- Default-off storage only. No endpoint, key, plaintext token or MCP runtime.

CREATE TABLE IF NOT EXISTS agent_oauth_clients (
  oauth_client_id      TEXT PRIMARY KEY,
  display_name         TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 120),
  software_id          TEXT NOT NULL CHECK(length(software_id) BETWEEN 1 AND 128),
  software_version     TEXT NOT NULL CHECK(length(software_version) BETWEEN 1 AND 64),
  client_type          TEXT NOT NULL CHECK(client_type='PUBLIC'),
  redirect_uris_json   TEXT NOT NULL CHECK(length(CAST(redirect_uris_json AS BLOB)) <= 4096),
  status               TEXT NOT NULL CHECK(status IN ('ACTIVE','SUSPENDED','REVOKED')),
  registration_version TEXT NOT NULL CHECK(length(registration_version) BETWEEN 1 AND 64),
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  revoked_at           TEXT
);

CREATE TABLE IF NOT EXISTS agent_subject_mappings (
  subject_id      TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  subject_version TEXT NOT NULL CHECK(length(subject_version) BETWEEN 1 AND 64),
  security_epoch  INTEGER NOT NULL DEFAULT 1 CHECK(security_epoch >= 1),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_connections (
  connection_id            TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oauth_client_id          TEXT NOT NULL REFERENCES agent_oauth_clients(oauth_client_id),
  display_label            TEXT NOT NULL CHECK(length(CAST(display_label AS BLOB)) BETWEEN 1 AND 120),
  status                   TEXT NOT NULL CHECK(status IN ('PENDING_AUTH','ACTIVE','SCOPE_REDUCED','SUSPENDED','REVOKED','DELETED')),
  consent_version          TEXT NOT NULL CHECK(length(consent_version) BETWEEN 1 AND 64),
  capability_version       TEXT NOT NULL CHECK(length(capability_version) BETWEEN 1 AND 64),
  retention_notice_version TEXT NOT NULL CHECK(length(retention_notice_version) BETWEEN 1 AND 64),
  security_epoch           INTEGER NOT NULL DEFAULT 1 CHECK(security_epoch >= 1),
  created_at               TEXT NOT NULL,
  activated_at             TEXT,
  updated_at               TEXT NOT NULL,
  last_used_at             TEXT,
  revoked_at               TEXT,
  deleted_at               TEXT,
  UNIQUE(connection_id,user_id,oauth_client_id)
);
CREATE INDEX IF NOT EXISTS ix_agent_connections_user_status ON agent_connections(user_id,status,updated_at);
CREATE INDEX IF NOT EXISTS ix_agent_connections_client_status ON agent_connections(oauth_client_id,status,updated_at);

CREATE TABLE IF NOT EXISTS agent_connection_grants (
  grant_id          TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id     TEXT NOT NULL REFERENCES agent_connections(connection_id) ON DELETE CASCADE,
  scope             TEXT NOT NULL CHECK(scope IN ('learning.brief.read','review.summary.read','reading.public.search','explanations.metadata.read','agent.connection.read')),
  status            TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
  consent_record_id TEXT NOT NULL REFERENCES consent_records(id),
  consent_version   TEXT NOT NULL CHECK(length(consent_version) BETWEEN 1 AND 64),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  revoked_at        TEXT,
  UNIQUE(connection_id,scope)
);
CREATE INDEX IF NOT EXISTS ix_agent_grants_user_connection ON agent_connection_grants(user_id,connection_id,status);

CREATE TABLE IF NOT EXISTS agent_authorization_codes (
  authorization_code_id TEXT PRIMARY KEY,
  user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oauth_client_id        TEXT NOT NULL,
  connection_id          TEXT NOT NULL,
  code_hash              TEXT NOT NULL UNIQUE CHECK(length(code_hash) BETWEEN 32 AND 256),
  redirect_uri           TEXT NOT NULL CHECK(length(CAST(redirect_uri AS BLOB)) <= 1024),
  resource_uri           TEXT NOT NULL CHECK(length(CAST(resource_uri AS BLOB)) <= 512),
  pkce_method            TEXT NOT NULL CHECK(pkce_method='S256'),
  pkce_challenge         TEXT NOT NULL CHECK(length(pkce_challenge) BETWEEN 43 AND 128),
  scopes_json            TEXT NOT NULL CHECK(length(CAST(scopes_json AS BLOB)) <= 512),
  status                 TEXT NOT NULL CHECK(status IN ('ACTIVE','CONSUMED','REVOKED','EXPIRED')),
  issued_at              TEXT NOT NULL,
  expires_at             TEXT NOT NULL,
  consumed_at            TEXT,
  revoked_at             TEXT,
  FOREIGN KEY(connection_id,user_id,oauth_client_id) REFERENCES agent_connections(connection_id,user_id,oauth_client_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_agent_codes_user_connection ON agent_authorization_codes(user_id,connection_id,status,expires_at);

CREATE TABLE IF NOT EXISTS agent_token_families (
  token_family_id    TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oauth_client_id    TEXT NOT NULL,
  connection_id      TEXT NOT NULL,
  status             TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED','REUSE_DETECTED','EXPIRED')),
  security_epoch     INTEGER NOT NULL CHECK(security_epoch >= 1),
  created_at         TEXT NOT NULL,
  last_rotated_at    TEXT NOT NULL,
  idle_expires_at    TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  revoked_at         TEXT,
  reuse_detected_at  TEXT,
  revoke_reason      TEXT,
  UNIQUE(token_family_id,user_id,connection_id),
  FOREIGN KEY(connection_id,user_id,oauth_client_id) REFERENCES agent_connections(connection_id,user_id,oauth_client_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_agent_families_user_connection ON agent_token_families(user_id,connection_id,status);

CREATE TABLE IF NOT EXISTS agent_refresh_tokens (
  refresh_token_id TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id    TEXT NOT NULL,
  token_family_id  TEXT NOT NULL,
  token_hash       TEXT NOT NULL UNIQUE CHECK(length(token_hash) BETWEEN 32 AND 256),
  status           TEXT NOT NULL CHECK(status IN ('ACTIVE','ROTATED','REVOKED','REUSE_DETECTED','EXPIRED')),
  issued_at        TEXT NOT NULL,
  expires_at       TEXT NOT NULL,
  used_at          TEXT,
  replaced_by_id   TEXT,
  revoked_at       TEXT,
  FOREIGN KEY(token_family_id,user_id,connection_id) REFERENCES agent_token_families(token_family_id,user_id,connection_id) ON DELETE CASCADE,
  FOREIGN KEY(replaced_by_id) REFERENCES agent_refresh_tokens(refresh_token_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_refresh_one_active ON agent_refresh_tokens(token_family_id) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS ix_agent_refresh_user_connection ON agent_refresh_tokens(user_id,connection_id,status,expires_at);

CREATE TABLE IF NOT EXISTS agent_access_token_denials (
  denial_id       TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id   TEXT NOT NULL REFERENCES agent_connections(connection_id) ON DELETE CASCADE,
  token_family_id TEXT REFERENCES agent_token_families(token_family_id) ON DELETE CASCADE,
  jti_hash        TEXT NOT NULL UNIQUE CHECK(length(jti_hash) BETWEEN 32 AND 256),
  reason_code     TEXT NOT NULL CHECK(length(reason_code) BETWEEN 1 AND 64),
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_agent_denials_expiry ON agent_access_token_denials(expires_at);

-- No FK by design: this content-free authority survives per-connection deletion
-- and is replayed after restoring an older backup.
CREATE TABLE IF NOT EXISTS agent_access_erasure_journal (
  user_id      TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  deleted_at   TEXT NOT NULL,
  reason_code  TEXT NOT NULL CHECK(length(reason_code) BETWEEN 1 AND 64),
  PRIMARY KEY(user_id,connection_id,deleted_at)
);
CREATE INDEX IF NOT EXISTS ix_agent_access_erasure_user ON agent_access_erasure_journal(user_id,deleted_at);
