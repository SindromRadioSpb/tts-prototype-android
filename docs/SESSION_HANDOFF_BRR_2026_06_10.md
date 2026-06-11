# BRR session handoff — 2026-06-11 (A0→A4→A2→A3→A5-таргет→probe SHIPPED; БЕЙК ИДЁТ; NEXT = dev-трек + наполнение)

> **READ FIRST in the new session** for Ben-Yehuda Reading Room / full-corpus delivery work.
> Consolidated state so the next session picks up without losing context. Краткая копия —
> `.remember/remember.md` (авто-грузится на старте сессии).

## Сверенное состояние (git)
- **Branch `main` = origin/main = HEAD `146d797`** (probe-niqqud; A5 = `faf0c40`; A3 = `4db4358`), дерево ЧИСТОЕ, всё запушено.
- **Прод SW = `v3.10.22-corpus-search`** — A3 Slice 1+2 (shell: library.html + library-ui.js). **ПРОД-ВЕРИФИЦИРОВАНО** end-to-end (drill L1→L2→L3→reader + глобальный поиск/фасеты, 0 pageerror; мобайл — реальный iPhone владельца ✓ + Android Pixel 7 ✓).
- **A3 ПОЛНОСТЬЮ ОТГРУЖЕН** (Slice 1 drill + Slice 2 search/facets) · **A5 таргет-слайс ОТГРУЖЕН** (build-fill-list + `--ids-file`) · **probe-niqqud ОТГРУЖЕН** (гейт качества PASS 97.8%).
- **🔥 БЕЙК ИДЁТ** (НЕ пауза): таргетированный modern→mandate→unknown (7922 ивр.-оригинала). `--status` → done 107 (100 prior + 7 targeted) · pending 24534 · targeted 7/8099 · failed 0. ~260 работ/день (free-tier Gemini 1500/день), ~31 день, $0. Резюм/durable-цикл + публикация — см. раздел «БЕЙК» ниже.

## A3 Slice 1 — клиент Период→Автор→Работа на v3 — SHIPPED+PROD (`b992fba`)

## A3 Slice 1 — клиент Период→Автор→Работа на v3 — SHIPPED+PROD (`b992fba`)
Владелец одобрил рекомендованную архитектуру (recon-first + competitor research: benyehuda.org/Sefaria/LingQ/Standard Ebooks). L1 = рейл «✓ Готовы к чтению (100)» + хронологическая сетка периодов; решения: 2 слайса · полный глобальный title-search (→ Slice 2).
- **Продюсер** (`build-corpus-catalog.js --full`): NEW сайдкар **`corpus-index-v3.json`** (~160КБ raw / ~35КБ gz) = per-era author-index с **block-membership** + counts + 100 ready-карточек + per-era жанр/язык гистограммы; `ERA_META.range` (флоруит-окно, зеркалит era-map ERA_BOUNDS) + `gloss` → era_taxonomy; **`text_key` на baked-карточках** (served-on-open OPFS resolve / idempotent re-open); root несёт `index_file`+`author_count`. Только 6 манифестов изменились (те, что держат baked).
- **Клиент** (`library-ui.js`): `CORPUS_CATALOG_VERSION=3`; тонкий корень на boot, ленивый сайдкар при первом открытии Корпуса, per-author манифест-блок(и) при drill-in (кэш). L1 рейл+сетка · L2 lean градуированный список авторов + incremental reveal (CORPUS_PAGE=60) · L3 секции (Готовы/перевод позже) + датчик объёма + провенанс, baked ▶ openable / unprocessed ⏳ disabled; breadcrumb back; `openCorpusWork` без изменений.
- **library.html**: corpus-nav CSS (380px RTL, dark). **index.html НЕ тронут.** sw.js precache ТОЛЬКО тонкий корень v3 (D5). i18n `room.corpus.*` (ru/en/he; HE best-effort).
- **Лэйзи-бюджет (D1/R4) доказан гейтом:** L1 = 0 манифестов, L3 = ≤2 (блок автора), не 18/10МБ.
- **Гейты:** `smoke:corpus-room`→v3 **18/18** · NEW `smoke:corpus-nav` **21/21** · room 14 · room-mode 23 · reader-parity · full-catalog 24 · corpus-catalog 34 (v2 цел) · era-map 17 · api-smoke. @380px RTL скрины L1–L4.

