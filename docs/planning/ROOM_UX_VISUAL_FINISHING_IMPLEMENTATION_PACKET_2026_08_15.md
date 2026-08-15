# ROOM-UX-VF — Visual Finishing implementation packet

> Date: 2026-08-15  
> Status: `VF0_PRODUCTION_PASS_OWNER_REVIEW_PENDING`  
> Owner approval: `Рекомендации утверждаю. Стартуй` (2026-08-15), normalized to the exact recommended V1–V10 values in the decision packet  
> Source commit: `12dacd9a403ff8db2b7ad2dd20abf98e6c241386`  
> Branch: `main`; `origin/main` matched the source commit at preflight  
> Worktree: `DIRTY`; 34 entries pre-dated ROOM-UX-VF research, and the untracked research packet added two scoped entries. All VF0 runtime targets were clean at preflight.  
> Production: `https://linguistpro.kolosei.com/library.html`, served `3.11.388` at approval  
> Evidence classes: `CODE`, `OWNER_APPROVAL`, `OWNER_REPORTED`, `OWNER_LIVE_READ_ONLY`, `ISOLATED_AUTOMATION`, `EXTERNAL_PRIMARY`  
> Limitations: this packet starts VF0 only. The owner-reported desktop Chrome 200% pass is not physical-mobile or assistive-technology evidence, and it is not VF1–VF3 evidence.

