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

---

## Turnkey implementation checklist (сверено с живым кодом 2026-07-07 — точные якоря)

Порядок сборки dictate-канала (foundation + D-4 УЖЕ в main @ffd7dd8). Каждый пункт — с file:line.

### C1. Омофон-фильтр eligibility — `db/keyingService.js`
- Портировать `phon()`/`_buildPhonemeIndex` из `docs/research/dictate-homophone-coverage/2026-07-07/
  measure.js` (VOWEL-карта niqqud→гласная, FINAL-формы, consPhon-коллапс ת/ט,{ק,כ,ח}→k,{ס,ש}→s,
  {א,ע,ה}→'',{ב,ו}→v, matres י→''). Индекс: `Map(phonemicKey → Set(консонантный скелет))` по ВСЕМ
  парадигмам (lazy, invalidate в unloadNow как _vocFormIndex).
- В `dictateFormForItemKey` (сейчас проверяет только vocForm-однозначность): ДОБАВИТЬ проверку
  `phonIndex.get(phon(vocalized)).size === 1` — иначе `return null` (омофон → звук не задаёт написание).
- Экспорт уже есть. Замер: ~78% пройдут (docs/research/dictate-homophone-coverage/results.txt).

### C2. hasAsset FILE-FIRST — `db/audioRepo.js` (сейчас DB-only :88-92)
- Файл на томе = источник истины (прод-push кладёт mp3, НЕ audio_assets-ряд; keyless-раздача читает
  файл — server.js:9701 `path.join(AUDIO_CACHE_DIR, ak+'.mp3')`). AUDIO_CACHE_DIR импортируется
  server.js:20 (найти модуль-источник, напр. config/paths). hasAsset: `fs.existsSync(path.join(
  AUDIO_CACHE_DIR, assetKey+'.mp3'))` ПЕРВЫМ, DB-ряд — лишь ускоритель. Если audioRepo не должен знать
  том — сделать file-check в dictate-селекторе (review.js require config), НЕ в чистом DB-модуле.

### C3. grader dictate-strict + write-gate — `agent/grader.js` + `agent/reviewer.js`
- grader.js:155 `const strict = /^cloze(:|$)/` → `/^(cloze|dictate)(:|$)/` (без проклитик-льготы:
  כלב→לב не accepted). acceptedSkeletons(strict) уже параметризован.
- reviewer.js:182 write-gate: сейчас `if (verdict.provenance.reason === "ktiv-candidate")` → расширить:
  `|| (chal && chal.prompt_kind === "dictate" && verdict.decision === "near_miss")` → ЛЮБОЙ near_miss
  на dictate = recorded:false (омофон/lev1 звук не задал написание → не минтить ложный lapse).

### C4. reviewer dictate-ветка — `agent/reviewer.js`
- :49 `CHALLENGE_CHANNEL_RE = /^(reverse|cloze):tg$/` → `/^(reverse|cloze|dictate):tg$/`.
- :160 expected: `(chal && chal.prompt_kind === "cloze") ? chal.expected_surface : displayForItemKey`
  → `(chal && (chal.prompt_kind === "cloze" || chal.prompt_kind === "dictate")) ? chal.expected_surface
  : displayForItemKey`. (dictate expected = ПИСЬМЕННАЯ форма = chal.expected_surface = written.)
- :207 `meta.evidence_scope = chal.evidence_scope || "lexeme"` → FAIL-CLOSED: для production-challenge
  (chal && PRODUCTION_RE.test(channel)) без явного chal.evidence_scope → `return err("EVIDENCE_SCOPE_
  REQUIRED")` ДО записи (release challenge). Тогда `meta.evidence_scope = chal.evidence_scope`.
- dictate text-consent recheck (:138 cloze-ветка) — dictate класс A, НЕ добавлять.

### C5. api.sendAudio + file_id — `agent/telegram/api.js` + migration 030
- migration `030_telegram_file_cache.sql`: `telegram_file_cache (asset_key TEXT PK, file_id TEXT,
  bot_id TEXT, created_at)` (bot_id-биндинг → инвалидция при ротации токена).
- `api.sendAudio(chatId, { assetKey, url?, fileId?, caption? })`: file_id-кеш hit → sendAudio с
  file_id; miss → sendAudio `audio`=url (Telegram фетчит keyless-раздачу) → закешировать
  result.audio.file_id. ОШИБКА битого file_id (Telegram 400 'wrong file identifier'/'expired') →
  удалить кеш-ряд + retry через URL. Возврат { sent, messageId, fileId }.
