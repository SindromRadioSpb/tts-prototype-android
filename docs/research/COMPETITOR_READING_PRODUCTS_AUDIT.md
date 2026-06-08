# Конкурентный аудит: reading-продукты для изучения языков

> **Дата исследования:** 2026-06-08 · **Метод:** web (официальные сайты, help/FAQ,
> app-store листинги, сторонние обзоры) + read-only аудит нашего кода. Источники — в
> конце каждой карточки. Сырой исследовательский вывод: workflow `wj9pmz4yv`
> (8 агентов, 5 карточек + 3 аудита кодовой базы).
>
> **Цель:** понять, что конкуренты делают лучше нас, что хуже, какие практики
> перенять / адаптировать / отклонить — как вход в gap-анализ для стратегии
> «Издательство + Читальный зал» (`docs/strategy/BEN_YEHUDA_LIBRARY_READING_ROOM_STRATEGY.md`).
>
> ⚠ **Честность оценок:** конкуренты не идеализируются — фиксируются и friction, и
> сильные UX-решения. Непроверенное помечено как *uncertainty*.

---

## Executive summary

| Продукт | Суть | Сильнейшее | Слабейшее (для нас — урок) |
|---|---|---|---|
| **LingQ** | Immersion + corpus-wide vocab-tracking | Постоянный статус слова (new→known) через весь корпус; импорт контента | Агрессивный paywall lookup; нет морфологии; нет параллельного перевода; нет никуда/RTL-полировки |
| **Readlang** | Click-to-translate + авто-флэшкарты | Frictionless «клик→перевод→карточка»; LLM-объяснения в контексте; $6/мес | Только браузерный TTS; нет mobile-app; нет морфологии; нет «known words» метра |
| **Beelinguapp** | Параллельный текст + karaoke-аудио | Side-by-side + синхро-подсветка; офлайн-загрузка; красивые полки | AI-TTS мис-произношение; AI-«graded» рассказы с ошибками; mobile-only; dark patterns |
| **StoryHebrew** | Graded Hebrew + регулируемый никуд + аудио | Никуд full/partial/off; CEFR-бейджи; native-аудио; чистая читалка | Синтетика без канона; только tap-gloss; нет морфологии; нет адаптива; paywall |
| **Sefaria** | Канонная библиотека + параллельные переводы | Hypertext-граф источников; free/open; офлайн (500MB); открытый API; кураторские Collections | Нет TTS-чтения; нет морфо-глубины; нет грейдинга; mobile≠web; infinite-scroll тормоза |

**Главный вывод:** ни один не объединяет *подлинный литературный канон* + *native-аудио*
+ *глубокую морфологию на тапе* + *персональный i+1* + *офлайн* для иврита. Sefaria —
ближайший blueprint «издательства» (но религиозный канон, без SLA-скаффолдинга и TTS);
StoryHebrew — ближайший по Hebrew-UX (но синтетика, без морфологии/канона/офлайна).

---

## Карточка 1 — LingQ

- **Positioning:** input-based immersion (подкасты/книги/видео/импорт) + трекинг
  лексики + community. «Естественное» обучение vs дриллы. Основан 2007 (S. Kaufmann).
- **Target user:** self-directed взрослые intermediate+, мультиязычные, с интересами
  (манга/подкасты). 50+ языков.
- **Core reading flow:** ридер с tap-to-lookup; статус слова обновляется через весь
  корпус; аудио играет синхронно с karaoke-подсветкой; пользователь сам выбирает путь.
- **Content model:** гибрид curated (5000+ уроков) + user-import (YouTube/RSS/PDF/
  статьи). AI-симплификация (premium). Метаданные: источник, длительность, теги, флаг сложности.
- **Audio model:** профессиональное аудио (подкасты) ИЛИ TTS; word-by-word подсветка;
  скорость 0.5–2×; в free аудио стримится онлайн, офлайн-кэш — premium.
- **Translation model:** **НЕТ параллельного двуязычия.** Только «View Translation»
  (premium) = перевод всего урока целиком; нет per-word native-перевода (философия
  «не злоупотреблять переводом»). Per-word — только англ. определение.
- **Vocabulary tracking (моат):** статус 1→4 (new/learning/learned/known), corpus-wide
  и липкий. SRS-флэшкарты (premium), Anki export. **Нет морфо-декомпозиции** (плоский
  список слов; корни/парадигмы пользователь отслеживает сам).
- **Progress model:** непрозрачная авто-оценка уровня A1–C2 по known words + часам; нет
  level-gates; дашборд = накопленные слова/часы/стрик.
- **Personalization:** слабая; «Recommended for You» по истории+языку; нет адаптивной сложности.
- **Library/discovery:** поиск + категории + difficulty-теги + длительность; trending;
  curated playlists; follow creators; импорт. Нет «what to study next» движка.
