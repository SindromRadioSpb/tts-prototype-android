# BRR-P0-006 — Раннер полного пред-прогона корпуса: замер + дизайн

**Дата:** 2026-06-09 · **Статус:** планирование (замер ✅ выполнен; дизайн на утверждение; реализация раннера — после решения по стратегии).
**Роли:** R6 (библиотекарь/масштаб), R1 (честность/провенанс), R5 (продукт/инфра-стоимость), R7 (QA по эпохам).
**Инструмент замера:** `scripts/premium/measure-corpus-prerun.js` (переиспользует продюсерный `segment()` + `lib/benyehuda`; sample-download + extrapolation). Артефакт: `.tmp/by-prerun-estimate.json`.

---

## 1. Замер (реальные данные, sample 800 originals, seed 7)

| Метрика | Значение |
|---|---|
| Работ всего | **26 455** (originals **24 641** + переводы **1 814**) |
| Эпоха известна по author-map | **2 069** (tehiya 1540, haskalah 529) → у ~92% эпоха «unknown» |
| Символов на работу | mean **12 251** · p50 **1 521** · p90 19 927 · p99 254 583 · max 638 190 |
| Сегментов на работу | mean **261** · p50 **41** · p90 400 · max 18 302 |
| Source-vocalized доля | **0.63** (63% сегментов уже с авторской огласовкой → Dicta только 37%) |
| **Σ сегментов (originals)** | **≈ 6.43 млн** |
| **Σ unvocalized (Dicta-вызовы)** | **≈ 4.63 млн** |
| **Gemini-запросов** (÷50/чанк +10%) | **≈ 141 000** |
| **Перевод на free-tier** (1500/день) | **≈ 95 дней**, **$0** |
| **Аудио-клипов** (≈0.97×сегм) | **≈ 6.24 млн** |
| **Объём аудио** (≈49.6 КБ/клип) | **≈ 288 ГБ** |
| **TTS-символов** | **≈ 392 млн → ≈ 98 WaveNet-free-tier-месяцев** |

**Метод/оговорки:** sample mean × популяция — несмещённая оценка суммы, но распределение **тяжелохвостое** (медиана работы = короткое стихотворение ~1.5К знаков / 41 сегмент; среднее тянут редкие романы до 638К знаков). Порядок величины устойчив между sample 200 и 800. Переводы (1814) считаются отдельно на bulk (нужен curated `orig_language`).

## 2. Ключевые выводы (что замер изменил в плане)

1. **🔴 Полный пред-бейк АУДИО НЕВОЗМОЖЕН.** ~288 ГБ на томе Hetzner CX23 + ~98 WaveNet-free-tier-месяцев (≈8 лет в рамках 4М/мес). → **Аудио для хвоста = ТОЛЬКО on-demand** (computed-key BRR-P0-011: bake-on-open + OPFS/server LRU-кэш с эвикцией), НЕ blanket-предбейк. Curated-полки (canon-v3, 79) остаются предбейканными. Это переопределяет «доставку» BRR-P0-007 для 26K.
2. **🟡 Перевод текста — выполнимо, но это ~95 дней** free-tier (не ~30, как в ранней оценке). $0 деньгами, но ~3 месяца ежедневного quota-гринда. Платный Gemini-2.5-flash сжал бы до дней за скромную сумму.
3. **🔴 Никуд (Dicta) — главное узкое место:** ~4.6 млн вызовов; облако троттлит под bulk → **локальный sidecar (P0-009) обязателен**, и даже он = миллионы BERT-инференсов (часы-дни CPU). e2e-local никуд НЕ проверен (operational).
4. **Тяжёлый хвост → стратегия по тирам.** Медиана работы крошечная (41 сегмент); считанные романы дают бóльшую часть объёма. Логично processing по size-тирам / приоритезация (короткие сначала = быстрый широкий охват), cap на гигантов.
5. **Эпоха «unknown» у ~92%** → R7: либо принять `era:unknown` (R1-честно, warning-only), либо обогащать из `author_uris` (Wikidata) — отдельная задача, не блокер прогона.

