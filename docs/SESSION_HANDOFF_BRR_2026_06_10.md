# BRR session handoff — 2026-06-10 (Путь А: A0→A4→A2→A3-Slice1 SHIPPED+PROD; NEXT = A3 Slice 2)

> **READ FIRST in the new session** for Ben-Yehuda Reading Room / full-corpus delivery work.
> Consolidated state so the next session picks up without losing context.

## Сверенное состояние (git)
- **Branch `main` = origin/main = HEAD `b992fba`** (A3 Slice 1), дерево ЧИСТОЕ, всё запушено.
- **Прод SW = `v3.10.21-corpus-drill`** — A3 Slice 1 бампнул (shell: library.html + library-ui.js). **ПРОД-ВЕРИФИЦИРОВАНО** end-to-end на linguistpro.kolosei.com (drill L1→L2→L3→reader, 0 pageerror).
- **Бейк (пауза):** `node scripts/premium/run-corpus-prebake.js --status` → done 100 · pending 24541 · failed 0 · gemini today 0/1500. Резюм = `--bake` (нужен GEMINI_API_KEY — **ждёт ротации ключа**).

## A3 Slice 1 — клиент Период→Автор→Работа на v3 — SHIPPED+PROD (`b992fba`)
Владелец одобрил рекомендованную архитектуру (recon-first + competitor research: benyehuda.org/Sefaria/LingQ/Standard Ebooks). L1 = рейл «✓ Готовы к чтению (100)» + хронологическая сетка периодов; решения: 2 слайса · полный глобальный title-search (→ Slice 2).
- **Продюсер** (`build-corpus-catalog.js --full`): NEW сайдкар **`corpus-index-v3.json`** (~160КБ raw / ~35КБ gz) = per-era author-index с **block-membership** + counts + 100 ready-карточек + per-era жанр/язык гистограммы; `ERA_META.range` (флоруит-окно, зеркалит era-map ERA_BOUNDS) + `gloss` → era_taxonomy; **`text_key` на baked-карточках** (served-on-open OPFS resolve / idempotent re-open); root несёт `index_file`+`author_count`. Только 6 манифестов изменились (те, что держат baked).
- **Клиент** (`library-ui.js`): `CORPUS_CATALOG_VERSION=3`; тонкий корень на boot, ленивый сайдкар при первом открытии Корпуса, per-author манифест-блок(и) при drill-in (кэш). L1 рейл+сетка · L2 lean градуированный список авторов + incremental reveal (CORPUS_PAGE=60) · L3 секции (Готовы/перевод позже) + датчик объёма + провенанс, baked ▶ openable / unprocessed ⏳ disabled; breadcrumb back; `openCorpusWork` без изменений.
- **library.html**: corpus-nav CSS (380px RTL, dark). **index.html НЕ тронут.** sw.js precache ТОЛЬКО тонкий корень v3 (D5). i18n `room.corpus.*` (ru/en/he; HE best-effort).
- **Лэйзи-бюджет (D1/R4) доказан гейтом:** L1 = 0 манифестов, L3 = ≤2 (блок автора), не 18/10МБ.
- **Гейты:** `smoke:corpus-room`→v3 **18/18** · NEW `smoke:corpus-nav` **21/21** · room 14 · room-mode 23 · reader-parity · full-catalog 24 · corpus-catalog 34 (v2 цел) · era-map 17 · api-smoke. @380px RTL скрины L1–L4.

## Что отгружено ЭТОЙ сессией (2026-06-10) — НЕ переделывать
Путь А (canon: `docs/planning/BEN_YEHUDA_DELIVERY_26K_PLAN.md` §«IA Зала — РЕШЕНО (A0)» + backlog `BRR-P1-007/014/015`).

- **A0 — IA-решение** (`c2a3227`, docs): владелец выбрал **Вариант 2 — паритет benyehuda.org: Период→Автор→Работа** + фасеты (жанр/язык/coverage) + поиск; coverage = бейджи; **градуированный дефолт** в каждом списке (period-grid НЕ по числу работ — иначе средневековая поэзия фронт-лоадится). Эпоха = **Wikidata-батч (флоруит)**. Шардинг = **era-primary + автор-блок**.
- **A4 — works→прод-том** (`e93672b` код + `b1ff546` docs) — **DONE + ПРОД-ВЕРИФИЦИРОВАН**:
  - `POST /api/benyehuda/works/upload` (server.js) — owner-token гейт, **reuse `AUDIO_UPLOAD_TOKEN`** + header `X-Audio-Upload-Token` (паттерн P0-010, `requireAudioUploadAuth`); id-валидация `^[A-Za-z0-9_-]{1,40}$` + path-guard + атомарная перезапись.
  - Статик-маунт `/data/benyehuda/works` ← `DATA_DIR/benyehuda/works` ПЕРЕД `express.static(public)` (volume-first, fallthrough→git-fallback→честный 404). **Тот же клиентский URL → library-ui/SW не трогались.**
  - Push-скрипт `scripts/premium/push-corpus-works.js`. **Догфуд: 100/100 работ на прод-том** (доказано `Cache-Control: …immutable` = том отдаёт).
  - **git-rm 100 работ НЕ делаем** (corpus-room-smoke фетчит реальный work + локалдев → удаление повалит гейт). 100 = git-фикстура/базлайн; «off-git» только для хвоста A2.
  - Гейт: `test:api-smoke` расширен (works upload no-token→403/X-Local-Mode→403/traversal→400/payload→400/valid→200+GET из тома) + `audioUploadAuth` 9/9.
