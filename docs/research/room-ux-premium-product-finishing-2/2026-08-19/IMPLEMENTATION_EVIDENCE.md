# ROOM-UX-PPF2 implementation evidence

Date: `2026-08-19`
Status: `PRODUCTION_AND_OWNER_CLIENT_GREEN_AWAITING_OWNER_ACCEPTANCE`
Target release: `3.11.404`

## Evidence passport

- Source/branch: `main@3a1e2c934b30106708d24afaa8533f0bc5ea2ac5` before the scoped commit.
- Relationship at implementation start: `HEAD == refs/remotes/origin/main == git ls-remote origin main`.
- Dirty state: 34 unrelated pre-existing entries remain preserved; only PPF2 paths and approved runtime targets have been touched by this program.
- Production API/Studio/Room/SW and the updated actual owner client are `3.11.404`.
- Evidence-class ledger: `CODE_CURRENT=RUN`, `PRODUCTION_CURRENT=RUN`, `OWNER_CLIENT_READ_ONLY=RUN`, `OWNER_SUPPLIED_SCREENSHOT=NOT_RUN`, `ISOLATED_AUTOMATION=RUN`, `OWNER_REPORTED=APPROVAL_ONLY`, `PHYSICAL_DEVICE=NOT_RUN`, `ASSISTIVE_TECHNOLOGY=NOT_RUN`, `NOT_RUN=FINAL_OWNER_ACCEPTANCE_PENDING`.
- Limitations: screenshots and browser gates are isolated automation, not production, owner-live, physical-device or AT evidence.
- Owner-data safety: no owner-client navigation, provider call, content/progress/list/review/settings/cache mutation or cleanup was invoked. The only owner-client click was the product-owned guarded Update action after production convergence; no Reader was open, so its safe point performed no progress flush. Production owner `review_log` remained `7420 -> 7420`.

## Authority and diff

The owner approved the exact P1–P8 block with `SCOPE=EXACT_PPF2_CONTRAST_ALLOWLIST_ONLY`, then explicitly added the four historical release-lock tests with `CHANGE=VERSION_PIN_3.11.403_TO_3.11.404_ONLY`.

Runtime candidate changes only:

- Library `.learning-home-journey-types`: `--text-faint` → `--text-secondary`.
- Studio `.classic-next-step-label`: `--theme-text-muted` → `--theme-text-secondary`.
- Studio `.v3-onb-features-title`: `#94a3b8` → `#475569`; selector-local because its panel remains a fixed white/light island in all app themes.
- Studio `.app-footer-credit` and `.app-footer-version`: `#94a3b8` → `--theme-text-secondary`.
- Studio/Room/SW release lock: `3.11.403` → `3.11.404`.

No JS behavior, DOM, localized copy, icon, font, global token, `!important`, schema, writer, provider, navigation, storage or cleanup change.

## Red proof

- `node --test tests/premiumProductFinishing2.test.js` before runtime changes: expected failures on the four declarations/release lock.
- `node scripts/premium/premium-product-finishing-2-browser-smoke.js --expect-red`: PASS `5/5`, proving the red harness reproduced:
  - `PPF2-01`: `4.336:1`;
  - `PPF2-02`: `4.373:1`;
  - `PPF2-03`: `2.564:1`;
  - `PPF2-04-credit`: `2.368:1`;
  - `PPF2-04-version`: `2.368:1`.

An initial over-broad red matrix timed out because each anonymous Room load waited for a data-dependent Journey section. That was classified as harness uncertainty. The final harness mounts the exact production class/structure in a deterministic, write-free isolated fixture while retaining current CSS.

## Green proof

- PPF2 static contract: PASS `5/5`.
- PPF2 browser matrix: PASS `208/208` across desktop RU, 380 RU, 380 HE/RTL, 200%-reflow equivalent, dark, auto-light, auto-dark, forced colors and reduced motion.
- Minimum observed green ratios:
  - Library light `6.90:1`, dark `8.68:1`, forced colors `21:1`;
  - Studio next-step light `6.96:1`, dark `6.98:1`, forced colors `19.3:1`;
  - onboarding all app themes `7.58:1`, forced colors `21:1`;
  - footer light `7.00:1`, dark `12.02:1`, forced colors `19.4:1`.
- Every matrix row: zero document overflow, zero page errors, zero non-GET/HEAD requests, correct RU/HE direction.
- Screenshot set visually inspected; see `screenshots/README.md`.

## Regression gates

- i18n: PASS `233/233`.
- Reader parity: PASS.
- Room media: PASS, including persisted `10/12` identity and exact row seek `0.48s`.
- Room B8: unit PASS `30/30`; browser PASS including RU/HE/RTL/320/text-spacing/200% and zero `review_log`/RUM.
- Studio UX maturity: unit PASS `9/9`; browser PASS `92/92`.
- Exact pre-commit source/remote relationship: `HEAD == refs/remotes/origin/main == git ls-remote origin main == 3a1e2c934b30106708d24afaa8533f0bc5ea2ac5`.
- `git diff --check` on the exact PPF2 allowlist: PASS; the four addendum files contain only the authorized release-title/assertion pin changes, while media-host `?v=403` locks remain unchanged.
- Historical VF/media targeted suite: `62/65` assertions pass. Three failures are exact version pins expecting `3.11.403`. The separately audited VF4 residual-a11y suite passes `6/7`; its only failure is the same release-lock condition. Four files therefore require mechanical pin maintenance:
  - `tests/roomUxVf4ResidualA11y.test.js`;
  - `tests/visualFoundations.test.js`;
  - `tests/visualFinishingRoom.test.js`;
  - `tests/visualFinishingStudioShell.test.js`.

Those are verification-contract updates required by approved `P7=TARGET_3_11_404...`, not product failures. The owner supplied the narrow allowlist addendum, and only their `3.11.403` title/assertion pins were changed to `3.11.404`; media-host `?v=403` assertions remain unchanged.

Post-addendum rerun: PASS `72/72` across VF4 residual a11y, Visual Foundations, Room/Studio/Learning-Surfaces Visual Finishing and media-host contracts. PPF2 static contract rerun: PASS `5/5`.

## Pending gates

1. Explicit owner acceptance.

No slice completion is claimed.

## Production and actual owner-client result

- Scoped implementation commit: `0a0ffb13ec547d2f7b33b28abd290e2174a69556`, pushed to `origin/main`.
- A transitional observation found Studio/SW `3.11.404` while API/Room remained `3.11.403`; no completion was claimed during that split window. The next read converged API/Studio/Room/SW on `3.11.404`.
- `/healthz`: `ok=true`; DB and migrations ready; disk `65%`; warning false.
- Remote head equals the scoped commit. Served `/library.html` SHA-256 equals the API shell-integrity value `9c763cb0c65612e5b16cfa1dcd173b56112bf791572acf7fe7069c17e2cbaf16`.
- Actual owner Chrome before update: existing `#room=hub`, RU/LTR, scroll `0,0`, focus `BODY`, shell `3.11.403`, waiting `3.11.404` worker, `review_log=7420`.
- Standard reload intentionally did not bypass the active old worker. The visible product Update control was then used; it reached the non-Reader safe point, activated the waiting worker and reloaded the same route.
- Actual owner Chrome after update: `#room=hub`, shell `3.11.404`, active controller, no waiting worker, scroll `0,0`, focus `BODY`, no horizontal overflow, zero unnamed visible controls and `review_log=7420`.
- The live Journey secondary text resolves to `rgb(71, 85, 105)` on its warm surface and measures `6.9046:1`. A selector-local Kapture screenshot was visually inspected; it was not persisted because it included real owner counters.
