# ROOM-UX-VF4-R — Residual Visual Quality Successor Decision Packet

```text
MODE=GOAL_RESEARCH_ONLY
DATE=2026-08-16
STATUS=OWNER_APPROVED_IMPLEMENTATION_IN_PROGRESS
RECOMMENDATION=TARGETED_RESIDUAL_A11Y_STATE
```

## Owner approval — 2026-08-16

The owner stated: **«Утверждаю рекомендации. Формализуй и стартуй в режиме goal»**.
No value was changed, so this is recorded as approval of the exact recommended
block:

```text
APPROVE ROOM-UX-VF4-R:
F1=TARGETED_RESIDUAL_A11Y_STATE;
F2=ROW_AUDIO_STATE_NONCOLOR_LOCALE_ACTION_PARITY;
F3=ROOM_STUDIO_ROW_AUDIO_ONLY;
F4=EXISTING_GLYPHS_PLUS_NONCOLOR_MARKER_SEMANTICS;
F5=STATE_EXACT_NAMES_FORCED_COLORS_REDUCED_MOTION;
F6=READER_SHARED_CORE_WITH_STUDIO_PARITY_OVERRIDE;
F7=RED_GREEN_VERSION_LOCK_STATIC_ROLLBACK;
F8=SERIALIZED_ONE_SLICE_UPDATED_OWNER_CLIENT;
SCOPE=ROW_AUDIO_MARKER_AND_ROW_TTS_CONTROL_ONLY;
```

Approval authorizes the bounded implementation/release loop only. Every closed,
frozen, backlog and no-write boundary below remains binding.

> Source commit: `71b2d48ced2ad607151520bacf8443f582ec46cc`
> Branch: `main`; local `origin/main` and remote `refs/heads/main` matched
> Worktree: `DIRTY`, 34 pre-existing unrelated entries at research start; runtime/release targets remained clean and unchanged
> Production: `https://linguistpro.kolosei.com/library.html` and `https://linguistpro.kolosei.com/index.html`, release `3.11.398`
> Actual client: authorized owner Chrome/Kapture profile at `3.11.398`, no visible update action; owner URL preserved
> Evidence classes: `CODE_CURRENT`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `AUTOMATED_LOCAL`, `OWNER_REPORTED_PREDECESSOR`, `EXTERNAL_PRIMARY`
> Limitations: physical mobile, actual browser 200%, VoiceOver/NVDA/JAWS and other AT remain `NOT_RUN`; automation/Kapture is not substituted for those rows.

## 1. Owner decision in one paragraph

Keep VF0–VF3 closed generally, but approve one residual implementation slice for the existing Room/Studio bilingual-table **row-audio readiness marker and row-TTS control only**. Current production proves a repeated truthful-state/accessibility defect: the real owner Studio has meaningful ready/mismatch markers that are all hidden from AT; Reader forced colors makes every marker identical; Studio reduced motion still pulses; and the shared TTS control is Russian in EN/HE and keeps a “play” name when its real action becomes stop. This is not an emoji sweep, CSS cleanup, new state system or audio rewrite. It can be corrected without changing any canonical writer and rolled back statically.

`NO_GO_CLOSE_PROGRAM` remains a valid successful owner counter-decision and has an exact closure block in §12.

## 2. Closed baseline

- VF0 foundations/sprite/licence/provenance/focus/status/motion/type remain accepted.
- VF1 Library/L0/corpus finishing remains accepted.
- VF2 Reader/Morph/Trainer/Mentor finishing remains accepted.
- VF3 Studio shell finishing remains accepted: implementation `c1656c0b`, correction `a71e37a8`, evidence `dc8b8f55`, updated real-client Kapture smoke and owner `VF3 PROD=PASS` on 2026-08-16.
- `B_EDITORIAL_CALM`, additive migration, vendored SVG + first-party marks, existing script roles and RU/EN/HE semantic parity remain binding.
- B0–B8 and the Library/Corpus successor are closed.
- B9 is `FROZEN · NO IMPLEMENTATION · NO MIGRATION`.
- `GROUP-CORPUS-CACHE-REVOCATION` remains a separate future security lane.

No successor may add/change learner data, recommendations, assignments, progress, grading, telemetry, providers, schema, migrations, owner-content lifecycle or audio truth/writers.

## 3. Evidence chain

### Current code and served production

