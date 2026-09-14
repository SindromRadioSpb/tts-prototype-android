# YouTube material identity and automatic queue retirement

Base commit: `7f090d82`. Release: 3.11.548. Scope: Studio material preparation,
task IndexedDB journal, source validation and shell cache contract.

## Confirmed failure

The import modal cleared its temporary YouTube input after opening preparation.
Choosing Gemini opened preparation again and recaptured the currently open card.
The owner's exported archive consequently contained the previous video, not the
newly requested `MlX2x9QJIMk`. Separately, ten journal records prevented creation
of another task with an undifferentiated error.

## Result

- Provider switching retains a detached input snapshot and edited title. The
  selected source link is visible before starting and on task details.
- A changed input signature fails before recognition. Transcript source,
  table source text, persisted table digest, saved task identity, saved row text
  and video source are checked before dependent save/binding/export operations.
  Provider results are retained when a check fails; retries reuse completed work.
- IndexedDB version 2 atomically moves completed tasks into a separate history
  store. Existing completed records migrate without losing their results.
  Completion retires the task from the active queue in the same transaction.
  There is no ten-record admission limit. Paused/cancelled work is retained.
- History is accessible from a collapsed section. Removal remains explicit and
  confirmed; removing a journal does not delete its saved library material.
- Browser storage capacity still applies; this change does not claim unlimited
  physical storage or delete paid results to conceal a storage failure.

## Validation

- `node --test tests/learningMaterialTask.test.js tests/learningMaterialTaskUi.test.js tests/shellIntegrityPrecacheParity.test.js tests/playbackSource.test.js`: 70 passed.
- `node scripts/premium/learning-material-task-browser-smoke.js`: isolated
  Chromium, real IndexedDB v1-to-v2 migration, provider switch after clearing
  the import handoff, synthetic complete run, 12 subsequent runs, preserved
  paused jobs and readable completed results. Zero paid provider calls.
- Browser layout inspected at 380px in Russian/LTR and Hebrew/RTL, plus desktop.
  Screenshots are transient under `.tmp/learning-material-task-smoke/`.
- Read-only owner-card validation: the already created `MlX2x9QJIMk` material
  passes all new source/row checks with 182 rows; review-log digest unchanged.
- Physical-device and assistive-technology acceptance are not claimed.

Production verification is performed after pushing the release commit: served
version, changed asset digests, service-worker/integrity URL parity and active
container commit must agree.
