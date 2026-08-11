# Studio table resume and coverage hotfix — implementation packet

Date: 2026-08-11

Source commit: `a64cc8715dfb2a965a132c1b297e8bf99ad85c4c`

Target app/cache version: `3.11.349`

Scope: bounded P1 lifecycle correction after owner-live reload; no provider-default, Media Package, OPFS canon, P2/P3/P4, or Reading Room architecture change.

## Owner-live evidence

After a production update reloaded an active Studio tab, a repeated table action immediately displayed `5/5`, `544/573`, and `0 s`.

Read-only inspection proved:

- all five original Gemini chunks returned from the server cache, so the immediate result was a valid cache resume rather than a new full generation;
- the UI denominator `573` was a cost heuristic, not a completeness fact;
- the actual source contained 545 request segments;
- 544 unique segments were covered and exactly one global segment was absent;
- cached chunk four contained 119 of 120 segment indexes;
- the application nevertheless marked the job `done`, cleared its journal, and attempted a localStorage table-cache write;
- the cache write did not replace an older four-row cache, leaving 544 current rows only in tab memory.

The current owner table was protected before implementation work. A bounded one-segment repair produced exact coverage 545/545. Content-bearing recovery files remain only in owner-local OPFS and are not committed.

## Decision

1. Segmented jobs report proven segment coverage, not estimated future row count.
2. Completion requires independent full coverage of source segment indexes.
3. Missing indexes produce a bounded repair request containing only those source segments.
4. A repair response is mapped back to the exact global indexes and merged deterministically.
5. If coverage remains incomplete, the table stays explicitly partial, saving is not presented as complete, and the durable journal remains resumable.
6. Recovery rows move from quota-sensitive localStorage to one bounded OPFS scratch file: `recovery/studio-table-job-v1.json`.
7. A completed journal remains available across reload until a newer exact job replaces it; it is not cleared merely because table generation finished.
8. Reload restoration is local-only. It never starts Gemini automatically; an incomplete job continues only after the owner presses the translation action.
9. The journal retains Gemini provenance even if the provider selector resets to Google-free after reload.

## Do-no-harm constraints

- No transcript, translation, timing, Media Package, material-revision, or Import Center schema changes.
- No second library or second canonical learning material is created.
- OPFS recovery is a replaceable working journal, not the canonical saved card.
- No ASR rerun and no timing interpolation.
- Existing server chunk cache remains unchanged.
- Initial price confirmation continues to cover provider work; targeted repair is part of that same explicitly started job.
- Reading Room consumes only the eventual canonically saved table and exact media binding.

## Allowlist

- `public/index.html`
- `public/sw.js`
- `public/js/table-chunks.js`
- `public/js/table-job.js`
- `public/i18n/locales/ru.js`
- `public/i18n/locales/en.js`
- `public/i18n/locales/he.js`
- `tests/i18n.locale-version.lock.json`
- `tests/tableChunks.test.js`
- `tests/tableJob.test.js`
- `tests/studioTableJobUi.test.js`
- `scripts/premium/studio-table-resume-browser-smoke.js`
- `package.json`
- this packet

## Automated acceptance

The dedicated browser gate creates 121 source segments, makes the first 120-segment response omit its last index, and proves:

- only three provider calls occur: 120 initial, one final source segment, and one targeted missing segment;
- final coverage is 121/121;
- the journal has two completed chunks plus one repair record;
- the completed journal is stored in OPFS while the localStorage slot is empty;
- reload restores all 121 rows without another provider call;
- restoration remains valid when the visible provider selector is Google-free;
- no page errors occur.

Required companion gates:

- table chunk/job/UI unit tests;
- Studio UX maturity desktop and 380 px RU/HE browser gate;
- Media Package save/reopen/table-media synchronization gate;
- Reading Room audio/video exact-binding and row-replay gate;
- i18n symmetry, cache-bust lock, APP_VERSION/CACHE_VERSION parity;
- production live-asset and fresh-context smoke.

## Owner-live acceptance after production

1. Fresh load reports `3.11.349`.
2. The protected current table restores as 545/545 without another full Gemini run.
3. Reloading during a new long table restores completed chunks locally and shows an honest stopped/complete state.
4. A deliberately incomplete cached response is repaired only for missing indexes.
5. Saving, reopening, original-media row replay, and `.lplp.zip` export/import remain intact.

## Rollback

Revert this allowlisted commit and restore APP_VERSION/CACHE_VERSION and locale cache-bust versions together. Canonical saved data and schemas are unchanged. The bounded recovery file can remain inert; older code ignores it.
