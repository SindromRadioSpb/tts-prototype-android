# 10 — Acceptance gates и closure

Каждый гейт требует ПРОВЕРЯЕМЫЕ артефакты, не заявление «готово». Прохождение фиксируется в
STATUS.md (кто, когда, ссылки на артефакты). «SHIPPED/CLOSED» без перечисленных артефактов —
нарушение дисциплины пакета.

## 1. Per-slice гейты (применяются к КАЖДОМУ слайсу H1/H2)

### G-SLICE-READY (Definition of Ready — до начала работы)
- [ ] Промт слайса прочитан; обязательные документы пакета прочитаны.
- [ ] Живое состояние проверено и зафиксировано в отчёте сессии (HEAD, версии, фактическое
      наличие зависимостей — НЕ по снапшотам исследования).
- [ ] Предыдущий блокирующий слайс — CLOSED в STATUS.md (или слайс в явно параллелизуемой группе).

### G-SLICE-ENGINEERING-COMPLETE
- [ ] Артефакты слайса существуют по заявленным путям (канон в репо: hermes-side/<slice>/ для H1;
      код+миграции+смоуки для H2).
- [ ] Тесты слайса зелёные с приложенным выводом (H1: сценарии/smoke-диалоги с транскриптом;
      H2: `node --test`/smoke-скрипты — команды и вывод в отчёте).
- [ ] H2: релевантные существующие гейты не сломаны (test:api-smoke + доменные smoke затронутых
      подсистем); миграция применяется на копии БД; rollback-путь описан и проверен
      (для миграций — восстановление из db:backup).
- [ ] Документация слайса (README в hermes-side/ или обновление канон-доков) написана.
- [ ] Коммит(ы) запушены; хеши в отчёте. H2 с деплоем: прод-верификация (образ на хосте,
      healthz, ручная проверка инструмента) — выполнена и зафиксирована.

### G-SLICE-OWNER-LIVE
- [ ] Owner-live сценарий из промта слайса прогнан владельцем на реальных данных.
- [ ] Вердикт владельца (1–5 + комментарий) записан в STATUS.md. Единственное
      исключение: explicit owner amendment может принять qualitative PASS для
      closure, если числовая оценка назначена в обязательном monitoring-плане
      с датами, prompts и stop-условиями.
- [ ] Инциденты (галлюцинации/сикофантия/unwanted writes) — зафиксированы или явное «0 при N наблюдениях».

### G-SLICE-CLOSED
- [ ] Все три гейта выше пройдены; строка STATUS.md переведена в CLOSED со ссылками.

## 2. G-H1-CLOSURE (закрытие Горизонта 1)
- [ ] Все слайсы H1.0–H1.7 CLOSED (или явный owner-вердикт SKIPPED/LOW_VALUE с причиной).
- [ ] H1.8 evidence-отчёт существует (`hermes-side/h1.8/EVIDENCE.md`): initial
      owner verdicts, consent/W1/cost baseline, инцидент-журнал и, если
      longitudinal window перенесён explicit owner amendment, обязательный
      monitoring-план с отдельным prompts-артефактом.
- [ ] Consent-верификация: подтверждено, что за H1 не появилось ни одного нового скоупа/гранта
      (H1 их не требует) и ни одной записи в LinguistPro мимо W1.
- [ ] Cost-верификация: фактические затраты H1 = $0 (или объяснение).
- [ ] STATUS.md: горизонт H1 → CLOSED.

### G-H1-PARALLEL-MONITOR (owner amendment 2026-07-23)

- [ ] 14-дневное окно имеет даты начала/конца и идёт независимо от Codex-сессий.
- [ ] Собираются метрики 08 §1: реальные conversation/WCF/SRL циклы, общий
      integration-разбор, ratings, incidents с объёмом наблюдения и cost.
- [ ] Day-14 follow-up обновляет `hermes-side/h1.8/EVIDENCE.md` и STATUS.
- [ ] Stop-условия 08 §3 применяются даже если H2 уже начат по Д5.

Этот monitoring обязателен, но по зафиксированному owner override не блокирует
G-H1-CLOSURE или G-H2-START.

## 3. G-H2-START (разрешение начинать H2)
- [ ] G-H1-CLOSURE пройден.
- [ ] Continuation evidence: ≥1 петля с вердиктом ≥4/5 и регулярным
      использованием (08 §3), либо задокументированный owner override с
      активным G-H1-PARALLEL-MONITOR.
- [ ] Владелец дал ЯВНОЕ go (Д5) — цитата/дата в STATUS.md.

## 4. G-H2-CLOSURE
- [ ] Все слайсы H2.1–H2.6 CLOSED (или SKIPPED с owner-вердиктом).
- [ ] Schema snapshots: снапшот tools/list нового MCP-состава приложен; подтверждено отсутствие
      мутаций схем существующих 16 инструментов (диф против снапшота до H2).
- [ ] Consent-верификация: каждый новый scope имеет карточку (ru/en/he), церемония пройдена
      владельцем, revoke проверен вживую (отзыв → типизированный отказ → повторная выдача).
