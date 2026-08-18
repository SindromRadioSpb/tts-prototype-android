# CSS token ownership and debt recheck

Artifact date: `2026-08-16`

## Evidence passport

- Source/branch: `main@d3c2e2cc4fde6fefa1b75c5769b93de8dad542a0`; local/remote match.
- Dirty: 34 unrelated entries preserved; VF5 adds documentation only.
- Production/client: Room/Studio/API/SW/owner Chrome `3.11.399`; no update.
- URLs: `https://linguistpro.kolosei.com/library.html`, `https://linguistpro.kolosei.com/index.html`.
- Health: green; disk 86% warning, no cleanup.
- Evidence: `CODE_CURRENT`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `AUTOMATED_LOCAL`.
- Limitations/safety: counts are topology, not reachability or user harm; no deletion/cascade experiment or owner mutation.

## Current counts

| Owner | inline `style=` | `!important` | custom-property definitions | `:focus-visible` | reduced-motion blocks | forced-colors blocks |
|---|---:|---:|---:|---:|---:|---:|
| `visual-foundations.css` | 0 | 0 | 225 | 2 | 1 | 1 |
| `library.html` | 1 | 20 | 47 | 87 | 12 | 2 |
| `index.html` | 446 | 347 | 164 | 37 | 20 | 1 |
| `reader-core.css` | 0 | 48 | 67 | 6 | 1 | 1 |
| `reader-morph.css` | 0 | 1 | 53 | 14 | 3 | 1 |

Counts are unchanged from VF4. Current production bytes match current source, the owner Studio layout has zero page overflow, and the relevant visual/browser gates are green.

## Ownership

```text
visual-foundations.css -> shared additive roles and aliases
reader-core.css/js     -> shared bilingual table presentation/behavior
reader-morph.css       -> Morph/provenance/SRS presentation
library.html/ui.js     -> Room/L0/corpus composition and local actions
index.html             -> Studio Classic/IDE composition and specificity
```

Audio, learner, progress, review, provider and persistence truth remain outside CSS. The Studio `QuotaExceededError` is owned by presentation persistence/localStorage capacity; changing CSS cannot solve it.

## Specificity/debt decision

`CSS_DEBT_ONLY=NO_GO`.

- Raw counts are not a visible regression.
- Broad cleanup reaches Studio shell, tables, media, import, provider, modal and mobile paths.
- Current shared and surface gates are green.
- The blast radius and requalification cost exceed the harm of leaving accepted debt.
- No selector, alias, token, inline style or `!important` removal list is authorized.

Compatibility aliases remain intentional. A future concrete defect must identify one cascade owner, exact red/green state and smaller rollback before any CSS re-entry.
