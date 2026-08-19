# ROOM-UX-PPF2 — contrast-only implementation packet

Date: `2026-08-19`
Status: `SCOPED_COMMIT_CREATED_PUSH_PENDING`
Approved slice: `PPF2-01..04`
Target release: `3.11.404`

## Authority

Owner approval received verbatim:

```text
APPROVE ROOM-UX-PPF2-R:
P1=ACCESSIBILITY_NECESSITY_ONLY;
P2=LIBRARY_L0_JOURNEY_AND_STUDIO_CLASSIC_ONBOARDING_FOOTER_SECONDARY_TEXT_AA;
P3=ONE_CONTRAST_SLICE_PPF2_01_TO_04_BACKLOG_PPF2_05_06;
P4=KEEP_B_EDITORIAL_CALM_EXISTING_TYPOGRAPHY_ICONS_LOCALES_RTL;
P5=NORMAL_TEXT_MIN_4_5_NO_INTERACTION_STATE_OR_MOTION_CHANGE;
P6=SURFACE_LOCAL_SELECTORS_EXISTING_SEMANTIC_TOKENS_NO_GLOBAL_REWRITE;
P7=TARGET_3_11_404_FULL_GATES_SW_CONVERGENCE_STATIC_ROLLBACK;
P8=IMPLEMENT_DEPLOY_UPDATE_ACTUAL_OWNER_CLIENT_THEN_OWNER_ACCEPTANCE;
SCOPE=EXACT_PPF2_CONTRAST_ALLOWLIST_ONLY;
```

No authority is granted for `PPF2-05`, `PPF2-06`, global tokens, localized copy, behavior, data, providers, schema, navigation, storage or cleanup.

Owner allowlist addendum received verbatim:

```text
APPROVE ROOM-UX-PPF2-R ALLOWLIST ADDENDUM:
ADD=tests/roomUxVf4ResidualA11y.test.js,tests/visualFoundations.test.js,tests/visualFinishingRoom.test.js,tests/visualFinishingStudioShell.test.js;
CHANGE=VERSION_PIN_3.11.403_TO_3.11.404_ONLY;
```

This adds only mechanical `3.11.403` to `3.11.404` release-pin maintenance in those four tests. Their media-host `?v=403` assertions and every behavior contract remain unchanged.

## Implementation passport

- Source/branch: `main@3a1e2c934b30106708d24afaa8533f0bc5ea2ac5` at approval start.
- Relationship: `HEAD == refs/remotes/origin/main == git ls-remote origin main` at approval start.
- Dirty state: 34 unrelated pre-existing entries preserved; PPF2 research/decision documents were the only prior session additions.
- Production/client baseline: API/Studio/Room/SW/actual owner Chrome `3.11.403`; `/healthz` green, DB/migrations ready, disk 64%, `disk_warn=false`.
- Evidence-class ledger: `CODE_CURRENT=RUN`, `PRODUCTION_CURRENT=RUN`, `OWNER_CLIENT_READ_ONLY=RUN`, `OWNER_SUPPLIED_SCREENSHOT=NOT_RUN`, `ISOLATED_AUTOMATION=RUN`, `OWNER_REPORTED=APPROVAL_ONLY`, `PHYSICAL_DEVICE=NOT_RUN`, `ASSISTIVE_TECHNOLOGY=NOT_RUN`, `NOT_RUN=EXPLICIT_WHERE_LISTED`.
- Limitations: physical-device and AT speech evidence remain separate and unclaimed.
- Owner-data safety: owner client remains read-only; no TTS/ASR/MT/LLM, content, progress, review, list, group, setting, provider or cache write is permitted. `review_log` must remain unchanged.

## Exact behavior boundary

| ID | Selector | Red | Green declaration | Behavior owner |
|---|---|---:|---|---|
| `PPF2-01` | Library `.learning-home-journey-types` | `4.34:1` light | `color: var(--text-secondary)` | presentation only |
| `PPF2-02` | Studio `.classic-next-step-label` including `#classicPhaseLabel` | `4.37:1` light | `color: var(--theme-text-secondary)` | presentation only |
| `PPF2-03` | Studio `.v3-onb-features-title` | `2.56:1` on white | `color: #475569` | presentation only |
| `PPF2-04` | Studio `.app-footer-credit`, `.app-footer-version` | `2.36:1` light | `color: var(--theme-text-secondary)` | presentation only |

The onboarding panel is a fixed white/light island in every app theme. A dark-aware `--theme-text-secondary` would resolve to `#cbd5e1` in dark/auto-dark and fail on the unchanged white panel. `#475569` is the existing Studio light semantic-secondary value and is therefore reused selector-locally; no new token, theme rewrite or neighboring onboarding restyle is introduced.

## Red/green contract

Before runtime edits:

- `tests/premiumProductFinishing2.test.js` must fail on the missing approved declarations.
- `scripts/premium/premium-product-finishing-2-browser-smoke.js --expect-red` must reproduce all five failing DOM nodes across the four candidate groups.

After runtime edits:

- every target node must be `>=4.5:1` in light, dark, auto-light, auto-dark and forced colors;
- RU/HE, 380×844 and a 200%-reflow equivalent must have no document overflow;
- focus, names, roles, values, DOM order, geometry, motion and behavior remain unchanged;
- all requests remain GET/HEAD in the isolated PPF2 smoke;
- release literals in Studio, Room and SW equal `3.11.404`;
- existing targeted, i18n, parity, B8, Studio and Room-media gates remain green.

## Exact implementation allowlist

- `public/index.html`
- `public/library.html`
- `public/sw.js`
- `tests/premiumProductFinishing2.test.js`
- `tests/roomUxVf4ResidualA11y.test.js` — version pin only
- `tests/visualFoundations.test.js` — version pin only
- `tests/visualFinishingRoom.test.js` — version pin only
- `tests/visualFinishingStudioShell.test.js` — version pin only
- `scripts/premium/premium-product-finishing-2-browser-smoke.js`
- this implementation packet
- `docs/research/room-ux-premium-product-finishing-2/2026-08-19/IMPLEMENTATION_EVIDENCE.md`
- `docs/research/room-ux-premium-product-finishing-2/2026-08-19/screenshots/**`
- the already-created PPF2 research and decision documents.

## Stop list

Stop for renewed owner direction if any global token, `!important`, JS behavior, localized copy, icon/font, schema/migration, writer, provider/telemetry, audio truth, navigation/IA, B9, group-cache revocation, storage cleanup, production cleanup or non-allowlisted runtime file becomes necessary.

## Release and rollback

The static release set is Studio `index.html`, Room `library.html` and `sw.js`. Old/new combinations must remain safe because there is no persisted/API format change. Rollback restores the `3.11.403` versions of those three files and redeploys; no DB/data/cache deletion is authorized.

Completion requires green code/browser gates, visual inspection, scoped commit/push, production API/Studio/Room/SW convergence, updated actual owner client, read-only production smoke and explicit owner acceptance.
