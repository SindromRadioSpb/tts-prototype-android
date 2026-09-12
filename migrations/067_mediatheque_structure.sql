-- Editorial organization references public content; publicationRepo remains the only writer.
CREATE TABLE IF NOT EXISTS publication_mediatheque_draft (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  revision INTEGER NOT NULL CHECK(revision>0),
  structure_json TEXT NOT NULL CHECK(json_valid(structure_json)),
  undo_json TEXT CHECK(undo_json IS NULL OR json_valid(undo_json)),
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publication_mediatheque_editions (
  edition_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  structure_json TEXT NOT NULL CHECK(json_valid(structure_json)),
  sha256 TEXT NOT NULL,
  published_by TEXT NOT NULL REFERENCES users(id),
  published_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publication_mediatheque_pointer (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  edition_id TEXT NOT NULL REFERENCES publication_mediatheque_editions(edition_id)
);
CREATE TRIGGER IF NOT EXISTS mediatheque_edition_immutable_update BEFORE UPDATE ON publication_mediatheque_editions
BEGIN SELECT RAISE(ABORT, 'Mediatheque edition is immutable'); END;
CREATE TRIGGER IF NOT EXISTS mediatheque_edition_immutable_delete BEFORE DELETE ON publication_mediatheque_editions
BEGIN SELECT RAISE(ABORT, 'Mediatheque edition is immutable'); END;
