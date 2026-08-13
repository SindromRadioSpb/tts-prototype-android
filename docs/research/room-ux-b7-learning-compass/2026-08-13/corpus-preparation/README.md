# B7 full readable-corpus preparation — pre-production evidence

Date: 2026-08-13
Candidate: `3.11.369`
Evidence class: engineering automation only; not owner-live or physical/AT.

## Owner defect and accepted correction

The three corpus surfaces exposed different functionality: My Texts could
self-prepare, Study Songs required a first Reader open, and Ben-Yehuda did not
offer the same explicit familiarity sort. Owner direction replaces the
`materialized-group-only` portion of B7 D2 with full preparation of every
readable work before selection. B0–B6 remain closed.

## Implemented source contracts

| Source | Complete preparation boundary | No first-open dependency |
|---|---|---|
| My Texts | full local background pass, up to B6 scale `5,000` | yes |
| Study Songs / protected group | proactively prewarmed content-free sidecar for the exact catalog revision; membership-gated delivery | yes |
| Ben-Yehuda | all `796` ready/readable works in the existing v7 public sidecar | yes |

The public Ben-Yehuda catalog contains `26,455` records, but only `796` have
the readable body/translation bundle required by Reading Room. Catalog-only
records are not assigned fabricated familiarity.

The shared sort ranks only `AVAILABLE + rank_eligible` estimates. If a corpus
has no reliably comparable texts (the current owner Study Songs profile is a
real example), the control now returns to its previous order and explains the
uncertainty instead of appearing to accept a no-op sort. Lower-bound facts
remain visible on every prepared card.

## Verification

- `node --test tests/learningCompass.test.js tests/roomUxMaturity.test.js`:
  `34/34`.
- `npm run smoke:room-b7`: contract + browser matrix PASS; direct rerun after
  Ben full-index assertion: `161/161`.
- `npm run smoke:room-b6`: `45/45`.
- `node scripts/premium/group-corpus-api-smoke.js`: PASS; owner/member allowed,
  anonymous/revoked denied, content-free `private, no-store` packet.
- `node scripts/premium/group-corpus-ui-smoke.js`: PASS at `380/510/1280`;
  synthetic full protected catalog ranked `90%`, `60%`, `20%`; protected body
  fetches during card paint: `0`; a limited-only corpus rejects the silent sort
  and exposes the localized reason.
- `node scripts/premium/canon-version-smoke.js`: `18/18`.
- Chrome DevTools mobile snapshot at 380 px: status
  `Подбор по знакомости готов · 796 текстов`; shared sort has a 44 px target,
  full visible label and no horizontal overflow.
- Lighthouse mobile accessibility: initial `93`, then `100` (`35` passed,
  `0` failed) after footer contrast/target and form-label fixes. Orphaned and
  nameless form controls: `0`.
- Keyboard no-profile case: focus stays on the sort, value reverts to the
  prior valid sort, and the visible explanation is
  `Сначала отметьте несколько знакомых слов.`

## Invariants

- No comprehension/CEFR threshold promise; only exact recorded familiarity or
  lower bound with unresolved counts.
- Only `AVAILABLE + rank_eligible` can change order.
- Protected sidecar contains no title, body, translation, learner state or
  identity; it is revision-bound and discarded from local cache on access loss.
- Card paint does not fetch protected work bundles.
- No review, word-status, progress, text or calibration writes are introduced.
- Physical iPhone/Android/NVDA/VoiceOver/TalkBack rows remain NOT RUN unless
  separately supplied by the owner.

## Production boundary

This packet deliberately stops at the pre-production candidate. Add the
served-version, health, real `77/77` Study Songs index, request/body-fetch
counts and canonical before/after evidence only after production deployment.
