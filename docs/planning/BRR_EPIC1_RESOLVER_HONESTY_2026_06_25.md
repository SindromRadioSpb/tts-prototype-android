# Эпик 1 — Честность резолвера (recon-дизайн) · P0

**Дата:** 2026-06-25 · **Статус:** 🟡 RECON — ждёт approval по развилкам §6 перед кодом.
**Родитель:** `docs/planning/BRR_UX_AUDIT_2026_06_25.md` · Память [[project_brr_ux_audit]]. Роли R10 (вед.) · R1 · R9 · R3.
**Цель:** бейдж «точно» появляется ТОЛЬКО когда офлайн-чтение действительно решающее; все уверенно-ложные пути честно деградируют. Моат №1 (морфология-на-тапе). Всё Room-only; `index.html` + parity-билдер нетронуты.

---

## 1. Корень проблемы (подтверждён в коде)
`notes-autogen.js formFirstResolve` (стр. 133–147): после фильтра POS+биньян считает `ids = distinct pealim_id`. При `ids.length === 1` — решающе. При **`ids.length > 1`** (истинный гомограф огласованной ячейки) — **угадывает** `arr.find(pos)||arr[0]` и возвращает как решающий → `resolveContentUnit` (стр. 302–303) ставит `channel:'form-first'`, conf **0.92** → `provenanceLabel` (reader-morph.js:277) **безусловно** «exact/точно».

**Непоследовательность (доказательство, что это баг, а не дизайн):** сёстры возвращают `null` на кратности — `resolveTrueRoot` (стр. 190 `roots.length>1 → null`), `offlineMeaningLookup` (стр. 167 `meanings.length>1 → null`). Только `formFirstResolve` угадывает. Живой кейс: הֵלֶךְ → предложный глосс под «точно».

Дополнительно: `resolveCore` (reader-morph.js:312) хардкодит `kind:null` → guard'ы `propernoun` (resolveTrueRoot:179, checkUnit:228) НИКОГДА не срабатывают → имена собственные фабрикуют корень+«семью корня». И `provenanceLabel:277` даёт «exact» на ЛЮБОМ form-first без проверки conf.

---

## 2. Дизайн фикса (минимальный, по функциям)

### F1 — `formFirstResolve` отдаёт сигнал неоднозначности (notes-autogen.js:133)
Вместо угадывания-как-решающего — вернуть флаг + альтернативы:
```
var ids = distinct pealim_id;
if (ids.length === 1) return { meaning, pealim_id, ambiguous:false, alts:[] };
// коллизия: best-effort + ЧЕСТНЫЙ флаг
var pick = arr.find(pos) || arr[0];
var alts = distinct {pealim_id, pos, meaning, root} (cap ~3);
return { meaning: pick.meaning, pealim_id: pick.pealim_id, ambiguous:true, alts };
```
(Контракт меняется на объект с `ambiguous`/`alts`; единственные потребители — `resolveContentUnit` и build-notes-харнесс, обновить оба в lock-step — комментарий стр. 5–6 это требует.)

### F2 — `resolveContentUnit` не штампует «точно» на коллизии (notes-autogen.js:297)
```
var ff = formFirstResolve(maps, u);
if (ff && ff.pealim_id && !ff.ambiguous) { channel='form-first'; conf=0.92; }       // как сейчас
else if (ff && ff.pealim_id &&  ff.ambiguous) { channel='form-first'; conf=0.65; AMBIG=true; ALTS=ff.alts; }
```
Вернуть доп. поля `ambiguous`, `alts` в результате (стр. 320).

### F3 — `provenanceLabel` чтит неоднозначность (reader-morph.js:275)
```
if (r.channel === 'form-first' && !r.ambiguous) return 'exact';   // было: без !r.ambiguous
```
Тогда ambiguous form-first (conf 0.65 + meaning + ok) падает на стр. 281 → **«вероятно» (likely)**. `_channelRank` не трогаем (вариант-селектор: чистый form-first conf 0.92 всё равно бьёт ambiguous 0.65 при равном ранге).

### F4 — Карточка показывает альтернативы + мягчит вторичные поля (reader-morph.js resolveCore/renderCardHtml)
- Пробросить `ambiguous`/`alts` в payload карточки.
- При `ambiguous` (или label∉{exact}): рендерить **«возможно также: <alt-глоссы>»**, приглушить корень/биньян/POS (это уже не «точно»).

