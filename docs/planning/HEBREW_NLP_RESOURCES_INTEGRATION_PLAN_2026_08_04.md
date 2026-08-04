# Hebrew NLP Resources → Roadmap Integration Plan (2026-08-04)

**Статус:** РЕШЕНИЯ ПРИНЯТЫ 2026-08-04 — формализация и исполнительный леджер в
**`HEBREW_NLP_RESOURCES_OWNER_DECISIONS_2026_08_04.md` (READ FIRST для исполнения)**.
Этот документ остаётся справочником рамки (волны, лицензии, каденция).
**База:** синтез `docs/research/hebrew-nlp-resources/2026-08-04/REPORT.md` (+ raw-выходы 5 агентов).
**Контекст-инварианты:** portfolio master-plan 2026-07-25 (WIP-лимит, «новые корпуса не сейчас»,
evidence-долг, N=1) остаётся в силе; данный план не обходит его, а выносит противоречия в
явные решения. Все модельные замены — через R10-бенчмарк с числовым гейтом. Лицензионный
чек-лист §6 обязателен для каждого ресурса.

---

## 1. Что этот план меняет в картине L4 (текущее выбранное направление)

L4 = «productize local translation + nikud + S6». Исходная неопределённость MT закрыта
нашим L4.0a: MADLAD-400 — best local и выбран владельцем, Gemini остаётся cloud ceiling.
По D-HNR-10 MADLAD productization выделен в самостоятельный последовательный L4-MT
трек до alignment/nikud; S6-alignment — отдельная последующая линия.

**Следствие — L4 стартует с бенчмарк-фазы L4.0 (она же выполняет условие «независимые R1/R11
quality gates» из roadmap):**

- **L4.0a MT-бенч:** FLORES+ devtest he→ru + ru→he (sacrebleu chrF++/spBLEU; FLORES+ —
  поддерживаемый преемник FLORES-200) + ~200 in-domain сегментов (ASR-стиль из наших
  транскриптов + литературные из корпуса; ru-эталоны — вручную/владельцем). Кандидаты:
  MADLAD-10B-int8 (текущий), OPUS-MT heb-sla/sla-heb big (CT2), NLLB-distilled-1.3B-int8,
  **Hy-MT2-1.8B (доп. HF-свип: Apache-2.0, he+ru в официальном списке — первая малая
  открытая модель с прямым he↔ru; опц. Hy-MT2-7B)**, Gemini (облачный потолок); HPLT
  he↔en v2.0 — дешёвый CPU-базлайн вне зачёта. Доп. метрика: CometKiwi-DA (reference-free
  QE с ивритом). Метрики: качество, ток/с, VRAM/CPU, поведение на длинных предложениях,
  устойчивость к никуду/пунктуации.
  **Гейт:** локальный кандидат ≥ примерно-равен лучшему локальному сопернику И честно
  позиционирован против Gemini-потолка (как ASR: «draft-качество» — допустимый вердикт).
- **L4.0b Nikud-бенч:** Nakdimon-харнесс (MIT) DEC/CHA/WOR/VOC на срезе наших жанров:
  dictabert-menaked (текущий) vs Dicta Nakdan cloud + CPU ms/1K chars. Цель — превратить
  vendor-claim «SOTA» в наше число и оценить цену облачного фолбэка. Доп. (HF-свип):
  eval-выборка также из TigreGotico/hebrew_diacritized_text (5.3M огласованных
  предложений, CC BY 4.0); путь деплоя — thewh1teagle/dicta-onnx (MIT, без Python/torch);
  renikud — watchlist (evals нет).
- **L4.0c Alignment-проба (S6-фундамент):** 2–3 медиа с эталонными субтитрами (переиспользовать
  `--subs=` активы live-гейта): stable-ts-over-ivrit-whisper vs WhisperX+imvladikon; median/p95
  сдвиг границ vs субтитры, прогон через существующие drift-гейты. Бонус: known-transcript
  alignment убивает класс подделанных меток by construction.