- **Onboarding:** язык → self-уровень → 3–5 интересов → сразу библиотека; soft-лимит
  5–7 lookup/день → upgrade-баннер.
- **Mobile UX:** нативные iOS/Android (паритет с web); tap-определение в модале; bottom-bar
  аудио; офлайн (free: 3 урока). Жалобы на battery drain, sync-lag.
- **Pricing:** free (30–50 lookup/день, без SRS/импорта/перевода); premium ~$12/мес
  ($120/год); агрессивный soft-limit→paywall.
- **Strengths:** масштаб подлинного контента; corpus-wide vocab; импорт; karaoke audio-text;
  дешевизна; прозрачный discovery; mobile-паритет; авторитет основателя.
- **Weaknesses:** агрессивный paywall до формирования привычки; нет морфо-инсайта; нет
  адаптивной прогрессии; слабый перевод-скаффолдинг (тяжело A1); SRS оторван от чтения;
  нет офлайн-first; community как доплата; UX-долг в web-ридере.
- **Practices to COPY:** подлинный контент как носитель; corpus-wide липкий статус слова;
  karaoke audio-text sync; inline tap-lookup с контекстом; прозрачный discovery; лёгкий
  onboarding; импорт; честный free-tier с реальной пользой.
- **Practices to AVOID:** агрессивные soft-лимиты/paywall; минимальный перевод-скаффолдинг;
  непрозрачная прогрессия сложности; vocab оторванный от чтения; community как add-on.
- **Hebrew relevance:** moderate-low. Сильна авто-контент-модель, НО: нет морфо-скаффолдинга
  (критично для богатой ивритской флексии), нет никуда, LTR-native ридер (RTL — баги),
  слабый перевод для A1, нет транслитерации-revelation.
- **Ben-Yehuda relevance:** high. Content-модель и vocab-tracking ложатся на канон; мы
  обходим LingQ через офлайн-first+BYOK, морфо-скаффолдинг, литературную курацию,
  two-surface разделение, более щедрый bilingual-скаффолдинг, персональный i+1.
- **Uncertainties:** subscriber count 2026; точность AI-симплификации; интеграция Lynx AI
  с контекстом чтения; cadence обновления библиотеки; региональные цены; RTL/никуд на roadmap?; retention по tiers.
- **Sources:** lingq.com; App Store id379385811 (4.67★/57 370); forum.lingq.com/knowledge-base;
  lingq.com/help; YouTube @Thelinguist. (Hebrew/никуд/RTL — в первичных источниках не найдено.)

---

## Карточка 2 — Readlang

- **Positioning:** browser-extension + web-eReader; «click any word to translate» + авто-SRS-
  флэшкарты. «Clean and distraction free» (основатель S. Ridout, ex-Duolingo Stories). $6/мес, 100+ языков.
- **Target user:** self-directed intermediate-advanced (редко новички — нет скаффолдинга);
  полиглоты; учителя (назначают чтение).
- **Core reading flow:** клик слова/фразы (на любой веб-странице или .txt/.epub) → inline-
  перевод + AI-объяснение в сайдбаре → слово авто-сохранено как карточка с контекстом →
  читаешь дальше → потом SRS-практика / Anki export.
- **Content model:** (A) публичная библиотека (тысячи текстов, сортировка по CEFR/длине/типу/
  популярности); (B) user-upload (.txt/.epub/paste/YouTube-транскрипты); (C) Web Reader
  extension на ЛЮБОЙ странице. Нет авто-рекомендаций.
- **Audio model:** **браузерный TTS** (read-aloud с подсветкой); качество зависит от ОС/браузера
  (часто плохое). НЕ нарратив. Для видео — YouTube-таймсинк (хрупкий).
- **Translation model:** MT + контекстные AI-объяснения (ChatGPT 4o-mini free / GPT-4o Plus).
  Одноязычно (нет параллельного двуязычия). Фразы до 6 слов (free) / 12 (premium).
  Нет rule-based морфологии.
- **Vocabulary tracking:** авто-захват каждого lookup (контекст-предложение + перевод + TTS-
  произношение); star/edit/delete; CEFR-частотная приоритизация; SRS по кривой забывания;
  Anki export. **Нет морфо-группировки** (флексии не объединяются).
- **Progress model:** статус текста (to-read/reading/done); SRS на уровне слов. **НЕТ** метра
  «known words» (запрошен community, не реализован), нет «% понимания текста».
- **Personalization:** лёгкая (CEFR-сортировка + SRS-адаптация); нет ML-«next text».
- **Library/discovery:** только ручной browse (CEFR/длина/тип/популярность); нет рекомендаций/
  newsfeed/trending. Учителя назначают тексты + видят проблемные слова.
- **Onboarding:** исторически friction (непонятно с лендинга, нужна Chrome-extension); нет
  guided-tour, нет placement-теста, нет «первого текста».
