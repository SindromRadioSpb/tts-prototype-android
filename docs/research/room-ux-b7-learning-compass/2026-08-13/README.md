# Reading Room B7 — cold-library hardening evidence

Дата: 2026-08-13

Статус: **ENGINEERING PASS · PRODUCTION READ-BACK PASS · PHYSICAL/AT PARTIAL**

Production release: `3.11.366`, cold-library implementation `main@1298bb71`
и packet/sticky/history hardening `main@73e74a37`.

> Historical slice: этот файл сохраняет точное evidence релиза `3.11.366` и
> его тогдашние лимиты. Full-corpus preparation `3.11.369` зафиксирован в
> [`corpus-preparation/README.md`](./corpus-preparation/README.md). Текущий
> corpus-finishing production `3.11.372` и финальный read-only evidence трёх
> корпусов находятся в
> [`corpus-finishing/README.md`](./corpus-finishing/README.md); именно этот
> packet первичен для актуального поведения.

Этот пакет фиксирует owner-reported дефект, при котором карточка в «Моих
текстах» оставалась в состоянии «Анализ не подготовлен», пока пользователь не
откроет Reader. Это не переоткрывает B0–B6 и не заменяет physical/AT matrix B7.

## Проверяемый результат

- холодная библиотека из 115 личных текстов открывается без Reader;
- все 48 карточек текущей страницы сразу переходят в честное состояние
  подготовки, а не остаются в бессрочной «слепой зоне»;
- фоновая очередь последовательно подготавливает 115/115 карточек и не читает
  больше одного полного текста одновременно;
- progress сообщает точные `prepared/total`, а DOM остаётся ограничен 48
  карточками;
- сортировка «Больше знакомых» работает по всей подготовленной выборке, а не
  только по видимой странице; это относительная сортировка lower bound без
  порогового обещания понимания;
- `review_log`, `word_status`, `text_progress`, тела текстов и `last_opened_at`
  совпадают до/после фоновой подготовки;
- local-only cache ограничен прежними B7 budget `1,000 / 64 MiB`; фоновый
  проход ограничен 240 текстами за session и окном 1,000 текстов.
- owner corpus probe обнаружил, что verbose ingredients первой реальной
  48-card страницы занимали `560,093 B`; compact `[key,count]` storage сохраняет
  ту же семантику в `254,933 B`, поэтому весь page снова укладывается в
  утверждённый single-batch budget `≤256 KiB` без повышения лимита.

## Автоматизация

Команда:

```powershell
node scripts/premium/room-b7-learning-compass-smoke.js --out=docs/research/room-ux-b7-learning-compass/2026-08-13/automation
```

Результат: `PASS 145/145`, включая synthetic real-size 48-card packet,
compact-storage read-back и semantic parity compact/verbose ingredients.

Основной artifact:
[`ROOM_B7_AUTOMATION_EVIDENCE.json`](./automation/ROOM_B7_AUTOMATION_EVIDENCE.json).

Визуальная матрица в [`automation/`](./automation/) включает 320/360/380/430/
510/1280/1366 px, RU/EN/HE-RTL, light/dark, reduced motion и simulated 200%
zoom. Ручно просмотрены `380-ru-cold-library-ready.png`,
`360-he-rtl-dark.png` и `430-ru-pending-reduced.png`: horizontal overflow,
clipping и overlap не обнаружены. Это Chromium automation, не доказательство
конкретного iPhone/Android или screen reader.

Смежные gates кандидата:

- B7+B6+B0–B5 unit: `39/39`;
- B0–B5 responsive browser: `838/838`;
- i18n: `233/233`;
- Memory Canon/FSRS: `79/79`;
- Room Media: PASS;
- Reader parity: PASS.

## Production read-back

- production triad `APP_VERSION / CACHE_VERSION / Room footer` = `3.11.366`;
- committed-vs-served bytes совпали `9/9`, DB и migrations были ready во всех
  трёх health samples;
- на реальной owner-библиотеке, не открывая Reader, очередь завершилась
  `115/115`; в DOM оставались 48 карточек, visible `not prepared/pending = 0`,
  horizontal overflow = 0;
- реальный page batch после compact-schema вернул `48/48`, `255,442 B` из
  разрешённых `262,144 B`, stale/invalid = 0;
- «Больше знакомых» сохранилась после первого выбора без прежнего fallback
  toast. Из 48 карточек одна была rank-eligible и поставлена первой; 47
  `AVAILABLE_LIMITED` остались neutral согласно D1, а не были ложно
  переупорядочены по недостаточно точному сигналу;
- до/после read-only flow полностью совпали count+SHA-256 для `review_log`,
  `word_status`, `text_progress` и `texts`; grade/review, status changes,
  Reader, calibration reset/disable не вызывались;
- только Docker build-cache был очищен (`1.837 GB → 0`); диск после операции
  стабилизировался на `91%`, `disk_warn=true` остаётся открытым ops-риском.

Durable artifact:
[`PRODUCTION_READBACK_EVIDENCE.json`](./automation/PRODUCTION_READBACK_EVIDENCE.json).

Это подтверждает production browser UX на реальном корпусе, но не заполняет
iPhone/Android/VoiceOver/TalkBack/NVDA physical rows.
