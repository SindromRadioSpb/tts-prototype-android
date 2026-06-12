# SESSION STATE — BRR resolver-correspondence (2026-06-11) — READ FIRST

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
1. **i+1 «Следующий для тебя» (BRR-P1-007)** — нужен recon + **4 решения владельца** (см.
   `BRR_P1_007_I_PLUS_1_RECON_…`): №1 строить vocab-профиль работ на publish-time (вар. A, рекоменд)?
   №2 пороги «знаю»/зоны i+1; №3 холодный старт; №4 публикация сайдкара. Дай ответы → начну с пробы-замера.
2. ~~Тир 3 «точный режим»~~ — ОТГРУЖЕН (путь C). NEXT-полиш: больше `CONTEXT_GLOSS`-наречий по мере находок;
   опц. контекст для bulk-цвет-статуса (сейчас офлайн); ranked-кандидаты.
3. ~~Тир 3a деплой~~ — СДЕЛАНО (`5a287a6` задеплоен; egress-миф развеян, прод Dicta работает).
4. Полиш: ranked-candidate senses; «Подробнее → Студия» deep-link; GCP-WaveNet form-audio.

## 🔧 Owner-решения / открытое
- **16 из перебейканных работ git-TRACKED** (legacy seed) → modified-uncommitted на диске (niqqud улучшен,
  опубликован). НЕ закоммичены (норма bodies-on-volume). Решить: commit-as-data ИЛИ untrack+gitignore.
  Откат потеряет niqqud для них. Связано с .gitignore-вопросом ниже.
- ~500 untracked + 16 tracked work-JSON — добавить тела в `.gitignore` / untrack?
- **47097 — идиш, мис-категоризован** в ивритском корпусе → исключить из Зала или идиш-вокализатор (R6/R7).
- 🔑 **Ротация секретов:** `AUDIO_UPLOAD_TOKEN` (вставлен в чат сегодня!) + Gemini + старый GCP TTS key.

## Гейты (зелёные на HEAD)
`smoke:reader-morph`(+R10) · `smoke:reader-notes` · `smoke:reader-parity` (index.html не тронут) ·
`smoke:reniqqud` 6 · `smoke:reader-dicta` (сетевой, SKIP офлайн) · `smoke:corpus-nav` 33 · `corpus-room` 18 ·
`room` 14 · `room-mode` 23 · `audit:autogen-quality` 0R1 · `audit:corpus-niqqud` · `test:api-smoke`.
Норма: @380px RTL скрин перед UI-коммитом; **index.html НЕ трогать** (Зал = library.html).

## Ключевые файлы
`public/js/reader-morph.js` (functionGate+gated resolveCore) · `reader-dicta.js` (client Dicta) ·
`inflection-render.js` · `library-ui.js` · `db/premium/morphologyGateway.js` (honest-degr) ·
`scripts/premium/{reniqqud-fill,reniqqud-smoke,reader-dicta-smoke,push-corpus-works(+--ids-file),audit-corpus-niqqud}.js`.
Бэкап Тир-2: `.tmp/benyehuda/reniqqud-backup/`. Publish-list: `.tmp/benyehuda/reniqqud-publish-ids.json`.

## Промт для НОВОЙ сессии (копипаст)
```
Продолжаем BRR resolver-correspondence (LinguistPro, Node PWA, prod linguistpro.kolosei.com).
READ FIRST: docs/SESSION_STATE_BRR_RESOLVER_2026_06_11.md + .remember/remember.md + docs/PROJECT_ROLES.md
(роли R1–R10 авто; R10 = вычислит. морфолог). Инвариант: бескомпромиссное качество, без заглушек.
Норма: index.html НЕ трогать (Зал = public/library.html); планы в docs/planning/ (коммит); recon-first
MEASURE до кода; гейты зелёные до push; prod-verify после; SW CACHE_VERSION бамп при смене shell-ассета.

Состояние: Тир-1 (честный гейт глосса) + Тир-2 (re-niqqud 109 работ, ОПУБЛИКОВАНО на прод, 2%→51%
resolver) — в проде. Тир-3a honest-degradation — ждёт Coolify-деплоя. Тир-3 фундамент (client-side
Dicta, reader-dicta.js + smoke:reader-dicta) — отгружен; «точный режим» (интеграция) на owner-go.

Сегодня я хочу: <ВЫБОР>
  (a) i+1 «Следующий для тебя» — ответь на 4 решения из docs/planning/BRR_P1_007_I_PLUS_1_RECON_2026_06_11.md
      (главное №1: vocab-профиль на publish-time, вариант A?), затем проба-замер размера сайдкара;
  (b) Тир-3 «точный режим» — подключить reader-dicta к резолву по дизайну
      docs/planning/BRR_TIER3_CONTEXT_MODE_2026_06_11.md (opt-in тумблер, провенанс «контекст», per-row кэш);
  (c) полиш / другое.
Открытые owner-решения: судьба 16 tracked work-JSON (commit/gitignore); 47097 (идиш) в ивр. корпусе;
ротация AUDIO_UPLOAD_TOKEN+Gemini+GCP. Начни с recon-first дизайна на утверждение.
```
