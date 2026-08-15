# ROOM-UX-VF — Visual Finishing decision packet

> Date: 2026-08-15  
> Mode: `RESEARCH_ONLY`  
> Status: `OWNER_APPROVED`  
> Source commit: `12dacd9a403ff8db2b7ad2dd20abf98e6c241386`  
> Branch: `main` (`origin/main` at the same commit)  
> Worktree: `DIRTY`; 34 entries pre-dated this session. Session scope is this packet and `docs/research/room-ux-visual-finishing/2026-08-15/`; target runtime/locale/asset/SW files remain unchanged.  
> Production: `https://linguistpro.kolosei.com/library.html`, served `3.11.388`  
> Evidence: `CODE`, `OWNER_LIVE_READ_ONLY`, `ISOLATED_AUTOMATION`, `HISTORICAL_AUTOMATION`, `OWNER_REPORTED`, `EXTERNAL_PRIMARY`  
> Limitations: no physical-device/AT run, actual browser 200% owner check, forced-colors run, or runtime reduced-motion emulation; no implementation, version bump, commit, push or deploy.

> Owner decision (2026-08-15): `Рекомендации утверждаю. Стартуй`. This is recorded as approval of the exact recommended V1–V10 values and `SCOPE=BOUNDED_VISUAL_FINISHING_ONLY` below. Implementation remains serialized through VF0–VF3 and subject to each slice's stop gates.

## Executive recommendation

Approve a bounded **editorial calm, operational clarity** lane. Retain the closed Option B hierarchy and ownership; replace repeated emoji semantics with a pinned static SVG subset and first-party LP/surface marks; make RU/EN/HE typography explicit using only existing fonts; extract the already-existing Studio `--theme-*` primitives into a small shared foundation; normalize state/focus/motion presentation while every behavior and canonical writer remains surface-owned.

This is visual finishing, not a redesign or component-platform program.

## Frozen boundaries

The approval below does not reopen B0–B8, Library/Corpus Surface Unification, Discovery/Catalog, Audio/TTS parity, Library/L0 versus corpus-local ownership, vertical typed rows, bounded previews/disclosures, persisted presentation state, RU/EN/HE semantic parity, Reading Journey/Lists, progress, Finished, bookmarks/notes, `review_log`/FSRS, audio ownership, profile-fit provenance, frozen B9, or `GROUP-CORPUS-CACHE-REVOCATION`.

No visual implementation may create data, telemetry, recommendation, assignment, provider or network calls.

## Evidence summary

- Production/Kapture `3.11.388`: current 1920×911 Ben-Yehuda, 16 real Hebrew work rows, zero SVG/image UI nodes, stable 1054 px rows, no horizontal overflow.
- Owner My Texts read-only aggregate: 115 entries; sampled mixed titles up to 96 characters, works up to 1651 rows, media and progress variants; `review_log 7357 → 7357`.
- Isolated 380 RU and HE/RTL: no page overflow; tab order coherent; no sampled target below 24 px; strong recent focus ring but legacy header uses 1 px UA focus; text-spacing probes pass.
- Static code: missing `Noto Serif Hebrew`; duplicated Room/Morph tokens; Studio has 60 existing tokens but 446 inline-style occurrences; reduced-motion gaps remain.
- Gates: 58/58 B0–B8/audio tests, i18n smoke and reader parity passed.

Full evidence: `docs/research/room-ux-visual-finishing/2026-08-15/`.

## Per-decision evidence ledger

