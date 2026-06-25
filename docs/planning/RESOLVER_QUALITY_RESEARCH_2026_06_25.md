# Резолвер морфологии — research-пасс качества ядра (2026-06-25)

**Статус:** 🟢 RESEARCH ЗАВЕРШЁН → приоритизированный план ниже (ждёт выбора владельца, какие R-айтемы планировать).
**Метод:** deep-research workflow (6 углов · 26 источников · 124 утверждения → 25 верифицировано состязательно, 22 подтверждено / 3 убито). Роли R10 (вед.) · R1 · R5 (offline-first).
**Связано:** `BRR_EPIC1_RESOLVER_HONESTY_2026_06_25.md` (Эпик 1 SHIPPED), [[project_brr_ux_audit]].
**📚 ПОЛНАЯ доказательная база (durable research dossier):** `docs/research/HEBREW_MORPHOLOGY_RESOLVER_RESEARCH_2026_06_25.md` — таблицы трибанков/моделей/лицензий, [ВЕРИФ]/[ОПРОВЕРГНУТО]-разметка, методология, аннотированные источники. Этот файл = action-план; dossier = evidence.

---

## TL;DR (честный ROI)
Ядро (form-first + Dicta-Tier-3) **близко к практическому потолку для offline-browser**. Реальные выигрыши — НЕ в переписывании form-first логики, а в трёх вещах: **(1) золотой eval (узнать истинный потолок, разорвать циркулярность silver), (2) газеттир-гард имён (закрыть последний ковш хвоста, дёшево, лицензионно-чисто), (3) опц. спайк tiny-DictaBERT-ONNX (если влезет — ПОЛНОСТЬЮ офлайн Tier-3 без сети/согласия).** Большая модель в браузере (NeoDictaBERT 922МБ) — НЕ влезает.

---

## Подтверждённые находки

### Область 1 — Gold eval
- **Золотые ивритские ресурсы есть, но лицензии расходятся:** HTB и IAHLT-HTB = **CC BY-NC-SA** (некоммерч., БЕЗ лемм пока); **IAHLTwiki = CC BY-SA 4.0** (коммерч. ок, ЕСТЬ леммы + UPOS + морф + зависимости + **вложенный NER**). Для продукта-деривата → IAHLTwiki; HTB/IAHLT-HTB годятся как внутренний eval-оракул (измерение ≠ редистрибуция).
- **🔴 КРИТИЧНО: ВСЕ золотые ресурсы — register-mismatch** к архаике Бен-Иегуды. HTB = газетный HaAretz 1990-91; IAHLTwiki = совр. Wikipedia. Архаику/литературу не покрывает НИКТО → истинный потолок на Бен-Иегуде **нельзя** получить из трибанков; нужна **ручная разметка выборки ИЗ Бен-Иегуды**.
- **IAHLTwiki = лучший** (ручные леммы + NER, человеко-размечен → **НЕ циркулярен** к Dicta-silver). Размеры: HTB 6143 предл./114K токенов; IAHLTwiki 5039/103K; IAHLT-HTB test-split ~11K токенов.

### Область 2 — SOTA / Tier-3
- **Сильнейший конкретный апгрейд: DictaBERT-Parse / dictabert-joint (CC BY 4.0, OPEN WEIGHTS, коммерч. ок)** — одна BERT-модель в один проход: сегментация+POS+лемма+морф+зависимости+NER (поля `morph` + `ner_entities`). Настоящая открытая альтернатива API-only Nakdan; одна модель закрывает и Область 2, и 3.
- **Физибилити в браузер:** реалистичен ТОЛЬКО **dictabert-tiny-joint/tiny-parse (45.2M параметров)** — выпущен для «low-resource hardware», «лёгкое падение точности». Полный joint ~0.2B, parse ~186M — без квантизации не влезают. ONNX-экспорт кастомной multi-head `trust_remote_code` архитектуры — **нетривиальная инженерия, не drop-in** (но sibling `dictabert-ner-ONNX` существует → ONNX в принципе возможен). transformers.js гоняет client-side (ONNX/WASM/WebGPU, NER поддержан, квантизация q4/q8).
- **🔴 НЕ влезает: NeoDictaBERT (окт 2025)** — 0.4–0.5B параметров, 922МБ BF16. Только для hosted/online.
- **⚠ ОПРОВЕРГНУТО (не цитировать как факт):** конкретные числа точности DictaBERT-Parse (97.89% POS и т.п.) — НЕ подтвердились (1-2). «DictaBERT-Parse = НЕ-циркулярный оракул» — **опровергнуто (0-3):** он обучен на той же HTB/NEMO-схеме → НЕ независим от silver. NeoDictaBERT «сильнейший по контекст-морфологии» — опровергнуто (1-2), его выигрыш в QA/семантике.

