-- The columns added to news_harvest_items stay (SQLite cannot drop them safely here); they are unused without 083.
DROP INDEX IF EXISTS ix_news_harvest_items_main;
DROP INDEX IF EXISTS ix_news_harvest_items_story;
DROP TABLE IF EXISTS news_overview_items;
DROP TABLE IF EXISTS news_stories;
DROP TABLE IF EXISTS news_editions;
DROP TABLE IF EXISTS news_settings;
