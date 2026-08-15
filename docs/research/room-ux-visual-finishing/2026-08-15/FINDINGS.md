# Findings and future implementation matrix

> Date: 2026-08-15  
> Source commit: `12dacd9a403ff8db2b7ad2dd20abf98e6c241386`; branch `main`; dirty worktree, runtime targets clean  
> Production: `https://linguistpro.kolosei.com/library.html`, served `3.11.388`  
> Evidence: `CODE`, `OWNER_LIVE_READ_ONLY`, `ISOLATED_AUTOMATION`, `HISTORICAL_AUTOMATION`, `OWNER_REPORTED`, `EXTERNAL_PRIMARY`  
> Limitations: research-only; no future implementation or deployment evidence is claimed.

## Main findings

1. The current Option B composition is a strong base; Visual Finishing is not a redesign.
2. Emoji is the only live Room UI icon system: zero SVG/image UI nodes in production, with hundreds of semantic symbol occurrences across Room, Studio, Mentor and locales.
3. The largest typography defect is concrete: L0 calls a nonexistent `Noto Serif Hebrew`; mixed-language Room content often has direction but no language.
4. Studio already owns the richest `--theme-*` vocabulary. Creating a second token naming system would deepen dual-write debt.
5. Room's late inline CSS, Morph duplication and Studio's 446 inline styles make a global cascade rewrite unsafe.
6. Recent components have strong focus and 44 px primary targets; legacy header/track controls rely on a 1 px UA ring and 29–36 px height. No sampled 380 target was below 24 px.
7. State behavior is often mature but presentation is fragmented. Global/Reader generic error boxes lack roles, context and recovery, while connection and Compass states are already typed.
8. Motion mostly sits near 120–180 ms, but reduced-motion coverage is incomplete; slowing an infinite spinner is not a no-motion equivalent.
9. Owner-live fixtures materially stress the design: 115 My Texts, 96-character mixed titles, 1651-row texts, media/progress variants and real Ben rows.
10. Release version is `3.11.388` across HTML/footer/SW/API. `package.json` (`3.11.384`) and `package-lock.json` (`3.11.241`) are non-runtime metadata drift; the implementation packet must state whether they are authoritative rather than silently broadening scope.

## Recommended V1–V10 values

| Decision | Exact value | Short meaning |
|---|---|---|
| V1 | `B_EDITORIAL_CALM` | editorial calm, operational clarity |
| V2 | `VENDORED_SVG_PLUS_FIRST_PARTY_MARKS` | pinned static system subset + LP/surface identity |
| V3 | `EXISTING_FONTS_EXPLICIT_SCRIPT_ROLES` | no new font; fix missing selector, bidi and locale formatting |
| V4 | `SEMANTIC_STATUS_TOKENS_V1` | neutral/info/success/warning/error with contrast and non-color cues |
| V5 | `BOUNDED_EDITORIAL_DENSITY` | shared space/radius/elevation bounds, no density program |
| V6 | `MOTION_0_120_140_160_180` | five categories with true reduced/no-motion equivalents |
| V7 | `SHARED_STATE_ANATOMY_LOCAL_ACTIONS` | presentation grammar only; surface owns copy/action/state |
| V8 | `FOUNDATIONS_SHARED_COMPONENTS_LOCAL` | extract existing Studio tokens, compatibility aliases, local composition |
| V9 | `SERIALIZED_VF0_VF3_ALLOWLIST` | foundation → Room → Reader/learning → Studio shell |
| V10 | `VERSION_SW_LOCK_AND_VISUAL_ROLLBACK` | precache-before-use, version equality, old-client fallback, static rollback |

## Immediate allowlist — planning only

No file below is authorized before approval. After approval, each slice gets a fresh `git status` and exact diff allowlist.

