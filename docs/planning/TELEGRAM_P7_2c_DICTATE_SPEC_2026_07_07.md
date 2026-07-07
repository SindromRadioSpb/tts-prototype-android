# CLG-P7.2c — dictate:tg (аудио-диктант) spec (к коду)

> Третья production-модальность. Бот шлёт АУДИО огласованного слова → пользователь пишет иврит
> (консонантное написание). expected = ПИСЬМЕННАЯ форма. Диктант = НЕ context-supported (звук→
> написание, без смысла/контекста) → настоящая unsupported-production компетенция (в отличие от
> reverse=lexeme/cloze=context). Продолжение P7.2a/b (reverse+cloze SHIPPED).
>
> **Решение владельца 2026-07-07 (key-фок):** word-prebake офлайн + keyless-раздача. СЕРВЕРНОГО
> TTS-КЛЮЧА НЕТ (BYOK/no-server-key инвариант цел). Bake инкрементальный по eligible due-формам
> активных пользователей; вокализация+синтез ВНЕ интерактивного review-пути (мой BYOK-ключ, локально).
> Telegram: sendAudio по готовому mp3 + кеш file_id. **Нет готового audio-ассета → dictate-grade НЕ
> создаётся: selector идёт reverse/cloze/Зал.** После P7.2c → P7.2d selector на трёх модальностях.

## 0. Ключевой инвариант — assetKey совпадает ПО ПОСТРОЕНИЮ

`db/premium/ttsAssetKey.computeDictateAssetKey(vocalized)` — ЕДИНАЯ функция для offline-bake И
сервера (фикс-профиль he-IL-Wavenet-A, assetType='word'). Иначе сервер всегда «нет ассета» = тихий 0
(owner config-string-match-by-construction). Вход = ОГЛАСОВАННАЯ форма (TTS произносит верно).

## 1. Eligibility (сервер, БЕЗ синтеза — только проверка существования)

`dictateEligible(itemKey)`:
1. `keyingService.dictateFormForItemKey(itemKey)` → { vocalized (для assetKey/аудио), written
   (консонантная — expected) } | null. pid: → form.he (огласована) + stripNiqqud. lemma#pos →
   paradigm.lemma_niqqud (огласована) + консонантная лемма. null если нет надёжной огласовки.
2. assetKey = computeDictateAssetKey(vocalized); `audioRepo.hasAsset(assetKey)` (audio_assets ИЛИ
   файл на томе). Нет → dictate НЕ eligible (fallback). Есть → eligible.
Диктант выбирается ТОЛЬКО если ассет готов — синтез на review-пути ЗАПРЕЩЁН (owner).

## 2. Telegram audio-канал (api.js)

- `api.sendAudio(chatId, { assetKey?, fileId?, url?, caption? })`:
  - есть file_id (кеш) → sendAudio с file_id (без повторной загрузки);
  - иначе sendAudio с `audio`=публичный URL `<PROD_BASE>/api/audio/<assetKey>` (Telegram сам
    фетчит keyless-раздачу) → из ответа берём result.audio.file_id → кешируем.
  - Возврат { sent, messageId, fileId } — messageId для reply-binding, fileId для кеша.
- Кеш file_id: миграция 030 `telegram_file_cache (asset_key PK, file_id, created_at)` — file_id
  привязан к боту, не к пользователю (класс A, не PII).

## 3. Challenge / reviewer dictate-path

- миграция agent_challenges уже несёт expected_surface/anchor (029) — переиспользуем: dictate
  `expected_surface` = ПИСЬМЕННАЯ форма (консонантная), `shown_stimulus` = assetKey (класс A — TTS
  словаря, не текст пользователя), stimulus_source='dictate-tts', privacy_class='A'.
- CHALLENGE_CHANNEL_RE += dictate:tg. reviewer expected = (prompt_kind==='dictate' ? expected_surface
  : cloze ? expected_surface : displayForItemKey). evidence_scope='cell' (НЕ context-supported →
  dictate-успех ЗАЩЁЛКИВАЕТ hasProductionSuccess — это настоящая production-компетенция, канон D1).