Выход L4.0a уже дал отдельный
`STUDIO_INGEST_L4_MT_MADLAD_IMPLEMENTATION_PACKET_2026_08_04.md`: authenticated
Browser→Companion MT, provenance parity, GPU-слот и explicit consent. Общий L4 packet
для alignment/nikud/S6 пишется после L4.0c→L4.0b и не блокирует MADLAD productization.

## 2. Wave Q — quick wins качества (внутри существующих эпиков, без новых поверхностей)

Не требуют новых продуктовых решений — усиливают существующие гейты/данные. Каждый — малый
слайс с собственным smoke-гейтом.

| ID | Что | Куда встраивается | Ресурс (лицензия) |
|---|---|---|---|
| Q1 | Человеческий морфо-голд аудит tap-резолвера (второй, независимый от Dicta оракул) | `smoke:reader-morph:audit` v2 | UD_Hebrew-IAHLTwiki (CC BY-SA 4.0) + IAHLTKnesset (CC BY 4.0); HTB (CC BY-NC-SA) — audit-side |
| Q2 | OPTIONAL/NON-BLOCKING standing ASR regression-гейт `smoke:ingest-asr-gold` (WER+drift vs фикс. эталоны); не provider race и не prerequisite L4-MT | Studio S12-гейты | ivrit-ai eval-sets (ivrit.ai license / CC BY 4.0) |
| Q3 | Suffixed-verbs аудит-слайс (ראיתיו-класс) честности карточек | Зал honesty-гейты | dicta-il/hebrew_suffix_verbal_forms (CC BY 4.0) |
| Q4 | he↔ru MT голд-набор (FLORES+ + in-domain) как постоянный актив | предпосылка L4.0a, переиспользуется для всех будущих MT/LLM | FLORES+ (CC BY-SA 4.0) + wmt24pp en→he_IL (Apache-2.0) |
| Q5 | shoshan как независимый lemma-оракул: R10-аудит нашего lemma-canon кейера на литературном регистре (доп. follow-up) | Retention lemma-canon + Зал | HebArabNlpProject/shoshan (MIT; 0.0% выдуманных лемм by construction) + shoshan-data (CC BY 4.0) |
| Q6 | Независимые тайминг/ASR-оракулы для длинных медиа: MMS forced aligner (офлайн-грейд сохранённых караоке-таймлайнов) + VibeVoice-ASR как вторая гипотеза (доп. HF-свип) | Studio S12-гейты | MMS aligner (CC BY-NC — только gate-side) + microsoft/VibeVoice-ASR (MIT) + SaT сегмент-оракул (MIT) |

## 3. Wave F — фичи-кандидаты (требуют owner-GO + R10-замер до кода)

Упорядочены по синтез-оценке (УЦ/Ц/П/А в REPORT §4–§5).

| ID | Направление | Первый bounded-слайс | Ключевой риск/гейт |
|---|---|---|---|
| F1 | **Частотная лестница читабельности** (частоты + персональная FSRS-модель знаний → «текст с покрытием 95–98%») | офлайн-скоринг корпуса + рекомендер в Зале; 0 LLM | калибровка газетных частот по нашему корпусу; полосы = provenance-чипы |
| F2 | **QA-генерация + независимый span-оракул** (dictabert-heq в сайдкаре) | вопросы к импортированному тексту, только фактоидные, listening-грейдер поверх караоке | оракул валидирует только extractive; честная маркировка; R17. Доп. follow-up: приёмочные гейты — asmachta + abstractive-qa-llm-eval (grounded-QA со строковой сверкой, без judge-модели) |
| F3 | **Письменная продукция GEC** (Hspell-слой + таксономия ошибок RU-L1 из HELEECS) | «напиши 1–3 предложения с due-словами» → error-profile | доступ к HELEECS по запросу; R11 do-no-harm гейт корректора |
| F4 | **NER-карточки имён/мест в Зале** (bake-time NEMO/DictaBERT-ner + KIMA) | NER-прогон в прибейк-конвейере + карточка «имя собственное» | R10-замер precision на литературе XIX века ДО кода |
| F5 | **Семантические дистракторы квизов** (fastText прунинг → OPFS) | дистрактор-генератор с SimLex-гейтом | размер бандла; similarity≠relatedness |
| F6 | **Песенный слой** (НЕ Shironet-корпус): тег «песня» для PD-поэзии + snippet-каталог современных песен (цитата + линк) + user-import полного текста | PD-тегирование уже имеющихся работ | юр-рамка сниппетов (§19 «цитата»); полные тексты только user-import; Shironet-скрейп НЕ хостим |
| F7 | **Произношение/shadowing** (CTC-alignment + GOP) | микрофон → alignment → пофонемная подсветка, без «оценок» на старте | калибровка против несправедливых грейдов; канал D1 в review_log. Доп. HF-свип: whisper-heb-ipa (Apache-2.0, иврит→IPA) — готовый строительный блок |

