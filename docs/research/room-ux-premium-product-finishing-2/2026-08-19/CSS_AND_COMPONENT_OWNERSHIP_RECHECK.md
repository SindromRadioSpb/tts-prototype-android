# CSS and component ownership recheck

## Evidence passport

- Evidence-class ledger: `CODE_CURRENT=RUN`, `PRODUCTION_CURRENT=RUN`, `OWNER_CLIENT_READ_ONLY=RUN`, `OWNER_SUPPLIED_SCREENSHOT=NOT_RUN`, `ISOLATED_AUTOMATION=RUN`, `OWNER_REPORTED=PREDECESSOR_CLOSURE_ONLY`, `PHYSICAL_DEVICE=NOT_RUN`, `ASSISTIVE_TECHNOLOGY=NOT_RUN`, `NOT_RUN=EXPLICIT_WHERE_LISTED`.

- Date/source: `2026-08-19`, `main@3a1e2c934b30106708d24afaa8533f0bc5ea2ac5`; `HEAD == refs/remotes/origin/main == git ls-remote origin main`.
- Dirty state: 34 unrelated pre-existing entries preserved; only PPF2 research/planning documents added.
- Production/client: API/Studio/Room/SW/owner Chrome `3.11.403`; health, DB and migrations ready; disk warning false.
- Evidence: `CODE_CURRENT`, `PRODUCTION_CURRENT`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `OWNER_REPORTED`, `NOT_RUN`.
- Limitations/safety: physical device and AT not run; no owner data/settings/provider/cache mutation; `review_log 7420 -> 7420`.

## Ownership conclusion

The promoted family shares a semantic purpose—quiet secondary informational text—but not a behavior owner. Library and Studio keep their own selectors and theme variables. This is a serialized accessibility correction, not a new shared component or design-system layer.

| Candidate | Exact presentation owner | Truth/behavior owner preserved | Allowed strategy | Rejected expansion |
|---|---|---|---|---|
| `PPF2-01` | `public/library.html` `.learning-home-journey-types` | Library Journey projection | selector-local `var(--text-secondary)` | global Library palette/token rewrite |
| `PPF2-02` | `public/index.html` `.classic-next-step-label`, `#classicPhaseLabel` | Classic phase/status logic | existing Studio semantic secondary role | phase logic, copy or component restructure |
| `PPF2-03` | `public/index.html` `.v3-onb-features-title` | onboarding visibility/state | existing Studio semantic secondary role | onboarding IA or first-run behavior |
| `PPF2-04` | `public/index.html` footer credit/version selectors | release/about navigation and version truth | existing Studio semantic secondary role | footer structure, link behavior or version semantics |
| `PPF2-05` backlog | `public/reader-core.js` plus parity copy in `public/index.html` and locale catalogs | shared bilingual-table interaction contract | later dedicated parity/localization slice | hiding Russian strings with CSS/pseudo-content |
| `PPF2-06` backlog | individual Studio field/label owners | form-specific interaction logic | later reachable-field audit | blanket aria-label injection or selector-count cleanup |

## Specificity strategy

1. Change only the declarations owned by the four failing selector groups.
2. Reuse existing surface semantic variables; do not add a new global token.
3. Do not use `!important`, inline JS style mutation, pseudo-content copy, selector duplication or specificity escalation.
4. Preserve light/dark/auto and forced-colors behavior. Verify computed color at the exact failing nodes.
5. Keep behavior, DOM order, sizes and geometry byte-for-byte unless a test fixture must identify the selector.

## Shared versus local contract

The shared contract is presentation-level: secondary normal text must meet `4.5:1` in every supported scheme. The implementation remains surface-local because Library and Studio have different backgrounds, tokens and release risks. Reader/Studio bilingual-table action names genuinely share a behavior contract, which is precisely why they are not folded into the contrast correction.

## Prospective allowlist after approval

- `public/index.html`
- `public/library.html`
- `public/sw.js`
- `tests/premiumProductFinishing2.test.js` (new)
- `scripts/premium/premium-product-finishing-2-browser-smoke.js` (new)
- `docs/planning/ROOM_UX_PREMIUM_PRODUCT_FINISHING_2_IMPLEMENTATION_PACKET_2026_08_19.md` (new)
- `docs/research/room-ux-premium-product-finishing-2/2026-08-19/IMPLEMENTATION_EVIDENCE.md` (new)
- implementation screenshots only if they prove the approved acceptance matrix.

Everything else is stop-listed, including locales, reader JS, fonts, icons, schema/migrations, providers, data writers, navigation, B9, group-cache revocation and cleanup.

## Compatibility and rollback

Static old/new SW compatibility is required because HTML and SW stamps change together while no persisted format changes. Rollback is the previous three runtime files (`index.html`, `library.html`, `sw.js`) and prior release; no DB, storage or owner-data rollback exists or is needed.
