-- CLG-P8.4b — manual mode «Выбрать режим» (TELEGRAM_MINI_APP_P8_4b_SPEC §2, чартер-ревизия §2).
-- Провенанс происхождения выбора: selector (умная тренировка) | manual (пользователь выбрал
-- модальность; сервер выбрал слова). requested_modality — что просил пользователь (аудит:
-- manual-выбор НЕ обходит grader/binding/cooldown/scope — только меняет источник выбора).
ALTER TABLE agent_challenges ADD COLUMN selection_origin TEXT NOT NULL DEFAULT 'selector';
ALTER TABLE agent_challenges ADD COLUMN requested_modality TEXT;