| Slice | Intended files | Boundary |
|---|---|---|
| VF0 foundations | new `public/css/visual-foundations.css`; new vendored icon sprite/subset + licence/provenance file; shell links; `sw.js`; exact version surfaces | no visible component rewrite; assets available before consumers |
| VF1 Room shell/L0/corpora | `library.html`, `library-ui.js`, RU/EN/HE locales | icons/type/focus/states/alignment only; no IA/writer/filter/data change |
| VF2 Reader/Morph/Trainer/Mentor | `reader-core.css/js`, `reader-morph.css`, `morph-host.js` only if markup utility is needed, `mentor-home.js`, Room/locales | preserve table parity, grading, FSRS, provider and consent behavior |
| VF3 Studio shell | `index.html` and a narrowly enumerated module/locale set | top shell and shared state/focus adoption only; no Classic/v3 workflow rewrite |

All slices are serialized. A shared-contract change cannot be deployed concurrently with multiple surface rewrites.

## Explicit backlog / stop list

- Studio's full 446-inline-style cleanup, component architecture rewrite or density-mode redesign.
- New dark-theme program, new font family, illustration/cover system or animation language.
- Replacing every decorative/specialist emoji.
- Deleting legacy shelf/rail CSS without a dead-code proof.
- Any IA/navigation, Library/corpus ownership, canonical writer, recommendation, learner-truth, data, telemetry, assignment, provider or schema work.
- B9 code/migration and `GROUP-CORPUS-CACHE-REVOCATION`.

## Future verification matrix

| Gate | Required evidence | Pass condition |
|---|---|---|
| desktop RU/EN/HE | fresh automation + production smoke | hierarchy/labels/icons semantically equal; no overflow |
| 380×844 RU + HE/RTL | fresh screenshots, DOM and target measurements | no clipping/overflow; logical ordering and arrows; ≥24 px/spacing, primary ≥44 px |
| 200% and long titles | actual browser zoom plus 96+ character/mixed fixtures | no two-dimensional page scroll or lost action/content |
| keyboard/focus | full tab pass with sticky header/status/overlays | logical order, visible ≥3:1 focus, not obscured |
| screen reader DOM/ARIA | NVDA/VoiceOver/TalkBack rows kept separate | names/roles/live updates correct; decorative icons silent |
| supported light/dark/auto | RU/HE and native controls | all tokens/statuses pass; no new theme program |
| forced colors/high contrast | Windows forced-colors automation + physical if available | icons/focus/status remain perceivable; not color-only |
| reduced/no motion | media emulation and keyboard flows | same end state/function; no shimmer/pulse/spin loop |
| state matrix | loading/true empty/filter empty/partial/offline/reconnect/stale/update/error | truthful scope, correct action, no focus theft/new call |
| Reader/Morph/Trainer | parity golden + interaction smokes | no table/word/grading behavior diff |
| owner truth | before/after counts/checksums | no new learner/provider/network writes; `review_log` unchanged in read-only smoke |
| compatibility | old HTML/new SW and new HTML/old SW scenarios | fallback text remains usable; asset fetch cannot blank controls |
| version/SW | shell/SW/API/locale-bust assertions | one served release; new static assets precached before reference |
| rollback | staged production rollback rehearsal | prior static version restores visuals; no data rollback needed |

## Gate status today

- Research completeness: `PASS`.
- Runtime implementation: `VF0_CLOSED_OWNER_ACCEPTED`; VF1 may enter preflight; VF2/VF3 have not started.
- Automated physical/AT claims: `NOT_RUN`.
- Owner visual direction approval: `PASS` — recommendations approved on 2026-08-15.
- Authorization to begin bounded implementation: `PASS` for serialized VF0–VF3, with each slice still subject to its preflight and stop gates.
- VF0 actual desktop Chrome 200% RU/HE: `OWNER_REPORTED_PASS` on 2026-08-15; not physical-mobile, AT or agent-observed evidence.
- VF0 production deployment: `PASS` at 2026-08-15 19:57 +03:00 — API/HTML/SW `3.11.389`, new static assets `200`, fresh isolated SW/precache controlled, 380 RU/HE reflow green, and Kapture real Ben-Yehuda read-only smoke green.
- VF0 owner handoff: `PASS` — exact owner acceptance `VF0 PROD=PASS` received on 2026-08-15 after the production update/review handoff.
- Physical-mobile and assistive-technology rows remain `NOT_RUN`; they are not inferred from the owner desktop production acceptance.
