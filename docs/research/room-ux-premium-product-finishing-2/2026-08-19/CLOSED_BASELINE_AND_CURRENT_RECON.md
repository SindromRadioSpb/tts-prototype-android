# Closed baseline and current recon

## Evidence passport

- Evidence-class ledger: `CODE_CURRENT=RUN`, `PRODUCTION_CURRENT=RUN`, `OWNER_CLIENT_READ_ONLY=RUN`, `OWNER_SUPPLIED_SCREENSHOT=NOT_RUN`, `ISOLATED_AUTOMATION=RUN`, `OWNER_REPORTED=PREDECESSOR_CLOSURE_ONLY`, `PHYSICAL_DEVICE=NOT_RUN`, `ASSISTIVE_TECHNOLOGY=NOT_RUN`, `NOT_RUN=EXPLICIT_WHERE_LISTED`.

- Date/source: `2026-08-19`, `main@3a1e2c934b30106708d24afaa8533f0bc5ea2ac5`.
- Relationship: `HEAD == refs/remotes/origin/main == git ls-remote origin main`.
- Dirty: 34 unrelated entries preserved; no runtime target was modified.
- Production/client: API/Studio/Room/SW/owner Chrome `3.11.403`; health, DB and migrations ready; disk 64%, warning false.
- Evidence: `CODE_CURRENT`, `PRODUCTION_CURRENT`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `OWNER_REPORTED`, `NOT_RUN`.
- Limitations/safety: no physical/AT run and no owner/provider/content/settings/cache mutation; `review_log 7420 -> 7420`.

## What VF0-VF5 actually shipped

| Slice | Closed outcome |
|---|---|
| VF0 | additive shared presentation roles, provenanced static SVG sprite, focus/status/type/motion, forced-colors and reduced-motion foundations |
| VF1 | Library/L0/corpus editorial hierarchy, localized identity/actions and fallback-first icons |
| VF2 | Reader, Morph, Trainer and Mentor visual finishing without learner-truth changes |
| VF3 | Studio Classic/IDE shell identity, focus, state and motion finishing |
| VF4 | Room/Studio row-audio non-color markers and localized action/state parity |
| bounded VF5 correction | restored persisted row/media identity projection and exact Room row replay/seek; no visual/CSS/locale expansion |

VF0-VF4 were owner accepted at production `3.11.399`. The one post-closure media correction was closed at `3.11.403`. There is no implicit VF6.

## Frozen V1-V10 contracts

```text
V1=B_EDITORIAL_CALM
V2=VENDORED_SVG_PLUS_FIRST_PARTY_MARKS
V3=EXISTING_FONTS_EXPLICIT_SCRIPT_ROLES
V4=SEMANTIC_STATUS_TOKENS_V1
V5=BOUNDED_EDITORIAL_DENSITY
V6=MOTION_0_120_140_160_180
V7=SHARED_STATE_ANATOMY_LOCAL_ACTIONS
V8=FOUNDATIONS_SHARED_COMPONENTS_LOCAL
V9=SERIALIZED_VF0_VF3_ALLOWLIST
V10=VERSION_SW_LOCK_AND_VISUAL_ROLLBACK
```

Also frozen: Library/L0 versus corpus-local ownership; vertical typed rows; bounded previews; existing progress/Finished/bookmark/note/list/review/audio/provider writers; no timing interpolation; no B9 or cache-revocation absorption.

## Current repository and production

- `git diff 05586614..HEAD` contains documentation/evidence only; current runtime is the accepted `3.11.403` correction.
- Production shell-integrity hashes match CRLF-normalized current source for Library, Library UI, Reader CSS/JS, media host and RU/EN/HE locales.
- Current release read-back: API `3.11.403`, Studio `3.11.403`, Room `3.11.403`, SW `3.11.403`.
- `/healthz`: `ok=true`, DB ready, migrations ready, disk 64%, warning false.
- Actual owner Room baseline: `#room=mytexts`, RU/LTR, 1920x911, no update action, no overflow. The final hidden-tab read reported `#room=hub` without any research navigation/click; this limitation is recorded in `LIVE_OWNER_CLIENT_EVIDENCE.md` and was not forcibly reversed.

## Current automated baseline

- VF/current media targeted tests: `72/72`.
- i18n: `233/233`.
- Reader parity: PASS.
- Room B8: unit `30/30` plus 320/380/200%, RTL/reflow/zero-write browser PASS.
- Studio UX maturity: unit `9/9`, browser `92/92`.
- Room media: PASS including `510/544` identity contract and exact `0.48s` seek fixture.

## Accepted backlog and routed work

- B9: `FROZEN · NO IMPLEMENTATION · NO MIGRATION`.
- `GROUP-CORPUS-CACHE-REVOCATION`: separate security lane.
- Storage cleanup, production cleanup, provider/telemetry, schema/migration and content lifecycle: outside PPF2.
- Physical iPhone/Android and VoiceOver/NVDA/JAWS/TalkBack: `NOT_RUN`, not inferred.
- Russian shared-table names under EN/HE and legacy form-label issues: explicit backlog pending a separately approved name/label slice.

## New question and answer

Current workflow evidence does not support general visual finishing. It does support one accessibility-only correction: exact low-contrast secondary text on light Library/Studio surfaces. Research does not authorize implementation; owner approval of P1-P8 is still required.
