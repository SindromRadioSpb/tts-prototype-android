# 03 · Технические энейблеры: MCP-серверы, API и данные для иврит-обучения через Hermes

> **Что это:** веб-исследование (технический скаутинг) — какие MCP-серверы, API и внешние датасеты можно подключить к личному агенту Hermes (NousResearch hermes-agent, MCP: stdio / StreamableHTTP / SSE, конфиг `~/.hermes/config.yaml` → `mcp_servers`), чтобы расширить изучение иврита поверх уже подключённого LinguistPro (SRS/due-слова, тексты песен, read-only MCP-мост).
> **Как получено:** WebSearch/WebFetch, сессия 2026-07-21. Статус: **raw research** (утверждений «в проде проверено» нет — только вебданные). Редактировать можно свободно; кэшей/скретча у отчёта нет.
> **Источник-команда:** запрос владельца «tech-scout: MCP/API/данные для иврит-обучения» (серия hermes-education-scaleup, документ 03).

---

## 0. Контекст: что умеет hermes-agent

- Открытый агент Nous Research: терминальный agent-loop + память + skills + **60+ встроенных тулов + MCP-клиент** (stdio, HTTP/StreamableHTTP, SSE). Тулы внешних MCP-серверов регистрируются в общий tool-registry; есть `supports_parallel_tool_calls`. Также умеет сам выступать MCP-сервером (`hermes mcp serve`). Каталог одобренных MCP — `optional-mcps/` в репо.
  - Репо: https://github.com/NousResearch/hermes-agent · Доки MCP: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
- Практический вывод: **любой REST API оборачивается в тонкий локальный MCP-сервер за вечер** (Python FastMCP/Node), поэтому «нет готового MCP» ≠ блокер, а лишь +1 ступень сложности.

---

## 1. ГОЛОС: ASR, TTS, произношение, realtime

### 1.1 ivrit.ai — главный актив направления ⭐

- **Что даёт:** нон-профит «сделать иврит first-class в AI». Крупнейший ивритский аудио-датасет — **>22 000 часов** (июль 2025), лицензирован **в т.ч. для коммерческого обучения моделей, бесплатно**. Модели на HuggingFace:
  - `ivrit-ai/whisper-large-v3` и `ivrit-ai/whisper-large-v3-turbo` (апрель 2025; turbo обучен на crowd-transcribe-v5, ~300 ч краудсорс-транскрипций) — SOTA открытый иврит-ASR; варианты **CT2 (faster-whisper), GGML (whisper.cpp), ONNX** → локальный инференс на CPU/GPU.
  - Датасеты: `crowd-transcribe-v5` (225k сэмплов), VoxKnesset/knesset-plenums (парламентские записи), pyannote-диаризация.
  - Бесплатный транскрайбер: https://transcribe.ivrit.ai/
- **Зрелость:** prod (модели активно обновляются, Interspeech-2025 публикация).
- **Интеграция:** готового «ивритского» MCP нет → путь: self-host faster-whisper c ivrit-ai CT2-весами + тонкая MCP-обёртка; либо взять generic Whisper-MCP (см. 1.2) и подменить веса.
- Ссылки: https://www.ivrit.ai/en/ivrit-ai-2/ · https://huggingface.co/ivrit-ai · статья: https://arxiv.org/abs/2307.08720 · сравнение с Amazon Transcribe: https://medium.com/@DormanDaniel/comparing-whisper-whisper-ft-and-amazon-transcribe-for-hebrew-e297846bdd24

### 1.2 Готовые ASR MCP-серверы (generic)