- **Mobile UX:** **responsive web (НЕ нативное приложение)**; PWA на home-screen; офлайн
  ограничен (50 текстов + 1000 карточек); TTS нестабилен. Только Apple Watch app существует.
- **Pricing:** free (unlim word-перевод, 10 фраз/день ≤6 слов, 200 хайлайтов всего); Premium
  $6/мес ($48/год); Premium Plus $15/мес ($120/год, GPT-4o + HQ TTS). Одна подписка на все языки.
- **Strengths:** frictionless click-translate; авто-захват с контекстом; щедрый free + низкая
  цена; SRS без ручной настройки; Anki export; 100+ языков; clean UI; контекстные LLM-объяснения;
  Web Reader на любой странице; мультислов-фразы; teacher-features.
- **Weaknesses:** нет нарратив-аудио (TTS браузерный, плохой); нет mobile-app; нет curated-
  рекомендаций/passive discovery; нет адаптивной сложности; нет морфо/грамм-аннотаций (нет
  никуда/спряжений); нет «known words» метра; видео-таймсинк хрупкий; библиотека статична/мала;
  жёсткие free-лимиты; офлайн слабый.
- **Practices to COPY:** одна подписка на все языки; click-translate + авто-флэшкарта; контекстные
  LLM-объяснения (перевод как «репетиторство»); SRS без ручных ручек; Anki-мост; clean UI;
  CEFR-сортировка; teacher progress-tracking.
- **Practices to AVOID:** нет «what to read next»; браузерный TTS как основной; нет mobile-app;
  хрупкий YouTube-таймсинк; отсутствие морфо-инструментов; нет «known words» метра; жёсткие
  free-лимиты; нет адаптивной сложности.
- **Hebrew relevance:** moderate-high для современного, ниже для классики. Поддержка иврита
  «beta»; **нет никуда**, нет морфо-инструментов (биньян/шореш), RTL «вроде работает» но без
  полировки, TTS иврита синтетический. Слаб для серьёзной литературной работы.
- **Ben-Yehuda relevance:** high (как контраст-парадигма). Readlang cloud-first; мы офлайн-first.
  У Readlang нет «curated shelves» pre-enrichment; у нас — кураторские полки. Архаичный канон
  требует никуда/глоссинга, чего Readlang не даёт. Click-translate loop + LLM-объяснения — хорошая
  модель снижения friction для перенятия.
- **Uncertainties:** качество Hebrew-TTS; полировка RTL; LLM на иврите; реальная морфо-поддержка;
  размер библиотеки; методология CEFR; офлайн-видео; метрики пользователей.
- **Sources:** readlang.com (/features /pricing /about /iw/library); chromewebstore (reviews);
  blog.readlang.com (context-aware-explanations, read-aloud); forum.readlang.com (Anki, difficulty,
  known-words-request, youtube-sync); mezzoguild/eppika/lingochampion/fltmag/speakingtongue reviews.

---

## Карточка 3 — Beelinguapp

- **Positioning:** science-backed immersion: параллельный текст + native-аудио + AI-генерация
  рассказов; «karaoke-style». Основан 2017 (Берлин), привлёк $1.34M; конкурирует с LingQ/Lingopie.
- **Target user:** intermediate-advanced (A2-C1), уже читающие; **НЕ для абсолютных новичков**
  (нет алфавит/фонетика-скаффолдинга).
- **Core reading flow:** onboarding (язык-пара + интересы + уровень + недельная цель) →
  персональная рекомендация → dual-text (target + base, side-by-side/stacked) → play → native/
  AI-аудио + sentence-by-sentence подсветка (цвет per язык) → tap слова (перевод+определение+
  аудио+глоссарий) → 5-вопросный comprehension-чек → флэшкарты сессии.
- **Content model:** 1000+ двуязычных рассказов (сказки/классика/новости/музыка/дети). ~30–40%
  лицензированная/public-domain классика, **~60% AI-генерация** «под уровень». 25 языков; **все
  пары предпереведены** (любой→любой, не только English-base). Новый контент еженедельно.
- **Audio model:** (A) premium — **native-нарраторы**; (B) free/нижний tier — **AI-TTS,
  мис-произносит** (особенно редкие языки/заимствования — учит неверному произношению). Скорость
  0.5/0.75/1.0×. **Известная проблема: рассинхрон аудио↔подсветка** (строка N озвучена, N+1 подсвечена).
- **Translation model:** параллельный двуязычный показ (нет toggle-reveal); единица —
  **предложение** (не слово). Tap слова → определение+перевод+аудио+пример. **Систематические
  ошибки в AI-контенте** (pancit→panic, leche flan→flan leather), особенно в редких парах.
