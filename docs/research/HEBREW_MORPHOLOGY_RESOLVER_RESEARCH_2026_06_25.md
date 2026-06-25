# Hebrew Morphological Disambiguation for an Offline-First Browser PWA — Research Dossier

**Дата:** 2026-06-25 · **Тип:** durable research artifact (не возвращаться ~6–12 мес, если экосистема не сдвинется).
**Заказ:** оценить варианты повышения качества ядра морфологии-на-тапе Читального зала (LinguistPro) и зафиксировать доказательную базу.
**Метод:** deep-research workflow (`wf_10d84913-061`) — **6 углов · 26 источников · 124 извлечённых утверждения → 25 верифицировано состязательно (3-голосный refute-кворум) → 22 подтверждено / 3 убито**. Агентов: 109. Роли-линзы: R10 (вед., вычисл.-морфолог) · R1 (лексикограф) · R5 (рынок/offline-first).
**Action-план (приоритеты R1–R4):** `docs/planning/RESOLVER_QUALITY_RESEARCH_2026_06_25.md`. Этот файл — ДОКАЗАТЕЛЬНАЯ БАЗА под него.
**Контекст продукта:** [[project_brr_ux_audit]] (Эпик 1 honest-resolver SHIPPED) · `docs/planning/BRR_EPIC1_RESOLVER_HONESTY_2026_06_25.md`.

> ⚖️ **Дисциплина доказательности.** Ниже строго разделены: **[ВЕРИФ]** — прошло состязательную проверку; **[ОПРОВЕРГНУТО]** — убито (не цитировать как факт); **[КОНТЕКСТ]** — из поисковых сниппетов/extract-ов, НЕ прошло финальную верификацию (полезно, но перепроверять). Лицензии и размеры моделей — **release-dependent**, перепроверять под конкретный pull.

---

## 0. Executive summary — честный ROI

Текущее ядро = **офлайн form-first резолвер** (9279 Pealim-парадигм, 3.3МБ gz) + **опциональный Tier-3** (браузер→Dicta Nakdan API, CORS). Качество: ②-заметки ~99.4%; хвост-гомографов честен ~90% (vs Dicta-silver-оракул — **циркулярен** для Tier-3, дрейфит на архаике).

**Вердикт:** ядро **близко к практическому потолку для offline-browser**. Реальные выигрыши лежат не в логике form-first, а в:
1. **Измерении** — мы не знаем ИСТИННЫЙ потолок на архаике (silver циркулярен; все золотые трибанки — современные). → R1.
2. **Именах** — последний незакрытый ковш хвоста; лицензионно-чистый газеттир закрывает дёшево. → R2.
3. **Опц. офлайн-модели** — tiny-DictaBERT в ONNX/браузер мог бы дать Tier-3 БЕЗ сети/согласия, но end-to-end не доказан → спайк. → R3.

**Что НЕ окупается:** NeoDictaBERT в браузер (922МБ), шипинг NEMO-данных (нет лицензии), переписывание form-first.

---

## 1. Область 1 — Золотой eval-набор

### 1.1 Инвентарь золотых ресурсов [ВЕРИФ]
| Ресурс | Размер | Лицензия | Леммы | NER | Регистр |
|---|---|---|---|---|---|
| **UD HTB** | 6143 предл. / 114 648 ток. / 160 195 синт.-слов (36 783 MWT, ×2.24) | **CC BY-NC-SA 4.0** (некоммерч.) | нет | нет | газетный HaAretz **1990–91** |
| **IAHLT-HTB** | 115K ток. / 158K слов / 6216 предл. (train 127K / dev 10.5K / **test 11.4K**) | **CC BY-NC-SA 4.0** | пока нет¹ | — | газетный (то же) |
| **IAHLTwiki** | 5039 предл. / 103 395 ток. / 140 961 синт.-слов (34 692 MWT) | **CC BY-SA 4.0** (коммерч. ОК) | **да** | **да (вложенный, MISC Entity=)** | совр. Wikipedia |
| Hebrew Treebank (исходный MILA) [КОНТЕКСТ] | ~6500 предл. | **GPLv3** / research | да | — | газетный |

