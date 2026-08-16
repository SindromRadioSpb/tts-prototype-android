# Live production and owner-client evidence

> Date: `2026-08-16`
> Source/branch: `main@71b2d48ced2ad607151520bacf8443f582ec46cc`; local and remote origin matched
> Implementation commit: `8dda777d`, pushed to `origin/main`
> Dirty status: 34 unrelated pre-existing entries remain preserved and unstaged; VF4 runtime/release work is isolated in `8dda777d`
> Production/client: API, Studio, Room and SW `3.11.399`; actual owner client updated by the agent to `3.11.399`
> Evidence: `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `AUTOMATED_LOCAL`
> Limitations: no owner Library text was opened and no TTS/ASR/MT/LLM action was invoked; browser automation is not physical-device or AT evidence; actual owner-browser 200% remains `NOT_RUN`.

## Research-baseline release convergence

| Readback | Result |
|---|---|
| local source | `main@71b2d48c`; local/remote origin identical |
| `/api/client-config` | `3.11.398` |
| Studio source | `APP_VERSION = 3.11.398` |
| Room footer | `LinguistPro v3.11.398` |
| `/sw.js` | `CACHE_VERSION = v3.11.398` |
| `/healthz` | healthy; DB and migrations ready during research-start readback |
| production `reader-core.css` | exact local SHA-256 `b401ba9e…37b6` |
| production `reader-core.js` | exact local SHA-256 `adbeb2f7…8f02` |
| production `index.html` | exact local SHA-256 `c6a5d78d…9f87` |

This eliminates stale deployment as an explanation for the qualifying defects.

## Actual owner Library tab

The authorized owner tab was claimed read-only at:

```text
https://linguistpro.kolosei.com/library.html#room=benyehuda
```

It remained on that exact URL through release.

Observed without navigation or mutation:

- RU/LTR Ben-Yehuda landing, public catalog aggregate `26,455` works and 16 currently rendered cards;
- footer/client `3.11.398`;
- no visible `Обновить` / `Update` action;
- document `clientWidth=1905`, `scrollWidth=1905`;
- 62 hydrated `<svg><use>` slots, 0 visible Unicode fallbacks;
- 0 unnamed visible interactive controls;
- 0 visible error presentation;
- no console warning/error.

The visible residual symbols were classified rather than counted as defects: feature-legend decoration/content, text-labelled activity-filter affordances and footer decoration/identity. None was unnamed or a reason to reopen a general icon lane.

No text, group, Reading List or My Texts item was opened. No progress, Finished, bookmark, note, review, presentation, provider, cache or owner-content state was changed.

## Temporary owner-profile Studio tab

A separate temporary tab loaded current production Studio read-only. It did not click, type, invoke audio or edit/save anything.

| Check | Result |
|---|---|
| release visible in body | `3.11.398` |
| mode / locale | Classic, RU/LTR |
| geometry | `clientWidth=1905`, `scrollWidth=1905` |
| shell icons | 24 hydrated SVG uses; 0 visible fallbacks |
| visible controls | 469; 0 unnamed |
| rendered bilingual rows | 42 |
| row-audio states | 29 `state-ok`; 13 `state-mismatch` |
| marker accessibility | 42 `aria-hidden`; 0 with accessible names |
| row-TTS buttons | 42; initial name `Озвучить` |
| active audio | 0 busy; 0 playing |
| console | no warning/error |

The 42-row fixture auto-restored as part of normal Studio boot; no text was selected or opened by the research session. Only counts/classes/ARIA were retained—no title, sentence or content bytes.

The temporary Studio tab was closed. The original owner Library tab was released at the same URL with no update action, no overflow and no console warning/error.

## Isolated production automation

Two separate non-owner Chromium contexts loaded current production with service workers blocked. Any non-GET/HEAD request was intercepted and aborted.

### Room shell/state pass

- 380×844 RU/LTR and HE/RTL both had `clientWidth=scrollWidth=380`.
- 87 visible controls; 0 unnamed.
- reduced-motion media matched and the sampled Room transitions were `0s`.
- warm offline event produced a localized offline status with retry; reconnect cleared it; neither transition overflowed.
- 80 observed requests; 0 non-GET writes.
- no page error.
- expected warnings were limited to deliberately blocked SW and anonymous authorization responses.

The first `networkidle` wait timed out because the production page has background activity. Re-running with `domcontentloaded` completed all assertions. This is harness uncertainty, not a product failure.

### Studio/Reader audio-state probe

At 380×844 with `forced-colors: active` and `prefers-reduced-motion: reduce`:

| Locale | Direction | Overflow | Marker collisions | Working animation | Row action names |
|---|---|---|---|---|---|
| RU | LTR | none | `ok=mismatch`; `too-long=working` | `v3AudioPrefetchPulse` | Russian |
| HE | RTL | none | `ok=mismatch`; `too-long=working` | `v3AudioPrefetchPulse` | still Russian |

The probe used the exact production `index.html` CSS and dynamically imported exact production `/js/reader-core.js`. It appended temporary instances of the existing classes, read computed style/DOM names, removed the probe, and made no provider/data call. Both contexts reported 0 non-GET requests and 0 page errors.

Room's served forced-colors rule is even stricter: all five `.row-audio-ind` state classes resolve to the same filled `CanvasText` circle.

## Local automated evidence

| Gate | Result |
|---|---|
| i18n smoke | `233/233 PASS` |
| Reader parity | `37` leaf cases, `4` builder cases, `4` browser fixtures PASS |
| row-audio unit + isolated browser smoke | `2/2` unit and `11/11` browser PASS for existing truth/writer contract |
| Room/Studio UX + Reader audio unit batch | `28/28 PASS` |
| VF0–VF3 visual contract batch | `30/32 PASS`; 2 documentation-anchor failures after closure wording changed |

The two visual-contract failures are test/documentation drift:

1. `visualFinishingStudioShell.test.js` still expects the predecessor packet to call VF3 “the only remaining approved slice” after the packet was updated to closed/final.
2. `visualFoundations.test.js` still expects pre-closure remaining-slice wording in the now-closed implementation packet.

No runtime assertion failed. This test debt belongs in the future allowlisted gate repair if VF4 is approved; it is not itself a visual successor.

## Evidence not claimed

- physical iPhone/Android behavior;
- VoiceOver, NVDA, JAWS or other AT speech;
- actual browser 200% zoom;
- offline cold start with an already-installed mixed-version SW;
- physical-device or AT acceptance of the VF4 implementation.

These remain explicit rows in the future verification/acceptance matrix.

## VF4 production release and updated owner client

### Production convergence

The scoped commit `8dda777d` was pushed to `origin/main`. Production moved
through the expected short mixed window and then converged twice:

| Time (`+03:00`) | API | Studio | Room | SW |
|---|---:|---:|---:|---:|
| `10:24:25` | `3.11.399` | `3.11.399` | `3.11.399` | `v3.11.399` |
| `10:24:41` | `3.11.399` | `3.11.399` | `3.11.399` | `v3.11.399` |

At `10:32:19+03:00`, `/healthz` returned `ok=true`, DB ready, migrations
ready, disk used `79%` and `disk_warn=false`.

Exact served bytes matched the implementation source for `index.html`,
`library.html`, `sw.js`, `library-ui.js?v=399`, `reader-core.js?v=399`,
`reader-core.css?v=399` and the UI sprite. RU/EN/HE locale working-tree files
use CRLF locally; after the repository's Git LF normalization their SHA-256
values exactly matched the production integrity map for `?v=169`.

### Agent-applied owner update

The existing authorized owner tab was claimed at:

```text
https://linguistpro.kolosei.com/library.html#room=benyehuda
```

Before update it showed shell `3.11.398`. After the waiting SW completed, the
page exposed the visible status “Обновление загружено и ждёт вашего
подтверждения” and the visible `Обновить` action. The agent clicked that action
once. The page reloaded to shell `3.11.399`; the exact URL/hash was preserved,
the Reader remained closed, the update action disappeared, horizontal overflow
was `0`, and console warning/error count was `0`.

### Updated owner-profile Studio smoke

A separate temporary Studio tab loaded the existing auto-restored fixture
read-only and was closed after the smoke.

| Check | Updated real-client result |
|---|---|
| release | visible footer `v3.11.399` |
| fixture | 42 bilingual rows, 42 visible row-audio markers, 42 visible row-TTS controls |
| marker truth | 29 `state-ok`; 13 `state-mismatch` |
| marker semantics | all 42 `role=img`; RU names `Аудио готово` or `Аудио создано для другого профиля голоса.` |
| non-color signature | ready uses a solid filled circle; mismatch uses a `2px dashed` hollow circle |
| TTS idle action | all 42 `Озвучить строку`; `aria-busy=false`, `aria-pressed=false`, enabled |
| keyboard focus | reached a row-TTS control; visible `2px solid` outline; target in viewport and unobscured |
| audio | player remained paused at current time `0`; all 42 controls remained idle |
| geometry | native owner viewport `1920x855`, page overflow `0` |
| console | no warning/error |

No row audio action, text selection/open, save, grade, note, review, provider,
presentation or cache action occurred. The original Library tab was released at
the preserved Ben-Yehuda URL on `3.11.399`.

The control surface accepted ordinary keyboard navigation but did not change
actual Chrome zoom for browser shortcuts. Accordingly, actual owner-browser
200% is recorded as `NOT_RUN`; the passing isolated 200%-equivalent gate remains
`ISOLATED_AUTOMATION`, not owner-live evidence.
