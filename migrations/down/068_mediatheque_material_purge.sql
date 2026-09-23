DROP TRIGGER IF EXISTS trg_published_edition_items_no_update;
CREATE TRIGGER IF NOT EXISTS trg_published_edition_items_no_update
BEFORE UPDATE ON published_corpus_edition_items BEGIN SELECT RAISE(ABORT,'PUBLICATION_EDITION_ITEM_IMMUTABLE'); END;
DROP TRIGGER IF EXISTS trg_edition_purges_no_update;
DROP TRIGGER IF EXISTS trg_edition_purges_no_delete;
DROP INDEX IF EXISTS ix_edition_purges_work;
DROP TABLE IF EXISTS published_corpus_edition_purges;