- [ ] Rollback-верификация: для goal-store — восстановление из бэкапа проверено; для каждого
      инструмента — выключение capability не ломает остальных.
- [ ] Прод-подтверждение: версия на проде, healthz, ручная проверка каждого нового инструмента
      через живой Hermes (скриншот/транскрипт).
- [ ] Экспорт/удаление покрывают новые категории данных (goal-store) — проверено.
- [ ] Cost: фактические затраты H2 в конвертах; отчёт в STATUS.
- [ ] Initial metrics snapshot записан; обязательный H2 parallel-monitor имеет даты,
      prompts-артефакт и stop-условия. По owner amendment 2026-07-24 окончание 14-дневного
      окна не блокирует closure, но day-14 follow-up остаётся обязательным.
- [ ] STATUS.md: горизонт H2 → CLOSED.

### G-H2-PARALLEL-MONITOR (owner amendment 2026-07-24)

- [ ] Окно `2026-07-24—2026-08-06` ведётся независимо от Codex-сессий.
- [ ] Записываются production minutes (речь+письмо), ASR previews/corrections, W1 proposals
      created/confirmed/rejected, incidents/unwanted writes, per-loop owner verdicts и фактические
      metered-затраты по конвертам.
- [ ] Day-14 follow-up обновляет `hermes-side/h2.7/EVIDENCE.md` и `STATUS.md`.
- [ ] Unwanted write немедленно останавливает новые mutation paths; неожиданный metered-cost
      `>$0` без owner go останавливает cost-path; систематическая hallucination/sycophancy либо
      owner verdict `≤2/5` выключает затронутую петлю до owner decision `repair/disable/continue`.

Этот monitor обязателен, но его календарное завершение не блокирует G-H2-CLOSURE. Поправка
не ослабляет consent, rollback, schema, live-tool, export/delete или cost-snapshot гейты.
Последующие решения Д6-P/Д6-A от 2026-07-24 разрешают параллельный H3 R&D C1–C5. Longitudinal
maturity thresholds больше не являются start-gates; это не превращает незакрытые H2-гейты в PASS.

## 5. G-H3-RND (разрешение отдельного R&D-чартера)
- [x] Owner research-go Д6-A на параллельный портфель C1–C5 записан в `STATUS.md` (2026-07-24).
- [ ] Current evidence volume/duration/case-count чартера измерен до старта и отмечен как
      `MATURE` или `UNDERPOWERED`; недостаток maturity не блокирует старт и набирается параллельно.
- [ ] В H1/H2 parallel monitoring нет active stop condition, затрагивающего этот charter path.
- [ ] Hard action-gates конкретного чартера перенесены без ослабления: C2 exact cost cap +
      cloud-audio consent до live call; C3 no review_log write; C4 scope/consent/provenance до
      note-read; C5 no FSRS/scheduler mutation; privacy локальных данных для всех.
- [ ] Пороги успеха/провала и stop-условия чартера перенесены в сессию без ослабления.
- Выход чартера: evidence-отчёт в docs/research/… + вердикт; НЕ код в проде. Production-планирование
  темы = новый цикл решений владельца.

## 5.1 G-C1-X-EXPERIMENTAL (owner exception after C1 NO-GO)

- [x] C1 research row is `DONE_NO_GO / UNDERPOWERED`; report preserves frozen aggregates.
- [x] UI says experimental/advisory and displays 60% sensitivity, 30% false positives and stress
      2/10 before opt-in and beside each result.
- [x] Initial exercise allowlist contains exactly the 25 preregistered target words; no arbitrary
      target/G2P claim is exposed.
- [x] Companion binds loopback only, requires a random local token, allowlists production/dev
      origins, caps WAV size/duration and deletes every request temp file.
- [x] Raw audio, calibration profile and detailed scores never reach the LinguistPro server or git.
- [x] Static/code scan and runtime tests prove no FSRS, `review_log`, grade, mastery, progress,
      analytics, agent-memory or provider write/call.
- [x] Missing/stopped companion yields a typed honest unavailable state, never a guessed score.
- [x] Noncommercial + CC BY-NC attribution notice is visible; monetization stop-condition recorded.
- [x] `C1_EXPERIMENTAL_ENABLED=0` rollback verified; existing product paths remain operational.
- [x] 380px screenshot, ru/en/he locale coverage, SW/version bump, focused smokes and API smoke PASS.
- [ ] Production preflight, deploy landing, health, fresh asset/config and loopback owner path verified.

Passing this engineering gate means only that the bounded experimental function is honestly
implemented. It does not change the C1 research verdict or certify pronunciation quality.

## 6. Кто проверяет

Гейты G-SLICE-* проверяет исполняющая Codex-сессия и фиксирует артефакты; G-H1-CLOSURE/G-H2-START/
G-H2-CLOSURE проверяют H1.8/H2.7; G-H3-RND проверяет сессия конкретного чартера против Д6-A,
measured maturity и hard action-gates. Вердикты — владелец. Самопроверка без
артефактов не считается прохождением (R17: кто делает — не сертифицирует сам себя).