| Decision | Code evidence | Production evidence | Owner-live / owner-reported evidence | External primary evidence |
|---|---|---|---|---|
| V1 | existing Option B warm L0 plus split visual generations | text-led hierarchy works, while header/CTA measure and emoji chrome fragment it | real Ben and 115-text My Texts stress set; closed-program ownership stays frozen | WCAG/WAI constrains accessible execution but does not choose brand character |
| V2 | hundreds of emoji/symbol occurrences; one first-party LP SVG | zero SVG/image UI nodes in current Room | current global actions/rows observed read-only; no owner acceptance of future icons | WAI functional/decorative image semantics; Lucide ISC/MIT licence |
| V3 | nine existing font files; missing `Noto Serif Hebrew`; bare locale formatting; partial `lang` coverage | fallback is visible in L0; 380 RU/HE reflows | mixed-script personal titles up to 96 chars; real Hebrew Ben titles | W3C language, bidi, reflow and text-spacing guidance |
| V4 | Studio status tokens exist; Room/Morph duplicate palettes | supported light/dark render, but no forced-colors contract | live connection/Compass/material status grammar inspected without mutation | WCAG contrast, non-text contrast and use-of-color |
| V5 | repeated literal spacing/radius/shadow values; Studio density tokens | full-width due CTA breaks 1120 px rhythm; 380 header is dense | owner 1920 and isolated 380 measurements; no sampled target below 24 px | WCAG 2.5.8 target size and enhanced 44 px guidance |
| V6 | 100–220 ms transitions and several infinite loops; partial reduced-motion gates | no production reduced-motion emulation in this session | no new owner-live motion claim; prior closure evidence remains separate | Media Queries Level 5 `prefers-reduced-motion` |
| V7 | generic Room/Reader boxes versus typed connection/Compass states | fresh isolated L0 preparation lasted roughly 30 s; offline-ready was truthful | owner content/state remained read-only; `review_log` unchanged | WCAG live/focus/contrast constraints and WAI functional imagery |
| V8 | 60 Studio, 15 Room, 29 Morph, 23 Reader custom properties; Studio has 446 inline styles | one product currently survives through late-cascade overrides | no owner presentation key or runtime file changed | CSS Cascade Level 5: https://www.w3.org/TR/css-cascade-5/ plus WCAG focus/forced-color constraints |
| V9 | clean target diff and explicit four-slice file map | one production shell spans all surfaces, increasing shared blast radius | owner closure/freeze documents require a distinct successor lane | deployment sequencing is project evidence-led; external standards only gate each slice |
| V10 | SW precache/version contract, locale bust and parity tests | HTML/footer/SW/API all serve `3.11.388` | previous physical B7 rows stay historical; new physical/AT acceptance is pending | Service Workers: https://www.w3.org/TR/service-workers/ and WCAG compatibility/accessibility baselines |

---

## V1 — Visual thesis and product character

**Options**

- `A_CONSERVATIVE_NORMALIZATION`: preserve current look, normalize icons/type/states.
- `B_EDITORIAL_CALM`: editorial reading identity; text expressive, controls/states quiet and exact.
- `C_UTILITY_MODERNIZATION`: neutral dense system language optimized for scale.

**Evidence and role critique:** R4/R5/R6/R7 favor B because the current warm L0/Reader hierarchy already differentiates LinguistPro and supports attention. R11/R14/R15/R16 prefer A's additive migration. C scans dense My Texts well but weakens Ben-Yehuda/L0 identity and invites a broad Studio rewrite. Owner fixtures show that B can handle real long/mixed titles without changing rows or IA.

**Risks:** warmth spreads into statuses; editorial headings reduce utility clarity; over-finishing reopens the closed program.

**Recommendation:** B, with A as the migration discipline. One thesis: **editorial calm, operational clarity**.

**Compatibility / rollback:** preserve DOM order, component dimensions and existing warm tokens; rollback restores old static styles only.

**Exact approval:** `V1=B_EDITORIAL_CALM`.

## V2 — Icon source, semantics and fallback

**Options**

- `FIRST_PARTY_ONLY`: draw every system/identity icon internally.
- `VENDORED_SVG_PLUS_FIRST_PARTY_MARKS`: pinned allowlisted Lucide/Feather-derived system subset plus custom LP/surface marks.
- `UNICODE_SYSTEM_GLYPHS`: retain emoji/symbol controls.

**Evidence and role critique:** production has no SVG UI and hundreds of symbol occurrences. R7 needs a stable product identity; R6 needs script/content symbols left intact; R11/R15 reject a runtime package; R14/R16 require provenance, licence and asset/SW gates. Lucide's official licence permits vendoring under ISC, with MIT notices for Feather-derived files: https://github.com/lucide-icons/lucide/blob/main/LICENSE.

**Risks:** generic pack character, licence omission, old SW missing sprite, incorrect RTL mirroring, decorative AT noise.

**Recommendation:** vendor only the audited 16–24 repeated system icons; first-party LP/Room/Studio/Mentor marks; no npm/runtime dependency. Store upstream revision, exact file list/hashes and ISC/MIT notices. Icon inside named controls is `aria-hidden`; control owns the localized accessible name. Keep text/Unicode fallback through one compatibility release.

