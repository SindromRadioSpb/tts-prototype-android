# BRR Context-Overlay — ОФЛАЙН авторитетная контекст-морфология тап-карты · RECON (measure-before-code) · 2026-07-02

> **Статус: RECON → ждёт sign-off владельца по развилкам §8.** Задача №1 стратегического
> шорт-листа (воркфлоу fable5-strategic-scope). Обобщение доказанного proclitic-overlay-паттерна
> (Phase-3, `BRR_PROCLITIC_PHASE3_HANDOFF_2026_07_01.md`) на контекстную дизамбигуацию:
> убрать per-tap runtime-зависимость от Dicta (nakdan `/api` дал 503-аутэйдж ~6ч 2026-07-01)
> для всех baked-работ Зала. Роли: R10 (вед.) · R11 · R1 · R9 · R5 · R3.

---

## 1. Цель

Тап неоднозначного слова в baked-работе получает **контекстное чтение без сети**: Dicta-разбор
предложения предвычислен на бейке и лежит per-work оверлеем на томе (как proclitic/), рантайм
сливает его тем же R11-проверенным путём, что и живой Tier-3. Готово = офлайн-хвост честности
поднят к уровню live-Tier-3 (~90%) на baked-работах, control-precision не просела (floor 97.2%
vs human-gold), провенанс честный («контекст (офлайн, предвыч.)»), gold-gate зелёный, живой
Dicta остаётся только для un-baked/imported текстов.

## 2. Заземление — что ИЗМЕРЕНО перед дизайном (R10)

**2.1. Ошибка исходной предпосылки (поймана, исправлена).** Промт задачи утверждал «кэш бейка
содержит context-POS/niqqud/lemma/binyan». Фактически `build-proclitic-overlay.js` редуцировал
токены до `{word, pre, stem, pos, conf}` — niqqud/lemma/binyan **отбрасывались** (строка 88).
Исправлено в `492d1e5`: кэш-райтер теперь сохраняет полный токен (`+nq/lem/lems/bin`); добейк
перезапущен в rich-форме (записи без `nq` = legacy, только POS-сигнал).

**2.2. Кэш (сырьё), на 2026-07-02 00:30:** 43 464 предложения · 331 777 токенов ·
POS-состав: content 60.3% / function 29.1% / прочее 10.6% · ~7.6 токена/предложение.
Ledger: 530/796 работ done, degraded 75→35 и падает (rich-добейк жив, circuit-breaker работает).

**2.3. Runtime-шов (контракт уже существует).** `library-ui.js makeContextProvider()` (:551)
отдаёт `{niqqud, posDicta, lemma}` для `(sentence, surface)`; `reader-morph.js` тап-хендлер
(:1488) берёт `sentence = row.he` и зовёт `resolveWordLight(surface, niqqud, ctx)` (:654),
который прогоняет ctx через **`pickContextReading`** (:364) — pure, Node-testable, с уже
зашитыми R11-гвардами (бага בקר→«скот» закрыта именно здесь). Бейк анализирует
`rows[].hebrew_plain` тех же работ → та же строка, что runtime `row.he` (инвариант §5.2).

**2.4. Метрика уже есть.** Независимый human-gold: `docs/research/reader-morph-gold/2026-06-25/`
(172 аннотированных строки, страты control/tail; **control precision «exact» = 97.2%**,
Nakdan-silver↔gold = 86.7% на архаике). Харнесс: `reader-morph-audit.js` `--gold` (score) +
`--regold` (re-resolve live + re-score). Офлайн-хвост честности сейчас **54.5%** (v3.11.3,
L1–L5+R2); live-Tier-3 поднимает до **~90.3%** (silver-мера, Epic-1).

**2.5. Декомпозиция Tier-3-лифта (из Epic-1) — определяет, что хранить.**
`pickContextReading` чинит хвост тремя путями:
- **(B) content→function демоция** (וְעַד→предлог…): нужен только **ctx.pos** — есть в legacy-кэше;
- **(C) participle-soften** (הוֹרָה…): нужен только **ctx.pos** — есть в legacy-кэше;
- **(A) контекст-переразбор** (промоция non-exact → context-exact): нужен **ctx.niqqud** — только rich.

B+C дали основную часть лифта Epic-1 (20.4%→54.8%→90.3% хвоста); A добивает промоцию и
возвращает over-hedge (34.6% по gold — недоданная ценность моата).

