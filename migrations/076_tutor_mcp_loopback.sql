-- The owner Hermes fixture already permits 8765. Add the dedicated Windows
-- tutor callback on 8766 without changing any connection, token, or other client.
UPDATE agent_oauth_clients
SET redirect_uris_json='["http://127.0.0.1:8765/callback","http://127.0.0.1:8766/callback"]',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE oauth_client_id='linguistpro-hermes-owner-v0'
  AND redirect_uris_json='["http://127.0.0.1:8765/callback"]';
