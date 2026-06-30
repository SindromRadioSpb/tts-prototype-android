# BRR — Эпик 6: Curated Library (recon + Wave-план)

> **Step-0 measure-before-code recon.** Создан 2026-06-30, заземлён против живого кода на `HEAD d811c83` (прод v3.11.55). Канон бэклога — `docs/planning/BRR_UX_AUDIT_2026_06_25.md` §Эпик 6. Роли: **R6 (lead — куратор-библиотекарь)** · R9 (authority-control / honest provenance) · R7 (литературовед, для editorial-волны).

## §0. Цель эпика

Превратить «Корпус» из **metadata-dump** в **curated-библиотеку**: per-work source-атрибуция, реальная страница автора (era/QID), reader-header контекст (автор/эпоха/регистр), честный roadmap/offline-moat framing, editorial entry-points. Планка — Pealim/Reverso по честности провенанса (R9: derived≠asserted; никогда не фабриковать).

## §1. Что есть СЕЙЧАС (заземлено, не по памяти)

Открытая работа корпуса показывает в ридере **только заголовок** (`library.html #readerTitle`; `openReader` ставит лишь `titleEl.textContent`). Ни автора, ни эпохи, ни регистра, ни ссылки на источник. На карточках (rail/L3/поиск) — только текст автора + honesty-бейджи `rs`/`audio` (`corpusProvBadge` library-ui.js:3816); PC-9 этой сессии добавил **тап-ссылку на имя автора** → `corpusNavToAuthor` (это навигация в drill, НЕ атрибуция и НЕ landing). Source-атрибуция существует лишь как один глобальный футер-стринг (`room.footer.source`). L2-список авторов «голый» (имя + ✓ready + счётчик; `renderAuthorRow` ~4789); резолвнутый Wikidata-QID лежит в каталоге (`author_qid` / `authors[].qid`), но до строки не доезжает. «Позже» (не-ready) = голая пилюля (`room.corpus.later`) + ⏳, без roadmap-framing. Offline-moat в UI нигде не surfaced.

### Модель данных (источник истины — `db/premium/corpusMeta.js`)
Per-work метаданные живут в `source_meta_json.corpus` (versioned sub-object, R6 storage Option A — zero migration). Поля: `author`, `author_uri` (Wikidata QID URL), `era`, `register`, `genre`, `provenance{source,url,license,reviewer,reviewed_at}`, `attribution`, honesty-enums `review_status`/`audio_status`. Контролируемые словари: `REGISTER = [literary, spoken, archaic, poetic, mixed]`, `ERA = [biblical, rabbinic, medieval, haskalah, tehiya, mandate, modern, contemporary]` (era — suggested vocab, может быть `unknown`/null).

### ⚠ Корректировки over-claim'ов хэндоффа (поймано grep'ом)
1. **«QID via corpusMeta.js» — неверно.** `corpusMeta.js` (Node-only) лишь **валидирует** форму URI (`WIKIDATA_QID_RE`). QID извлекается продюсером (`build-corpus-catalog.js:qidNum` + `lib/benyehuda.js:firstQid`) и **шипается предвычисленным** как `author_qid` в карточке каталога и `authors[].qid` в индексе. Для UI это всё равно «уже-хранимые данные».
2. **`provenance.url` НЕ в лёгком каталоге/карточке.** Он в per-work бандле `works/<id>.json` → `source_meta.corpus.provenance.url` (и в OPFS `source_meta_json.corpus` после импорта), плюс **детерминированно** `https://benyehuda.org/read/<byehuda_id>` (`benyehuda.js:200`). Поэтому на карточке ссылку придётся **выводить из id** (честно — продюсер использует ровно этот шаблон), а в ридере — читать из `source_meta_json.corpus`.
3. **roadmap/offline-moat «copy» — это НОВЫЙ микрокопирайт**, не «хранимые данные». Дёшево и без sign-off, но технически новый контент (не pure-surfacing) — не смешивать в одну категорию с атрибуцией.

### 🔑 Ключевой рычаг
`readerCore.openText(textId)` **уже возвращает** `res.text.source_meta_json` (`getTextByIdLite` тащит все колонки кроме `source_text`). Значит **одна** новая поверхность (reader-subtitle) даёт **две** находки сразу (reader-header-context P2 + per-work source-attribution P1), для canon И corpus-открытий, с нулём новых данных и нулём sign-off.

## §2. Волновой план (split by sub-finding)

### Wave-1 — ship-now (чистый surfacing, БЕЗ sign-off/нового контента)
| # | Находка | P | Что показать | Где (живой код) | Данные |
|---|---|---|---|---|---|
| **W1-a** | reader-header-context **+** per-work source-attribution (combined) | P2+P1 | под `#readerTitle`: автор · era-chip · регистр · «Источник: Проект Бен-Иегуда ↗» | `library.html` (+`#readerSubtitle`) · `library-ui.js openReader` (~2595) | `res.text.source_meta_json.corpus` (уже возвращается) |
| W1-b | per-work attribution на карточке | P1 | дискретная source-ссылка | `renderCorpusWorkRow` ~4920 / `renderCorpusCard` ~271 / `renderWorkCard` ~197 | вывести `benyehuda.org/read/<id>` из `card.id` (gate: corpus-origin) |
| W1-c | author-row QID + era-chip | P2 | Wikidata-ссылка + эпоха на строке автора | `renderAuthorRow` ~4789 | `authors[].qid` (уже в индексе) |
| W1-d | roadmap-framing / offline-moat микрокопи | P3 | честный «перевод позже»-roadmap + offline-moat строка | `room.corpus.*` i18n | **новый** микрокопирайт (×3 локали), без sign-off |

