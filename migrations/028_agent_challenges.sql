-- 028_agent_challenges.sql — CLG-P7.2a challenge-binding для Telegram /review
-- (TELEGRAM_P7_2_REVIEW_SPEC_2026_07_07_v3.md; owner-решения 2026-07-07; критика wf_ebf8a550).
--
-- challenge = ЕДИНСТВЕННЫЙ мост к production-записи из Telegram. Инварианты, приземлённые здесь:
--   • сервер — источник истины задания (item_key/review_mode/expected/sense/shown_stimulus);
--     Telegram НЕ выбирает item и не присылает его как доверенный параметр;
--   • single-use: partial-UNIQUE (user_id) WHERE status IN ('active','processing') — не более
--     одного незакрытого challenge на пользователя; claim active→processing→completed атомарен;
--   • reply-binding: telegram_prompt_message_id — ответ принимается только как reply на ЭТОТ
--     prompt (иначе «спасибо/ок» не считается учебным ответом);
--   • evidence_scope='lexeme' — reverse:tg доказывает продукцию ЛЕММЫ, не всех форм парадигмы;
--   • shown_stimulus + source/version/privacy_class/hash — аудит «показанное ≠ ожидаемое»
--     (reverse: класс A словарный; cloze P7.2b: класс C — purge на revoke);
--   • claimed_attempt_id связывает production-unlock с КОНКРЕТНЫМ ответом (reviewer требует
--     совпадения → завершённый challenge не многоразовый токен);
--   • user_id-таблица → авто export/delete sweep identityRepo (§10). Без BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS agent_challenges (
  challenge_id             TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_user_id         TEXT NOT NULL,
  telegram_chat_id         TEXT NOT NULL,
  telegram_prompt_message_id INTEGER,                 -- reply-binding (§6)
  item_key                 TEXT NOT NULL,             -- серверная истина задания
  review_mode              TEXT NOT NULL,             -- channel: 'reverse:tg'
  prompt_kind              TEXT NOT NULL DEFAULT 'reverse',
  evidence_scope           TEXT NOT NULL DEFAULT 'lexeme',   -- §решение-5
  expected_form_id         TEXT,                      -- ожидаемая HE-форма (display item_key)
  sense_id                 TEXT,                      -- pealim_id выбранного значения
  shown_stimulus           TEXT,                      -- показанный RU-глосс (аудит shown≠expected)
  stimulus_source          TEXT,                      -- 'pealim-infl'
  stimulus_source_version  TEXT,                      -- 'v12'
  stimulus_privacy_class    TEXT,                     -- 'A' (reverse) | 'C' (cloze P7.2b)
  stimulus_hash            TEXT,
  accepted_alts_json       TEXT NOT NULL DEFAULT '[]',-- HE-леммы того же сенса (синоним-приём §3)
  claimed_attempt_id       TEXT,                      -- §BLOCKER-1 single-use binding
  status                   TEXT NOT NULL DEFAULT 'active',
                                                      -- active|processing|completed|declined|expired|cancelled
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at               TEXT NOT NULL,
  completed_at             TEXT
);
CREATE INDEX IF NOT EXISTS ix_agent_challenges_user ON agent_challenges(user_id, status);
CREATE INDEX IF NOT EXISTS ix_agent_challenges_tg ON agent_challenges(telegram_user_id, status);
-- single-use: не более одного незакрытого challenge на пользователя (§1)
CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_challenges_open
  ON agent_challenges(user_id) WHERE status IN ('active', 'processing');

-- §решение-7 cooldown: недавно ПОКАЗАННЫЕ этому пользователю формы (через /due или прошлый
-- prompt) исключаются из production-review на 30 мин. БЕЗ сырого текста — только идентификаторы.
CREATE TABLE IF NOT EXISTS tg_stimulus_exposure (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key      TEXT NOT NULL,
  exposure_kind TEXT NOT NULL,                        -- 'due_form' | 'review_prompt'
  shown_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_tg_exposure_lookup ON tg_stimulus_exposure(user_id, item_key, shown_at);
CREATE INDEX IF NOT EXISTS ix_tg_exposure_prune ON tg_stimulus_exposure(shown_at);
