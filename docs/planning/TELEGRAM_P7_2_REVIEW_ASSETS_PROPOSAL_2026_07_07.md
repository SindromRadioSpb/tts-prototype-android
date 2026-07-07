# CLG-P7.2 — Server Review Assets + мультимодальный challenge-bound review (проектное предложение)

> Владелец 2026-07-07 предложил концепт «серверная плоскость учебных стимулов» вместо синхронизации
> всего OPFS (концепт в чате). Adversarial-критика спеки P7.2-v1 (wf_ebf8a550) поймала фундаментальную
> проблему: **текстовый Telegram + сервер-знает-только-ивритскую-форму → наивный «покажи слово» =
> показать ответ → ложный production-успех отравляет D1 навсегда.** Это предложение — заземлённый
> в живом коде ответ (research wf_56ed38f5, 4 линзы, R10 measure-before-code). Заменяет
> TELEGRAM_P7_2_REVIEW_SPEC_2026_07_07.md v1 (та спека остаётся как «наивная, отклонена критикой»).

## 0. Главный вывод research (меняет стоимость)

**Русский глосс на слово УЖЕ на сервере.** `public/data/inflection/pealim-infl-v12.json.gz` несёт
поле `meaning` (RU) на каждой из 9279 парадигм (`pealim-infl-v12.meta.json:5-8`); `keyingService`
уже гунзипит и резолвит через ТО ЖЕ ядро `notes-autogen.js`, что породило OPFS-заметки
(`keyingService.js:91-111,172-218`); `resolveWord().body.meaning` возвращает глосс + confidence-тир
(`notes-autogen.js:309-355`). Sense-дизамбигуация гомографа уже решена детерминированно: form-first
lookup — один `pealim_id` → decisive; несколько → `ambiguous:true`+`alts`, никогда не «точно»
(`notes-autogen.js:133-178`; collision_count=4049 реальных гомографов). «Нет честного стимула»
уже детектируется (no-meaning → SUSPECT; `notes-autogen.js:258`).

**Следствие:** **`reverse:tg` (RU-глосс → HE) — САМАЯ честная И самая ДЕШЁВАЯ модальность.** Prompt =
русский смысл (НЕ ответ), ответ = ивритская форма — настоящее production-припоминание. Данные ready,
резолвер ready, дизамбигуация ready, honesty-детект ready. Не нужны ни аудио, ни синхронизированные
предложения. Это **переворачивает стадирование** из концепта владельца (там gloss = «2-3 слайса»):
reverse дешевле, потому что gloss-плоскость СТРОИТЬ НЕ НАДО — она уже есть.

## 1. Матрица модальностей (ready/adapt/build по research)

| Модальность | Prompt (≠ответ) | Данные сервера | Итог | Стоимость |
|---|---|---|---|---|
| **reverse:tg** RU→HE | RU-глосс | pealim `.meaning` **ready** + резолвер **ready** + дизамбигуация **ready** | нужен только item_key→meaning индекс (зеркало `_pidLemma`) + challenge-core | **ADAPT — низкая** |
| **cloze:tg** контекст | предложение с пропуском + RU-перевод | примитивы **ready** (`buildClozeForTarget`, `getSentenceContext`, grader), НО **нет якоря due→предложение** на сервере (srs_projections=item_key only; review_log стрипает surface; якорь в браузерном word_status) | построить реконструкцию якоря + bundle-scan + expected=ПОВЕРХНОСТЬ | **BUILD — средняя, покрытие частично** |
| **dictate:tg** аудио→письмо | аудио вокализованной формы | раздача `/api/audio/:assetKey` **ready** + asset-key **ready** + «niqqud wins» **ready**, НО синтез весь BYOK (серверного keyless ключа НЕТ; ttsClient мёртв), нет item_key→niqqud моста, нет word-bake, нет sendVoice/file_id | серверный TTS-ключ ИЛИ word-prebake + Dicta-огласовка + Telegram-аудио-канал + eligibility (омонимы/ktiv) | **BUILD — высокая (инфра)** |
| **deep-link в Зал** | — | всегда доступен; «нет честного стимула» уже детектируем | fallback, без grade | **ready (P6.5 ▶-кнопки)** |

## 2. Архитектура: минимальная ДЕРИВИРУЕМАЯ капсула (не тяжёлые таблицы)

Research показал: для `reverse:tg` всё стимул-сырьё **деривируется на лету** из уже-lazy-загруженного
`keyingService` — новой персистентности НЕ нужно. «Капсула» стимула:
```
{ item_key, expected (HE-форма, displayForItemKey), gloss (RU, resolveWord.body.meaning),
  sense_id (pealim_id), confidence, ambiguous, eligible }
```
Всё — из `keyingService` (`displayForItemKey` + новый `glossForItemKey`). **Персистируется только
то, что доказывает shown-vs-graded**: строка `agent_challenges` несёт `prompt_kind` + `shown_stimulus`
(сам показанный RU-глосс / audio_asset_key / cloze-текст — класс A идентификатор задания, для аудита
и для инварианта «показанное ≠ ожидаемое»). Аудио/cloze добавят `audio_asset_key`/`sentence_anchor`
позже — те же поля капсулы, опциональные.

