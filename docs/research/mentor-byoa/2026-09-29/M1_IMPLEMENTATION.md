# M1 — контекст, исходящий транспорт и общая панель

Дата: 2026-09-29. База: `47c12dea`; ветка `feat/mentor-byoa-m1`.
Статус: **TECHNICAL_PASS для M1 transport spike**. Production не менялся.
Это не приёмка полного наставника, педагогического качества или массового запуска.

## Реализовано

- Одна панель для построчного объяснения в настоящих Студии и Зале: точный
  выбранный фрагмент, просмотр соседних предложений, отдельное согласие на передачу,
  вопрос, текстовый ответ, остановка, возврат и ручное подключение/отзыв агента.
- RU/EN/HE copy, RTL, native dialog/focus, адаптация desktop/mobile. Ответ выводится
  через textContent, включая любые HTML-подобные строки модели.
- Серверная SQLite-миграция 070: пользователи/связи/одноразовое pairing/сессии,
  TTL, неизменяемый ContextEnvelope, lease, hard deadline, version cursor,
  идемпотентные запрос/доставка результата, исключение повторной генерации после обрыва.
- Cookies + существующий CSRF для пользователя; отдельный bearer для коннектора.
  Provider OAuth не передаётся LinguistPro. В relay хранятся хеши секретов.
- Исходящий Python-коннектор и изолированный адаптер Hermes 0.21.5:
  только openai-codex, без API fallback, tools/MCP, owner memory и learner writes.
- Feature flag `TUTOR_BYOA_ENABLED` выключен по умолчанию. При выключении прежние
  точки входа сохранены. При сбое нового транспорта скрытого перехода к старому
  платному маршруту нет. Версии shell/SW — 3.11.691, новые assets включены в integrity.

## Проверки и класс доказательств

### Изолированные автоматические проверки

`node --test tests/tutorContext.test.js tests/tutorTransport.test.js tests/shellIntegrityPrecacheParity.test.js tests/shellModuleWiring.test.js`

**33/33 PASS**: контекст/диапазоны/редакции, две учётки и два коннектора,
CSRF/bearer/disabled flag/no-store, TTL, отмена, отзыв, неверный lease, повторные
запросы, поздние результаты, запрещённые grades/actions, восстановление SQLite
после закрытия/открытия без повторного выполнения, shell asset parity.

`python ops/mentor-connector/test_connector.py` — **3/3 PASS**: origin boundary,
остановка subprocess при cancel/disconnect, повтор доставки без повторного runner.
Провайдер и реальные credentials в этих тестах не используются.

`node scripts/premium/tutor-m1-browser-smoke.js` — **PASS**, настоящий frontend,
свежий isolated Chromium, fixture HTTP+SQLite, настоящая локальная OPFS-база.

- Room и Studio отправили один и тот же Hebrew excerpt и revision
  `snapshot:4c1c474865a60b7b31f910ad59bcc79d91edaee4a0cc3f01d0ae9cc5f27bcd38`.
- Ответ восстановился после reload без второй генерации; новый вопрос из Studio
  создал отдельную сессию. `review_log` до/после одинаков; pageErrors пустой.
- HTML-подобный fixture payload отображён буквально, ни одного внедрённого img.
- Отмена, закрытие Escape, focus внутри dialog и возврат на инициатор;
  состояние отозванного подключения показывает понятное действие.
- 1280×900, 390×844 и Hebrew RTL 380×844 без горизонтального переполнения.
  [Снимки](m1-screenshots/) проверены визуально. Это не physical-device/AT acceptance.

В первом browser run обнаружена ошибка: восстановленный полный server envelope
подменял формат нового request context; второй вопрос отклонялся. Исправлено:
restore восстанавливает сессию, а новый запрос сохраняет свежий browser snapshot.
Дополнительная проверка фокуса первоначально ожидала DIALOG вместо shadow host DIV;
исправлена проверка реального containment, поведение интерфейса не менялось.

### Настоящая подписка владельца, синтетический учебный источник

`node scripts/premium/tutor-m1-live-smoke.js --owner-codex` — **PASS**.
Локальный fixture relay → actual connector в owner Hermes container → actual
Hermes runtime → ChatGPT/Codex OAuth `gpt-6-sol` → validated completed result.

[Результат](M1_LIVE_RESULT.json) содержит объяснение הייתִי/היה для авторского
предложения `כשהייתי ילד גרתי בחיפה`, точная привязка context подтверждена.
Это одна реальная генерация по подписке; не fixture модели и не production UI.
Тестовая связь отозвана. OAuth/token values и owner learning data не сохранены
в доказательствах. Личный WebUI продолжает работать; новый connector не установлен
как постоянный сервис. Проверка настоящего quota exhaustion/reauth не проводилась.

## Ограничения и следующий этап

- M1 — объяснение выбранного snapshot, не самостоятельная проверяемая попытка.
  M2 добавляет завершённый учебный цикл с независимым ключом и существующим writer.
- Revision — hash выбранного окна, не подпись авторитетной редакции корпуса.
  Длинные соседи >4000 символов опускаются; отправляемое окно видно в панели.
- Подключение пока операторское, через stdin-код; M3 должен дать installer,
  OS credential storage, autostart, onboarding без терминала и recovery.
- Relay удерживает учебный payload до 15 минут; периодическая очистка каждые 30 с.
  Физическое стирание SQLite/backups и массовые SLA ещё не приняты.
- Общий IP limiter, polling и один активный запрос — ограничения spike;
  tenant-based throttling и нагрузочные испытания обязательны до M7.
- Ошибки провайдера, поглощённые самим Hermes, могут отображаться как runtime_failed;
  реальную классификацию quota/reauth необходимо отдельно подтвердить до M3.
- MCP владельца с 31 инструментом сохранён. В M1 tools сознательно не выдаются
  explanation runner; новые учебные MCP-возможности идут отдельным контрактом.
- Зал/Студия глобальные старые функции, Медиатека/Повторение, grammar graph,
  инициативы, голос, образовательная редактура и измерение эффекта ещё впереди.

Запуск: [operator README](../../../../ops/mentor-connector/README.md).
План: [execution ledger](../../../planning/MENTOR_BYOA_EXECUTION_2026_09_29.md).