### F5 — Гейт обогащения по той же уверенности (morph-confidence-gates-enrichment)
Аналог функц-гейта (resolveCore:354–361 обнуляет root/par/url для служебных) — для контент-слов при label∉{exact} ИЛИ ambiguous:
- Pealim-линк → **поиск**, не direct (не выдавать страницу как авторитетную).
- Таблица спряжения → свернуть/пометить **«возможная парадигма»**, не рендерить 1:1 как факт.
- «Слова от этого корня» → скрыть/пометить (корень неуверен).

### F6 — Гейт имён собственных (morph-proper-name-gate)
Офлайн-NER нет. Решение по образцу `functionGate`: **курируемый стоп-лист высокочастотных канон-имён** (R1-проверенный, без фабрикации; דוד/משה/ירושלים/… — НЕ שלום «мир» без контекста). При попадании: suppress root/family/table, label **«имя собственное / не определено офлайн»**, честный линк-поиск. Структурная демоция F1/F5 уже ловит часть имён (нет чистого form-match → не «точно»); стоп-лист добивает остаток. Список расширяемый, начинается с топ-N по корпусу.

### F7 — borrowed-vs-unknown (morph-missing-word-honest)
Когда глосс получен ТОЛЬКО `offlineMeaningLookup` от однокоренного соседа (а точного lemma нет): пометить **«нет в офлайн-словаре (показано родственное слово)»** + заметный CTA «Уточнить (Dicta)»/Pealim-поиск. (Сигнал: `channel==='meaning-fallback'` уже даёт conf 0.6 → «подобрано»; нужно ЯВНО различить «это другая лемма» в UI.)

### F8 — никуд-контекст бейдж (morph-niqqud-context-honesty) — последним, легче
Микро-бейдж доверия на работах с низким покрытием никудом (бимодально 56.6%); комплемент к Tier-2 re-niqqud дата-фиксу. Опционально.

---

## 3. Измерительный харнесс (morph-exact-precision-gate) — СТРОИТСЯ ПЕРВЫМ
`scripts/premium/reader-morph-audit.js` → `npm run smoke:reader-morph:audit`.
- **Выборка** N≥300 реальных строк из baked-работ (`public/data/benyehuda/works/*.json` локально) → токенизация → `resolveCore` офлайн (тот же путь, что в браузере, Node-импорт).
- **Silver-оракул:** Dicta-контекст (морфология в контексте) — раздаёт «верное» чтение/лемму. Сравнить с тем, что резолвер пометил «exact».
- **Метрики (раздельно, R10-норма):** precision бейджа «exact» (из помеченных exact — % верных по Dicta); recall честной-деградации (% коллизий/имён/missing, корректно понижённых). Floor валит сборку.
- **Caveat:** silver≠gold (Dicta врёт на архаике) — тегать доверие, отчёт не абсолют; graceful-skip на Dicta 503 (не валить гейт при недоступности оракула — печатать SKIP).

---

## 4. Фазы (каждая — гейты + @380px + прод-верифи; commit+push)
- **P1.0** Харнесс + **baseline-замер** текущей precision «exact» (без фикса) — фиксируем «это 0.1% хвост или 5% системно?».
- **P1.1** F1+F2+F3 мультипликативная демоция (коллизии больше не «точно»). Замер: precision↑, recall-деградации>0.
- **P1.2** F4+F5 альтернативы + гейт обогащения (Pealim-search, таблица «возможная», семья скрыта при не-exact).
- **P1.3** F6 стоп-лист имён собственных.
- **P1.4** F7 borrowed-vs-unknown.
- **P1.5** F8 никуд-бейдж (опц.).

## 5. Инварианты / гейты
Всё в `notes-autogen.js` + `reader-morph.js` + i18n (новые строки `room.reader.morph.*` alts/«возможно также»/«нет в словаре»/«имя собственное» → ru/en/he, гейт `smoke:i18n`). `smoke:reader-parity` не затронут (билдер не трогаем). `smoke:reader-morph` (существующий) + новый `smoke:reader-morph:audit`. Offline-first сохранён (харнесс — dev-only Node, Dicta опц.). build-notes lock-step: обновить генератор заметок симметрично F1/F2 (иначе разойдётся parity заметок).