- **A2.0 — Wikidata era-map** (`45e9ad0`): `scripts/premium/build-era-map.js` → SPARQL `query.wikidata.org` (P569/P570, батч VALUES, User-Agent, on-disk кэш `.tmp/benyehuda/wikidata-cache.json`, backoff, `--offline`) → бакет по **флоруиту ≈ рожд.+35** (fallback смерть−30; иначе `unknown`). Артефакт **`public/data/benyehuda/author-era-map-v1.json`** (коммитнут, воспроизводим). 823/847 QID → эпоха, **works-покрытие 89.4%**. R7 spot-check ок (Бялик/Черниховский→tehiya — флоруит чинит баг «год смерти»). Гейт `smoke:era-map` 17/17.
  - **Роль R9** (authority-control / LOD) введена в `docs/PROJECT_ROLES.md` (owner санкционировал). Память: `feedback_propose_new_role_first.md` (норма: новую роль — ПРЕДЛАГАТЬ владельцу заранее).
- **A2.1/A2.2/A2.3 — полный каталог v3** (`a5f9ebd`): `build-corpus-catalog.js --full` (v2-путь не тронут). Читает **весь `pseudocatalogue.csv` (26 455)** + era-map + overlay baked-coverage из v2 → эмиссия **v3 рядом с v2**. Гейт `smoke:full-catalog` 24/24; v2-путь (`smoke:corpus-catalog` 34/34) цел. **ПРОД-ВЕРИФИЦИРОВАНО** (v3 root + манифесты 200).

## Раскладка данных v3 (что A3 должен потреблять)
```
public/data/benyehuda/
  corpus-catalog-v2.json          # ЖИВОЙ (клиент читает его СЕЙЧАС) — НЕ удалять до A3
  corpus-catalog-v3.json          # НОВЫЙ тонкий корень (3.5КБ): { schema:1, version:3,
                                  #   counts:{works:26455, baked:100, by_era,by_genre,by_lang,by_tier},
                                  #   era_taxonomy:[{era,title,order,count,ready_count}],
                                  #   manifests:[{era,block,file,count}], pointers:{ready:[baked ids]} }
  catalog/era-<era>[-b<NN>]-v3.json  # 18 манифестов; карточка work:
                                  #   { id,title,author,author_qid,era,register,track,genre,orig_language,
                                  #     parts,segments,vocalized_ratio,review_status,audio_status,
                                  #     coverage:{text,niqqud,translation,audio,era_known,tier}, file? }
                                  #   baked → file="works/<id>.json" + coverage.text=true;
                                  #   unprocessed → НЕТ file, coverage.text=false, tier="unprocessed"
  author-era-map-v1.json          # A2.0 derived era (QID→{era,birth,death,floruit,confidence})
  works/<id>.json                 # тела ТОЛЬКО baked (на ПРОД-ТОМЕ + 100 в git как fixture)
  canon-v3.zip                    # curated 79 (auto-import, без изменений)
```
Эпохи (хронологически, `ERA_META`): biblical · medieval · haskalah · tehiya · mandate · modern · contemporary · **unknown** («Период не определён», сортируется последней). by_era (works): medieval 5376 · tehiya 10007 · haskalah 2889 · mandate 5220 · unknown 2806 · biblical 84 · modern 73.

