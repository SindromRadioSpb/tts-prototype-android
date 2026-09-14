# YouTube archive restore — 3.11.547

Baseline: cf45ce37 / 3.11.546. Owner reported CAPTION_REVISION_TRACK_CONFLICT
after deleting a material and importing its .lplp.zip in Import Center.

The supplied ZIP passes Core verification (schema 3, external YouTube playback,
no local media SHA). Native caption revisions use content-derived IDs, whereas
native media packages retain their original IDs. Deletion intentionally keeps
source tracks/revisions. Without an import receipt or media SHA, import selected
a new derived package ID, found the existing immutable revisions, and rejected
their original package as a track conflict.

Repair is restricted to package identity resolution: when no receipt/package-ID/
media-SHA match exists, use the surviving selected raw revision only if its ID,
canonical SHA, role, language and media SHA match and its package is not deleted.
All subsequent revision and ownership checks remain in place. No title/URL
heuristic, hash rewrite, source deletion, schema change or learner-state change.

Evidence:

- New regression reproduces the exact conflict before the fix.
- Delete/restore passes after the fix, including a read-only load of the owner's
  ZIP via PORTABLE_RESTORE_ARCHIVE in an isolated sql.js database. The archive
  and its text/media contents are not committed or uploaded.
- Original caption rows and review_log remain identical; one source package,
  restored playback source, foreign_key_check empty.
- Deliberate media-SHA, language and caption-SHA conflicts still reject without
  changing database bytes.
- 68 portable repository/core/security/backup/UI tests pass.

Physical owner library acceptance remains pending; the original browser database
was not accessed. Reproduction models the retained native source state, not a
snapshot of that private database. Release pins the repository script in both
shells, SW precache and server integrity contract.
