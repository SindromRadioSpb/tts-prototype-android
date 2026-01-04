-- W10-NOTES-PREMIUM-02 — FIX#4 DB smoke helpers
-- Подставьте реальные значения TEXT_A / DELETED_SENTENCE_ID / KEPT_SENTENCE_ID

-- До update
SELECT sentence_id, note
FROM sentence_notes
WHERE text_id = 'TEXT_A'
ORDER BY sentence_id;

-- После update: удалённый sentence должен исчезнуть
SELECT sentence_id
FROM sentence_notes
WHERE sentence_id = 'DELETED_SENTENCE_ID';

-- После update: сохранённый sentence должен остаться
SELECT sentence_id, note
FROM sentence_notes
WHERE sentence_id = 'KEPT_SENTENCE_ID';
