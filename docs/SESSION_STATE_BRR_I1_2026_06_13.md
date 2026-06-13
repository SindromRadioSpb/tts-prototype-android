# SESSION STATE — BRR-P1-007 i+1 «Следующий для тебя» (2026-06-13) — READ FIRST

> **Git: main = HEAD `e231420`, всё запушено. Prod SW `v3.10.43-room-rail-no-authorcap` (прод = код).**
> Project = LinguistPro (Node PWA, иврит↔рус). Prod: https://linguistpro.kolosei.com.
> Роли R1–R10 авто (`docs/PROJECT_ROLES.md`). Owner-инвариант: «бескомпромиссное качество, без заглушек».
> Полный дизайн+замеры i+1 → **`docs/planning/BRR_P1_007_I_PLUS_1_DESIGN_2026_06_12.md`** (READ для деталей).
> Предыдущий READ-FIRST (resolver/Тиры 1–3) → `docs/SESSION_STATE_BRR_RESOLVER_2026_06_11.md` (тоже актуален).
> Live-буфер: `.remember/remember.md` (авто-load).

## 🎉 KEYSTONE BRR-P1-007 ЗАВЕРШЁН (S1–S4 + §7 + калибровка) — В ПРОДЕ, подтверждён на реальном профиле
Learner-loop Зала ЗАМКНУТ end-to-end: **читай → тап → 1:1-карточка → Сохранить → цвет-статус → Anki → ЧТО ЧИТАТЬ ДАЛЬШЕ (i+1)**.
Поверхность = `public/library.html` (Зал), НЕ index.html (Студия). Корпус ~26K публичных ивритских работ; бейкнуто ~796 (каталог v7).

### Что живёт (хронология, каждый PROD-верифицирован)
- **S1** (`3f87b60`) — producer `scripts/premium/build-corpus-vocab.js`: офлайн form-first лемматизация бейкнутых работ
  над Pealim-словарём `pealim-infl-v12` → сайдкар `public/data/benyehuda/corpus-vocab-v7.json` (закоммичен, 253КБ gz/796).
  Ключ = `NA.lemmaKey` (байт-идентичен `getKnownWordStates`). Гейт `smoke:corpus-vocab` (lockstep version==catalog + join-parity).
- **S2** (`e2b4ebc`, SW v3.10.32) — клиент-движок `public/js/corpus-vocab.js` (`window.CorpusVocab`): reconstructIds·
  coverageForWork (two-channel: matched-drill + all-token-load)·classifyZone·pickPersonalRail + ленивый `ensureVocab`.
  Загрузчик в `library-ui.js` (`window.CorpusVocabRoom.coverageFor`). Гейт `smoke:corpus-vocab-engine` 37/37.
- **S3** (`bdf3ae5`, SW v3.10.33) — producer per-work `ez` (интринсик лёгкость); Рельс **«🌱 С чего начать»**
  (холодный старт по ez, profile-free); progressive coverage-бейдж (профиль-gated, zone-цвет + флаг «много имён/архаики»).
  Cache-bust `CORPUS_VOCAB_DATA_REV` (бампить при смене формата сайдкара ВНУТРИ версии каталога). + hotfix `8f50b06`.
- **S4** (`087f704`, SW v3.10.35) — Рельс **«🎯 Следующий для тебя» / «🔥 Следующий вызов»**: pure
  `pickPersonalRail(scored)` (≥MIN в зоне → next gentlest-first / перерос → challenge / too-new → cold-start);
  координатор `injectCorpusRails` (vocab+states ОДИН раз single-flight, скорит 796 ready СИНХРОННО, Рельс2 recede).
- **§7 real-profile validation ЗАВЕРШЕНА** (`8a5ca00`→`e231420`, SW до v3.10.43) — **i+1-band = ИЗМЕРЕННЫЙ ФАКТ**:
  прогон на профиле владельца (9994 word_study, 1956 лемм, pid∩corpus=1316). Все слова в SRS-`new` (учит в Anki) +
  медиана покрытия ~54%. **Owner-решения (AskUserQuestion):** «знакомо» = СОХРАНЁННОЕ слово; зона i+1 = **70–90%**.
  Подтверждено на устройстве: `engaged=778, in-zone=15`, полка живёт. Author-cap УБРАН (показываем все in-zone).

### Текущая i+1-калибровка (в `public/js/corpus-vocab.js` → `CV.CFG`, перенастраиваемо)
```
ZONE_LO: 0.70, ZONE_HI: 0.90               // зона роста (было 0.80/0.95; калибр §7 на 1-м реальном профиле)
KNOWN_STATES: {known,learning,new,weak,stale}  // «familiar» = любая word_study-заметка (Anki-воркфлоу; бейдж честно «знакомо»)
LOAD_FALLBACK_HI: 0.18, LOAD_MATCHED_LO: 0.50  // флаг «много имён/архаики»
MIN_RAIL: 3, RAIL_TOP: 50, AUTHOR_CAP: 0       // AUTHOR_CAP=0 = показывать ВСЕ in-zone (фильтр/сорт — позже)
```

