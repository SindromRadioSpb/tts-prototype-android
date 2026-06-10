# BRR-P0-007 (full-corpus delivery) — 26K delivery architecture — APPROVED + Проход-3 SHIPPING

**Дата:** 2026-06-09 · **Обновлено:** 2026-06-10 · **Статус:** ✅ APPROVED (D1–D5, §7) · **Проход-3 Срезы 1+2 SHIPPED+PROD 2026-06-10.**

## ✅ Проход-3 реализация — Срезы 1+2 (PROD 2026-06-10)
Первый тир (100 испечённых работ haskalah+tehiya) опубликован catalog-driven, БЕЗ авто-импорта.
- **Срез 1 (`9ccf6b1`) — producer:** `scripts/premium/build-corpus-catalog.js` взрывает `.tmp/benyehuda/shards/*.zip`
  → `public/data/benyehuda/corpus-catalog-v1.json` (тонкий индекс, 38КБ, D1) + `works/<id>.json` (100 файлов,
  7МБ, importBundle Shape A, `source_text` стрипнут). R1-гейт (review_status=machine; ложь → exit 1).
  Re-publish: `--catalog-version N+1` (клиент cache-bust работ через `?v=N`). Гейт `smoke:corpus-catalog` 27/27.
- **Срез 2 (`67443ad`, SW v3.10.19) — клиент:** library.html 3-я вкладка «Корпус» (ОТДЕЛЬНО от курируемого
  канона — R8: неградуированный машинный корпус не подмешан). Served-on-open: тап → fetch `works/<id>.json?v=1`
  → importBundle → тёплый ридер; повторное открытие резолвится из OPFS (без 2-го fetch). Честные бейджи
  (Машинный перевод / Без озвучки) + era-полки. Гейт `smoke:corpus-room` 16/16 + регрессия room/room-mode/parity.
- **Осталось:** Срез 3 (OPFS LRU, D2 — greenfield, не блокер на 100 работах) · аудио корпуса (P0-011 computed-key;
  сейчас audio_status=none → браузерная речь) · R7-сэмплинг 100 до широкого доверия · масштаб 26K = object storage
  вместо loose-файлов в git (§6).
**Роли:** R5 (инфра/стоимость/доверие), R4 (mobile-first UX), R6 (discovery/каталог), R3 (архитектура/версионирование).
**Контекст:** runner (BRR-P0-006) производит per-era shard-бандлы; **не описано, как 26K попадают к юзеру.** Это
главный НЕ-кодовый разрыв (owner review §5). Замер: 24 641 originals, аудио ~288 ГБ (→ on-demand), тексты per-work
небольшие (медиана 41 сегмент). canon-v3 авто-импорт 79 текстов уже был mobile-risk (17с) → **26K нельзя авто-импортить.**

## 1. Инвариант доставки
**Library показывает КАТАЛОГ, а не импортирует корпус.** Текст материализуется в OPFS только при открытии. OPFS = кэш
недавнего (LRU-эвикция), не зеркало корпуса. Curated canon остаётся preinstalled (как сейчас). Аудио — on-demand
computed-key. Никакого «один большой bundle / авто-импорт» для хвоста.

## 2. Раскладка данных (shipped как `public/data/**`, immutable-cached, версионируется именем файла)
```
public/data/benyehuda/
  catalog-v<N>.json          # ТОНКИЙ корневой индекс (D1): версия, перечень shard-манифестов, счётчики,
                             #   указатели полок — БЕЗ карточек и БЕЗ тел текстов
  catalog/<group>-v<N>.json  # shard-манифесты по tier/era/author-prefix (D1): [{id,title,author,era,register,
                             #   track,genre,segments,vocalized_ratio,shelf_refs,work_ref}] — БЕЗ тел текстов
  works/<byehuda_id>.json    # одно произведение: rows[] (he/niqqud/translit/ru) + corpus + provenance
                             #   (то, что сейчас лежит в library.json по одному тексту)
  shelves-v<N>.json          # кураторские + era-полки = POINTERS (списки id), не содержимое
  canon-v3.zip               # curated 79 — остаётся preinstalled/auto-import (без изменений)
```
Runner per-era shards (`shards/by-era-*.zip`) = **источник** для генерации `works/<id>.json` + `catalog`/`shelves`
(producer-step «explode shards → per-work + catalog»). Шарды также годятся как **офлайн-паки по эпохам** (опционально).

## 3. Клиентский флоу (library.html / reader-core)
1. **Discovery:** Library грузит `catalog-v<N>.json` (тонкий индекс), затем — ТОЛЬКО shard-манифест активной
   группы (tier/era/author-prefix; решено D1, §7). Полный 24K-массив одним файлом не грузится никогда.
2. **Open work:** тап по карточке → fetch `works/<id>.json` (served-on-open) → upsert в OPFS → render через reader-core.
3. **OPFS LRU:** хранить N недавних works + их аудио; при превышении cap (напр. ~200 works / ~X МБ) эвиктить LRU.
   Curated canon + user-созданное НЕ эвиктится (origin-guard).
