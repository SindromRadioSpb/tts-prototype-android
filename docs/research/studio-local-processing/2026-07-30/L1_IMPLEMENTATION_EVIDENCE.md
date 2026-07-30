# Studio Ingest local ASR L1 implementation evidence

> **Дата:** 2026-07-30
> **Scope:** ограниченная L1-A→L1-E реализация; никаких production/schema/provider-default
> изменений и никакой permanent integration.
> **Модель:** только `ivrit-ai/whisper-large-v3-turbo-ct2@72ad623a37947395efcc3933132353790e5a12f5`.
> Full large-v3 не загружался и не входит в default/fallback.

Машиночитаемый отчёт: [`l1-evidence-report.json`](l1-evidence-report.json).

## Итог

Ограниченный engineering slice **работает default-off**, но решение о permanent integration —
**NO-GO до закрытия acceptance gates**. Это не противоречие: L1 доказал control plane,
physical slicing, checkpoints, независимые S12 gates и локальный Studio adapter; он не доказал
population quality, полный browser matrix или owner acceptance.

## Что реализовано

- `81069b17`: pinned model store, loopback Origin/PNA/pairing boundary, isolated worker;
- `de8c7d61`: one-heavy-slot scheduler, physical 900s/30s-overlap slicing, bounded jobs,
  cancel/restart/delete/telemetry;
- `e387f16f`: provider-neutral normalizer и независимые S12.5/S12.6/S12.7 reports;
- `f83b6fe8`: default-off Studio adapter, progress/cancel/retry/delete, explicit local→Gemini
  consent, no implicit fallback, no schema change.
- `aa8dffa0`: live-found canonical-number repair, model disk reserve, second-OOM/thermal worker
  destruction and deterministic fault gates.

Последний live прогон нашёл cross-runtime defect: Python canonical JSON сохранял `1.0/-0.0`,
а `JSON.stringify` выдаёт `1/0`. Поэтому неизменённые raw results ложно падали S12.5. Исправление
нормализует integral finite floats до browser semantics; short live run и deterministic rebuild
117-min immutable results после исправления дают S12.5 PASS. Дополнительно добавлены exact
model disk reserve (`2 × snapshot + 2 GiB`) и явный `WORKER_OOM` с единственным clean same-pin
retry.

## Live evidence

| Gate | Результат |
|---|---|
| Managed activation | full revision/runtime hashes PASS; warmup `ready`; unload `unloaded` |
| 117 min | 8/8; 251.625s; RTF 0.03586; max 58°C; S12.5/6/7 PASS; dup-4gram 2.617%; zero-text 0 |
| 2:59:59 soak | 12/12; 383.796s; RTF 0.03554; max 59°C; no throttle/OOM; S12.5/6/7 PASS; dup-4gram 2.882%; zero-text 0 |
| >3h boundary | 3:14:18 rejected before slicing as `LOCAL_MEDIA_UNSUPPORTED` |
| Cancel | ack 101.3ms; terminal 235.2ms; `CANCELED`; worker VRAM released |
| Restart/resume | `RECOVERABLE` at 1/3 → 3/3 in 49.8s; chunk-0 hash stable; attempts=1 |
| Delete | API receipt; target directory absent; remaining job directories=0 |
| Model cleanup | worker unloaded; temporary managed model/fixture store removed |

117-min inference itself was not repeated after the canonical-hash fix: the result was rebuilt
from the same hash-checked immutable raw files and physical chunk manifests. The short noisy
fixture was rerun through the corrected live sidecar and passed all three gates. This distinction
is intentional and recorded, not hidden as a clean rerun.

## Automated gates

- `ai-local`: 41/41 pytest;
- local-ASR Node suites: 17/17;
- i18n: 233/233;
- API smoke and Python compileall: PASS;
- full `npm test`: 629/638. Nine failures are outside this slice: one Classic test expects an ID
  already absent in pre-L1 HEAD; eight premium pipeline tests hit the existing GCP BYOK/config
  preflight. Они не исправлялись внутри ASR scope.

Chrome 380px smoke подтвердил default-off, Gemini reset-default, explicit Local selection и
отсутствие modal horizontal overflow. Он также нашёл и закрыл растянутый pairing input. Edge и
Firefox не прогонялись.

## Честно открытые gates

1. Нет нового sidecar-path batch-20; есть только L0 20/20.
2. Нет human-gold ≥60 min / ≥12 speakers и полного paired Gemini set.
3. Нет owner listen/read acceptance.
4. Нет Edge/Firefox loopback/PNA/RTL live matrix.
5. B+C integrity debts не закрыты.
6. OOM/thermal/disk-low покрыты deterministic fault injection; намеренное аппаратное
   перегревание/OOM не выполнялось.

Следовательно, этот packet не разрешает permanent integration, production, schema или выбор
`Auto/Local/Gemini` defaults.