### Область 3 — Офлайн-NER имён (= F6)
- Два пути: **(a) газеттир** (Wikidata + IAHLTwiki-NER, лицензионно-чисто) — самый лёгкий офлайн-гард; **(b)** tiny-DictaBERT NER-голова / `dictabert-ner-ONNX` (PER/LOC/GPE/ORG) — тяжелее.
- **🟢 Находка для архаики: KIMA** — открытый исторический ивритский газеттир **топонимов: 27 239 мест / 94 650 вариантов имён / 236 744 аттестаций** → прямо про архаичные/литературные топонимы Бен-Иегуды.
- **🔴 NEMO-Corpus = БЕЗ лицензии (all-rights-reserved) + research-only upstream → ДАННЫЕ НЕ ШИПИТЬ.** Только как референс схемы (9 типов OntoNotes, BIOSE). NEMO-движок = Bi-LSTM-CRF+fastText, Python-only → не браузерный.
- Ранг: **газеттир-first** (дёшево/офлайн/чисто) > tiny-ONNX-NER-голова (тяжелее) > NEMO-данные (заблокировано).

### Циркулярность silver (сквозное)
Мерить против Dicta-silver (или DictaBERT на той же схеме) — **циркулярно** для Tier-3. Разрыв: (a) мерить против ЧЕЛОВЕЧЕСКОГО gold (IAHLTwiki), (b) для архаики — ручная выборка Бен-Иегуды, (c) DictaBERT-Parse как **ВТОРОЙ независимый silver для ТРИАЖА** (расхождения Nakdan↔DictaBERT-Parse = высокоценные кейсы в ручную адъюдикацию), НЕ как истина.

---

## Приоритизированный план (impact × feasibility под offline-browser)

### 🥇 R1 — Золотой eval-харнесс (наивысшая определённость ROI; measure-before-code, R10)
**Зачем:** мы НЕ знаем истинный потолок резолвера на архаике (единственный самый большой неизвестный); текущий silver циркулярен.
**Что:** расширить `reader-morph-audit.js` режимом `--gold`:
- (a) **Modern non-circular baseline:** выборка высоко-гомографных предложений из IAHLTwiki test-split (CC BY-SA, есть леммы+NER) → офлайн-резолв vs ЧЕЛОВЕЧЕСКИЙ gold. Даёт честную precision на совр. иврите.
- (b) **Archaic register:** ручная разметка ~150–200 предложений ИЗ baked-работ Бен-Иегуды; **триаж дёшево** — размечать только расхождения Nakdan↔DictaBERT-Parse (второй независимый silver). Даёт истинный потолок на регистре, который реально важен.
**Impact: ВЫСОКИЙ · Feasibility: ВЫСОКИЙ** (данные есть, триаж дёшев для solo). Лицензия: IAHLTwiki BY-SA — для редистрибуции деривата ок; HTB только внутренний оракул.

#### R1 BUILD SPEC (детально, для новой сессии)
**🔑 Уточнение, переформировавшее R1 (найдено при старте):** золотые трибанки **не вокализованы**, а form-first-путь резолвера нужен НИКУД, и наш корпус (baked Бен-Иегуда) **вокализован**. ⇒ IAHLTwiki (unvoc. modern) тестировал бы ДЕГРАДИРОВАННЫЙ surface-alias путь на чужом регистре — слабый бейзлайн. **Главный gold = гомограф-фокусная ВОКАЛИЗОВАННАЯ выборка ИЗ baked-работ Бен-Иегуды, размеченная человеком (владельцем).** IAHLTwiki — опциональный modern-кросс-чек (вторично). Это и снимает vocalization+register mismatch разом.

**Харнесс (расширить `scripts/premium/reader-morph-audit.js`, переиспользует sampleRows/resolve/Dicta):**
- **`--worksheet=N`** — продьюсер: сэмплировать N гомограф-фокусных токенов (приоритет: tail-false-exact + ambiguous + non-exact + контроль чистых exact), КАЖДЫЙ с контекст-предложением, в TSV `.tmp/benyehuda/reader-morph-gold-worksheet.tsv`. Колонки: `id, work, surface, niqqud, sentence, offline_pos, offline_lemma, offline_meaning, offline_label, nakdan_pos(silver), [gold_pos, gold_lemma, verdict]` (последние 3 — ПУСТЫЕ, для ручной разметки). Нужно: пробросить `row.he`/`row.he_niqqud` (sentence-контекст) в token-записи (сейчас не несутся).
- **`--gold=<file.tsv>`** — скорер: прочитать заполненный worksheet → истинная precision/recall (offline_pos vs gold_pos, offline_lemma vs gold_lemma), разбивка по label/гомографу + **agreement Nakdan-silver vs gold** (квантифицировать, насколько silver вообще хорош на архаике).
- **Сэмплинг — по гомографам, НЕ равномерно** (R10 урок: бенчмарки переопредставляют мажоритарные разборы → истинный хвост мерят contrast/challenge-наборы). Использовать существующий collisionFor/tail-детект.