**2.6. Node-осуществимость бейк-тайм селекции.** `reader-morph.js` — dual-export (:24, :2152);
`resolveCore(eng,…)` принимает eng параметром; `notes-autogen.js` + датасет
`pealim-infl-v12.json.gz` уже грузятся в Node (`build-notes-from-bundle.js`) — браузер-онли
был только путь загрузки через fetch+OPFS, не данные. Значит продюсер может реплеить офлайн-резолв
и селекцию локально, без Playwright и без Dicta.

## 3. Архитектура (обобщение proclitic-паттерна)

```
[бейк]   rich Dicta-кэш (предложение→токены) ──┐
         Node-реплей офлайн-резолвера          ├─→ продюсер --context → public/data/benyehuda/context/<id>.json
         (селекция: где ctx меняет исход)      ┘        (том, gitignored; _meta версии)
[пуш]    push-скрипт (клон push-proclitic-overlay) + server mount/route (клон proclitic-паттерна)
[рантайм] library-ui: loadContextOverlay(work) → provider-chain: BAKED → (un-baked only) live+consent
         reader-morph: ТОТ ЖЕ resolveWordLight/pickContextReading; новый провенанс-бейдж
[гейт]   smoke:reader-context — HERMETIC: frozen human-gold + frozen ctx-фикстура (без live Dicta)
```

### 3.1. Формат оверлея (homograph-SELECTIVE, п.3 промта)

```json
{ "_meta": { "model": "<Dicta MODEL_VERSION>", "producer": "build-context-overlay v1",
             "resolver": "<notes-autogen rev>", "work": "<id>", "sents": N, "entries": M },
  "sents": ["<fnv32-хэш нормализованного предложения>", ...],        // ВСЕ проанализированные
  "ctx": { "<sentHash>": { "<surface-skeleton>": { "nq": "…", "pos": "…", "lem": "…" } } } }
```

- **Ключ предложения** = FNV-1a-хэш от niqqud-stripped + whitespace-нормализованной строки
  (урок `feedback_cloze_key_by_skeleton`: скелет, не индексы). Ключ токена = surface-skeleton.
- **Селективность:** запись создаётся ТОЛЬКО там, где бейк-тайм реплей показал
  `pickContextReading(...) ≠ offline` ЛИБО офлайн-карта non-decisive (label≠exact или ambiguous).
  Хранится **факт** (Dicta-токен), не решение — см. D2.
- **`sents`-список** делает промах осмысленным (§3.3): sentHash ∈ sents + нет записи токена =
  «офлайн-чтение подтверждено, ctx не нужен» (авторитетный промах); sentHash ∉ sents =
  «предложение не анализировано» (дрейф текста / новая версия) → просто офлайн, без ложных выводов.

### 3.2. Алгебра приоритета/слияния (п.1 промта — ядро R11)

**Главное решение: НЕ изобретать новую алгебру.** Baked-ctx и live-ctx — один эпистемический
ярус (тот же Dicta, тот же ненадёжный re-niqqud на голом архаичном тексте — ловушка בקר).
Различие только операционное: baked = офлайн/детерминирован/заморожен, live = сеть/дрейф.
Поэтому оба источника подаются в **ОДИН** проверенный `pickContextReading`, который уже кодирует
все do-no-harm-переходы:

| Переход | Гвард (уже в коде) | Источник ctx |
|---|---|---|
| (B) демоция content→function + курир. глосс | ctx.pos ∈ FUNC ∧ (CONTEXT_GLOSS ∨ offline-content) | pos (legacy ok) |
| (A) промоция non-exact → context | offline.label≠exact ∧ ctxCard decisive ∧ POS согласован ∧ pid≠ | nq (rich) |
| (C) soften exact→likely (verb↔nominal спор) | оба content ∧ ось расходится | pos (legacy ok) |
| иначе | — | offline без изменений |

**Инварианты алгебры (tripwire в гейте):** offline-«exact» НИКОГДА не перезаписывается другим
чтением (A требует non-exact); exact может быть только СМЯГЧЁН (C), никогда не переглоссирован;
провенанс «контекст» всегда машинный бейдж, не «точно». Порядок источников: **baked → live**,
причём live НЕ вызывается для работ с оверлеем (§3.3) — сеть уходит из тап-пути baked-работ
полностью.