**Compatibility / rollback:** old cached JS/HTML retains text/emoji; new consumers must not become blank if the sprite fails. Rollback removes references and returns old glyphs.

**Exact approval:** `V2=VENDORED_SVG_PLUS_FIRST_PARTY_MARKS`.

## V3 — RU/EN/HE typography, numeric/date/bidi and font budget

**Options**

- `SYSTEM_ONLY`: all UI/editorial roles use platform fonts.
- `EXISTING_FONTS_EXPLICIT_SCRIPT_ROLES`: system RU/EN UI, Assistant HE UI, Frank HE reading/editorial, Georgia RU/EN editorial.
- `NEW_EDITORIAL_FAMILY`: add a measured Cyrillic editorial family and new font budget.

**Evidence and role critique:** R6 identifies a concrete missing selector (`Noto Serif Hebrew`) and missing `lang=he` on many mixed Room titles. R11 notes 162,428 B of existing WOFF2 and unnecessary/preload ambiguity. R15 favors no new dependency. R7 benefits from retaining editorial type. W3C requires language and direction to be represented separately: https://www.w3.org/International/questions/qa-html-language-declarations and https://www.w3.org/International/questions/qa-html-dir.

**Risks:** synthesized 760–850 weights, platform Georgia drift, font swap, date/number bidi, duplicate Hebrew sans roles.

**Recommendation:** use existing fonts only; map the missing feature selector to Frank; restrict weights to available 400/500/700; add explicit `lang/dir/bdi`; use app-locale `Intl.NumberFormat/DateTimeFormat`; measure and justify preloads. New fonts remain backlog.

**Compatibility / rollback:** system fallback remains; stored values are unchanged; rollback restores selectors/formatters.

**Exact approval:** `V3=EXISTING_FONTS_EXPLICIT_SCRIPT_ROLES`.

## V4 — Color, contrast and status token contract

**Options**

- `PALETTE_NORMALIZATION`: align current colors only.
- `SEMANTIC_STATUS_TOKENS_V1`: shared neutral/info/success/warning/error foreground/background/border/icon roles.
- `FULL_THEME_REDESIGN`: replace light/dark palettes and add theme work.

**Evidence and role critique:** Studio already defines generic accent/success/warning/danger tokens; Room/Morph duplicate a smaller set. R8/R17 require status not to imply unsupported truth; R6/R16 require not-by-color and 4.5:1 text/3:1 meaningful UI/graphics. Sources: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html, https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html, https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html.

**Risks:** status tokens overwrite domain truth colors (word familiarity/provenance), dark contrast regression, disabled ambiguity.

**Recommendation:** small semantic status set, always icon/shape + label; domain `--ws-*`, row, learning and provenance colors remain local. Add forced-colors fallback; no new dark-theme program.

**Compatibility / rollback:** alias current colors first; component migration is incremental. Rollback returns aliases/literals.

**Exact approval:** `V4=SEMANTIC_STATUS_TOKENS_V1`.

## V5 — Spacing, radius, elevation and density bounds

**Options**

- `CURRENT_VALUES_ONLY`: no shared geometry.
- `BOUNDED_EDITORIAL_DENSITY`: six spacing, five radius and three elevation aliases plus component minima.
- `GLOBAL_DENSITY_SYSTEM`: unify/rework Studio compact/comfortable/spacious and Room.

**Evidence and role critique:** R4/R7 see inconsistent header/CTA measure and many near-duplicate geometry values. R11/R15 caution against replacing every optical 6/10/14 px adjustment. Isolated 380 found no sampled target under 24 px, while header controls are 29 px and primary actions 44 px. W3C 2.5.8 requires 24×24 or spacing; 44×44 is the enhanced target, not a universal AA requirement: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.

**Risks:** density expansion, taller header, loss of reading measure, indiscriminate cardification.

**Recommendation:** spaces 4/8/12/16/24/32; radii 8/10/12/16/pill; elevation 0/sm/md/overlay mapping; persistent compact controls target 36 px, primary touch controls 44 px, never violate 24 px/spacing. Align full-width due CTA to the shell measure without changing its semantics.