- URL: env `PUBLIC_BASE_URL` (валидировать на старте: AGENT_REVIEW_WRITE=1 + нет https base →
  fail-closed лог, dictate не выбирается) ИЛИ хост из webhook-req. Новый repo `db/telegramFileCacheRepo.js`.

### C6. review.js selector 2-прохода + dictate caps + доставка — `agent/telegram/review.js`
- selectEligible (:61): ДВА прохода — сперва по ВСЕМ due-items искать dictate-eligible
  (dictateFormForItemKey + computeDictateAssetKey + hasAsset + !exposed), ТОЛЬКО потом reverse
  strictSafe (:66-74). Анти-старвация (иначе ранний reverse-годный item голодит dictate). Порядок:
  cloze (глобально) → dictate (2-й проход) → reverse → Зал. + телеметрия исходов (exposure/лог).
- _capsFor (:80): ветка pick.kind==='dictate' → review_mode='dictate:tg', prompt_kind='dictate',
  evidence_scope='cell' (ЛИТЕРАЛ, D-4), expected_surface=pick.written, shown_stimulus=pick.assetKey,
  stimulus_source='dictate-tts', stimulus_privacy_class='A' (НЕ class-C — не чистится purgeClassC).
- _deliverPrompt (:104): ветка dictate → api.sendAudio(chatId, {assetKey, url}) + ForceReply; НЕТ
  text-consent recheck (класс A). сохранить message_id (reply-binding как reverse/cloze).
- submitAnswer expected (:186): dictate → chal.expected_surface (как cloze); verdictFromResult
  isCloze→добавить isDictate ветку в format (verdict «Ожидалось: <написание>»).

### C7. bake-tool — `scripts/premium/bake-dictate-audio.js` (D-5: ЧАСТОТНЫЙ словарь, НЕ due-проекции)
- вход = частотный/курс-набор dictate-безопасных лемм (item_key[]); НЕ читать проекции юзеров.
- для каждой: `const {vocalized}=await keyingService.dictateFormForItemKey(itemKey)` (ОДИН источник!);
  `assetKey=computeDictateAssetKey(vocalized)`; skip если hasAsset (инкрементально); синтез
  `tb.synthesizeMp3(apiKey, vocalized, PROFILE)` где apiKey=process.env.GCP_TTS_API_KEY, PROFILE
  мапится из DICTATE_TTS_PROFILE (voiceName he-IL-Wavenet-A, rate 1.0, pitch 0.0); write
  audio-cache/<assetKey>.mp3. Модель: bake-canon-audio.js:97-115.
- push: как push-canon-audio.js — POST /api/audio/cache/upload {assetKey, mp3Base64} с
  X-Audio-Upload-Token=AUDIO_UPLOAD_TOKEN. Лог: new/skipped/failed (НЕ тихо). NB: computeDictateAssetKey,
  НЕ ttsBake.keyForText (тот assetType:'row' → другой ключ!).

### C8. Гейт `smoke:telegram-dictate` — НЕЗАВИСИМЫЙ ОРАКУЛ (не тавтология)
- Переиспользовать telegram-cloze-smoke harness (stub, recv, startPrompt, resetState). НО:
- ассет сеять ФАЙЛОМ на том (fs.writeFile audio-cache/<key>.mp3), НЕ INSERT audio_assets (прод-путь!).
- assetKey вычислять из itemKey ОБЕИМИ сторонами независимо (реальный bake-путь vs сервер) → assert
  байт-равенство (config-string-match, не общая переменная).
- Кейсы: dictate выбран ТОЛЬКО при файле-ассете; нет файла → fallback reverse (не тихий-0);
  омофон-лемма → dictate НЕ выбран (eligibility); expected=написание (correct-on-written; near_miss/
  омофон → recorded:false); dictate-успех защёлкивает hasProvenProduction для DICTATE, но reverse-
  провал после → всё ещё Hard (D-4 контраст на живом пути); sendAudio url→file_id кеш→file_id;
  privacy=A (shown_stimulus=assetKey не чистится); reply-binding/single-use как P7.2a.
- Регрессия: grade-policy 28 · agent-review 66 · telegram-review 32 · telegram-cloze 21 · pairing 33 ·
  content 15 · memory-canon 63 · server-keying 24. → commit+push deploy dormant.
