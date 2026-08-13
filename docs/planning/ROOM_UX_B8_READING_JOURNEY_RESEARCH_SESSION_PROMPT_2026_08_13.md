# New-session prompt — B8 Reading Journey research and decision packet

Дата: 2026-08-13

Использовать как первый запрос новой Codex-сессии из корня
`E:\projects\tts-prototype-android`.

```text
Начни новый goal: research-only B8 Reading Journey для Reading Room.
Подготовь evidence-backed decision packet на утверждение владельцу до любого
продуктового кода, миграции или production deploy. B0–B7 закрыты — не
переоткрывать без конкретного regression evidence. После decision packet
остановись и жди явного APPROVE B8-R.

Сначала полностью прочитай и соблюдай:
1. AGENTS.md
2. CLAUDE.md
3. docs/PROJECT_ROLES.md
4. docs/planning/ROOM_UX_B6_B9_VISUAL_FINISHING_HANDOFF_2026_08_11.md
5. docs/planning/ROOM_UX_B7_LEARNING_COMPASS_2_CLOSURE_2026_08_13.md
6. docs/planning/ROOM_UX_MATURITY_OPTION_B_CLOSURE_2026_08_11.md
7. docs/planning/ROOM_UX_B6_SCALE_RESILIENCE_CLOSURE_2026_08_12.md
8. docs/planning/ROOM_UX_B7_LEARNING_COMPASS_2_DECISION_PACKET_2026_08_12.md
9. docs/planning/ROOM_UX_B7_LEARNING_COMPASS_2_IMPLEMENTATION_2026_08_12.md
10. docs/planning/BRR_READING_UX_REQUIREMENTS_2026_06_15.md
11. docs/planning/BRR_STUDIO_ROOM_COMPAT_2026_07_02.md
12. docs/planning/ROOM_DUE_CONTINUITY_2026_07_11.md
13. docs/planning/RETENTION_PROGRAM_RECON_2026_07_02.md
14. docs/planning/STUDIO_ROOM_SRS_UNIFICATION_IMPLEMENTATION_PACKET_2026_08_11.md
15. docs/planning/BRR_EPIC4_RETENTION_LOOP_2026_06_26.md
16. docs/planning/AGENT_MEMORY_EXPORT_2026_07_15.md

Живой код и схема первичны, если старые документы расходятся с реализацией.
Перед выводами сделай read-only recon текущего git/dirty state, production
version/health и фактических canonical stores/writers.

Обязательный scope B8:
- построить карту сегодняшнего journey-state для My Texts, Study Songs и
  Ben-Yehuda: progress/last place, finished, bookmarks/saved, notes,
  vocabulary/manual status/SRS, media position и presentation continuity;
- для каждого состояния указать identity, таблицу/поле, writer/readers,
  export/import, cloud/device behavior, re-import survival и conflict policy;
- доказать, где уже есть один канон, где только presentation state, где
  реальный разрыв UX, а где устаревший документ;
- исследовать полный пользовательский путь: найти/сохранить → начать →
  вернуться → продолжить с места → заметка/слово/медиа → закончить → найти
  сохранённое позже, включая offline/reconnect, PWA eviction, cross-device,
  RU/HE/RTL, 200% и keyboard/AT semantics;
- сравнить актуальные паттерны зрелых reading/learning продуктов и применимые
  WCAG/web-platform требования. Для изменчивых внешних фактов использовать
  свежие первичные источники; отделять наблюдение от продуктового решения;
- проверить масштаб B6 (1k/5k), packet/DOM/memory budgets и privacy boundary:
  никакого learner content в telemetry/RUM;
- owner profile использовать только read-only. Не grade/review, не менять
  status/progress/note/bookmark/calibration и доказать неизменность
  review_log, если выполняется live inspection.

Decision packet должен содержать:
1. executive verdict и measured problem statement, без предположения, что
   новая поверхность вообще нужна;
2. live-code/data-flow inventory с exact file/function/schema anchors;
3. competitor/accessibility research с прямыми ссылками на первичные
   источники;
4. user journeys и failure-state matrix для трёх корпусов;
5. варианты и рекомендацию по решениям минимум D1–D6:
   D1 cross-corpus saved/bookmark identity и authority;
   D2 единая recoverable journey presentation/last-place модель;
   D3 notes/vocabulary/media composition без второго writer;
   D4 saved/filtered/finished views только поверх canonical stores;
   D5 offline/cross-device/re-import/conflict semantics;
   D6 premium UI hierarchy, a11y/RTL/200%, scale/privacy/evidence rollout;
6. exact invariants, data ownership table, stop-list и rollback boundary;
7. red-test-first implementation slices, allowlist, migration decision,
   quantitative budgets, automation и physical/AT acceptance matrix;
8. явно отделённые immediate B8 decisions от backlog/B9/Visual finishing;
9. предлагаемую owner approval строку вида `APPROVE B8-R: D1=...; ...`.

Жёсткий stop-list:
- не создавать второй progress/bookmark/notes/vocabulary/SRS writer;
- не объединять asserted, derived, curated и presentation truth;
- не менять schema/LocalDb/FSRS/review_log/SW до owner approval;
- не добавлять opaque AI recommender, mandatory quiz wall, cover-grid feed,
  gamification или content telemetry;
- B9 Curated Paths и Visual finishing не включать в B8 реализацию;
- не считать automation доказательством физического устройства/AT;
- не исправлять найденные дефекты в research-only goal: оформить blocker и
  decision packet до кода.

Создай packet в
docs/planning/ROOM_UX_B8_READING_JOURNEY_DECISION_PACKET_2026_08_13.md,
а воспроизводимые research artifacts — в
docs/research/room-ux-b8-reading-journey/2026-08-13/.

В начале дай владельцу 5–10 строк восстановленного статуса. В конце представь
короткое резюме решений/рисков и точную approval-строку; до approval код не
писать и production не менять.
```
