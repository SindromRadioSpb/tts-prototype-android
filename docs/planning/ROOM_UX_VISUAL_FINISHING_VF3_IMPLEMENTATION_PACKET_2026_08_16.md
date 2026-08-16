# ROOM-UX-VF3 — Studio shell implementation packet

> Date: 2026-08-16
> Status: `VF3_LOCAL_GREEN_RELEASE_PENDING`
> Source commit: `48ef83e8`
> Branch: `main`; `origin/main` matched the source commit at preflight
> Dirty status: mixed owner worktree; all VF3 runtime/release targets were clean at preflight and unrelated files remain out of scope
> Production: `https://linguistpro.kolosei.com/` and `https://linguistpro.kolosei.com/library.html`, served `3.11.396`
> Evidence classes: repository/code, automated local, isolated browser, production public read-back, production open-owner-tab read-only, owner-reported
> Limitations: physical mobile and assistive technology remain `NOT_RUN`; automation is not either

## 1. Authority and serialized boundary

The owner approved `V9=SERIALIZED_VF0_VF3_ALLOWLIST`, accepted VF0 and VF1, and reported successful VF2 production testing on 2026-08-16. VF2 is therefore `VF2_CLOSED_OWNER_ACCEPTED`; VF3 is the only remaining approved slice. No VF4 is authorized.

VF3 is a narrow Studio-shell adoption of **editorial calm, operational clarity**. It cannot reopen Studio Classic/v3 workflows, the 446-inline-style backlog, B0–B9, Library/Corpus ownership, learner truth, canonical writers, provider behavior, telemetry, schema/data or `GROUP-CORPUS-CACHE-REVOCATION`.

## 2. Exact allowlist

### Runtime presentation

- `public/index.html` — existing Classic/IDE identity and top navigation only; fallback-first sprite enhancement, focus/motion/reduced-motion/forced-colors rules, and presentational state markers.
- `public/i18n/locales/ru.js`
- `public/i18n/locales/en.js`
- `public/i18n/locales/he.js` — remove emoji from only the Studio-shell labels that gain separate icons; preserve semantic parity.

### Release lock

- `public/sw.js` — one cache-version bump and exact locale cache keys.
- `public/library.html` — shared locale cache keys and footer version only.
- `server.js` — exact integrity-manifest locale keys only.

### Tests and evidence

- `tests/visualFinishingStudioShell.test.js` — new red/green VF3 contract.
- `tests/visualFoundations.test.js`, `tests/visualFinishingRoom.test.js`, `tests/visualFinishingLearningSurfaces.test.js` — current release-lock expectations only.
- `tests/i18n.locale-version.lock.json` — mechanical v168 locale hash refresh required by
  `smoke:i18n`; no runtime behavior.
- `scripts/premium/studio-chunks-smoke.js` — verification-only scenario isolation after the broad
  gate proved that the pre-existing OPFS recovery journal survives reload; no runtime change.
- `docs/planning/ROOM_UX_VISUAL_FINISHING_IMPLEMENTATION_PACKET_2026_08_15.md` — serialized status only.
- this packet.
- `docs/research/room-ux-visual-finishing/2026-08-15/README.md`, `FINDINGS.md` and new `VF3_IMPLEMENTATION_EVIDENCE.md` — gate/evidence status only.
- `docs/research/room-ux-visual-finishing/2026-08-15/screenshots/README.md` plus
  `vf3-local-studio-{380-ru,380-he-rtl,desktop-ru}.png` — isolated visual evidence only.

Anything else stops the slice.

## 3. Exact Studio-shell adoption

1. First-party Studio identity appears in Classic and IDE shells. Existing named controls retain visible localized text or localized accessible names.
2. Only the already-vendored bounded sprite is read. The helper validates the static SVG once, keeps a visible Unicode fallback and performs no API, storage, provider or learner-state operation.
3. The exact shell affordances eligible for SVG enhancement are Studio identity/mode, Library/Inspector/Dashboard navigation, unified review, Reading Room, feedback, theme, Morph settings and the mobile IDE tab bar. Specialist workflow emoji stay backlog.
4. RU/EN/HE shell strings gaining separate icons become emoji-free. No new meaning or IA is introduced.
5. Classic/IDE shell buttons, language selectors and mobile tabs adopt the shared three-pixel focus ring, `120/140/160/180 ms` motion roles, zero-motion equivalence and forced-colors outline.
6. Existing Classic next-step and Studio review writers keep full authority. VF3 adds only `data-kind` presentation values so shared status colors never infer or write truth.
7. Existing Classic/v3 layouts, table builders, import/media/ASR/MT, density modes, localStorage keys and every network/data writer remain unchanged.

## 4. Compatibility and rollback

- Old HTML/new SW: the previous emoji/text shell remains complete; the newer cache is harmless.
- New HTML/old SW: the sprite already exists and is precached since VF0; every slot keeps visible Unicode fallback until validation succeeds.
- Sprite failure: icons do not become blank and no retry loop is introduced.
- Old locale/new HTML: hardcoded child-span fallbacks remain visible when a key is absent.
- New locale/old HTML: emoji-free labels remain understandable without an icon.
- Rollback is static: revert the VF3 runtime/release commit, advance APP/SW version, and serve the prior complete shell. No schema/data rollback exists.

## 5. Required gates

1. Exact target preflight and unrelated dirty-file preservation.
2. Red VF3 contract before runtime changes; green afterward.
3. Existing VF0/VF1/VF2, i18n, Reader parity, Studio Morph, import/media, SRS and B6–B8 gates remain green.
4. Desktop RU/EN/HE and 380×844 RU/HE: no clipping, horizontal page overflow or inaccessible icon-only control.
5. Keyboard focus order/names, three-pixel visible ring, SVG silence and DOM/ARIA roles.
6. Light/dark/auto, reduced motion and forced-colors static equivalence.
7. Locale `?v=` URLs, integrity keys, `APP_VERSION`, Room footer and `CACHE_VERSION` remain exact.
8. No new non-GET request, storage key, learner/provider write or owner-data mutation.
9. Commit/push/deploy remain serialized; production public read-back precedes the open owner-tab read-only smoke.

## 6. Role synthesis

- R4/R5/R7: first-party identity and quiet system icons make Studio coherent with Room without weakening the text/work surface.
- R6/R8: RU/EN/HE labels remain visible and truthful; state presentation does not invent an action or learning fact.
- R11: fallback-first enhancement, unchanged workflows and parity gates constrain the slice to do-no-harm.
- R12/R14/R15: the helper has static-asset read authority only; state markers have no writer, tenant or lifecycle authority.
- R16: no dependency, font, icon expansion or broad inline cleanup.
- R17: review counts and training handoff are rendered from existing truth; VF3 cannot grade or write `review_log`.

## 7. Stop conditions

Stop without commit/push/deploy on any target drift, workflow/DOM-parity change, lost fallback, locale mismatch, new write/network call, horizontal overflow, inaccessible focus/name, failed relevant gate or production version/SW mismatch.