- **Vocabulary tracking:** tap→глоссарий (определение+аудио+пример)→сохранить; авто-флэшкарты
  (MC + аудио). **Нет Anki/SRS-экспорта, нет SRS-алгоритма, нет морфо-разбора**; глоссарий
  только в активной сессии (нет ретро-извлечения из прочитанного).
- **Progress model:** **стрики** (как растут — «locked» истории постепенно открываются =
  soft-paywall через вовлечённость); недельные цели + бейджи. Нет формальной A1→B1-прогрессии;
  только post-story 5-MC; **нет предиктивного i+1** (сложность вручную размечена).
- **Personalization:** минимальная, по initial-preferences; рекомендации остаются generic
  (по difficulty+genre-популярности, не по истории). Нет коллаб/контент-фильтрации.
- **Library/discovery:** browse-by-metadata (язык/сложность/жанр/длина 5–30мин). **Нет full-text
  поиска**, нет trending/curator-списков/рейтингов. Free/Premium визуально сегрегированы.
- **Onboarding:** быстрый funnel; **dark pattern: 30-мин language-lock на free**; «rate app»
  модал **блокирует завершение** первой истории. Free сильно ограничен (1 язык, ~10% библиотеки, реклама).
- **Mobile UX:** нативные iOS/Android, **нет web/desktop**. Чисто, dark-mode, регулируемый
  шрифт. RTL (арабский) «just works». Баги: rate-app блок, загрузка зависает на 0%, «Your Journey»
  ломается, рассинхрон аудио, глоссарий только в сессии.
- **Pricing:** free (1 язык, ~10%, реклама, 30-мин lock); premium €6.99/мес … €39.99/год.
- **Strengths:** параллель+native-нарратив эффективен для intermediate+; большая библиотека
  (все пары); офлайн-загрузка; щедрый-ish free; дёшево; интуитивный dual-text; dark/шрифт;
  быстрый tap-глоссарий; без gamification-усталости; RTL (арабский).
- **Weaknesses:** **AI-TTS мис-произношение (~60% контента — активный вред)**; систематические
  ошибки перевода в AI-рассказах; нет speaking/writing; нужна предв. беглость (не для новичков);
  слабая персонализация; нет морфо/грамм-метаданных; примитивный vocab (нет Anki/SRS); нет
  формальной прогрессии; техбаги; **mobile-only**; слабый discovery; dark-pattern free; нет BYOK.
- **Practices to COPY:** **параллель side-by-side как основной режим Зала**; **karaoke-синхро-
  подсветка** (цвет per язык); frictionless tap-глосса (определение+аудио+пример); офлайн-first
  загрузка (= наш OPFS/ZIP); многонаправленные пары (Heb↔Ru, Heb↔En); лёгкие стрики; free = 1
  полная история; жанр+сложность+длина теги; авто-флэшкарты из глоссария.
- **Practices to AVOID:** **AI-TTS как основной для литературы** (вред + потеря доверия — нам
  human-нарратив / HQ-TTS с морфо-произношением); **AI-генерация рассказов** для канон-приложения
  (подлинность = моат); free 1-язык+30-мин lock (dark pattern); «rate app» блок завершения; пропуск
  морфо-метаданных; server-зависимая «Your Journey» что ломается; флэшкарты как основной vocab-tool;
  mobile-only; слабая персонализация; пропуск поиска; избыточные paywalls.
- **Hebrew relevance:** medium-high с критическими оговорками. Параллель+sync ложатся, RTL
  доказан (арабский). НО **морфо-слепота критична для иврита** (биньян/тенс/род/число/корень),
  AI-TTS губит фонемные различия (שׁ/שׂ, kaf/khaf), pedagogical-stories ≠ литературный регистр,
  нет никуда/транслитерации.
- **Ben-Yehuda relevance:** high как **«don't become this» кейс**. Их сильные стороны совпадают с
  нашей стратегией, слабые — поучительны: мы децентрализуем контент (канон+BYOK), даём гранулярный
  скаффолдинг, морфологию как primary, ЯВНОЕ two-surface, поиск+автор+эпоха, щедрый free (public
  domain), офлайн-first, BYOK.
- **Uncertainties:** доля AI vs лицензия; TTS-движок; лицензии музыки/новостей; есть ли «Learn
  Hebrew»; алгоритм рекомендаций; sync прогресса; планы BYOK; churn; B2B; точное число языков (14–25).
- **Sources:** beelinguapp.com (/faq /blog ai-stories); educationalappstore; linguasteps;
  fluentu; lingopie/blog; edtechimpact; commonsensemedia; justuseapp reviews; pitchbook; stacksocial.

---

## Карточка 4 — StoryHebrew  *(ближайший Hebrew-specific конкурент)*

- **Positioning:** graded Hebrew reading + native-аудио + регулируемый скаффолдинг (никуд,
  транслитерация, tap-глосса). «Immersive reading» для A1-B2 на curated original-рассказах с проф-TTS.