- ktiv-gate (P7.0c) применяется: ktiv-male ответ на диктант → recorded:false (ложный lapse не минтится).
- всё остальное как P7.2a (claim/complete/release, chrev-id, reply-binding, privacy=A, flag).

## 4. grade-policy

dictate уже ∈ PRODUCTION_PREFIXES. evidence_scope='cell' НЕ ∈ CONTEXT_SUPPORTED_SCOPES → dictate-
успех защёлкивает hasProductionSuccess (последующий production-провал = настоящий lapse Again). Это
и есть канонический D1: dictate-провал на рецептивно-сильном (читает, не производит) → Hard(2).

## 5. Selector (mini; полный skill-selector = P7.2d)

selectEligible per due-word: cloze (двойной consent+найдено) → **dictate (ассет готов)** → reverse
(strictSafe) → Зал. Cooldown общий (exposure по item_key). P7.2d переупорядочит по навыку.

## 6. Bake-tool (offline, вне review-пути, мой BYOK-ключ)

`scripts/premium/bake-dictate-audio.js`:
- вход: список eligible due-форм активных пользователей (или частотный набор лемм); инкрементально —
  пропускать существующие ассеты.
- для каждой: vocalized = dictateFormForItemKey(...).vocalized (dataset lemma_niqqud; Dicta backfill
  для сложных — вне review-пути); assetKey = computeDictateAssetKey(vocalized); синтез mp3 (BYOK,
  ttsBake.js) → audio-cache/<assetKey>.mp3 + upsert audio_assets.
- пуш на прод-том (существующий механизм push audio) → keyless-раздача /api/audio/:assetKey.
- леджер/лог: сколько новых, сколько пропущено (не тихо).

## 7. Гейт `smoke:telegram-dictate` (+ регрессия)

Сид: user+link+consents + due-проекция + **предзасеянный audio_assets-ряд с assetKey =
computeDictateAssetKey(vocalized)** (эмулирует прошедший bake) + stub sendAudio (лог file_id).
Кейсы: 1. dictate выбран ТОЛЬКО при готовом ассете; assetKey совпадает (bake↔сервер by construction).
2. нет ассета → dictate НЕ выбран → fallback (reverse/cloze/Зал, не тихий 0). 3. sendAudio: первый
раз url→file_id кешируется, второй раз file_id (без url). 4. expected=ПИСЬМЕННАЯ форма: correct на
написании; ktiv-вариант → recorded:false (ложный lapse не минтится). 5. dictate-успех ЗАЩЁЛКИВАЕТ
hasProductionSuccess (в отличие от cloze/reverse) → последующий dictate-провал = Again (не Hard).
6. dictate-провал на рецептивно-сильном (без прошлого dictate-успеха) → Hard(2). 7. privacy=A
(assetKey не PII; reply-binding/single-use/детерминизм как P7.2a). 8. shown_stimulus=assetKey класс A
(не чистится как class-C).

## Инварианты

Запись ТОЛЬКО challenge-bound · dictate ТОЛЬКО при готовом ассете (синтез вне review-пути) ·
assetKey by construction (bake==сервер) · СЕРВЕРНОГО TTS-ключа НЕТ (BYOK инвариант) · dictate=
unsupported production (защёлкивает hasProductionSuccess, канон D1) · ktiv-gate (ложный lapse) ·
privacy=A · production-unlock webhook-trusted · file_id-кеш (без повторной загрузки).

---

## v1 → v2 адъюдикация критики wf_6732a80f (2026-07-07)

Критика (3 линзы: 6 BLOCKER + 8 MAJOR + 2 MINOR). ЗАМЕР омофон-покрытия (docs/research/
dictate-homophone-coverage): **~78% лемм dictate-безопасны** (звук→одно написание, консервативная
нижняя граница) → dictate ЖИЗНЕСПОСОБЕН с омофон-фильтром + fallback.