**Совместимость с proclitic-overlay:** ортогональны — proclitic-оверлей питает
`ProcliticSegment.detect` (chip-ряд «Приставки», аддитивен к основе), context-оверлей питает
`pickContextReading` (чтение основы). Общие: том-паттерн, пуш-инфра, кэш-сырьё. Конфликтов нет.

### 3.3. Runtime-слияние и consent (R5)

`makeContextProvider` становится цепочкой:
1. Есть context-оверлей текущей работы? → lookup по (sentHash, surfaceSkeleton):
   - запись → вернуть `{niqqud: nq, posDicta: pos, lemma: lem, source: 'baked'}` — **без consent,
     без сети** («Tier-3 default-on-офлайн», п. плана 3);
   - sentHash ∈ sents, записи нет → вернуть null-authoritative (офлайн подтверждён; live НЕ зовём);
   - sentHash ∉ sents → как un-baked (ниже).
2. Оверлея нет / предложение неизвестно (imported, свежая работа) → текущий live-путь c consent
   (модал переформулировать: сеть теперь нужна ТОЛЬКО для не-предвычисленных текстов).

### 3.4. Провенанс — 4-уровневая таксономия (п.2 промта, R9 derived≠asserted)

| Уровень | Источник | Бейдж (ru) | label/card-поля |
|---|---|---|---|
| offline-exact | форма-решающая ячейка словаря | «точно» | label=exact (как сейчас) |
| **baked-context** | предвыч. Dicta-разбор предложения | **«контекст (офлайн, предвыч.)»** | label=context + contextSource='baked' |
| live-context | живой Dicta на тапе | «контекст (Dicta)» | label=context + contextSource='live' (как сейчас) |
| human-gold | frozen аннотация владельца | (не UI — только мера) | gold worksheet |

Новые i18n `room.morph.ctxBadgeBaked` (+en/he), `smoke:i18n`. Derived≠asserted: оба context-уровня —
машинные, ниже «точно»; human-gold никогда не смешивается с продовыми источниками (только гейт).

## 4. Бюджет размера (п.3 промта — эмпирическая оценка)

331 777 токенов / 530 работ ≈ 626 ток./работу; полный корпус ~500K токенов. Селекция
(non-exact + B/C-переходы) по gold/audit-статистике ≈ 10–15% → **~50–75K записей на 796 работ**.
Запись ≈ 60–90 байт (хэш-ключи!) + sents-список (~80 хэшей × 8 байт/работу) →
**оценка: 4–7 МБ суммарно, ~6–9 КБ/работу** — сопоставимо с proclitic-оверлеями, том выдержит.
Точный замер — gate-артефакт фазы P2 (лог продюсера печатает распределение).

## 5. Риски / инварианты

- **5.1 R11 do-no-harm:** вся алгебра — через существующие гварды; гейт добавляет hard-zero:
  ни одна gold-строка, где офлайн был ВЕРНО-exact, не меняет чтение при оверлее.
- **5.2 Ключевой инвариант текста:** bake-`hebrew_plain` ≡ runtime-`row.he` — проверяется в P2
  скриптом (по 530 baked-работам: % предложений работы, находимых по хэшу из кэша; floor ≥99%);
  расхождение → чиним нормализацию ДО продюсера.
- **5.3 Oracle-independence (R9/R11):** гейт меряет ТОЛЬКО против frozen human-gold; Dicta-фикстура
  заморожена коммитом (как proclitic overlay-fixture); никакого Dicta-vs-Dicta.
- **5.4 Свежесть селекции:** факты в кэше → эволюция резолвера = локальный ре-реплей селекции
  БЕЗ Dicta (дёшево); `_meta.resolver` + напоминание в publish-скилле.
- **5.5 Dicta-бережность:** добор — только через circuit-breaker-продюсер, concurrency=2,
  targeted (§8 D4); `feedback_bulk_dicta_bake_ratelimit`.
- **5.6 Parity:** index.html не трогаем; `smoke:reader-parity` зелёный; всё Room-only.
- **5.7 Занятые токены-гомографы в одном предложении** (два одинаковых surface с разными
  чтениями): live-путь имеет тот же предел (`tokenForSurface` берёт первый) — паритет, зафиксировать
  как known-limit, occurrence-index — отдельный опц. апгрейд.

