# Word Status Truth + Familiarity — implementation packet

Дата: 2026-09-07
Статус: **IMPLEMENTED · ENGINEERING PASS · OWNER DEVICE ACCEPTANCE PENDING**
Основание: owner-проверка нового устройства и архива
`linguistpro-learning-שיחה-נכנסת-Входящий-звонок--1-03acdeff34c9-archive.lplp.zip`.

## 1. Решение владельца

LinguistPro разделяет три разных факта:

1. **`new`** — явная learner-метка в каноническом `word_status`; только она
   получает фиолетовую заливку и участвует как `explicit_new`.
2. **`unassessed`** — словоупотребление уверенно связано с устойчивым учебным
   ключом, но learner-метки нет. Это производная UI-классификация, не запись и
   не утверждение незнания. В тексте она получает только нейтральное пунктирное
   подчёркивание.
3. **`unresolved`** — устойчивый учебный ключ не установлен. Статус и цвет не
   назначаются; система честно воздерживается.

Импорт snapshot/archive продолжает переносить материал, а не личную память.
Автоматических записей в `word_status`, `review_log` или cloud learner state
при импорте/рендере не появляется.

## 2. Измеренный дефект

В текущем `ReaderMorph.decorateWords` уверенные `exact|likely` при отсутствии
learner-state отображаются как `raw || "new"`. На утверждённом архиве это
создало 464 фиолетовых вхождения из 974, не записав ни одного статуса.
Покрытие было неполным по другой оси: `function|unknown|guessed` оставались
нейтральными. Поэтому один цвет смешивал asserted learner truth и derived
resolver capability.

Learning Compass считает знакомость отдельно и консервативно: `untracked` и
`unresolved` входят в знаменатель. Для этого архива 256/974 вхождений
неразрешены (26.28 pp), поэтому `rank_eligible=false` при лимите 5 pp даже если
все 718 разрешённых вхождений пометить знакомыми.

Studio, в отличие от Reading Room, позволяет выбрать `familiar_desc` без
единого rank-eligible результата и молча применяет резервный порядок. Это
нарушает смысл подписи «Сначала достоверно знакомые».

Полные измерения: `docs/research/word-status-truth/2026-09-07/`.

## 3. Инварианты

- `review_log` остаётся единственным домом review-событий; ручная ось статусов
  остаётся asserted learner state в существующем `word_status`/sync contract.
- `unassessed` и `unresolved` никогда не сохраняются как learner-status.
- save-key == paint-key == sort projection key; новый UI-класс не меняет ключи.
- Морфологическая уверенность не равна педагогическому знанию слова.
- `likely` разрешено показать как `unassessed`, но нельзя автоматически
  превратить в `new`; омонимия остаётся видимой в карточке.
- Служебные слова и неразрешённые формы нельзя «докрасить» угадыванием.
- Familiarity остаётся lower bound, не comprehension/CEFR/readiness score.
- Архивная privacy-модель не меняется; схема и миграция БД не требуются.
- Все новые строки — RU/EN/HE; shell-assets получают совместный SW/version bump.

## 4. Утверждённый UX

### Текст и легенда

- Фиолетовая заливка: только явно отмечено «новое».
- Тонкое пунктирное подчёркивание: распознано, но ещё не оценено.
- Нет декорации: неразрешено либо тумблер статусов выключен.
- Легенда и справка прямо называют различие; `unassessed` не добавляется в
  палитру ручных статусов, потому что это отсутствие решения, а не восьмой
  learner-status.

### Разбор слов

- CTA переименовывается из «Учить новые слова» в «Разобрать слова».
- Список группирует уверенно разрешённые unset/explicit-new формы по
  каноническому ключу, показывает частоту и контекстное предупреждение.
- Индивидуальные действия сохраняют существующие статусы.
- Пакетное «Отметить как новые» требует отдельного подтверждения, показывает
  точное число уникальных ключей, выполняется per-item best-effort и предлагает
  ограниченное undo только для записей, созданных этой операцией и всё ещё
  имеющих ожидаемый статус. Undo не переписывает `review_log`.

### Сортировка Studio

- Выбор `familiar_desc` сначала требует непустой learner profile.
- После подготовки результатов требуется хотя бы одна карточка со
  `status=AVAILABLE && rank_eligible=true`.
- Иначе селектор возвращается к предыдущему значению и показывает локализованное
  объяснение; lower-bound badge остаётся доступным.
- Никакая limited/unavailable карточка не сортируется по числу как надёжная.

## 5. Реализация по этапам

### WST-0 — красные контракты

- ReaderMorph: unset confident => `rm-w-unassessed`, не `rm-w-new`; explicit
  `new` => только `rm-w-new`; unconfident unset => без status-класса.
- Frontier API явно различает `assessment=unassessed|explicit_new`.
- Learning Compass: точные bucket/denominator/rank gates не меняются.
- Studio: profile-empty и all-limited отменяют сортировку с объяснением.

### WST-1 — семантика + presentation

- Обновить `reader-morph.js`, общий CSS, Room/Studio легенды и три локали.
- Не менять persisted status enum и FSRS/review writers.

### WST-2 — безопасный batch workflow

- Адаптировать существующий Room study sheet к честной assessment-семантике.
- Добавить Studio review dialog поверх общего collection API без второго
  хранилища и без автоматической записи.
- Добавить confirm, result ledger и bounded undo.

### WST-3 — familiarity gate parity

- Вынести/переиспользовать проверку rank eligibility в Studio discovery.
- Сохранить детерминированный fallback только после явного отказа от
  familiarity sort, не под выбранной ложной подписью.

### WST-4 — доказательства и выпуск

- Unit/static: ReaderMorph, CatalogDiscovery, Learning Compass, i18n,
  memory-canon, reader parity.
- Browser: Studio + Room desktop и 380x844, RU и HE/RTL, explicit-new,
  unassessed, unresolved, confirm/cancel/apply/undo, profile-empty/all-limited.
- Owner profile не использовать для пишущих acceptance-сценариев.
- Allowlist commit/push; production read-back — отдельные engineering browser
  evidence и owner-device acceptance, не смешивать.

## 6. Роль-синтез

- **R1/R10:** новое состояние не повышает морфологическую уверенность;
  `likely` и омографы не становятся learner truth.
- **R2/R8:** сначала осознанная оценка и контекст, затем deliberate study;
  batch — выбор ученика, не blue-wall автосидирование.
- **R4:** различия видимы на 380 px, объяснимы без hover, нет no-op sort.
- **R9:** derived `unassessed` строго отделено от asserted `new`.
- **R11:** существующие явные статусы, ключи, source-at-mark и Room/Studio
  continuity сохраняются; head-regressions проверяются отдельно.
- **R12/R13/R15:** нет нового writer, миграции или расширения archive payload.
- **R17:** автоматический резолвер предлагает кандидата, но не оценивает
  знание ученика и не пишет review-событие.

## 7. Stop-list

- Не расширять resolver эвристикой ради процента подчёркнутых слов.
- Не считать `unassessed` знакомым или явно новым.
- Не экспортировать learner-state внутри material archive.
- Не писать batch без preview/confirm/undo ledger.
- Не заявлять linguistic accuracy по coverage; нужен независимый gold.
- Не деплоить до зелёных scoped gates и 380 px visual inspection.
