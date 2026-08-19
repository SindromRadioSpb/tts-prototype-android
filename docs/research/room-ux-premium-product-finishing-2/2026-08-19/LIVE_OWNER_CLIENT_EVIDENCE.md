# Live production and actual owner-client evidence

## Evidence passport

- Evidence-class ledger: `CODE_CURRENT=RUN`, `PRODUCTION_CURRENT=RUN`, `OWNER_CLIENT_READ_ONLY=RUN`, `OWNER_SUPPLIED_SCREENSHOT=NOT_RUN`, `ISOLATED_AUTOMATION=RUN_OUTSIDE_OWNER_TAB`, `OWNER_REPORTED=PROTOCOL_PASS`, `PHYSICAL_DEVICE=NOT_RUN`, `ASSISTIVE_TECHNOLOGY=NOT_RUN`, `NOT_RUN=EXPLICIT_WHERE_LISTED`.

- Date/source: `2026-08-19`, `main@3a1e2c934b30106708d24afaa8533f0bc5ea2ac5`; `HEAD == refs/remotes/origin/main == git ls-remote origin main`.
- Dirty: 34 unrelated entries preserved; no runtime target modified.
- Production/client: API/Studio/Room/SW and owner Chrome `3.11.403`; health/DB/migrations ready, disk warning false.
- Evidence: `PRODUCTION_CURRENT`, `OWNER_CLIENT_READ_ONLY`, `CODE_CURRENT`, `NOT_RUN`.
- Limitations: owner client is desktop Chrome, not physical mobile or screen-reader speech. Baseline and final read-only observations disagreed on the hash route as documented below.
- Safety: no research navigation, click, focus movement, audio/provider call, state change, update or cleanup was invoked; scroll/focus remained zero/body and `review_log 7420 -> 7420`.

## Production convergence

```text
API=3.11.403
STUDIO=3.11.403
ROOM=3.11.403
SW=3.11.403
HEALTH=GREEN
DB=READY
MIGRATIONS=READY
DISK=64_PERCENT_NO_WARNING
```

The server's shell-integrity hashes match normalized current source for the inspected Room/Reader/media/locales cohort.

## Existing owner tab baseline

```text
URL=https://linguistpro.kolosei.com/library.html#room=mytexts
TITLE=LinguistPro — Читальный зал
LOCALE=ru
DIRECTION=ltr
VIEWPORT=1920x911
SCROLL=0,0
FOCUS=body
UPDATE_ACTION=absent
SW_CONTROLLER=https://linguistpro.kolosei.com/sw.js
```

Read-only aggregate:

| Check | Result |
|---|---:|
| visible material rows | 48 |
| title max length | 96 characters |
| titles containing Hebrew | 19 |
| mixed-direction titles | 18 |
| visible controls | 194 |
| unnamed visible controls | 0 |
| active busy regions | 0 |
| horizontal overflow | 0 |
| review_log before/after | `7420 / 7420` |

Console errors observed were extension-origin `runtime.lastError` / invalidated extension context, not LinguistPro application failures. No owner title/content is copied into this artifact.

## Final read-only check

The final `tab_detail` first returned the baseline `#room=mytexts`, while the immediately following evaluate context returned a hidden page at `#room=hub`, viewport `1920x855`. A second read confirmed `#room=hub`, `focus=BODY`, `scroll=0,0`, `version=3.11.403`, SW controlled and `review_log=7420`. No research tool invoked navigation or click between these reads. The source of the concurrent/application transition is therefore not established; the tab was not forcibly restored because that would itself mutate owner state.

## Evidence boundary

The baseline owner tab proves current version and real-volume/mixed-title composition; before/after log counts prove no review write. The route discrepancy limits any stronger continuity claim. It does not prove HE/RTL, 380px, forced colors, reduced motion, offline/reconnect, physical device or AT speech. Those remain isolated automation or `NOT_RUN`.

## Post-deploy production and owner-client evidence

Evidence time: `2026-08-19`; implementation commit `0a0ffb13ec547d2f7b33b28abd290e2174a69556`.

```text
ORIGIN_MAIN=0a0ffb13ec547d2f7b33b28abd290e2174a69556
API=3.11.404
STUDIO=3.11.404
ROOM=3.11.404
SW=3.11.404
HEALTH=GREEN
DB=READY
MIGRATIONS=READY
DISK=65_PERCENT_NO_WARNING
ROOM_SHELL_INTEGRITY=MATCH
```

A transient split read showed Studio/SW `3.11.404` and API/Room `3.11.403`. The gate remained open until all four returned `3.11.404`. The final served Room SHA-256 matches the API shell-integrity value.

The existing actual owner tab was preserved at `https://linguistpro.kolosei.com/library.html#room=hub`. Before update it was RU/LTR, scroll `0,0`, focus `BODY`, shell `3.11.403`, controlled by the prior worker with the new worker waiting, and `review_log=7420`. A standard reload retained the old controlled shell as designed. The product-owned visible Update control was then invoked. No Reader was open; the guarded safe point therefore performed no progress flush, activated the waiting worker and reloaded the same route.

Final actual-owner-client read-only smoke:

| Check | Result |
|---|---:|
| shell / served SW | `3.11.404 / 3.11.404` |
| URL | unchanged `#room=hub` |
| locale / direction | `ru / ltr` |
| focus / scroll | `BODY / 0,0` |
| waiting worker | none |
| horizontal overflow | none |
| unnamed visible controls | `0` |
| Journey secondary-text contrast | `6.9046:1` |
| review_log before / after | `7420 / 7420` |

A selector-local Kapture screenshot of the real Journey component was visually inspected and showed the unchanged editorial hierarchy, geometry and controls with readable secondary copy. It was intentionally not persisted because real owner counters were visible. This is `OWNER_CLIENT_READ_ONLY` evidence from desktop Chrome, not physical-device or assistive-technology evidence.

The owner subsequently reported the prescribed production protocol PASS verbatim:

```text
ACCEPT ROOM-UX-PPF2-01:
PRODUCTION_3.11.404_OWNER_CLIENT_PASS;
```

Evidence classification is `OWNER_REPORTED_PROTOCOL_PASS`; physical-device and assistive-technology rows remain `NOT_RUN`.
