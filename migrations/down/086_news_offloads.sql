-- WARNING: safe only if no day was released: offloaded_day is the only link between an offloaded article and its archive file.
DROP INDEX IF EXISTS ix_news_articles_offloaded;
ALTER TABLE news_articles DROP COLUMN offloaded_day;
DROP TABLE IF EXISTS news_offloads;
