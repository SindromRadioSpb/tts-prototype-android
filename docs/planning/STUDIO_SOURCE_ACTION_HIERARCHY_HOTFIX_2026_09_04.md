# Studio source action hierarchy hotfix — 2026-09-04

## Status

Implemented and locally verified for release `3.11.462`. Production and owner-live acceptance remain separate gates until the scoped commit is deployed and the owner checks the ordinary saved-card journey.

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

The Library owns collection-level lifecycle navigation through its existing `Импорт-центр`. The contextual transcript card remains because it identifies the exact saved media revision already attached to the current text, but it has exactly one action: `Исправить транскрипт` (`Edit transcript`, `עריכת התמלול`).

This is a navigation and wording correction, not a storage redesign. The Add Material modal retains its single bounded recent-work shortcut; the complete draft/material list remains in Import Center.

## Implementation

- Removed the composer-level portability/import action.
- Removed the composer-level drafts action and count.
- Removed the duplicate drafts and Import Center actions from the contextual transcript card.
- Renamed its remaining generic `Открыть` action to the explicit task `Исправить транскрипт` in RU, EN, and HE.
- Removed dead rendering code for the deleted composer draft entry.
- Added regression contracts for the two-action composer, one-action contextual card, Library-owned hub, and all three labels.
- Updated the browser smoke path so it reaches correction through Import Center rather than the removed composer shortcut.

## Invariants

- No text, sentence, transcript, table, media, receipt, or schema mutation was added.
- The exact saved revision still opens directly from the contextual card.
- The complete correction lifecycle remains available at Library → Import Center → Materials → Drafts.
- Provider calls remain outside this navigation change.
- Existing unrelated worktree changes and generated screenshots are excluded from the release allowlist.

## Verification

- `node --test tests/studioUxMaturity.test.js tests/portableLearningPackageUi.test.js tests/importCenterCore.test.js` — 39/39 passed.
- `npm run smoke:i18n` — 233/233 passed; locale and page/service-worker version locks agree.
- `npm run smoke:studio-ux-maturity` — static 10/10 and browser 92/92 passed.
- `npm run smoke:media-package:browser` — passed, including one contextual action, direct correction, Import Center draft correction after reload, RU/HE mobile layouts, and zero page errors.
- 380 px screenshot review — one contextual action and two source actions; no horizontal overflow.

## Acceptance boundary

Automated and browser inspection can establish `TECHNICAL_PASS`. Owner acceptance requires a fresh ordinary production session after deployment: open `Кфар Аза - 1`, confirm the source composer has only the two current-text actions, confirm the contextual card has only `Исправить транскрипт`, and confirm Library → Import Center → Materials → Drafts still opens the correct transcript.
