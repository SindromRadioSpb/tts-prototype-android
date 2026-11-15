-- WARNING: an exported but not released day can no longer be released after this (its manifest is gone).
ALTER TABLE news_offloads DROP COLUMN manifest_json;
