# Premium Notes Redesign — v3.2.0 Direction 9

> **Цель.** Заменить текущую sentence-pinned single-note модель (≤ 16k chars, без версий, без шаблонов, без backlinks, без audio-anchor) на **polymorphic, audio-anchored, template-driven, version-tracked** notes-систему, **которой нет ни у одного Hebrew-learning конкурента**.
>
> **Принцип.** Не «у нас тоже есть заметки» — а *«это единственная notes-система, которая нативно понимает морфологию иврита, привязывается к аудио и никогда не теряет твою мысль».*
>
> **Baseline.** v3.1.0 (premium polish complete: typography, theming, i18n, onboarding, smart-sort, error gentleness, PWA, trust signals).
>
> **Что НЕ входит в этот Direction.** Cloud sync. Multi-deck SRS. Mobile-native реализация (Direction остаётся web-only — см. § Bundle Compatibility). Knowledge-graph view (M8 deferred в v3.3 как delight-tier). Полная замена текущего Markdown-subset (он остаётся — как fallback `note_type='free'`).

---

## 1. Decisions log (утверждено пользователем 2026-05-10)

| # | Решение | Обоснование |
|---|---------|-------------|
| D1 | Утверждены все 10 механик M1–M10 | Strategic positioning — категория, в которой LinguistPro единственный. |
| D2 | **Без bump `library.json` schema_version 1→2** | Android v2 update не координируется в этом цикле. |
| D3 | Phase 9.4 (morphology) шипится **вместе** с 9.1–9.3, не отложен | Премиум-beat (root-aware) слишком ценен, чтобы делить релиз. |
| D4 | Phase 9.5 (knowledge-graph view) **deferred в v3.3** | Delight-tier; не критичен для премиум-позиционирования. |
| D5 | Per-note body cap = **65,536 chars (64k)** | Industry baseline; templated content требует ≥ 30k; UX snappy. |
| D6 | Versioning retention = **последние 50 версий** per note | Cap roughly bounded; OPFS квота не страдает. |
| D7 | Phase 9.0 — **0.5 дня research'а Hebrew root extractor** до старта 9.1 | Граничный risk; либо находим JS-lib и интегрируем, либо graceful manual-input fallback. |
| D8 | Bundle compatibility — **новый файл `library/notes_advanced.json`** в ZIP, без top-level field | Не ломает Android v2, web→web roundtrip preserves premium-features. |

---

## 2. Стратегическое позиционирование

### Категория и конкуренты

| Возможность | Anki | Roam | Obsidian | LingQ | **LinguistPro Premium Notes (v3.2)** |
|-------------|:----:|:----:|:--------:|:-----:|:------------------------------------:|
| Local-first / offline | ✗ | ✗ | ✓ | ✗ | **✓** |
| Bidirectional links | ✗ | ✓ | ✓ | ✗ | **✓** |
| **Audio-anchored notes** | ✗ | ✗ | partial | ✗ | **✓ first-class** |
| **Hebrew morphology aware** (root, binyan) | ✗ | ✗ | ✗ | ✗ | **✓ first-class** |
| Note → SRS micro-card | ✓ (карточка ≠ заметка) | ✗ | плагины | partial | **✓ unified** |
| Versioning + diff | ✗ | ✓ | плагины | ✗ | **✓** |
| Templates / structured types | partial | ✗ | плагины | ✗ | **✓** |
| Cross-text discovery | ✗ | ✓ | ✓ | ✗ | **✓** |
| RTL first-class | partial | partial | partial | ✓ | **✓** |
| Free + open source | ✓ | ✗ | ✓ (paid sync) | ✗ | **✓** |

### Ключевое сообщение

*«Это единственная notes-система, которая* **(a)** *нативно понимает морфологию иврита (корни, биньяним, никуд),* **(b)** *привязывает заметку к моменту в аудио, и* **(c)** *никогда не теряет твою мысль через built-in versioning. И всё это* **offline-first, без cloud lock-in***».*

---

## 3. Premium mechanics — детально

### M1. Polymorphic target — заметки на что угодно

**Что:** заменить `target = sentence` на `target_kind ∈ {sentence, word, root, binyan, text, note, free}`.

| target_kind | Применение |
|-------------|-----------|
| `sentence` | Текущая модель — заметка на конкретное предложение в конкретном тексте. |
| `word` | Заметка на конкретную поверхностную форму слова в конкретной строке (привязка через row + word offset). |
| `root` | Заметка живёт на 3-буквенном корне (`שלם`, `דבר`, etc.); видна в любом будущем тексте, где встречается это корень. |
| `binyan` | Заметка на verb pattern (один из 7: `pa'al`, `nif'al`, `pi'el`, `pu'al`, `hif'il`, `huf'al`, `hitpa'el`). |
| `text` | Заметка на текст целиком (a la "что я думаю об этой статье"). |
| `note` | Заметка на другую заметку (для backlink-дерева). |
| `free` | Free-floating journal entry без target'а. |

**Premium-beat:** заметки **следуют за смыслом**, не за поверхностной формой. Если ты записал «в пи'эль я путаю огласовку cholam с shuruk» — эта заметка автоматически surfaces на любом pi'el-глаголе в любом тексте.

**Storage:** см. § 4 Schema (`notes_v2.target_kind`, `target_id`).

**UX entry-point:** Notes modal получает target picker — segmented control в шапке: «📍 Sentence / 🔤 Word / 🌳 Root / 🧬 Binyan / 📄 Text / 🔗 Note / ✍ Free». При открытии из row context — defaults `sentence`. При открытии из «New note» в Library — defaults `free`.

**Acceptance:**
- [ ] Заметка с `target_kind='root'` видна на любом тексте, где встречается слово этого корня.
- [ ] Заметка с `target_kind='binyan'` фильтруется через smart-chip «🧬 По биньяну».
- [ ] Заметка с `target_kind='free'` живёт в отдельном «Notes» view, не привязана к Library.
- [ ] Удаление text → каскадно удаляет `sentence`/`word`/`text`-target заметки **этого** текста, **не трогает** root/binyan/free заметки.

---

### M2. Audio-anchored notes — уникальный premium-beat

**Что:** при воспроизведении строки пользователь жмёт `📍 Note here` в момент `1:23.4` → открывается editor с pre-populated `audio_anchor_ms = 83400` + `audio_asset_key = <current_row_asset>`. Клик по заметке потом → seek audio к этой точке.

