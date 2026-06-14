# BRR continuation handoff — обновлено 2026-06-14 (BRR-P2 Discovery block ЗАВЕРШЁН)

**★ READ FIRST:** `docs/planning/BRR_P2_DISCOVERY_2026_06_14.md` (дизайн-канон блока Discovery, все 4 стадии SHIPPED) +
`docs/SESSION_STATE_BRR_2026_06_14.md` (предыдущий READ-FIRST: Karaoke-семейство) + `docs/PROJECT_ROLES.md` (R1–R10 авто).
Project = LinguistPro (Node PWA, иврит↔рус), prod https://linguistpro.kolosei.com (Зал: `/library.html`, Studio: `/index.html`).
**main HEAD `6f7c385`, SW `v3.10.59-room-sortfilter` — ПРОД-ВЕРИФИЦИРОВАН (FTS-поиск работает на проде, 0 console-errors).**

> **🎉 БЛОК BRR-P2 «DISCOVERY» ЗАВЕРШЁН В ПРОДЕ** — 4 стадии (каждая @380px light/dark + e2e + гейты зелёные):
> Continue Reading + Bookmarks + Full-text search «внутри текстов» + L3 sort/filter. Owner-выбор: «full-text 26K find-only + чтение растёт бейком».

## Что отгружено (хронология, всё prod-верифицировано)
1. **BRR-P2-002 Continue Reading** (`2631e91`, SW v3.10.56). `text_progress` в Зал: запись позиции (debounced scroll +
   karaoke-row + **sync-flush на закрытии** — быстрый «Назад» не теряет место) + ненавязчивый баннер «Вы остановились на
   строке N» (R4, бить Apple Books) + полка «▶ Продолжить чтение». Новый `public/js/reader-progress.js` (UMD pure).
   Гейт `smoke:reader-resume` (22/0).
2. **BRR-P2-003 Bookmarks** (`bbf9c45`, SW v3.10.57). Миграция 056 `bookmarks` (НЕ `notes_v2 note_type='bookmark'` — CHECK
   бросит). POST-render ☆/★ в `.col-action-cell` (Room-mount; parity цел). Полка «🔖 Закладки» (билингв-снипет; прыжок к
   предложению по `_v3_sentenceId`). Гейт `smoke:bookmarks` (11/0, реальный OPFS headless + CASCADE).
3. **BRR-P2-001 Full-text** (`2d6c252`, SW v3.10.58). Собственный Hebrew-aware инвертированный индекс (FTS5 не в wa-sqlite).
   `scripts/premium/build-corpus-fts.js` + `public/js/corpus-fts.js`. Контент→lemma-поле (Dicta-class), имена→exact-fallback.
   Группа «🔎 в тексте» + честный «перевод позже»/«по форме слова». **10 228/26 455 работ на ПРОД-ТОМЕ** (gitignored;
   `/api/benyehuda/fts/upload` + `push-corpus-fts.js`; манифест в git+precache). Гейты `smoke:corpus-fts`(12)+`-parity`(20).
   Уроки → memory `feedback_fts_hebrew_inverted_index`.
4. **BRR-P2-004 L3 sort/filter** (`6f7c385`, SW v3.10.59). Сорт По порядку/алфавиту/длине + genre-select на L3 (был пробел).
   + fix: lemma-индекс шардирован по размеру (`lemma-<i>`, upload-cap).

## Рост покрытия FTS (как довести к 26K)
`npm run fetch:corpus-bodies -- --limit N` (вежливый дофетч ивр-тел в `.tmp/benyehuda/txt`) → `npm run build:corpus-fts`
(`--no-fetch`) → бамп `FTS_DATA_REV` в `library-ui.js` + `CACHE_VERSION` в sw.js → `AUDIO_UPLOAD_TOKEN=<…> npm run push:corpus-fts`
→ commit манифест+sw+library-ui → prod-verify (Node fetch шардов). Сейчас 10 228 индексировано, ~16K тел осталось дофетчить.