**Тяжёлую таблицу `review_assets`/`lexeme_senses` НЕ строим** (research: gloss-реестр = офлайн gz,
резолвер lazy; SQL-дублирование не нужно). Это дешевле концепта владельца и без роста хранилища.

## 3. Challenge-binding v2 (спека + 4 BLOCKER-фикса критики встроены)

Миграция `028_agent_challenges.sql`:
```
challenge_id PK · user_id · telegram_user_id · telegram_chat_id · item_key · review_mode (channel) ·
prompt_kind ('reverse'|'cloze'|'dictate') · shown_stimulus TEXT (показанный prompt — RU-глосс /
cloze-текст / audio_asset_key) · expected_form_id · claimed_attempt_id TEXT · status
(active|completed|expired|cancelled) · created_at · expires_at · completed_at
```
partial-UNIQUE `(user_id) WHERE status='active'`.

**BLOCKER-фиксы (адъюдикация wf_ebf8a550):**
1. **single-use claim ВНУТРИ reviewer, не в review.js:** reviewer атомарно `UPDATE ... active→completed
   WHERE challenge_id AND status='active'` (changes==1) как ЕДИНЫЙ авторитет; `claimed_attempt_id`
   записывается; reviewer требует `args.attempt_id === challenged.claimed_attempt_id` для completed →
   replay ловится ledger-идемпотентностью, а не повторным принятием challenge. Закрывает
   «завершённый challenge = многоразовый production-токен».
2. **детерминированный review-id по challenge:** `id = 'chrev:'+sha1(challenge_id)` (не grade-time
   timestamp) → любой resend схлопывается INSERT OR IGNORE. Закрывает «un-claim + resend = дубль».
3. **запрет challenge_id + production на `/api/agent/review`:** production-путь ТОЛЬКО через
   `agent/telegram/review.js` (webhook, server-trusted); HTTP-эндпоинт стрипает/реджектит
   challenge_id и production-каналы (остаётся рецептив-only как P7.0c).
4. **prompt≠answer eligibility (структурно):** challenge создаётся ТОЛЬКО если `shown_stimulus` не
   раскрывает `expected` — для reverse: gloss ≠ HE-форма by construction; eligibility-гейт отклоняет
   ambiguous/no-meaning/low-confidence (иначе deep-link в Зал). Гейт СИДИТ leak-capable кейс:
   стимул содержит expected → challenge НЕ создаётся.

Плюс MAJOR-фиксы: claim ТОЛЬКО на write-ветке (MNAR/ktiv/flag-off оставляют challenge active —
не сжигают на опечатку); review-answer дескриптор с `answerText` (не `.text` — не эхнуть сырой
ответ); сырой ответ НЕ в `bot_action_log.command` (фикс-метка 'review-answer'); skip-семантика
на production (владельческое решение — см. §6); revokeCascade гасит active challenges; router не
импортит challenge-writer (read-детект через ctx из server.js).

## 4. Eligibility-гейты (что делает review ЧЕСТНЫМ)

- **reverse:tg** — только `resolveWord` decisive (не ambiguous) + confidence ≥ порог + meaning есть;
  ambiguous гомограф → нельзя (RU-глосс одного значения нечестен для многозначной формы) →
  следующий item или deep-link. Сигналы ready (`notes-autogen.js:329-342`, `keyingService.js:210-211`).
- **dictate:tg** — только вокализованная однозначная форма (не омоним, известный ktiv); неоднозначно
  → воздержание, НЕ lapse. Сигнал омонимии ready; niqqud для lemma#pos — Dicta (build).
- **cloze:tg** — только если найдено synced-предложение с вхождением (двойной consent) + expected=surface.
- **fallback:** нет честного стимула → «▶ Тренировать в Зале» (deep-link), БЕЗ grade. Всегда доступен.

## 5. Premium modality selector (что делает наставника премиальным)

Сигналы навыка **уже готовы** и уже управляют `recommended_channel` в /plan:
`productionImbalance` (`planner.js:63`), `getRecentStruggles` prod_fails (`learnerGraphRepo.js:123`),
`channelGapConstruct` reading_to_dictation vs reading_to_reverse (`constructs.js:68`), `channelStats`
(`learnerProjectionRepo.js:53`). Selector выбирает модальность per-item:
```
reading стабильно + reverse слаб + есть надёжный gloss  → reverse:tg
production-провал + вокализована + не омоним + аудио     → dictate:tg
недавно в synced-тексте + consent                        → cloze:tg
нет честного стимула                                     → deep-link в Зал
```
И агент **объясняет выбор** («в чтении устойчиво, а произвести форму не пробовал — дам RU→HE») —
это и есть ощущение личного наставника (инсайт владельца). Селектор — ADAPT (сигналы есть, связать
в per-item eligibility). Ограничение research: «слаб слух» отдельно не отслеживается (channelStats
сворачивает read+listen) — dictate выбирается по production-провалу, не по слушательной слабости.

