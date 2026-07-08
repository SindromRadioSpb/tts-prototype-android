-- 031_agent_challenge_select_reason.sql — CLG-P7.2d premium modality selector.
-- Персистирует ДЕТЕРМИНИРОВАННУЮ причину выбора модальности (enum-код селектора) на строке
-- challenge, чтобы объяснение доходило до prompt И на первой доставке (prompt строится из chal,
-- не из эфемерного pick), И на recovery-переотправке (getOpenForUser → тот же select_reason).
--
-- Инварианты:
--   • select_reason — КЛАСС A: enum-провенанс детерминированного селектора (напр.
--     'reading_strong_close_dictation_gap'), НЕ контент (не item_key/лемма/ответ). Как evidence_scope
--     — переживает class-C purge (purge зануляет только стимул/якорь пользователя, не провенанс).
--   • LLM его НЕ ставит и НЕ читает при выборе (R17): селектор назначает, format рендерит статичную
--     строку по коду. Отсутствие/неизвестный код → объяснение опускается (fail-safe). Без BEGIN/COMMIT.

ALTER TABLE agent_challenges ADD COLUMN select_reason TEXT;
