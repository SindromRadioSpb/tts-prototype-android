# Live production and actual owner-client evidence

## Evidence passport

- Evidence-class ledger: `CODE_CURRENT=RUN`, `PRODUCTION_CURRENT=RUN`, `OWNER_CLIENT_READ_ONLY=RUN`, `OWNER_SUPPLIED_SCREENSHOT=NOT_RUN`, `ISOLATED_AUTOMATION=RUN_OUTSIDE_OWNER_TAB`, `OWNER_REPORTED=PREDECESSOR_CLOSURE_ONLY`, `PHYSICAL_DEVICE=NOT_RUN`, `ASSISTIVE_TECHNOLOGY=NOT_RUN`, `NOT_RUN=EXPLICIT_WHERE_LISTED`.

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
