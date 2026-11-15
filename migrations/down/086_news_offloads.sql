-- news_articles.offloaded_day stays (SQLite); it is unused without 086.
DROP INDEX IF EXISTS ix_news_articles_offloaded;
DROP TABLE IF EXISTS news_offloads;
