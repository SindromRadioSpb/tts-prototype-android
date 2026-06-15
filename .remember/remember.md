# BRR continuation handoff — обновлено 2026-06-15 (BRR-P2-006 фразовый поиск SHIPPED)

**★ READ FIRST:** `docs/planning/BRR_P2_DISCOVERY_2026_06_14.md` (дизайн-канон Discovery; P2-001..006 SHIPPED) +
`docs/PROJECT_ROLES.md` (R1–R10 авто) + CLAUDE.md.
Project = LinguistPro (Node PWA, иврит↔рус), prod https://linguistpro.kolosei.com (Зал `/library.html`, Studio `/index.html`).
**main HEAD `8ab334e`, SW `v3.10.62-fts-phrase` — ПРОД-ВЕРИФИЦИРОВАН (37 шардов на томе, 1 phrase-хит, 0 console-errors).** Owner-инвариант: бескомпромиссное качество, без заглушек.

## ✅ BRR-P2-006 — позиционный ФРАЗОВЫЙ full-text «найти строку/фразу» (SHIPPED, prod-verify в процессе)
Находка смоук-чека #8: искал фразу «אתם כבר יודעים» → 2399 шумных «по форме слова», строка зарыта (FTS был ПОСЛОВНЫЙ AND).
**Решение — двухслойный индекс под мобайл:**
- `lemma` = **COUNT-only** (pid; мал; грузится всегда ~6.5MB; word-AND + группа «слова в тексте»; footprint НЕ вырос от v7).
- `exact` = **ПОЗИЦИОННЫЙ** skeleton-индекс по ВСЕМ токенам, шард по 1-й букве + под-шарды ≤8MB (`ex-<L>[-<i>]`), грузится
  ЛЕНИВО только для букв запроса. Фраза = смежные offset'ы → «точная фраза» = точный консонантный run.
- ⚠ **Почему НЕ позиции в lemma:** замерил — positions в pid-поле раздувают always-load до 100MB (lemma грузится целиком). Отверг.
- UI `appendFtsGroup`: две под-группы **«🔎 Точная фраза (N)»**(сверху)+**«Слова в тексте (M)»**; маркер «по форме слова» СНЯТ
  (горел на все контентные — бессмыслен). Drill-in на строку фразы (`firstPhraseRow`→jump-highlight `.rm-row-jump`).
- Движок `public/js/corpus-fts.js`: `decodePositions`/`phraseHit`(slop)/`phraseSearch`/`firstPhraseRow`; `decodePostings`=COUNT (lemma).
  Билд `scripts/premium/build-corpus-fts.js`: `encodeCount`(lemma)+`encodePos`(exact), `--max-pos`(деф 16), `bucket_files` в манифесте.
- Хостинг: `ensureBucket` грузит+мёржит под-шарды буквы; `push-corpus-fts.js`+server `FTS_FILE_RE` допускают `ex-<L>-<i>`.
- **Замер:** always-load 6.5MB (не вырос); phrase-запрос ленив ~9–15MB типично (heavy ה/ו/ב кэшируются). Индекс 75.9MB gz @10.2K
  на ТОМЕ, 37 шардов <10MB upload-cap. Гейты `smoke:corpus-fts` 39/0 + `-parity` 26/0. **Node+браузер(@380px, проба свежести):
  «אתם כבר יודעים» → ровно 1 phrase-хит «מה הם עושים»(ready) сверху + 2398 scattered, 0 console-errors.** index.html не тронут.

