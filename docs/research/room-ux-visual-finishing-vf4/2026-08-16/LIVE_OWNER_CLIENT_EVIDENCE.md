# Live production and owner-client evidence

> Date: `2026-08-16`
> Source/branch: `main@71b2d48ced2ad607151520bacf8443f582ec46cc`; local and remote origin matched
> Dirty status: 34 unrelated pre-existing entries; no target runtime/release file changed
> Production/client: API, Studio, Room and SW `3.11.398`; actual owner client `3.11.398`, no visible update action
> Evidence: `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `AUTOMATED_LOCAL`
> Limitations: no update click was needed or performed; no owner Library text was opened; no TTS/ASR/MT/LLM action was invoked; browser automation is not physical-device or AT evidence.

## Release convergence

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
- owner acceptance of a proposed VF4 implementation.

These remain explicit rows in the future verification/acceptance matrix.
