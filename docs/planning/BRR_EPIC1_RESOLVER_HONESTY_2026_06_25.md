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
