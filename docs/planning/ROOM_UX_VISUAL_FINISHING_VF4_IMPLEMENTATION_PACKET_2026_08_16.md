# ROOM-UX-VF4 — Targeted Residual A11y-State Implementation Packet

```text
DATE=2026-08-16
STATUS=OWNER_APPROVED_IMPLEMENTATION_IN_PROGRESS
PLANNED_RELEASE=3.11.399
```

> Approval: owner statement «Утверждаю рекомендации. Формализуй и стартуй в режиме goal»; exact F1–F8 values are recorded in the VF4 decision packet
> Source baseline: `main@71b2d48ced2ad607151520bacf8443f582ec46cc`; local/remote `origin/main` converged
> Worktree: dirty with 34 unrelated pre-existing entries plus the approved VF4 research artifacts; target runtime files clean at start
> Production baseline: API/Studio/Room/SW `3.11.398`; `/healthz` healthy, DB/migrations ready, disk 75%, warning false
> Actual owner client baseline: `3.11.398`, no visible update action, preserved Ben-Yehuda URL
> Evidence boundary: automated browser is not physical device or AT; owner data remains read-only

## 1. Approved decision

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

The implementation thesis is one sentence:

> Existing Room/Studio row-audio readiness and the current row-TTS action remain truthful, localized and distinguishable without hue or motion, without changing audio truth or behavior.

## 2. Runtime/release allowlist

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

Boundaries:

- `reader-core.css`: existing marker signatures plus forced-colors/reduced-motion parity only.
- `reader-core.js`: localized row-TTS state names and existing marker semantics only.
- `library-ui.js`: pass localized row-TTS labels and use the versioned shared module only.
- `index.html`: existing duplicated Studio marker/TTS paths plus APP/locale/release references only.
- locale files: new row-audio action/state keys in RU/EN/HE only.
- `library.html`, `sw.js`, `server.js`: exact cache/version/footer/integrity lock only.

No visual-foundations, sprite, font, Morph, Trainer, Mentor, table geometry,
note/edit/resizer behavior, audio key/profile/cache/writer, provider, learner,
schema, migration, B9 or cache-revocation change is allowed.

## 3. Test/evidence allowlist

```text
tests/roomUxVf4ResidualA11y.test.js
tests/readerAudioIndicator.test.js
tests/i18n.locale-version.lock.json
tests/visualFinishingLearningSurfaces.test.js
tests/visualFinishingRoom.test.js
tests/visualFinishingStudioShell.test.js
tests/visualFoundations.test.js
scripts/premium/room-audio-indicator-smoke.js
scripts/premium/reader-parity-smoke.js
scripts/premium/fixtures/reader-parity-golden.json
docs/planning/ROOM_UX_VISUAL_FINISHING_VF4_DECISION_PACKET_2026_08_16.md
docs/planning/ROOM_UX_VISUAL_FINISHING_VF4_IMPLEMENTATION_PACKET_2026_08_16.md
docs/research/room-ux-visual-finishing-vf4/2026-08-16/
```

The Reader-parity harness and golden may change only to carry the approved
localized row-action names and their state attributes. Existing i18n and broad
smoke harnesses are run-only unless one exact current assertion owns an approved
changed version/name attribute.

## 4. Red contract

The new test must fail on `3.11.398` because:

1. the shared builder returns Russian row-TTS names for EN/HE;
2. loading/playing/error paths do not update current action names;
3. Studio marker painting remains `aria-hidden`/unnamed;
4. Room forced-colors maps all states to one filled marker;
5. Studio forced-colors has state-signature collisions;
6. Studio working markers still animate under reduced motion.

The red test uses source/DOM fixtures only—never TTS, providers or owner data.

## 5. Green contract

- RU/EN/HE have exact idle/loading/stop/retry labels.
- Glyph, class, busy/error state and accessible name/title change atomically.
- Room and Studio expose concise localized marker names without a new tab stop
  or live-region chatter.
- The five existing marker states use five distinct non-color signatures in
  forced colors.
- `state-working` has `animation-name:none` with reduced motion on both surfaces.
- Existing audio truth/writers and `2/2` unit + `11/11` browser writer smoke stay
  green.
- Table geometry, focus order, RTL order, sticky behavior and target boxes do
  not change.

## 6. Presentation contract

Keep the 10 px status footprint:

| Existing truth | Redundant signature |
|---|---|
| `ok` | filled circle |
| `missing` | hollow circle |
| `mismatch` | dashed circle |
| `too-long` | square/crossed marker |
| `working` | double ring; pulse only under `no-preference` |

Shapes are non-directional and do not mirror in RTL. Existing play/stop glyphs
remain visible fallbacks; the localized accessible name carries the action.

## 7. Release lock

Planned release: `3.11.399`.

- changed Reader CSS/JS and `library-ui.js` use exact `?v=399` URLs;
- shared locale key advances `168 → 169`;
- Studio APP_VERSION, Room footer, SW CACHE_VERSION and API version converge;
- SW precache and server integrity keys use the exact changed URLs;
- old/new HTML/SW and asset-failure fallbacks remain complete.

## 8. Verification

Run:

```text
node --test tests/roomUxVf4ResidualA11y.test.js tests/readerAudioIndicator.test.js
node tests/i18n.smoke.js
node scripts/premium/reader-parity-smoke.js
npm run smoke:room-audio-indicator
node --test tests/visualFoundations.test.js tests/visualFinishingRoom.test.js tests/visualFinishingLearningSurfaces.test.js tests/visualFinishingStudioShell.test.js
```

Then run isolated production-equivalent browser checks at desktop RU/EN/HE,
380×844 RU and HE/RTL, forced colors, reduced motion, keyboard focus, no
overflow, no non-GET request and mixed old/new cache scenarios. Physical mobile,
actual 200% and AT remain separate owner evidence rows.

## 9. Serialized release

After green local evidence: target-only diff review → scoped commit/push → wait
for active production source → repeated API/Studio/Room/SW/health convergence →
connect to actual owner Chrome/Kapture → preserve URL → apply visible update
directly or prove already current → real-client DOM/ARIA/focus/overflow/console
smoke. Any defect restarts the complete loop.

Rollback is static revert plus a new release version. No data rollback, cache
cleanup, volume/image deletion or owner-state repair is part of this slice.
