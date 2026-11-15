-- News: dot may add up to 50 articles of its own per edition (owner decision 2026-11-16); a schedule
-- saved with the old default of 5 is moved to 50. A value the owner set otherwise stays.
UPDATE news_settings SET value_json = json_set(value_json, '$.extras', 50)
  WHERE key = 'schedule' AND json_extract(value_json, '$.extras') = 5;