## 6. Развилки на approval (владелец решает)
- **D1 (оракул харнесса):** Dicta-**cloud** (sidecar :8799 был выкл.), on-disk кэш, graceful-skip. ⇐ рекомендую. Альт: поднять локальный sidecar.
- **D2 (precision-floor):** НЕ задавать 98% вслепую — **сперва baseline-замер (P1.0)**, затем floor = max(baseline, цель). ⇐ рекомендую «измерить → зафиксировать порог по данным».
- **D3 (лейбл коллизии):** ambiguous form-first → **«вероятно» + «возможно также: …»** (не «подобрано»). ⇐ рекомендую.
- **D4 (имена собств. F6):** курируемый стоп-лист — **сейчас** (фаза P1.3) или отложить (структурная демоция F1/F5 уже частично ловит)? ⇐ рекомендую P1.3 (после ядра).
- **D5 (объём v1):** все фазы P1.0–P1.5 в этом эпике, или остановиться на P1.0–P1.2 (ядро доверия) и P1.3–P1.5 как добивка? ⇐ рекомендую ядро P1.0–P1.2 первым релизом, затем добивка.

> ✅ **РАЗВИЛКИ ОДОБРЕНЫ владельцем 2026-06-25** (все рекомендованные дефолты: D1 Dicta-cloud+кэш+skip · D2 baseline-сначала · D3 «вероятно»+alts · D4 имена P1.3 · D5 ядро P1.0–P1.2 первым). Старт = P1.0 (харнесс + baseline). Эпик отложен на свежую фокус-сессию (чекпойнт 2026-06-25 после Эпика 7).

---

## ✅ P1.0 — ВЫПОЛНЕНО (baseline снят 2026-06-25)

**Харнесс:** `scripts/premium/reader-morph-audit.js` → `npm run smoke:reader-morph:audit` (`--rows=N` / `--no-oracle` / `--keep`). Браузерный (Playwright, library.html, SW-block, locale ru) — НЕ чистый Node-import: `resolveCore` тянет InflectionDict (3.3МБ gz через fetch+OPFS), браузер-онли. Резолвер **не тронут** (`smoke:reader-morph` зелёный). Отчёт → `.tmp/benyehuda/reader-morph-audit-report.json`; кэш оракула → `.tmp/benyehuda/reader-morph-audit-dicta-cache.json`.

**Два слоя (как одобрено):**
- **A — структурный (детерминированный, без сети):** через `ReaderMorph.ensureEngine().maps.formIdx` + экспортированный `NotesAutoGen.unitFormVariants` воспроизводим `formFirstResolve` и считаем `ids.length` на каждой «exact»-form-first ячейке. Ноль изменений резолвера.
- **B — Dicta silver-оракул:** оракул **уже построен** — `public/js/reader-dicta.js` (`ReaderDicta.analyzeSentence`, браузер→Dicta CORS, graceful-degrade). Кормим **`hebrew_plain`** (неогласованный) → контекст-POS Dicta независим от корпусного никуда. On-disk кэш + graceful-skip(503). Уточнение recon: оракул переиспользован, не построен заново.

**Выборка:** 350 строк / 59 работ → 2455 токенов (1023 контентных = «exact»). Детерминированная стратификация (страйд по `works/*.json`) → воспроизводима для before/after.

### Результаты baseline (ответ на вопрос владельца «хвост 0.1% или системно 5%?»)
| Метрика | Значение | Смысл |
|---|---|---|
| **«exact» на мультиплик-ячейке (Слой A)** | **129 / 1023 = 12.6%** | **СИСТЕМНО, не хвост.** Бейдж «точно» сидит на структурно-неразрешимой ячейке в каждом ~8-м случае. |
| honest-degradation recall (мультиплик) | **0.0%** | Сейчас НИ ОДНА мультиплик-ячейка не деградирует. P1.1 обязан поднять до 100%. |
| precision «exact» vs Dicta (Слой B) | **83.6%** (820✓/161✗) | ~16.4% «exact» имеют POS, расходящийся с контекстом Dicta. silver≠gold (Dicta дрейфит на архаике) — мягкая метрика, не hard-floor. |

