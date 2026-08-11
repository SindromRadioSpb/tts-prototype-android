# Three-source evidence

## Fixture

`npm run smoke:studio-room-srs` creates a fresh isolated Chromium profile and OPFS database with three different text keys and resolvable sentences:

| Source | Stable metadata | Due word | Lapses |
|---|---|---:|---:|
| Ben-Yehuda | `corpus.byehuda_id=fixture-by-1` | canonical lemma for `בית` | 3 |
| Study Song | `group_corpus.corpus_id=study-songs-pilot`, `work_id=fixture-song-1` | canonical lemma for `שיר` | 2 |
| My Text | `material_kind=user_text` | canonical lemma for `ספר` | 1 |

Each word is assigned a canonical lemma key and a source occurrence `{text_key, sentence_id, order_index, surface}` through the existing local DB contract. The fixture does not compare titles and does not create a source-specific SRS store.

## Results

- `getDueWithSource(now)` returned all three words.
- `getSentenceForReview` resolved all three anchors to their own material.
- The mixed session contained all three items and opened at `1 / 3`.
- Order followed lapses/weakness/due; no source quota or UI/DB exclusion was present.
- Ben-Yehuda, group-song, and personal-text metadata remained attached to the correct text key.
- Opening the session: total `review_log` delta `0`.
- Closing without an answer: total `review_log` delta `0`.
- One completed grade: canonical `review|skip` event delta `1`.
- Repeated click: canonical grade-event delta `0` after the first accepted grade.
- `FsrsCore.replay(review_log(item))` matched the stored stability, difficulty, reps, lapses, and exact `dueMs` projection.
- After grading, Studio and Room returned the same due count.
- Refresh after consuming/closing the deep-link did not reopen the trainer.

Latest local result: `studio-room-srs-smoke: PASS 35/35`.

## What this proves

The three sources are equally eligible after the user has produced a canonical learned/marked word and source anchor. Study Songs already use the shared materialized text pipeline, so no songs-only scheduler or queue is required. The fixture also proves that navigation to context is keyed by stable source metadata and text IDs, not display labels.

## Review-log interpretation

The acceptance oracle counts canonical grade events (`kind=review|skip`) because the existing manual-status sync axis can record a distinct `kind=mark` event when a manual status changes. This slice does not collapse those two semantic axes or alter the shared sync contract. It does prove there is exactly one grade event and no duplicate caused by open, close, refresh, or repeated click.
