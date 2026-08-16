# Residual surface × component × state inventory

> Date: `2026-08-16`
> Source/branch: `main@71b2d48ced2ad607151520bacf8443f582ec46cc`; local/remote origin converged
> Dirty status: 34 unrelated pre-existing entries; no runtime target changed
> Production/client: `3.11.398`; actual owner client `3.11.398`, no update action
> Evidence: `CODE_CURRENT`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `AUTOMATED_LOCAL`
> Limitations: owner Library was not navigated away from Ben-Yehuda; owner texts/groups/lists were not opened; HE/RTL, forced-colors, reduced-motion and offline variations are isolated automation, not owner-live or AT.

`Severity` is about the real workflow, not source count. `Backlog?` distinguishes an intentionally deferred residual from a newly proved regression/defect.

| Surface × component × state | Selector / DOM owner; behavior truth owner | Production visibility | Backlog? | Severity and workflow | Locale / RTL / reflow / keyboard / AT / offline implications | Smallest boundary; blast radius / rollback | Verdict |
|---|---|---|---|---|---|---|---|
| Global Room shell: identity, navigation, update/offline status | `library.html`, `library-ui.js`; existing connection/SW state machines | owner Ben-Yehuda page: 62 hydrated SVG uses, 0 visible fallbacks, 0 unnamed visible controls, no update action | closed VF0/VF1 | none found | RU/LTR owner client; isolated 380 RU/HE had no overflow; reconnect truthful | no change; touching shared shell would reopen closed scope | `NO_GO` |
| Ben-Yehuda feature legend and activity filters | visible text in `library.html` / `library-ui.js`; corpus/search owners unchanged | owner client showed `⚡ ✓ ♪ 🔎 📶 🎯`, `🕘`, and text-labelled filter emoji | specialist/decorative backlog | low; labels remain explicit | emoji are decoration/content/affordance paired with words; no unnamed action | replacing them would be a new icon sweep across locale/content contracts | `BACKLOG` |
| Library/L0/corpus cards: loading, empty, filtered, partial | `.room-state`, typed corpus/L0 renderers; their existing query/progress owners | current Ben corpus rendered 16 cards; no visible errors or overflow | closed VF1 / B0–B8 | none found | current labels/names intact; owner state untouched | no change | `NO_GO` |
| My Texts: true empty vs filter-empty vs read failure | `.mytexts-empty`, `renderMyTextsCorpus`; LocalDB is truth owner | not opened in owner profile; source catch can collapse a read failure to empty defaults | explicitly identified pre-VF1 residual | medium honesty concern, but no current production fixture proof in this session | all locales; could misstate error as empty; not primarily a visual finishing defect | would require error/data-flow semantics, not a surface-local skin; separate reliability lane | `BACKLOG` |
| Group corpora and owner lists | group/card renderers and canonical group/list owners | intentionally not opened; owner data is non-disposable | frozen outside this read-only sample | unknown, no evidence of regression | mutation/offline/security risk outweighs speculative polish | no VF4 boundary; cache revocation remains separate | `NO_GO` |
| Room Reader row-audio marker: ready/missing/mismatch/too-long/working | `.row-audio-ind` in `reader-core.css`; `rowAudioIndicatorPresentation` and `paintRowAudioIndicator` render existing audio truth | exact production CSS/JS served; Reader not opened on owner profile | not explicitly closed at forced-colors state level; earlier audit required state not by color | medium-high for a learner checking row audio readiness | normal states are color dots; forced-colors rule makes every state the same filled circle; Room has localized `role=img` name, so AT is better than sighted forced-colors | `reader-core.css` only for non-color shape; no truth/writer change; shared Reader/Studio parity must be gated; static rollback | `GO` |
| Studio Classic/IDE row-audio marker | duplicate `.row-audio-ind` CSS and Studio painter in `index.html`; canonical audio readiness remains existing Studio code | actual owner-profile temporary tab: 42 rows, 29 ready, 13 mismatch; all 42 `aria-hidden`, 0 named | not an accepted VF3 shell component; VF3 did not authorize table internals | high enough to qualify: real status is visible but unavailable to AT and color-dependent | forced colors collapses `ok=mismatch` and `too-long=working` non-color signatures; working pulse remains under reduced motion; current RU fixture only, HE isolated | `index.html` bounded audio marker CSS/painting only; duplicate parity risk; revert static release | `GO` |
| Shared row-TTS control: idle/loading/playing/error | `.row-tts-btn`; shared builder and `attachRowAudio` in `reader-core.js`; Studio duplicate paths in `index.html`; TTS/audio owners unchanged | actual Studio has 42 idle buttons; served source is byte-identical to local | not intentionally accepted as wrong-language/stale-name behavior | high for keyboard/AT and speech-input users | shared builder emits Russian `aria-label`/title when supplied EN or HE `t`; loading/playing/error change `…/■/!` and action without updating name; RTL geometry itself is stable at 380 | localize only row-TTS labels and keep name synchronized with available action/state; no invocation/provider/writer change; shared parity and locale/SW locks required | `GO` |
| Other shared action-column labels: note/edit/resizer | builder literals in `reader-core.js` plus Studio duplicate; note/edit behavior owners | isolated HE production builder also returned Russian names | newly observed but outside row-audio thesis | medium, not supported by owner-live non-RU workflow in this session | locale/AT issue; resizer keyboard semantics would require a broader interaction audit | deliberately exclude from VF4 to keep one component family; record for independent accessibility backlog | `BACKLOG` |
| Reader focus, row selection, playback rail and sticky table | `reader-core.css`, shared builder geometry and surface hosts | current contracts/tests green; owner Studio had no overflow | closed VF2 and parity-locked | none found | focus rules and reduced-motion Room override present; actual 200% and AT not run | no geometry/DOM-order change | `NO_GO` |
| Morph overlay/states | `reader-morph.css`, `morph-host.js`; morphology/provenance owners | current code and VF2 evidence; no new production defect | closed VF2 | none found | forced-colors/reduced-motion contracts present; linguistic truth immutable | no change | `NO_GO` |
| Trainer and Mentor specialist emoji/status families | surface-local CSS/JS and locale strings; FSRS/Mentor truth owners | current source contains specialist symbols; current Room shell has named controls | explicit specialist backlog | low without observed failure | symbol count alone is not a defect; changing could touch grading/consent/provenance | no broad replacement | `BACKLOG` |
| Studio Classic/IDE shell identity/navigation/focus | VF3 rules in `index.html` and locale files; existing workflow owners | actual temporary owner-profile tab: 24 SVG uses, 0 fallbacks, 0 unnamed controls, no overflow/logs | closed VF3 | none found | RU current client; predecessor isolated RU/HE and owner acceptance remain authoritative | no shell reopening | `NO_GO` |
| Loading/offline/reconnect/update presentation | existing typed state machines | isolated 380 RU/HE warm offline event showed localized status + retry, reconnect cleared it, no overflow/writes | closed/shared state grammar | none qualifying | warm simulation only; offline cold start remains future verification row | no change | `NO_GO` |
| CSS tokens, aliases, inline styles and `!important` | foundations plus surface-local legacy CSS | user-visible result currently stable; debt is source-internal | explicit backlog | internal maintainability only | broad cleanup can affect every locale/state/surface | 446 inline Studio styles / 347 `!important` uses make blast radius larger than leaving debt | `NO_GO` (`CSS_DEBT_ONLY`) |
| Sprite/fallback/licence/provenance | `linguistpro-ui.svg`, licence/provenance, `roomIcon`/Studio helpers | owner Room/Studio: hydrated, no visible fallback; assets intact | closed VF0 | none found | old/new client fallback contract remains complete | no icon/sprite changes in VF4 | `NO_GO` |
| Physical mobile, actual 200% zoom and screen-reader speech | evidence rows, not components | not run in this research | known evidence limitation | unknown; absence of evidence is not a defect | must remain separate future acceptance rows | verify after an approved implementation; do not claim now | `NO_GO` as scope generator |

## Emoji classification

Current source counts—`library.html` 55, `index.html` 544, `library-ui.js` 343, `reader-core.js` 17, `mentor-home.js` 78 and about 346 per locale—do **not** equal defects.

| Class | Current examples | Disposition |
|---|---|---|
| Identity | migrated Room/Studio/Mentor shell marks; residual specialist identities | closed or backlog |
| Status | audio dots, warning/success/loading symbols | only the proved row-audio non-color/AT defect is `GO` |
| Affordance | text-labelled activity filters, play/note/edit glyphs | audio control state/name is `GO`; unrelated specialist actions backlog |
| Content | Hebrew letters, literature markers, learning notation | never replace as decoration |
| Decoration | footer heart, feature legend accents | leave unless AT noise is observed |
| Compatibility fallback | Unicode beside sprite slots | immutable old/new client safety contract |

## Exact qualifying boundary

```text
Room + Studio Classic/IDE
  └─ bilingual-table row audio family
       ├─ readiness marker: existing state only
       └─ row TTS control: current available action/state only
```

Everything else in the inventory remains closed, backlog or a separate lane.