## Ключевые файлы / гейты / данные
- Движок: `public/js/corpus-vocab.js` (pure, dual-export, Node-тестируем) · клиент `public/js/library-ui.js`
  (`injectCorpusRails`/`buildColdStartSection`/`buildRailSection`/`enhanceCardWithCoverage`/`observeCardCoverage`/
  `runRealProfileValidation`+`showValidationOverlay`+`maybeRunValidation`) · `public/library.html` (CSS coverage-бейджи + script).
- Producer: `scripts/premium/build-corpus-vocab.js` (+ `npm run build:corpus-vocab`). Данные: `corpus-vocab-v7.json` (commited).
- Гейты: `smoke:corpus-vocab` (lockstep/parity/size 15) · `smoke:corpus-vocab-engine` (37, движок+pickPersonalRail) ·
  `smoke:corpus-room` 18 · `smoke:room` 14 · `smoke:reader-parity` (index.html не тронут). Все зелёные на HEAD.
- i18n: `room.corpus.{coldStartTitle,coldStartIntro,nextTitle,nextIntro,challengeTitle,challengeIntro,cov.{estimate,load}}` ru/en/he.
- Каталог корпуса = **v7** (`CORPUS_CATALOG_VERSION=7` в library-ui.js); 796 baked (pointers.ready).

## §7 валидация-инструмент (для будущих пилот-профилей — privacy-preserving, on-device)
- **In-app триггер `?validate=1`**: `https://linguistpro.kolosei.com/library.html?validate=1` → overlay с отчётом
  (profile diagnostic: notes/types/pid/pid∩corpus + state-dist + §7 in-zone под [known+learning] и [saved=known] +
  per-era). Запускается из `runRealProfileValidation` (boot→`maybeRunValidation`). Профиль НЕ покидает устройство.
- Сниппет-версия: `scripts/premium/realprofile-validate-snippet.js` (browser-console paste).
- DB-busy/PWA-storage: если другая вкладка (Студия) держит OPFS-DB → overlay «закрой все вкладки». iOS: home-screen
  PWA имеет ОТДЕЛЬНОЕ хранилище от Safari-вкладки. SW-апдейт: в приложении тост **«Обновить»** (postMessage
  SKIP_WAITING) — НЕ нужно закрывать все вкладки, достаточно тоста (SW НЕ skipWaiting автоматически).

## Уроки этой сессии (баги из РЕАЛЬНОГО тестирования)
- **Стампид OPFS** (S3): 796 карточек × `ensureWordStates` без single-flight → блокировал открытие текстов на
  большом профиле. Фикс: single-flight + IntersectionObserver (coverage только видимых). → [[feedback-test-with-nonempty-profile]].
- **Profile-cache poisoning** (`c5b85aa`): транзиентный пустой `getKnownWordStates` кэшировался как `{}`, а truthy-`{}`
  не ретраил → весь профиль-вью видел пусто. Фикс: не кэшировать ошибку/пустоту-от-ошибки.
- **'new'-state**: `getKnownWordStates` отдаёт SRS-состояние; «known»={known,learning} исключал `new` → сохранённые
  слова (Anki-воркфлоу) = 0. Решение §7: saved=familiar.
- **author-cap слепой** на малом корпусе (15→11). Решение: AUTHOR_CAP=0 (coalescing `||2` глотал 0 → nullish-чек).

## НОРМЫ (стоячие)
index.html НЕ трогать (Зал=library.html, шарят OPFS-движок). MEASURE до кода (.tmp-харнесс, qa-verify-pattern;
для профиль-зависимого — НЕПУСТОЙ профиль!). Большие фичи → recon-first дизайн в `docs/planning/<TICKET>.md`
НА УТВЕРЖДЕНИЕ. Развилка → варианты по ролям + рекомендация (AskUserQuestion), решает владелец. Гейты зелёные до push.
commit+push автономно (Coolify авто-деплой); prod-verify после. SW CACHE_VERSION бамп при смене shell-ассета
(+ `CORPUS_VOCAB_DATA_REV` при смене формата сайдкара). @380px RTL скрин перед UI-коммитом. ⚠ НЕ диагностировать
«прод не достаёт Dicta» Windows-curl (калечит UTF-8) — Node/браузер.

## NEXT (опционально, не блокеры — владелец выбирает)
1. **Фильтрация/сортировка полок Корпуса** (когда текстов больше) — органичное место для author-diversity и пр.
   (как просил владелец). Сейчас AUTHOR_CAP=0 = показываем все; фильтр-слой = будущая фича.