- **Target user:** A1-B2, взрослые self-study; вторично — учителя; диаспора (Сев. Америка/Европа).
- **Core reading flow:** выбор по difficulty-бейджу (A1/A2/B1/B2) → ридер с аудио синхро по
  предложению → tap слова для определения → toggle никуда full/partial/off → линейная прогрессия → бейдж завершения.
- **Content model:** проприетарный graded-корпус (≈50–200+ заголовков, оценка), **оригинальные
  рассказы для учащихся (не канон)**, 4 уровня CEFR; современная проза. **Нет public-domain классики/
  архаичного литературного иврита (ключевой gap vs Бен-Йехуда).**
- **Audio model:** проф/native-TTS, sentence-level sync (play/pause per предложение); аудио
  обязательно; нет tap-to-hear-word; качество высокое (premium-позиционирование).
- **Translation model:** **нет параллельного перевода**; только tap-глосса (1 англ. слово на
  ивритское). Нет sentence/paragraph-reveal. *(Наш Зал: tap-глосса ИЛИ предложение ИЛИ полный
  параллель — прогрессивный скаффолдинг = дифференциация.)*
- **Vocabulary tracking:** tapped-слова логируются (неявно); **нет Anki/SRS-экспорта** (не
  документирован); нет vocab-дашборда (unverified).
- **Progress model:** story-completion (бейджи/счётчики); нет i+1-routing (уровень выбирается вручную).
- **Personalization:** минимальная; настройки никуд/транслит persistent; нет профилей/адаптива/
  рекомендаций; discovery = ручной browse по бейджу.
- **Library/discovery:** browse по уровню (A1/A2/B1/B2 табы); вероятно sort + keyword-поиск; **нет
  рекомендаций / «what to read next»**; нет жанр/тег-фильтров (unverified). Слабая discoverability.
- **Onboarding:** вероятно sign-up + self-уровень + sample story + upsell; нет placement-теста.
- **Mobile UX:** iOS+Android (inferred) + responsive web; tap-define, никуд/транслит toggles,
  аудио-контролы; офлайн — **неизвестно** (если нет = friction).
- **Pricing:** freemium (1–3 sample → подписка); оценка $10–15/мес (~$100/год, unverified); нет
  family/institutional; нет BYOK.
- **Strengths:** native-аудио + sentence-sync (премиум-ощущение); регулируемый никуд снижает
  нагрузку новичков; CEFR-грейдинг (ясный путь); чистая читалка; проф-продакшн; mobile-first; tap-глосса в потоке.
- **Weaknesses:** **нет канона/литературного иврита**; только tap-глосса (нет параллель-скаффолдинга);
  **нет морфо-анализа/спряжений**; ручной выбор сложности (нет адаптива i+1); слабый discovery;
  неясный vocab-export/SRS (данные заперты); **нет документированного офлайна**; paywall; неясна
  работа с архаичным регистром; нет community.
- **Practices to COPY:** **sentence-level audio sync как core-примитив**; **паттерн toggle никуд
  (full/partial/off) с persistent-настройкой**; CEFR-бейджи при discovery; tap-глосса без модала
  (inline, поток не рвётся); проф-аудио как trust-сигнал; чистый минимальный chrome читалки.
- **Practices to AVOID:** ручной выбор сложности (нам — i+1 frontier); только tap-глосса
  (прогрессивный reveal лучше); paywalled-контент (нам — BYOK + public-domain); нет морфологии (для
  иврита past-A2 — table-stakes); слабый discovery (нам — pre-baked Collections по Dicta-сложности+жанру);
  vocab-siloing (нам — Anki export); неясный офлайн (нам — OPFS+ZIP).
- **Hebrew relevance:** никуд-регулировка и native-аудио хорошо подходят. Gaps: RTL-баги
  (скролл/выделение/copy-paste — unverified исправлены ли); слабый морфо-анализ; graded-корпус
  избегает архаичного канона; неясные кейсы транслитерации.
- **Ben-Yehuda relevance:** **плохой fit для нашей two-surface стратегии = они ортогональны.**
  Они: проприетарные graded-рассказы, paywall, упрощённый язык, без морфологии, без офлайна (unverified),
  без Anki. Мы конкурируем литературной глубиной, офлайн-готовностью, морфо-строгостью, портативностью
  данных учащегося.
- **Uncertainties:** размер библиотеки; офлайн в 2026; формат vocab-export/SRS; RTL-edge-cases;
  размер аудитории; запуски 2025–2026; детали транслитерации; алгоритм рекомендаций; TTS-движок;
  планы морфо-анализа; community.
- **Sources:** storyhebrew.com; App Store / Google Play (inferred); публичная документация/help;
  сторонние обзоры/Reddit (inferred). ⚠ Карточка частично на inference (прямой браузинг help-страниц
  не выполнен в сессии) — пометить как требующую ручной верификации перед использованием как факт.