## 1. Approved contract

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
SCOPE=BOUNDED_VISUAL_FINISHING_ONLY
```

The visual thesis is **editorial calm, operational clarity**. The current Option B information architecture, row grammar, canonical writers and learner truth remain unchanged.

## 2. Serialized implementation

Only one slice may change shared contracts at a time.

| Slice | State | Boundary |
|---|---|---|
| VF0 foundations | `PRODUCTION_PASS_OWNER_REVIEW_PENDING` | additive tokens/utilities, vendored icon assets, shell links, SW/version lock; no component adoption |
| VF1 Room shell/L0/corpora | `BLOCKED_BY_VF0_OWNER_REVIEW` | icon/type/focus/state/alignment only |
| VF2 Reader/Morph/Trainer/Mentor | `BLOCKED_BY_VF1_GATE` | repeated visual primitives only; Reader/FSRS/provider behavior frozen |
| VF3 Studio shell | `BLOCKED_BY_VF2_GATE` | narrow shell adoption; no workflow or component-platform rewrite |

## 3. VF0 exact allowlist

- `public/css/visual-foundations.css` — new additive shared primitives and low-specificity utilities.
- `public/icons/linguistpro-ui.svg` — new static sprite: bounded Lucide system subset plus first-party LP/surface marks.
- `public/icons/lucide-LICENSE.txt` — upstream ISC and Feather-derived MIT notices.
- `public/icons/linguistpro-ui.PROVENANCE.md` — upstream tag/commit, source paths and SHA-256 hashes.
- `public/index.html` — one early stylesheet link and exact served version only.
- `public/library.html` — one early stylesheet link and exact footer version only.
- `public/sw.js` — precache the new runtime assets and bump the cache version.
- `tests/visualFoundations.test.js` — VF0 contract, compatibility and licence gates.
- `docs/planning/ROOM_UX_VISUAL_FINISHING_DECISION_PACKET_2026_08_15.md` — owner-approval record only.
- `docs/research/room-ux-visual-finishing/2026-08-15/FINDINGS.md` — gate-status update only.
- `docs/research/room-ux-visual-finishing/2026-08-15/VF0_IMPLEMENTATION_EVIDENCE.md` and bounded VF0 screenshots — implementation evidence.
- this packet.

No package version, locale bundle, JS behavior, schema, migration, data, provider, telemetry, B9 or security-lane file is in VF0.

## 4. VF0 design and ownership contract

### Foundations

- Reuse the existing Studio `--theme-*` light/dark primitives; do not invent a competing palette.
- Expose only `--lp-*` role aliases for typography, surfaces, status, spacing, radii, elevation, focus and motion.
- Provide Room compatibility aliases, but load the foundation before existing surface CSS so the current local values remain authoritative during the compatibility release.
- Do not use a universal reset, `@layer`, `!important`, global element restyling or component selectors in VF0.
- Existing Studio/Room duplicate definitions remain temporarily as the fallback for old HTML/new SW and new HTML/old SW. A contract test prevents value drift until their serialized removal is approved.

### Icons

- Vendor no runtime package. Pin Lucide `1.27.0` at commit `4aec3f892fd6c23063bc2fead83c899b5d412b1c`.
- Allow at most 24 audited system symbols. Store upstream source hashes and the complete ISC/MIT notices.
- Keep identity marks first-party. System icons use `currentColor` and no embedded script, external link, font or text.
- VF0 does not replace a live emoji. Consumers in VF1–VF3 must keep a localized text/Unicode fallback for one compatibility release.
- In future consumers, the named control owns its accessible name and the icon is `aria-hidden="true"`; decorative icons are never announced.
- Only explicitly directional arrows may mirror in RTL. Media transport, status and product marks never mirror automatically.

### Motion and state

- Durations are `0/120/140/160/180 ms` for truth/hover/continuity/disclosure/overlay.
- `prefers-reduced-motion: reduce` makes all foundation durations zero and disables the optional spin utility.
- Status tokens are presentation roles only. They cannot infer loading, offline, error, learner progress or provider truth.

## 5. Compatibility and rollback

| Scenario | Required behavior |
|---|---|
| old HTML + new SW | old surface CSS and emoji/text continue to work; unused new assets are harmless |
| new HTML + old SW | foundation is fetched by the normal same-origin runtime strategy; legacy surface CSS remains a complete fallback |
| sprite fetch failure | VF0 has no live sprite consumer, so no control can become blank |
| CSS fetch failure | legacy inline/surface styles remain complete |
| rollback | restore prior HTML/SW version and remove the two new shell references; no data rollback |

## 6. Required gates before commit

1. Red test proves missing VF0 assets/contracts fail before implementation; the same test is green after implementation.
2. Existing B0–B8/audio, i18n and Reader parity gates remain green.
3. New CSS contains no global reset, component adoption or `!important`.
4. Sprite is parseable XML, has the exact allowlisted IDs, contains no executable/external content and remains under the bounded size budget.
5. Licence/provenance pin the exact upstream revision and source hashes.
6. Studio APP_VERSION, Room footer, SW CACHE_VERSION and `/api/client-config` source remain one release.
7. New CSS and sprite are precached before any future component reference.
8. Isolated desktop and 380×844 RU/HE render with no horizontal page overflow or console/network regression.
9. Reduced-motion and forced-colors media queries parse and preserve a visible static icon/focus path.
10. No locale, JS writer, network call, owner content, presentation key, progress, Finished, bookmark, note, list, review or cache is mutated.

## 7. Roles synthesis

- **R4/R7:** the foundation retains the editorial reading character while keeping controls quiet; 380px and RTL are release gates.
- **R5/R6/R8:** offline assets are bounded and real content remains the stress fixture; VF0 adds no new user path or dead end.
- **R11:** additive load order and complete legacy fallback make the slice do-no-harm and statically reversible.
- **R12/R14/R15:** presentation has no state authority, tenant authority, data lifecycle or outgoing-call capability.
- **R16:** a 23-icon subset and existing fonts avoid runtime dependency and font-budget expansion.
- **R17:** no grading, due, FSRS or learner-truth representation changes.

## 8. Stop conditions

Stop VF0 without commit/push/deploy if a frozen-contract conflict, unexplained current-target diff, version mismatch, icon licence gap, SW install failure, horizontal overflow, missing keyboard focus path, new write/network call, or unresolved automated regression appears.

Do not start VF1 until VF0 evidence is complete and the serialized VF0 result is green.