**Зависимость (surfaceID владельцу):** human-gold = **РУЧНАЯ разметка владельца** (~150–200 строк worksheet: проставить gold_pos/gold_lemma/verdict). Это его время — worksheet = TSV в любом редакторе/таблице.
**Развилка R1.1 (DictaBERT-Parse как 2-й silver, чтобы СОКРАТИТЬ ручной труд):** поднять локальную Python-инференцию `dicta-il/dictabert-parse` (open weights, CC BY 4.0, `trust_remote_code`; есть `pyproject.toml`) ИЛИ пропустить и триажить только по Nakdan↔resolver-расхождению. Решение — в начале R1 (поднимать ли torch+model ~0.2–0.7ГБ dev-only). Без него R1 всё равно идёт (Nakdan-триаж + ручная разметка), просто больше ручного.
**Порядок:** R1.0 (харнесс `--worksheet`+`--gold`, Nakdan-триаж) → отдать worksheet владельцу на разметку → R1.1 (опц. DictaBERT-Parse) → числа истинного потолка → решить, нужны ли R3/R2.

### 🥈 R2 — F6 газеттир-гард имён (закрывает последний ковш хвоста, дёшево)
**Зачем:** ~9 имён (noun→propernoun) — единственный незакрытый ковш хвоста Эпика 1.
**Что:** собрать лицензионно-чистый газеттир ивритских личных+гео имён (Wikidata + IAHLTwiki-NER + **KIMA** для топонимов) → шипнуть малым офлайн-списком (как CONTEXT_GLOSS) → при попадании подавлять морфологию + честный лейбл «имя собственное». Это и есть recon-F6 (D4), теперь с конкретными источниками.
**Impact: СРЕДНИЙ · Feasibility: ВЫСОКИЙ.** ⚠ Открытый вопрос: покрывают ли CC-чистые газеттиры архаичные/библейские ЛИЧНЫЕ имена (KIMA = топонимы); личные — Wikidata + возможно corpus-harvesting.

### 🥉 R3 — СПАЙК: tiny-DictaBERT-joint ONNX в браузере (decision-gated, стратегически крупно если выйдет)
**Зачем:** dictabert-tiny-joint (45.2M) → ONNX → q4/q8 → transformers.js в Web Worker = **ПОЛНОСТЬЮ офлайн контекст-дизамбигуация** (без Dicta-вызова, без сети, БЕЗ согласия R5) — идеально под offline-first.
**Что:** time-boxed спайк: попытка ONNX-экспорта кастомной multi-head арки + замер размера/латентности vs бюджет 3.3МБ. **Гейт решения:** влезает (напр. <30МБ q4, <500мс/предл. в Worker) → меняет правила (офлайн Tier-3); не влезает → дропнуть.
**Impact: ВЫСОКИЙ ЕСЛИ ВЫЙДЕТ · Feasibility: НИЗКИЙ/неизвестно** (ONNX кастомной арки не доказан end-to-end; нужен hands-on спайк, чтобы вообще узнать).

### ⏸ R4 — (отложить/эксперимент) Hosted DictaBERT-Parse как Tier-3-бэкенд
Если у Dicta есть hosted DictaBERT-Parse эндпоинт с CORS — богаче Nakdan в один вызов. **Не подтверждено**, что такой hosted-эндпоинт сильнее/доступнее Nakdan для браузер-CORS. Nakdan уже решает Tier-3. **Impact: НИЗКИЙ-СРЕДНИЙ · Feasibility: СРЕДНИЙ (нужен CORS-эндпоинт, неподтверждён).**

### ❌ НЕ делать
NeoDictaBERT в браузере (922МБ — невозможно). Шипить NEMO-данные (лицензия). Переписывать form-first ядро (у потолка; выигрыш в измерении+именах+tiny-модели, не в логике).

---

## Открытые вопросы (для R1/R3)
1. Истинная точность form-first на архаике Бен-Иегуды — неизвестна, только ручная разметка (R1). Самый большой неизвестный.
2. Экспортируется ли tiny-DictaBERT в ONNX + квантизуется до PWA-приемлемого размера/латентности (кастомная multi-head арка)? Нужен спайк (R3).
3. Есть ли CC-чистый газеттир ЛИЧНЫХ архаичных/библейских имён, или классич. формы вне совр. газеттиров (нужен corpus-harvest)? (R2)
4. Есть ли у Dicta hosted-эндпоинт сильнее Nakdan для контекст-морфологии с CORS? (R4) — открытые веса подтверждены, hosted-сильнее — нет.