## A3 Slice 2 — глобальный поиск + фасеты + L2 сорт/jump-bar — SHIPPED+PROD (`4db4358`, SW `v3.10.22-corpus-search`)
Владелец выбрал «Полный Slice 2». Единое решение: **ОДИН ленивый плоский индекс `corpus-search-v3.json`** питает И глобальный title-search, И фасет-фильтр (не два механизма).
- **Продюсер:** NEW `corpus-search-v3.json` (плоский `{id,t,a,e,g,l,r}` по всем 26 455; 3.3МБ raw / **~370–480КБ на проводе**, грузится ОДИН раз при первом поиске/фасете, НЕ в precache); root несёт `search_file`. Манифесты+сайдкар реэмитятся байт-идентично (минимальный diff).
- **Клиент** (`library-ui.js`): L1 = **постоянный фильтр-бар** (поиск + ✓Готовые-тумблер + Жанр/Язык нативные select со счётчиками из root.counts + clear-чип). Тело L1 рефрешится **на месте** (`corpusRefreshL1Body`) → инпут НЕ теряет фокус при наборе (проверено). Заголовки niqqud-нормализуются один раз на загрузке (`_n`; общий нормализатор, без Node/browser-дрейфа). **Результаты:** кросс-автор/кросс-эпоха ряды (автор показан), ready-хит открывается через served-on-open (джойн к `corpusIndex.ready`), unprocessed = display-only «перевод позже» (честно, не openable). Очистка → домой. **L2 сорт-тумблер** (градуированный⇄алфавит); алфавит → **ивритский א–ת jump-bar** (отсутствующие буквы притушены) + рендер ВСЕХ авторов (якоря). Drill Период→Автор→Работа НЕ тронут (фасеты/поиск = параллельный ГЛОБАЛЬНЫЙ путь, паттерн benyehuda faceted-works). Язык-лейблы через `Intl.DisplayNames` (locale-aware).
- **library.html:** Slice 2 CSS (фильтр-бар/чипы/select/результаты/сорт/jump-bar; 380px RTL, dark). **index.html не тронут.** SW бамп; **search-индекс НЕ precache**. i18n `room.corpus.search/facets/sort/jumpbar`.
- **Гейты:** `smoke:corpus-nav` расширен до **33/33** (ленивый индекс · глобальный поиск кросс-эпоха · фокус-сохранение при наборе · фасет сужает · clear→домой · ✓Готовые все-openable · alpha jump-bar) · все Slice-1 гейты зелёные.
- **Объём решений (для будущего):** фасеты/поиск ГЛОБАЛЬНЫЕ на L1 (не внутри эпохи — within-era фасеты отложены, не запрошены). «Озвучка»-фасет отложен (R8 — у корпуса audio:none). Поиск матчит title (`_n`) + author; не FTS по телам.

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

## A5 ТАРГЕТ-СЛАЙС — SHIPPED (`faf0c40`) — таргетированный бейк по эпохам
Владелец захотел сфокусировать бейк на 3 эпохах (modern 73 + mandate 5220 + unknown 2806). Решение: НЕ полный A5 (дашборд/UI), а **минимальный таргет-кирпич** (= лёгкое семя fill-queue):
- **`scripts/premium/build-fill-list.js --eras modern,mandate,unknown [--out]`** → упорядоченный id-список из манифестов каталога v3 (**Wikidata-эпоха = то, что видит владелец в UI**, НЕ раннер-эвристика `eraForAuthor`, которая бакетит иначе!). Детерминированно; дефолт `.tmp/benyehuda/fill-ids.json` (gitignored).
- **раннер `--ids-file <path>`** → `selectAndOrderOriginals(rows, idFilter)` ограничивает+переупорядочивает `ordered` к списку ∩ bakeable-originals, **в порядке списка**. `doPlan` печатает TARGETED+ETA; `doBake` обрабатывает ТОЛЬКО набор; остальной леджер не тронут. Эпох-эвристика/шардинг/ledger-lib не тронуты (продюсер re-derives эпоху из era-map → каталог корректен).
- **Гейт `smoke:fill-list` 11/11** (офлайн). corpusLedger.test 8/8.
- **Офлайн-превью проверено:** `--plan --ids-file` → **7922/8099 bakeable** (177 = переводы/без-path отброшены), **modern 72 → mandate 5157 → unknown 2693**, ~31 день free-tier $0. Real-ledger restriction подтверждён read-only (бейкнёт ровно 7922, остальное не трогает).
- **Запуск бейка:** `node scripts/premium/build-fill-list.js --eras modern,mandate,unknown` → `node scripts/premium/run-corpus-prebake.js --bake --provider gemini --ids-file .tmp/benyehuda/fill-ids.json` (нужен **GEMINI_API_KEY** — ждёт ротации; ~31-дневный unattended-прогон = отдельная команда владельца). После бейка: re-run `build-corpus-catalog.js --full` чтобы новые baked попали в каталог v3.