**Premium-beat:** Никто из конкурентов этого не делает для языкового обучения. Это **первый-в-классе** mechanism — заметка фиксируется не на тексте, а на конкретной фонетической детали («вот это произношение мне трудно»).

**Storage:** `notes_v2.audio_anchor_ms` (nullable INTEGER, `>=0`), `notes_v2.audio_asset_key` (nullable TEXT, FK к audio_assets либо просто строка для ZIP-bundle compat).

**UX entry-points:**
- Кнопка `📍` в audio playback bar появляется во время play; click → создаёт заметку-черновик с anchored timestamp.
- В Notes editor есть «play from anchor» (▶ at 1:23.4); seek + autoplay.
- Visual: tiny anchor-marker (vertical bar) на progress-bar предложения, если у строки есть anchored notes.
- Hover/long-press anchor-marker → preview note title.

**Acceptance:**
- [ ] Anchor-marker отрисовывается на audio progress-bar в IDE row + Classic mode + SRS Trainer.
- [ ] «📍 Note here» button creates note in <100ms (no UI lag).
- [ ] Seek-to-anchor in Notes editor seeks to ±50ms accuracy.
- [ ] Anchor сохраняется при export → import (web→web, через `notes_advanced.json`).

---

### M3. Note types / templates — структура вместо свободного поля

**Что:** четыре sealed schema'ы рядом с `note_type='free'`:

#### M3.1 — `word_study`
```
{
  word: string (Hebrew),
  niqqud_variant: string (Hebrew with niqqud, optional),
  root: string (3-letter, optional, populated from M1 root analyzer if available),
  binyan: enum (one of 7, optional, only if word is verb),
  meaning: string (multilingual free text),
  mnemonic: string (free text),
  examples: array<{text_id, sentence_id, snippet}> (auto-collected, see M7)
}
```

#### M3.2 — `grammar_rule`
```
{
  rule: string (заголовок правила),
  applies_when: string (условия применения),
  examples: array<string> (ручной ввод + auto-link на sentences),
  counter_examples: array<string>,
  my_exceptions: string (free text)
}
```

#### M3.3 — `translation_discrepancy`
```
{
  literal: string,
  idiomatic: string,
  my_preferred: string,
  reasoning: string,
  source_sentence_id: nullable string (если note запущена из конкретной строки)
}
```

#### M3.4 — `pronunciation_note`
```
{
  audio_anchor_ms: int (см. M2),
  audio_asset_key: string,
  how_it_sounds: string (free text — описание),
  alternate_transcription: string (если пользователь не согласен с default translit),
  mnemonic: string
}
```