## 3. Дизайн раннера (сверх продюсера)

**Архитектура — переиспользование, без форка:** вынести ядро `ingest-benyehuda.js` (translateWork / translateCached / niqqudCached / translateAndBuild / chapterize / corpus+R1-gate) в **shared-модуль** (`scripts/premium/lib/ingestCore.js`), чтобы раннер и пилотный продюсер звали ОДНУ логику (zero drift, те же R1-гейты). Раннер добавляет orchestration:

1. **Work-ledger** (`/.tmp/benyehuda/ledger.json` или sharded): per-work статус `pending|done|failed|skipped` + counts (segments/ru_filled/niqqud_filled) + content_hash + timestamp. Резюм = пропустить `done` целиком (не пере-сканировать 26K каждый запуск, как делает сегодняшний segment-cache).
2. **Daily-quota stop:** счётчик Gemini-запросов/сутки; стоп при `--gemini-per-day` (def 1500) → «продолжай завтра». Persist счётчика по UTC-дню.
3. **Gemini-429/quota-detect:** различать transient-429 (backoff) от daily-quota-exhausted (стоп на сегодня, не бесконечный ретрай). Сейчас продюсер только timeout+split.
4. **Per-work / per-shard output:** НЕ держать все тексты в памяти + один бандл (текущий код этого не переживёт на 26K). Эмитить **per-era / per-author / size-tier шард-бандлы** (или каталог `catalogue.json` + per-work JSON) — масштабируемо для доставки. Curated-полки отдельно.
5. **Cache-sharding:** монолитные `trans-cache.json`/`niqqud-cache.json` (переписываются после каждой работы) при 26K → сотни МБ, O(n²) запись. → шардить по префиксу ключа / per-work, или полагаться на ledger (готовые works не перезагружать).
6. **Аудио = on-demand (computed-key, P0-011 fix B):** клиент tier-1 вычисляет ключ из текста+canon-профиля (`crypto.subtle`) → HEAD `/api/audio/:key`; **miss → tier-2 BYOK (ключ ПОЛЬЗОВАТЕЛЯ, он и платит) или tier-3 browser-speech (бесплатно)**. Результат BYOK-синтеза кэшируется server-side → следующие читатели получают keyless (tier-1, «донат»). Раннер аудио НЕ предбейкает (кроме curated; владелец может офлайн-предбейкать выбранный тир своим ключом и запушить). **❌ НЕТ user-triggered синтеза на ключе владельца** (см. §5).
7. **QA-сэмплинг по эпохам (R7):** после каждого N-батча — случайная выборка по эпохам/жанрам в отчёт (vocalized_ratio, ru_filled, R1-классы) для ручной проверки качества на масштабе.
8. **R1-инварианты:** `review_status=machine`; провенанс (`benyehuda.org/read/<ID>`) везде; никуд source-first→Dicta; схема аддитивна; перевод требует `orig_language` (переводы — отдельный manifest-путь).

**Acceptance/DoD:** резюм переживает рестарт (ledger); daily-quota стоп+resume; 429-quota отличается от transient; per-shard output не растёт в памяти; QA-сэмпл по эпохам зелёный; 0 R1-нарушений; отчёт прогресса (works done / segments / days-left ETA).

## 4. Развилки для владельца (замер их вскрыл — нужно решение ДО реализации раннера)

| # | Развилка | Варианты | Рекомендация (роли) |
|---|---|---|---|
| A | **Объём** | все 24 641 originals · приоритезация (known-era+короткие сначала, cap на гигантов) · тиры | **Приоритезация по тирам** (R6/R5): короткие originals сначала = широкий охват за дни; гиганты — отдельным хвостом. |
| B | **Скорость перевода** | free-tier ~95 дней $0 · платный Gemini (дни, скромный $) · гибрид | **Гибрид** (R5): free-tier фоном + платный буст на приоритетный тир, если хочется быстрее. |
| C | **Аудио** | on-demand computed-key + LRU [только так и масштабируемо] · предбейк только curated-подмножества · без аудио для хвоста | **On-demand computed-key** (R5/R4): единственное масштабируемое; curated остаётся предбейканным. |
| D | **Никуд** | локальный sidecar (проверить e2e сначала) · Dicta-cloud (троттл) · гибрид | **Локальный sidecar** (R1/R5): снимает облачный cap; но сначала e2e-верификация (operational). |