## probe-niqqud — SHIPPED (`146d797`) — гейт качества огласовки для бейка
`npm run probe:niqqud` (`scripts/premium/probe-niqqud.js`) — сканирует бейк-шарды → per-shard + overall % огласовки/перевода + PASS/WARN. **Первый прогон: PASS — 97.8% огласовано / 100% переведено** по 8 шардам; rest-тир (unknown) 99.2%, на уровне ядра. Sidecar (локальный niqqud-сервис `127.0.0.1:8799`, `AI_LOCAL_PORT`) **выключен — не блокер**: Dicta-cloud niqqud работает (~0.8с/вызов), residual <1% «cloud filled 0/N» = трудные токены, честно retry. Гейт качества пройден → **широкий бейк зелёный**.

## 🔥 БЕЙК — ИДЁТ (таргетированный modern→mandate→unknown)
- Запущен в этой сессии с Gemini-ключом владельца. Леджер `.tmp/benyehuda/prebake-ledger.json`: done 107 (100 prior + 7 targeted) · pending 24534 · targeted **7/8099** · failed 0. ~260 работ/день (Gemini free-tier 1500/день), ~31 день, $0.
- **Resumable + crash-safe** (отдельная закалка): леджер скипает done, ретраит pending/failed; `--flush 5` сейв каждые 5 работ; `nextShardSeq` не перезаписывает; niqqud+translate кэши персистят. Резюм = та же команда.
- **Durable-цикл (терминал владельца), с видимостью:**
  ```powershell
  $env:GEMINI_API_KEY="<key>"
  while ($true) {
    node scripts/premium/run-corpus-prebake.js --bake --provider gemini --ids-file .tmp/benyehuda/fill-ids.json --flush 5
    node scripts/premium/run-corpus-prebake.js --status
    Start-Sleep -Seconds 3600
  }
  ```
- Прогресс: `run-corpus-prebake.js --status` · качество: `npm run probe:niqqud`. **Только ОДИН экземпляр** (леджер не для параллели).
- ⚠ **Метка эпохи в шарде косметическая** (раннер-эвристика); при публикации `build-corpus-catalog.js --full` эпоха **переопределяется по era-map** → в Зале правильно. Счётчик `gemini today` слегка недосчитывает при краше до флаша — мелочь.
- **ПУБЛИКАЦИЯ baked в Зал** (повторяющийся шаг, когда набралась порция) — **skill `publish-corpus-batch`** + хелпер **`scripts/premium/publish-corpus-batch.js`** (`--dry-run` превью → `--apply` сборка каталога v(N+1) + авто-бамп версии/SW + гейты → печатает ручные шаги: bodies-first `push-corpus-works.js --skip-existing` на прод-том (AUDIO_UPLOAD_TOKEN) → allowlist git add (НЕ works/) → commit+push → `--verify-only` прод-верифи). Первая порция отгружена вручную = `21bd873` (каталог v3→v4, 470 готовых; тела на прод-том). Новые baked появляются как «✓ Готовы к чтению» в своих эпохах. SKILL: `.claude/skills/publish-corpus-batch/SKILL.md`.

## NEXT (dev-трек — выбирает владелец; полный A5-дашборд ON HOLD)
1. **Продолжать бейк** (durable-цикл) + публиковать порции периодически + `probe:niqqud` чек.
2. **Опции разработки:** (a) **полиш A3** — within-era фасеты + сорт работ в L3; (b) **«Следующий для тебя» (i+1)** — премиум learner-рекомендация (leftover acceptance BRR-P1-007, высокая ценность, крупнее); (c) **BYOK «перевод на лету»** для unprocessed (v1.1); (d) **полный A5-дашборд** — ON HOLD.
3. Параллельная разработка с бейком — без конфликта (бейк пишет только в `.tmp`, не трогает код/каталог до явной публикации).

