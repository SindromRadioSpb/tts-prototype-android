-- News editions: refusals and skips counted apart from what the archive brought to rework/ (review of 3.11.897).
ALTER TABLE news_editions ADD COLUMN refused_count INTEGER NOT NULL DEFAULT 0;