**Premium-beat:** template — это **structured data, не строка**. Каждое поле редактируется отдельно, поиск идёт **по полю** (можно искать «биньян = pi'el AND meaning contains 'путать'»).

**Storage:** `notes_v2.note_type` enum + `notes_v2.body_json` (TEXT, validated by zod-style schema на client). Backwards-compat: `note_type='free'` → `body_json` это `{markdown: <string>}` на 1 ключ.

**UX:** при выборе note_type'а — UI render'ит соответствующую form с typed fields. Template switcher в шапке editor'а.

**Acceptance:**
- [ ] Все 4 template'а имеют clean form-rendering без FOUC.
- [ ] Template switch не теряет данные (free-text fields переносятся в primary `notes` field, остальные — discarded с confirmation).
- [ ] Поиск по полю template работает (e.g. search `binyan:pi'el` returns word_study notes with that binyan).
- [ ] Template seal'ы: добавление новой field в схему = новая версия schema + back-compat reader.

---

### M4. Bidirectional links + backlinks panel

**Что:** Markdown-синтаксис расширяется:
- `[[note:<id>|<alias>]]` — линк на другую заметку.
- `[[word:שלום]]` / `[[root:שלם]]` / `[[binyan:pi'el]]` — линк на полиморфный target.
- `[[text:<id>/sentence:<id>]]` / `[[text:<id>]]` — линк на текст / sentence.

При сохранении — ссылки парсятся, эктракт'ятся в `note_links(from_note_id, to_kind, to_id)` table. Backlinks panel (правая колонка editor) показывает «эту заметку упоминают X других заметок» с превью.

**Premium-beat:** knowledge-graph emerges, как у Roam, но **полностью offline и привязанный к конкретным текстам/корням**.

**Storage:** `note_links` table (см. § 4).

**UX:**
- Editor: ввод `[[` triggers autocomplete dropdown (notes / roots / binyanim / texts).
- Backlinks panel — collapsible right sidebar в editor.
- Linked-references — отдельная вкладка в Notes view: «эта заметка → ссылается на 3 / упоминается в 2».

**Acceptance:**
- [ ] Autocomplete на `[[` появляется ≤ 100ms после ввода.
- [ ] Backlinks panel — точно показывает все incoming links.
- [ ] Удаление target (например, заметки X) → broken-link icon в editor'е заметок, ссылающихся на X. Не аварийно — graceful.

---

### M5. Versioning + diff — никогда не теряешь мысль

**Что:** каждое сохранение (через debounce 30s OR explicit Save) → новая запись в `note_versions(note_id, version, body_json, edited_at, diff_summary)`. UI:
- Кнопка `🕒` рядом с Save → opens history sidebar.
- History list: `v17 — 2 минуты назад · +124 chars · -32 chars`.
- Click — open diff view (side-by-side или unified).
- Restore button → создаёт *новую* версию (не перезаписывает текущую).

**Retention policy** (D6): keep last 50 версий per note. Когда версия 51 создаётся — удаляется самая старая. Это даёт user'у ≥ 1 неделю активной редактуры (в среднем один edit-burst в день).

**Premium-beat:** базовое доверие к редактированию. **Никогда не теряешь мысль** — даже если поле случайно очистил.

**Storage:** `note_versions` table (см. § 4). `body_json` — full snapshot, не delta (storage trivial; read-perf — paramount).

**Acceptance:**
- [ ] Версии создаются автоматически на debounced save (30s) ИЛИ при manual Save.
- [ ] History sidebar показывает chronological list с deltas (`+N -M`).
- [ ] Diff view side-by-side handles RTL Hebrew correctly.
- [ ] Restore → создаёт новую версию, не теряет текущую.
- [ ] Retention policy: 51-я версия → 1-я удаляется (FIFO).

---

### M6. Note → SRS micro-card

**Что:** в Notes editor есть чекбокс «🎯 Review this note» — заметка флагается как кандидат в SRS-очередь. При активации:
- Создаётся `srs_cards` row с `card_kind='note'`, `entity_id = note.id`.
- В SRS Trainer note-карточки идут наравне с sentence-карточками: front = `note.title` (или first 80 chars body), back = full `note.body_json` rendered.
- Spacing — same SM-2 algorithm.
- Hard/Good/Easy buttons + interval prediction — same UI.

**Premium-beat:** заметки **активно возвращаются** к пользователю. Это «journaling that recalls itself».

**Storage:** existing `srs_cards` table получает new `card_kind='note'` row + corresponding seed in `srs_card_templates` (см. P3 ROADMAP_PREMIUM gap — закрывается в этом direction'е).

**UX:**
- Checkbox + tooltip «Add to SRS — this note will return for review».
- В Library есть filter «📝 SRS-noted»: notes которые в SRS-очереди.
- В Dashboard Today section — note-карточки видны в списке текущих обзоров.

**Acceptance:**
- [ ] Notes flagged for review появляются в SRS Trainer.
- [ ] Card front/back rendering для note-карточек handles all 5 note_type'ов корректно.
- [ ] SM-2 интервалы вычисляются и сохраняются.
- [ ] При delete заметки → corresponding SRS card удаляется (CASCADE).

---

### M7. Cross-text smart-collections

**Что:** Library smart-chips расширяются за счёт notes-дрифа:
- `📝 С заметкой` — texts where I have any note.
- `🌳 По корню שלם` — texts containing words of this root (если root extractor доступен).
- `🔄 Pi'el` — texts containing pi'el verbs about which I have a binyan-target note.
- `📍 Audio-noted` — texts where I have audio-anchored notes.
- `🎯 SRS-noted` — texts containing SRS-flagged notes.
- `⭐ Templated` — texts with structured-template notes (vs free).

Cross-text discovery: «I noted 'pi'el confusion' — show me **all texts** with pi'el verbs I haven't yet noted».

**Premium-beat:** заметки становятся **путём навигации**, не side-channel.

**Storage:** materialized via SQL queries over `notes_v2` joined with library; cached в `getLibrarySmartCollections()` helper (analogous to current `getStrugglingTexts`).

**Acceptance:**
- [ ] Все 6 smart-chips функционируют с deep-link via URL hash.
- [ ] Performance: chip filter < 100ms even on 1000-text library.

---

### M8. (Deferred → v3.3) Offline knowledge-graph view

**Что:** visual graph-view (vis-network или D3 force-layout) — nodes = notes / texts / roots / binyanim; edges = links (M4). Pan/zoom, click — переход.

**Status:** **deferred в v3.3** (D4). Foundation (`note_links` table) шипится в 9.1, чтобы graph view'ровка строилась на готовых данных.

---

### M9. Niqqud-variant pinning

**Что:** в word_study template (M3.1) есть field `niqqud_variant`. UI: при создании заметки от слова в строке — autocomplete pre-populates с default niqqud вариантом из строки. User может **изменить** на тот вариант, который хочет «запомнить именно так» (например, full ktiv vs defective ktiv).

**Premium-beat:** иврит имеет ≥ 1 корректных огласовок одного слова (full vs defective ktiv); ни один словарь не даёт это пометить как личный «вот так я хочу читать его».

**Storage:** field `niqqud_variant` внутри `word_study` template body_json. Никаких отдельных таблиц.

**UX:** в word_study template — input field с label «Niqqud variant (предпочтительный)», pre-populated default + dropdown «← copy from text».

**Acceptance:**
- [ ] При autocomplete `[[word:`-link'а — niqqud-вариант показывается в preview.
- [ ] Search «word_study where niqqud_variant != default» — возможен.

---

### M10. Root-aware extraction — RESOLVED via two-phase research (premium upgrade after re-research)

**Research history:**
- **Phase 9.0 v1** (commit `39230f8`, 2026-05-10) — recommended Plan B+C (manual + autocomplete + seed dictionary). Cause: AGPL libraries vetoed.
- **Phase 9.0 v2 / re-research** (commit `6f5c1ad`, 2026-05-10) — user clarified app is **non-commercial → AGPL unlocked**. New recommendation **Option A (HebMorph sidecar)** with Plan B+C retained as graceful offline fallback.

Full findings: `docs/research/HEBREW_ROOT_EXTRACTOR_RESEARCH.md` § 7.

**Final decision (after re-research): ship Option A + retain Plan B+C as offline fallback в v3.2 Phase 9.4. Defer DictaBERT-in-browser fully-offline path в v3.3.**

**Why Option A (HebMorph sidecar) wins:**

| Criterion | HebMorph (chosen) | DictaBERT sidecar | DictaBERT in-browser | YAP sidecar |
|-----------|:-----------------:|:-----------------:|:--------------------:|:-----------:|
| Native root output (no heuristics) | **✓** | ✗ (lemma; needs derivation) | ✗ (same) | ✗ (lemma only) |
| Effort to ship | **0.5–1 week** | 1.5–2 weeks | 2–3 weeks (untested) | 1 week |
| Maturity | **10+ years prod** (Elasticsearch Hebrew plugin) | Modern (~2 years) | New combo | Academic |
| Coverage (Modern Hebrew) | ~250K word forms | SOTA accuracy | SOTA accuracy | SOTA |
| Infra footprint | ~256 MB JVM | 2–4 GB RAM (transformer) | 50–200 MB browser cache | ~150 MB Go binary |
| License | AGPL-3.0 (OK as non-commercial) | CC BY 4.0 | CC BY 4.0 | Apache-2.0 |

**Three-tier layered architecture (all coexist):**

```
WORD ENTERED IN word_study TEMPLATE
         │
         ▼
   ┌─────────────┐
   │ Online?     │
   └─────────────┘
        │ yes
        ▼
   ┌──────────────────┐         ┌─────────────────────────────┐
   │ /api/morphology/v1/  │ → 200 → │ {root, lemma, binyan, pos} │ → autofill
   │ analyze {word}    │         └─────────────────────────────┘
   └──────────────────┘
        │ 4xx/5xx, OOV (no root), or offline
        ▼
   ┌────────────────────────┐
   │ Plan B: manual entry +  │
   │ Plan C: autocomplete    │
   │ from seed (~100 roots)  │
   │ + user-noted roots      │
   └────────────────────────┘
```

**Manual edit always wins** — auto-fill is suggestion, never enforced. User correction during edit overrides any subsequent auto-fill on the same field.

**Server-side deliverable: `/api/morphology/v1/analyze`**

```
POST /api/morphology/v1/analyze
Content-Type: application/json
Body: { word: "מקבל", language?: "he" }

Response 200: { root: "קבל", lemma: "קיבל", binyan: "pi'el", pos: "verb",
                analyses_count: 3 }
Response 200 (OOV): { root: null, lemma: null, binyan: null, pos: null,
                     analyses_count: 0 }
Response 429: { error: "rate_limit" }
```

Privacy stance — **same baseline as existing `/api/transliterate` and `/api/translate-table*`**: stateless, no logging of submitted words beyond rate-limit counters, no PII. **NOT** opt-in by default (consistent with translate/transliterate UX); offline mode + Plan B+C provide privacy-first path для users who explicitly disable cloud morphology.

Container: Java JRE + HebMorph + hspell-data-files. AGPL compliance: bundle license file + source link in /docs/PRIVACY.md alongside other dependency licenses.

**Plan B (manual entry + autocomplete) — retained as graceful fallback:**
- **`word_study.root` field** — text input, max 3-4 Hebrew letters (`[֐-׿]{2,4}`).
- Live autocomplete:
  - User's previously-noted roots (via `SELECT DISTINCT root_3letter FROM roots WHERE my_note_id IS NOT NULL`).
  - Seeded ~100-root dictionary (Plan C below).
  - Last successful auto-fill suggestions (cached в-memory for the session).
- **`word_study.binyan` field** — `<select>` dropdown с 7 Modern Hebrew patterns: `pa'al` / `nif'al` / `pi'el` / `pu'al` / `hif'il` / `huf'al` / `hitpa'el`. Plus "other / unsure" для irregulars.

**Plan C (seeded roots dictionary) — retained для offline + autocomplete enrichment for OOV cases:**
- New deliverable: `public/data/HEBREW_COMMON_ROOTS_SEED.json` — ~100 entries.
- Schema per entry: `{ root: "שלם", gloss_ru: "целостность, мир", gloss_en: "completeness, peace", common_words: ["שלום", "שלמות", "השלים"] }`.
- Source: standard Hebrew-grammar reference (Klein's etymological dictionary entries в public-domain).
- Loaded at first DB init via migration 024. User-added roots merge с seed seamlessly через `UNION` query в autocomplete.
- **Coexistence:** when HebMorph returns root for in-dict word — auto-fill; if user manually adds another root not in seed/HebMorph — saved to user's `roots` table; future autocomplete shows everything (HebMorph result + seed + user-added) merged.

**Premium positioning:** Hebrew students get **the best of both worlds** — auto-extraction for the 250K most common words (pretty much all standard Modern Hebrew), graceful manual fallback for OOV / proper nouns / slang / offline / privacy-preference scenarios. **Никто из конкурентов** этого не делает в edu-software.

**Acceptance criteria (final — Option A + B + C edition):**
- [ ] `/api/morphology/v1/analyze {word}` endpoint deployed; returns `{root, lemma, binyan, pos, analyses_count}` for in-dict; `{root: null, ...}` graceful for OOV.
- [ ] HebMorph + hspell-data-files containerized; `Dockerfile` committed; healthcheck endpoint.
- [ ] Word-study template `root` field auto-fills via the endpoint (with subtle loading indicator); manual edit always wins.
- [ ] Word-study template `binyan` field auto-fills for verbs; manual edit wins.
- [ ] Offline / endpoint failure → graceful Plan B + C fallback (no error toasts; user just sees autocomplete options without auto-fill).
- [ ] `roots` table seeded with ~100 entries on first DB init.
- [ ] `M9 niqqud-variant pinning` functional via `word_study.niqqud_variant` field (unchanged).
- [ ] `docs/PRIVACY.md` updated with HebMorph AGPL attribution + morphology-lookup baseline statement (consistent with existing `/api/translate*` + `/api/transliterate` baseline).
- [ ] Rate limiter on the new endpoint (per-IP, similar to `rlTransliterate` 60/min).
- [ ] No regression в M3 word-study template UX.

**v3.3 follow-up paths (planned, not blocking):**
- **DictaBERT in-browser via transformers.js** epic (2–3 weeks, untested combination — needs proof-of-concept first). Would replace HebMorph sidecar with fully-offline premium experience. **New highest-priority v3.3 morphology epic.**
- **HebMorph hardening** (rate limiter sophistication, morphology cache layer keyed by word hash, telemetry counters). Small follow-on patch items, not v3.3 epic.
- **YAP→WASM** demoted from "v3.3 candidate" to "nice-to-have v3.3+" — HebMorph already solves the runtime need; WASM only matters if explicit offline-first user pressure emerges.

---

## 4. Schema design

### Migrations (021–025)

```sql
-- 021: New polymorphic notes table
CREATE TABLE notes_v2 (
  id              TEXT PRIMARY KEY,                    -- UUID
  target_kind     TEXT NOT NULL CHECK (target_kind IN
                    ('sentence','word','root','binyan','text','note','free')),
  target_id       TEXT,                                -- nullable for 'free'
  text_id         TEXT,                                -- denormalized for partition
                                                       -- nullable for root/binyan/free
  note_type       TEXT NOT NULL DEFAULT 'free' CHECK (note_type IN
                    ('free','word_study','grammar_rule',
                     'translation_discrepancy','pronunciation_note')),
  title           TEXT NOT NULL DEFAULT '',
  body_json       TEXT NOT NULL DEFAULT '{}',          -- typed schema per note_type
  audio_anchor_ms INTEGER,                             -- nullable, M2
  audio_asset_key TEXT,                                -- nullable, M2
  srs_card_id     TEXT,                                -- nullable FK, M6
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (LENGTH(body_json) <= 65536),                  -- D5: 64k cap
  FOREIGN KEY (text_id) REFERENCES texts(id) ON DELETE CASCADE
);
CREATE INDEX ix_notes_v2_target ON notes_v2(target_kind, target_id);
CREATE INDEX ix_notes_v2_text ON notes_v2(text_id);
CREATE INDEX ix_notes_v2_type ON notes_v2(note_type);
CREATE INDEX ix_notes_v2_audio ON notes_v2(audio_anchor_ms)
  WHERE audio_anchor_ms IS NOT NULL;
CREATE INDEX ix_notes_v2_srs ON notes_v2(srs_card_id) WHERE srs_card_id IS NOT NULL;

-- ISO-8601 timestamps trigger
CREATE TRIGGER trg_notes_v2_updated_at AFTER UPDATE ON notes_v2 BEGIN
  UPDATE notes_v2 SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

-- 022: Versioning
CREATE TABLE note_versions (
  note_id        TEXT NOT NULL,
  version        INTEGER NOT NULL,                     -- 1-based, monotonic
  body_json      TEXT NOT NULL,
  diff_summary   TEXT,                                 -- "+124 chars / -32 chars"
  edited_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (note_id, version),
  FOREIGN KEY (note_id) REFERENCES notes_v2(id) ON DELETE CASCADE
);
CREATE INDEX ix_note_versions_edited ON note_versions(note_id, edited_at);

-- 023: Bidirectional links
CREATE TABLE note_links (
  from_note_id   TEXT NOT NULL,
  to_kind        TEXT NOT NULL CHECK (to_kind IN
                    ('note','word','root','binyan','text','sentence')),
  to_id          TEXT NOT NULL,
  link_alias     TEXT,                                 -- nullable, для [[id|alias]]
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (from_note_id, to_kind, to_id),
  FOREIGN KEY (from_note_id) REFERENCES notes_v2(id) ON DELETE CASCADE
);
CREATE INDEX ix_note_links_to ON note_links(to_kind, to_id);  -- backlinks lookup

-- 024: Roots reference table
CREATE TABLE roots (
  root_3letter   TEXT PRIMARY KEY,                     -- e.g. 'שלם'
  gloss          TEXT,                                 -- semantic gloss, optional
  my_note_id     TEXT,                                 -- FK to user's note about this root
  FOREIGN KEY (my_note_id) REFERENCES notes_v2(id) ON DELETE SET NULL
);

-- 025: Migrate existing sentence_notes → notes_v2
INSERT INTO notes_v2 (id, target_kind, target_id, text_id, note_type, body_json,
                      created_at, updated_at)
SELECT id, 'sentence', sentence_id, text_id, 'free',
       json_object('markdown', note),
       created_at, updated_at
FROM sentence_notes;

-- Keep sentence_notes as a VIEW for any straggling code (defense-in-depth):
DROP TABLE sentence_notes;
CREATE VIEW sentence_notes AS
  SELECT id, text_id, target_id AS sentence_id,
         json_extract(body_json, '$.markdown') AS note,
         created_at, updated_at
  FROM notes_v2
  WHERE target_kind='sentence' AND note_type='free';
```

### Migration risks

| Risk | Mitigation |
|------|------------|
| Existing UI код читает `sentence_notes` — VIEW сломается, если кто-то делает `INSERT/UPDATE` напрямую | VIEW READ-ONLY by default in SQLite. Все mutations должны идти через `upsertNote` / `deleteNote` API. Audit codebase before migration: `grep -nE 'sentence_notes' public/index.html` → должны быть только SELECT'ы. |
| Migration 025 на больших библиотеках (>10k notes) — slow | Добавить `BEGIN TRANSACTION` + `COMMIT` обёртку. На 10k rows — ≤ 5s. |
| `body_json` length cap нарушен на старых notes (теоретически) | Текущий cap = 16k. После миграции body становится `{markdown: "..."}` → +14 chars overhead. Worst case 16,014 < 65,536. Безопасно. |
| Note id collision при импорте bundle от старой версии web | `notes_v2.id` PK генерируется UUID. На import — collision detection через `INSERT OR IGNORE` + warn. |

---

## 5. Bundle compatibility (D2 + D8)

### Что попадает в `library/library.json` (Android v2 compatible — schema_version=1)

**Без изменений:** sentence-bound free notes (current behavior). Inline в `row.note: string`. Только последняя версия (`note_versions` не сериализуется).

```json
{
  "schema_version": 1,
  "texts": [
    {
      "rows": [
        {
          "row_id": "...",
          "note": "Это free-text заметка на конкретное предложение."
          // ↑ это последняя версия сохранённой sentence-bound free note
        }
      ]
    }
  ]
}
```

### Что попадает в **новый** `library/notes_advanced.json` (web-only, ignored by Android v2)

Все остальные заметки:
- `target_kind != 'sentence'` (word, root, binyan, text, note, free)
- `note_type != 'free'` (word_study, grammar_rule, translation_discrepancy, pronunciation_note)
- любые `audio_anchor_ms` (даже на sentence-target, но note_type='pronunciation_note')
- `note_links`
- `note_versions` (only latest 50 per note)
- `roots`

```json
{
  "schema_version": 1,
  "exported_at": "2026-05-10T12:34:56.789Z",
  "app_id": "linguist-pro-web",
  "notes": [
    {
      "id": "uuid",
      "target_kind": "root",
      "target_id": "שלם",
      "text_id": null,
      "note_type": "word_study",
      "title": "Корень שלם — completeness, peace",
      "body_json": "{\"word\":\"שלום\",\"root\":\"שלם\",\"meaning\":\"...\"}",
      "audio_anchor_ms": null,
      "audio_asset_key": null,
      "srs_card_id": "uuid",
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "links": [
    {
      "from_note_id": "uuid",
      "to_kind": "note",
      "to_id": "another-uuid",
      "link_alias": "see also"
    }
  ],
  "versions": [
    {
      "note_id": "uuid",
      "version": 17,
      "body_json": "{...}",
      "diff_summary": "+124 / -32",
      "edited_at": "..."
    }
  ],
  "roots": [
    {
      "root_3letter": "שלם",
      "gloss": "completeness",
      "my_note_id": "uuid"
    }
  ]
}
```

### Roundtrip behaviour

| Source | Destination | Premium notes preserved? | Sentence-bound free notes preserved? |
|--------|-------------|:------------------------:|:------------------------------------:|
| Web | Web (no Android intermediary) | ✓ via `notes_advanced.json` | ✓ inline |
| Web | Android v2 | ✗ (`notes_advanced.json` ignored) | ✓ inline |
| Android v2 | Web | ✗ (Android doesn't write `notes_advanced.json`) | ✓ inline |
| Web | ZIP file → Web on different device | ✓ | ✓ |

### User-facing message

В Library export modal — info-banner:
> **Web → Web:** все типы заметок (включая audio-anchored, templated, linked) переносятся.
> **Web → Android v2:** только sentence-bound free notes. Расширенные заметки остаются на этом устройстве.

В About modal — небольшая секция «Advanced notes — local to your device», link на `docs/PREMIUM_NOTES_PLAN_v3_2.md` (или эквивалентный user-facing doc).

---

## 6. Per-note body cap — 65,536 chars (D5)

### Industry baselines

| Tool | Per-note cap |
|------|--------------|
| Notion | ~unlimited per block, ~50k blocks/page |
| Obsidian | unlimited (file system) |
| Anki | 2³¹ chars per field |
| Roam | per-block flexible (~10k typical) |
| **LinguistPro current** | **16k** — слишком жёстко |

### Why 64k

- **Industry baseline.** 64k достаточно для любой genuine note; меньше — приглашение к constipation в templates.
- **Browser perf.** `<textarea>` handles 64k effortlessly. Markdown render of 64k ~ 5ms.
- **Storage.** Versioning at 64k × 50 versions × 1000 notes worst-case = **3.2 GB**. OPFS квота typically десятки GB free. Acceptable.
- **Why not unlimited.** Unlimited body — приглашение к «store entire chapter as a note» антипаттерну. 64k достаточно для любой honest note, capped enough to enforce «note, not document» boundary.

### Versioning retention (D6)

- Keep last **50** versions per note.
- 51-я создаётся → 1-я удаляется (FIFO).
- Worst-case storage per note: 50 × 64k = **3.2 MB**. На 1000 notes — 3.2 GB. OPFS quota — generously above.
- Future improvement (v3.3): delta-based versioning (только diff с предыдущей версии). Не критично для v3.2.

---

## 7. Phased ship strategy (D3 + D4)

### Phase 9.0 — Root extractor research (0.5 дня, до старта 9.1)

Goals:
- [ ] Survey npm packages для Hebrew morphology / root extraction.
- [ ] Evaluate WASM-compile feasibility для `hspell` / `mila-corpus`.
- [ ] Evaluate cloud-fallback architecture (stateless `/api/morphology/*` endpoint).
- [ ] Evaluate license constraints (см. `TTS_HEBREW_DECISION.md` pattern — Hebrew NLP libs могут быть GPL-licensed).
- [ ] Output: **decision** для M10 — full-auto / opt-in cloud / manual-only.

Deliverable: `docs/research/HEBREW_ROOT_EXTRACTOR_RESEARCH.md` (≤ 500 words) с опциями + выбранным path'ом.

### Phase 9.1 — Foundation (5–6 дней)

Scope:
- Migrations 021–025: polymorphic schema + view rename.
- Notes editor revamp: target picker (sentence / word / root / binyan / text / note / free).
- Note types switcher (free / word_study / grammar_rule / translation_discrepancy / pronunciation_note).
- M5 Versioning: `note_versions` table + history sidebar + diff view + restore.
- M7 Cross-text smart-collections: 6 chips в Library extension.
- `save_note` event emission (закрывает CONTRACTS_ANALYTICS gap).
- `library/notes_advanced.json` export/import path в `exportBundle`/`importBundle`.

Deliverables:
- `public/db/migrations.js` — migrations 021–025.
- `public/db/local-db.js` — `notes_v2` API (`createNote`, `updateNote`, `deleteNote`, `listNotes`, `searchNotes`, `getNoteVersions`, `restoreNoteVersion`, `getLibrarySmartCollections`).
- `public/index.html` — notes modal revamp + smart-chips extension.
- `public/i18n/locales/{ru,en,he}.js` — new keys: `notes.target.*`, `notes.type.*`, `notes.history.*`, `library.smartChip.*` (advanced notes filters).

### Phase 9.2 — Audio anchoring (2–3 дня)

Scope:
- M2 Audio-anchored notes: `audio_anchor_ms` + `audio_asset_key` integration.
- `📍 Note here` button во время playback (IDE row + Classic + SRS Trainer).
- Anchor markers на progress-bar.
- Seek-to-anchor in editor.

Deliverables:
- `public/index.html` — playback bar extension, anchor renderer.
- New i18n keys: `notes.audioAnchor.*`.

### Phase 9.3 — Linking + Templates + SRS micro-cards (3–4 дня)

Scope:
- M3 Templates: 4 template forms (word_study, grammar_rule, translation_discrepancy, pronunciation_note).
- M4 Bidirectional links: `[[…]]` parser + `note_links` table + autocomplete + backlinks panel.
- M6 Note → SRS card: `card_kind='note'` seed в `srs_card_templates`, render path для note-cards в Trainer.

Deliverables:
- `public/index.html` — template forms, link parser, autocomplete, backlinks panel, SRS Trainer note-card render.
- `public/db/local-db.js` — `parseAndStoreLinks`, `getBacklinks`, `flagNoteForSrs`.
- `public/i18n/locales/*` — template field labels, autocomplete strings.

### Phase 9.4 — Morphology (5.5–7 дня — **revised after Phase 9.0 re-research**)

Scope (per Phase 9.0 v2 decision: Option A + Plan B + Plan C — three-tier layered):
- M1 root/binyan targets: target picker для `root` и `binyan`.
- M9 Niqqud-variant pinning в word_study template.
- **M10 Auto-extraction via HebMorph sidecar** with graceful Plan B + C fallback (offline/OOV).

**Deliverables (server-side — new sub-direction 9.4.S):**
- `morphology-sidecar/` — new directory at repo root (or `services/morphology/`).
  - `Dockerfile` — Java JRE + HebMorph + hspell-data-files container (~256 MB image).
  - `wrapper/` — minimal HTTP wrapper (Java/Spring Boot OR Kotlin/Ktor — whichever is leanest) exposing `POST /api/morphology/v1/analyze`.
  - `LICENSE-AGPL` — HebMorph AGPL-3.0 compliance file + attribution.
  - `README.md` — deployment instructions for Railway.
- `server.js` — new route family at `/api/morphology/v1/*` proxies to sidecar at internal Railway service URL. Or: deploy sidecar as a sibling Railway service and proxy from main `server.js`. Decision deferred to implementation.
- `requireSameOriginJson` middleware applied (same as `/api/transliterate`).
- Rate limiter `rlMorphology` — 120 req/min/IP (slightly higher than translit since per-word lookups can chain).
- Sidecar deployment to Railway production: 1 day для setup + smoke testing.

**Deliverables (client-side — sub-direction 9.4.C):**
- `public/data/HEBREW_COMMON_ROOTS_SEED.json` — ~100 entries (Klein's etymological dictionary public-domain extracts). +0.5 day.
- `public/db/local-db.js` — `roots` table API: `findNotesByRoot`, `findNotesByBinyan`, `seedCommonRoots()` (idempotent, runs on first init), `searchRootsAutocomplete(query)` для UI live-autocomplete.
- `public/index.html` — word_study template form: root input с auto-fill via fetch + autocomplete dropdown layered (HebMorph result + seed + user roots), binyan select с auto-fill + 7 + "other". Subtle loading indicator during morphology lookup.

**Effort breakdown:**
- Server-side sidecar deployment + endpoint wiring: **3–5 days**
  - Containerize HebMorph + dictionary: 1–2 days
  - HTTP wrapper + integration с main `server.js`: 1–1.5 days
  - Railway deployment + smoke testing: 1–1.5 days
- Client-side UI + DB + seeding: **2 days**
- Opt-in privacy review (consistent с existing translate/transliterate baseline — no per-call consent, but documented): **0.5 day**

**v3.3 follow-up:** DictaBERT in-browser via transformers.js — fully-offline premium upgrade (2–3 weeks; new highest-priority v3.3 morphology epic).

### Phase 9.5 — Knowledge graph (deferred → v3.3)

NOT in v3.2.0. Foundation (`note_links`) shipped в 9.1 для готовности.

---

## 8. Total effort + risk

| Phase | Effort | Risk |
|-------|-------:|------|
| 9.0 Research | ✅ done (commits `39230f8` + `6f5c1ad`) | n/a |
| 9.1 Foundation | 5–6 дней | Low |
| 9.2 Audio anchoring | 2–3 дня | Medium (audio API integration) |
| 9.3 Linking + templates + SRS | 3–4 дня | Medium |
| 9.4 Morphology | **5.5–7 дней** *(was 2.5–3.5d after v1; +3d after re-research with HebMorph sidecar)* | **Medium** *(was Low; new operational risk for sidecar uptime, mitigated by graceful fallback)* |
| **Total v3.2.0 Direction 9** | **~16–20 дней** *(within original 4-week target)* | |

---

## 9. Acceptance criteria (release-level)

Перед закрытием Direction 9 в v3.2.0:

### Functional
- [ ] Все 10 механик (M1–M10) функциональны *кроме* M8 (knowledge graph) deferred в v3.3.
- [ ] Migration 021–025 проходит на пустой DB AND на DB с существующими `sentence_notes` (≥ 100 rows).
- [ ] VIEW `sentence_notes` возвращает корректные данные (regression test: запрос «get note for sentence X» возвращает то же, что и до миграции).
- [ ] `notes_advanced.json` export/import roundtrip preserves all advanced notes (web→web).
- [ ] Web→Android v2→web roundtrip preserves только sentence-bound free notes (degradation acceptable).

### Performance
- [ ] Notes editor open ≤ 200ms на 100-version note.
- [ ] Smart-chip filter ≤ 100ms на 1000-text library.
- [ ] Audio-anchor markers render ≤ 50ms на 50-anchored row.
- [ ] Backlinks panel render ≤ 100ms на 100-backlink note.

### i18n
- [ ] Все новые UI-strings в `ru` / `en` / `he`.
- [ ] Templates render корректно в RTL.
- [ ] No hardcoded русских строк — `grep "showToast" + новые UI блоки`.

### Privacy / data integrity
- [ ] Cascade-delete (text → notes) corrected: text-bound notes удаляются, root/binyan/free — нет.
- [ ] OPFS quota warning (B1 from v3.0.0 — 80%/95%) учитывает growth от note_versions.
- [ ] Bundle export size остаётся reasonable (< +20% от текущего на realistic libraries).

### Documentation
- [ ] `docs/PREMIUM_NOTES_PLAN_v3_2.md` (этот файл) — финальный status flip [ ] → [x] во всех секциях.
- [ ] `docs/STORAGE_CONTRACT.md` — обновлён с описанием `notes_v2`, `note_versions`, `note_links`, `roots`, `notes_advanced.json` bundle entry.
- [ ] `docs/DB_SCHEMA.md` — обновлён.
- [ ] `docs/CONTRACTS_*.md` — если notes-related — обновлены.
- [ ] User-facing: in-app onboarding modal extension объясняет premium notes (на первом open после upgrade).

---

## 10. Test plan

### Unit / integration tests

- `tests/notes_polymorphic.test.js` (new) — CRUD на каждый target_kind + note_type.
- `tests/notes_versioning.test.js` (new) — create/update → версии накапливаются; restore работает; retention 50.
- `tests/notes_links.test.js` (new) — `[[…]]` parsing; backlinks; broken-link tolerance.
- `tests/notes_bundle_roundtrip.test.js` (new) — web→ZIP→web preserves all advanced notes; web→ZIP→Android-mock→ZIP→web loses only advanced.
- `tests/db-init-test.html` — extend with «migrate sentence_notes → notes_v2» test.

### Manual smoke (regression)

- Existing sentence_notes still readable AFTER migration.
- Existing UI flows (open note via row → Notes modal) work без regression.
- Search across notes still returns hits (поиск по `body_json` field — не падает).
- ZIP export/import existing libraries без advanced notes — работает идентично.

### Visual regression

- RTL rendering всех 4 templates на example data.
- Diff view side-by-side handles RTL Hebrew.
- Backlinks panel layout correct в light + dark themes.
- Mobile-responsive: notes modal as bottom-sheet drawer.

---

## 11. Risk register

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| ~~R1~~ | ~~M10 Root extractor not feasible → degraded experience~~ | ~~High~~ | **RETIRED 2026-05-10 (Phase 9.0 v1).** Then re-evaluated в re-research after non-commercial license unlock — HebMorph sidecar shipped. See `docs/research/HEBREW_ROOT_EXTRACTOR_RESEARCH.md`. |
| R1' | Seeded ~100-root dictionary doesn't cover long-tail roots → incomplete autocomplete in offline / OOV scenarios | Low | User-added roots merge с seed (`UNION` query); HebMorph endpoint covers ~250K word forms when online; over time user's library grows beyond seed. |
| R1'' | **HebMorph sidecar uptime / reliability** — Railway service downtime, container OOM, deploy regressions | Medium | Graceful client-side fallback: any non-200 response or timeout → switch to Plan B + C transparently (no user-visible error). Healthcheck endpoint monitored; auto-restart on Railway. Cache successful lookups in-memory per session to reduce repeat calls. |
| R1''' | **AGPL compliance for HebMorph + hspell-data-files** — must publish source / attribution / license texts | Low | Required deliverables in Phase 9.4 acceptance criteria: bundle `LICENSE-AGPL` in sidecar repo, attribute in `docs/PRIVACY.md`, source link from About modal "Dependencies". Standard AGPL hygiene; takes < 1 hour. |
| R2 | Migration 025 slow on huge libraries (>10k notes) | Medium | TRANSACTION-wrapped INSERT; benchmark на test corpus. |
| R3 | Schema 021–025 introduces FK что-то ломает (cascade) | Medium | Per-table cascade tests; preserve existing CASCADE semantics from `sentence_notes`. |
| R4 | Versioning retention at scale → OPFS quota pressure | Low | Document expected disk usage; opt-in retention bumping. |
| R5 | Bundle compat: Android v2 чувствителен к unknown ZIP entries | Low | Verify behaviour on test Android v2 build (если возможно). Fallback: skip `notes_advanced.json` write if export-target=android. |
| R6 | UI complexity bloat (5 note_types × 7 target_kinds → 35 combinations) | Medium | Default note_type='free'; advanced types behind explicit "Switch to template" action. Не показывать всё сразу. |
| R7 | Word-level offset для `target_kind='word'` зависит от tokenization | Medium | Use existing row tokenization (ивритская text → array of words с offsets); fallback на «слово как substring». |
| R8 | UNIQUE constraint relaxation (was: 1 note per sentence; now: many) | Low | Migration preserves existing 1-to-1; new code allows многих, но UI defaults к "edit existing" если есть. |

---

## 12. Out of scope (явно не в этом Direction)

- **Cloud sync** — противоречит offline-first; consistent with v3.1.0 `Что явно deferred`.
- **Multi-deck SRS** — отдельный epic.
- **Mobile-native (Kotlin) реализация premium notes** — требует Android v2 release coordination (D2). Возможно в v3.3.
- **Knowledge-graph view (M8)** — deferred в v3.3 (D4).
- **Delta-based versioning storage** — full-snapshot достаточно; delta = optimization для v3.3+.
- **Server-side notes search index** — нарушает offline-first.
- **Cross-language notes auto-translate** — out of scope.
- **Note encryption at rest beyond OPFS** — defers to v3.2+ optional encryption layer (separate epic).

---

## 13. Open questions (для будущих re-views)

1. **Note encryption at rest.** OPFS защищает от cross-origin, не от device-level. Если ulpan-research-режим (Brainstorm C) будет включать опт-ин upload агрегатов — note encryption layer становится релевантным.
2. **Roots table seeding.** Seed pre-populated с ~100 most-common Hebrew roots (с glosses) ИЛИ user starts empty? Premium-default: pre-populated as a learning aid.
3. **Note → Anki export.** Currently Anki export is sentence-card based. Should premium notes (especially flagged для SRS via M6) export как separate Anki note type? Опционально для v3.3.
4. **Conflict resolution.** Если user open'ит ту же заметку на двух tab'ах — current logic «last-write-wins». BroadcastChannel guard (как в Phase 6 A4) уже есть для library-level conflicts; нужен ли note-level? Отвечать после dogfood.

---

## 14. Live status

> Обновляется по мере реализации. Каждая Phase — `[ ]` planned → `[~]` in-progress → `[x]` done.

- [x] **Phase 9.0** — Hebrew root extractor research *(commit `39230f8` v1; re-research `6f5c1ad` v2)* — outcome: ship Option A (HebMorph sidecar) + Plan B + C as fallback in v3.2 Phase 9.4.
- [x] **Phase 9.1** — Foundation (polymorphic schema + versioning + smart-collections) — **complete on branch `worktree-agent-ad33453576637a27d`**; ready to merge into main. See `docs/research/9_1_FOUNDATION_FINAL_REPORT.md`.
  - [x] **9.1.A** — Schema migrations 021–025 *(commit `8da394e`, 2026-05-10, merged to main)*. notes_v2 polymorphic table, note_versions, note_links, roots, sentence_notes data migration + read-only VIEW shim. 18/18 Playwright tests pass.
  - [x] **9.1.B** — local-db.js polymorphic API *(commit `3a45833`, 2026-05-10, merged to main)*. Backwards-compat preserved (upsertNote / listNotes / deleteNote / searchNotes / resolveNote). New polymorphic helpers (16). **38/38** Playwright tests; events-emission-test regression-clean.
  - [x] **9.1.C** — Notes modal UI revamp + premium hardening pass *(branch-only — commits `949a932..a2d6efa`, 2026-05-10..11)*. 5-stage agent implementation + interactive premium polish + 8-issue hardening pass (1 High + 5 Medium + 2 Low). H1 race condition in `_appendNoteVersion` fixed via retry-on-conflict + new test. M1 delete confirm dialog. M2 i18n hooks. M3 smart-chip cache invalidation. M4 note-target self-loop prevention. M5 dead code removal (~150 lines). See `9_1_C_PREMIUM_HARDENING_REPORT.md`.
  - [x] **9.1.D** — Bundle compat (`library/notes_advanced.json` in ZIP) *(branch-only — commit `d439683`, 2026-05-11)*. Web-only file alongside `library/library.json`; Android v2 unchanged (schema_version=1 preserved, unknown ZIP entries ignored). Full FK rewiring on import with sentence-bound free note MERGE semantics. 39/39 → **42/42** notes-v2 tests. See `9_1_D_BUNDLE_COMPAT_REPORT.md`.
  - [x] **9.1.E** — i18n keys (ru/en/he) + final premium audit *(branch-only — this commit)*. ~90 new keys across `notes.*` / `library.*` / `confirms.*` / `toast.*` namespaces. Hebrew translations machine-grade (native review scheduled before Direction 11 ulpan deployment). Final regression: 23/0 events + **42/0** notes-v2 + main app 0 new JS errors.
- [ ] **Phase 9.2** — Audio anchoring (M2)
- [ ] **Phase 9.3** — Linking + Templates + SRS micro-cards (M3 + M4 + M6)
- [ ] **Phase 9.4** — Morphology (M1 root/binyan targets + M9 niqqud pinning + M10 extractor integration)
- [~] **Phase 9.5** — Knowledge graph view (M8) — *deferred → v3.3*

---

**Last updated:** 2026-05-10 (initial commit)
