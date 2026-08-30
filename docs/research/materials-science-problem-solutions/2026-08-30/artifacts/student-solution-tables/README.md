# Student solution tables

`manifest.json` and the 60 files under `tasks/` are the sole reviewed
presentation truth for student UI, print and the exact-edition agent shard.

- Canonical corpus: 60 tasks, 693 condition rows, 72 source assets.
- Reviewed solution projection: 1 919 rows, 0 publication blockers, 0 open
  mismatches, 19 exact allowlisted presentation replacements.
- Every solution row contains plain Hebrew, vocalized Hebrew, transliteration
  and Russian plus source/review references.
- Full TTS assets and timing sidecars: 0. The local row contract contains
  deterministic karaoke tokens; 275 formula-bearing rows remain explicitly
  marked for future spoken-form review.
- Build: `node scripts/premium/build-materials-pb2-student-tables.js`.
- Gate: `node --test tests/materialsPb2StudentTables.test.js
  tests/materialsPb2StudentSolutionContract.test.js`.

The task files are generated artifacts. Edit the independent/review ledgers or
the exact review policy, then rebuild; do not hand-edit a task shard.
