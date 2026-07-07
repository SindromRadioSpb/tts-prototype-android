-- 029_cloze_challenge.sql — CLG-P7.2b cloze:tg (контекст-cloze).
-- Расширяет agent_challenges (028) под cloze: expected = ПОВЕРХНОСТЬ вхождения (не лемма),
-- + якорь (text_key, order_index) вхождения для аудита/восстановления. Для reverse эти поля
-- NULL (обратно-совместимо). shown_stimulus для cloze = blanked-предложение = КЛАСС C
-- (stimulus_privacy_class='C') → purge на revoke text-consent (см. agentChallengeRepo). Без BEGIN/COMMIT.

ALTER TABLE agent_challenges ADD COLUMN expected_surface TEXT;      -- cloze: поверхность пропуска (grade против неё)
ALTER TABLE agent_challenges ADD COLUMN anchor_text_key TEXT;        -- вхождение: text_key синхронизированного текста
ALTER TABLE agent_challenges ADD COLUMN anchor_order_index INTEGER;  -- вхождение: order_index предложения
