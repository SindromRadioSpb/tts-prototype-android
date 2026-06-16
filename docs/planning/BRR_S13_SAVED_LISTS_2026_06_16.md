# BRR-S13 — Saved searches / reading lists (recon-design, owner approval before code)

> Big brick of the approved S1–S19 search closure. «Сохранённые поиски / списки чтения» (коллекции). Roles R6 (librarian —
> collections are the heart of a library) · R4 (UX) · (storage) the existing OPFS layer.

## What it is — two distinct artifacts
1. **Saved searches** — a named query+filters the reader keeps to re-run later («все стихи про море», «корень מלך»).
2. **Reading lists** — user-curated **collections of works** («Почитать на выходных»), addable from a result/work.

## Data-feasibility (recon)
- **Reading lists** map exactly onto the existing **`shelves`** table (migration 054/055): `track`, `items_json=[{text_key,
  order}]`, `slug` UNIQUE, `origin`. A user list = a shelf with `origin=null` → it SURVIVES canon re-import (the reconcile
  only touches `origin='benyehuda-ingest'`). DB-API `getShelves`/`createShelf` already exist. No migration.
- **Saved searches** are tiny (a query string + a few filter flags) → `localStorage` (same as S12 recents), no migration,
  device-local (matches the privacy model — searches stay on device).

## Variants (role analysis)
- **V1 — localStorage saved-searches + `shelves` reading-lists (RECOMMENDED).** No migration; reuses proven, bundle-portable
  infra (a reading list rides the existing library export/import); user shelves already survive re-import. [R6 · R4 · ship-fast]
- **V2 — a new `saved_searches` migration table.** Durable + exportable saved searches with result snapshots. Heavier (a
  migration + bundle round-trip + a gate), and result-snapshots stale fast. ✗ Over-engineered for v1; revisit if needed.

## Recommended design (V1)
- **Saved searches:** «⭐ Сохранить поиск» in the results summary → stores `{q, genre, lang, readyOnly, readableOnly,
  exactForm, hasAudio, reviewed, scope?}` to `localStorage` (`corpus_saved_searches_v1`, named, max ~20). A «⭐ Сохранённые
  поиски» section on home (chips/rows) re-runs one (restores the full filter state). Delete per item.
- **Reading lists:** a «➕ В список» action on a result row / work → choose-or-create a list (a user `shelf`, `track='accessible'`,
  `origin=null`, `items_json` += `{text_key}`). A «📚 Мои списки» surface on home lists them (reuses shelf rendering); opening
  a list shows its works (existing work-row renderer). Idempotent add (dedupe by text_key); remove from list.
- **Honesty/robustness:** a list item whose `text_key` no longer resolves is shown disabled (R8 no invisible dead-end), never
  dropped silently. Saved-search filter keys are forward-compatible (unknown keys ignored on restore).

## Gates / norms
`smoke:shelves`/`smoke:shelves-roundtrip` already cover user shelves; add a small `smoke:saved-searches` (localStorage
serialize/restore/prefix-dedupe pure helpers, run in Node with a localStorage shim). index.html/reader-core untouched. i18n
`room.corpus.saved.*` + `room.corpus.lists.*`. SW bump. @380px e2e (save a search → re-run restores filters; add a work to a
new list → appears in «Мои списки» → opens).

## Open choice for the owner
- **Scope of v1:** (a) BOTH saved-searches + reading-lists, or (b) reading-lists only, or (c) saved-searches only.
  Recommendation: **(a) both** (they're cheap on V1 infra and complete the «collections» story).

## Recommendation: **V1, both artifacts**. Approve / pick a subset / redirect.
