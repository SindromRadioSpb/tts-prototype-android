-- 019_strip_pipe_from_niqqud.sql
-- Remove morpheme-boundary pipe characters (|) that Dicta cloud API inserts
-- between prefix particles and word stems (e.g. לְ|לֵילוֹת → לְלֵילוֹת).
-- These were stored in the segment cache and in library sentences before
-- dictaCloud.js was patched to strip them on the way in.

-- Segment cache
UPDATE translation_segment_cache
SET he_niqqud = REPLACE(he_niqqud, '|', '')
WHERE he_niqqud LIKE '%|%';

UPDATE translation_segment_cache
SET translit = REPLACE(translit, '|', '')
WHERE translit LIKE '%|%';

-- Library sentences
UPDATE sentences
SET he_niqqud = REPLACE(he_niqqud, '|', '')
WHERE he_niqqud LIKE '%|%';

UPDATE sentences
SET translit = REPLACE(translit, '|', '')
WHERE translit LIKE '%|%';

UPDATE sentences
SET translit_ru = REPLACE(translit_ru, '|', '')
WHERE translit_ru LIKE '%|%';

-- Doc-level cache stores rows as JSON — patch the JSON blobs too.
-- REPLACE on TEXT is safe: | does not appear in valid Hebrew or Latin translit.
UPDATE translation_doc_cache
SET result_json = REPLACE(result_json, '|', '')
WHERE result_json LIKE '%|%';
