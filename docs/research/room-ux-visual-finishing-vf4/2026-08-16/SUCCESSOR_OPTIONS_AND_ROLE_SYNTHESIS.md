# Successor options and role synthesis

> Date: `2026-08-16`
> Source/branch: `main@71b2d48ced2ad607151520bacf8443f582ec46cc`; local/remote origin converged
> Dirty status at research start: 34 unrelated pre-existing entries; no runtime/release target changed
> Research-baseline production/client: release and owner client `3.11.398`; no update action
> Post-approval release: implementation `8dda777d`; production and updated actual owner client `3.11.399`
> Evidence: `CODE_CURRENT`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `AUTOMATED_LOCAL`, `OWNER_REPORTED_PREDECESSOR`, `EXTERNAL_PRIMARY`
> Limitations: no physical-device, actual owner-browser 200% or AT acceptance evidence. This file records the pre-implementation option analysis; execution evidence is in `VF4_IMPLEMENTATION_EVIDENCE.md`.

## A–D comparison

| Outcome | Evidence for | Evidence against | Risk / rollback | Verdict |
|---|---|---|---|---|
| A — `NO_GO_CLOSE_PROGRAM` | VF0–VF3 are owner-accepted; shell/corpus visuals are stable; most residual emoji/debt is low-value backlog | would accept a current real-client status hidden from AT, forced-colors collisions, a reduced-motion pulse and wrong/stale TTS names | zero release risk; unresolved accessibility defect remains | valid owner counter-decision, not recommended |
| B — `TARGETED_RESIDUAL_A11Y_STATE` | one repeated Room/Studio component family; exact served assets; owner fixture contains real ready/mismatch states; isolated RU/HE proves media/locale failures; W3C primary guidance directly applies | requires touching duplicated Studio/Reader presentation and locale/release locks | bounded shared-parity risk; static rollback, no data rollback | **recommended** |
| C — `SURFACE_LOCAL_SPECIALIST_FINISH` | specialist emoji and legacy action glyphs remain | no one isolated surface/component family was observed to materially harm real use; source counts alone are not defects | easy to grow into arbitrary icon sweep | `NO_GO` |
| D — `CSS_DEBT_ONLY` | Studio has 446 inline styles and 347 `!important` uses; two visual tests have closure wording drift | debt is not the cause of a current owner-visible failure; cleanup has broad blast radius | regression risk exceeds measured benefit | `NO_GO` |

No hybrid is needed. Outcome B has one thesis and one ownership domain:

```text
Truthful, language-correct, non-color row-audio state in the existing
Room/Studio bilingual-table audio component family.
```

## Role synthesis

| Role | Critique | Resulting boundary |
|---|---|---|
| R4 visual systems | same-size colored dots do not form a robust state grammar; the rest of the editorial system is stable | non-color marker signatures only; no broad polish |
| R5 mobile UX | 380 RU/HE has no overflow, but hidden hover/title semantics do not help touch users | preserve 10px status footprint and current action targets; physical mobile remains acceptance evidence |
| R6 product | audio readiness and the available play/stop action affect a real repeated workflow; emoji/CSS counts do not | qualify row audio, reject general finishing |
| R7 pedagogy | truthful readiness reduces confusion during reading/listening without changing content or pedagogy | render existing truth only |
| R8 editorial | a calm compact marker can stay quiet while remaining legible without hue | no badge explosion, new copy block or hierarchy change |
| R11 QA | Reader and Studio duplicate builder/painter/CSS paths; a one-surface fix would create false parity | red tests must cover both surfaces, five states, RU/EN/HE and media preferences |
| R12 data/state | audio readiness and writers are canonical and already tested | no new state, storage, key, writer, provider or retry |
| R14 security | audio/provider paths are sensitive; research invoked none | future tests use mocks/fixtures; no new network action |
| R15 privacy | owner texts/groups/learning state are non-disposable | only counts/classes retained; no telemetry or screenshot content |
| R16 operations | shared precached unversioned/versioned assets can create mixed-client drift | exact APP/Room/SW/API/locale/asset lock and old/new matrix are mandatory |
| R17 assessment | row audio is not a grade/review event | no `review_log`, FSRS, progress or grading change |

R1/R2/R3/R9/R10 are invariant guards rather than design drivers here: no Hebrew, niqqud, translation, learning sequence, graph or provenance truth may change.

## Recommended F1–F8 values

```text
F1=TARGETED_RESIDUAL_A11Y_STATE
F2=ROW_AUDIO_STATE_NONCOLOR_LOCALE_ACTION_PARITY
F3=ROOM_STUDIO_ROW_AUDIO_ONLY
F4=EXISTING_GLYPHS_PLUS_NONCOLOR_MARKER_SEMANTICS
F5=STATE_EXACT_NAMES_FORCED_COLORS_REDUCED_MOTION
F6=READER_SHARED_CORE_WITH_STUDIO_PARITY_OVERRIDE
F7=RED_GREEN_VERSION_LOCK_STATIC_ROLLBACK
F8=SERIALIZED_ONE_SLICE_UPDATED_OWNER_CLIENT
SCOPE=ROW_AUDIO_MARKER_AND_ROW_TTS_CONTROL_ONLY
```