---

## Карточка 5 — Sefaria  *(blueprint «издательства» + контраст по контенту)*

- **Positioning:** free open-source «living library» еврейских текстов (Тора/Талмуд/Мишна/
  Мидраш/комментарии/философия/галаха) как канонический hypertext-архив. Основан 2011, 501(c)(3),
  18 инженеров, $4.5M/год, 775K MAU (2024), 234 страны. Моат: interconnected text-graph + free
  открытый API + community Sheets.
- **Target user:** еврейские учащиеся всех уровней; педагоги; исследователи; ешива-студенты;
  диаспора. **Нет language-learning позиционирования** (доступ к контенту, не навык языка).
- **Core reading flow:** Library/Topics → поиск/browse → пассаж + правая «Resource Panel» →
  выбор языка (Hebrew/English/bilingual stacked|side) → double-click слова → словарь (BDB/Jastrow) →
  клик цитаты → новый текст в панели (non-blocking) → комментарии/связанные/Sheets.
- **Content model:** 5 категорий (Танах + множество переводов; Талмуд Steinsaltz; Мишна+Мидраш;
  философия/этика; галаха/литургия) + учебники + **user-created Sheets** (10000+). **Нет светской
  литературы / Бен-Йехуда** (вне scope).
- **Audio model:** **минимальный** — только cantillation (троп) для Танаха; **нет per-sentence
  TTS**, нет нарратива для Талмуда/комментариев. Аудио описательное (литургия), не педагогический скаффолд.
- **Translation model:** **поли-перевод** (несколько англ. переводов одного текста: JPS 2019/KJV/
  Steinsaltz/Artscroll). Можно выбрать предпочтительный. **Friction:** нет единого «голоса» — drift
  терминологии/регистра/идеологии; полезно для сравнения, рискованно для новичков.
- **Vocabulary tracking:** double-click→словарная статья (BDB/Jastrow); **нет persistent-списка/
  SRS**; **нет морфо-разбора** (только headword); **на Android tap-define НЕДОСТУПЕН**; нет Anki/Quizlet.
- **Progress model:** опц. аккаунт; «My Reading History»; **нет уровней/i+1/checkpoints**; нет
  стриков/бейджей; Learning Calendars (Daf Yomi и т.д.) — внешний скаффолдинг, платформа не трекает adherence.
- **Personalization:** минимальная; настройки (язык/огласовка/кантилляция/bilingual); **нет
  рекомендательного движка**; Collections (curated) — тематические входы, не персональные; AI-relevance
  для Sheets (~2025, недокументирован).
- **Library/discovery:** **несколько семантических входов** — browse по категориям; **Topics**
  (keyword → пассажи+Sheets+related, crowdsource+AI-теги); full-text поиск; **Collections** (кураторские);
  Learning Calendars; Voices (user Sheets, сортировка по просмотрам). **Нет** алгоритм-рекомендаций /
  difficulty-скаффолдинга.
- **Onboarding:** минимальный friction (3 клика до чтения); quick-start Sheets (видео-гайды); **нет**
  goal-опросника/placement/beginner-flagging. Предполагает знание традиции («что такое Parashat Hashavua»).
- **Mobile UX:** iOS/Android (750K+ оценок, 4.5–4.9★). **+** вся библиотека офлайн (500MB), sync
  истории/настроек, study-calendar push. **−** нельзя открыть несколько текстов сразу; панель уже;
  **tap-define НЕТ на Android**; тормоза на слабых устройствах; infinite-scroll; краши; неполный паритет.
- **Pricing:** **100% free, без paywalls/рекламы**, donation-supported (501(c)(3), $4.5M/год,
  цель $44M на 2023-2027). API бесплатен без rate-limit. Моат-импликация: устойчивость зависит от
  грантов/донатов, не от конверсии.
- **Strengths:** **hypertext-граф источников** (клик стиха → все цитаты/комментарии через 3000 лет);
  free/полный/качественный; **офлайн-first** (500MB); **открытый API + 200+ «Powered by Sefaria»**;
  collaborative Sheets; международный охват (11 языков UI); авторитетные public-domain переводы; много
  входов discovery.
- **Weaknesses:** **нет аудио-чтения** (только cantillation Танаха); mobile отстаёт от web (нет
  multi-source, Android без tap-define, краши); memory-heavy/тормоза/infinite-scroll; **нет морфо-
  глубины**; **нет learner-скаффолдинга/грейдинга**; нет SRS; translation-инконсистентность (drift);
  **нет светской/литературной литературы (нет Бен-Йехуда)**; нет персонализации; слабый progress-UX;
  Android vocab-gap; спорные переводы (gender-inclusive JPS 2022 → Orthodox pushback); несистемная курация Sheets.
