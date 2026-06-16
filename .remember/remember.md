# BRR continuation handoff — обновлено 2026-06-16 (BRR-P2-006a: скорость поиска-по-фразе SHIPPED+PROD)

**★ READ FIRST:** `docs/planning/BRR_P2_DISCOVERY_2026_06_14.md` (Discovery-канон; P2-001..006a SHIPPED) +
`docs/PROJECT_ROLES.md` (R1–R10 авто) + CLAUDE.md.
Project = LinguistPro (Node PWA, иврит↔рус), prod https://linguistpro.kolosei.com (Зал `/library.html`, Studio `/index.html`).
**main HEAD `fff01aa`, SW `v3.10.63-fts-fast` — ПРОД-ВЕРИФИЦИРОВАН (334 шарда на томе, индикатор+анти-гонка+прогрев, 0 console-errors).**
Owner-инвариант: бескомпромиссное качество, без заглушек.

## ✅ BRR-P2-006a — поиск-по-фразе: обратная связь + скорость (SHIPPED+PROD)
Смоук-чек #9: вставил строку «לו אך ככוכב הנופל בנשפים» → «0» без признаков работы ~18с, потом внезапно «🔎 Точная фраза (1)»
= «לְמִרְיָם» (верно). Поиск работал; чинили UX/перф:
- **(A) Индикатор** `«🔎 Ищем в текстах…»` (спиннер, role=status) в `appendFtsGroup` СРАЗУ до await; empty-state не во время
  загрузки. **Анти-гонка `corpusFtsSeq`** (монотонный токен; `corpusL1Body!==body` не ловил смену запроса в том же body).
- **(B-прогрев)** `CorpusFTS.warm()` (манифест+lemma+lemmamap ~6.5MB) в `requestIdleCallback` при загрузке Зала (owner-выбор);
  `warmQuery()` греет шарды по `input` (вставка → все сразу); `ensureShard` single-flight.
- **(B-структура)** ТЯЖЁЛЫЕ буквы (`sharded_letters`, 14 шт.) шардированы по ПЕРВЫМ ДВУМ буквам (`ex-<L1L2>`) → «הנופל» грузит
  `ex-הנ` ~0.6MB вместо 11MB всей ה. Клиент `shardKeyFor`/`ensureShard` по префиксу; манифест `bucket_files`(prefix)+
  `sharded_letters`; билд `--bucket-2level-threshold` (~3MB raw); под-шарды ≤8MB.
- **Замер (вставка-6-слов):** exact-шарды 30MB→**1.34MB** (22×); первый холод ~37MB→~7.8MB; **тёплый/повтор 313–932мс** (был ~18с).
- **Прод-верифи:** Node-fetch префикс-шарда с тома → «לְמִרְיָם» (id 297, ready) единственный phrase-хит; браузер @380px свежий код:
  индикатор виден, анти-гонка держит, 0 console-errors. Гейты `smoke:corpus-fts` 48/0 + `-parity` 30/0 + `reader-parity` зелёный.
- **ОСТАТОЧНЫЙ ХОЛОД-ПОЛ = 6.5MB lemma** (always-loaded). Если cache очищен И юзер ищет ДО конца прогрева → первый поиск ждёт lemma
  (~сек, индикатор покрывает). **P2-беклог:** рисовать phrase-группу из ОДНИХ префикс-шардов ДО загрузки lemma (прогрессивно).

## Файлы P2-006a
`public/js/corpus-fts.js` (warm/warmQuery/shardKeyFor/ensureShard +single-flight `_shardLoading`) · `public/js/library-ui.js`
(индикатор+анти-гонка в appendFtsGroup/renderResultsInto; прогрев в loadCorpusCatalog; warmQuery в строке поиска; FTS_DATA_REV=5) ·
`scripts/premium/build-corpus-fts.js` (2-уровневое шардирование) · `public/library.html` (CSS `.corpus-fts-loading`) ·
i18n `room.corpus.search.searching` · `public/sw.js` v3.10.63. push/server БЕЗ изменений (regex `ex-[א-ת]+(-\d+)?` уже подходит).

## Что ещё в проде (Discovery, всё prod-верифиц.)
P2-002 Continue Reading · P2-003 Bookmarks · P2-001 Full-text · P2-004 L3 sort/filter · P2-005/005.2 jump-highlight ·
**P2-006 фразовый поиск** · **P2-006a скорость/индикатор**. Тж: Karaoke-семейство, i+1, Scaffolded Console.