### Wave-2 — deferred (нужен авторинг + R7-sign-off; НЕ этой сессии)
- `author-landing-page` (P2): offline-honest форма (имя + era-chip + counts + дискретная QID-ссылка) можно сейчас; **rich-форма** (life-dates) блокирована — нужен online Wikidata или новое producer-поле → даты defer.
- `editorial-entry-points` / `literary-reading-order` (P2/P3): ручной editorial-авторинг (R7/R6) на ~50–100 QID-якорей → контент владельца + sign-off (defer, как 3b).

## §3. Инварианты (симптом → guard)

- **R9 honest provenance:** показывать ТОЛЬКО присутствующие поля; `era=unknown`/`register=null` → честно скрыть (не печатать «unknown»). Source-link = «Проект Бен-Иегуда» (public-domain, хранится). era/register = derived/curatorial.
- **Parity-safe (R4):** reader-subtitle — sibling `#readerTitle` в post-render chrome, НЕ внутри parity-locked table-builder. `smoke:reader-parity` обязан остаться зелёным; `index.html` не трогать.
- **openReader общий для canon + corpus + personal:** гейт на наличие `corpus`-объекта → personal/non-corpus текст рендерит пустой subtitle (self-hide), без фабрикации.
- **Derive `benyehuda.org/read/<id>` ТОЛЬКО для corpus-origin карточек** — иначе peer/personal текст получит выдуманную source-ссылку.
- **Dark-mode gating:** субтитр стилизуется через theme-переменные (`--text-secondary`/`--bg-muted`/`--border-soft`), НЕ литеральные цвета → dark наследуется без отдельного блока (избегаем ungated-dark-течёт-в-light).
- **applyI18n glyph-strip:** субтитр строится динамически через `tt()` (не `data-i18n`-узел) → глиф ↗ впекаю в JS, re-apply его не трёт.
- **Logical line-break:** автор / эпоха / регистр / источник — каждый своя inline-группа → перенос между группами, не посреди фразы.

## §4. Гейты + version-triad

Pre-commit Room-набор (8): `smoke:reader-parity` · `smoke:i18n` · `smoke:reader-scaffold` · `smoke:reader-morph` · `smoke:reader-context` · `smoke:corpus-room` · `smoke:corpus-vocab` · `smoke:finished-guard`. W1 задевает i18n (новые ключи ×3 локали) и ридер-chrome → `smoke:i18n` + `smoke:reader-parity` критичны.
Version-triad (вместе): `package.json:3` + `public/sw.js:32` (CACHE_VERSION) + `public/library.html` `#roomFooterVersion`. Текущая v3.11.55 → следующий шип **v3.11.56**.

## §5. Этой сессией

**W1-a (reader-subtitle) — SHIPPED v3.11.56.** Даёт обе находки P1+P2 одной поверхностью, ноль sign-off. Поверхность: `#readerSubtitle` (sibling `.reader-bar`) ← `setReaderSubtitle(res.text)` из `source_meta_json.corpus`: автор · era-chip · register-chip · «Источник: Проект Бен-Иегуда ↗». Гейты (8) зелёные; 380px light+dark верифицировано (автор RTL + 2 чипа + source-link, 0 pageerror).
**Adversarial-review (code-reviewer) поймал и пофикшено:**
- **HIGH:** `tt()` возвращает СЫРОЙ КЛЮЧ на промахе локали → `if(rl)`-гард не скипал out-of-enum register (corpusMeta хранит register как free-string → структурно достижимо). Fix: `REGISTER_ENUM.includes()`-гейт + miss-safe `lbl(key,fb)` (`v!==key`).
- **MEDIUM:** source-link fallback'и были мертвы по той же причине → `lbl()`.
- **LOW:** era мог печатать сырой slug при упавшем `corpusRoot` → скип `etitle===c.era`; + комментарий-точность.
**Deferred-polish (known-minor):** субтитр не ре-рендерится на live-смену языка (нет `data-i18n` → applyI18n его не трогает, что и защищает глиф ↗; но register/«Источник» остаются в старой локали до переоткрытия ридера). Низкая ценность (язык в сессии редко меняют mid-read), консистентно с прочими динамическими reader-элементами → defer.

Затем по согласию — W1-b (card-attribution) / W1-c (author-row QID+era) / W1-d (roadmap/moat copy) как отдельные adversarial-reviewed инкременты. Wave-2 (author bios/dates, editorial order) — отдельный sign-off-трек, не сейчас.