## 6. Открытые владельческие решения (до кода P7.2b+)

- **skip=Again(1) на production-канале** (критика MAJOR): честное «Не знаю» → Again(1) (полный lapse),
  а неверная догадка → Hard(2) (D1-смягчение). Инверсия стимулов (карает честность). Решить: либо
  skip на production → тот же D1-путь (Hard при рецептивной силе), либо оставить 1 и не показывать
  production-challenge рецептивно-сильным в MVP. **Рекомендация: skip на production → D1-Hard** (честнее).
- **sense-политика для reverse:** какой pealim_id пускать в стимул, если LemmaCanon схлопнул гомограф
  (research gap). Рекомендация: только decisive item_key (один sense) → reverse; многозначные → cloze/аудио/Зал.
- **dictate niqqud-источник:** Dicta-огласовка lemma#pos (сетевая, degradable) — приемлема ли задержка/
  зависимость, или word-prebake только огласованных decisive-форм.

## 7. Ревизованное стадирование (заземлённая стоимость)

- **P7.2a — reverse:tg + challenge-binding core (MVP).** item_key→meaning индекс (мелочь) +
  eligibility-гейт (decisive/confidence) + миграция 028 + agentChallengeRepo + reviewer production-unlock
  challenge-bound + 4 BLOCKER-фикса + review.js (startReview/submitAnswer) + verdict-формат + «Не знаю» +
  гейт smoke:telegram-review + deploy dormant → владельческий флаг ON → live-verify. **Честный премиальный
  review без аудио и предложений. ~1 крупный слайс** (challenge-core — основная работа, gloss почти бесплатен).
- **P7.2b — cloze:tg.** Реконструкция якоря due→предложение (bundle-scan за двойным consent) +
  expected=surface + buildClozeForTarget-сборка. Reading-first премиум, но покрытие частично. **~1 слайс.**
- **P7.2c — dictate:tg (аудио).** Серверный TTS-ключ ИЛИ word-prebake decisive-форм + Dicta-огласовка +
  Telegram sendVoice/file_id-кеш + ledger kind='tts_chars' + eligibility (омонимы/ktiv) + LRU audio-cache.
  **~1-2 слайса (инфра).**
- **P7.2d — premium modality selector.** Per-item выбор по сигналам навыка + объяснение выбора. **~1 слайс.**

Итого 4-5 слайсов вместо 6-10 из концепта — потому что gloss-плоскость уже есть, а капсула деривируется.

## 8. Стоимость эксплуатации (валидация чисел владельца)

- **reverse (P7.2a):** глосс из офлайн-датасета → **$0 API** (ни TTS, ни Translate — meaning уже в gz).
- **dictate (P7.2c):** research подтверждает — WaveNet 4M симв/мес бесплатно; 20 юзеров × слова ≈
  180K симв/мес → в бесплатном лимите; предложения ≈ 1.26M → ~$4/мес Neural2 или $0 WaveNet. Telegram
  file_id-реюз (`core.telegram.org/bots/api`) убирает повторную загрузку. Кеш-раздача уже keyless.
- **Хранилище:** аудио ≈ центы/мес; НО research-риск: **нет LRU-эвикции audio-cache** (`audioRepo.js:88`
  touch без DELETE) — при word-синтезе кеш растёт на volume 1536MB (делимом с keyingService ~306MB).
  P7.2c обязан добавить LRU.
- **Разработка** — основная цена (как в концепте). Runtime для первых десятков юзеров ≈ $0-5/мес.

## 9. Рекомендация

**Начать с P7.2a = reverse:tg + challenge-binding core.** Это (1) закрывает BLOCKER модальности
честным стимулом (RU-глосс ≠ ответ), (2) почти бесплатно по данным (gloss ready), (3) строит
challenge-binding + 4 фикса, которые нужны ВСЕМ модальностям, (4) даёт настоящий production-review
в боте сразу. Аудио (P7.2c) и cloze (P7.2b) — премиальные надстройки на готовом фундаменте, каждая
своим слайсом; selector (P7.2d) — когда ≥2 модальности живы. Fallback «в Зал» — всегда, для честности.

Инварианты через все слайсы: запись ТОЛЬКО challenge-bound · stimulus доказуемо ≠ expected ·
grader детерминированный (LLM недостижим) · privacy=A (сырой ответ не персистится) · consent
recheck перед write · флаг AGENT_REVIEW_WRITE = владельческий, dormant до live-verify каждой модальности.