Production and local SHA-256 matched exactly for:

| Asset | SHA-256 |
|---|---|
| `public/css/reader-core.css` | `b401ba9e41cc43c71e364f45477e4e1ec7fd31917d35d4b97e922940180d37b6` |
| `public/js/reader-core.js` | `adbeb2f7731ff4d4e9e6125e9acd78f28976c5da40772c2f8b592e0db9878f02` |
| `public/index.html` | `c6a5d78d4dafbf1093b5223da8a9e62682a798e3d88c9cca44c4ef3577799f87` |

Therefore the defect is current production, not local drift or a stale release.

Code facts:

- `reader-core.css` maps all forced-colors `.row-audio-ind.state-*` selectors to the same filled `CanvasText` circle.
- Studio duplicates the marker CSS/painter in `index.html`; its reduced-motion blocks do not suppress `v3AudioPrefetchPulse` for `state-working`.
- Studio builder/painter leaves the marker `aria-hidden` and changes only class/title.
- `reader-core.js` uses a supplied `t` callback for table headings but hardcodes Russian row-TTS title/name.
- `setLoading`, `setPlaying`, `setError` and clear paths change glyph/class/function without updating the accessible name.
- Room already passes localized audio labels and exposes marker `role=img`/`aria-label`; safer semantics can be aligned without a new truth owner.

### Production/client evidence

API, Studio, Room and SW converged at `3.11.398`; health/DB/migrations were ready.

Actual owner Library:

- current footer/client, no update action;
- URL stayed `https://linguistpro.kolosei.com/library.html#room=benyehuda`;
- no overflow, visible error, unnamed control or console warning/error;
- no navigation into owner text/group/list data and no mutation.

Temporary actual owner-profile Studio:

- 42 rendered rows;
- 29 `state-ok`, 13 `state-mismatch`;
- 42/42 markers `aria-hidden`, 0 named;
- 42 row-TTS controls, no active playback;
- no overflow, unnamed control, visible icon fallback or console warning/error.

### Isolated automation

At 380×844 RU and HE/RTL:

- no horizontal overflow and no non-GET request;
- `ok=mismatch` and `too-long=working` under Studio forced colors;
- Room's explicit forced-colors rule collapses all five states;
- Studio working marker still has `animation-name=v3AudioPrefetchPulse` while reduced motion matches;
- production Reader builder returns Russian row action names in HE;
- warm offline/reconnect remains truthful and stable.

This is `ISOLATED_AUTOMATION`, not physical-device/AT/owner-live evidence.

### Primary external evidence

These sources change the decision because the proved state cannot rely on hue and scripted component names/states must remain current:

- W3C WCAG 2.2 Use of Color: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- W3C WCAG 2.2 Non-text Contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- W3C WCAG 2.2 Name, Role, Value: https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html
- W3C failure F20, stale text alternatives: https://www.w3.org/WAI/WCAG22/Techniques/failures/F20.html
- W3C Language of Parts: https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html

## 4. Outcome comparison

| Outcome | User-visible evidence | Role critique | Risk / compatibility / rollback | Decision |
|---|---|---|---|---|
| A `NO_GO_CLOSE_PROGRAM` | most residuals are low-value backlog and the accepted surfaces look stable | R5/R6/R16 favor closure when evidence is cosmetic | no release risk, but accepts a proved state/name defect | valid, not recommended |
| B `TARGETED_RESIDUAL_A11Y_STATE` | repeated real row states are hidden/color-only; wrong/stale TTS names; motion preference parity fails | R4/R5/R6/R7/R8 support a compact truthful correction; R11/R12 require strict parity/no writers | bounded duplicate-path and SW/locale risk; exact gates; static rollback | **recommended** |
| C `SURFACE_LOCAL_SPECIALIST_FINISH` | remaining emoji are labelled/decorative/specialist | R4/R6: no measured workflow harm | scope-creep risk into icon sweep | `NO_GO` |
| D `CSS_DEBT_ONLY` | 446 inline styles/347 `!important` are not a visible defect | R11/R16: broad blast radius without user value | higher regression cost than leaving debt | `NO_GO` |

## 5. F1 — successor gate

### Options

1. `NO_GO_CLOSE_PROGRAM`
2. `TARGETED_RESIDUAL_A11Y_STATE`
3. `SURFACE_LOCAL_SPECIALIST_FINISH`
4. `CSS_DEBT_ONLY`