## 4. Watch / Parked (триггеры, не работа)

- **he-ru фразовый слой** (OpenSubtitles he-ru): выжимка примеров, не редистрибуция; после F1/F5.
- **Аллюзии/слои языка** (Dicta Citation Finder + Sefaria): условия API Dicta уточнить контактом.
- **Кореференция** (IAHLT): после R10-аудита на литературном тексте.
- **Словесные игры из due-слов:** дешево, но только с channel-aware D1-грейдом с первого дня.
- **DictaLM-3.0-24B-W4A16** как локальный LLM: сначала VRAM-замер; Hebrew LLM Leaderboard —
  постоянный справочник выбора моделей per-задача.
- **Локальный TTS:** L6-канон (frozen listen-set) остаётся, но кандидат-лист обновлён
  (HF-свип): **Chatterbox Multilingual (MIT, иврит поддержан, есть ONNX)** — первый
  лицензионно чистый серьёзный кандидат; VoxCPM2 (Apache) вторым; Phonikud-TTS — третья
  линия; Zonos-Hebrew/kokoro-hebrew — NC. Ивритских MOS нет ни у кого → listen-set обязателен.
- **Семантический поиск:** измеренный рецепт из MAFAT-конкурса — fine-tuned bge-m3 →
  bge-reranker two-stage (97% качества ансамбля); реплицировать рецепт, НЕ переиспользовать
  веса победителей (нет LICENSE).
