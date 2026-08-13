# New-session prompt — B7.5 Physical/AT Closure

Дата: 2026-08-13

Статус: **EXECUTED IN CURRENT SESSION · SUPERSEDED BY B7 CLOSURE**

Closure:
[`ROOM_UX_B7_LEARNING_COMPASS_2_CLOSURE_2026_08_13.md`](./ROOM_UX_B7_LEARNING_COMPASS_2_CLOSURE_2026_08_13.md).

Использовать как первый запрос в новой Codex-сессии из корня
`E:\projects\tts-prototype-android`.

```text
Начни новый goal в режиме verification/research-only: B7.5 Physical/AT
Closure для Reading Room. До closure не переходи к B8 и не пиши продуктовый
код. B0–B6 не переоткрывать без нового regression evidence.

Сначала полностью прочитай и соблюдай:
1. AGENTS.md
2. CLAUDE.md
3. docs/PROJECT_ROLES.md
4. docs/planning/ROOM_UX_B6_B9_VISUAL_FINISHING_HANDOFF_2026_08_11.md
5. docs/planning/ROOM_UX_B7_LEARNING_COMPASS_2_DECISION_PACKET_2026_08_12.md
6. docs/planning/ROOM_UX_B7_LEARNING_COMPASS_2_IMPLEMENTATION_2026_08_12.md
7. docs/planning/ROOM_UX_B7_PHYSICAL_ACCEPTANCE_PACKET_2026_08_12.md
8. docs/research/room-ux-b7-learning-compass/2026-08-13/corpus-finishing/README.md
9. docs/research/room-ux-b7-learning-compass/2026-08-13/cross-device-sync/README.md
10. docs/research/room-ux-b7-learning-compass/2026-08-13/cross-device-sync/PRODUCTION_READBACK_EVIDENCE.json
11. docs/planning/ROOM_UX_B6_SCALE_RESILIENCE_CLOSURE_2026_08_12.md
12. docs/planning/ROOM_UX_MATURITY_OPTION_B_CLOSURE_2026_08_11.md

Зафиксированный вход: production 3.11.373; implementation fix
12f0e47f; owner-reported iPhone↔PC counter-convergence smoke PASS
2026-08-13. Считать PASS только для этого sub-check: exact final counter pair
не был записан. Не переносить его автоматически на offline/large text,
VoiceOver, Android/TalkBack, NVDA или macOS/VoiceOver.

Задача сессии:
- сверить живой served version/health и текущий git/dirty state read-only;
- сделать evidence-gap audit таблицы B7.5 и назвать минимальный порядок
  оставшихся физических проверок;
- выполнить доступные agent-assisted проверки только в безопасном режиме;
  owner profile не grade/review, не менять word status/calibration и до/после
  доказать неизменность review_log;
- для недоступной аппаратуры/AT не выдумывать PASS: подготовить точные
  documented exceptions на отдельное утверждение владельца;
- если выявлен дефект, остановить closure, подготовить evidence-backed
  decision packet до кода; не чинить и не деплоить без отдельного approval;
- если обязательные строки имеют owner evidence или утверждённые exceptions,
  актуализировать канонические docs/evidence и подготовить B7 closure verdict;
- только после B7 closure сообщить, что следующий новый research-only goal —
  B8 Reading Journey, и подготовить отдельный B8 decision-packet prompt.

В начале дай владельцу 5–10 строк восстановленного статуса. Затем представь
короткий исполнимый physical/AT smoke-check с ожидаемым поведением и полями
evidence. Не называй Chromium automation или Kapture доказательством
конкретного iPhone/Android/VoiceOver/TalkBack/NVDA.
```
