# SESSION STATE — BRR resolver-correspondence (2026-06-11) — READ FIRST

> **Git: main = HEAD `97b0993`, всё запушено. Prod SW `v3.10.31-room-context-mode`. 3-тировый roadmap
> карточка↔Pealim ЗАВЕРШЁН (Тир-1/2/3 + 3a — все в проде).**
> Единый консолидированный handoff для продолжения (новая или текущая сессия). Project =
> LinguistPro (Node PWA, HE↔RU). Prod: https://linguistpro.kolosei.com. Роли R1–R10 авто
> (`docs/PROJECT_ROLES.md`). Owner-инвариант: «бескомпромиссное качество, без заглушек».
> Связанные планы: `docs/planning/BRR_RESOLVER_CORRESPONDENCE_ANALYSIS_2026_06_11.md`,
> `BRR_TIER2_RENIQQUD_RUNBOOK_…`, `BRR_TIER3_CONTEXT_MODE_…`, `BRR_P1_007_I_PLUS_1_RECON_…`,
> `BRR_P1_009_WORD_STATUS_AND_NIQQUD_AUDIT.md`. Live-буфер: `.remember/remember.md`.

## Контекст вопроса
Владелец: «при тапе не всегда выходит ожидаемое Pealim-слово; как РЕАЛЬНО поднять соответствие
карточка↔Pealim?» → measured-разбор → роль **R10** (вычислит. морфолог; измеримость обязательна;
честный гейт глосса) → **3-тировый roadmap**, все продвинуты за эту сессию.

## Что сделано (хронология, каждый PROD/гейт-верифицирован)
- **R10** в каноне + measured-анализ (`bc6c4c0`): 74% служебных слов получали ЧУЖОЙ контент-глосс.
- **Тир 1 — честный гейт глосса** (`e63dd8b`, SW `v3.10.30-room-gloss-gate`, PROD): `reader-morph.functionGate`
  + gated `resolveCore`. Служебная форма → честное чтение, без ложной таблицы/ссылки; контент цел.
  Замер: recall 87%, реальных FP 0. אֵין→«нет», עָלֵינוּ→«на нас», אֲפִלּוּ→«даже»; יֶלֶד/לִבֵּנוּ целы.
- **Тир 2 — niqqud-only re-bake** (`09651fe` тул; данные ОПУБЛИКОВАНЫ на прод): `reniqqud-fill.js`
  (`reniqqud:fill`, `smoke:reniqqud` 6/6) — пер-словная text-safe реконструкция (скелет-матч → исходник
  не меняется), Yiddish-гейт (R7), бэкап-first. **109 Hebrew works 40%→91%, 0 порчи; resolver
  exact|likely 2%→51% (11778).** 1 идиш (47097) пойман adversarial Workflow (16 агентов, ship-with-notes
  13/15) → исключён. **ОПУБЛИКОВАНО: 109 тел на прод-том** (`push-corpus-works.js --ids-file
  reniqqud-publish-ids.json`, token владельца), PROD-верифи: 11778=94%/16477=88%/40=96% niqqud.
  staleWhileRevalidate → юзеры видят на 2-е открытие; SW-бамп не нужен.
- **Тир 3a — honest degradation** (`5a287a6`, ЗАДЕПЛОЕНО + браузер-верифи Kapture): `morphologyGateway`
  — непустой иврит + 0 токенов → `degraded:true`. Деплои НЕ застревали (Coolify Success).
- **⚠ EGRESS-МИФ РАЗВЕЯН:** «прод не достаёт Dicta» = артефакт Windows-curl (слал «????» → Dicta пусто).
  С корректным UTF-8 (Node/браузер) прод `/api/morphology` ОТДАЁТ реальные контекст-токены (הַיּוֹם→adverb,
  עלינו→preposition). Тир-3 работает И сервер-сайд (существующий эндпоинт) И клиент-сайд.
- **Тир 3 «ТОЧНЫЙ РЕЖИМ» ОТГРУЖЕН** (путь C client-side, measurement-driven): opt-in тумблер «🎯 Точный
  режим (Dicta)» в reader-aids → на тап шлёт предложение в Dicta, `pickContextReading` честно дизамбигует.
  **Measure-first исправил наивный дизайн:** не просто niqqud-feed (регрессировал היום), а POS-guard (тип A) +
  курир. `CONTEXT_GLOSS` для наречий (тип B: היום→«сегодня», מעט→«мало», מספיק→«достаточно»). RETEST: FP=0,
  broke=0, починено 4–5 гомографов, 10/12 gold. `reader-morph.js`(хук+pickContextReading+context-label) ·
  `library-ui.js`(тумблер+provider+кэш) · `library.html`(CSS+script) · locales · `sw.js` bump
  `v3.10.31-room-context-mode`. Gate `smoke:reader-context` (graceful-skip при Dicta-503). index.html не тронут.
  Дизайн+результаты → `BRR_TIER3_CONTEXT_MODE_2026_06_11.md`. NB: Dicta троттлит при массовом тесте (HTTP 503).

