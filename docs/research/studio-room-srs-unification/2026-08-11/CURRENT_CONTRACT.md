# Current canonical SRS contract

## Data flow

```text
texts / sentences
  → token occurrence
  → LemmaCanon lemma key
  → manual mark or recall result
  → source occurrence {text_key, sentence_id, order_index, surface}
  → word_status (FSRS projection + latest source anchor)
  → getDueWithSource(now)
  → getSentenceForReview / bounded re-anchor
  → cloze, or honest word-only fallback with evidence_scope=lexeme
  → Reading Room training item
  → exactly one canonical review/skip event per completed grade
  → FsrsCore.replay(review_log)
  → word_status projection
```

`review_log` remains the append-only event truth. `word_status` remains a projection and source pointer, not a second review history. `fsrs-core.js`, grade meanings, lemma canon, schema, migrations, and sync contracts are unchanged.

## Writers and readers

| Contract | Writer | Reader | Invariant |
|---|---|---|---|
| Source occurrence | Reader marking/recall path through `setWordStatus` / `updateSrsSource` | `getDueWithSource`, `getSentenceForReview` | Stable IDs, never display-title matching |
| Review event | Reading Room grade path | `FsrsCore.replay`, sync/materialization | One canonical `review`/`skip` event per grade |
| Schedule projection | canonical replay/materialization | Room and Studio due counters | Same `ReaderMorph.dueCounts` predicate |
| Training queue | `_buildDueSourcedItems` and `_launchTrainSession` | Room training sheet | Cross-text, no source quota or filter |

Opening, closing, navigating, refreshing, revealing, or merely viewing a card does not write a review event. A duplicate grade click is ignored.

## Source taxonomy and eligibility

All three source families use the same materialized `texts`/`sentences` and SRS path:

- Ben-Yehuda: stable `text_key`; source metadata includes `corpus.byehuda_id`.
- Study Songs: protected bundle materialized through the common text pipeline; identity is `source_meta.group_corpus.corpus_id` plus `work_id` (fixture uses `study-songs-pilot`). There is no songs-only due query, queue, or scheduler.
- My Texts: stable local `text_key`; metadata can identify `material_kind=user_text`/Studio origin. Private content is not placed in the handoff URL or sent to a cloud service.

`getDueWithSource(now)` filters by schedule/status, not source kind. Its production order remains `srs_lapses DESC, srs_due ASC`; the Room builder retains canonical weakness/lapses priority. No corpus quotas were introduced.

If an anchor cannot resolve, bounded re-anchor is attempted. If context is unavailable, the item remains eligible through the existing word-only fallback and truthful `evidence_scope=lexeme`; missing source content does not silently erase the word.

## Studio → Room handoff

Studio reads local statuses/schedules and calls the same `ReaderMorph.dueCounts` used by Room. The primary action is:

```text
/library.html?review=due&from=studio
```

Only routing identifiers are present. Room consumes and removes both parameters with `history.replaceState` before launching the due session. Therefore refresh after manual close does not reopen it. Browser Back returns to Studio. If due is zero, Studio does not promise an empty due session and opens Room without the due command; if no schedule exists, it explains how words become eligible.

The legacy Studio modal remains as bounded dead compatibility DOM/code for a later consumer-sweep cleanup, but `v3SrsTrainerOpen()` and every visible Studio SRS entry route to Room. Anki `.apkg` export has its own visible Studio action and remains independent of the retired trainer route.