## NEXT — A3 Slice 2 (фасеты + глобальный поиск + полиш) — по отмашке владельца
A3 Slice 1 (ядро навигации) SHIPPED+PROD выше. Slice 2 достраивает премиум-слой:
- **Фасет-чипы со счётчиками** (benyehuda faceted sidebar): «✓ Готовые» / Жанр / Язык — на L1 фильтруют ready-набор, внутри эпохи — набор эпохи (счётчики из `corpus-index-v3.json.facets[era]`). **«Озвучка» отложена** (у корпуса `audio:none` везде — пустой чип = ложь, R8).
- **Глобальный title-search по всем 26K** (решение владельца): продюсер эмитит `corpus-search-v3.json` (заголовок+id+author+era+ready, **niqqud-insensitive** как `_searchNrm` в library note search; ~0.4–0.6 МБ br, **грузится лениво при первом фокусе поиска**, НЕ в precache/SW). Клиент: авторы+готовые мгновенно из сайдкара, заголовки всех работ из search-индекса.
- **Сорты + jump-bar** (Standard Ebooks user-intent sorts + benyehuda א–ת): сорт авторов алфавит/популярность/число-работ; в алфавит-режиме — ивритский jump-bar (Slice 1 = только градуированный порядок). Сорт работ объём/эпоха/алфавит.
- **Гейты Slice 2:** расширить `smoke:corpus-nav` (фасет-фильтр меняет набор; глобальный поиск находит unprocessed-заголовок из др. эпохи); @380px RTL скрин; прод-верифи; commit+push.

Далее: **A5** (fill-queue/дашборд покрытия + таргетинг прогонов) · **probe niqqud** rest-тира (keyless, можно параллельно — гейт широкого бейка).

### Ключевые файлы A3 (для Slice 2)
- продюсер: `scripts/premium/build-corpus-catalog.js` (`--full` ветка `buildFullCatalog` — добавить эмиссию search-индекса рядом с сайдкаром; `ERA_META` range/gloss).
- клиент: `public/js/library-ui.js` (`loadCorpusIndex`/`renderCorpusHome`/`renderCorpusAuthors`/`renderCorpusWorks` + helpers `corpusProvBadge`/`corpusIsReady`; добавить фасет-бар + search-бар).
- CSS: `public/library.html` (блок «BRR-P1-015 A3»). i18n: `room.corpus.*` в ru/en/he.
- гейты: `scripts/premium/corpus-nav-smoke.js` (3272) + `corpus-room-smoke.js` (3271, v3).

## Ключевые файлы
- producer: `scripts/premium/build-corpus-catalog.js` (`--full` → v3) · `scripts/premium/build-era-map.js` (era-map)
- клиент: `public/js/library-ui.js` (`CORPUS_CATALOG_VERSION`, `loadCorpusCatalog`, `openCorpusWork`, вкладки) · `public/library.html` · `public/js/reader-core.js` (byte-parity, гейт `smoke:reader-parity`)
- server: `server.js` (works-upload route + статик-маунт; `requireAudioUploadAuth`) · push: `scripts/premium/push-corpus-works.js`
- lib: `scripts/premium/lib/benyehuda.js` (parseCsv/cleanGenre/firstQid/eraForAuthor) · `db/premium/corpusMeta.js`
- данные: `public/data/benyehuda/{corpus-catalog-v3.json, catalog/, author-era-map-v1.json, works/, canon-v3.zip}`

## Гейты (зелёные на HEAD `b992fba`)
`smoke:era-map` 17/17 · `smoke:full-catalog` 24/24 · `smoke:corpus-catalog` 34/34 (v2 цел) · `smoke:corpus-room` 18/18 (v3) · **`smoke:corpus-nav` 21/21 (NEW, A3 drill)** · `smoke:room` 14/14 · `smoke:room-mode` 23/23 · `smoke:reader-parity` · `test:api-smoke` (incl. works-upload) · `audioUploadAuth` 9/9 · `node --test tests/premium/corpusLedger.test.js`.

## 🔑 ЖДЁТ ВЛАДЕЛЬЦА (security)
1. **Ротация `AUDIO_UPLOAD_TOKEN`** — светился в чате (значение `8de9…0989`). Сгенерировать новый (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), заменить ОБЕ записи в Coolify (Production + Preview Deployments), **Redeploy**. Это НАШ secret, отдельно от Google.
2. **Ротация Gemini-ключа + старого GCP TTS-ключа** (Google-кредиты; нужны для резюма бейка).
- Coolify env страница (kapture-вкладка осталась открыта): `http://167.235.200.19:8000/project/tu9f73va4qp044iyb8nmlsoo/environment/u8dc4qw6re2s8y5cnshe5h2c/application/glmw0wjd6nm70fntxgjy6fkp/environment-variables`

## НЕ ДЕЛАТЬ
index.html не трогать (до Stage 2) · не пушить с красными гейтами (прод-верифицировать после) · не делать R7-сэмплинг и не предбейкать owner-key аудио (решения владельца «в»/«б») · не git-rm 100 baked works (фикстура) · не начинать A3/полный бейк без отмашки (длинные задачи) · новую роль — предлагать заранее (кроме явной pre-authorization).