### Evidence and critique

- Code: exact shared/duplicate audio-state and accessible-name defects above.
- Production: served assets match code; state exists in current production.
- Updated owner client: already on `3.11.398`; real Studio fixture includes both ready and mismatch states.
- Isolated automation: RU/HE, forced-colors and reduced-motion failures reproduced with no write.
- External: color-only and stale control alternatives are directly relevant.
- Roles: R4/R5/R6/R7/R8 justify a quiet corrective slice; R11/R12/R14/R15/R16/R17 restrict it to presentation with no new truth or calls.

### Risk / compatibility / rollback

Main risk is Reader/Studio duplicate-path divergence and mixed cached assets. Exact red/green parity, locale/SW locks and mixed-client checks bound it. Rollback is a static revert plus a new release version; no data rollback.

### Recommendation / exact approval

```text
F1=TARGETED_RESIDUAL_A11Y_STATE
```

## 6. F2 — user-visible problem and success criterion

### Options

- `NO_CURRENT_PROBLEM`: reject the evidence as non-material.
- `ROW_AUDIO_STATE_NONCOLOR_LOCALE_ACTION_PARITY`: correct the repeated audio component.
- `ALL_TABLE_ACTION_A11Y`: include note/edit/resizer and create a broader action-column program.

### Evidence and critique

The middle option is the smallest that resolves every qualifying row-audio observation. `NO_CURRENT_PROBLEM` contradicts current production DOM/computed state. `ALL_TABLE_ACTION_A11Y` includes real new backlog evidence but lacks the same current owner/non-audio workflow proof and violates the one-thesis boundary.

R6/R7: readiness and play/stop meaning affect listening continuity. R8: keep it compact. R11/R12: no state rewrite. R5: no tooltip-only dependence.

### Success criterion

For existing Room and Studio rows:

- readiness remains distinguishable without hue in normal and forced colors;
- existing readiness truth is programmatically named in RU/EN/HE;
- working has a static reduced-motion equivalent;
- row-TTS idle/loading/stop/retry names match locale and current available action;
- no geometry, writer, provider, network or learner-state change.

### Recommendation / exact approval

```text
F2=ROW_AUDIO_STATE_NONCOLOR_LOCALE_ACTION_PARITY
```

## 7. F3 — exact scope, files and backlog

### Options

- `NO_RUNTIME_FILES`
- `ROOM_STUDIO_ROW_AUDIO_ONLY`
- `FULL_ACTION_COLUMN_AND_CSS_CLEANUP`

### Recommended surfaces/components

```text
Room Reader + Studio Classic/IDE
  .row-audio-ind
  .row-tts-btn
```

### Exact future runtime/release allowlist

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

Limits:

- `library-ui.js`: localized row-audio label plumbing and exact versioned import/reference compatibility only.
- `library.html`: release/cache reference and footer lock only.
- `index.html`: existing row-audio marker/TTS paths plus release/locale references only.
- `sw.js`/`server.js`: exact version, precache and integrity keys only.

### Exact future tests/evidence allowlist