**[СДЕЛАНО] computeDictateAssetKey нормализует вход** (NFC+trim) — детерминизм ключа bake↔сервер.

**[К СБОРКЕ — clear fixes]:**
- [BLOCKER] hasAsset FILE-FIRST: fs.existsSync(DATA_DIR/audio-cache/<key>.mp3) — прод-push кладёт
  ФАЙЛ, не audio_assets-ряд; keyless-раздача тоже по файлу. DB-only = вечный тихий-0. Гейт сеет
  ФАЙЛОМ (прод-путь), не INSERT.
- [BLOCKER] омофон-фильтр eligibility: dictateFormForItemKey допускает лемму ТОЛЬКО если фонемная
  транскрипция → РОВНО одно написание в лексиконе (омофон-индекс; коллапс ת/ט,כ/ק/ח,ס/ש,א/ע/ה,ב/ו,
  matres). + write-gate: ЛЮБОЙ near_miss на dictate → recorded:false (не только ktiv).
- [BLOCKER] grader dictate-strict: strict=/^(cloze|dictate)/ (без проклитик-льготы; כלב→לב не accepted).
- [MAJOR] reviewer expected для dictate = chal.expected_surface = stripNiqqud(ТОЙ ЖЕ vocalized, что в
  computeDictateAssetKey) — из ОДНОГО источника dictateFormForItemKey; ветка prompt_kind==='dictate'.
- [MAJOR] evidence_scope fail-closed: production-challenge без явного scope → REJECT (не '||lexeme');
  dictate _capsFor evidence_scope='cell' литералом.
- [MAJOR] assetKey: ОБА пути (bake+сервер) берут vocalized ТОЛЬКО из dictateFormForItemKey (никакого
  Dicta-backfill-дивергенса, никакого ttsBake.keyForText assetType:'row'); вплести model_version
  датасета в ключ ИЛИ персистить baked assetKey. Гейт = НЕЗАВИСИМЫЙ ОРАКУЛ (реальный bake-tool, не
  та же функция; файл прод-путём).
- [MAJOR] PROD_BASE: env PUBLIC_BASE_URL валидируется на старте (dictate ON без https → fail-closed,
  не тихая отмена) ИЛИ хост из webhook-req.
- [MAJOR] file_id инвалидция: Telegram-ошибка битого file_id → удалить кеш-ряд + retry через URL;
  bot-id-биндинг + TTL. migration 030 telegram_file_cache (+bot_id).
- [MAJOR] selector два прохода: сперва ВСЕ due-items на dictate-eligible, потом reverse (анти-
  старвация) + телеметрия исходов (dictate_served/no_asset/reverse/none).
- [MINOR] audio_assets LRU/prune для dictate-набора (R16 рост тома); verdict expected для dictate.

**[OWNER-ФОК D-4 — hasProductionSuccess latch]:** dictate evidence_scope='cell' (не context-supported)
защёлкивает MODALITY-BLIND hasProductionSuccess → снимает D1-мягкость и у REVERSE того же слова. Но
dictate БОЛЕЕ cued (аудио даёт фонологию), чем reverse (смысл без подсказки) → слабее-cued успех
сертифицирует более сложную задачу. Развилка: (а) dictate тоже context-supported (не защёлкивает —
но тогда dictate не «доказывает production», теряя смысл); (б) MODALITY-СЕГМЕНТИРОВАННЫЙ
hasProductionSuccess/receptiveStrong (dictate-успех снимает D1 только для dictate-провалов, не для
reverse). Рекомендация: (б). ТРЕБУЕТ owner-решения (меняет grade-policy + поведение reverse).

**[OWNER-ФОК D-5 — bake-вход privacy]:** «due-формы активных пользователей» = кросс-тенант чтение
проекций (R14/R15) + набор слов течёт вокабуляром когорты. Рекомендация: bake-набор = ЧАСТОТНЫЙ/
курс-словарь лемм (не PII), не due-проекции. ТРЕБУЕТ owner-подтверждения.