**Compatibility / rollback:** aliases preserve existing geometry until a component opts in; local table/word metrics remain.

**Exact approval:** `V5=BOUNDED_EDITORIAL_DENSITY`.

## V6 — Motion and reduced motion

**Options**

- `NORMALIZE_EXISTING`: keep current values, fill obvious gaps.
- `MOTION_0_120_140_160_180`: five explicit categories and no-motion equivalents.
- `EXPRESSIVE_MOTION`: add richer transitions/springs.

**Evidence and role critique:** current continuity mostly sits at 100–180 ms, but sheets use 220 ms and some infinite loops remain or merely slow under reduced motion. R5/R17 reject spectacle and uncertainty; R11/R16 prefer deterministic transitions. W3C defines the `reduce` preference: https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion.

**Risks:** motion hides state, focus moves before animation ends, disabled animation removes feedback.

**Recommendation:** 0 instant truth, 120 hover, 140 continuity, 160 disclosure, 180 overlay; no bounce/spring. Under reduce, transitions/loops become 0 and persistent text/rail/outline communicates the same end state.

**Compatibility / rollback:** motion tokens wrap existing values; functionality never depends on animation. Rollback restores durations.

**Exact approval:** `V6=MOTION_0_120_140_160_180`.

## V7 — Empty/offline/partial/error/loading grammar

**Options**

- `COPY_ONLY`: improve individual state messages.
- `SHARED_STATE_ANATOMY_LOCAL_ACTIONS`: one presentation anatomy; typed state/copy/action stay surface-owned.
- `CENTRAL_STATE_COMPONENT`: new cross-app JS state controller.

**Evidence and role critique:** connection/Compass states are already typed and mature; generic Room/Reader boxes lack roles/actions; My Texts true empty is strong but filter-empty/error collapse; isolated fresh L0 had a long preparation state. R8/R17 require truthful scope and no automatic action; R14 rejects a controller that could acquire network authority.

**Risks:** alert spam, focus theft, false retry, central component becomes a second state owner.

**Recommendation:** shared visual anatomy only: kind, icon, title, detail/scope, up to two surface-provided actions and an a11y mode. Preserve content on partial/offline; distinguish true empty/filter empty/error/stale/update. No new calls.

**Compatibility / rollback:** adapter renders existing state values; existing behavior survives without the skin. Rollback removes adapter/styles.

**Exact approval:** `V7=SHARED_STATE_ANATOMY_LOCAL_ACTIONS`.

## V8 — Shared versus surface-local ownership and CSS layering

**Options**

- `SURFACE_LOCAL_ONLY`: duplicate normalization per surface.
- `FOUNDATIONS_SHARED_COMPONENTS_LOCAL`: extract primitives/utilities, retain surface compositions.
- `FULL_COMPONENT_SYSTEM`: centralize buttons/cards/rows/shells.

**Evidence and role critique:** Studio has 60 tokens, Room 15, Morph 29 and Reader 23; Room's late inline sheet and Studio's 446 inline styles make a broad layer change dangerous. R11/R15/R16 favor a small additive file loaded before consumers; R4/R7 need local editorial character. Reader parity forbids generic table rewrite.

**Risks:** CSS layer inversion, `!important` escalation, dual token names, shared file becoming an ownership grab.

**Recommendation:** new `visual-foundations.css` extracts existing Studio primitives and provides Room compatibility aliases, font roles, icon/status/focus/motion utilities. Reader, Morph, Room, Trainer, Mentor and Studio keep component ownership. Start without wrapping legacy CSS in `@layer`; use link order and low-specificity utilities.

**Compatibility / rollback:** aliases and no universal reset; remove one stylesheet link to roll back, with surface CSS still complete.

**Exact approval:** `V8=FOUNDATIONS_SHARED_COMPONENTS_LOCAL`.

## V9 — Immediate allowlist versus backlog

**Options**

- `ROOM_ONLY_SINGLE_RELEASE`: finish Room only at once.
- `SERIALIZED_VF0_VF3_ALLOWLIST`: foundations, Room, learning surfaces, then Studio shell.
- `ALL_SURFACES_BROAD_REWRITE`: cross-product component modernization.

**Evidence and role critique:** R15/R16 require shared contract first and serialized adoption; R4/R7 require cross-surface coherence, but Studio risk is materially larger. R14 keeps static/presentational authority narrow.