## 6. Метрика и гейт (п.4 промта)

**`smoke:reader-context`** (новый, зеркало `smoke:reader-proclitic`, HERMETIC):
1. **Фикстура:** `--context-fixture` режим продюсера — Dicta-ctx-токены для всех 172 gold-строк
   (из кэша; замороженно коммитится в `docs/research/reader-morph-gold/2026-06-25/ctx-fixture.json`).
2. **Мера:** regold-скоринг с оверлей-каналом (`--regold --ctx=fixture`, без live):
   - **control-floor (hard):** precision «exact» на control-страте ≥ 97.2% (= baseline);
   - **do-no-harm (hard zero):** верно-exact офлайн-строки не меняют чтение;
   - **tail honest (soft→floor после замера):** цель ≈ live-Tier-3 (~90%); floor фиксируем
     по первому overlay-замеру (паттерн D2 Epic-1: не выдумывать порог до данных);
   - **oracle-independence assert:** фикстура ≠ дериват гейт-логики (структурная проверка, как
     в proclitic-гейте);
   - **miss-semantics assert:** sentHash∉sents → офлайн без изменений (нет ложной авторитетности).
3. Плюс существующие: `smoke:reader-morph` (+ассерты provider-chain) · `reader-parity` ·
   `i18n` · `reader-proclitic` (не регрессит).

## 7. Фазы

- **✅ P0 (сделано 2026-07-02):** rich кэш-райтер (`492d1e5`), добейк перезапущен rich
  (530/796, degraded 75→35↓), gate 47/47.
- **P1 (этот док):** recon + sign-off владельца по §8.
- **P2 — продюсер:** Node-шим офлайн-движка (gz напрямую, lock-step с браузером) → инвариант 5.2
  замер → селекция-реплей → `--context` режим → per-work сайдкары + бюджет-отчёт;
  `--enrich-cache` targeted-добор nq (D4). Адверс. критика R11/R10/R1/R9 ДО кода рантайма.
- **P3 — гейт:** ctx-фикстура gold + `smoke:reader-context` + первый overlay-замер → floors.
- **P4 — рантайм:** provider-chain + бейдж/i18n + consent-rescope + 380px скрин + все гейты.
- **P5 — rollout:** server mount/route + push-скрипт + полный бейк корпуса + том-пуш +
  publish-corpus-batch wiring + commit/push/prod-verify.

## 8. Развилки → sign-off владельца

| # | Вопрос | Рекомендация | Альтернатива |
|---|---|---|---|
| **D1** | Алгебра слияния | **Переиспользовать `pickContextReading` verbatim** (baked-ctx в тот же шов; никакого «overlay первым» поверх exact) | новый precedence-слой (риск повторить בקר) |
| **D2** | Что хранить | **Факты** (Dicta-токен nq/pos/lem) — R9 derived≠asserted, дешёвая эволюция резолвера | решения (компактнее, но протухает с резолвером) |
| **D3** | Семантика промаха | **sents-список хэшей** → селективный промах авторитетен, дрейф честен | хранить все токены (×7 размер) |
| **D4** | Legacy-кэш без nq (42.6K предл.) | **Targeted-добор:** re-fetch ТОЛЬКО предложений с path-A-кандидатами (~10–15% ≈ 4–7K предл., ~2–4ч gentle); B/C-демоции работают с legacy-pos сразу | полный re-fetch 43K (~20ч, лишняя нагрузка на Dicta) · только-B/C без A (теряем промоцию) |
| **D5** | Floors гейта | **control hard 97.2% + do-no-harm zero сразу; tail-floor по первому замеру** (D2-паттерн Epic-1) | назначить 90% вслепую |
| **D6** | Consent для baked | **Default-on офлайн, без модала** (сеть не используется); live-consent остаётся для un-baked | сохранить один consent на всё |
| **D7** | Раскладка на томе | **Отдельный сайдкар `context/<id>.json`** + генерализованный пуш | влить в proclitic/<id>.json (сцепляет несвязанные жизненные циклы) |

---
*Сгенерировано: сессия 2026-07-02, Fable 5. Источник-команды: см. §2 (замеры воспроизводимы:
census-скрипт по кэшу, grep-точки reader-morph.js:364/654/1488, library-ui.js:551).*
