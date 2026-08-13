# Reading Room B7 Learning Compass 2.0 — closure

Дата закрытия: 2026-08-13

Статус: **CLOSED · OWNER ACCEPTED · GA GO WITH DOCUMENTED PHYSICAL/AT EXCEPTIONS**

Production baseline: `3.11.373`

Implementation chain: `845ddc71`, `04f88328`, `85bdc9de`, `1298bb71`,
`73e74a37`, `70dcffdc`, `d97930a8`, `86f5189c`, `9dd225f0`, `4818cd6e`,
`9cf51982`, `12f0e47f`.

## Owner acceptance

After successful production engineering/read-back, cross-device convergence
and the prescribed compact physical smoke, the owner reported:

> B7.5 SMOKE: iPhone Safari + RTL + 200%: PASS; PWA reopen +
> offline/reconnect: PASS; PC keyboard + 200%: PASS; remarks: none.

After the exact remaining `NOT RUN` environments were stated, the owner then
explicitly closed the check:

> считаем эту проверку закрытой. подготавливай следующий промт

This closes B7.5 and B7. The unrun environments below are accepted documented
exceptions. They are not converted into PASS and must not be cited as
platform-specific or assistive-technology evidence.

## Closed product contract

- One local-first, deterministic `recorded-familiarity-v2` core serves Room
  and Agent Access without an opaque recommender or comprehension promise.
- My Texts, Study Songs and Ben-Yehuda prepare before selection and expose one
  reliable-familiarity sort with honest exact/lower-bound states.
- Card audio, locale alignment and details behavior are uniform across the
  three corpora; details are single-open and dismissible.
- Familiarity uses auditable occurrence buckets; distinct new-lemma inventory
  is explicitly a different, non-additive measure.
- Local calibration is content-free, bounded, disable/resettable and never
  fabricates a fixed reading speed.
- `review_log` remains append-only truth. Cross-device SRS/manual projections
  are rebuilt before cursor commit and converge without synthetic learner
  events; manual-status clear preserves independent SRS state.

## Evidence ledger

- frozen B0–B7 unit contracts `50/50`;
- B7 browser matrix `161/161`;
- cloud sync `32/32`;
- Studio↔Room SRS `49/49`;
- Memory Canon/FSRS `79/79`;
- i18n `233/233`; canon version `18/18`; word-status browser smoke PASS;
- production `3.11.373`: DB/migrations ready and `6/6` changed assets matched;
- owner profile: `review_log` unchanged and equal local/cloud at `7,315`, heal
  marker `v1`, PC stale projection corrected `210/335 → 205/335`;
- owner iPhone↔PC convergence PASS;
- owner iPhone Safari RTL/200%, PWA reopen/offline/reconnect and physical PC
  keyboard/200% PASS, no remarks.

Evidence roots:

- [`corpus-finishing/`](../research/room-ux-b7-learning-compass/2026-08-13/corpus-finishing/README.md)
- [`cross-device-sync/`](../research/room-ux-b7-learning-compass/2026-08-13/cross-device-sync/README.md)
- [`physical-at-owner-smoke/`](../research/room-ux-b7-learning-compass/2026-08-13/physical-at-owner-smoke/OWNER_SMOKE_EVIDENCE.json)

## Documented exceptions

The following were not run on named physical builds and remain unproven:

- isolated iPhone PWA `update waiting` transition;
- iPhone Safari/PWA with VoiceOver;
- Android Chrome/PWA;
- Android with TalkBack;
- Windows Chrome with NVDA;
- macOS Safari with VoiceOver.

Automation and Kapture evidence do not fill these rows. Closure accepts the
residual risk; any future claim about these environments requires new evidence.

## Freeze boundary and next program

B0–B7 are closed and must not be reopened for a general redesign. Re-entry is
allowed only for a demonstrated regression, a security/data/accessibility
defect, or a separately approved successor decision.

The next program is B8 Reading Journey. It must begin as a new research-only
goal with an evidence-backed owner decision packet before code:
[`ROOM_UX_B8_READING_JOURNEY_RESEARCH_SESSION_PROMPT_2026_08_13.md`](./ROOM_UX_B8_READING_JOURNEY_RESEARCH_SESSION_PROMPT_2026_08_13.md).