¹ IAHLT-HTB README: «at present the files do not include lemmas» — «may be added later». Перепроверять под релиз.

**Вывод по лицензиям (load-bearing для продукта):** для редистрибуции деривата → **только IAHLTwiki (BY-SA)**. HTB/IAHLT-HTB (BY-NC-SA) — годятся как **внутренний eval-оракул** (измерение ≠ редистрибуция). NEMO/исходный MILA — НЕ шипить.

### 1.2 🔴 Критичный разрыв: register-mismatch к Бен-Иегуде [ВЕРИФ]
**ВСЕ** золотые ивритские ресурсы — современные (HaAretz-1990 newswire / совр. Wikipedia). **Архаику/литературу Бен-Иегуды не покрывает НИКТО.** «Second Wave of UD Hebrew Treebanking» (arXiv 2210.07873) сам называет HTB «single-source newswire ... over 30 years old». ⇒ Истинный потолок на Бен-Иегуде **нельзя** получить из трибанков; они дают только: (a) annotation-scheme-референс, (b) modern-Hebrew sanity-baseline. **Ручная разметка выборки ИЗ Бен-Иегуды — неизбежна.**

### 1.3 Циркулярность silver-оракула [ВЕРИФ + синтез]
Мерить резолвер против Dicta-silver (или DictaBERT, обученного на той же HTB/NEMO-схеме) — **циркулярно** для Tier-3 (re-import той же схемы/смещений). Разрыв:
- (a) Мерить против **ЧЕЛОВЕЧЕСКОГО gold** (IAHLTwiki — ручная разметка, независима от Nakdan).
- (b) Архаика — ручная Бен-Иегуда-выборка, адъюдикация людьми, не deferral к Dicta.
- (c) DictaBERT-Parse как **ВТОРОЙ независимый silver для ТРИАЖА**: расхождения Nakdan↔DictaBERT-Parse = высокоценные кейсы в ручную адъюдикацию (НЕ ground truth).

### 1.4 Методология (для R1) [КОНТЕКСТ, сильный]
- **Ключевой урок:** стандартные бенчмарки **систематически переопредставляют мажоритарные (частые) разборы** — модель может рапортовать SOTA, но валиться на редких-важных миноритарных гомографах. **Истинную точность на хвосте мерят purpose-built contrast/challenge-наборы, не общие бенчмарки.** ⇒ для R1 сэмплировать ИМЕННО высоко-гомографные предложения, не равномерно.
- **Готовые challenge-наборы (Shmidman et al., DICTA/Bar-Ilan):** EMNLP-Findings-2020 «A Novel Challenge Set for Hebrew Morphological Disambiguation and Diacritics Restoration» + набор на **21 ивритский гомограф** с обильной аттестацией каждого разбора — прямо под «hard homograph tail».
- **Размер для solo:** test-split IAHLTwiki/IAHLT-HTB (~11K токенов) как старт + ~150–200 архаичных предложений Бен-Иегуды (триаж-разметка только расхождений). Достаточно для оценки precision/recall на хвосте, не для обучения.

---

## 2. Область 2 — SOTA Hebrew morph (2023–2026) + Tier-3