### Состав ложных-«exact» (161) — РЕВИЗИЯ приоритета фикса
- **multi-id = 68** → закрывает **P1.1** (F1+F2+F3, демоция мультиплик-ячеек). _(всего мультиплик-ячеек 129; 61 «угадал POS верно по удаче» — их P1.1 тоже честно демотирует с «точно».)_
- **single-id = 93** (уверенный единичный НЕВЕРНЫЙ выбор — **P1.1 их НЕ ловит**): по классу-цели Dicta → **content 111 · function 40 · proper 10**. Хвост требует: F6 стоп-лист имён (P1.3, ~10), расширение `functionGate`-списка (content→function ловушки: וְעַד→предлог, הַרְבֵּה→наречие, בֶּאֱמֶת→наречие), и Tier-3 контекст (content↔content гомографы שָׁנָה «повторять»→«год», что только контекст решает).

### D2 — рекомендованный floor (по данным)
- **Hard-гейт (детерминированный, без Dicta):** `0` бейджей «exact» на мультиплик-form-first-ячейке ⇔ honest-degradation recall = **100%** на мультиплик-ячейках. Это инвариант P1.1, не зависит от сети — годен для CI.
- **Soft-трекинг (Dicta, graceful-skip):** precision «exact» ≥ baseline 83.6%, цель пост-P1.1 ≈ **89–90%** (демоция 129 мультиплик убирает 68 ложных + честно понижает 61 «удачных»), полная честность (после F6+functionGate+Tier-3) ≈ 96–98%, ограничена single-id content-гомографами, которые без контекста неразрешимы.

**Вывод для P1.1:** мультиплик-демоция — верный первый рычаг (крупнейший детерминированный ковш, 129 ячеек), но данные показывают: ~58% POS-ложных-«exact» — single-id, т.е. **P1.3 (имена) и Tier-3-контекст важнее, чем предполагал recon** — учесть при планировании добивки.

---

## ✅ P1.1 — ВЫПОЛНЕНО (мультиплик-демоция F1+F2+F3, 2026-06-25)

**Что сделано (Room-only):**
- **F1** `formFirstResolve` (notes-autogen.js): возвращает `{meaning, pealim_id, ambiguous, alts}`. `ids.length===1`→`ambiguous:false`; `>1`→best-effort pick (БЕЗ изменения) + `ambiguous:true` + `alts` (ривалы по pealim_id, cap 3, исключая pick). Зеркально в `build-notes-from-bundle.js` (инвариант «верный порт»; тела заметок не меняются — гейт `autogen-parity` зелёный).
- **F2** `resolveContentUnit` (notes-autogen.js): ambiguous form-first → `conf 0.65` (вместо 0.92), возвращает `ambiguous`+`alts`. Form-first исключён из SUSPECT→review-даунгрейда (form-match — собственная улика; иначе тонкая base-парадигма роняла бы в «подобрано» вместо D3-«вероятно»).
- **F3** `provenanceLabel` (reader-morph.js): `«точно»` только при `form-first && !ambiguous`. ambiguous form-first → падает на «вероятно» (likely). `resolveCore` пробрасывает `ambiguous`/`alts` в карточку (обнуляет на function-gate).

**Результаты (повтор `smoke:reader-morph:audit --rows=350`, кэш тёплый):**
| Метрика | Baseline (P1.0) | После P1.1 |
|---|---|---|
| «exact» на мультиплик-ячейке | 129 (12.6%) | **1 (0.1%)**¹ |
| honest-degradation recall (мультиплик) | 0.0% | **99.2%** |
| precision «exact» vs Dicta | 83.6% | **89.2%** |
| ложных-«exact»: multi-id ковш | 68 | **0** |
| label dist | exact 1023 / likely 33 | exact **895** / likely **161** (128 демотировано в «вероятно») |

¹ остаточная 1 — артефакт реконструкции аудита на ה-инициальном корневом слове (`הוֹלֵךְ`, не article; `articleStrippedForm` срабатывает на корневой ה), не промах резолвера. Single-id хвост (93) без изменений — цель P1.2/P1.3/Tier-3.

**Floor (D2) — поставлен:** детерминированный CI-инвариант в `smoke:reader-morph` (без сети): `שָׁנָה` (гомограф год/повторять) → `ambiguous:true` + `label==='likely'` + `alts≥1` + реальный глосс; контроль `שָׁלוֹם` → `exact` + `ambiguous:false`. Dicta-precision — мягкий трек в аудите (89.2%, silver≠gold).