### Ключевые файлы A3 (отгружено — справка)
- продюсер: `scripts/premium/build-corpus-catalog.js` (`--full`→`buildFullCatalog`: эмитит root v3 + 18 манифестов + `corpus-index-v3.json` сайдкар + `corpus-search-v3.json` индекс; `ERA_META` range/gloss).
- клиент: `public/js/library-ui.js` (corpus-nav: `loadCorpusCatalog`/`loadCorpusIndex`/`loadCorpusSearch`/`renderCorpus`→home/authors/works + `renderHomeInto`/`renderResultsInto`/`buildCorpusFilterBar`/`buildHebrewJumpBar`; helpers `corpusNrm`/`corpusApplyFilter`/`corpusReadyMap`/`corpusProvBadge`).
- CSS: `public/library.html` (блоки «BRR-P1-015 A3» + «A3 Slice 2»). i18n: `room.corpus.*` в ru/en/he.
- данные: `public/data/benyehuda/{corpus-catalog-v3.json, corpus-index-v3.json, corpus-search-v3.json, catalog/, works/}`.
- гейты: `scripts/premium/corpus-nav-smoke.js` (3272, 33/33) + `corpus-room-smoke.js` (3271, v3, 18/18).

## Ключевые файлы
- producer: `scripts/premium/build-corpus-catalog.js` (`--full` → v3) · `scripts/premium/build-era-map.js` (era-map)
- клиент: `public/js/library-ui.js` (`CORPUS_CATALOG_VERSION`, `loadCorpusCatalog`, `openCorpusWork`, вкладки) · `public/library.html` · `public/js/reader-core.js` (byte-parity, гейт `smoke:reader-parity`)
- server: `server.js` (works-upload route + статик-маунт; `requireAudioUploadAuth`) · push: `scripts/premium/push-corpus-works.js`
- lib: `scripts/premium/lib/benyehuda.js` (parseCsv/cleanGenre/firstQid/eraForAuthor) · `db/premium/corpusMeta.js`
- данные: `public/data/benyehuda/{corpus-catalog-v3.json, catalog/, author-era-map-v1.json, works/, canon-v3.zip}`

## Гейты (зелёные на HEAD `146d797`)
`smoke:era-map` 17/17 · `smoke:full-catalog` 24/24 · `smoke:corpus-catalog` 34/34 (v2 цел) · `smoke:corpus-room` 18/18 (v3) · **`smoke:corpus-nav` 33/33 (A3 drill + Slice 2)** · **`smoke:fill-list` 11/11 (A5)** · **`npm run probe:niqqud` PASS (97.8%)** · `smoke:room` 14/14 · `smoke:room-mode` 23/23 · `smoke:reader-parity` · `test:api-smoke` · `audioUploadAuth` 9/9 · `node --test tests/premium/corpusLedger.test.js` 8/8.

## 🔑 ЖДЁТ ВЛАДЕЛЬЦА (security — напоминать)
Ротация **AUDIO_UPLOAD_TOKEN** (светился в чате) + **Gemini-ключ** (сейчас В РАБОТЕ для бейка → ротировать ПОСЛЕ прогона / ограничить в Google Cloud до Generative Language API + квота) + старый GCP TTS-ключ.

## 🔑 ЖДЁТ ВЛАДЕЛЬЦА (security)
1. **Ротация `AUDIO_UPLOAD_TOKEN`** — светился в чате (значение `8de9…0989`). Сгенерировать новый (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), заменить ОБЕ записи в Coolify (Production + Preview Deployments), **Redeploy**. Это НАШ secret, отдельно от Google.
2. **Ротация Gemini-ключа + старого GCP TTS-ключа** (Google-кредиты; нужны для резюма бейка).
- Coolify env страница (kapture-вкладка осталась открыта): `http://167.235.200.19:8000/project/tu9f73va4qp044iyb8nmlsoo/environment/u8dc4qw6re2s8y5cnshe5h2c/application/glmw0wjd6nm70fntxgjy6fkp/environment-variables`

## НЕ ДЕЛАТЬ
index.html не трогать (до Stage 2) · не пушить с красными гейтами (прод-верифицировать после) · не делать R7-сэмплинг и не предбейкать owner-key аудио (решения владельца «в»/«б») · не git-rm 100 baked works (фикстура) · не начинать A3/полный бейк без отмашки (длинные задачи) · новую роль — предлагать заранее (кроме явной pre-authorization).
