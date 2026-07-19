-- Exposure-леджер (решение владельца 2026-07-19; DESIGN §2.4-этап-1 → точечная разметка).
-- Метаданные РЕАЛЬНО прочитанных агентом окон личных текстов (text_key + диапазон строк +
-- время; КОНТЕНТА НЕТ). Пишется единственным местом экстракции (agentSentenceRepo.
-- aaGetPersonalTextWindow — «экстракция = экспозиция» by construction). Заменяет ковровую
-- разметку «грант жив ⇒ помечено всё» на правдивую «стимул ∈ прочитанное окно за 30 дней»:
-- метка agent_exposed теперь означает ровно то, что заявляет. Покрывает и residual-знание
-- после отзыва гранта (агент читал 5 дней назад — экспозиция реальна, грант не при чём).
-- TTL: ops-sweep prune >45 дней (проверочное окно 30); GDPR-sweep авто по user_id.
CREATE TABLE IF NOT EXISTS agent_text_exposures (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text_key  TEXT NOT NULL,
  from_idx  INTEGER NOT NULL,
  to_idx    INTEGER NOT NULL,
  read_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_agent_text_exposures_user_key ON agent_text_exposures(user_id, text_key, read_at);