**Recommendation and allowlist:**

- VF0: new foundations, static icon subset/licence/provenance, shell links, SW/version contract.
- VF1: `library.html`, `library-ui.js`, RU/EN/HE locales for Room shell/L0/corpora only.
- VF2: `reader-core.css/js`, `reader-morph.css`, `morph-host.js` only if needed, `mentor-home.js`, Room/locales for repeated icon/state/type/focus changes only.
- VF3: narrow `index.html`/enumerated Studio shell adoption only.

Backlog: full Studio inline-style cleanup, dark-theme program, new font, cover/illustration system, specialist emoji replacement, legacy rail deletion, component architecture, B9/security/data work.

**Risks:** allowlist becomes implicit authorization, shared changes leak across slices.

**Compatibility / rollback:** each slice has an exact preflight diff and rollback commit; no parallel cross-surface deploy.

**Exact approval:** `V9=SERIALIZED_VF0_VF3_ALLOWLIST`.

## V10 — Verification, version/SW and serialized deployment

**Options**

- `STANDARD_RELEASE`: existing tests and deploy.
- `VERSION_SW_LOCK_AND_VISUAL_ROLLBACK`: asset/version compatibility and full visual/a11y matrix per slice.
- `BIG_BANG_RELEASE`: one version for all surfaces.

**Evidence and role critique:** new CSS/SVG is offline-critical. `sw.js` requires a cache bump for shell assets; current APP/SW/footer/API are `3.11.388`. R11/R15 require precache-before-reference and old/new client testing; R16 requires evidence classes remain separate. `package.json`/lock drift is documented but not automatically in scope.

**Recommendation:** for each serialized slice:

1. clean target allowlist and red/green contract tests;
2. new static assets deployed/precache-listed before or atomically with consumers;
3. APP_VERSION, Room footer fallback, SW CACHE_VERSION, API served version and locale `?v=` (when locales change) locked by tests;
4. desktop RU/EN/HE, 380 RU/HE, actual 200%, long titles, keyboard/focus, DOM/ARIA, light/dark/auto, forced colors, reduced/no-motion, all state rows, Reader/Morph/Trainer parity, no overflow/no new writes;
5. old HTML/new SW and new HTML/old SW fallback smoke;
6. deploy one surface slice, verify served version/SW/assets, then production read-only smoke;
7. physical/AT and owner acceptance reported separately, never inferred from automation.

Rollback is static: restore the prior shell/assets/version and activate the previous-compatible SW; no schema/data rollback. Never ask the owner to repeat a completed write because a visual/cache verification failed.

**Risks:** stale SW blanks icon controls, locale cache mismatch, partial surface adoption, package metadata mistaken for served version.

**Exact approval:** `V10=VERSION_SW_LOCK_AND_VISUAL_ROLLBACK`.

---

## Approval scope

Recommended scope value: `SCOPE=BOUNDED_VISUAL_FINISHING_ONLY`.

This value authorizes preparation of a separate implementation packet and then the listed runtime slices only. It does not itself authorize deployment if future preflight finds a frozen-contract conflict, owner-data risk or unresolved physical/AT regression.

## Exact owner response

```text
APPROVE ROOM-UX-VF-R:
V1=B_EDITORIAL_CALM;
V2=VENDORED_SVG_PLUS_FIRST_PARTY_MARKS;
V3=EXISTING_FONTS_EXPLICIT_SCRIPT_ROLES;
V4=SEMANTIC_STATUS_TOKENS_V1;
V5=BOUNDED_EDITORIAL_DENSITY;
V6=MOTION_0_120_140_160_180;
V7=SHARED_STATE_ANATOMY_LOCAL_ACTIONS;
V8=FOUNDATIONS_SHARED_COMPONENTS_LOCAL;
V9=SERIALIZED_VF0_VF3_ALLOWLIST;
V10=VERSION_SW_LOCK_AND_VISUAL_ROLLBACK;
SCOPE=BOUNDED_VISUAL_FINISHING_ONLY;
```

Any changed value is a valid owner counter-decision and must be reconciled before implementation.

## Stop

Stop here. No runtime/CSS/HTML/i18n/asset/version/schema/data/B9 edit, commit, push, deploy or cache action is authorized before the explicit approval block.