**Гейты зелёные:** `reader-morph` (+P1.1-floor) · `autogen-parity --gate` (тела заметок байт-идентичны) · `reader-parity` (index.html/builder нетронуты) · `i18n` 226/0 · `autogen-surfacing` 9/9 · `autogen-eager` 21/21 · `reader-notes`. Скрин @380px: карточка `שָׁנָה` — бейдж «вероятно», глосс «повторять», без поломок. SW `v3.10.85-resolver-honesty`.

**ОТГРУЖЕНО+ПРОД-ВЕРИФИЦИРОВАНО** (`fbe328e`, push→Coolify): прод SW = `v3.10.85-resolver-honesty`; Node-fetch подтвердил на проде F1 `ambiguous`, F2 `conf 0.65`, F3 `!r.ambiguous`-guard + проброс в карточку. Живой device-check (мобайл) — за владельцем (ритм как в Эпике 7).

**Уточнение состава хвоста (пост-P1.1, для приоритета добивки):** single-id 93 → **content 48 (Tier-3 контекст) · function 36 (расширение `functionGate`-списка) · proper 9 (F6 имена)**. Т.е. имена — НАИМЕНЬШИЙ ковш (~10% хвоста); доминируют function-ловушки + content-гомографы. ⇒ после P1.2 наивысший рычаг = Tier-3 + functionGate-expansion, НЕ F6.

**ОСТАЁТСЯ в P1.2 (F4+F5):** рендер `alts` как «возможно также: …» (сейчас несутся, не показаны) + гейт обогащения при не-exact (Pealim direct→search, таблица→«возможная парадигма», семья корня скрыта). На скрине видно: ambiguous-карточка ещё даёт direct Pealim + таблицу + семью — это закрывает F5.

---

## ✅ P1.2 — ВЫПОЛНЕНО (alts-UI + гейт обогащения F4+F5, 2026-06-25)

**Что сделано (Room-only, только `reader-morph.js` + `library.html`-CSS + локали — `notes-autogen.js` НЕ тронут, parity не задет):**
- **F4** `renderCardHtml`: при `card.alts.length` — строка **«возможно также: ‹глосс ривала›; …»** (cap 3) под основным глоссом. Новый i18n `room.morph.altReadings` (ru «возможно также» · en «could also be» · he «ייתכן גם»). CSS `.rm-alts` (приглушённая, вторичная к глоссу).
- **F5 гейт обогащения** при неуверенном чтении:
  - `resolveWordLight`: `card.ambiguous` → Pealim **direct→поиск** (`/search/?q=`, не `/dict/`) — не выдаём конкретную страницу ривала как авторитет.
  - `renderCardHtml`: `card.ambiguous` → **скрыть «Слова от этого корня»** (корень = ривала, не обязательно этого слова); `label!=='exact'` → таблица помечена **«возможная парадигма»** (i18n `room.morph.possibleParadigm`, амбер `.rm-acc-uncertain`), не «Спряжение/Склонение».
  - **Скоуп-уточнение:** direct→search + family-hide гейтятся на `ambiguous` (точечный сигнал гомограф-гадания P1.1), таблица-ярлык — на всех `label!=='exact'`. Это острее, чем recon «всё не-exact», и не регрессит легитимные `likely`-парадигмы (single best-match, не гадание среди ривалов).

**Верификация:** `smoke:reader-morph` +5 P1.2-ассертов (карточка `שָׁנָה`: бейдж «вероятно» · `.rm-alts` «возможно также» · семья скрыта · ссылка `/search/` · таблица `.rm-acc-uncertain`). Скрин @380px: «возможно также: год» · «Искать на Pealim» · «возможная парадигма» (амбер) · семья отсутствует. Гейты: `reader-morph` · `i18n` 226/0 (+2 ключа ×3) · `reader-parity` · `reader-notes`. SW `v3.10.86-resolver-alts`.

