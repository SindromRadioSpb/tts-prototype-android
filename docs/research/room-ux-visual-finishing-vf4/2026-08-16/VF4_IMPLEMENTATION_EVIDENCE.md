# ROOM-UX-VF4 — targeted residual accessibility-state implementation evidence

> Date: `2026-08-16`
> Status: `CLOSED_OWNER_ACCEPTED_PROD_PASS`
> Source baseline: `main@71b2d48ced2ad607151520bacf8443f582ec46cc`; local and remote origin matched at preflight
> Implementation commit: `8dda777d` (`feat: ship VF4 row audio accessibility state`), pushed to `origin/main`
> Dirty status: mixed owner worktree; 34 unrelated pre-existing entries remain preserved and unstaged
> Production: `https://linguistpro.kolosei.com/library.html` and `https://linguistpro.kolosei.com/index.html`, release `3.11.399`
> Release: API/Studio/Room/SW converged on `3.11.399`; the served runtime cohort matches the implementation commit byte-for-byte (production exposes no commit-ID endpoint)
> Actual owner client: authorized Chrome/Kapture client updated by the agent from `3.11.398` to `3.11.399`; Ben-Yehuda URL preserved
> Evidence classes: `OWNER_APPROVAL`, `CODE_CURRENT`, `AUTOMATED_LOCAL`, `ISOLATED_AUTOMATION`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`
> Limitations: no physical mobile or assistive-technology session was run. Browser automation is not AT or physical-device evidence. Actual desktop Chrome 200% is owner-reported protocol evidence; the isolated 200%-equivalent row remains separately labelled automation.

## 1. Approved boundary

The owner approved the exact recommended values on 2026-08-16:

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

No learner truth, progress, grading, recommendation, assignment, schema,
migration, provider selection, audio identity, cache key, canonical writer, B9
or `GROUP-CORPUS-CACHE-REVOCATION` behavior changed.

## 2. Implemented contract

- Shared Reader and Studio Classic/IDE row-TTS controls use an atomic presentation helper for `idle`, `loading`, `playing` and `error`.
- The helper changes glyph, disabled/busy/pressed state, class, title and accessible action name together.
- RU/EN/HE supply exact play/loading/stop/retry/unavailable labels; provider error detail is not exposed as the control name.
- Existing `ok`, `missing`, `mismatch`, `too-long` and `working` marker truth is retained. Shape/border signatures make it redundant to hue.
- Studio marker painting removes `aria-hidden` only after a truthful state is known, exposes a concise localized `role=img` name, and creates no focus target or live region.
- Forced-colors retains five signatures; reduced motion removes the working animation in Room and Studio.
- Release lock is `3.11.399`; changed Reader CSS/JS and Room module use `?v=399`, locales use `?v=169`, and SW/server integrity keys match exactly.

## 3. Red/green evidence

| Gate | Result |
|---|---:|
| VF4 contract on untouched `3.11.398` | expected RED: `1/7` pass, `6/7` fail |
| VF4 contract after implementation | PASS `7/7` |
| Reader audio unit contract | PASS `3/3` |
| Combined VF0–VF4/current release contracts | PASS `42/42` |
| RU/EN/HE i18n symmetry, duplicate scan, bidi and cache/version lock | PASS `233/233` |
| Reader builder/leaf golden parity | PASS, `4` builder cases and `37` leaf checks |
| `git diff --cached --check` | PASS |

The parity golden changed only for the approved row-action name/state attributes.
Table columns, geometry, row content and audio cache keys remain parity-locked.

## 4. Isolated browser matrix

The fixture is a service-worker-blocked, non-owner Playwright context with
smoke-owned OPFS rows. Its BYOK response is mocked and cleanup removes every
fixture row/key after the run.

| Fixture | Result |
|---|---:|
| 380×844 RU success path | PASS `18/18`; overflow `0`, no page error |
| 380×844 HE/RTL success path | PASS `18/18`; `dir=rtl`, overflow `0`, no page error |
| desktop RU/EN/HE success paths | PASS `54/54`; no horizontal overflow or page error |
| 380×844 RU/HE error paths | PASS `32/32`; localized Retry, no raw provider detail, marker remains missing |
| Room/Studio forced colors | PASS: `1px solid`, `2px solid`, `2px dashed`, square, `3px double` signatures |
| Room/Studio reduced motion | PASS: working marker `animation-name:none` |
| atomic action transitions | PASS: localized Idle → busy Loading → pressed Stop, or localized Retry |
| canonical isolated writer | PASS: successful fixture asset persists through the existing local-db writer and survives reload |

No screenshot was needed: computed DOM/ARIA/style values and exact assertions
prove the approved defect more directly. No production or owner-data write was
performed by this matrix.

## 5. Broader regression evidence

| Gate | Result |
|---|---:|
| Studio UX maturity | PASS unit `9/9`, browser `92/92` |
| Studio Morph | PASS |
| Room B6 scale/resilience | PASS `45/45` on clean rerun; the first browser run timed out waiting for the HE filter-empty fixture after all `26/26` unit rows passed |
| Room B0–B8 | PASS unit `30/30` plus isolated journey/reflow browser gate |
| Studio ↔ Room SRS | PASS `49/49`, including zero review-log rows on open/close and one canonical event on the isolated grade fixture |
| Lesson Builder auxiliary harness | `101/102`; its one stale string assertion also fails against untouched source `HEAD` because the already-correct return branch is multiline. Product code is unchanged in that path; the out-of-scope harness was not weakened. |

The B8 browser gate includes 200%-equivalent reflow, RU/HE/RTL, text spacing,
no overflow and zero review-log/RUM changes. It remains isolated automation, not
an actual owner-browser zoom or AT claim.

## 6. Compatibility and rollback

- Old HTML/new SW retains complete old row controls and marker CSS.
- New HTML/old SW has versioned network fallbacks; existing glyphs and base marker rule remain complete if a changed asset fails.
- SW refuses a byte-mixed critical shell cohort through the existing release/version and integrity contract.
- Rollback is static: revert the runtime slice, advance APP/SW/cache-bust versions, redeploy, update the actual client and repeat the complete smoke. No data rollback exists.

## 7. Production and owner-client rows

| Row | Status |
|---|---|
| scoped commit/push | PASS: `8dda777d`, pushed to `origin/main` |
| active production image equals pushed commit | PASS by exact deploy-cohort inference: production exposes no commit-ID endpoint; exact bytes match for `index.html`, `library.html`, `sw.js`, `library-ui.js?v=399`, `reader-core.js?v=399`, `reader-core.css?v=399` and the sprite; RU/EN/HE Git-normalized bytes equal the served integrity hashes |
| repeated API/Studio/Room/SW `/healthz` convergence at `3.11.399` | PASS at `10:24:25+03:00` and `10:24:41+03:00`; final health at `10:32:19+03:00` was `ok=true`, DB/migrations ready, disk `79%`, warning false |
| actual owner Chrome update action applied by the agent | PASS: visible Russian `Обновить` clicked on the existing Ben-Yehuda landing; shell changed `3.11.398 -> 3.11.399` |
| updated real-client DOM/ARIA/focus/overflow/console smoke | PASS: URL/hash preserved, Reader closed, no overflow, no update banner, zero console warnings/errors |
| owner-profile Studio VF4 state | PASS: 42 rows/markers/buttons; 29 ready and 13 mismatch markers with `role=img`, concise RU names and solid-versus-dashed non-color signatures; all buttons localized idle with `busy=false`, `pressed=false`, enabled |
| keyboard focus and audio non-invocation | PASS: focus reached a row-TTS button, visible `2px solid` outline, unobscured; audio remained paused at `0`, all 42 controls remained idle |
| actual owner-browser 200% reflow | `OWNER_REPORTED_PASS`: the final owner statement reports the supplied protocol passed; the agent could not independently set browser zoom, and isolated automation remains separately labelled |
| final owner protocol acceptance | PASS: `Проверил по протоколу. Тестирование пройдено успешно.` |

The real-client release and owner protocol gates are green. Physical mobile and
AT speech remain explicit unclaimed acceptance rows; optional checklist rows not
separately enumerated by the owner are not promoted to individual claims. None
expands the shipped scope.
