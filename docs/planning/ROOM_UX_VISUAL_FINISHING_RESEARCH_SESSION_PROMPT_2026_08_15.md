# ROOM-UX-VF — Visual Finishing research-session prompt

```text
ROOM-UX-VF — Bounded Visual Finishing
MODE=RESEARCH_ONLY
DATE=2026-08-15
```

Working directory:

```text
E:\projects\tts-prototype-android
```

## 1. Goal

Prepare an evidence-backed owner decision packet for the bounded Visual Finishing lane before any runtime, CSS/HTML/i18n, asset, version, commit, push or deploy work.

The lane covers only:

- coherent SVG/system iconography instead of emoji-only product identity;
- optical RU/EN/HE typography and RTL alignment;
- restrained 120–180 ms continuity transitions with `prefers-reduced-motion`;
- mature empty/offline/partial/error states;
- two LinguistPro-native composition directions evaluated on real owner fixtures;
- the smallest cross-surface token/component contract needed to keep Library, corpus, Reader, Trainer, Mentor and Studio visually coherent.

It must not reopen information architecture, learner truth, B0–B8, the closed Library/Corpus successor program or frozen B9.

## 2. Read first

Read completely in this order:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PROJECT_ROLES.md`
4. `docs/planning/ROOM_UX_MATURITY_OPTION_B_CLOSURE_2026_08_11.md`
5. `docs/planning/ROOM_UX_B6_B9_VISUAL_FINISHING_HANDOFF_2026_08_11.md`
6. `docs/planning/ROOM_UX_B6_SCALE_RESILIENCE_CLOSURE_2026_08_12.md`
7. `docs/planning/ROOM_UX_B7_LEARNING_COMPASS_2_CLOSURE_2026_08_13.md`
8. `docs/planning/ROOM_UX_B8_READING_JOURNEY_IMPLEMENTATION_EVIDENCE_2026_08_13.md`
9. `docs/planning/ROOM_LIBRARY_CORPUS_SURFACE_PROGRAM_CLOSURE_2026_08_15.md`
10. `docs/planning/ROOM_AUDIO_TTS_INDICATOR_PARITY_IMPLEMENTATION_EVIDENCE_2026_08_15.md`
11. `docs/planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md`

Read only additional visual/a11y/locale evidence that is directly relevant. Current code and served production win over old roadmap claims.

Before research, summarize in 5–10 lines what is closed, what is frozen, which UI/DOM/locale contracts are immutable and which visual decisions remain genuinely open.

## 3. Frozen boundaries

Do not reopen without concrete regression/security/accessibility evidence:

- B0–B8 and their canonical writers;
- Library/Corpus Surface Unification, Discovery/Catalog and Audio/TTS parity;
- Library/L0 versus corpus-local ownership;
- vertical typed rows, bounded previews and no horizontal rails;
- shared typed section/disclosure grammar and persisted presentation state;
- RU/EN/HE semantic parity;
- Reading Journey, Reading Lists, progress, Finished, bookmarks/notes, `review_log`/FSRS and audio-state ownership;
- profile-fit provenance and no opaque recommendation feed;
- frozen B9 Path/Assignment design, schema and migration;
- `GROUP-CORPUS-CACHE-REVOCATION`, which is a separate future security lane.

Visual work must not create new data, recommendation, progress, assignment, telemetry or provider calls.

## 4. Required code recon

At minimum inspect:

- `public/library.html`, including embedded styles and all regions;
- `public/css/reader-core.css`;
- `public/css/reader-morph.css`;
- `public/js/library-ui.js`;
- `public/js/reader-core.js`;
- `public/js/morph-host.js` and word-card integration where present;
- `public/i18n/locales/ru.js`, `en.js`, `he.js`;
- icon/emoji usage across Library, corpora, Reader, Trainer, Mentor and Studio;
- existing CSS custom properties, typography scale, spacing, radii, shadows, focus, hover, pressed, disabled, loading, empty, offline, partial and error states;
- service-worker/version contracts relevant to asset replacement;
- current visual/browser/a11y smoke fixtures.

Build an exact surface × component × state inventory. Distinguish shared primitives from surface-owned special cases and identify CSS specificity/inline-style risks before recommending a token layer.

## 5. Live-browser recon

Use the existing authorized production tab read-only where available:

```text
https://linguistpro.kolosei.com/library.html
```

Do not mutate owner content, presentation keys, progress, Finished, bookmarks, notes, reading lists, review state, groups, catalog metadata, provider settings or caches.

Inspect desktop RU and, in isolated non-owner automation only, 380×844 RU and HE/RTL when tooling permits. Record 200% reflow, keyboard focus, DOM/ARIA, reduced-motion and offline/error implications without representing automation as physical/owner-live evidence.

Capture where emoji is identity, status, affordance or decoration; where typography/alignment breaks hierarchy; and where motion/state polish would reduce uncertainty rather than add spectacle.

## 6. Options to compare

At least three coherent directions:

- **A — Conservative token normalization:** retain current visual language, normalize typography/icons/states.
- **B — LinguistPro editorial reading system:** stronger text-led hierarchy, quiet iconography, literary/learning identity and restrained depth.
- **C — Utility/system modernization:** denser neutral system language optimized for consistency and scale.

A hybrid is allowed only if it has one explicit visual thesis rather than a collage. Compare through R4/R5/R6/R7/R8/R11/R14/R15/R16/R17.

## 7. Required decisions

Prepare owner decisions for:

- V1 visual thesis and product character;
- V2 icon source, semantics and fallback policy;
- V3 RU/EN/HE typography, numeric/date/bidi handling and font-loading budget;
- V4 color/contrast/status token contract;
- V5 spacing/radius/elevation and density bounds;
- V6 motion categories, duration/easing and reduced-motion behavior;
- V7 empty/offline/partial/error/loading grammar;
- V8 shared versus surface-local ownership and CSS layering;
- V9 immediate allowlist versus backlog;
- V10 verification, version/SW and serialized deployment plan.

For each: options, code/production/owner-live/external evidence, role critique, risks, recommendation, backward compatibility, rollback and exact approval value.

## 8. Research artifacts

Create:

```text
docs/research/room-ux-visual-finishing/2026-08-15/
```

Minimum:

1. `README.md`
2. `CURRENT_VISUAL_SYSTEM_INVENTORY.md`
3. `LIVE_BROWSER_EVIDENCE.md`
4. `ICON_AND_SEMANTIC_AUDIT.md`
5. `TYPOGRAPHY_RTL_AND_REFLOW_AUDIT.md`
6. `STATE_AND_MOTION_AUDIT.md`
7. `TOKEN_AND_CSS_OWNERSHIP_MAP.md`
8. `COMPOSITION_DIRECTIONS.md`
9. `OPTIONS_AND_ROLE_SYNTHESIS.md`
10. `FINDINGS.md`

Decision packet:

```text
docs/planning/ROOM_UX_VISUAL_FINISHING_DECISION_PACKET_2026_08_15.md
```

Every artifact includes date, source commit, branch, dirty status, production URL/version, evidence classes and limitations.

## 9. Future implementation matrix

Prepare, do not overclaim:

- desktop RU/EN/HE;
- 380×844 RU and HE/RTL;
- 200% zoom/reflow and long titles;
- keyboard-only and focus visibility;
- screen-reader DOM/ARIA;
- current supported theme(s) and system color-scheme behavior; no new dark-theme
  program unless separately evidenced and approved;
- reduced motion and no-motion equivalence;
- empty, loading, partial, offline, reconnect, stale/SW-update and error states;
- high contrast and status-not-by-color;
- Reader/Morph/Trainer interaction parity;
- no horizontal page overflow;
- no new learner/provider/network writes;
- old/new client/SW compatibility and visual rollback.

## 10. Stop list

Before explicit `APPROVE ROOM-UX-VF-R`:

- no runtime/CSS/HTML/i18n/asset edits;
- no schema/migration/data changes;
- no B9 code or migration;
- no broad IA/navigation/component rewrite;
- no owner data/presentation-key mutation;
- no commit/push/deploy;
- no production cache clearing;
- no generic icon pack or font dependency without license/performance/provenance evidence;
- no physical-device/AT claims from automation.

After the decision packet, stop and wait for:

```text
APPROVE ROOM-UX-VF-R:
V1=...;
V2=...;
V3=...;
V4=...;
V5=...;
V6=...;
V7=...;
V8=...;
V9=...;
V10=...;
SCOPE=...;
```