### 2.1 Сравнение опций
| Модель/инструмент | Параметры | Задачи | Веса/API | Лицензия | Браузер? |
|---|---|---|---|---|---|
| **Dicta Nakdan API** (текущий Tier-3) | — | никуд/морфология в контексте | hosted API | — | ✅ (браузер-CORS, уже используем) |
| **DictaBERT-Parse / dictabert-joint** | ~0.2B (joint) / ~186M (parse) | seg+POS+лемма+морф+зависимости+**NER** в 1 проход | **open weights** (safetensors) | **CC BY 4.0** (коммерч.) | ❌ без квантизации |
| **dictabert-tiny-joint / tiny-parse** | **45.2M** (BERT-tiny) | те же 5 задач, «лёгкое падение точности» | open weights | CC BY 4.0 | ⚠️ ONLY-кандидат на ONNX/q4 (не доказан) |
| **dictabert-ner** | BERT-base | NER (PER/LOC/GPE/ORG) | open weights (+ `dictabert-ner-ONNX` sibling) | CC BY 4.0 | ⚠️ через ONNX |
| **NeoDictaBERT** (окт 2025) | **0.4–0.5B**, 28 слоёв, 922МБ BF16 | encoder (QA/семантика силён) | open weights | — | ❌ невозможно (на 2 порядка > бюджета) |
| NEMO | Bi-LSTM-CRF + fastText | NER | Python/CLI/REST | — (corpus без лиц.) | ❌ не браузерный |
| YAP / Trankit / Stanza / UDPipe2 | — | морф/синтаксис | разные | разные | (вне фокуса; DictaBERT доминирует по ивриту) |

### 2.2 DictaBERT-Parse — детали [ВЕРИФ]
Одна BERT-модель (общий энкодер + multi-task головы): prefix-segmentation, морф-дизамбигуация, лемматизация, dependency-parsing, NER. `predict()` с `output_style` + селективные флаги (`do_lex/do_syntax/do_ner/do_prefix/do_morph`); отдаёт `morph` + `ner_entities[{phrase,label,start,end,token_start,token_end}]`. Источник: ACL-Findings-2024 «MRL Parsing Without Tears: The Case of Hebrew» (Shmidman et al., arXiv 2403.06970) + HF model cards. **Настоящая open-weights альтернатива API-only Nakdan; одна модель закрывает Область 2 И 3.**

### 2.3 ⚠️ Точность — нюанс [СМЕШАННО]
Paper Table 1 (DictaBERT-Parse-base) **[КОНТЕКСТ, подтверждено одним верификатором, refuted:false на числах]:** POS **97.89%**, сегментация **97.26%**, лемма **97.26%**, морф-фичи **96.62%**; YAP POS 93.64%; Levi-Tsarfaty LAS 81.4%; DictaBERT LAS no-punct 84.7%. **НО** обёрнутое утверждение «это устанавливает практический потолок/оракул» получило финальный **vote 1-2 → [ОПРОВЕРГНУТО]** (SOTA-LAS-framing). ⇒ **Трактовать числа как paper-reported на СОВРЕМЕННОМ HTB, НЕ как доказанный потолок на нашей архаике.** Это ровно мотивация R1.

### 2.4 Браузер-физибилити [ВЕРИФ + КОНТЕКСТ]
- **transformers.js** гоняет Transformers client-side через ONNX Runtime (WASM по умолч., опц. WebGPU), без сервера; **token-classification/NER — поддержанная задача**; квантизация `dtype`: q8 (WASM default) / q4 / fp16 / fp32. [ВЕРИФ]
- **WASM > WebGPU для малых single-pass моделей** [КОНТЕКСТ]: all-MiniLM-L6-v2 (22M, INT8) ~8–12мс WASM vs ~15–25мс WebGPU (M2 Air) — GPU dispatch/upload/readback overhead > вычисления. ⇒ для tiny-модели целить **WASM в Web Worker**, не WebGPU.
- Прецедент сжатия [КОНТЕКСТ]: 255МБ BERT → −74.8% через ONNX, гоняет офлайн на телефоне. Подтверждает направление, но не нашу кастомную арку.
- **🔴 Невыясненный риск:** кастомная multi-head `trust_remote_code` арка DictaBERT усложняет чистый ONNX-экспорт — **не drop-in**; рабочий браузер-билд на нашем бюджете НЕ продемонстрирован. Это эксперимент (R3), не решение.

