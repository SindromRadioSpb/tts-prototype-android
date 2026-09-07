# Studio / Reading Room discovery and Import Center

Date: 2026-09-07. Status: PRODUCTION VALIDATION PASS. One owner-authorized goal covers all three tasks, scoped implementation, commit/push, production deployment and browser verification with repair/retest.

## Evidence and authority

- Baseline: `main`, `a07c8e28`; production runtime and fresh API verified at `3.11.484` (an older owner tab showed `3.11.483`). HEAD and origin/main match the running image.
- Owner request: Studio familiarity sorting and card percentages; consistent full-featured corpus discovery based on Studio; human-readable Import Center without functional loss.
- Existing unrelated changes were inventoried before edits. They are excluded from staging and test screenshot destinations.
- Predecessors: `ROOM_CORPUS_DISCOVERY_CATALOG_CONTRACT_APPROVAL_2026_08_15.md`, `ROOM_LIBRARY_CORPUS_SURFACE_UNIFICATION_DECISION_PACKET_2026_08_14.md`, `STUDIO_INGEST_P4_IMPORT_CENTER_IMPLEMENTATION_PACKET_2026_08_02.md`.
- Existing canonical learning projection and `recorded-familiarity-v2` remain the sole basis of familiarity. No review, source, publication, or learner-state writer is added. B9 stays frozen. No schema migration is planned.

## Delivery sequence

1. Inventory live behavior, source adapters, existing tests and capability differences; capture baseline browser evidence.
2. Add a shared discovery contract and Studio familiarity projection/badges with meaningful regression tests.
3. Integrate consistent controls, removable active filters, reset, tag matching, smart filters, search scopes and deterministic sorting across applicable corpus adapters. Preserve catalog boundaries, pagination, source-specific filters and authorization.
4. Rework Import Center around user intent, next steps and explicit outcomes. Keep all import, preview, confirmation, export, restore, history, recovery and diagnostic operations reachable.
5. Test real browser flows on isolated data, desktop and 380px RU/EN/HE RTL; test failure/retry, empty states and asynchronous changes. Inspect screenshots and fix defects.
6. Run relevant regression/API/i18n/version gates, allowlisted commit/push, monitor exact production version/image and health, repeat browser checks, fix/redeploy if necessary.

## Recon findings

- Studio already provides level/provider, text/row/note search, tag ALL/ANY, facets and eight smart filters. It has no familiarity sort or badge and has a 2,000-row light-list cap.
- Room My Texts uses bounded DB pagination, smart filters, levels and tags, plus familiarity sorting. Tags are limited to an eight-tag preview and active chips cannot be removed individually.
- Group corpora use separate status/audio/tag/smart filters and another sorting implementation.
- Public corpora expose title/creator/audio filters and familiarity sorting, but lack the personal/tag discovery features.
- Ben-Yehuda has its own title/author/full-text pipeline, periods, language/genre, readiness and personal facets. Preserve its corpus-scale loading and deliberate catalog transitions.
- `corpusFilterChrome` is a shared visual shell only; its active chips are inert labels. Evolution should give it a typed state/control contract rather than introduce another parallel toolbar.
- Import Center already has safe portable-package workflows, but prominent copy exposes internal histories, hashes and lifecycle stages before explaining the user's result.

## Product and architecture review

- R2/R8: familiarity is a lower bound on recorded vocabulary, never comprehension or a learning assignment.
- R4/R6: stable search/sort placement; recognizable filters; meaningful active chips and one reset; metadata only where real; mobile/RTL and keyboard behavior are release gates.
- R9/R11: source and personal metadata remain distinguishable, missing data remains unknown, filter and sort order must agree with visible controls.
- R12/R13: reuse current aggregate caches and importer transactions; no parallel canonical registry or persistence migration.
- R14/R15/R16: authorized source adapters only; personal search remains local; no automatic provider calls, owner-profile test writes or source publication changes.

## Visual direction

