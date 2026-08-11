# Reading Room B6 Scale & Resilience — implementation evidence

Дата: 2026-08-12

Статус: **ENGINEERING/BETA COMPLETE · AUTOMATION PASS · D6 PHYSICAL PENDING**

Decision packet: [`ROOM_UX_B6_SCALE_RESILIENCE_DECISION_PACKET_2026_08_11.md`](../../../planning/ROOM_UX_B6_SCALE_RESILIENCE_DECISION_PACKET_2026_08_11.md)

Implementation commit: `485ba466`

Production: `3.11.360` served-byte verified on 2026-08-12 00:28 IDT; clean
380px RU/LTR/light and HE/RTL/dark profiles passed with no page errors/HTTP 5xx.
Read-back details: [`PRODUCTION_READBACK_EVIDENCE.json`](./PRODUCTION_READBACK_EVIDENCE.json).

## Что доказано

- `room-b6-scale-resilience-smoke`: `45/45` на изолированном Chromium/OPFS.
- Exact traversal: `1 000/1 000` и `5 000/5 000`, включая первый, средний и
  последний windows; stable profile не имеет duplicate/skip.
- 5k UI: `48` карточек и точный total `5 000`; payload `18 159 B`.
- Reference timings: cold `46.82 ms`, warm p95 `47.17 ms`, search p95
  `20.72 ms`; это lab evidence, не field distribution.
- После 20 циклов retained heap delta `162 284 B`, DOM delta `+4` nodes,
  long tasks `>50 ms` — `0`.
- History/session восстанавливают route, filters и anchor; Back/Forward не
  создают progress/review writes. `review_log` fixture checksum не меняется.
- Warm offline сохраняет 48 local cards; reconnect возвращается в `online`
  без navigation/reload и без LocalDb очистки.
- Waiting service worker активируется только явным запросом в safe point;
  Room и Studio не делают unconditional reload.
- Diagnostic ring остаётся local-only: bounded count/bytes/TTL, запрещённые
  content/ID/URL/query fields отбрасываются, network requests отсутствуют.
- RU/HE-RTL × light/dark на 380px и desktop 1280 с 200% simulated zoom
  сохранены в [`automation/`](./automation/).

Главный машинный артефакт:
[`ROOM_B6_AUTOMATION_EVIDENCE.json`](./automation/ROOM_B6_AUTOMATION_EVIDENCE.json).

## Регрессионный пояс

- B6 + frozen B0–B5 unit: `24/24`.
- B0–B5 responsive/locale/theme matrix: `838/838`.
- i18n: `233/233`; canon-version: `18/18`; memory-canon/FSRS: `79/79`.
- MyTexts multi-corpus, corpus navigation, protected group UI и Room media
  smokes — PASS.

Auxiliary B5 continuity harness в текущей загруженной Win11-среде дал `33/34`
только по single-run long-task check: current `56/0 ms`. Контрольный запуск
неизменённого accepted baseline `36ff3ece` на той же машине дал тот же result
с худшими `79/82 ms`. CDP trace текущего кода показал full-document layout
`59–188` objects около границы 50 ms; targeted B6 open/search/load/back gate
остаётся зелёным с `0` long tasks. Сравнение записано в
[`CONTINUITY_HARNESS_VARIANCE.json`](./CONTINUITY_HARNESS_VARIANCE.json); порог
не ослаблен и результат не назван PASS.

## Что не доказано

Automation не доказывает iPhone/Android PWA, NVDA, VoiceOver, TalkBack или
owner-profile acceptance. Эти обязательства остаются в
[`ROOM_UX_B6_PHYSICAL_ACCEPTANCE_PACKET_2026_08_12.md`](../../../planning/ROOM_UX_B6_PHYSICAL_ACCEPTANCE_PACKET_2026_08_12.md).
До заполнения матрицы допустим только engineering/beta claim, не GA/owner-live
closure.
