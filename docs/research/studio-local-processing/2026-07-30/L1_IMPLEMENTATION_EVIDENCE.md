# Studio Ingest local ASR L1 implementation evidence

> **Дата:** 2026-07-30
> **Scope:** ограниченная L1-A→L1-E реализация плюс owner-approved evidence-closure
> hardening B+C; никаких production/schema/provider-default изменений и никакой permanent
> integration.
> **Модель:** только `ivrit-ai/whisper-large-v3-turbo-ct2@72ad623a37947395efcc3933132353790e5a12f5`.
> Full large-v3 не загружался и не входит в default/fallback.

Машиночитаемый отчёт: [`l1-evidence-report.json`](l1-evidence-report.json).

## Итог

Ограниченный engineering/evidence slice **PASS и работает default-off**. Новый sidecar batch-20,
реальная Chrome/Edge/Firefox matrix и B+C integrity hardening закрыты. Решение о permanent
integration остаётся **NO-GO до отдельного owner acceptance**: расширенный независимый
human-gold и paired Gemini comparison не входили в ускоренный slice и не запускались.

## Что реализовано

- `81069b17`: pinned model store, loopback Origin/PNA/pairing boundary, isolated worker;
- `de8c7d61`: one-heavy-slot scheduler, physical 900s/30s-overlap slicing, bounded jobs,
  cancel/restart/delete/telemetry;
- `e387f16f`: provider-neutral normalizer и независимые S12.5/S12.6/S12.7 reports;
- `f83b6fe8`: default-off Studio adapter, progress/cancel/retry/delete, explicit local→Gemini
  consent, no implicit fallback, no schema change.
- `aa8dffa0`: live-found canonical-number repair, model disk reserve, second-OOM/thermal worker
  destruction and deterministic fault gates.
- `33ba3f49`: B+C hardening — раздельная portable identity строк, запрет stale update authority,
  явный media-SHA dedupe и parity обычного backup/text-card round-trip без schema migration.

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
- focused local-ASR/B+C Node suites: 46/46;
- i18n: 233/233;
- real local DB text-card round-trip: 35/35;
- API smoke, Node syntax и Python compileall: PASS;
- full `npm test`: 629/638. Nine failures are outside this slice: one Classic test expects an ID
  already absent in pre-L1 HEAD; eight premium pipeline tests hit the existing GCP BYOK/config
  preflight. Они не исправлялись внутри ASR scope.

## Evidence-closure 2026-07-30

Стабильные артефакты и воспроизводимые runners находятся в
[`evidence-closure/`](evidence-closure/README.md).

| Gate | Результат |
|---|---|
| Frozen sidecar batch-20 | 20/20 terminal; WER 2.597%; CER 0.926%; no retry/fallback |
| Batch runtime | 113.601 s audio; 12.140 s inference; 58.270 s wall; RTF 0.1069 |
| Browser matrix | Chrome 150 и Edge 150 system builds PASS; Firefox 146 Mozilla Playwright build PASS |
| 380×844 / RTL | default-off, explicit enable, pairing, upload/start, queue/progress, cancel/retry/delete PASS |
| Loopback/PNA | LAN-origin capability handshake проверен; inference проверен с trustworthy loopback app origin |
| Sidecar-down | во всех трёх браузерах явная local error; cloud requests = 0; implicit Gemini fallback = 0 |
| Lifecycle | 20/20 jobs удалены; sidecar/web stopped; временная activation/model/job/browser media удалены |

Stock Firefox 153 установлен, но не принимает Playwright Juggler automation. Поэтому это честное
ограничение provenance: проверен настоящий Mozilla/Firefox engine 146.0.1, а не ручной прогон
именно установленного stock binary. Firefox также пишет report-only CSP `connect-src` warnings;
запросы не блокируются. LAN HTTP не является trustworthy origin для browser hashing, поэтому
PNA handshake снят с LAN origin, а полный upload/inference — с `127.0.0.1`.

## Adversarial review

- **R4/R5:** 380×844 и RTL не имеют horizontal overflow; flow остаётся явно experimental/default-off.
- **R9:** source segment, source line и sentence ordinal больше не смешиваются; model/source SHA и
  `DERIVED` provenance переживают оба export/import пути.
- **R11:** повторный media SHA требует явного выбора, новый import не наследует `baseTextId`, raw
  media/transcripts не коммитятся.
- **R14/R15:** 20/20 terminal, no silent retry/fallback, cancel/retry/delete/down-state и cleanup
  подтверждены machine-readable receipts.
- **R16:** Gemini/BYOK/quota не использовались; browser cloud request count равен нулю.

Критических findings внутри разрешённого slice нет. Ограничение stock Firefox и независимая
quality/owner acceptance не маскируются как PASS.

## Честно открытые gates

1. Нет отдельного owner listen/read acceptance и утверждённого absolute product-quality threshold.
2. Расширенный независимый human-gold и полный paired Gemini set не входят в ускоренный slice;
   cloud spend/media upload не разрешены.
3. Именно stock Firefox 153 не прошёл ручную/автоматизированную церемонию; Firefox-engine 146 PASS.
4. OOM/thermal/disk-low покрыты deterministic fault injection; намеренное аппаратное
   перегревание/OOM не выполнялось.

Следовательно, этот packet не разрешает permanent integration, production, schema или выбор
`Auto/Local/Gemini` defaults.

## Windows invite-beta enablement — 2026-07-31

The separate Windows Companion/product-onboarding slice is locally `PASS`; external distribution
and permanent integration remain `NO-GO`. The unsigned internal installer is 1,766,465,078 bytes,
SHA-256 `1079fc4e09c038c1704f503228285a097347dfc25ae267f3e287289feca0acbe`.
It passed install/live-update with owned stop and restart/start/restart, exact-model activation,
self-contained CUDA decode, cleanup
and uninstall on Windows 11/RTX 3070. Installed system Chrome/Edge passed local-origin 380×844 LTR
and RTL onboarding with zero Gemini requests. Production-origin verification was not run because
push/deploy were not authorized. Signing, NVIDIA/FFmpeg redistribution review, the frozen
12–15-minute/four-speaker set, and owner threshold remain open. See
`../2026-07-31/windows-beta/evidence-report.json`.