**Замечание:** раннер-фундамент (ledger / resume / quota / 429 / per-shard output / cache-shard / producer-refactor) **decision-независим** — его можно строить сразу, со стратегией как флагами. Развилки A–D определяют дефолты прогона и аудио-доставку.

### Решения владельца — ЗАФИКСИРОВАНО 2026-06-09
- **A. Объём = приоритезация по тирам** (короткие/средние originals + known-era сначала; гиганты — отдельный capped-хвост).
- **B. Скорость = только free-tier** (1500 Gemini-запросов/день, $0; ~95 дней; раннер: daily-quota-stop + resume).
- **C. Аудио = on-demand computed-key + LRU** (= реализация BRR-P0-011 fix B; раннер хвост-аудио НЕ предбейкает).
- **D. Никуд = Dicta-cloud с backoff** (без локального sidecar; принять троттл; source-first уже снимает 63%).

## 4a. Реализация — статус (2026-06-09)
- ✅ **Замер:** `scripts/premium/measure-corpus-prerun.js` (sample-download + extrapolation, переиспользует `segment`+`by`). Прогон 800 → числа §1.
- ✅ **Work-ledger:** `scripts/premium/lib/corpusLedger.js` (pure: seed/markDone/markFailed/markDeferredGiant/markSkipped, daily-quota accounting, pendingWorks с тирингом, stats) + `tests/premium/corpusLedger.test.js` **6/6**.
- ✅ **Планировщик:** `scripts/premium/run-corpus-prebake.js --plan` — отбор originals, known-era-first ordering, seed ledger, day-schedule + ETA (offline, детерминированно). Прогон: 24 641 originals (known-era 2069 first), ~261 works/day, ETA ~95 дней. `--bake` НАМЕРЕННО не подключён (без заглушки).
- ✅ Регрессия `smoke:benyehuda-ingest` **59/59** (gate = только `lib/benyehuda`, продюсер не тронут). node -c чисто.
- ✅ **bake-loop ОТГРУЖЕН-как-код (2026-06-09, не закоммичено):** `scripts/premium/lib/ingestCore.js` factory (вынесена оркестрация продюсера; `ingest-benyehuda.js` зарефакторен на неё = **zero-drift**; одна корректность-правка: translateCached кэширует только НЕ-пустые переводы → transient/quota-пустышки ретраятся, как в niqqudCached) + `run-corpus-prebake.js --bake` (daily-quota stop, Gemini-quota/429-detect→mark-for-retry, giant-defer по `--giant-segments`, per-era shard-вывод в `.tmp/benyehuda/shards/`, resume через ledger, progress). **Live-проверено end-to-end** (free google-free, limit 2): продюсер `--auto --dry-run` → R1 2 PASS; `--bake` → 2 текста, 2 era-шарда, ledger done 2, resume-корректно. **Caveat:** ledger provider-agnostic → один провайдер на прогон (сменить = удалить ledger; trans-cache provider-keyed, не мешается). Гейты: node -c ×3 · corpusLedger 6/6 · smoke:benyehuda-ingest 59/59 (продюсер lib не тронут).
- 🔜 **Осталось (следующие инкременты):** (1) **giant-pass** — обработать `deferred-giant` (chapterize длинных → per-chapter, как manifest-путь); (2) **delivery 26K** — как per-era шарды попадают к юзеру (on-demand caталог + computed-key аудио, см. §3.6/§5) — отдельный дизайн; (3) **переводы (1814)** — manifest-путь с curated orig_language. *(4) реальный gemini-прогон — ВЫПОЛНЕН, см. §4b.*

## 4b. Реализация — апдейт 2026-06-10 (Gemini-прогон + hardening + QA + инцидент)
**Статус: bake-loop стабилизирован на реальном Gemini-прогоне; раннер durable-устойчив; full-аудит отменён.**

