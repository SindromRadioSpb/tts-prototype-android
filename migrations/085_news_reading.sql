-- News: the owner's reading signal for dot (docs/superpowers/specs/2026-11-15-news-editions-design.md §4.5, §5.7).
-- Only the owner's opens and finished reads of news articles are recorded; kept 90 days.
CREATE TABLE IF NOT EXISTS news_read_signals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id  TEXT NOT NULL,
  event       TEXT NOT NULL CHECK(event IN ('open','finish')),
  at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_news_read_signals_at ON news_read_signals(at);
CREATE INDEX IF NOT EXISTS ix_news_read_signals_article ON news_read_signals(article_id, event, at);
