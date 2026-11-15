-- WARNING: on a live database this drops the editions, stories and the lease/attempt state of harvested articles.
DROP INDEX IF EXISTS ix_news_harvest_items_main;
DROP INDEX IF EXISTS ix_news_harvest_items_story;
ALTER TABLE news_harvest_items DROP COLUMN story_key;
ALTER TABLE news_harvest_items DROP COLUMN edition_id;
ALTER TABLE news_harvest_items DROP COLUMN overview_state;
ALTER TABLE news_harvest_items DROP COLUMN main_state;
ALTER TABLE news_harvest_items DROP COLUMN main_edition_id;
ALTER TABLE news_harvest_items DROP COLUMN main_attempts;
ALTER TABLE news_harvest_items DROP COLUMN main_reason;
ALTER TABLE news_harvest_items DROP COLUMN selected_by;
ALTER TABLE news_harvest_items DROP COLUMN selection_note_ru;
ALTER TABLE news_harvest_items DROP COLUMN draft_images_json;
ALTER TABLE news_harvest_items DROP COLUMN lease_until;
DROP TABLE IF EXISTS news_overview_items;
DROP TABLE IF EXISTS news_stories;
DROP TABLE IF EXISTS news_editions;
DROP TABLE IF EXISTS news_settings;