Reuse the app's theme tokens (light base `#ffffff`, muted surface `#f8fafc`, text `#0f172a`, secondary `#64748b`, accent `#2563eb`, divider `#cbd5e1`) and existing font stack, with dark-theme variables respected. Align controls to the reading direction. Use a compact search/sort row, progressive filter disclosure, and wrapping active chips. The Import Center leads with an action and its outcome, then selection and review; technical detail is secondary disclosure. No new font, decorative hero or theme program.

## Validation / release ledger

Implementation is present in the working tree. Durable evidence is being recorded under `docs/research/studio-room-discovery-import/2026-09-07/`. Browser automation is separate from physical iPhone/VoiceOver owner acceptance.

## Implementation / local progress

- Shared `CatalogDiscovery` parsing, tag/provider semantics and recorded-familiarity comparator; `CatalogDiscoveryUI` provides common labeled controls, eight smart filters, all-tag search, removable active filters and reset that preserves sorting.
- Studio card percentages reuse the Room projection and exact cache identities. Missing profiles and unsupported/uncertain analysis remain distinct from 0%. A cancellable worker analyzes one local material at a time; no learner/review writer is added.
- My Texts keeps DB keyset pages. Public/group/Ben catalogs use the shared controls and their existing authorized adapters. Published tags, level, topic, row count and provider summaries are bounded read-only projections of immutable snapshots.
- Canonical word-note occurrences now participate consistently in note search, smart filters and counts. Personal metadata overlays remain separate from corpus sources.
- Import Center opens with Add / Restore / Back up. Material selection is explicit, archive and snapshot stay reachable, legacy JSON and verification details use disclosures. Dry-run generation guards reject superseded files; failed Apply retains a working retry; focus survives replaced controls.
- Local browser fixtures prove 65-row pagination, last-page queries, canonical notes, provider filtering, rare tags, selected sorting, 75%/25% Studio order and cold worker analysis. Real portable archive import, duplicate import, invalid-file retry, transient Apply retry and export were exercised.
- Browser-found fixes: missing locale accessor in shared comparator; canonical-note count mismatch; provider-select width and sheet border overflow at 380px; lost keyboard focus after importer status replacement. Tests rerun after each fix.
- Automated checks run so far: first focused suite 97/97; publication domain and metadata cases validated after correcting the new test fixture's required public-read permission. Final unit suite 1365/1365, i18n 233/233, shell gates 321/321 and API smoke PASS. Production code release `c06a1bca` is live at 3.11.485.
- Evidence path: `docs/research/studio-room-discovery-import/2026-09-07/local/`. `DISCOVERY_FOCUS=studio` is a bounded debugging mode, not the final comprehensive gate. `DISCOVERY_LIVE=1` uses live public catalogs with temporary browser-local fixtures only.

- Release cohort: `3.11.485`; exact 43-path shell integrity verified against service-worker cache. Studio and Room both reopen offline. New module imports, local DB, locale version and stylesheet cohort are aligned.
- Visual review found dark foreground token mismatches; corrected Room and Import Center tokens, checked text contrast >=4.5:1, and reran comprehensive browser flows.

## Production closure

- `c06a1bca167085775664d0da79c7579de83145bb` deployed as the sole application container; five consecutive `/healthz` and version probes passed with DB/migrations ready.
- Live public Materials PB2, Study Songs and Physics catalogs expose bounded immutable metadata and pass real title searches with common controls. Ben-Yehuda search is awaited through actual results, including full-text completion.
- Comprehensive isolated-browser scenarios repeat on production; exact 43-file shell integrity and both offline reopen paths pass. Five consecutive My Texts reloads are included. Protected group flows remain locally verified with membership fixtures.
- One exploratory reload hit the generic Room boot-error page without a captured cause. It did not reproduce in the diagnostic rerun. The harness now waits for the initial My Texts surface before seeding, captures console/network diagnostics, and verifies five subsequent reloads. No unproven application fix is claimed for that isolated observation.
- Runtime `/healthz` also reports an 83% disk-use warning; service, DB and migrations remain ready. This release does not perform infrastructure cleanup. Physical iPhone/VoiceOver acceptance remains separate.
