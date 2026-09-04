# Studio source action hierarchy hotfix — 2026-09-04

## Status

Owner testing of release `3.11.462` found a residual navigation defect: opening `Добавить материал` caused a saved-transcript card to appear behind the modal. The follow-up correction is implemented for release `3.11.463`; production and owner-live acceptance remain separate gates until deployment and a fresh ordinary saved-card check.

## Observed problem

The Studio source composer exposed the same lifecycle in several places:

- `Добавить материал` and `Упростить до моего уровня` were current-text actions;
- `Импорт / перенос / восстановление` duplicated the Library Import Center;
- `Черновики` opened Add Material before reaching transcript correction;
- the contextual saved-transcript card repeated `Открыть`, `Черновики`, and `Импорт-центр`.

The result was an unpredictable choice between several controls that led to overlapping destinations. Live production inspection of the owner-provided `Кфар Аза - 1` journey confirmed the duplicate DOM controls and modal route.

## Decision

The source composer owns only actions on the text currently in front of the user:

1. `Добавить материал`;
2. `Упростить до моего уровня`.

The Library owns collection-level lifecycle navigation through its existing `Импорт-центр`. Transcript correction therefore has one visible route: Library → Import Center → Materials → Drafts → Continue correction.

This is a navigation correction, not a storage redesign. Neither the source composer nor the Add Material modal projects saved transcript lifecycle controls.

## Implementation

- Removed the composer-level portability/import action.
- Removed the composer-level drafts action and count.
- Removed the contextual saved-transcript card from the source composer.
- Removed the recent-work transcript shelf from the Add Material modal.
- Removed their dead rendering helpers while preserving the canonical active-workspace data and exact media binding.
- Kept the legacy programmatic workspace-library entry as a compatibility redirect to Import Center → Materials, so stale callers cannot reopen the removed path.
- Added regression contracts for the two-action composer, absence of both transcript projections, and Library-owned correction route.
- Updated browser smoke paths so correction is reached only through Import Center.

## Invariants

- No text, sentence, transcript, table, media, receipt, or schema mutation was added.
- The complete correction lifecycle remains available at Library → Import Center → Materials → Drafts.
- Provider calls remain outside this navigation change.
- Existing unrelated worktree changes and generated screenshots are excluded from the release allowlist.

## Verification

- `node --test tests/studioUxMaturity.test.js tests/portableLearningPackageUi.test.js tests/importCenterCore.test.js` — 39/39 passed.
- `npm run smoke:i18n` — 233/233 passed; locale and page/service-worker version locks agree.
- `npm run smoke:studio-ux-maturity` — static 10/10 and browser 95/95 passed.
- `npm run smoke:media-package:browser` — passed; both transcript projections are absent and the exact corrected revision opens from Import Center before and after reload, with zero page errors.
- 380 px screenshot review — passed: two source actions, no contextual transcript card, no recent-work shelf in Add Material, and no horizontal overflow.

## Acceptance boundary

Automated and browser inspection can establish `TECHNICAL_PASS`. Owner acceptance requires a fresh ordinary production session after deployment: open `Кфар Аза - 1`, click `Добавить материал`, confirm no transcript card appears behind the modal and no recent-work correction shelf appears inside it, then confirm Library → Import Center → Materials → Drafts still opens the correct transcript.
