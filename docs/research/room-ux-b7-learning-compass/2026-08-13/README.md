# Reading Room B7 — cold-library hardening evidence

Дата: 2026-08-13

Статус: **ENGINEERING PASS · PRODUCTION READ-BACK PENDING**

Release candidate: `3.11.366`, подготовлен поверх cold-library implementation
`main@1298bb71`.

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

Production health/served-byte и безопасный owner-profile read-back должны быть
добавлены после фактического cutover `3.11.366`; до этого automation artifact
не является production или owner-live evidence.