**ОТГРУЖЕНО+ПРОД-ВЕРИФИЦИРОВАНО** (`960953f`): прод SW = `v3.10.86-resolver-alts`; Node-fetch подтвердил F4 `room.morph.altReadings`, F5 `card.ambiguous && card.pealim_direct` (link-gate) + `!card.ambiguous` (family-hide) + `room.morph.possibleParadigm`, `.rm-alts` CSS в library.html, i18n alt-ключи в ru/en/he. Живой device-check — за владельцем.

**Итог ядра P1.0–P1.2 (D5):** моат «морфология-на-тапе» теперь честен — «точно» только на решающих ячейках; гомографы → «вероятно» + «возможно также» + не-авторитетное обогащение. Хвост (single-id 93: content 48 / function 36 / proper 9) — за пределами ядра: добивка = Tier-3 контекст + расширение `functionGate` + (мелко) F6 имена.

---

## 🔄 ХВОСТ — Tier-3 broaden + auto-reach (в работе, 2026-06-25)

**Measure-first (R10):** добавил `--tier3` в аудит (`83c1e43`) — симуляция opt-in контекст-пути по кэшу Dicta (без сети). **Находка, переворачивающая план:** Tier-3 КАК ЕСТЬ чинит лишь **19/93 = 20.4%** хвоста, 0 регрессий. Узкое место — НЕ досягаемость, а узость `pickContextReading` (только content↔content) + `CONTEXT_GLOSS` (8 слов). Промахи = content→function (нет демоции) + participle→noun.

**Сделано:**
- **Движок (broaden):** `pickContextReading` путь (B) расширен — когда Dicta-контекст-POS = функция, а офлайн дал content → берём функц-чтение (курир. глосс из `CONTEXT_GLOSS` или POS-only, без фабрикации). `CONTEXT_GLOSS` дополнен R1-курир. наречиями (עד/באמת/להפך/בדיוק/לפחות/בכלל/אמנם/בעצם/לגמרי/כבר). **Перемер: хвост 20.4%→54.8% (51/93), регрессий 0/766.** Остаток промахов = participle→noun (content↔content, нужен офлайн-глосс существительного, которого нет) + имена. Гейт: `smoke:reader-morph` +3 чистых ассерта `pickContextReading` (Dicta-prep→демоция, POS-only без глосса, согласие POS→без демоции).
- **Досягаемость (выбор владельца = авто на каждый тап с разовым согласием):** провайдер контекста теперь ВСЕГДА подключён, гейтится по-тапно на `room.contextConsent` ('granted'|'declined'|''). Первый тап при неопределённом согласии → офлайн-карточка + **одноразовый consent-модал** (R5: объясняет исходящий в Dicta, машинный разбор, как отключить). granted → авто-Dicta на каждый тап (ловит и single-id «точно»-хвост). Тумблер в «Подсказках чтения» ↔ consent. Новые строки `room.morph.consent*` (ru/en/he). Скрин @380px подтверждён.

**Честный предел (на момент broaden):** participle→noun (~33) + имена (~9) остаются.

