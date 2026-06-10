# BRR / Corpus OS — session-start prompt (next session, post-A1)

> Скопируй блок ниже в новую сессию Claude Code. Самодостаточен: роли, инварианты, сверенное
> состояние (2026-06-10, HEAD `4df12e7`), решения владельца, порядок работ, первое действие.
> Durable-источники: `docs/planning/BEN_YEHUDA_DELIVERY_26K_PLAN.md` (Coverage-модель + Путь А +
> слайсинг A0–A5) и `docs/planning/BEN_YEHUDA_READING_ROOM_REQUIREMENTS_BACKLOG.md` (BRR-P1-007/014/015).

---

```
КОНТЕКСТ. LinguistPro (Node.js PWA, билингвальная иврит↔русский библиотека Ben-Yehuda Reading Room /
BRR; прод https://linguistpro.kolosei.com). Применяй роль-линзы R1–R8 автоматически (canon в
docs/PROJECT_ROLES.md). Инвариант владельца ДОСЛОВНО: «бескомпромиссное качество, без заглушек».
R1: MT НЕ выдавать за human, TTS НЕ за native — честный provenance/metadata (review_status='machine').

НОРМЫ ВЛАДЕЛЬЦА (соблюдать):
- КОММИТИТЬ И ПУШИТЬ АВТОНОМНО, своевременно, БЕЗ напоминаний (push в main → Coolify авто-деплой).
  Перед push — релевантные гейты/смоуки зелёные. ПОСЛЕ push — ОБЯЗАТЕЛЬНАЯ прод-верификация на
  linguistpro.kolosei.com (не только локально). Память: feedback_autonomous_commit_push.md.
- SW: бампать `public/sw.js` CACHE_VERSION при ЛЮБОМ изменении shell-ассета (index.html/library.html/
  locale/js-модуль) — иначе старый precache отдаёт stale.
- index.html НЕ трогать до Stage 2 (library.html — можно, это Зал).
- ДЛИННЫЕ задачи (многослайсовые/многодневные, напр. полный бейк или A2) — старт по отдельной команде владельца.
- Развилка → варианты по ролям + рекомендация (решает владелец).

🔑 ЖДЁТ ВЛАДЕЛЬЦА (security): ротация Gemini-ключа (светился в старом чате) И старого GCP TTS-ключа. Напоминай.

СВЕРЕННОЕ СОСТОЯНИЕ (2026-06-10):
- Git: origin/main = HEAD = `4df12e7`, дерево чистое, всё запушено.
- Прод: SW `v3.10.20-corpus-coverage`. Канон-79 (curated, keyless WaveNet) + вкладка «Корпус» (100
  машинных работ haskalah+tehiya) — LIVE, прод-верифицировано @380px.
- БЕЙК (`node scripts/premium/run-corpus-prebake.js --status`): done 100 · pending 24541 · failed 0 ·
  deferred-giant 0 of 24641 · 7 шардов. gemini today 0/1500. Резюм вперёд = `--bake` (нужен GEMINI_API_KEY).

ЧТО УЖЕ СДЕЛАНО (НЕ переделывать):
- BRR-P0-006 giant-pass (Проход-2): `--giant-pass` + lib/benyehuda.chapterizeGiant (каждая часть ≤ cap;
  series/by-<id>-c<N>/by-work TOC; атомарно). Гейты smoke:giant-pass 47/47 (--real), corpusLedger 8/8.
- BRR-P0-007 Проход-3 Срезы 1+2: producer scripts/premium/build-corpus-catalog.js → public/data/benyehuda/
  corpus-catalog-v2.json (тонкий индекс) + works/<id>.json (100, Shape A, served-on-open). library.html
  3-я вкладка «Корпус» (ОТДЕЛЬНО от канона, R8) + served-on-open (тап → fetch work → importBundle →
  тёплый ридер; re-open из OPFS). Гейты smoke:corpus-catalog 34/34, smoke:corpus-room 16/16.
- BRR-P1-007 Слайс A1: coverage{text,niqqud,translation,audio,era_known,tier} в каждой карточке каталога
  (v2). Это СПАЙН для фильтров и fill-queue. translation никогда не 'human' (R1).

РЕШЕНИЯ ВЛАДЕЛЬЦА 2026-06-10 — Путь А APPROVED (canon: DELIVERY_26K_PLAN «Coverage-модель»):
- Рефрейм: КАТАЛОГ (что существует, все ~26K из pseudocatalogue.csv — бесплатно) ≠ ПОКРЫТИЕ (что
  обогащено: перевод/никуд/озвучка — растёт, честно маркируется, фильтруется).
- (а) OPFS LRU (Срез 3) ОТЛОЖЕН (нет нагрузки). (б) owner-key аудио НЕ предбейкаем — BYOK/браузерная
  речь сейчас, выборочная публикация клипов позже. (в) Gemini-MT ПРИНЯТ как стандарт, R7-сэмплинг НЕ делаем,
  никуд бесплатен+работает. Повышение качества = опц. переобработка позже.
- 7 решений FINAL: листить все ~26K (градуированный дефолт: переведённые+канон сверху, хвост за тумблером);
  works→прод-том (раздача+owner-token push, паттерн P0-010); coverage-спайн; фильтры/поиск (эпоха/автор/
  жанр+перевод/озвучка) = расширение P1-007; UX непереведённой работы v1 «перевод позже» / v1.1 BYOK-перевод;
  fill-queue (coverage-отчёт+таргетинг); niqqud rest-тира probe (Dicta backoff vs локальный sidecar).

ПОРЯДОК РАБОТ (слайсинг Пути А — DELIVERY_26K_PLAN):
  [A0] ← НАЧАТЬ ЗДЕСЬ. ИССЛЕДОВАНИЕ+ПЛАН, ДО кода. Разобрать:
       (1) исходный git-репо `projectbenyehuda/public_domain_dump` — структура каталога (pseudocatalogue.csv),
           метаданные/пути, что ещё извлекаемо (жанры/теги/серии/годы/язык-оригинала).
       (2) IA сайта-аналога https://benyehuda.org/ — навигация автор/жанр/период, устройство списков
           ДО входа в карточку. ВОЗМОЖНО перенять структуру до карточки как премиальный вариант IA Зала.
       ЦЕЛЬ: предложить варианты IA/структуры (R4/R6/R8) + рекомендацию, решить granularity шардинга,
       ЧТОБЫ НЕ ПЕРЕДЕЛЫВАТЬ в конце. Выход: обновлённый IA-раздел в DELIVERY_26K_PLAN + согласие владельца.
  [A4] миграция works → прод-том `/app/data/benyehuda/works/` (owner-token push, паттерн P0-010) — ПЕРЕД A2,
       чтобы не плодить тысячи loose-файлов в git.
  [A2] полный каталог: producer читает pseudocatalogue.csv (все ~26K) + мёржит coverage из шардов →
       unprocessed-карточки (text:false, tier:'unprocessed', «перевод позже»); шардинг (рекоменд.: тонкий
       индекс + шарды по эпохам, внутри rest — по автор-префиксу).
  [A3] клиент: фильтры/поиск + градуированный дефолт + coverage-бейджи + честный «перевод позже» (не openable;
       v1.1 BYOK «перевести на лету»).
  [A5] fill-queue/дашборд покрытия + таргетированные прогоны перевода/аудио.
  [probe] niqqud rest-тира (20–50 works) — гейт широкого бейка.

КЛЮЧЕВЫЕ ФАЙЛЫ: producer scripts/premium/build-corpus-catalog.js · клиент public/js/library-ui.js
(вкладки/served-on-open/loadCorpusCatalog/openCorpusWork) · ридер public/js/reader-core.js (byte-parity
с index.html renderTable; гейт smoke:reader-parity) · OPFS public/db/local-db.js (importBundle Shape A,
getShelves, getTextByIdLite, getSentences, dbQuery) · бейк-раннер scripts/premium/run-corpus-prebake.js
(--bake/--giant-pass/--status) · ledger scripts/premium/lib/corpusLedger.js · benyehuda lib
scripts/premium/lib/benyehuda.js. Данные: public/data/benyehuda/{corpus-catalog-v2.json, works/, canon-v3.zip}.
ГЕЙТЫ: smoke:corpus-catalog · smoke:corpus-room · smoke:giant-pass · smoke:room · smoke:room-mode ·
smoke:reader-parity · node --test tests/premium/corpusLedger.test.js.

НЕ ДЕЛАТЬ: не перезапускать отменённый full jury audit (w5q3tbm8m); не делать R7-сэмплинг (решение в);
не предбейкать owner-key аудио (решение б); не трогать index.html; не пушить с красными гейтами;
не начинать A2/полный бейк без отмашки (длинные задачи).

ПЕРВОЕ ДЕЙСТВИЕ: прочитать docs/planning/BEN_YEHUDA_DELIVERY_26K_PLAN.md (Coverage-модель + слайсинг A0–A5)
+ BRR-P1-007/014/015 в BACKLOG, подтвердить сверенное состояние (git status + --status), затем выполнить
[A0] (исследование git-репо + benyehuda.org IA) и вернуться с вариантами IA по ролям + рекомендацией.
БЕЗ кода до согласия владельца по IA/шардингу.
```

---

## Durable-указатели
- Coverage-модель + Путь А + слайсинг A0–A5: `docs/planning/BEN_YEHUDA_DELIVERY_26K_PLAN.md`.
- Тикеты: `BRR-P1-007` (coverage-aware каталог) / `BRR-P1-014` (полный 26K + шардинг) / `BRR-P1-015`
  (works→том + fill-queue) в `docs/planning/BEN_YEHUDA_READING_ROOM_REQUIREMENTS_BACKLOG.md`.
- Бейк/Проход-2: `docs/planning/BEN_YEHUDA_CORPUS_RUNNER_PLAN.md` §4b.
- Исходный корпус: репо `projectbenyehuda/public_domain_dump` (raw на GitHub) + кэш `.tmp/benyehuda/pseudocatalogue.csv`.
- Аналог IA: https://benyehuda.org/.