- ✅ **Gemini PILOT выполнен:** `--bake --provider gemini --limit 20 → 100`. Ledger: **done 100 · pending 24541 · failed 0 · deferred-giant 0 of 24641 · 7 era-шардов.** trans-cache provider-keyed (3.3 МБ) делает повторный прогон почти бесплатным (reqs-today ≈1). Резюм вперёд (work 101+) = просто `--bake`.
- 🛠 **HARDENING раннера (uncommitted, `scripts/premium/run-corpus-prebake.js`)** — два реальных бага вскрылись на прогоне, оба исправлены:
  - **(A) hang:** Dicta-cloud-никуд на 484-сегментном тексте без жёсткого дедлайна → `await` не возвращается → `finally` не срабатывает → весь прогон висит. Фикс: **per-work watchdog** `withTimeout` (`--work-timeout` def 600000ms) вокруг `translateAndBuild` И `fetchTxt`; зависший текст → abort → mark failed → ретрай в следующем прогоне.
  - **(B) durability:** построенные строки висели в памяти в `shards`-Map до flush на 300 текстах, а `markDone` срабатывал ДО durable-записи → краш терял works, помеченные «done» (orphaned). Фикс: **durable-flush ВСЕХ эр + save ledger каждые `--flush`=25 works, инвариант flush-ПЕРЕД-save**; **disk-derived `nextShardSeq`** (скан существующих файлов → периодические/ре-ран flush не перезатирают шарды).
  - Маркеры в коде: `FLUSH_WORKS`, `WORK_TIMEOUT`, `withTimeout`, `nextShardSeq` (строки 71–289). Смоук-валидация: `--work-timeout 1` → exit 0 без зависания; `--flush 1` → tehiya-1 + tehiya-2 сосуществуют без перезатирания.
