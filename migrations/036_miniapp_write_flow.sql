-- CLG-P8.4a — write-flow Mini App (TELEGRAM_MINI_APP_P8_4a_SPEC §2 + §10 п.5).
-- Additive. hint_kind — вид подсказки (context|sentence_audio, enum в коде); result_decision/
-- result_grade — МИНИМАЛЬНЫЙ вердикт (класс A: enum + число, БЕЗ raw answer), персистится
-- внутри complete() одним UPDATE — источник lost-response replay (§10 п.5). Purge-пути
-- (класс C) эти колонки НЕ трогают. Якоря dictate/reverse НЕ персистятся вовсе (§10 п.6).
ALTER TABLE agent_challenges ADD COLUMN hint_kind TEXT;
ALTER TABLE agent_challenges ADD COLUMN result_decision TEXT;
ALTER TABLE agent_challenges ADD COLUMN result_grade INTEGER;