## Ключевые источники
UD HTB · IAHLT/UD_Hebrew · UD IAHLTwiki · DictaBERT-Parse (arXiv 2403.06970 «MRL Parsing Without Tears», ACL 2024 Findings) · HF dicta-il/dictabert-{parse,joint,tiny,ner} · transformers.js docs · NEMO-Corpus · KIMA gazetteer · NeoDictaBERT (arXiv 2510.20386) · Hebrew morph challenge set (EMNLP Findings 2020).

---

## Промпт для старта новой сессии (R1)
> Продолжаем LinguistPro (Node PWA, иврит↔рус, прод https://linguistpro.kolosei.com, непрерывный деплой). **Эпик 1 (честность резолвера) ЗАКРЫТ + релиз v3.11.0 отгружены.** Начинаем **R1 — золотой eval-харнесс** (первый шаг улучшения качества ядра; согласованная последовательность владельца **R1 → R3 → R2 → последующие эпики**).
>
> **СНАЧАЛА ПРОЧИТАЙ:** `.remember/remember.md` (хендофф, авто-загрузится) · `docs/planning/RESOLVER_QUALITY_RESEARCH_2026_06_25.md` (action-план + **§R1 BUILD SPEC** — ЭТОТ док) · `docs/research/HEBREW_MORPHOLOGY_RESOLVER_RESEARCH_2026_06_25.md` (доказательная база) · `docs/planning/BRR_EPIC1_RESOLVER_HONESTY_2026_06_25.md` (Эпик 1 done) · `CLAUDE.md` · `docs/PROJECT_ROLES.md`. Память: [[project_resolver_quality_research]] · [[project_brr_ux_audit]] · [[feedback_headless_opfs_playwright]] · [[feedback_test_with_nonempty_profile]] · [[feedback_curl_utf8_egress_myth]] · [[feedback_commit_push_deploy_default]].
>
> **СОСТОЯНИЕ:** main HEAD `3784eb0`, прод app-версия 3.11.0 + SW v3.11.0. Эпик 1 + Эпик 7 done. Ядро резолвера у offline-browser потолка → выигрыш в ИЗМЕРЕНИИ (R1), ИМЕНАХ (R2), опц. tiny-модели (R3), НЕ в переписывании form-first.
>
> **ЗАДАЧА R1 — построить золотой eval-харнесс** (measure-before-code, R10; узнать ИСТИННЫЙ потолок на архаике + разорвать silver-циркулярность). **🔑 Ключевой инсайт:** золотые трибанки НЕ вокализованы, а form-first-путь нужен никуд, наш корпус (baked Бен-Иегуда) вокализован → главный gold = **гомограф-фокусная ВОКАЛИЗОВАННАЯ выборка ИЗ baked-работ, размеченная ВЛАДЕЛЬЦЕМ вручную** (НЕ IAHLTwiki). Харнесс: расширить `scripts/premium/reader-morph-audit.js` → `--worksheet=N` (продьюсер TSV для разметки: гомограф-фокус-сэмпл + контекст + offline/Nakdan-колонки + пустые gold-колонки) + `--gold=<file>` (скорер: истинная precision/recall vs human gold + agreement Nakdan-silver↔gold). Полная спецификация — §R1 BUILD SPEC. **Развилка R1.1 (реши в начале):** поднимать ли `dicta-il/dictabert-parse` (Python, open weights, CC BY 4.0) как 2-й независимый silver для дешёвого триажа разметки, или Nakdan-триаж + ручная разметка владельца.
>
> **НОРМЫ:** всё Room-only (index.html/билдер не трогать, `smoke:reader-parity`); резолвер `notes-autogen.js`(lock-step `build-notes`, `autogen-parity`)+`reader-morph.js`; харнесс — dev-only (не шипится); offline-first; прод-верифи Node-fetch (не Windows-curl); commit+push=деплой; measure-before-code; развилка→рекомендация+владелец решает. Headless OPFS: resolveWordLight = лёгкий read-путь (работает), importBundle падает; gold-разметка = ручная (владелец).
>
> **Начни с:** краткого резюме подхваченного контекста + плана R1.0 (как строим `--worksheet`/`--gold`, как сэмплируем по гомографам, формат TSV для разметки) + решения по R1.1-развилке (DictaBERT-Parse да/нет с обоснованием), затем — стройка (или жди ОК, если есть развилка для владельца).