```text
tests/roomUxVf4ResidualA11y.test.js
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

Existing i18n and Reader parity harnesses are run-only unless the approved changed semantic attribute makes one exact assertion obsolete.

### Explicit backlog

- note/edit/resizer labels and keyboard behavior;
- remaining emoji/specialist icons;
- My Texts error/empty behavior;
- all table geometry, notes/edit, karaoke and audio behavior;
- Studio CSS/inline-style cleanup;
- new theme, sprite, font or component platform;
- Morph/Trainer/Mentor/Library shell/IA;
- B9 and group-cache security work.

### Risk / compatibility / rollback

The allowlist spans shared and duplicated code only because one-surface repair would be false parity. Exact builder/Room/Studio gates precede release. Revert stays static.

### Recommendation / exact approval

```text
F3=ROOM_STUDIO_ROW_AUDIO_ONLY
```

## 8. F4 — icon, typography and RTL semantics

### Options

- new SVG/status icon family;
- existing play/stop glyphs plus non-color marker semantics;
- persistent text badges per row.

### Evidence and critique

No sprite or typography defect was observed. A new icon family adds provenance and old-client work; text badges add dense repeated visual noise. R4/R8 favor a compact shape grammar; R5 requires it not depend on hover; R11 requires forced-colors signatures; RTL states are non-directional and must not mirror.

The play/stop glyph remains a visible fallback, while the localized control name carries function. Marker shape/border/fill carries redundant state without becoming a tab stop.

### Compatibility / rollback

Old clients retain the current glyph/color dot. New CSS/old markup remains complete. Sprite failure is irrelevant. Static rollback restores prior presentation.

### Recommendation / exact approval

```text
F4=EXISTING_GLYPHS_PLUS_NONCOLOR_MARKER_SEMANTICS
```

## 9. F5 — focus, contrast, state and motion contract

### Options

- keep color/title and AT divergence;
- exact non-color + localized/current names + zero-motion equivalence;
- introduce a general cross-product state component.

### Required contract

- preserve focus order, three-pixel focus presentation and target boxes;
- five marker states have five non-color signatures in forced colors;
- marker names are localized and derived from the existing state, not new inference;
- row-TTS name/title/busy/playing/error updates are atomic with glyph/class changes;
- working animation runs only with `no-preference`;
- status is not conveyed by hue alone;
- no focus jump, live-region spam or new persistent label column.

Owner-client code evidence and isolated RU/HE media evidence support the middle option. W3C primary guidance changes the decision. R4/R5/R11 enforce perceptibility; R12/R17 forbid truth/grading changes.

### Risk / compatibility / rollback

Risk is excessive AT noise if each marker is independently announced. The implementation test must confirm a concise non-focusable name and no duplicate live announcements. Rollback is static.

### Recommendation / exact approval

```text
F5=STATE_EXACT_NAMES_FORCED_COLORS_REDUCED_MOTION
```

## 10. F6 — shared versus local CSS ownership

### Options

- duplicate independent fixes;
- `reader-core.css` shared base plus the minimum Studio parity selector;
- move all Studio/Reader CSS into a new component platform.

### Evidence and critique

Current divergence came from separate shared/Studio presentation owners. `reader-core.css` already owns the Reader base; Studio's monolith has stronger Classic/IDE selectors. R11 requires one tested contract, while R16 rejects a migration-sized cleanup. No global reset, `[style*=]`, blanket `!important`, alias deletion or visual-foundations change is allowed.

### Risk / compatibility / rollback

Minimum selector changes reduce blast radius. Shared Reader parity and Studio Classic/IDE smoke detect cascade regressions. Static revert restores both.

### Recommendation / exact approval

```text
F6=READER_SHARED_CORE_WITH_STUDIO_PARITY_OVERRIDE
```

## 11. F7 — verification, compatibility and rollback

### Options

- static unit test only;
- red/green + browser matrix + release locks + mixed clients + static rollback;
- broad full-product visual requalification.

### Evidence and critique

Current automated gates are strong but do not assert the new defect; existing audio smoke proves truth/writer integrity and must stay green. Current production uses a mix of unversioned and cache-busted Reader assets, so R11/R16 require exact old/new SW and locale locks. A full-product rewrite qualification is disproportionate; shared reach still requires Reader/Morph/Trainer/Studio regression checks.

Required rows are specified in:

- `docs/research/room-ux-visual-finishing-vf4/2026-08-16/VERIFICATION_RELEASE_AND_ROLLBACK_PROTOCOL.md`

They include desktop RU/EN/HE, 380 RU/HE, actual 200%, keyboard, separate AT, themes, forced colors, reduced motion, in-scope states, parity, no overflow/writes, mixed clients, version lock and static rollback.

### Recommendation / exact approval

```text
F7=RED_GREEN_VERSION_LOCK_STATIC_ROLLBACK
```

## 12. F8 — serialized implementation/deployment/acceptance

### Options

- docs-only closure;
- one serialized slice through updated owner client;
- parallel/shared-surface changes or multiple deployments.

### Required sequence

1. red test and implementation packet;
2. allowlisted implementation only;
3. local/unit/browser gates and diff hygiene;
4. one scoped commit/push;
5. wait for active production image to match;
6. repeated API/Studio/Room/SW and `/healthz` convergence;
7. connect to actual owner Chrome/Kapture and preserve URL;
8. click the visible update action directly, or prove the client is already current;
9. complete actual owner-client smoke with version/update/DOM/ARIA/focus/overflow/console/state evidence;
10. any defect restarts fix→gates→commit/push→deploy→update→full smoke;
11. hand off only when the updated real client is green.

No owner-data mutation, provider invocation or isolated-automation substitution is allowed. Physical mobile/AT remain separately named rows.

R11/R16 require serialization because Reader and Studio share/cache related assets. R14/R15 keep the live smoke read-only. Rollback uses the same updated-client loop with a new static release.

### Recommendation / exact approval

```text
F8=SERIALIZED_ONE_SLICE_UPDATED_OWNER_CLIENT
```

## 13. Consolidated risks and mitigations

| Risk | Mitigation | Rollback |
|---|---|---|
| Reader/Studio semantic drift | one red contract over both paths; Reader parity and Studio Classic/IDE smoke | static revert/re-release |
| stale CSS/JS/locale | cache-busted changed assets; exact precache/integrity/locale lock | new rollback version |
| AT verbosity | non-focusable concise marker name; no new live region | revert semantics |
| visual density | retain marker footprint and glyphs; no badge/text column | revert CSS |
| truth/writer regression | existing `2/2` unit + `11/11` browser audio writer contract; no logic edits | no data rollback |
| RTL/reflow regression | 380 RU/HE + actual 200% + long-title rows | static revert |
| owner-state mutation | read-only smoke; no audio invocation, grading, notes or presentation changes | stop immediately; no cleanup |

## 14. Research artifacts

```text
docs/research/room-ux-visual-finishing-vf4/2026-08-16/
  README.md
  VF0_VF3_CLOSED_BASELINE.md
  RESIDUAL_SURFACE_COMPONENT_STATE_INVENTORY.md
  LIVE_OWNER_CLIENT_EVIDENCE.md
  A11Y_MOTION_RTL_REFLOW_GAP_AUDIT.md
  CSS_TOKEN_OWNERSHIP_AND_DEBT_MAP.md
  SUCCESSOR_OPTIONS_AND_ROLE_SYNTHESIS.md
  VERIFICATION_RELEASE_AND_ROLLBACK_PROTOCOL.md
  FINDINGS.md
