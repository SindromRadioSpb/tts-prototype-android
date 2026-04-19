-- 018_sentence_edits.sql
-- Persists manual cell edits on library sentences.
-- edit_meta_json structure:
--   {
--     "edited": { "ru": true, "translit": false, "he_niqqud": false, "translit_ru": false },
--     "original": { "ru": "...", "translit": "...", "he_niqqud": "...", "translit_ru": "..." }
--   }
-- "original" is written once (on first edit) and never overwritten,
-- so ↺ reset always returns to pipeline output, not to a previous manual value.

-- translit_ru stores the Russian phonetic transliteration.
-- Normally computed on-the-fly from he_niqqud; persisted here when manually edited.
ALTER TABLE sentences ADD COLUMN translit_ru TEXT;

-- edit_meta_json tracks which fields were manually edited and their original values.
ALTER TABLE sentences ADD COLUMN edit_meta_json TEXT;
