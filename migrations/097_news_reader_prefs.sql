-- News sources W5 (docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md §7.4): a signed-in reader's
-- outlets — «мои» in their order, hidden ones, folded groups, «Все | Мои» of the overview — follow the account.
CREATE TABLE IF NOT EXISTS news_reader_prefs (
  actor_id    TEXT PRIMARY KEY,
  prefs_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
-- The outlets switched into the slice by wave 4 (3.11.918, 2026-11-26 08:00 Israel time) carry «new» for a week.
UPDATE news_outlet_state SET enabled_at = '2026-11-26T05:30:00.000Z'
  WHERE enabled = 1 AND enabled_at IS NULL AND outlet_id IN ('hamakom','kipa','srugim','haipo','kikar','blinker','techtime','news08','geektime','hayadan','hmnews','zavit','colbo','hkn','kolhair');