- **Practices to COPY:** **hypertext-linked комментарий-граф** (для нас: per-sentence связи —
  аллюзии/этимология/контекст; тап фразы у Бялика → параллельные источники/этимология); **free/donation
  для канона** (Sefaria доказала устойчивость без рекламы); **офлайн-first** (500MB, = наш OPFS+ZIP);
  **multiple entry-points** (Topics + Collections + Calendars + Search); **collaborative Sheet-педагогика**
  (= наше Студия/Зал: тяжёлая курация в Студии, чистое чтение в Зале); tap-глосса с лексикографической
  глубиной (но мы добавляем морфологию: корень/биньян/род-число-тенс); bilingual-кастомизация (Hebrew-only/
  English-only/stacked/side); curated public-domain переводы; **Collections как редакторский голос**
  («Start with Bialik»); developer-first API.
- **Practices to AVOID:** infinite-scroll memory-heavy (нам — пагинация/lazy + разбивка по главам,
  тест на слабых устройствах); пренебрежение mobile-паритетом (Android без tap-define); невидимый
  progress-UX (нам — видимый прогресс: слова/книги/время + лёгкие стрики); неоднозначный провенанс
  переводов + 10 конкурирующих версий (нам — 1–2 помеченных параллельных, чёткий источник/дата);
  отсутствие learner-модели/адаптива (нам — per-sentence i+1, beginner-paths); one-off глоссинг без
  retention (нам — Anki/SRS); пренебрежение аудио как скаффолдом (нам — per-sentence TTS + sync);
  плоская организация user-контента (нам — редакторский слой над user-контентом); англо-центричная
  локализация контента (нам — Heb-Ru-En паритет метаданных полок).
- **Hebrew relevance:** высокий технический fit, низкая SLA-интеграция. RTL+никуд корректны
  (toggle огласовки); **морфо-глубина ОТСУТСТВУЕТ** (double-click = headword, нет биньяна/рода/корня);
  сильный арамейский (Jastrow); **литературный регистр минимален** (нет Бялика/средневековой поэзии/
  светского); **нет транслитерации**; **нет beginner-скаффолдинга**; аудио только Танах (cantillation,
  не педагогика). Вывод: отличен в *референтной* глубине, проваливает *педагогический* скаффолдинг.
- **Ben-Yehuda relevance:** **структурно совместим, философски ортогонален.** Офлайн-first + open-
  licensing + two-surface (Library/Voices ↔ наш Зал/Студия) + API-first + hyperlinked-аннотации +
  curated Collections = **прямой blueprint нашей стратегии**. НО content-gap: Sefaria владеет *еврейскими
  религиозными текстами*, мы — *ивритской литературой* (ноль пересечения; Бен-Йехуда не в Sefaria и не
  будет). Sefaria не скаффолдит для language-learners. **Позиционирование: «Sefaria для современной
  ивритской литературы + изучающих язык».**
- **Uncertainties:** scope AI-фич (2025); точный объём Android vocab-gap + план фикса; долгосрочная
  монетизация ($44M цель); качество/покрытие Sheets; редакторский процесс переводов; roadmap
  производительности; покрытие историч. комментариев; глубина локализации не-English; BYOK/override
  данных (read-only API?); реальный retention vs MAU.
- **Sources:** sefaria.org (/texts /about /sheets /collections /topics /mobile /products); en.wikipedia
  Sefaria; App Store id1163273965; help.sefaria.org (navigation/definitions/vowels/mobile); github.com/
  Sefaria/Sefaria-Project; developers.sefaria.org (powered-by); Sefaria Strategic Plan PDF; JTA/Times
  of Israel (Talmud translation); causeiq/impala (financials).

---

## Cross-competitor паттерны (что повторяется)

1. **Подлинный контент как носитель** (LingQ/Beelinguapp-classics) > синтетические дриллы — но
   Beelinguapp размывает это AI-генерацией. *Наш канон = усиленная версия этого принципа.*
2. **Параллель + аудио-sync** — золотой стандарт восприятия (Beelinguapp); все имеют ту или иную
   подсветку. *У нас параллель есть, sync-подсветки нет.*
3. **Tap-lookup в потоке** — у всех (LingQ/Readlang/Beelinguapp/StoryHebrew/Sefaria); различие — в
   глубине (от headword до контекстного LLM). *Мы можем дать морфо-глубину, какой нет ни у кого.*
4. **Vocab-захват из чтения** (LingQ/Readlang/Beelinguapp) — но только LingQ делает corpus-wide
   статус. *У нас есть данные (overlay), но не показаны в чтении.*
5. **Discovery многоканален у лидеров** (Sefaria Topics/Collections/Calendars; LingQ trending/follow);
   слаб у Readlang/StoryHebrew/Beelinguapp. *Наш discovery — слабейшее место.*
