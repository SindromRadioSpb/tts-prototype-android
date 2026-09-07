# Studio / Room discovery and Import Center — 3.11.485

Owner-authorized release, 2026-09-07. Baseline main/origin/runtime: `a07c8e28` / `3.11.484`. Candidate: `3.11.485`. Production validation will be added after deployment.

## Delivered behavior

- Studio Library offers “most reliably familiar first” and per-card recorded familiarity. It shares the Room projection/cache identities; missing evidence is never shown as zero. Work is cancellable and bounded to one local worker.
- My Texts, public and group catalogs, and Ben-Yehuda use a shared discovery control/state contract: search scopes, level/provider, eight smart filters, all tags with ALL/ANY, removable active filters, stable sorting and reset. Source-specific publication, audio, section and corpus filters remain available.
- Import Center starts with Add / Restore / Back up. It explicitly selects a material for transfer, distinguishes full-library and single-material copies, preserves archive/snapshot and legacy formats, verifies before Apply, and retains retry after failure. Saved-copy confirmation remains explicit.

## Reproducible validation

Run an isolated server with PORT=3327 and a temporary DATA_DIR. Then:

```text
npm test
node tests/i18n.smoke.js
node scripts/premium/train-queue-smoke.js
node scripts/api-smoke.js
node scripts/premium/discovery-import-browser-smoke.js
node scripts/premium/discovery-shell-smoke.js
```

Final local gates: 1365/1365 unit tests; 233/233 localization checks; 321/321 shell checks; API smoke PASS. `local/evidence.json` records the complete browser run and screenshot names. `local/shell-offline.json` records all 43 shell hashes and offline reopen.

Browser fixtures use a fresh Chromium profile and 65 local texts, canonical word-note occurrences, public/group catalog fixtures and real package hashes. Checks cover pagination beyond the first page, row/note/provider queries, rare tags, smart filters, reset/sort consistency, 75%/25% ranking, cold worker analysis, missing profile, verified archive import, failed-Apply retry, duplicate prevention, invalid archive retry, transfer/export, diagnostics, keyboard focus and Escape. Screenshots cover desktop, 380px RU/EN/HE RTL, dark theme and 200% text. Dark text contrast is measured as well as visually inspected.

No provider requests occurred; review_log remained byte-for-byte equal before and after the scenarios. Owner browser data was not used as writable fixtures. Production mode (`DISCOVERY_LIVE=1`, `DISCOVERY_BASE`, `DISCOVERY_OUT`) uses real public catalogs and fresh browser-local test data; protected group behavior is proven locally. Physical iPhone/VoiceOver acceptance is separate and is not claimed here.

## Boundaries and rollback

No schema migration, source corpus mutation, publication change or new learner-state writer. Public metadata is a bounded read-only projection of already published immutable snapshots. B9 remains frozen. Existing unrelated working-tree changes are excluded.

Rollback uses the previous app image `a07c8e28`; no data rollback is required by this change. Update the browser shell after any rollback to avoid stale assets. The current release deploy follows the exact commit image, API version and browser runtime rather than an older open tab.