```

No screenshots were captured; exact DOM/ARIA/computed-style and byte-identity evidence was sufficient.

## 15. Recommended approval block

```text
APPROVE ROOM-UX-VF4-R:
F1=TARGETED_RESIDUAL_A11Y_STATE;
F2=ROW_AUDIO_STATE_NONCOLOR_LOCALE_ACTION_PARITY;
F3=ROOM_STUDIO_ROW_AUDIO_ONLY;
F4=EXISTING_GLYPHS_PLUS_NONCOLOR_MARKER_SEMANTICS;
F5=STATE_EXACT_NAMES_FORCED_COLORS_REDUCED_MOTION;
F6=READER_SHARED_CORE_WITH_STUDIO_PARITY_OVERRIDE;
F7=RED_GREEN_VERSION_LOCK_STATIC_ROLLBACK;
F8=SERIALIZED_ONE_SLICE_UPDATED_OWNER_CLIENT;
SCOPE=ROW_AUDIO_MARKER_AND_ROW_TTS_CONTROL_ONLY;
```

Changed values are valid owner counter-decisions and must be reconciled before implementation.

## 16. Exact NO_GO closure block

```text
APPROVE ROOM-UX-VF4-R:
F1=NO_GO_CLOSE_PROGRAM;
F2=EVIDENCE_ACCEPTED_AS_BACKLOG_ONLY;
F3=NO_RUNTIME_FILES;
F4=NOT_APPLICABLE;
F5=NOT_APPLICABLE;
F6=NOT_APPLICABLE;
F7=NO_RELEASE;
F8=CLOSE_AFTER_RESEARCH;
SCOPE=NONE;
```

This closes the successor inquiry without runtime work. The observations remain documented as low-priority accessibility backlog. It does not create an implementation-shaped deferred plan.

## 17. Stop

Until one approval block is received and reconciled:

- no runtime/CSS/HTML/JS/i18n/icon/font/asset edit;
- no version/SW bump, schema/migration/data change;
- no B9 or cache-revocation work;
- no broad Studio/CSS/IA cleanup;
- no owner content/learning/presentation/provider/cache mutation;
- no commit, push, deploy, production update or cleanup;
- no physical-device/AT claim from automation;
- no presumption that implementation is authorized.
