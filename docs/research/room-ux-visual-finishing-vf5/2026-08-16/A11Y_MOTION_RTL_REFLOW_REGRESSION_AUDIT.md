# Accessibility, motion, RTL and reflow regression audit

Artifact date: `2026-08-16`

## Evidence passport

- Source/branch: `main@d3c2e2cc4fde6fefa1b75c5769b93de8dad542a0`; local/remote converged.
- Dirty: 34 unrelated entries preserved; exact VF5 docs only.
- Production/client: API/Studio/Room/SW/owner client `3.11.399`, no update.
- URLs: `https://linguistpro.kolosei.com/library.html`, `https://linguistpro.kolosei.com/index.html`.
- Health: ready; disk 86% warning, no cleanup.
- Evidence: `CODE_CURRENT`, `AUTOMATED_LOCAL`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `PRODUCTION_READBACK`.
- Limitations/safety: no physical device or AT speech; no owner state/provider/cache mutation.

## Regression matrix

| Contract | Current evidence | Classification |
|---|---|---|
| localized name/role/value | VF4 current tests green; owner markers all named; isolated controls unnamed=0 | no regression |
| non-color status | five audio-marker signatures pass Room/Studio forced-colors smoke | no regression |
| reduced motion | working marker animation removed; Studio/Room forced/reduced fixture green | no regression |
| visible focus | VF contracts and isolated 380 fixtures expose visible focus; forced colors uses system outline | no regression |
| focus obscuration | sampled focus targets remained in viewport/unobscured; B8 reflow gate green | no regression |
| target size | row TTS remains 28×28, above the frozen 24 px minimum contract; no new target defect | no regression |
| 380 RU | Library/Ben/Studio zero page overflow | no regression |
| 380 HE/RTL | `lang=he`, `dir=rtl`, zero page overflow/unnamed controls | no regression |
| 200% reflow | current B8 isolated gate passes; prior owner protocol accepted actual Chrome 200% | no new claim/defect |
| long mixed titles | B8 current gate remains green; no new DOM geometry change after VF4 | no regression |
| light/dark/auto | visual foundation and Studio contracts green; no theme change after closure | no regression |
| offline/reconnect/stale | B6 current gate green; update never auto-activates; current client has no update | no regression |
| sprite/CSS/JS/locale fallback | served bytes and integrity/version locks match; isolated SVG fallbacks 0 | no regression |

## Residual accessibility backlog

The shared Reader builder still hardcodes Russian note/edit/resizer titles/names. This was explicitly identified and excluded by VF4. It is not new, no current owner EN/HE Reader workflow or AT speech session proved material harm, and promoting it would violate the rule against reopening intentionally deferred backlog. Classification: `BACKLOG`.

Physical iPhone/Android and VoiceOver/NVDA/JAWS/TalkBack remain `NOT_RUN`. An evidence gap is not a runtime defect and does not create VF5 scope.

## Emoji/glyph classification

No emoji count is used as a defect metric. Observed/current categories are:

| Category | Example class | Disposition |
|---|---|---|
| identity | specialist `🎙 C1` label | paired specialist identity; accepted backlog |
| status | legacy warning/loading glyphs | status text/role remains owner; no current unnamed/color-only failure |
| affordance | note/training/audio/export tab glyphs | paired with visible/localized text or names |
| content | literary/feature legend symbols | content, not system UI defect |
| decoration/fallback | Unicode beneath validated SVG slots | `aria-hidden` or replaced after sprite validation; required compatibility fallback |

No emoji sweep is justified.

## Result

No bounded current accessibility necessity crosses the re-entry threshold. External primary evidence was not needed to choose between implementations because no implementation is recommended; the existing accepted WCAG-informed contracts remain green.