### F1 — successor gate

- Options: A–D above.
- Recommendation: B.
- Success condition: current audio state is perceivable without hue and exposed programmatically; current row-TTS action has the correct localized name.
- Exact approval: `TARGETED_RESIDUAL_A11Y_STATE`.

### F2 — user-visible problem

The problem is not “remaining emoji.” It is the repeated row-audio component conveying existing state/action inconsistently by surface, color, motion preference and locale.

Exact approval: `ROW_AUDIO_STATE_NONCOLOR_LOCALE_ACTION_PARITY`.

### F3 — surface/component/file boundary

Surfaces: Room Reader plus Studio Classic/IDE bilingual table. Components: `.row-audio-ind` and `.row-tts-btn` only.

#### Future mutable runtime/release allowlist

```text
public/css/reader-core.css
public/js/reader-core.js
public/js/library-ui.js
public/library.html
public/index.html
public/i18n/locales/ru.js
public/i18n/locales/en.js
public/i18n/locales/he.js
public/sw.js
server.js
```

`library-ui.js` is limited to localized label plumbing and exact versioned import/reference compatibility. `library.html`, `sw.js` and `server.js` are release-lock changes only except for the existing script/style references.

#### Future mutable verification/evidence allowlist

```text
tests/roomUxVf4ResidualA11y.test.js        # new
tests/readerAudioIndicator.test.js
tests/i18n.locale-version.lock.json
tests/visualFinishingLearningSurfaces.test.js
tests/visualFinishingRoom.test.js
tests/visualFinishingStudioShell.test.js
tests/visualFoundations.test.js
scripts/premium/room-audio-indicator-smoke.js
docs/planning/ROOM_UX_VISUAL_FINISHING_VF4_IMPLEMENTATION_PACKET_2026_08_16.md
docs/research/room-ux-visual-finishing-vf4/2026-08-16/VF4_IMPLEMENTATION_EVIDENCE.md
```

Reader parity and i18n harnesses must run but may not be edited unless the approved red contract proves their existing assertion owns the changed semantic attribute. No package/script reshaping is authorized.

#### Explicit backlog/stop list

- note/edit/resizer localization outside `.row-tts-btn`;
- all remaining emoji/icon replacement;
- table geometry, columns, drag/resize, note/edit behavior and karaoke flow;
- audio keys, readiness derivation, profile comparison, cache/persistence or provider code;
- visual foundations, sprite, fonts, Morph, Trainer, Mentor and general Studio shell;
- CSS debt cleanup, IA, theme, B9 and cache-revocation security work.

Exact approval: `ROOM_STUDIO_ROW_AUDIO_ONLY`.

### F4 — icon/typography/RTL semantics

Keep current play/stop glyph fallback and current typography. The accessible action name carries function. Add non-color marker signatures; do not add a sprite symbol or mirror non-directional audio-state shapes. RTL keeps logical table/row ownership and current column order.

Exact approval: `EXISTING_GLYPHS_PLUS_NONCOLOR_MARKER_SEMANTICS`.

### F5 — focus/contrast/state/motion contract

- same focus order and target boxes;
- five distinguishable marker signatures without hue in normal/forced colors;
- working animation only under `prefers-reduced-motion: no-preference`;
- localized idle/loading/stop/retry action names updated atomically with glyph/class;
- marker state exposed without creating another tab stop;
- no status by color alone.

Exact approval: `STATE_EXACT_NAMES_FORCED_COLORS_REDUCED_MOTION`.

### F6 — CSS ownership/specificity

`reader-core.css` owns the shared base. Studio keeps only bounded selectors necessary for Classic/IDE cascade parity. No new generic component, global reset or specificity cleanup.

Exact approval: `READER_SHARED_CORE_WITH_STUDIO_PARITY_OVERRIDE`.

### F7 — verification/compatibility/rollback

Require a new red contract, existing parity/i18n/audio gates, RU/EN/HE and media-query browser matrix, exact release locks, mixed old/new client/SW checks and static revert/re-release rollback. No data rollback exists or is needed.

Exact approval: `RED_GREEN_VERSION_LOCK_STATIC_ROLLBACK`.

### F8 — serialized release/acceptance

One implementation slice, one scoped commit/push, one converged production release, actual owner-client update by the agent if offered, then complete real-client smoke. Any defect restarts the full loop.

Exact approval: `SERIALIZED_ONE_SLICE_UPDATED_OWNER_CLIENT`.

## Valid NO_GO closure

If the owner decides the specialist accessibility impact does not justify a release, use:

```text
F1=NO_GO_CLOSE_PROGRAM
F2=EVIDENCE_ACCEPTED_AS_BACKLOG_ONLY
F3=NO_RUNTIME_FILES
F4=NOT_APPLICABLE
F5=NOT_APPLICABLE
F6=NOT_APPLICABLE
F7=NO_RELEASE
F8=CLOSE_AFTER_RESEARCH
SCOPE=NONE
```

That result closes the inquiry with the observations retained here. It does not create a deferred implementation plan.
