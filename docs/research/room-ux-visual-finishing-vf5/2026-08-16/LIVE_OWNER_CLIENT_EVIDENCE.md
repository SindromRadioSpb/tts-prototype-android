# Live production and owner-client evidence

Artifact date: `2026-08-16`

## Evidence passport

- Source: `main@d3c2e2cc4fde6fefa1b75c5769b93de8dad542a0`; local `origin/main` and remote `main` matched.
- Dirty: 34 unrelated entries preserved; VF5 adds docs only.
- URLs: `https://linguistpro.kolosei.com/library.html`, `https://linguistpro.kolosei.com/index.html`.
- Release: API/Studio/Room/SW `3.11.399`; actual owner Chrome `3.11.399`, no update action.
- Health: `ok=true`, DB/migrations ready, disk 86%, warning true.
- Evidence: `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `CODE_CURRENT`.
- Limitations: no physical mobile/AT; owner Library was not navigated; browser snapshot is not screen-reader speech.
- Safety: no owner text action, audio/provider invocation, grading, save, setting/key/cache/update/cleanup action or production non-GET request.

## Production convergence and bytes

Repeated public GET readback returned:

```text
API=3.11.399
STUDIO=3.11.399
ROOM=3.11.399
SW=3.11.399
HEALTH=GREEN
DB=READY
MIGRATIONS=READY
DISK=86_PERCENT_WARNING
```

Normalized SHA-256 matched current source for the inspected foundation, Reader/Morph CSS, sprite, Studio/Room HTML, Library/Reader/Morph/Mentor JS, RU/EN/HE locales and SW. No runtime commit exists after VF4.

## Actual owner Chrome

The existing authorized tab was claimed and released at exactly:

```text
https://linguistpro.kolosei.com/
```

The pre-existing Studio material remained open; no title or content bytes are retained in this artifact.

| Check | Result |
|---|---|
| client/release | `3.11.399`; no visible update action |
| locale/direction | RU/LTR |
| native viewport | 1920×911 |
| page overflow | 0 |
| visible controls | 547; naive 7-name candidates were associated-label/placeholder controls in the accessibility tree, not unnamed controls |
| row markers | 544 visible: 539 missing, 3 ready, 2 too-long |
| marker semantics | all `role=img`, all named |
| audio | 0 playing |
| focus baseline | body; no owner focus/navigation action performed |
| owner URL/state | preserved; tab released unchanged |

The table buttons currently visible were original-media replay controls, not the VF4 row-TTS family. All 510 had a current title/name. VF4 TTS state transitions remain automated evidence, not newly claimed owner-live evidence.

## New routed finding

The owner-client console contained one current error:

```text
Table settings save error QuotaExceededError
localStorage key: ide.table.widths.v1
```

The source catches the failure in `saveTableSettings()`. It is a local presentation-persistence/storage-capacity concern, not a visible/AT regression: the table rendered, overflow was zero and no user-visible error was observed. The research did not inspect localStorage, keys, sizes or caches and did not clear anything. Disposition: `ROUTE_TO_OTHER_LANE`.

## Isolated current production

Disposable Playwright contexts blocked service workers and aborted every non-GET/HEAD/OPTIONS request.

| Fixture | Result |
|---|---|
| Library 380 RU | release 3.11.399, no overflow, 0 unnamed, 0 visible icon fallbacks, no page error/write |
| Library 380 HE/RTL | `lang=he`, `dir=rtl`, no overflow, 0 unnamed, no page error/write |
| Library forced colors + reduced motion | both media matched, visible system focus, no overflow/page error/write |
| Ben cold load | 16 public work rows, 12 Ready rows, `aria-busy=0`, no overflow/failure/write |
| My Texts empty isolated profile | no page error/write; no owner data used |
| Studio Classic 380 RU | release 3.11.399, no overflow, 0 unnamed, 24 hydrated SVG uses, no fallback/error/write |
| Studio IDE 380 HE/RTL forced+reduced | no overflow, 0 unnamed, 24 SVG uses, 3 px system focus, no error/write |

Expected anonymous authorization/SW-block warnings are not product failures. No screenshot was needed; exact DOM/ARIA/computed state is stronger for the decision.
