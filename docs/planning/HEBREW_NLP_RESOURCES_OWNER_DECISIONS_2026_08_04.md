# Hebrew NLP Resources — Owner Decisions + Execution Ledger (2026-08-04)

**Статус:** OWNER-APPROVED (формализация рекомендаций владельца, получены 2026-08-04,
источник — документ «Рекомендации» владельца; текст-провенанс в Приложении A).
**База:** `HEBREW_NLP_RESOURCES_INTEGRATION_PLAN_2026_08_04.md` (план) +
`docs/research/hebrew-nlp-resources/2026-08-04/REPORT.md` (evidence).
**Исполнение:** преимущественно **Codex-сессии** (§6 — контракт сессии); Claude Code —
периодически (планирование/ревизия/каноника). Леджер §5 — единая точка статусов.

---

## 0. Инвариант №1 — production-ASR не трогаем

`ivrit-ai/whisper-large-v3-turbo-ct2` (exact pin) остаётся единственной production-ASR
моделью Companion/сайдкара. Ничто в этом пакете не меняет ASR-путь:

- **stable-ts (L4.0c)** работает ПОВЕРХ нашего же ivrit-Whisper — это alignment-режим,
  не замена ASR;
- **MMS forced aligner / SaT (Q6a)** — только offline gate-side оракулы (проверка
  сохранённых таймлайнов/сегментации), не в production-цепочке;
- **VibeVoice-ASR (Q6b)** — отдельное feasibility-исследование кросс-гипотез; любое
  предложение изменить production-ASR потребовало бы нового owner-решения с собственным
  бенчмарком (сейчас НЕ предлагается);
- L1-канон (default-off, explicit enrollment, Gemini никогда не фолбэк автоматически)
  не изменяется.

## 1. Формализованные решения

| Решение | Вердикт | Уточнения владельца |
|---|---|---|
| **D-HNR-1** L4.0 бенчмарк-фаза | **GO** | Порядок: L4.0a → L4.0c → L4.0b. Manifest замораживается ДО результатов (§4). Hy-MT2-7B — только если не усложняет основной прогон |
| **D-HNR-2** Wave Q1–Q4 | **GO, по одному** | **Q4 создаётся ВНУТРИ L4.0a** (голд-набор = продукт бенча), не отдельным проектом |
| **D-HNR-3** Wave F порядок | **GO: F1 → F2 → F3** | Follow-up усилил F2, но приоритет F1 неизменен: детерминирован, без LLM, уникальная FSRS-модель, решает выбор среди 26K работ. Остальные F — parked/watch |
| **D-HNR-4** песни | **ПОДТВЕРЖДЕНО** | Shironet full-text scrape НЕ хостить; PD-слой разрешён; полный современный текст — только user-import; **snippet-каталог — только после отдельной правовой конкретизации** (юр-гейт) |
| **D-HNR-5** академическая линия | **ПОДТВЕРЖДЕНО** | Запрос HELEECS можно отправить заранее; пользовательский opt-in поток данных — только после отдельного R15-пакета |
| **D-HNR-6** follow-up quality deltas (новое) | **GO** | Q5 (constrained lemma audit / shoshan) и Q6 — последовательные quality-слайсы ПОСЛЕ L4.0. **Q6 разделён:** Q6a = MMS/SaT offline gates; Q6b = VibeVoice feasibility + cross-hypothesis benchmark (отдельное решение о запуске — чтобы установка тяжёлой ASR-модели не маскировалась под «маленький smoke») |
| **D-HNR-7** L4.0a Manifest v2 | **GO 2026-08-04** | In-domain `reference_text` создан GPT-5.6 Sol high и принят владельцем как AI-reference/silver, не human gold; билингвальная human-blind оценка недоступна и явно waived; FLORES Stage A = детерминированные 506 shared IDs × 2 направления для всех кандидатов, расширение до полного devtest для Gemini + top-2 local при ΔchrF++ < 2, пересечении bootstrap CI, конфликте ранжирования метрик или critical failure flags |
| **D-HNR-8** L4.0a Manifest v3 owner override | **GO 2026-08-04** | После срабатывания critical-failure trigger владелец явно отменил обязательное full-devtest расширение на этом этапе: verdict строится на одинаковой Stage A (1012 строк) для всех пяти систем; top-2 local не расширяются. Уже оплаченный Gemini partial 1118/2024 сохраняется только как provenance/cost artifact и не участвует в сравнительных метриках |