| Сервер | Что даёт | Зрелость | Путь |
|---|---|---|---|
| [arcaputo3/mcp-server-whisper](https://github.com/arcaputo3/mcp-server-whisper) | транскрипция через OpenAI API (Whisper/GPT-4o-transcribe), авто-сжатие >25MB | prod (PyPI, октябрь 2025) | MCP готов; иврит — среднее качество ванильного Whisper |
| [SmartLittleApps/local-stt-mcp](https://github.com/SmartLittleApps/local-stt-mcp) | локальный whisper.cpp, офлайн | beta (Apple Silicon-центричный) | MCP готов; можно подложить ivrit-ai GGML |
| Voice Recorder / Audio Transcriber (playbooks.com/mcp) | запись+транскрипция | beta | MCP готов |

**Облачные STT с ивритом:** Google STT `he-IL` (GCP-ключи уже есть в проекте), Azure STT `he-IL`, OpenAI Whisper API, **ElevenLabs Scribe STT** (заявляют сильный иврит: https://elevenlabs.io/speech-to-text/hebrew). Все — REST, платно по минутам.

### 1.3 TTS иврита (в приложении уже есть Google TTS)

- **ElevenLabs** — по обзорам лучшее естественное звучание иврита среди облаков; REST API, платно. https://elevenlabs.io/text-to-speech/hebrew
- **OpenAI TTS** — иврит «с тяжёлым американским акцентом», практически непригоден (отзыв community). https://community.openai.com/t/real-time-voices-for-tts-api-specifically-hebrew-support/1064592
- Снапшот-обзор провайдеров иврит-TTS: https://github.com/danielrosehill/Hebrew-TTS-Providers
- **Phonikud (2025)** ⭐ — открытый Hebrew G2P → полный IPA (включая ударение!), лёгкие адаптеры поверх никуд-модели, ONNX; + датасет ILSpeech; позволяет **локальный real-time иврит-TTS** (Piper-класс). MIT-дух, активный. https://github.com/thewh1teagle/phonikud · https://arxiv.org/abs/2506.12311 · демо/ресурсы: https://phonikud.github.io/

### 1.4 Speech-scoring / оценка произношения — ГОТОВОГО НЕТ (ключевой факт)

- **Azure Pronunciation Assessment: иврит НЕ входит** в 33 поддерживаемых локали (проверено по таблице docs). https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=pronunciation-assessment
- **Speechace, SpeechSuper — иврита нет** (EN/ES/FR/DE/ZH/KO/JA/RU). https://docs.speechace.com/ · https://www.speechsuper.com/
- **Честный инженерный путь (M/L):** ivrit-ai ASR c пословными таймстампами (whisper-timestamped/stable-ts) + forced alignment (CTC-aligner, torchaudio MMS_FA) + эталонная фонемизация через Phonikud (IPA с ударением) → сравнение фонем/ударений + LLM-фидбек. Это самосбор, не продукт; но все компоненты открыты.

### 1.5 Realtime voice для агентов

- **Gemini Live API** — 97 языков, **иврит поддержан** (код `iw`); native-audio модели умеют переключать языки на лету. У проекта уже есть Gemini-ключи (BYOK/AGENT_GEMINI_API_KEY — R16-лимиты!). https://ai.google.dev/gemini-api/docs/live-api
- **OpenAI Realtime API** (окт. 2024) — speech-to-speech; иврит формально работает, но акцент голосов — известная жалоба.
- Оговорка: hermes-agent — текстовый loop; realtime-голос — отдельный websocket-пайплайн, MCP тут не транспорт. Реалистичный первый шаг: **асинхронный голос** (голосовое сообщение → ASR → агент → TTS-ответ), а не full-duplex.

---

## 2. МУЗЫКА / ПЕСНИ (пользователь учит через ивритские песни)

### 2.1 Тексты песен

| Источник | Что даёт | Лицензия/цена | Интеграция |
|---|---|---|---|
| **LRCLIB** ⭐ https://lrclib.net | ~3 млн текстов, **синхронизированные LRC + plain**, `GET /api/get?artist_name&track_name&duration`, `/api/search` | полностью бесплатно, без ключа, FOSS-дружественно | REST → тривиальная MCP-обёртка; покрытие израильской поп-музыки частичное — проверять по своему плейлисту |
| **Genius API** https://docs.genius.com | поиск, метаданные, аннотации сообщества | бесплатно (OAuth) | ⚠ полных текстов В API НЕТ (только скрейпинг lyricsgenius — серая зона TOS) |
| **Musixmatch API** | крупнейший лицензированный каталог, **Rich Sync** (пословная синхронизация) | free-план ~30% текста + лимиты; полный доступ — enterprise, цена по запросу | REST; официально-легальный путь к синк-текстам |
| **Shironet** (shironet.mako.co.il) | крупнейшая база ивритских текстов, платит роялти ACUM | API НЕТ; скрейпинг юридически чувствителен | как справочник-ссылка из карточки песни; маппинг через Wikidata **P4035 «Shironet song ID»** https://www.wikidata.org/wiki/Property:P4035 |
| Kaggle «Hebrew songs lyrics» (guybarash) | офлайн-датасет ивритских текстов | условия Kaggle, исследовательское | офлайн-датасет для экспериментов |
| Python `syncedlyrics` https://pypi.org/project/syncedlyrics/ | агрегатор Musixmatch/LRCLIB/NetEase/Megalobiz | OSS | либа → обёртка |

### 2.2 Spotify / YouTube MCP

- **Spotify MCP** — зрелая ниша: [marcelmarais/spotify-mcp-server](https://github.com/marcelmarais/spotify-mcp-server), [igorgarbuz/spotify-mcp](https://github.com/igorgarbuz/spotify-mcp) и десятки других (PulseMCP). Возможности: плейлисты CRUD, playback, поиск. Требует **Spotify Premium** + свой developer-app. ⚠ Endpoints `audio-features`/`recommendations` закрыты для новых приложений с ноября 2024 — «умные рекомендации по звуку» через API больше не собрать.
- **YouTube transcript MCP** — готовых много: [kimtaeyoon83/mcp-server-youtube-transcript](https://github.com/kimtaeyoon83/mcp-server-youtube-transcript), yt-dlp-based варианты, Apify-акторы (SRT/VTT/JSON, таймстампы, 100+ языков, без ключа в простых вариантах). Связка «песня → клип на YouTube → субтитры с таймстампами» работает сегодня.
- Образовательная механика, которую это включает: due-слова из LinguistPro × плейлист → агент находит **строку песни с due-словом + синк-таймстамп** → микро-упражнение «услышь/допой слово» (retrieval в живом контексте, прямое усиление reading-first моата аудио-каналом).

---

## 3. ИВРИТ-НЛП И СЛОВАРИ

### 3.1 Dicta — что ЕЩЁ есть (в приложении уже используется Dicta-морфология)

- Портал тулов: https://dicta.org.il/tools?lang=en · страница для разработчиков: https://dicta.org.il/developers
- **Nakdan API** — автоматический/полуавтоматический никуд, режимы Modern/Rabbinic/Poetic: https://nakdan.dicta.org.il/api (публичный endpoint, JSON). Для учебных карточек песен — прямой апгрейд.
- **DictaBERT-семейство** (HF `dicta-il`): morph-теггер, лемматизация, OtoBERT (суффигированные формы) — офлайн-модели.
- **DictaLM 2.0 / 2.0-instruct** — открытый ивритский LLM (Mistral-7B, 200B токенов, токенайзер сжат до 2.76 ток/слово): https://huggingface.co/dicta-il/dictalm2.0-instruct — локальный «ивритский объяснятель» без облака (R16-friendly).
- Библейские/талмудические поисковики, Tiberias-классификатор, расширитель аббревиатур — та же экосистема.

### 3.2 Sefaria — ОФИЦИАЛЬНЫЙ hosted MCP ⭐ (нулевая стоимость подключения)

- **Два официальных сервера:** тексты — `https://mcp.sefaria.org/sse`; developer-API — `https://developers.sefaria.org/mcp`. Хостятся Sefaria, бесплатно, open data; ~15 тулов (поиск, точные цитаты, комментарии). Док: https://developers.sefaria.org/docs/the-sefaria-mcp
- Ценность для песен: израильская поэзия/песни насыщены библейскими аллюзиями — агент мгновенно вытаскивает интертекст; плюс словари на платформе (Klein — этимология современного иврита, Jastrow, BDB).
- Community-варианты: [Sivan22/mcp-sefaria-server](https://github.com/Sivan22/mcp-sefaria-server), официальный FastMCP: https://github.com/Sefaria/sefaria-mcp

### 3.3 Словари и частотность

- **kaikki.org Hebrew (wiktextract)** ⭐ — весь англ. Wiktionary по ивриту как **JSONL 52 МБ**: значения, флексии, произношение, этимология. CC BY-SA. Идеальный офлайн-lookup-датасет для агента: https://kaikki.org/dictionary/Hebrew/index.html
- **wordfreq (rspeer)** — частоты иврита (Wikipedia+OpenSubtitles+SUBTLEX+Twitter+OSCAR), Python: https://github.com/rspeer/wordfreq · субтитровые 50k-списки (CC BY-SA): https://invokeit.wordpress.com/frequency-word-lists/ — приоритизация: «какие 500 слов покрывают твой плейлист».
- **Hebrew WordNet (MILA)** — MultiWordNet-выровненный (EN/IT/ES), free non-commercial; доступность сайта нестабильна: http://mila.cs.technion.ac.il/resources_corpora.html — статус dataset/legacy.
- **MILA корпуса** — ~20 корпусов + Hebrew Treebank (6500 морфо-размеченных предложений) — исследовательское, non-commercial.
- **Мастер-хаб ресурсов:** https://github.com/NNLP-IL/Hebrew-Resources · https://resources.nnlp-il.mafat.ai/ (Melingo ICA, Eyfo, AlmaReader, verbit и др.).

---

## 4. КОНТЕНТ-ПОТОКИ (лёгкий иврит, подкасты, YouTube)

### 4.1 Новости на лёгком иврите — все ПЛАТНЫЕ ПОДПИСКИ, API нет

| Издание | Уровень | Формат |
|---|---|---|
| **Yanshuf / Bereshit** (Hebrew Today) https://hebrewtoday.com/ | advanced / beginner | газета с никудом + аудио + словарики; подписка |
| **E-Tone** (Ulpan-Or) https://www.ulpanor.com/self-study/e-tone/ | 3 уровня | еженедельник по материалам израильских СМИ |
| **Simaniya** https://simaniyanews.com/en/ | 3 уровня | ежемесячник с никудом + TTS-озвучка |
| Jerusalem Post Ivrit | базовый+ | ежемесячный журнал |

Интеграционный путь: подписка → PDF/сайт → ручная загрузка в Зал; автоматизации (RSS/API) нет — ценность выше как «источник текстов для импорта», не как поток для агента.

### 4.2 Подкасты

- **חיות כיס / Hayot Kis** (Кан, экономика, с 2016, ~30 мин): https://www.kan.org.il/content/kan/podcasts/p-8127/ — **официальных транскриптов нет** → пайплайн: RSS → ivrit-ai ASR → транскрипт → импорт в Зал (это же тест-кейс для 1.1).
- **Streetwise Hebrew** (TLV1, Guy Sharett): https://www.streetwisehebrew.com/ — эпизоды «о самом иврите» (сленг/этимология); транскрипты — Patreon; сторонний поиск по транскриптам: https://www.tapesearch.com/podcast/streetwise-hebrew/704434205
- Каталог ивритских подкастов: https://podcastim.org.il/

### 4.3 YouTube

- Каналы с иврит-субтитрами: **Кан-подкасты** https://www.youtube.com/@KANPodcasts (авто-сабы + часть ручных), сеть **Easy Languages** (двухъязычные вшитые сабы; иврит-выпуски в рамках сети: https://en.wikipedia.org/wiki/Easy_Languages_(YouTube)), обзоры каналов: https://hebrewglot.com/en/blog/hebrew-youtube-channels-2026
- Съём субтитров: YouTube-transcript MCP из 2.2 (SRT/VTT + таймстампы) — готово из коробки.
- Generic RSS-ридер MCP-серверы существуют (PulseMCP каталог) — S-сложность для «дай свежие эпизоды подкастов».

---

## 5. ОБЩИЕ УЧЕБНЫЕ MCP

### 5.1 Anki (экосистема 2025 — зрелая)

- [ankimcp/anki-mcp-server](https://github.com/ankimcp/anki-mcp-server/) — «официальный» комьюнити-сервер; интерактивные карточки/квизы/cloze c FSRS, рендер inline (MCP Apps).
- [samefarrar/mcp-ankiconnect](https://github.com/samefarrar/mcp-ankiconnect) (PyPI, апрель 2025), nailuoGG/anki-mcp — все требуют **запущенный Anki + аддон AnkiConnect (id 2055492159)** → это desktop-only петля.
- Связка с проектом: LinguistPro уже экспортирует .apkg и мёржит review-логи → агент через Anki-MCP мог бы вести ревью прямо в чате; но ⚠ R17/R11: не создавать второй источник истины о памяти — писать назад только через существующий merge-путь.

### 5.2 Календарь / привычки

- **Официальный Google Calendar MCP**: `calendarmcp.googleapis.com` — https://developers.google.com/workspace/calendar/api/v3/reference/mcp (+ зрелые community-серверы, OAuth2). Habit-петля «встреча-с-ивритом» / напоминания.
- Примечание: у продукта уже есть Telegram-нуджи (P7.3) — календарь-MCP это дополнение персонального агента, не замена продуктовой петли.

### 5.3 Заметки

- **Notion MCP (официальный, hosted)**: https://developers.notion.com/guides/mcp/overview · https://github.com/makenotion/notion-mcp-server
- **Obsidian MCP** — через плагин Local REST API (vault локально): https://www.pulsemcp.com/servers/anpigon-obsidian-omnisearch
- Ценность: личный «дневник иврита» (заметки о песнях, разборы) в среде, которую агент читает/пишет.

---

## 6. ПРАКТИКА ПИСЬМА: орфография, грамматика, никуд

- **Dicta Nakdan API** (см. 3.1) — прод-качество автоникуда; де-факто стандарт. https://nakdan.dicta.org.il/api
- **Phonikud** (см. 1.3) — никуд+ударение+IPA, ONNX-локально — «объясни, как это читается» офлайн.
- OSS-альтернативы никуда: **Nakdimon** (github.com/elazarg), **UNIKUD** — модели-одиночки, качество ниже Dicta.
- **hspell** — свободный ивритский спеллчекер + морфодвижок (AGPL; C API + HspellPy; Hunspell-словарь): http://hspell.ivrix.org.il/ — «строгий» академический стандарт написания.
- **Грамматика:** полноценного Grammarly-класса для иврита НЕТ. Sapling (https://sapling.ai/lang/hebrew) — spell-чек, коммерческий; Melingo ICA — enterprise. Реалистичный путь: hspell (орфография) + LLM-judge (DictaLM 2.0 локально или Gemini) с чеклистом типичных ошибок (род/число-согласование, מ/ב-предлоги, ктив мале) — самосбор, M.
- Механика: агент даёт письменные мини-задания по due-словам → проверка hspell+LLM → ошибки конвертируются в SRS-материал (замыкание write-канала, которого в продукте нет).

---

## 7. Сводная таблица: инструмент → образовательная ценность → сложность подключения

Сложность: **S** = готовый MCP/REST без ключей, часы; **M** = API-обёртка/OAuth/self-host модели, дни; **L** = самосбор-пайплайн, недели.

| # | Инструмент | Образовательная ценность (какую практику включает) | Сложность |
|---|---|---|---|
| 1 | **Sefaria MCP (hosted)** | интертексты песен/поэзии, словари Klein/Jastrow — «глубина» лексики | **S** |
| 2 | **LRCLIB API** | синк-тексты песен → караоке-упражнения, слово-в-строке по таймстампу | **S** |
| 3 | **YouTube-transcript MCP** | субтитры клипов/подкастов → listening+reading по своему контенту | **S** |
| 4 | **Spotify MCP** | плейлист как учебный план; связь due-слов ↔ песни | S/M (Premium+OAuth) |
| 5 | **Dicta Nakdan API** | автоникуд любых текстов/песен → честное чтение вслух | **S/M** |
| 6 | **kaikki.org Hebrew JSONL** | офлайн-словарь с этимологией/флексиями для агент-lookup | **M** (датасет→индекс) |
| 7 | **wordfreq / субтитровые частотники** | приоритизация лексики «что учить сначала» под корпус пользователя | **S** (pip) |
| 8 | **ivrit.ai ASR (faster-whisper CT2)** | транскрипция речи ученика и подкастов; фундамент голосовой петли | **M** (self-host+MCP-обёртка) |
| 9 | **Anki MCP (AnkiConnect)** | ревью-петля в чате агента; ⚠ не плодить второй источник истины SRS | **S/M** |
| 10 | **Google Calendar MCP** | habit-петля, планирование сессий | **S** |
| 11 | **ElevenLabs TTS/STT** | лучший голос иврита для диалоговой практики | **M** (платно) |
| 12 | **Gemini Live API** | realtime-разговорная практика (иврит поддержан) | **L** (websocket-пайплайн вне MCP) |
| 13 | **Phonikud** | IPA+ударение — «как это звучит», база для локального TTS и скоринга | **M** |
| 14 | **DictaLM 2.0 (локально)** | ивритский объяснятель/грейдер без облачных затрат (R16) | **M/L** (GPU/квант) |
| 15 | **hspell** | проверка письменных заданий (орфография) | **M** |
| 16 | **Самосбор speech-scoring** (ASR+alignment+Phonikud) | оценка произношения — готового для иврита НЕ существует | **L** |
| 17 | **Musixmatch API (enterprise)** | легальные Rich-Sync тексты в объёме | **L** (цена/договор) |
| 18 | **Easy-Hebrew издания** (Yanshuf, E-Tone, Simaniya) | graded-reading поток новостей (никуд+аудио) | M (подписка, без API) |
| 19 | **Kan-подкасты + ivrit.ai ASR** | транскрипты Hayot Kis и др. → импорт в Зал | **M/L** |
| 20 | **Notion/Obsidian MCP** | дневник изучения, конспекты разборов песен | **S** |

### Замечания-инварианты (проектные линзы)

- **R17 (кто учит — не сертифицирует):** Anki-MCP и агентские квизы не должны писать в `review_log` LinguistPro мимо существующего merge-пути; грейд-провенанс обязателен.
- **R16 (cost governor):** ElevenLabs/Realtime/Musixmatch — метered; локальные ivrit.ai + Phonikud + DictaLM — нулевые маржинальные затраты.
- **R11 (do-no-harm):** тексты песен из LRCLIB/скрейпинга — непроверенный источник; не перезаписывать выверенные пользователем тексты автоматически.
- **Copyright:** Shironet/Genius-скрейпинг — юридически серая зона; предпочитать LRCLIB (открытая база) и официальный Musixmatch.