## Рост FTS-покрытия к 26K (модель прежняя)
`npm run fetch:corpus-bodies -- --limit N` → `npm run build:corpus-fts` (`--no-fetch`) → бамп `FTS_DATA_REV`+`CACHE_VERSION` →
`AUDIO_UPLOAD_TOKEN=… npm run push:corpus-fts` (новые имена → можно ДО деплоя) → commit → prod-verify. Сейчас 10 229 (тела в `.tmp/benyehuda/txt/p*`).

## 🔑 OPEN (owner) — СРОЧНО
Ротация `AUDIO_UPLOAD_TOKEN` (засвечен в чате, использован для пуша) +Gemini +старый GCP. НЕ в код/git. Блокер публикации репо.

## NEXT — ★ УТВЕРЖДЕНО (owner 2026-06-16): ПРОДУКТОВОЕ ЗАКРЫТИЕ БЛОКА ПОИСКА (S1–S19), всё одним заходом в НОВОЙ сессии
**Канон требований + копипаст-промт → `docs/planning/BRR_SEARCH_DISCOVERY_STATE_2026_06_16.md` (READ FIRST для этой работы).**
Набор: P0 сниппет билингв(S1)+`<mark>`(S2)+прогрессивная-фраза(S3)+инпут ✕/Enter/Esc(S4)+релевантность(S5)+ясность-счётчика(S6) →
P1 readability-поиск «что по силам»(S7)+KWIC-конкорданс(S8)+поиск-по-корню(S9)+поиск→Anki-хук(S10) → P2 scoped(S11)+история(S12)+
сохранённые-поиски(S13)+related(S14)+in-reader-find(S15)+advanced-фильтры(S16). Все DATA-FEASIBLE (рекон 3 агентов; works/<id>.json
билингв + CorpusVocab per-hit + lemmamap + позиции). Крупные кирпичи (S8/S11/S13/S15) — свой рекон-`<TICKET>` на утверждение внутри захода.
Прочие направления (отложены): ④ R10+идиш · ⑤ Anki-движок · рост FTS к 26K · ③ publish→каталог v8.

## НОРМЫ
reader-core builder НЕ трогать (`smoke:reader-parity`); ридерные фичи POST-render на Room-mount; MEASURE до кода (НЕПУСТОЙ профиль);
крупная фича → recon-дизайн в docs/planning/<TICKET>.md НА УТВЕРЖДЕНИЕ; гейты зелёные до push; commit+push автономно (Coolify);
prod-verify Node-fetch (НЕ Windows-curl для иврита); SW `CACHE_VERSION` бамп при shell-ассете; @380px RTL скрин; **браузер-проверка —
свежий код (дожать SW-обновление/проба свежести); НЕ очищать кэш перед замером тёплой скорости**.

## ПРОМТ для НОВОЙ сессии (копипаст)
```
Продолжаем LinguistPro (Node PWA, иврит↔рус, prod linguistpro.kolosei.com; Зал /library.html, Studio /index.html).
READ FIRST: docs/planning/BRR_P2_DISCOVERY_2026_06_14.md, .remember/remember.md, docs/PROJECT_ROLES.md (R1–R10), CLAUDE.md.
Owner-инвариант: бескомпромиссное качество, без заглушек.
Нормы: reader-core builder НЕ трогать (smoke:reader-parity); ридерные фичи POST-render; MEASURE до кода; крупные фичи → recon-дизайн
НА УТВЕРЖДЕНИЕ; гейты зелёные до push; commit+push автономно (Coolify); prod-verify Node-fetch; SW CACHE_VERSION бамп; @380px RTL;
браузер на СВЕЖЕМ коде (проба свежести); не очищать кэш перед замером тёплой скорости.
СОСТОЯНИЕ (SW v3.10.63-fts-fast): BRR-P2-006a SHIPPED — индикатор «Ищем в текстах…» + анти-гонка + прогрев на загрузке +
2-уровневое под-шардирование тяжёлых букв (вставка-фразы exact 30MB→1.34MB; тёплый поиск 313–932мс). Discovery+Karaoke+i+1 в проде.
NEXT (owner): ④ R10+идиш; ⑤ Anki; рост FTS к 26K; ③ publish→каталог v8; P2-006 беклог (прогрессивная phrase-группа до lemma; сниппет).
🔑 СРОЧНО: ротация AUDIO_UPLOAD_TOKEN (засвечен) +Gemini +старый GCP — блокер публикации репо.
Спроси направление ИЛИ продолжай. Кода без утверждённого дизайна для крупной фичи не писать.
```