## 2. Метрики MT-бенча (уточнение владельца к L4.0a)

CometKiwi — **только дополнительный сигнал**. Он НЕ заменяет:
chrF++ · spBLEU · **человеческую слепую оценку** · проверку добавленных/утраченных
смыслов · проверку **учебной пригодности** перевода (глоссируемость, морфологическая
прозрачность для изучающего).

**Manifest v2 owner-waiver (2026-08-04):** квалифицированный he↔ru human-reviewer
недоступен; поэтому человеческая слепая оценка не считается пройденной и не
подменяется CometKiwi/LLM. Она снята владельцем как блокер текущего evidence-слайса
со статусом `LIMITED EVIDENCE / NO BILINGUAL HUMAN VALIDATION`. До будущего
билингвального гейта продукт может позиционировать перевод только как исправляемый
машинный draft; human-validated/default-on/GA-утверждения запрещены.

## 3. Как это ложится на незавершённый STUDIO_INGEST roadmap (вопрос владельца №3)

Канон-цепочка не переоткрывается: Workspace/P2/P3/P4 закрыты
(`STUDIO_INGEST_P2_PORTABLE_LEARNING_PACKAGE_V2_IMPLEMENTATION_PACKET_2026_08_02.md` и
P3/P4-пакеты — авторитет без изменений). Post-P4 decision gate
(`STUDIO_INGEST_ROADMAP_2026_07_30.md` §9) **исполнен**: выбрано направление №1 —
**L4 local translation+nikud+S6**, с точной authority = данный документ.

- Слайс 8 роадмапа («local translation/nikud + S6, shared provider contract, R1/R11
  quality gates») стартует как **L4.0 evidence-фаза**; L4 design/implementation packet
  пишется ПОСЛЕ цифр (очередь §5, шаг 7).
- Слайс 9 (diarization/alignment, L5) НЕ открывается; но L4.0c и Q6a создают его
  будущий фундамент (timing-голд, alignment-инструменты) без отдельного решения.
- Слайсы 10–12, L2, G-HERMES/G-AUTOSYNC — без изменений (parked/triggered).
- Wave Q (качество) и Wave F1 идут ПОСЛЕ L4.0 по очереди §5 — по одному, без
  параллельных треков (WIP-дисциплина master-plan сохранена).
- L6 TTS-канон не меняется; Chatterbox/VoxCPM2 добавлены только в watch-кандидаты
  frozen listen-set.

## 4. L4.0 Benchmark Manifest v3 — FROZEN 2026-08-04

Изменения манифеста после старта прогонов = новая версия с owner-подписью (не молча).
Все прогоны — на машине владельца (RTX 3070 8GB / Ryzen 5600G); прод не участвует;
эксклюзивный GPU-слот сайдкара уважается (бенчи не конкурируют с активными ASR-джобами).

Manifest v2 сохраняет кандидатов и инварианты v1, но заменяет три evidence-гейта
по прямым owner-решениям этой сессии:

1. in-domain ссылки из
   `in-domain-owner-gold.filled-machine-draft.tsv` аттестованы владельцем как
   GPT-5.6 Sol high и принимаются для сравнительных метрик только как
   **owner-accepted AI-reference/silver**, не human gold;
2. bilingual human-blind ≥40 — `WAIVED BY OWNER / NOT PERFORMED`; итоговая уверенность
   принудительно `LIMITED EVIDENCE`;
3. FLORES+ начинается со Stage A: 506 общих devtest ID, выбранных до результатов
   SHA-256-ранжированием с фиксированным seed, в обоих направлениях (1012 строк на
   систему). До полного devtest расширяются Gemini + top-2 local, если хотя бы один
   триггер срабатывает: `ΔchrF++ < 2` · 95% bootstrap CI пересекаются · chrF++/spBLEU/
   CometKiwi конфликтуют по ранжированию · найден critical failure flag.

