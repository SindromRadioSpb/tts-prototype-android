-- 001_v3_bootstrap.sql
-- Bootstrap миграция: проверяем, что раннер работает, версия записывается.

CREATE TABLE IF NOT EXISTS v3_bootstrap (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO v3_bootstrap (id, created_at)
VALUES (1, CURRENT_TIMESTAMP);
