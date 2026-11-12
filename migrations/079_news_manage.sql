-- News: «Удалить» keeps the article in a 30-day trash (owner decision 2026-11-13); deleted_at starts the clock.
ALTER TABLE news_articles ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS ix_news_articles_deleted ON news_articles(tier, deleted_at);
