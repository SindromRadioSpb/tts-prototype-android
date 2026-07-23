-- H2.3: the canonical 23-scope grant serializes to 545 bytes. The original
-- 512-byte authorization-code bound was sized for the smaller AA surface and
-- caused oidc-provider to return server_error after first-party consent.
-- Migration runner owns the transaction.

CREATE TABLE agent_authorization_codes_new (
  authorization_code_id TEXT PRIMARY KEY,
  user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oauth_client_id        TEXT NOT NULL,
  connection_id          TEXT NOT NULL,
  code_hash              TEXT NOT NULL UNIQUE CHECK(length(code_hash) BETWEEN 32 AND 256),
  redirect_uri           TEXT NOT NULL CHECK(length(CAST(redirect_uri AS BLOB)) <= 1024),
  resource_uri           TEXT NOT NULL CHECK(length(CAST(resource_uri AS BLOB)) <= 512),
  pkce_method            TEXT NOT NULL CHECK(pkce_method='S256'),
  pkce_challenge         TEXT NOT NULL CHECK(length(pkce_challenge) BETWEEN 43 AND 128),
  scopes_json            TEXT NOT NULL CHECK(length(CAST(scopes_json AS BLOB)) <= 1024),
  status                 TEXT NOT NULL CHECK(status IN ('ACTIVE','CONSUMED','REVOKED','EXPIRED')),
  issued_at              TEXT NOT NULL,
  expires_at             TEXT NOT NULL,
  consumed_at            TEXT,
  revoked_at             TEXT,
  FOREIGN KEY(connection_id,user_id,oauth_client_id) REFERENCES agent_connections(connection_id,user_id,oauth_client_id) ON DELETE CASCADE
);

INSERT INTO agent_authorization_codes_new
SELECT * FROM agent_authorization_codes;

DROP TABLE agent_authorization_codes;
ALTER TABLE agent_authorization_codes_new RENAME TO agent_authorization_codes;

CREATE INDEX ix_agent_codes_user_connection
  ON agent_authorization_codes(user_id,connection_id,status,expires_at);