6. **Офлайн-first** — выделяет Sefaria и Beelinguapp(загрузка); отсутствует у Readlang/LingQ-free.
   *Наш OPFS+ZIP = на уровне Sefaria.*
7. **Бизнес:** subscription (LingQ/Readlang/StoryHebrew/Beelinguapp) vs donation/free (Sefaria).
   *Наш гибрид: public-domain контент бесплатно, монетизация Студии/BYOK.*

## Hebrew-specific наблюдения
- **Никуд** реально регулирует только StoryHebrew; Sefaria toggle-ит огласовку; LingQ/Readlang/
  Beelinguapp — нет. *Мы имеем данные (Dicta niqqud) для full/partial/off.*
- **Морфология** (биньян/шореш/род-число-тенс) — **отсутствует у всех пяти** на уровне learner-tap.
  *Это наш главный Hebrew-моат (Dicta + Pealim 9279).*
- **RTL** доказан (Sefaria корректно, Beelinguapp арабский), но у LTR-native (LingQ/Readlang) —
  риск багов. *У нас RTL bidi-isolate отлажен.*
- **Транслитерация-как-скаффолд** — нет ни у кого. *У нас два профиля (SBL + рус-фонетика).*
- **Литературный/архаичный регистр** — никто не обслуживает (StoryHebrew избегает, Sefaria —
  религиозный, не светский). *Канон Бен-Йехуда = незанятая ниша.*

## Что конкуренты делают ЛУЧШЕ нас (по состоянию на 2026-06-08)
1. **Discovery/полки/Collections/редакторский голос** (Sefaria, LingQ) — у нас плоский список.
2. **Audio-text sync подсветка (karaoke)** (Beelinguapp, LingQ) — у нас аудио без sync-подсветки.
3. **In-reader статус слова (new/learning/known)** видимый в чтении (LingQ) — у нас данные есть, не показаны.
4. **«Next for you» / уровень-бейджи** (LingQ оценка, StoryHebrew CEFR) — у нас i+1 не превращён в рекомендацию.
5. **Прогрессивное раскрытие перевода** (Beelinguapp параллель; reveal-паттерны) — у нас бинарный column-toggle.
6. **Onboarding/first-run guided** (LingQ, Beelinguapp funnel) — у нас BYOK-tour без JS, нет first-run для Зала.
7. **Cost/usage прозрачность** — даже metered-конкуренты показывают лимиты; у нас ноль cost-прозрачности (BYOK).
8. **Лёгкий захват vocab в карточку в потоке** (Readlang) — у нас захват тяжелее (word-card модал).

## Что МЫ делаем лучше конкурентов
1. **Морфология на тапе** (корень/биньян/парадигма) — Pealim 9279 офлайн; нет ни у кого.
2. **Персональный i+1 frontier** на подлинном тексте — нет ни у кого для иврита.
3. **Двойная транслитерация с ударением** (SBL + рус-фонетика) — нет ни у кого.
4. **Никуд full/partial/off из данных Dicta** (StoryHebrew регулирует, но без морфологии).
5. **Офлайн-first + BYOK + provenance-инварианты** (R1/R4) — комбинация уникальна.
6. **Anki двусторонний sync** (большинство — только export или ничего).
7. **Конкорданс по всему корпусу** (`crosstext.js`) — Sefaria даёт ссылки, но не learner-конкорданс.

## Что НЕ копировать (свод)
- AI-генерация «graded» рассказов (Beelinguapp) — подлинность = моат.
- Агрессивные lookup-paywalls/дневные лимиты (LingQ).
- Браузерный низкокачественный TTS как основной (Readlang); подача TTS как «native» (Beelinguapp).
- Infinite-scroll memory-heavy читалка (Sefaria) → пагинация/lazy + разбивка по главам.
- 10 конкурирующих переводов (Sefaria) → 1–2 помеченных параллельных.
- Mobile/desktop неравенство (Sefaria Android) → паритет.
- Dark patterns: language-lock, блокирующий «rate app» (Beelinguapp).
- Тяжёлая геймификация/стрики как core (для чистого Зала — только лёгкое опционально).
- Community/social как core v1 (литературное чтение сольно) → отложить.

## Ограничения исследования (честно)
- **StoryHebrew** — карточка частично на inference (прямой браузинг help/app-store не выполнен в
  сессии); цены/объём/офлайн/SRS/RTL-edge-cases **требуют ручной верификации** перед использованием
  как факт. Это ближайший Hebrew-конкурент — стоит отдельной проверки.
- Все цены/метрики аудитории — публичные оценки на 2026-06-08, меняются часто.
- Web-поиск US-региональный; локальные (израильские) обзоры StoryHebrew/иврит-продуктов недоохвачены.
- Полный список источников и uncertainties — в каждой карточке выше.