**Manifest v3 owner override (после срабатывания trigger):** правило v2 и факт
срабатывания critical-failure trigger сохраняются в provenance, но его full-devtest
ветка явно `DEFERRED BY OWNER` на этом этапе. Сопоставимый verdict использует только
одинаковую Stage A: 506 shared IDs × 2 направления = 1012 строк для каждой из пяти
систем. Gemini успел сохранить 1118/2024 строк full-run (106 сверх Stage A; оценочная
общая стоимость `$8.4957`, из неё расширение около `$0.8104`); этот partial не
подмешивается в Stage A метрики и не даёт Gemini больше evidence, чем local-кандидатам.
Top-2 local full-run не запускается. Возобновление expansion потребует нового явного GO.

### L4.0a — MT he↔ru (первый)
- **Кандидаты (фикс):** MADLAD-400-10B CT2 int8 (текущий) · OPUS-MT heb-sla +
  sla-heb transformer-big (CT2) · NLLB-200-distilled-1.3B int8 · **Hy-MT2-1.8B** ·
  Gemini (облачный потолок, BYOK). Опционально: Hy-MT2-7B — только если не усложняет
  основной прогон.
- **Данные:** FLORES+ devtest he→ru и ru→he по адаптивной Stage A/expand схеме v2;
  ~200 in-domain сегментов (ASR-стиль из наших транскриптов + литературные из корпуса
  Зала), ru-ссылки — owner-accepted GPT-5.6 AI-silver.
  **Q4-голд создаётся здесь же** и коммитится как переиспользуемый актив
  (`docs/research/heb-ru-mt-gold/…`).
- **Метрики:** chrF++ и spBLEU (sacrebleu, оба направления) с детерминированными 95%
  bootstrap CI + CometKiwi-DA (доп. сигнал) + model-assisted failure audit
  добавленных/утраченных смыслов и учебной пригодности. Human-blind не выполнен и
  явно waived по §2; model-assisted аудит не называется человеческим.
- **Операционные замеры:** ток/с, VRAM/CPU-профиль, поведение на длинных предложениях
  (NLLB 512-токен лимит), устойчивость к никуду/пунктуации.
- **Выход:** таблица + вердикт «локальный выбор + честное позиционирование vs Gemini»
  (допустимый исход — «draft-качество», как у ASR).

### L4.0c — alignment (второй)
- **Production-кандидаты:** stable-ts (поверх нашего ivrit-Whisper) vs WhisperX
  (+imvladikon backbone). **MMS aligner — только gate-side comparator** (CC BY-NC).
- **Данные:** 2–3 медиа с эталонными субтитрами (переиспользовать `--subs=` активы
  live-гейта) + **отдельный word-level голд** (ручная разметка границ ~100 слов).
- **Метрики:** median/p95 сдвиг границ слов vs эталон; прогон через существующие
  karaoke-drift гейты; VRAM/runtime.

### L4.0b — nikud (третий)
- **Кандидаты:** dictabert-large-char-menaked (текущий, local) vs Dicta Nakdan cloud.
- **Данные:** **human gold отдельно от массового silver-корпуса** (уточнение владельца):
  (а) human-голд срез — огласованные PD-тексты Ben-Yehuda (человеческая огласовка) +
  ручная выборка владельца; (б) silver — TigreGotico 5.3M (сам Dicta-derived! только
  для масштаба/регрессии, НЕ для вердикта — иначе циркулярность R11).
- **Метрики:** DEC/CHA/WOR/VOC (Nakdimon-харнесс, MIT) + CPU ms/1K chars.
- **Деплой-заметка:** dicta-onnx (MIT) — кандидат пути без Python/torch, решение после цифр.

## 5. Очередь исполнения — леджер (единая точка статусов)

