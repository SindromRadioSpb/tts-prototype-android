-- News offload (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.11), review fix: what an
-- exported archive holds (article ids and body hashes), so a release frees exactly that and nothing else.
ALTER TABLE news_offloads ADD COLUMN manifest_json TEXT;