2. **Бейк современных текстов** (`run-corpus-prebake.js` + `publish-corpus-batch`) — поднимет наполнение i+1-зоны
   (литкорпус «выше» словаря владельца, покрытие ~54%). Современных в каталоге всего ~73 → бейк проще-доступных.
3. **Anki-sync (R-3)** — подтянет реальную mastery в `known/learning` → можно вернуть строгие 80–95% «комфортные».
4. Полиш: «Подробнее → Студия» deep-link; GCP-WaveNet form-audio; ranked-candidate senses (Тир-3 backlog).
5. 47097 = идиш в ивр.корпусе (исключить/идиш-вокализатор, R6/R7).

## 🔑 OPEN (owner) — СРОЧНО
Ротация секретов: **`AUDIO_UPLOAD_TOKEN`** (светился в чате) + **Gemini** + старый **GCP TTS key**.

---

## ПРОМТ для НОВОЙ сессии (копипаст) — режим «изучи → проанализируй → предложи направления»
```
Продолжаем LinguistPro (Node PWA, иврит↔рус, prod linguistpro.kolosei.com). Keystone BRR-P1-007 i+1
«Следующий для тебя» ЗАВЕРШЁН и в проде (HEAD a424361, SW v3.10.43).

READ FIRST (изучи ПОЛНОСТЬЮ, прежде чем что-либо предлагать):
  • docs/SESSION_STATE_BRR_I1_2026_06_13.md — текущее состояние i+1/Зала;
  • docs/planning/BRR_P1_007_I_PLUS_1_DESIGN_2026_06_12.md — дизайн+замеры i+1;
  • docs/SESSION_STATE_BRR_RESOLVER_2026_06_11.md — resolver/Тиры 1–3;
  • docs/PROJECT_ROLES.md — роли R1–R10 (применяй авто; R10 = вычислит. морфолог: дизамбигуация + ИЗМЕРИМОСТЬ);
  • CLAUDE.md + .remember/remember.md;
  • docs/strategy/ и docs/planning/ (стратегия Зала, BRR-бэклог, STRATEGIC_PLAN_*) — ТРЕБОВАНИЯ и план.
Owner-инвариант: бескомпромиссное качество, без заглушек.

НОРМЫ (стоячие): index.html НЕ трогать (Зал = public/library.html, шарят OPFS-движок); MEASURE до кода
(.tmp-харнесс, qa-verify-pattern; профиль-зависимое → тестируй на НЕПУСТОМ профиле); большие фичи →
recon-first дизайн в docs/planning/<TICKET>.md НА УТВЕРЖДЕНИЕ до кода; гейты зелёные до push; commit+push
автономно (Coolify авто-деплой); prod-verify после; SW CACHE_VERSION бамп при смене shell-ассета
(+ CORPUS_VOCAB_DATA_REV при смене формата corpus-vocab-сайдкара); @380px RTL скрин перед UI-коммитом;
SW-апдейт на устройстве = тост «Обновить». ⚠ НЕ диагностировать «прод не достаёт Dicta» Windows-curl'ом.

ЗАДАЧА ЭТОЙ СЕССИИ — НЕ кодить сразу, а провести разведку и предложить направления:
  1. Изучи и проанализируй: (а) ТРЕБОВАНИЯ/план (стратегия Зала, BRR-бэклог, strategic plan, роли, CLAUDE.md);
     (б) ТЕКУЩЕЕ состояние репо — i+1/Корпус/resolver, гейты, наполнение бейка, незакрытые тикеты, TODO/FIXME,
     долги; (в) конкурентную планку (Pealim/Reverso/LingQ/Sefaria); (г) что СДЕЛАНО vs что НЕДОСТАЁТ до
     «премиального» продукта по ролям R1–R10. Анализ — измеримый и проверяемый (по возможности многоагентно/
     adversarial-проверка выводов, а не на веру).
  2. САМОСТОЯТЕЛЬНО сформируй и предложи 4–6 КОНКРЕТНЫХ направлений дальнейшей разработки по реализации
     требований. Для каждого: что/зачем (какие требования и роли R1–R10 закрывает), грубый объём/риски/
     зависимости, измеримая ценность, и как проверить успех. Прогони через роли + синтез, выяви компромиссы.
  3. Представь развилку через AskUserQuestion с рекомендацией (ранжируй направления) — РЕШАЕТ ВЛАДЕЛЕЦ.
     Кода пока не пиши. Для выбранного направления → recon-first дизайн (+ measure-замер) в
     docs/planning/<TICKET>.md НА УТВЕРЖДЕНИЕ.

ОТКРЫТО (owner, учти в анализе): 🔑 СРОЧНО ротация AUDIO_UPLOAD_TOKEN (был в чате) + Gemini + GCP TTS key;
47097 = идиш в ивритском корпусе (R6/R7); i+1-наполнение зависит от бейка современных текстов + Anki-sync.
Начни с чтения READ-FIRST и анализа; затем — предложения направлений на утверждение.
```
