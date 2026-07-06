# P9 «Дом наставника» — решение владельца по форм-фактору и MVP (2026-07-06)

> Контекст: CLG-P6 закрыт целиком (v3.11.113, все слайсы live-verified). UX-развилка
> владельца: «план текстом — работать невозможно» → принята эволюция P6.5 → P9.
> P6.5 (исполняемый план в ☁-боксе) отгружен. Этот док фиксирует решения для P9,
> чтобы новая сессия стартовала без пере-обсуждения.

## Решение 1 — форм-фактор: полноэкранный вид ВНУТРИ Зала

- Иконка **🤖 в шапке Зала** (рядом с ☁) → контент Зала сменяется видом наставника —
  тот же паттерн, что `roomContent ↔ roomReader` (читалка). НЕ отдельная страница,
  НЕ drawer, НЕ модал.
- **Hash-роут `#mentor`** — deep-link для пушей и будущий URL-контракт.
- Обоснование (зафиксировано в обсуждении): отдельная страница = кросс-навигация с
  teardown OPFS-базы на КАЖДОЕ действие плана (класс рисков v3.11.101 CANTOPEN) и
  трение против R17-гейта 8 (один тап до учёбы); полноэкранный вид даёт площадь
  страницы без этих издержек. Drawer на 380px — тот же полный экран с худшей
  эргономикой (жесты/RTL).
- Этикет проявления: наставник НЕ всплывает сам (анти-сценарий §2.3 «агент перебивает
  чтение»); допустим ненавязчивый бейдж на 🤖 («план готов»), никогда автораскрытие.

## Решение 2 — архитектурный инвариант переносимости (фундамент «не переделывать»)

- Дом наставника = **автономный модуль (public/js/mentor-home.js), данные ТОЛЬКО из
  cloud API** (`/api/agent/*`, `/api/learner/*`) — НИКАКОГО прямого OPFS.
- Действия — через **host-adapter**: Зал отдаёт модулю хендлеры
  `runTrainer(itemKeys, channel)` (= startPlanSectionTraining) и `openReading()`;
  Telegram Mini App (P8, другой origin, OPFS недоступен) отдаст deep-link-хендлеры.
  Модуль по построению = скелет Mini App; при необходимости standalone-страницы —
  второй монтаж без переписывания логики.
- Контракт `/api/agent/plan` не меняется (category-R17 / recommended_channel /
  item_keys / construct_id / constructs-titles — уже семантический).

## Решение 3 — MVP-состав (владелец выбрал ВСЕ четыре блока)

1. **План + действия (ядро):** «🧭 План» переезжает из ☁-модала в дом наставника;
   крупный рендер секций, ⚙-конструкции, кнопки P6.5 («▶ Начать»/«▶ В Зал»).
2. **История объяснений:** новый малый endpoint `GET /api/agent/explanations`
   (list, session-gated, user-scoped, лимит/пагинация; purge-aware — tombstone-строки
   показываются честно «очищено по отзыву согласия» или скрываются); лента с якорями
   (тап → открыть текст на предложении: text_key + order_index — механика закладок).
3. **Статус/лимиты + consent-переезд:** строка ключа/лимитов LLM (из /api/agent/status)
   и галочка «🤖 Разрешить наставнику читать мои тексты» переезжают сюда;
   ☁-модал возвращается к синку/пушу/аккаунту.
4. **Зачаток misconception-блока:** «ваши конструкции» — агрегат construct_id из
   agent_explanations.facts_used (kind='constructs') + agent_tasks kind='plan'
   (payload sections construct_ids): сколько раз какая конструкция всплывала +
   серверные титулы. Малый endpoint `GET /api/agent/constructs/summary`
   (purge-aware по построению: у purged-строк facts_used='[]'). Задел P10-карты,
   НЕ полный misconception engine.

## Границы слайса (без изменений)

- НЕ чат (P7, после G-5); не трогать record_review_answer (disabled до гейтов 4.8);
  НЕ sentence_plus_neighbors без измерений.
- Tier 1 (без облака): 🤖-вид честно показывает «наставнику нужен облачный аккаунт»
  (не прячется и не притворяется — R4 без тупиков, R11).

## Гейты приёмки P9

- smoke: новый `smoke:mentor-home` (или расширение agent-гейтов): 401-gating новых
  endpoints · explanations list строго user-scoped · purge-aware (после revoke
  контент не отдаётся) · constructs/summary ⊆ реестра · MNAR (просмотр дома ничего
  не пишет в review_log).
- UI: 380px light/dark скриншоты вида · i18n ru/en/he · [hidden]-guard паттерн ·
  R17-этикет: никакого автооткрытия.
- Регрессия: agent-plan/explain/burst + cloud-sync (☁-модал менялся) + reader-parity.

---

## Статус реализации — SHIPPED v3.11.114 (2026-07-06) · LIVE-VERIFIED владельцем 2026-07-06

Реализовано в точности по решениям выше; все гейты приёмки пройдены;
owner live-verify на проде пройден → **CLG-P9 закрыта**.

- **Сервер:** `GET /api/agent/explanations` (list: rowid-курсор newest-first,
  limit+before_rid+has_more; tombstone честный — purged/purge_reason без контента;
  якорь парсится из sentence_id по последнему `#`) + `GET /api/agent/constructs/summary`
  (агрегат: facts_used kind='constructs' объяснений — purge-aware по построению +
  `construct_ids` секций plan-task payload — добавлены в planner.js; фильтр ⊆ реестра и
  титулы — в runtime, репо отдаёт сырьё). Оба session-gated, user_id из принципала.
- **Клиент:** `public/js/mentor-home.js` (UMD, API-only, textContent-only, dir=auto для
  ru/en-текста в he-UI; host-adapter: runTrainer/openReading/openTextAt) ·
  `#roomMentorView` в library.html (reader-bar + [hidden]-guard + `#roomMentorView
  button{width:auto}` против глобального mobile-трапа) · library-ui.js:
  open/closeMentorView (history.replaceState — без мусора в истории), hashchange +
  deep-link `#mentor` на буте, host-adapter с OPFS-резолвом text_key→id на стороне
  хоста, `scrollToOrderIdx` (открытие текста на якоре объяснения), due-CTA скрыт
  поверх вида; ☁-модал вернулся к синку/пушу/аккаунту (план, consent агента,
  статус-строка — переехали). i18n `room.mentor.*` ru/en/he; SW precache
  +mentor-home.js, CACHE_VERSION v3.11.114.
- **Гейты:** `smoke:mentor-home` **25/25** (401 ×2 · лента: контент/якорь/провенанс/
  порядок/пагинация · user2-изоляция (direct-DB сессия, паттерн B1) · summary ⊆
  реестра из ОБОИХ источников · MNAR · purge: tombstone + контент-строки отсутствуют
  в ответе + plan-вхождения переживают · stdout-гигиена). Регрессия: agent-plan 30/30 ·
  agent-explain 42/42 · burst 19/19 · auth 26/26 · learner-graph 14/14 · cloud-sync ·
  reader-parity · room-smoke 14/14 · i18n 226 · api-smoke.
- **Скриншоты** (`scripts/premium/mentor-home-shot.js`, .tmp/mentor-shots/): Tier-1
  заглушка · полный вид light/dark · HE-RTL · deep-link `#mentor` с холодного бута ✓.
- **Вне слайса (по границам выше):** чат P7 не начат; record_review_answer disabled;
  sentence_plus_neighbors не включён; бейдж «план готов» на 🤖 — кандидат следующего
  слайса (этикет позволяет, автораскрытия нет).
