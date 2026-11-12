DROP INDEX IF EXISTS ix_news_articles_deleted;
ALTER TABLE news_articles DROP COLUMN deleted_at;