## Текущее состояние тиров
- Тир 1: **в проде**, закрыт. Тир 2: **в проде** (109 тел), закрыт; остаток ~10% — контент-гомографы.
- Тир 3a: **задеплоено** (`5a287a6`); прод `/api/morphology` отдаёт токены (egress работает).
- Тир 3 «точный режим»: **ОТГРУЖЕН-как-код** (путь C, SW v3.10.31). Тест-петля сошлась (FP=0). Коммит+прод-
  верифи тапом — после Dicta-recovery (троттлит 503 при массовом тесте). OFF-mode байт-идентичен.

## NEXT (owner picks)
1. **i+1 «Следующий для тебя» (BRR-P1-007)** — ✅ recon-замер ВЫПОЛНЕН + дизайн УТВЕРЖДЁН + **S1
   SHIPPED** (`3f87b60`, 2026-06-12). Полное состояние → **`docs/planning/BRR_P1_007_I_PLUS_1_DESIGN_2026_06_12.md`**
   (READ для продолжения). Владелец выбрал агрессивный путь (полный A / все эпохи / «26K» / без курации;
   честность на уровне поля). Замерено: офлайн match 86.7%, сайдкар ~2.5МБ gz @8099. i+1-рекомендатель =
   гипотеза (validate-in-prod). **S1+S2+S3 SHIPPED+PROD** (`3f87b60`,`e2b4ebc`,`bdf3ae5`, SW
   `v3.10.33-room-coldstart-badges`): S1 producer+гейт; S2 клиент-движок `corpus-vocab.js`
   (`window.CorpusVocab`/`CorpusVocabRoom`) + ленивый сайдкар `corpus-vocab-v7.json` + two-channel
   coverage; **S3** producer `ez` + Рельс2 «🌱 С чего начать» (top-12 ready по лёгкости, profile-free) +
   progressive coverage-бейдж (профиль-gated %, zone-цвет + load-флаг) + cache-bust `CORPUS_VOCAB_DATA_REV`.
   Гейты `smoke:corpus-vocab(-engine)` 15+23, corpus-room 18, room 14; прод-верифи браузером @380px
   (рельс+локаль+ez ок). **NEXT = S4** (Рельс1 «Следующий для тебя» персональный i+1, рендер при ≥N в зоне).
2. ~~Тир 3 «точный режим»~~ — ОТГРУЖЕН (путь C). NEXT-полиш: больше `CONTEXT_GLOSS`-наречий по мере находок;
   опц. контекст для bulk-цвет-статуса (сейчас офлайн); ranked-кандидаты.
3. ~~Тир 3a деплой~~ — СДЕЛАНО (`5a287a6` задеплоен; egress-миф развеян, прод Dicta работает).
4. Полиш: ranked-candidate senses; «Подробнее → Студия» deep-link; GCP-WaveNet form-audio.

## 🔧 Owner-решения / открытое
- ~~16/100 tracked work-JSON~~ — РЕШЕНО (`3fa3c20`): untrack + gitignore `public/data/benyehuda/works/`
  (все тела — volume-only, single source of truth; не фикстуры; прод отдаёт с тома; reversible `git add -f`).
- **47097 — идиш, мис-категоризован** в ивритском корпусе → исключить из Зала или идиш-вокализатор (R6/R7).
  Авто-пропускается Yiddish-гейтом `reniqqud-fill`.
- 🔑 **Ротация секретов (срочно):** `AUDIO_UPLOAD_TOKEN` (вставлен+использован в чате 2026-06-11 → в
  транскрипте!) + Gemini + старый GCP TTS key.
- ~~**Тир-3 позитивный тап**~~ — ✅ ПОДТВЕРЖДЁН владельцем с устройства (2026-06-12): тумблер «🎯 Точный
  режим» → тап הַיּוֹם → бейдж «контекст (Dicta)» + «сегодня». Тир-3 закрыт полностью.

