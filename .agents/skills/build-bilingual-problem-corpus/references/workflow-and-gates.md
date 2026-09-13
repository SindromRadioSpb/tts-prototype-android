# Workflow and gates

Read only for implementation, audio generation, import, publication, or production
verification. Corpus-specific scripts may be adapted, but their Physics constants and
paths are not defaults.

## 1. Targeted recon and validation

1. Inventory source files, existing caches, legacy tables, scripts, schemas, packages,
   database/publication state when relevant; inspect production version only for a production operation.
2. Measure tasks, pages, expected row types, diagrams, missing inputs, and provider
   request size before choosing batch boundaries.
3. Reuse corpus checks for missing tasks, row drift, consonant changes hidden under
   niqqud, semantic-kind mismatch and missing provenance. Add a meaningful regression
   test when changing behavior or closing a demonstrated coverage gap; do not create
   red tests merely to begin a data-preparation task.
4. Produce a plan with a scoped file allowlist, cost boundary, stop list, rollback, and
   explicit owner decisions. Do not start paid generation merely because recon passed.

## 2. Extract and align

- Reuse valid raw caches. Batch/resume expensive work and ledger each successful unit.
- Preserve the complete raw response before normalization.
- Validate plain Hebrew against vocalized Hebrew at the consonant level.
- Validate transliteration and Russian against the same source row and semantic kind.
- Reject duplicated, dropped, reordered, merged, or split task parts unless a reviewed
  mapping records the transformation.
- Apply only source-backed allowlisted repairs, then rebuild all downstream derivatives.
- Compare legacy artifacts as evidence. Emit a diff report; never make legacy data an
  implicit fallback.

## 3. Build canonical records and package

Canonical records should contain:

- corpus/task/source identity and hashes;
- chapter/display number and source page;
- typed semantic rows in all learning columns;
- review and diagram-completeness status;
- generator/provider/model provenance;
- optional audio/profile references, never unverified bytes.

Verify exact expected task identity, unique rows, required fields, language/script
properties, and deterministic rebuild hashes. Build the import package only from
validated records. Read it back with the strict current schema, import into an isolated
or owner-authorized target, and reopen boundary/adversarial cards without provider calls.

## 4. Optional TTS

PLAN is safe and should be the default. It reports exact unique texts, profile,
deduplication, cache hits, missing clips, expected references, and the maximum paid call
count. APPLY requires the owner-selected profile, credentials outside logs/git, and an
explicit cost ceiling.

For each clip:

- key by normalized exact source text plus the complete voice profile;
- write atomically and store size/SHA in a resume ledger;
- skip only when bytes and SHA still agree with the ledger;
- decode every final MP3 and reject zero/invalid/truncated assets;
- require every row reference to resolve before producing a complete-audio package.

## 5. Immutable publication

Use the existing single publication writer and a corpus-specific slug. Before mutation:

- verify exact local `HEAD`, `origin/main`, production version, health, DB/migrations,
  disk, rights, source/package hash, backup, and a production-like rehearsal;
- materialize per-item rights facts;
- publish a bounded pilot before the full edition;
- copy/read back bodies and assets before moving the public pointer;
- do not overwrite valid shared semantic-key audio;
- keep source, publication, learner, review, and discussion truth separate.

Rollback is a pointer change or withdrawal, not a rewrite of source or learner truth.
Prove pilot -> full -> pilot -> full, or an equivalent bounded drill, while fingerprints
outside publication remain byte-stable.

## 6. Acceptance

For a local corpus, run focused source and package/hash/import/reopen checks.
For changed user-visible surfaces, check affected i18n, desktop and 380 px RU/LTR
and HE/RTL layouts, interactions and overflow. For audio, check its actual assets
and playback; HTTP Range applies when serving those assets.
For an authorized publication, add anonymous API/asset read-back and cache-busted
fresh-anonymous probes. Check an existing PWA profile only within the authorized
read-only scope, without clearing OPFS or user data. Local preparation alone does
not require production probes or an owner profile.

After a deployment, require a stable streak of the target version with healthy DB and
migrations. Confirm the exact deployed immutable image, not only Git state. Record
browser automation, owner report, physical device, print, and assistive technology as
separate evidence classes.
