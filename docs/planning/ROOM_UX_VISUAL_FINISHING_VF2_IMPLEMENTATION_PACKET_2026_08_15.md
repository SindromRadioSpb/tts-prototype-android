# ROOM-UX-VF2 — Reader, Morph and Mentor implementation packet

> Date: 2026-08-15
> Status: `VF2_LOCAL_PASS_DEPLOY_PENDING`
> Source commit: `3745d3f5`
> Implementation commit: `60234bae`
> Branch: `main`
> Dirty status: mixed owner worktree; VF2 runtime targets clean at preflight; VF1 closure evidence pending its scoped commit
> Production: `https://linguistpro.kolosei.com/library.html` / `3.11.392`, exact `VF1 PROD=PASS`
> Evidence classes: repository/code, automated local, isolated browser, production open-owner-tab
> Limitations: physical mobile and assistive technology remain `NOT_RUN`; automation is not either

## 1. Authority and serialized boundary

The owner approved `V9=SERIALIZED_VF0_VF3_ALLOWLIST`, accepted VF0, and delegated the VF1 production browser gate. Release `3.11.392` passed that gate after two bounded corrections, so VF1 is closed and only VF2 is unlocked.

VF2 covers existing Reader, Morph and Mentor presentation. It cannot reopen B0–B8, the Library/Corpus successor program, learner truth, canonical word/FSRS writers, recommendation provenance, provider behavior, frozen B9 or `GROUP-CORPUS-CACHE-REVOCATION`.

## 2. Visual thesis and design plan

Subject: bilingual Hebrew reading and vocabulary learning. Audience: an active learner moving between real texts, word evidence and an optional mentor. Single job: preserve reading rhythm while making action and operational state unmistakable.

The approved thesis remains **editorial calm, operational clarity**:

- palette: inherited ink `#0f172a`, paper `#ffffff`, action blue `#2563eb`, warning ochre `#d97706`, error red `#dc2626`; dark values remain the shipped foundation values;
- type: system UI for controls, Georgia/Times for RU/EN editorial display, Frank Ruhl Libre for Hebrew reading, Assistant/Noto Sans Hebrew for intentional Hebrew UI, tabular numerals only for counts;
- layout: the bilingual table remains the reading plane; word evidence enters as one bounded bottom sheet; Mentor keeps its existing vertical blocks;
- signature: Reader's quiet logical-start rail carries playing/selected/error continuity without adding ornamental cards;
- motion: only 120/140/160/180 ms continuity; reduced motion removes loops and transforms while retaining a static rail/outline/state label.

Self-critique removed three generic moves: no new gradient, no card-per-state rewrite, and no broad icon sweep. The one deliberate risk is stronger three-pixel focus visibility across dense Reader/Morph/Mentor controls; it is justified by keyboard clarity and forced-colors fallback.

## 3. Exact allowlist

### Runtime

- `public/css/reader-core.css`
- `public/css/reader-morph.css`
- `public/js/mentor-home.js`
- `public/js/library-ui.js` only for the existing Mentor host's presentational icon capability
- `public/library.html` only for Mentor/Reader/Morph focus, state, type and motion CSS
- `public/js/morph-host.js` only if a shared word-card presentation need is proved; currently not required

### Release lock, tests and evidence

- `public/index.html`, `public/sw.js` and Room footer/module query only when the VF2 deploy version is chosen
- `tests/visualFinishingLearningSurfaces.test.js`
- existing Reader/Morph/Mentor/VF/B6–B8 gates
- this packet and `docs/research/room-ux-visual-finishing/2026-08-15/VF2_IMPLEMENTATION_EVIDENCE.md`

Anything else stops the slice.

## 4. Component adoption

1. Reader table layout and builder markup remain byte-parity locked with Studio. Existing Unicode action fallbacks stay until the paired Studio builder can advance in VF3.
2. Reader control focus, hover/pressed continuity, audio working/error static equivalence, reduced motion and forced colors adopt the foundation contract.
3. Morph surfaces replace their duplicated generic theme values with foundation aliases while retaining word-status/provenance domain tokens.
4. Morph sheet motion moves from 220 ms to the approved 180 ms overlay token; reduced motion removes all loops/transforms.
5. Mentor receives SVG enhancement only through a host capability. The portable module keeps Unicode fallbacks when mounted without the Room host/sprite.
6. Repeated Mentor identity, play/read/audio, info/success/warning/error states use icon plus localized text; icons stay `aria-hidden` and do not own action names.
7. Existing Mentor API/state machines and every POST remain byte-semantically unchanged.

## 5. Compatibility and rollback

- Old Room host + new Mentor module: the absent icon capability leaves visible Unicode fallback.
- New Room host + old Mentor module: the extra host function is ignored.
- Sprite unavailable: Room's existing one-shot validated sprite path retains fallback and does not retry.
- Reader/Morph CSS remains complete over existing markup; no table DOM or width contract changes.
- Rollback is static: revert VF2 runtime/release commits and advance APP/SW version. No data/schema rollback exists.

## 6. Red-to-green gates

1. Exact target preflight and unrelated dirty-file preservation.
2. A red VF2 contract before runtime changes, green afterward.
3. Reader parity, audio indicator, karaoke, notes and warm Reader smokes remain green.
4. Morph host/unit and browser morphology smokes remain green; canonical writers/review log unchanged.
5. Mentor server/UI smoke remains green; no automatic LLM/provider request and no new telemetry/write.
6. Desktop RU/EN/HE, 380 RU/HE, long Hebrew/mixed content and no page overflow.
7. Keyboard focus, accessible names, SVG silence and DOM/ARIA roles.
8. Auto/light/dark, reduced motion and forced-colors static equivalence.
9. Old/new client/SW fallback and exact version lock before deployment.
10. Serialized production read-only smoke before owner handoff.

## 7. Role synthesis

- R4/R5/R7: keep text and the reading plane primary; use one rail and quiet icons.
- R6: preserve explicit Hebrew language/direction and visible focus, including forced colors.
- R8/R17: presentation renders existing truth; no new state machine or implicit learner event.
- R11/R15: Reader parity, portable Mentor fallback and static rollback constrain compatibility risk.
- R14: host icon capability is presentational and performs no new data/provider call.
- R16: reuse the already-served foundation and sprite; no dependency or font payload.

## 8. Handoff condition

Do not call VF2 complete until its local gates, serialized deploy and production read-only smoke pass. Physical-device/AT evidence remains separate and must not be inferred.

## 9. Local implementation result

The bounded runtime and old/new SW contract are implemented in `60234bae`. The release is locked to `3.11.393`; every changed shared asset is requested and precached under the same exact versioned URL so a stale controlling worker cannot combine new HTML with old Reader/Morph/Mentor bytes.

Local result is PASS: VF2 contract `6/6`, combined visual/Reader/Morph contracts `43/43`, i18n `233/233`, B6 `45/45`, B7 `163/163`, B8 PASS with zero `review_log`/RUM writes, Reader parity, Room audio indicator `11/11`, Reader karaoke `9/9` plus word karaoke `18/18`, Reader notes, Reader/Studio Morph and Mentor server `25/25`. One concurrent B6 browser run timed out before assertions; the required isolated rerun passed `45/45`, so it is recorded as harness contention rather than product evidence.
