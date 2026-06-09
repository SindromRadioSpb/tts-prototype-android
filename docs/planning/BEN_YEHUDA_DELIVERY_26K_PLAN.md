# BRR-P0-007 (full-corpus delivery) — 26K delivery architecture — DRAFT for approval

**Дата:** 2026-06-09 · **Статус:** DRAFT (дизайн, no-code до утверждения) · **Проход 3** в CURRENT_STATE §8.
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
  catalog-v<N>.json          # лёгкий discovery: [{id,title,author,era,register,track,genre,
                             #   segments,vocalized_ratio,shelf_refs,work_ref}] — БЕЗ тел текстов
  works/<byehuda_id>.json    # одно произведение: rows[] (he/niqqud/translit/ru) + corpus + provenance
                             #   (то, что сейчас лежит в library.json по одному тексту)
  shelves-v<N>.json          # кураторские + era-полки = POINTERS (списки id), не содержимое
  canon-v3.zip               # curated 79 — остаётся preinstalled/auto-import (без изменений)
```
Runner per-era shards (`shards/by-era-*.zip`) = **источник** для генерации `works/<id>.json` + `catalog`/`shelves`
(producer-step «explode shards → per-work + catalog»). Шарды также годятся как **офлайн-паки по эпохам** (опционально).

## 3. Клиентский флоу (library.html / reader-core)
1. **Discovery:** Library грузит `catalog-v<N>.json` (лёгкий; ~24K × ~150 байт ≈ единицы МБ gz — приемлемо, но
   см. §7: возможно пагинировать/индексировать каталог по эпохам, не один массив).
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

## 7. Открытые решения для владельца (DRAFT)
- **D1 — формат каталога на масштабе:** один `catalog-v<N>.json` (~единицы МБ gz) vs **шардированный каталог по эпохам**
  (`catalog/era-*.json` + тонкий индекс). Рекоменд.: шардированный по эпохам (R4 mobile — не грузить весь индекс сразу).
- **D2 — OPFS cap/эвикция:** размер cap (works count + МБ), что pinned (canon + user). Рекоменд.: ~150–200 works LRU + аудио-LRU отдельно.
- **D3 — публикация тирами:** публиковать known-era как только готов, не ждать rest. Рекоменд.: да.
- **D4 — офлайн-паки по эпохам:** делать ли era-zip скачиваемыми. Рекоменд.: позже (после core on-demand).
- **D5 — sw precache:** catalog + shell в общий sw.js precache; works/audio — runtime cache (НЕ precache). 

## 8. Прототип (НЕ на 26K сразу — owner Rec 5)
На 100–300 works: build-catalog step → catalog/works/shelves → library.html грузит каталог → open-on-fetch → OPFS LRU →
@380px RTL → версионный re-publish. Замерить first-paint каталога + open-latency (должно быть как warm-reader ~24мс,
т.к. тёплый воркер + узкий fetch). Гейт: никакого авто-импорта 26K; OPFS не растёт безгранично.

## 9. Acceptance / DoD (когда дойдём до реализации)
Library открывается без импорта корпуса; open-work тянет только этот work; OPFS LRU работает + cap соблюдается; curated
canon preinstalled цел; аудио on-demand keyless (canon) / BYOK / browser-speech; версионный upgrade без дублей; honest
online/offline/loading/error; @380px RTL; **0 R1-нарушений** (review_status=machine, провенанс на каждой карточке).