## 🔑 OPEN (owner) — СРОЧНО
**Ротация `AUDIO_UPLOAD_TOKEN`** (+Gemini, +старый GCP). Токен дан в чате 2026-06-14 (использован для пуша FTS-шардов) →
**ЗАСВЕЧЕН, ротировать**. НЕ сохранён в код/git. Блокер публикации репо (PUBLIC, `.claude/SECURITY_AUDIT_2026-06-13.md`).

## NEXT — меню (owner выбирает)
- ④ **R10-качество**: replace recall/FP тап-глосса vs Dicta-silver + бейджи провенанса + **47097 идиш** (R6/R7).
- ⑤ **Anki-sync** (real mastery → строгая i+1 80–95%).
- **Рост FTS-покрытия** к 26K (дофетч+ребилд+пуш, см. выше) — итеративно.
- **L1-результаты-сорт** (relevance/coverage) — отложено в P2-004 (анти-stampede снапшот; L1 уже имеет фильтр-бар).
- ③ **publish бейкнутых→каталог v8** (зависит от ротации токена) — растит ready→FTS-хиты открываемы.

## НОРМЫ (стоячие)
`reader-core` builder/`renderTable` НЕ трогать (parity `smoke:reader-parity`); ридерные фичи — POST-render на Room-mount.
MEASURE до кода (профиль-зависимое → НЕПУСТОЙ профиль). Крупная фича → recon-дизайн в `docs/planning/<TICKET>.md` НА УТВЕРЖДЕНИЕ.
Гейты зелёные до push; commit+push автономно (Coolify); prod-verify Node-fetch (НЕ Windows-curl для иврита); SW `CACHE_VERSION`
бамп при shell-ассете; @380px RTL скрин перед UI-коммитом. SW-апдейт = тост; на уже-открытой прод-вкладке старый SW контролирует
до reload (верифи с unregister+reload).

## ПРОМТ для НОВОЙ сессии (копипаст)
```
Продолжаем LinguistPro (Node PWA, иврит↔рус, prod linguistpro.kolosei.com; Зал /library.html, Studio /index.html).
READ FIRST: docs/planning/BRR_P2_DISCOVERY_2026_06_14.md (Discovery-блок, всё SHIPPED), .remember/remember.md (live-буфер),
docs/PROJECT_ROLES.md (R1–R10 авто), CLAUDE.md.
Owner-инвариант: бескомпромиссное качество, без заглушек.
Нормы: reader-core builder НЕ трогать (parity smoke:reader-parity); ридерные фичи POST-render на Room-mount; MEASURE до кода;
крупные фичи → recon-дизайн в docs/planning/<TICKET>.md НА УТВЕРЖДЕНИЕ; гейты зелёные до push; commit+push автономно (Coolify);
prod-verify Node-fetch (НЕ Windows-curl для иврита); SW CACHE_VERSION бамп при shell-ассете; @380px RTL скрин перед UI-коммитом.
СОСТОЯНИЕ (main 6f7c385, SW v3.10.59, всё в проде): БЛОК DISCOVERY ЗАВЕРШЁН — Continue Reading + Bookmarks + Full-text
«в тексте» (10.2K/26.4K работ, на прод-томе, растёт дофетчем) + L3 sort/filter. Тж в проде: Karaoke-семейство, i+1, Scaffolded Console.
NEXT (owner): ④ R10-качество + 47097 идиш; ⑤ Anki-sync; рост FTS-покрытия к 26K; L1-результаты-сорт (отложено); ③ publish→каталог v8.
🔑 СРОЧНО (owner): ротация AUDIO_UPLOAD_TOKEN (засвечен в чате) +Gemini +старый GCP — блокер публикации репо.
Спроси, какое направление берём, ИЛИ продолжай выбранное. Кода без утверждённого дизайна для крупной фичи не писать.
```