4. **Deep shelves:** полки = pointers в каталог; раскрытие полки не тянет содержимое, только метаданные карточек.
5. **Offline:** «скачать эпоху» (опц.) = era-shard → массовый upsert (явное действие юзера, не авто).

## 4. Аудио (on-demand, computed-key — BRR-P0-011 fix B; делать ДО этого UI)
- reader-core tier-1: вычислить assetKey из row-текста + canon-профиля (`crypto.subtle` SHA-256) → `HEAD /api/audio/:key`.
- hit → keyless stream (canon + любые ранее «донесённые» BYOK-клипы). miss → tier-2 BYOK (ключ юзера) / tier-3 browser-speech.
- **ноль per-row `audio_asset_key` в `works/<id>.json`** (computed на лету) → лёгкие work-файлы + масштаб на миллионы строк.
- **Безопасность:** ключ владельца не тратится (прод без серверного TTS-ключа; см. CURRENT_STATE §5). До публичного
  on-demand аудио — закрыть **BRR-P1-013** (`prefetch/start` write-cap).

## 5. Версионирование / upgrade
- `catalog-v<N>` / `shelves-v<N>` + immutable-cached `works/<id>.json` (id-стабильны, контент-версия в work-файле).
- Бамп `catalog_version` → клиент перечитывает каталог; уже закэшированные works остаются валидны (контент-hash).
- Дедуп/refresh — переиспользовать механику BRR-P0-008 (`canon_version` + origin `benyehuda-ingest`).

## 6. Связь с runner-шардами (reconcile)
Runner пишет `shards/by-era-*.zip` (булк-артефакт прогона). Отдельный **producer-step** «build-catalog» превращает
накопленные shards → `works/<id>.json` (по одному) + `catalog-v<N>.json` + `shelves-v<N>.json`. Так разделяются:
*производство* (runner, многодневное) и *публикация* (catalog build, по готовности тира). Публиковать тирами
(known-era → rest), не дожидаясь всех 26K.

## 7. Решения D1–D5 — ✅ FINAL (владелец, 2026-06-10)
- **D1 — каталог: тонкий индекс + shard-манифесты.** `catalog-v<N>.json` = маленький корневой индекс (версия,
  перечень манифестов, счётчики, указатели полок); карточки — в shard-манифестах по tier/era/author-prefix
  (`catalog/<group>-v<N>.json`); per-work JSON/ZIP отдельно, served-on-open. *R4: mobile никогда не парсит весь
  24K-индекс; R6: полка/эпоха тянет только свой манифест; R3: версионирование и re-publish на уровне группы.*
- **D2 — OPFS-капы: текст и аудио раздельно.** Текст-кэш soft cap **150–250 МБ**; аудио-кэш ОТДЕЛЬНО
  **250–500 МБ**; оба configurable. LRU-эвикция ОБЯЗАТЕЛЬНА с первого дня; pinned = curated canon + user-данные
  (origin-guard). *R5: предсказуемый футпринт на бюджетных устройствах; R4: ноль тихих переполнений.*
- **D3 — публикация тирами.** known-era+short → rest-tier → giants отдельным траншем (ПОСЛЕ Прохода-2
  chapterization). Публиковать по готовности тира, не ждать всех 26K. *R6/R8: первым — читабельное и
  градуируемое; R5: ценность доставляется раньше; никакой неградуированной свалки на пользователя.*
- **D4 — офлайн-паки: НЕ по умолчанию.** Только явное действие «скачать полку/эпоху» (shelf/era pack); никаких
  фоновых мульти-МБ загрузок. *R4: явный consent на трафик; урок canon-v3 — 17с авто-импорт уже был mobile-risk.*
- **D5 — SW precache: только shell + корневой catalog index.** Shard-манифесты, works, shards, audio — НИКОГДА
  не precache (только runtime cache/OPFS + LRU). *R3: установка SW лёгкая; масштаб корпуса не ломает precache.*

## 8. Прототип (НЕ на 26K сразу — owner Rec 5)
На 100–300 works: build-catalog step → catalog/works/shelves → library.html грузит каталог → open-on-fetch → OPFS LRU →
@380px RTL → версионный re-publish. Замерить first-paint каталога + open-latency (должно быть как warm-reader ~24мс,
т.к. тёплый воркер + узкий fetch). Гейт: никакого авто-импорта 26K; OPFS не растёт безгранично.

## 9. Acceptance / DoD (когда дойдём до реализации)
Library открывается без импорта корпуса; open-work тянет только этот work; OPFS LRU работает + cap соблюдается; curated
canon preinstalled цел; аудио on-demand keyless (canon) / BYOK / browser-speech; версионный upgrade без дублей; honest
online/offline/loading/error; @380px RTL; **0 R1-нарушений** (review_status=machine, провенанс на каждой карточке).