| # | Шаг | Статус | Исполнитель | Артефакт/гейт |
|---|---|---|---|---|
| 0 | Исправить provenance/owner-journal несогласованности (журнал решений в плане → OWNER-APPROVED, этот док создан) | ✅ DONE 2026-08-04 (эта сессия) | Claude Code | этот документ + обновлённый журнал плана |
| 1 | Принять D-HNR-1 | ✅ DONE (решение владельца) | owner | §1 |
| 2 | Заморозить L4.0 manifest до результатов | ✅ DONE v3 (§4; D-HNR-7 + D-HNR-8 owner GO 2026-08-04) | Claude Code + owner | v1/v2 сохранены provenance-базой; v3 фиксирует равную Stage A и owner-deferred expansion |
| 3 | L4.0a MT-бенч (+ Q4 внутри) | ✅ DONE 2026-08-04 under Manifest v3 — все 5 систем на равной Stage A 506 shared IDs × 2; chrF++/spBLEU + 1000-sample bootstrap CI + CometKiwi + in-domain AI-reference + failure/operational audit. Gemini = cloud ceiling; MADLAD = best local, замена не обоснована. Full expansion deferred по D-HNR-8; итог `LIMITED EVIDENCE / NO BILINGUAL HUMAN VALIDATION` | Codex + owner-approved waivers | `docs/research/studio-l4-mt-benchmark/2026-08-04/RESULTS.md`; `MACHINE_CHECKPOINT.md`; `docs/research/heb-ru-mt-gold/2026-08-04/` |
| 4 | L4.0c alignment-бенч (word-level голд отдельно) | ⬜ | Codex | drift-метрики vs эталон |
| 5 | L4.0b nikud-бенч (human gold ≠ Dicta-silver) | ⬜ | Codex | DEC/CHA/WOR/VOC + CPU-цена |
| 6 | L4 design packet по результатам | ⬜ | Claude Code (планирование) → owner approve | новый implementation packet |
| 7 | Q2 standing ASR gold (`smoke:ingest-asr-gold`) | ⬜ | Codex | новый smoke-гейт зелёный |
| 8 | Q1 human morphology gold (UD/IAHLT) | ⬜ | Codex | второй оракул в `smoke:reader-morph:audit` |
| 9 | Q5 shoshan literary audit (constrained lemma) | ⬜ | Codex | R10-отчёт на Ben-Yehuda регистре |
| 10 | Q3 suffixed-verbs аудит | ⬜ | Codex | honesty-слайс отчёт |
| 11 | Q6a timing/segmentation offline gates (MMS/SaT) | ⬜ | Codex | офлайн-грейд сохранённых таймлайнов |
| 12 | Решение по Q6b VibeVoice (отдельно!) | ⬜ GATED | owner | явное GO/NO-GO |
| 13 | Evidence-checkpoint → bounded F1 (читабельность) | ⬜ GATED | owner → Codex | чекпойнт-ревью всех шагов 3–11 |

Правила леджера: по одному активному шагу; статус меняется только с артефактом-доказательством;
пропуск шага = owner-решение, записанное здесь.

## 6. Контракт исполняющей сессии (Codex или Claude Code)

**READ FIRST (по порядку):** этот документ → `HEBREW_NLP_RESOURCES_INTEGRATION_PLAN_2026_08_04.md`
→ `docs/research/hebrew-nlp-resources/2026-08-04/REPORT.md` (+ соответствующий raw/ файл шага)
→ релевантный канон (`STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md` для L4-контекста).

**Инварианты сессии:**
1. Production-ASR инвариант §0 — абсолютный.
2. Manifest §4 заморожен: отклонения = новая версия манифеста с owner-подписью, не тихие правки.
3. Артефакты — в `docs/research/<topic>/<date>/` (+README: как сгенерировано, команда,
   коммит, raw/annotated) и НИКОГДА только в `.tmp/` (правило CLAUDE.md).
4. Лицензионный чек-лист плана §6 — перед скачиванием каждой модели/датасета; пин
   ревизии + снапшот лицензии.
5. Результат шага → обновить леджер §5 (статус + ссылка на артефакт) в ТОМ ЖЕ коммите.
6. Оракульная независимость (R11): вердикты только по human-голду/независимому сигналу;
   Dicta-derived данные не судят Dicta-модели.
7. Ничего из закрытого канона (Workspace/P2/P3/P4, L1-Companion) не переоткрывать.
8. Прод не участвует в бенчах; коммит+пуш по завершении шага (docs-only безопасен).
9. Спорная интерпретация манифеста/леджера → остановиться и спросить владельца, не
   импровизировать.

**Разделение ролей:** Codex — исполнение шагов 3–5, 7–11 (скрипты бенчей, прогоны,
отчёты). Claude Code — шаг 6 (design packet), ревизии канона, квартальный re-scan
(4 источника: каталоги NNLP-IL + HF-срез `?filter=he` + Hebrew LLM Leaderboard +
AlephBench). Owner — шаги 1, 12, 13 и приёмка.

---

