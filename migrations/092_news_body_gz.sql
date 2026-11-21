-- News findability W3 (docs/superpowers/specs/2026-11-21-news-findability-design.md §2 п.5): the full text of a slice
-- article is kept 45 days; after 3 days it is stored gzip-compressed here and data_json is cleared.
ALTER TABLE news_harvest_items ADD COLUMN data_gz BLOB;