### ОСТАЛОСЬ по P2-006 (после деплоя кода!):
1. `AUDIO_UPLOAD_TOKEN=<токен> npm run push:corpus-fts` — залить 37 НОВЫХ шардов на ТОМ (server FTS_FILE_RE деплоится с кодом —
   пушить ТОЛЬКО ПОСЛЕ деплоя, иначе старый сервер 400'нет `ex-<L>-<i>`). Окно «новый манифест+старые шарды»: phrase-баксеты 404 →
   группа пустая (graceful), lemma-слова работают; самолечится после пуша.
2. Prod-verify: Node-fetch под-шарда+манифеста (schema 2) с тома; браузер на проде (проба свежести: phraseSearch есть) → фраза.
3. Память: записать урок «позиции — в ленивый per-letter exact, НЕ в always-load lemma» + обновить memory-указатели.

## P2-006 будущее (P2-беклог, не блокер)
- Sub-shard heavy-букв по 2-й букве (ограничить phrase-load heavy-фраз до ~единиц MB).
- Инфлексия-толерантная фраза (сейчас exact-skeleton; «слова»-группа уже толерантна через lemma).
- Сниппет совпавшей строки в результатах (Sefaria-style, P1).

## Что ещё в проде (Discovery, всё prod-верифиц.)
P2-002 Continue Reading · P2-003 Bookmarks · P2-001 Full-text · P2-004 L3 sort/filter · P2-005/005.2 jump-highlight + last-played.
Тж: Karaoke-семейство, i+1, Scaffolded Console.

## Рост FTS-покрытия к 26K
`npm run fetch:corpus-bodies -- --limit N` → `npm run build:corpus-fts` (`--no-fetch`) → бамп `FTS_DATA_REV`+`CACHE_VERSION` →
`AUDIO_UPLOAD_TOKEN=… npm run push:corpus-fts` → commit манифест+sw+library-ui → prod-verify. Сейчас 10 229 (тела в `.tmp/benyehuda/txt/p*`).

## 🔑 OPEN (owner) — СРОЧНО
Ротация `AUDIO_UPLOAD_TOKEN` (засвечен в чате 2026-06-14/15, использован для пуша) +Gemini +старый GCP. НЕ в код/git. Блокер публикации репо.

## NEXT — меню (owner)
④ R10-качество + 47097 идиш · ⑤ Anki-sync · рост FTS к 26K · ③ publish→каталог v8 · P2-006 sub-shard/сниппет-полиш.

## НОРМЫ
reader-core builder НЕ трогать (`smoke:reader-parity`); ридерные фичи POST-render на Room-mount; MEASURE до кода (НЕПУСТОЙ профиль);
крупная фича → recon-дизайн в docs/planning/<TICKET>.md НА УТВЕРЖДЕНИЕ; гейты зелёные до push; commit+push автономно (Coolify);
prod-verify Node-fetch (НЕ Windows-curl для иврита); SW `CACHE_VERSION` бамп при shell-ассете; @380px RTL скрин; **браузер-проверка —
грузить СВЕЖИЙ код (дожать SW-обновление/проба свежести, не только unregister)**.

## ПРОМТ для НОВОЙ сессии (копипаст)
```
Продолжаем LinguistPro (Node PWA, иврит↔рус, prod linguistpro.kolosei.com; Зал /library.html, Studio /index.html).
READ FIRST: docs/planning/BRR_P2_DISCOVERY_2026_06_14.md, .remember/remember.md, docs/PROJECT_ROLES.md (R1–R10), CLAUDE.md.
Owner-инвариант: бескомпромиссное качество, без заглушек.
Нормы: reader-core builder НЕ трогать (smoke:reader-parity); ридерные фичи POST-render; MEASURE до кода; крупные фичи → recon-дизайн
НА УТВЕРЖДЕНИЕ; гейты зелёные до push; commit+push автономно (Coolify); prod-verify Node-fetch; SW CACHE_VERSION бамп; @380px RTL;
браузер-проверка на СВЕЖЕМ коде (дожать SW-обновление/проба свежести).
СОСТОЯНИЕ (SW v3.10.62-fts-phrase): BRR-P2-006 фразовый поиск SHIPPED — две группы «Точная фраза»/«Слова в тексте», позиционный
exact-индекс (ленивый per-letter), lemma count-only (always 6.5MB). ОСТАЛОСЬ: пуш 37 шардов на ТОМ (AUDIO_UPLOAD_TOKEN, ТОЛЬКО
после деплоя) + prod-verify. Discovery-блок + Karaoke + i+1 в проде.
NEXT (owner): ④ R10+идиш; ⑤ Anki; рост FTS к 26K; ③ publish→каталог v8; P2-006 sub-shard/сниппет.
🔑 СРОЧНО: ротация AUDIO_UPLOAD_TOKEN (засвечен) +Gemini +старый GCP — блокер публикации репо.
Спроси направление ИЛИ продолжай. Кода без утверждённого дизайна для крупной фичи не писать.
```