## Приложение A — текст рекомендаций владельца (провенанс, 2026-08-04)

> Извлечено из `Рекомендации.docx` (Downloads, получен 2026-08-04). Формализовано выше;
> при расхождении формализации и этого текста — спросить владельца.

Обновлённые рекомендации

**D-HNR-1 — L4.0.** Рекомендация: GO. После follow-up это решение стало ещё более
очевидным. Предлагаемый порядок: L4.0a MT — MADLAD, OPUS, NLLB, Hy-MT2-1.8B, Gemini;
Hy-MT2-7B — только если не усложняет основной прогон. L4.0c alignment — stable-ts vs
WhisperX как production-кандидаты; MMS как дополнительный gate-side comparator.
L4.0b nikud — Dicta menaked vs Nakdan; human gold отдельно от массового silver-корпуса.
Дополнение к MT-метрикам: CometKiwi следует использовать только как дополнительный
сигнал. Он не должен заменять: chrF++; spBLEU; человеческую слепую оценку; проверку
добавленных/утраченных смыслов; проверку учебной пригодности перевода.

**D-HNR-2 — первоначальная Wave Q.** Рекомендация: GO для Q1–Q4 по одному. При этом Q4
фактически должен создаваться внутри L4.0a, а не как отдельный последующий проект.

**Новое решение для Q5–Q6.** Рекомендация: создать D-HNR-6. Формулировка: «Follow-up
quality deltas: одобрить ли Q5 constrained lemma audit и Q6 independent long-media
timing/ASR signals как последовательные quality-слайсы после L4.0?» Рекомендация: да,
но разделить Q6: Q6a — MMS/SaT как offline gates; Q6b — VibeVoice feasibility and
cross-hypothesis benchmark. Это не позволит превратить установку тяжёлой ASR-модели
в один якобы «маленький smoke».

**D-HNR-3 — Wave F.** Порядок не меняется: F1 — персональная читабельность; F2 — QA +
независимый grounding; F3 — GEC RU-L1; остальные parked/watch. Follow-up особенно
усилил F2, но не сделал его более приоритетным, чем F1: F1 детерминирован; не требует
LLM; использует уникальную FSRS-модель LinguistPro; непосредственно решает проблему
выбора среди 26 тысяч произведений.

**D-HNR-4 — песни.** Без изменений: Shironet full-text scrape не хостить; PD-слой
разрешить; полный современный текст только user-import; snippet-каталог — только после
отдельной правовой конкретизации.

**D-HNR-5 — академическая линия.** Без изменений: запросить HELEECS можно заранее;
пользовательский opt-in поток данных — только после отдельного R15-пакета.

**Рекомендуемая очередь исполнения:** Исправить provenance и owner-journal
несогласованности → Принять D-HNR-1 → Заморозить L4.0 benchmark manifest до
результатов → Провести L4.0a с Hy-MT2 → Провести L4.0c с отдельным word-level gold →
Провести L4.0b, разделив human gold и Dicta-derived silver → Написать L4 design packet
по результатам → Провести Q2 standing ASR gold → Провести Q1 human morphology gold →
Провести Q5 shoshan literary audit → Провести Q3 suffixed-verbs → Провести Q6a
timing/segmentation gates → Только затем отдельно решить, нужен ли Q6b VibeVoice →
После evidence-checkpoint начать bounded F1.

**Общий вывод.** Follow-up подтвердил две вещи. Первая: национальные каталоги полезны
как курируемая основа, но недостаточны как актуальный discovery-слой. Вторая: созданная
архитектура исследования правильная — новые находки не требуют переписывать roadmap,
они вставляются как кандидаты в существующие бенчмарки, quality-гейты и watchlist.
Самые ценные новые результаты: Hy-MT2 — новый обязательный участник MT-бенча; shoshan —
constrained-защита lemma identity; MMS/VibeVoice/SaT — новые независимые сигналы для
S12; asmachta — детерминированное grounding-заземление F2; AlephBench — периодический
model-selection harness; Chatterbox — первый серьёзный permissive TTS-кандидат;
whisper-heb-ipa — строительный блок F7. Но ни один из них пока не является готовой
заменой production-компонента. Правильный следующий шаг остаётся прежним: не ещё один
раунд исследования, а D-HNR-1 и исполнение L4.0 с обновлённым manifest.