- ✅ **Детерминированный верификатор:** `scripts/premium/verify-bake-shards.js` (untracked) — инспектирует РЕАЛЬНЫЕ строки шардов (не ledger-счётчик cloud-fill): ru% / niqqud% / translit% / R1 / under-vocalized. На 100-work прогоне: 7 шардов / 7834 ивр-строк → ru **100%**, niqqud **98.6%**, translit **99.3%**, passthrough **0**, R1 чисто. Exit 1 при R1-нарушении (гейт).
- ⚠ **QA-жюри (R7 fidelity/fluency + R1 niqqud, скептик-верифай) на 35-строчной выборке:** fidelity 4.46/5, fluency 4.71/5, niqqud 34/35 → **7 confirmed** (11 false-positive убиты): 3 MAJOR-мистранслейта (Rosh Chodesh→«новый день»; фабрикация «масло»; пропущенный глагол), 2 минорных, 2 niqqud (source/OCR). **Вывод: coverage-метрики СЛЕПЫ к семантике — сырой Gemini-MT ~4.46/5, но даёт реальные MAJOR-ошибки (~8.6% в выборке) и редкие фабрикации. `review_status='machine'` — честный backstop.**
- ❌ **Full-аудит 79 прод-текстов (workflow w5q3tbm8m) — ОТМЕНЁН / DEFERRED.** Прогон деградировал на session-limit (`confirmed:0` по ~138/260 батчам), затем авария-выключение. Доверенного `confirmed[]` НЕ произведено; `.tmp/benyehuda/_audit/b-*.json` = только ВХОДНЫЕ батчи (не вердикты). **НЕ перезапускать** (дорого по токенам/лимиту, не дал результата). **Замена: дешёвый точечный R7-сэмплинг** (по era/register/прозе, где слабее Dicta) + правки по жалобам пользователей.
- 🔧 **Durable-корректор (untracked, INACTIVE):** `scripts/premium/apply-canon-corrections.js` — применяет `confirmed[]` к canon-v2 (правит `russian`; mis-patch-guard сверяет старое значение; honest `edit_meta`; `review_status` остаётся machine; niqqud-правки OFF без `--include-niqqud`, т.к. меняют иврит → ре-кей аудио). **Запускать только при доверенном `confirmed[]` + sign-off владельца.** 1 известная живая ошибка в прод canon-v3: `by-38/r74` «השיר הראשון» «וּבְיוֹם הַחֹדֶשׁ» → «И в новый день» (надо: новомесячье/Rosh Chodesh).
- ⚡ **ИНЦИДЕНТ 2026-06-09→10:** авария-выключение убила фоновые процессы. Reconcile 2026-06-10: **потерь нет** — бейк завершился чисто ДО аварии, ledger/шарды/hardening целы. Детали: `.remember/remember.md`, session-start: `docs/SESSION_START_BRR_2026_06_10.md`.
- ✅ **GIANT-PASS (Проход-2) SHIPPED 2026-06-10:** режим `--giant-pass` обрабатывает ТОЛЬКО `deferred-giant` из ledger. `lib/benyehuda.chapterizeGiant` (чистая): честная структура сначала (`chapterizeWork`, дефолтные R7-гейты — строфные нумералы НЕ главы), затем cap-энфорсмент — часть свыше `--giant-segments` дробится по абзацам (~12K зн.), патологические тела без абзацев — группировкой сегментов самого сегментера. **Инвариант: каждая часть ≤ cap; гигант НИКОГДА не уходит одним монолитным text.** Части = канон-контракт (`series{work_byehuda_id,work_title,part,total}`, text_id `by-<id>-c<N>`) + полка-TOC `by-work-<id>`; эмиссия АТОМАРНА per work (частичный гигант остаётся `deferred-giant` с error, не failed; trans-cache делает ретрай почти бесплатным; дублей частей между шардами не бывает) + flush каждый work (TOC в одном шарде с главами). Ledger: `giantWorks()` селектор + поле `parts`. Гейты: `tests/premium/corpusLedger.test.js` 8/8 · **`npm run smoke:giant-pass` 30/30 офлайн / 39/39 c `--real`** (реальные романы канона: 413→5 глав, 49→3, 95→17 — БАЙТ-в-байт с каноном по структуре, потери ≤1.5% = только маркер-строки) · e2e-проводка на изолированном ledger чиста, реальный ledger не тронут.
- ▶ **Следующее:** RESUME bake вперёд (work 101+, `--bake`, сначала `--limit 250/500`); перед rest-tier — niqqud-probe на 20–50 rest works (§4b ниже).

## 5. Безопасность ключа TTS — ПРОВЕРЕНО 2026-06-09 (ответ на вопрос владельца про вариант C)
**Вывод: пользователь НЕ может синтезировать TTS на ключе владельца.** Подтверждено по коду + проду:
- **Прод не держит серверного TTS-ключа:** `GET /api/tts/key` → `{"configured":false}` (нет `GOOGLE_CLOUD_TTS_KEY`, нет загруженного `/app/data/gcp-tts-key.json`, нет ADC).
- **Оба пути синтеза `/api/tts` = BYOK-only:** `synthesizeMp3Buffer` (v3 `ensureAudioAsset`, ридерский путь, server.js:1831) и `synthesizeWithCache` (legacy, server.js:1729) на cache-miss без `apiKey` → **401 `TTS_KEY_REQUIRED`**; синтез всегда через `gcpTtsRestSynthesize(apiKey,…)` с **ключом из запроса** (BYOK), НИКОГДА не серверным. Проба keyless-legacy на проде → 400 (не аудио).
- **Ключ владельца живёт только локально:** канон бейкался на машине владельца, MP3 запушены; ключ на прод не попадает.
- On-demand хвост-аудио: tier-1 keyless cached-read (free) → tier-2 BYOK (ключ пользователя) → tier-3 browser-speech (free). **Ни один путь не тратит ключ владельца.**
- Остаточно (минор): если владелец КОГДА-ЛИБО загрузит серверный ключ через admin `/api/tts/key`, у `/api/tts` нет per-call rate-limit — но даже тогда REST-пути используют per-request ключ, не серверный. Cache-READ всегда keyless (норм). Связано с уже зафиксированным BRR-P1-013.