### 2.5 Switch Tier-3? [ВЕРИФ]
DictaBERT-Parse сильнее Nakdan по богатству (1 вызов = вся морфология+синтаксис+NER) и открыт. НО: для БРАУЗЕРНОГО Tier-3 без сервера он требует либо ONNX-в-браузер (R3, не доказан), либо hosted-эндпоинт (R4, **не подтверждено**, что Dicta даёт DictaBERT-Parse-backed CORS-эндпоинт сильнее Nakdan). **Nakdan уже решает Tier-3** → switch не срочен; ценность — в R3 (офлайн) если выйдет.

---

## 3. Область 3 — Офлайн-NER имён (= F6)

### 3.1 Два пути [ВЕРИФ]
- **(a) Газеттир** (рекоменд., impact×feasibility #1): курир. список ивр. личных+гео имён из **Wikidata + IAHLTwiki-NER** (CC-чисто) → малый офлайн-список (как `CONTEXT_GLOSS`/`functionGate`) → попадание ⇒ подавить морфологию + лейбл «имя собственное». Дёшево, офлайн, лицензионно-чисто.
- **(b) NER-модель:** `dictabert-tiny` NER-голова / `dictabert-ner-ONNX` (PER/LOC/GPE/ORG) — тяжелее (R3-зависимо).

### 3.2 🟢 Находка для архаики: KIMA [КОНТЕКСТ]
**KIMA — Historical Hebrew Gazetteer:** открытая attestation-based БД исторических топонимов в ивритском письме: **27 239 мест / 94 650 вариантов имён / 236 744 аттестаций.** Прямо под архаичные/литературные ТОПОНИМЫ Бен-Иегуды.

### 3.3 🔴 NEMO — лицензионный блок [ВЕРИФ]
NEMO-Corpus: GitHub `license: null` (= all-rights-reserved) + upstream = research-only HaAretz Treebank. **ДАННЫЕ НЕ ШИПИТЬ.** Только как референс схемы (9 типов OntoNotes PER/ORG/GPE/LOC/FAC/EVE/WOA/ANG/DUC, BIOSE, морфема+токен, вложенные mentions). Движок NEMO = Bi-LSTM-CRF+fastText, Python-only → не браузерный.

### 3.4 Ранг
**газеттир-first** (дёшево/офлайн/чисто) > tiny-ONNX NER-голова (тяжелее) > NEMO-данные (заблокировано).
⚠️ **Открытый вопрос:** покрывают ли CC-чистые газеттиры архаичные/библейские **ЛИЧНЫЕ** имена (KIMA = топонимы); личные — Wikidata + возможно corpus-harvesting топ-N по Бен-Иегуде.

---

## 4. [ОПРОВЕРГНУТО] — что НЕ цитировать как факт
| Утверждение | Vote | Почему убито |
|---|---|---|
| «DictaBERT-Parse устанавливает потолок/оракул-качество для контекст-дизамбигуации (SOTA-LAS framing)» | **1-2** | Числа Table 1 реальны, но SOTA-обёртка/«оракул»-рамка не выдержала; и это СОВР. HTB, не наша архаика |
| «DictaBERT-Parse обучен на UD+NEMO → НЕ-циркулярный оракул сильнее Nakdan» | **0-3** | Обучение на той же схеме НЕ делает его независимым от silver → всё равно циркулярен |
| «NeoDictaBERT — сильнейшая Dicta-модель для контекст-морфологии, мощнее поколения под Nakdan» | **1-2** | Его выигрыши — QA/семантика, НЕ доказанная победа по морфологии; и браузер-невозможен |

---

## 5. Открытые вопросы (драйверы R1/R3/R2/R4)
1. **Истинная точность form-first на архаике Бен-Иегуды — НЕИЗВЕСТНА.** Единственный путь — ручная разметка (R1). Самый большой неизвестный, блокирует любую ROI-оценку.
2. **Экспортируется ли tiny-DictaBERT в ONNX + квантизуется до PWA-приемлемого размера/латентности** (кастомная multi-head арка)? Нужен hands-on спайк (R3).
3. **Есть ли CC-чистый газеттир ЛИЧНЫХ архаичных/библейских имён**, или классич. формы вне совр. газеттиров → corpus-harvest? (R2)
4. **Есть ли у Dicta hosted-эндпоинт сильнее Nakdan** для контекст-морфологии с CORS? Открытые веса подтверждены; сильнее-hosted — НЕ подтверждено. (R4)

---

## 6. Приоритизированные рекомендации (кратко; полный план — в `docs/planning/RESOLVER_QUALITY_RESEARCH_2026_06_25.md`)
- **🥇 R1 Золотой eval** (impact ВЫС × feas ВЫС): `reader-morph-audit --gold` = IAHLTwiki human-gold (non-circular, modern baseline) + ручная архаичная Бен-Иегуда-выборка через Nakdan↔DictaBERT-Parse триаж + **сэмплинг по гомографам** (не равномерно). Узнаёт истинный потолок, разрывает циркулярность.
- **🥈 R2 Газеттир имён (F6)** (impact СРЕД × feas ВЫС): Wikidata + IAHLTwiki-NER + KIMA(топонимы) → офлайн-список → подавление морфологии на именах. Доводит хвост Эпика 1 до ~100%.
- **🥉 R3 Спайк tiny-DictaBERT-ONNX** (impact ВЫС-если-выйдет × feas НИЗ): tiny-joint(45.2M)→ONNX→q4→transformers.js **WASM** Web Worker = полностью офлайн Tier-3 (без сети/consent). Decision-gated спайком (влезает по размеру/латентности? тогда game-changer).
- **⏸ R4 Hosted DictaBERT-Parse Tier-3** (impact НИЗ-СРЕД × feas СРЕД): только если найдётся CORS-эндпоинт сильнее Nakdan (не подтверждён).
- **❌ НЕ:** NeoDictaBERT в браузер · шипинг NEMO-данных · переписывание form-first.

**Согласованная последовательность (владелец, 2026-06-25): R1 → R3 → R2 → последующие эпики.**

---

## 7. Источники (аннотированные)
**Primary (золото/лицензии):** UD HTB `universaldependencies.org/treebanks/he_htb` · IAHLT `github.com/IAHLT/UD_Hebrew` · UD IAHLTwiki `universaldependencies.org/treebanks/he_iahltwiki` · NEMO-Corpus `github.com/OnlpLab/NEMO-Corpus` (license:null) · «Second Wave of UD Hebrew Treebanking» arXiv 2210.07873.
**Primary (SOTA/модели):** «MRL Parsing Without Tears» arXiv 2403.06970 (ACL-F 2024) · HF `dicta-il/dictabert-{parse,joint,ner,morph}` · NeoDictaBERT arXiv 2510.20386 · transformers.js docs `huggingface.co/docs/transformers.js`.
**Primary (eval-методология):** «A Novel Challenge Set for Hebrew Morph Disambiguation & Diacritics» EMNLP-F 2020 `aclanthology.org/2020.findings-emnlp.297` · `aclanthology.org/2022.emnlp-main.292` · arXiv 2208.01875 · 2010.02864.
**Primary (NER/газеттиры):** `dicta-il/dictabert-ner` · `github.com/OnlpLab/NEMO` · NNLP-IL resources `resources.nnlp-il.mafat.ai` · IAHLT products `iahlt.org/products` · KIMA gazetteer.
**Blog/secondary (браузер-ML):** ONNX-сжатие BERT −74.8% (dev.to) · WebGPU-vs-WASM (sitepoint) · NNLP-IL Hebrew-Resources список.

> Статистика прогона: 6 углов · 26 источников fetched · 124 утверждения извлечено · 25 верифицировано · 22✓/3✗ · 10 после синтез-дедупа · 109 агентов · ~4.4M токенов · ~18 мин.