- **AlephBench** (CC BY 4.0) — постоянный харнесс переоценки облачной/локальной LLM
  (текущее подтверждение: gemini-2.5-flash #1 на иврите).
- **Академическая кооперация** (opt-in поток ошибок RU-L1 → HELEECS-линия; синергия с тезисом
  владельца): отдельное R15-решение о согласии/анонимизации.

## 5. Owner-решения (журнал) — РЕШЕНО 2026-08-04

Полная формализация с уточнениями и леджером — `HEBREW_NLP_RESOURCES_OWNER_DECISIONS_2026_08_04.md`.

- **D-HNR-1 (L4.0):** ✅ **GO** — порядок L4.0a→c→b; Hy-MT2-7B только если не усложняет прогон; CometKiwi — лишь доп. сигнал, не самостоятельный oracle.
- **D-HNR-2 (Wave Q):** ✅ **GO Q1–Q4 по одному**; Q4 создаётся ВНУТРИ L4.0a.
- **D-HNR-3 (Wave F):** ✅ порядок **F1 → F2 → F3**, остальные parked/watch; F2 усилен follow-up'ом, но F1 первым (детерминизм, без LLM, FSRS-модель, выбор из 26K).
- **D-HNR-4 (песни):** ✅ подтверждено; snippet-каталог — только после отдельной правовой конкретизации.
- **D-HNR-5 (кооперация):** ✅ подтверждено; HELEECS-запрос можно заранее; opt-in поток данных — только после отдельного R15-пакета.
- **D-HNR-6 (follow-up deltas, новое):** ✅ **GO** — Q5 и Q6 как последовательные quality-слайсы после L4.0; **Q6 разделён**: Q6a (MMS/SaT offline gates) / Q6b (VibeVoice feasibility — отдельное решение о запуске).
- **D-HNR-7 (L4.0a Manifest v2):** ✅ **GO 2026-08-04** — 200 переводов GPT-5.6 приняты владельцем как AI-reference/silver, не human gold; билингвальная human-blind оценка недоступна и waived с итоговой маркировкой `LIMITED EVIDENCE`; FLORES Stage A = детерминированные 506 shared IDs × 2 направления для всех кандидатов, затем full devtest для Gemini + top-2 local при любом adaptive-trigger. Точные правила и frozen manifest — в owner-decisions §4.
- **D-HNR-8 (L4.0a Manifest v3 override):** ✅ **GO 2026-08-04** — после фактического critical-failure trigger владелец явно deferred full expansion: текущий verdict использует равные 1012 Stage A строк на систему; top-2 local full не запускаются, Gemini 1118/2024 partial хранится только как provenance/cost и не входит в ranking.
- **D-HNR-9 (локальный MT + provenance UX):** ✅ **GO 2026-08-04** — MADLAD-400 утверждён как локальный MT-провайдер по результатам L4.0a. Sentence-level provider сохраняется и показывается read-only в Meta Edit/Library badge; Library v3 фильтрует по провайдеру. Mixed/unknown не угадываются. Default-off и запрет неявного MADLAD↔Gemini fallback неизменны.
- **D-HNR-10 (ускоренный MADLAD productization):** ✅ **GO 2026-08-04** — отдельный L4-MT трек выполняется до L4.0c/L4.0b: P0 provider-status honesty → authenticated Browser→Companion MT → gates → invite beta → production preflight/deploy → owner-live; без implicit fallback/default-on/server-hosted MT.
- **D-HNR-11 (production-ASR достаточен):** ✅ **OWNER-ACCEPTED 2026-08-04** — owner-tested `ivrit-ai/whisper-large-v3-turbo-ct2` не показал критических проблем на учебных материалах. Новый model race/Q2 не блокирует MT и продуктовую разработку; пересмотр только по critical regression/incident или новому owner-решению.

**Execution result:** ledger step 3 / L4.0a закрыт 2026-08-04 под Manifest v3 с
маркировкой `LIMITED EVIDENCE / NO BILINGUAL HUMAN VALIDATION`. Gemini 3.6 Flash —
измеренный cloud ceiling; MADLAD остаётся best local, оснований для замены нет.
Канонический отчёт: `docs/research/studio-l4-mt-benchmark/2026-08-04/RESULTS.md`.
Ограниченный D-HNR-9 provenance-срез реализован в v3.11.301. D-HNR-10 изменяет
следующий шаг: теперь это P0 исправление ложного MADLAD provider-status и дальнейший
L4-MT implementation packet; L4.0c следует только после завершения productization-трека.

## 6. Лицензионный чек-лист per-resource (обязателен перед использованием)

1. Проверить лицензию в ПЕРВОисточнике на дату использования (каталоги ошибаются и конфликтуют).
2. Различать: код / веса модели / данные / выход модели — лицензии могут отличаться.
3. Copyleft (GPL/AGPL): не бандлить в PWA/клиент; server/audit-side only; фиксировать решение.
4. NC-лицензии: ок для нас, но фиксировать обоснование некоммерческого статуса в провенансе.
5. Scraped-данные: лицензия компилятора ≠ права на контент; для текстов — отдельная оценка
   копирайта (см. Shironet-кейс) и различие «личное использование» vs «публичный хостинг».
6. Custom ToU (NLI, JPress, Zemereshet, ivrit.ai): читать целиком, фиксировать цитату условий.
7. Пиннинг: версия/ревизия/SHA скачанного + снапшот лицензии в docs/research провенансе.

## 7. Каденция

- Квартальный re-scan четырёх источников: каталоги NNLP-IL + систематический HF-срез
  (⚠ `?language=he` в HF-API молча игнорируется — использовать `?filter=he`) + Hebrew LLM
  Leaderboard + AlephBench — лёгкая research-сессия, дельта в этот план.
- Любая замена модели = новый прогон соответствующего бенча L4.0/Q-гейта (актив уже будет).
