-- Mediatheque material deletion: the only permitted change to a published edition item is an
-- audited purge of one work. Editions, assets and every other column stay immutable.
CREATE TABLE IF NOT EXISTS published_corpus_edition_purges (
  edition_id     TEXT NOT NULL REFERENCES published_corpus_editions(edition_id) ON DELETE RESTRICT,
  public_work_id TEXT NOT NULL CHECK(length(public_work_id) BETWEEN 1 AND 160),
  corpus_id      TEXT NOT NULL REFERENCES published_corpora(corpus_id) ON DELETE RESTRICT,
  purged_by      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purged_at      TEXT NOT NULL,
  PRIMARY KEY(edition_id, public_work_id)
);
CREATE INDEX IF NOT EXISTS ix_edition_purges_work ON published_corpus_edition_purges(corpus_id, public_work_id);
CREATE TRIGGER IF NOT EXISTS trg_edition_purges_no_update
BEFORE UPDATE ON published_corpus_edition_purges BEGIN SELECT RAISE(ABORT,'PUBLICATION_PURGE_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_edition_purges_no_delete
BEFORE DELETE ON published_corpus_edition_purges BEGIN SELECT RAISE(ABORT,'PUBLICATION_PURGE_APPEND_ONLY'); END;
DROP TRIGGER IF EXISTS trg_published_edition_items_no_update;
CREATE TRIGGER trg_published_edition_items_no_update
BEFORE UPDATE ON published_corpus_edition_items
WHEN NOT (
  NEW.snapshot_json = '{"purged":true}' AND NEW.title = '[deleted]' AND NEW.creator IS NULL
  AND NEW.public_read_allowed = 0 AND NEW.public_stream_allowed = 0 AND NEW.package_download_allowed = 0
  AND NEW.edition_item_id = OLD.edition_item_id AND NEW.edition_id = OLD.edition_id AND NEW.source_item_id = OLD.source_item_id
  AND NEW.public_work_id = OLD.public_work_id AND NEW.position_no = OLD.position_no AND NEW.snapshot_sha256 = OLD.snapshot_sha256
  AND NEW.rights_basis = OLD.rights_basis AND NEW.rights_asserted_at = OLD.rights_asserted_at
  AND NEW.expected_audio_count = OLD.expected_audio_count AND NEW.included_audio_count = OLD.included_audio_count
  AND NEW.asset_missing = OLD.asset_missing AND NEW.package_complete = OLD.package_complete
  AND EXISTS (SELECT 1 FROM published_corpus_edition_purges p WHERE p.edition_id = OLD.edition_id AND p.public_work_id = OLD.public_work_id)
)
BEGIN SELECT RAISE(ABORT,'PUBLICATION_EDITION_ITEM_IMMUTABLE'); END;