### participle-soften (SHIPPED, выбор владельца «добить честность»)
`pickContextReading` путь (C): когда Dicta-content-POS расходится с офлайн-content по оси verb↔nominal (participle↔noun: הוֹרָה/הָעוֹלִים/הַמֵּת — офлайн form-match'ит глагол, Dicta читает существительное), и (A) не дал решающего переразбора → `use:"soften"`. `resolveWordLight`: НЕ суффрицируем (нет офлайн-глосса существительного), а сохраняем родственное чтение и **демотируем «точно»→«вероятно»** + `ambiguous=true` (включает F5-гейт) + `contextPos`. Карточка: «вероятно» + глосс глагола + **«по контексту, возможно: существительное»** (i18n `room.morph.contextSuggests` ru/en/he) + поиск-ссылка/«возможная парадигма»/семья скрыта. **Перемер: хвост ЧЕСТЕН 84/93 = 90.3%** (51 POS-исправлено + 33 softened), регрессий **0/766**. Остаток = ~9 имён (F6). Гейт `smoke:reader-morph` +soften-ассерт. Скрин @380px ок. SW `v3.10.88-participle-soften`.

---

## 7. Промпт для новой сессии (copy-paste старт Эпика 1)
> Продолжаем LinguistPro (Node PWA, иврит↔рус, prod https://linguistpro.kolosei.com). Начинаем **Эпик 1 — Честность резолвера (P0)** программы UX-улучшений Читального зала (Зал = `public/library.html`).
>
> **СНАЧАЛА ПРОЧИТАЙ (в порядке):** `.remember/remember.md` (хендофф, авто-загрузился) · `docs/planning/BRR_EPIC1_RESOLVER_HONESTY_2026_06_25.md` (recon Эпика 1 — ЭТОТ док, §1–§6 дизайн+фазы+одобренные развилки) · `docs/planning/BRR_UX_AUDIT_2026_06_25.md` (план 9 эпиков) · `docs/PROJECT_ROLES.md` (R1–R10 авто) · `CLAUDE.md`. Память: [[project_brr_ux_audit]] · [[project_ben_yehuda_reading_room]] · [[feedback_studio_live_source_inline]] · [[feedback_headless_opfs_playwright]] · [[feedback_test_with_nonempty_profile]] · [[feedback_browser_verify_fresh_code]] · [[feedback_curl_utf8_egress_myth]] · [[feedback_commit_push_deploy_default]].
>
> **СОСТОЯНИЕ:** main HEAD `c74e715`, прод SW `v3.10.84-room-desktop`. Эпик 7 (десктоп-раскладка) отгружён+полностью верифицирован (0 фиксов). Это P0-эпик: моат №1 (морфология-на-тапе) тратит «точно» на неразрешённые чтения (живой баг `הֵלֶךְ` → предложный глосс под «точно»).
>
> **КОРЕНЬ БАГА (в коде):** `public/js/notes-autogen.js` → `formFirstResolve` (стр. ~133–147): на `ids.length>1` (гомограф огласованной ячейки) угадывает `arr.find(pos)||arr[0]` как решающий (→ `resolveContentUnit:302-303` conf 0.92 → `public/js/reader-morph.js provenanceLabel:277` «exact/точно») — единственный путь без guard'а кратности (сёстры `resolveTrueRoot:190` / `offlineMeaningLookup:167` возвращают null). Плюс `provenanceLabel:277` даёт «exact» на ЛЮБОМ form-first без проверки conf; `resolveCore:312` хардкодит `kind:null` (guard'ы имён не срабатывают).
>
> **ОДОБРЕННЫЕ ДЕФОЛТЫ:** D1 оракул = Dicta-cloud + on-disk кэш + graceful-skip(503) · D2 floor = СНАЧАЛА baseline-замер, потом по данным · D3 лейбл коллизии = «вероятно» + alts «возможно также» · D4 стоп-лист имён = P1.3 · D5 ядро **P1.0–P1.2 первым релизом**.
>
> **ЗАДАЧА — начать с P1.0 (measure-before-code, R10):** построить `scripts/premium/reader-morph-audit.js` → `npm run smoke:reader-morph:audit` (N≥300 реальных строк из `public/data/benyehuda/works/*.json` → офлайн-резолв тем же `resolveCore`, что в браузере, Node-импорт → сравнить «exact» с Dicta-silver; раздельно precision-«exact» + recall честной-деградации; graceful-skip 503) И снять **baseline** («коллизии/имена — 0.1% хвост или 5% системно?»). Затем по цифрам → P1.1 (F1+F2+F3: `formFirstResolve` отдаёт `ambiguous`+`alts` → conf 0.65 → «exact» только при `!ambiguous`) → P1.2 (F4+F5 alts-UI + гейт обогащения Pealim-direct/таблица/семья при не-exact).
>
> **НОРМЫ:** всё Room-only — `index.html`+билдер `reader-core.js` НЕ трогать (`smoke:reader-parity`); **lock-step:** синхронно обновить build-notes генератор с F1/F2 (иначе разойдётся parity заметок); volume-тест на большом профиле; offline-first; новые строки `room.reader.morph.*` → ru/en/he (`smoke:i18n`); commit+push=деплой + SW bump на shell-изменение → тост «Обновить» (`.ru-upd`); прод-верифи Node-fetch (не Windows-curl); фазы с прод-верифи. Kapture: клики нужен активный Kapture-панель+фокус; eval-MCP опт-ин; не ресайзит (мобайл = owner narrow-window).
>
> **Начни с:** краткого резюме подхваченного контекста + плана P1.0 (как строим харнесс, откуда baseline, оракул/выборка), затем жди моего ОК перед кодом.
