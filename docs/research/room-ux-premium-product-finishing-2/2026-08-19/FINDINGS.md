# ROOM-UX-PPF2-R findings

## Evidence passport

- Evidence-class ledger: `CODE_CURRENT=RUN`, `PRODUCTION_CURRENT=RUN`, `OWNER_CLIENT_READ_ONLY=RUN`, `OWNER_SUPPLIED_SCREENSHOT=NOT_RUN`, `ISOLATED_AUTOMATION=RUN`, `OWNER_REPORTED=PROTOCOL_PASS`, `PHYSICAL_DEVICE=NOT_RUN`, `ASSISTIVE_TECHNOLOGY=NOT_RUN`, `NOT_RUN=EXPLICIT_WHERE_LISTED`.

- Date/source: `2026-08-19`, `main@3a1e2c934b30106708d24afaa8533f0bc5ea2ac5`; `HEAD == refs/remotes/origin/main == git ls-remote origin main`.
- Dirty state: 34 unrelated pre-existing entries preserved; only PPF2 research/planning documents added.
- Production/client: API/Studio/Room/SW/owner Chrome `3.11.404`; health, DB and migrations ready; disk warning false.
- Evidence: `CODE_CURRENT`, `PRODUCTION_CURRENT`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `OWNER_REPORTED`, `NOT_RUN`.
- Limitations/safety: no physical-device or AT run; owner data/settings/providers/caches unchanged; `review_log 7420 -> 7420`.

## Finding

LinguistPro is compositionally finished enough that no new visual-finishing portfolio, theme rewrite or cross-surface modernization is justified. One current accessibility necessity remains: four secondary/informational text selector groups in Library/L0 and Studio fail the normal-text `4.5:1` light-mode contrast contract.

Recommendation: `ACCESSIBILITY_NECESSITY_ONLY`.

The bounded slice preserves `B_EDITORIAL_CALM`, uses existing semantic text-color roles, changes no geometry or behavior, and has a static rollback. Production, SW and the updated actual owner client converged, and the owner explicitly accepted it.

## Candidate disposition

- `GO`: `PPF2-01` through `PPF2-04`, implemented together as one contrast-only accessibility slice.
- `BACKLOG`: `PPF2-05`, localized names for shared Reader/Studio table note/edit/resize controls.
- `BACKLOG`: `PPF2-06`, reachable Studio form-label audit; aggregate browser issue counts are insufficient.
- `ROUTE_TO_OTHER_LANE`: B9, group-corpus cache revocation, writers/schema/provider/telemetry/navigation/content lifecycle/audio truth/storage or production cleanup.
- `NO_GO`: broad design-system/theme rewrite, source-count cleanup, full-surface modernization and reopening accepted VF0–VF5 composition.

## Current proof

- Head/source/live remote agree; served hashes agree with current normalized source.
- Production is healthy at `3.11.404`; actual owner client is also `3.11.404` and stable/read-only.
- Current targeted tests are green: visual/media `72/72`, i18n `233/233`, reader parity PASS, B8 `30/30` plus browser PASS, Studio `9/9` and browser `92/92`, Room media PASS with exact `0.48s` seek fixture.
- Mobile Lighthouse is `96` for both surfaces but identifies the four exact contrast failures; a score does not erase failed nodes.
- No screenshot was captured because computed colors, ratios and exact DOM selectors are the decisive evidence.

## Closure

The owner approved, shipped and accepted only `PPF2-01..04`. `PPF2-05` and `PPF2-06` remain backlog without implementation authority. The accepted result does not reopen VF0–VF5 or authorize another premium-finishing portfolio.