## Гейты (зелёные на HEAD)
`smoke:reader-morph`(+R10) · `smoke:reader-notes` · `smoke:reader-parity` (index.html не тронут) ·
`smoke:reniqqud` 6 · `smoke:reader-dicta` + `smoke:reader-context` (сетевые, graceful-SKIP при Dicta-503) ·
`smoke:corpus-nav` 33 · `corpus-room` 18 · `room` 14 · `room-mode` 23 · `audit:autogen-quality` 0R1 ·
`audit:corpus-niqqud` · `test:api-smoke`. Норма: @380px RTL скрин перед UI-коммитом; **index.html НЕ трогать**.
Харнессы (.tmp, gitignored): `context-mode-verify.js` (Тир-3 recall/FP), `qa-verify-gate.js` (Тир-1).

## Ключевые файлы
`public/js/reader-morph.js` (functionGate+gated resolveCore) · `reader-dicta.js` (client Dicta) ·
`inflection-render.js` · `library-ui.js` · `db/premium/morphologyGateway.js` (honest-degr) ·
`scripts/premium/{reniqqud-fill,reniqqud-smoke,reader-dicta-smoke,push-corpus-works(+--ids-file),audit-corpus-niqqud}.js`.
Бэкап Тир-2: `.tmp/benyehuda/reniqqud-backup/`. Publish-list: `.tmp/benyehuda/reniqqud-publish-ids.json`.

## Промт для НОВОЙ сессии (копипаст)
```
Продолжаем BRR Reading Room (LinguistPro — Node PWA, иврит↔рус, prod linguistpro.kolosei.com).
READ FIRST: docs/SESSION_STATE_BRR_RESOLVER_2026_06_11.md + .remember/remember.md + docs/PROJECT_ROLES.md
(роли R1–R10 применяй авто; R10 = вычислит. морфолог: дизамбигуация + ИЗМЕРИМОСТЬ обязательна).
Инвариант владельца: бескомпромиссное качество, без заглушек.

НОРМЫ (стоячие): index.html НЕ трогать (Зал = public/library.html, шарят OPFS-движок); большие фичи →
recon-first дизайн в docs/planning/<TICKET>.md НА УТВЕРЖДЕНИЕ до кода; MEASURE до кода (харнесс .tmp,
паттерн qa-verify-gate); развилка → варианты по ролям + рекомендация, решает владелец; гейты зелёные
до push; commit+push автономно (Coolify авто-деплой); prod-verify после; SW CACHE_VERSION бамп при смене
shell-ассета; @380px RTL скрин перед UI-коммитом. ⚠ НЕ диагностировать «прод не достаёт Dicta» Windows-
curl'ом — он калечит UTF-8-иврит в «????»; проверяй Node fetch/браузером (egress РАБОТАЕТ).

СОСТОЯНИЕ (всё в проде): 3-тировый roadmap «соответствие карточка↔Pealim» ЗАВЕРШЁН —
  Тир-1 честный гейт служебных слов (SW v3.10.30) · Тир-2 re-niqqud 109 работ ОПУБЛИКОВАНО (resolver
  exact|likely 2%→51%) · Тир-3a honest-degradation (5a287a6) · Тир-3 «точный режим» (контекст-Dicta,
  client-side, SW v3.10.31, 97b0993) — opt-in тумблер «🎯 Точный режим», pickContextReading, FP=0.
  Learner-loop Зала полон: читай→тап→1:1-карточка→Сохранить→цвет-статус→Anki.

СЕГОДНЯ я хочу: <ВЫБОР>
  (a) i+1 «Следующий для тебя» (BRR-P1-007) — БОЛЬШАЯ фича, последний keystone. Ответь на 4 решения из
      docs/planning/BRR_P1_007_I_PLUS_1_RECON_2026_06_11.md (главное №1: строить per-work vocab-профиль на
      publish-time, сайдкар corpus-vocab-v<N>, вариант A?). Я начну с recon-замера (размер сайдкара/качество).
  (b) Тир-3 полиш — расширить CONTEXT_GLOSS-наречия по находкам; перепрогнать smoke:reader-context
      позитивный путь (когда Dicta не троттлит); опц. контекст для bulk цвет-статуса (сейчас офлайн).
  (c) другое / полиш (ranked-candidate senses; «Подробнее→Студия» deep-link; GCP-WaveNet form-audio).

ОТКРЫТО (owner): 🔑 СРОЧНО ротация AUDIO_UPLOAD_TOKEN (был в чате) + Gemini + GCP TTS key;
47097 = идиш в ивр. корпусе (исключить/идиш-вокализатор, R6/R7); Тир-3 позитивный тап подтвердить с
устройства владельца (мой IP был Dicta-503-throttled). Начни с recon-first дизайна НА УТВЕРЖДЕНИЕ.
```
