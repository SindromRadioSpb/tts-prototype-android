-- 026_agent_runtime.sql — CLG-P6 Agent Runtime, слайс 1 (AI_MENTOR_RECON §6 + §9
-- «CLG-P6 — принятый план реализации», owner brief 2026-07-05).
--
-- Жёсткое разделение состояния (§9-план 4.2): agent memory ≠ learner-state; agent tasks ≠
-- SRS state; agent_explanations ≠ вход учебных проекций (§7 анти-циркулярность). Всё, что
-- влияет на память слова, идёт ТОЛЬКО через review_log (§1.3-3). agent_threads /
-- agent_messages появятся вместе с чат-поверхностью (P7) — мёртвые таблицы не создаём.
-- Все таблицы несут user_id → динамический export/delete sweep identityRepo покрывает их
-- автоматически (§10-инвариант «новая user_id-таблица вне export/delete» закрыт структурно).
-- payload/body несут ТОЛЬКО идентификаторы классов A/B (item_key, text_key, counts) — контент
-- класса C сюда не пишется (§5). Класс D (context packs) НЕ персистится вовсе в этом слайсе.
-- Без BEGIN/COMMIT (раннер сам оборачивает).

CREATE TABLE IF NOT EXISTS agent_profiles (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL DEFAULT 'silent',   -- silent | coach | intensive (§2.3)
  language    TEXT NOT NULL DEFAULT 'ru',       -- язык объяснений/планов агента
  goals_json  TEXT,                             -- конструктор роли (P9-смежное), идентификаторы
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,                   -- 'plan' | 'review_set' | 'read_next' | ...
  status       TEXT NOT NULL DEFAULT 'open',    -- open | done | dismissed
  payload_json TEXT NOT NULL DEFAULT '{}',      -- классы A/B: item_keys/counts/links, НЕ контент C
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_agent_tasks_user ON agent_tasks(user_id, status, created_at);

-- §7 провенанс-схема: facts_used_json — КАЖДЫЙ языковой факт со source+confidence
-- (morphology: resolver/asserted · translation: studio_translation/derived · ...).
-- Никогда не вход учебных проекций и не вход метрик качества агента (§7 анти-циркулярность).
CREATE TABLE IF NOT EXISTS agent_explanations (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sentence_id     TEXT,
  item_key        TEXT,
  facts_used_json TEXT NOT NULL DEFAULT '[]',
  llm_model       TEXT,
  body_json       TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_agent_expl_user ON agent_explanations(user_id, created_at);

-- §11 cost-enforcement: pre-call check-and-reserve. Строка создаётся ДО вызова LLM
-- (status='reserved') в одной txnLock-транзакции с проверкой лимитов; фактический расход —
-- постфактум-апдейт ТОЙ ЖЕ строки (status='final'|'failed'). Постфактум-модель
-- (usage.json / markGeminiDailyLimitHit) для агента запрещена канонично.
CREATE TABLE IF NOT EXISTS llm_usage_ledger (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_utc        TEXT NOT NULL,                 -- 'YYYY-MM-DD' UTC — суточные окна лимитов
  kind           TEXT NOT NULL,                 -- 'llm_call' | 'tts_chars'
  scenario       TEXT,                          -- 'plan' | 'explain' | ...
  provider       TEXT,
  status         TEXT NOT NULL DEFAULT 'reserved',   -- reserved | final | failed
  reserved_units INTEGER NOT NULL DEFAULT 1,
  actual_units   INTEGER,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finalized_at   TEXT
);
CREATE INDEX IF NOT EXISTS ix_llm_ledger_user_day ON llm_usage_ledger(user_id, day_utc, kind, status);
CREATE INDEX IF NOT EXISTS ix_llm_ledger_day ON llm_usage_ledger(day_utc, kind, status);
