# Studio Ingest L3a — Correctable Media Package: adversarial design packet

> **Дата:** 2026-07-31
> **Статус:** 🟢 `SHIPPED / PRODUCTION v3.11.282`; этот документ сохраняет исходный
> approved design и historical pre-deploy authority. Core `097d212d`, reopen continuity
> `821460c4`, media-review UX `44b216bc`; production/origin head после deploy
> `5c523933`; migration count `45`.
> **Historical production baseline:** `v3.11.279`, image/commit
> `88977240066cddba8161bd2af10fed298bd8fb56`.
> **Follow-up evidence:**
> `docs/research/studio-l3a-correctable-media-package/2026-07-31/OWNER_LIVE_PACKET.md`.
> **Следующий утверждённый planning layer:**
> `docs/planning/STUDIO_INGEST_L3B_ARTIFACT_CONTINUITY_PLAN_2026_08_01.md`.
> **Канон над документом:**
> `STUDIO_INGEST_ROADMAP_2026_07_30.md` и
> `STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md`
> **Предмет:** следующий отдельный продуктовый слайс после Local L1 beta; L2 остаётся
> `DEFERRED / DEMAND-TRIGGERED`

## 0. Решение в одном экране

**Рекомендация:** после отдельного owner approval реализовать L3a как законченный путь:

```text
Local/Gemini ASR или VTT/SRT
  → immutable raw normalized track
  → отдельный user-corrected track
  → edit / split / merge / timing correction + replay
  → explicit Save revision
  → build learning table from an exact corrected revision
  → VTT/SRT semantic round-trip
  → slim Media Package v1 with identity/provenance
```

Каноническая истина дорожек должна жить в **first-class таблицах OPFS-backed SQLite**.
Существующий паспорт в `source_meta_json`/`table_model_meta_json` остаётся только
версионированной compatibility-проекцией для текущего караоке и старых карточек; её revision/hash
обязаны совпадать с каноном. Медиа-байты остаются в OPFS `media/<sha256>.<ext>`.

**P0-запрет:** не использовать существующий generic `Update card` как механизм сохранения
исправлений. Сейчас он удаляет все строки и создаёт новые UUID; это ломает стабильную identity и
может оторвать sentence-bound notes/history/audio. L3a редактирует track, а не переписывает
`sentences` как побочный эффект.

**Adversarial verdict:** дизайн имеет чистый вертикальный exit без L2/batch и без cloud/backend.
GO к коду возможен только после утверждения решений D1–D8 в §16.

## 1. Зачем L3a сейчас

Local L1 доказал практическую способность давать быстрый приватный Hebrew ASR draft. Реальный
Mia-прогон одновременно показал материальные ошибки сущностей/смысла. Следующая пользовательская
проблема — не ещё один запуск модели, а контролируемое превращение черновика в корректный,
переносимый учебный объект.

L3a:

- даёт пользу последовательному owner-only flow без batch;
- сохраняет модельный вывод и человеческую правку раздельно (R9/R11);
- убирает тупик imperfect ASR (R4);
- создаёт основу listening/replay/shadowing/dictation (R2/R5);
- закрывает полезное ядро старого S7 export;
- создаёт правильный substrate перед diarization L5a и local translation L4.

## 2. Проверенный live baseline

### 2.1 Что уже есть

| Кирпич | Live contract | Следствие для L3a |
|---|---|---|
| Media bytes | `public/js/media-store.js`: OPFS `media/<sha256>.<ext>`, SHA-256, read/exists | переиспользовать; не писать в TTS `audio_assets` |
| Captions | `captions-parse.js`: VTT/SRT/panel → normalized merged `[{i,start,text}]` | нужен новый raw-cue contract: current path теряет verbatim track/end/style |
| ASR | `studio-import.js`: validation → passport `.audio.segments` | existing segments становятся legacy projection, не новым каноном |
| Portable row identity | `_studio_source` schema v1 в `edit_meta_json` | расширить до v2, не переименовывать старые поля задним числом |
| Media binding | SHA в passport; `findTextsByMediaSha()` | использовать для package dedupe/relink |
| Card transfer | `text-card-v2` переносит passport, но не media bytes | совместимость; не объявлять JSON-карточку Media Package |
| OPFS SQLite | `texts`, `sentences`, notes/history/progress | first-class track store добавить одной browser migration |
| Karaoke | media passport + timing entries + OPFS blob | гидрировать compatibility projection из выбранной revision |

### 2.2 Дыры, подтверждённые кодом

1. `captions-parse.js` очищает теги, объединяет cues и в продуктовой форме не сохраняет raw file.
2. Редактирование preview с изменением числа строк ставит `PREVIEW_EDITED` и сбрасывает timing.
3. `source.audio.segments`/`source.captions.segments` — JSON внутри паспорта, не versioned track.
4. Generic update удаляет все `sentences`, затем создаёт новые UUID.
5. `sentence_notes`, history, recent rows и audio связаны с sentence ID; destructive replace опасен.
6. Current JSON/V2 card честно не переносит media bytes; relink существует только как ручной
   смысл SHA, не продуктовый flow.
7. Current row identity различает raw source segment / source line / premium sentence ordinal,
   но не имеет отдельного corrected-caption segment ID или split/merge lineage.
8. Полный ZIP backup богаче/беднее отдельных поверхностей в разных местах; L3a не должен
   добавлять ещё один независимый writer формата.

## 3. Scope и exit L3a

### 3.1 В scope

1. Автоматически создать Media Package после успешного audio/video ASR.
2. Принять VTT/SRT как raw track; при доступном local media связать по SHA-256.
3. Хранить raw normalized track неизменяемо.
4. Создать отдельный `user_corrected` track.
5. Редактор segment-level:
   - edit text;
   - replay exact range;
   - split;
   - merge adjacent;
   - edit start/end;
   - global offset;
   - optional speaker label as metadata.
6. Recoverable draft + explicit immutable saved revisions.
7. Строить таблицу из **точно выбранной corrected revision**.
8. Сохранять binding `media SHA ↔ package ↔ track ↔ revision ↔ text`.
9. Экспорт/повторный импорт VTT и SRT с semantic equality текста/тайминга.
10. Slim `linguistpro-media-package-v1.zip` без media bytes: manifest, raw/corrected tracks,
    lineage, quality/provenance, hashes.
11. Relink отсутствующего local media только после SHA-256 equality.
12. Lazy deterministic promotion существующих media-passport карточек.
13. Export/delete/GC для всех L3a artifacts.

### 3.2 Не в scope

- L2 durable browser jobs, batch/queue;
- forced word alignment или обещание word timestamps;
- diarization inference (speaker поле можно править вручную);
- L4 translation/niqqud provider work;
- linear drift wizard/automatic resync; L3a даёт global offset + per-segment boundaries;
- full ZIP с 100–300MB media bytes; это L3b после streaming/memory measurement;
- cloud sync Media Package, server schema/API или upload personal media;
- remote video acquisition, yt-dlp, extension, realtime, songs;
- совместное редактирование/merge конфликтов между устройствами;
- исправление переводов/niqqud в subtitle editor: это отдельные derived surfaces.

## 4. Пользовательский flow

### 4.1 Новый ASR

1. Пользователь выбирает Local или Gemini как сейчас; Gemini остаётся default.
2. После validation приложение сохраняет media по SHA и создаёт immutable raw track.
3. Preview получает две явные кнопки:
   - **Исправить транскрипт**;
   - **Продолжить с черновиком**.
4. Editor открывает первый corrected draft, первоначально byte/semantic-equivalent raw track.
5. Пользователь слушает range, исправляет, split/merge/offset, видит `Не сохранено`.
6. **Сохранить версию** создаёт immutable corrected revision.
7. **Продолжить в таблицу** фиксирует revision ID/hash и отправляет её сегменты в текущий
   translation chunk path.

### 4.2 Существующая карточка

1. Если есть legacy media passport, UI предлагает **Сделать транскрипт исправляемым**.
2. Promotion копирует media/segments/timing в new package без изменения старого паспорта.
3. До успешной транзакции старое караоке остаётся единственным путём.
4. После promotion старый passport становится compatibility projection той же revision.
5. Исправление track **не переписывает существующую bilingual table автоматически**.
6. Карточка получает честный статус `Таблица построена из предыдущей версии транскрипта` и CTA:
   **Создать новую версию таблицы**. In-place destructive refresh запрещён в L3a.

### 4.3 Replay/editor UX (R4)

- Desktop: persistent player сверху, список сегментов ниже.
- 380px: один focused segment, compact previous/next, sticky player, действия в bottom sheet;
  никаких пяти колонок или горизонтального spreadsheet.
- Каждый segment показывает start–end, text, optional speaker, provenance chips и warning.
- `Space` play/pause; replay не начинает cloud/model calls.
- Split ставится по текущему playback cursor либо явному времени; без cursor операция запрещена.
- Merge доступен только для соседних segments одной track revision.
- Undo/redo действует внутри draft; Save revision очищает undo boundary.
- Закрытие с dirty draft требует явного выбора; persisted draft восстанавливается после reload.
- Raw track доступен read-only для side-by-side compare; control выглядит и называется иначе.

## 5. Каноническая модель данных

### 5.1 Выбранная архитектура

```text
OPFS media/<sha256>.<ext>                  # media bytes, content-addressed

OPFS SQLite
  studio_media_packages                   # package/media identity
  studio_caption_tracks                   # logical raw/corrected tracks + draft pointer
  studio_caption_revisions                # immutable canonical snapshots
  studio_text_media_bindings              # saved text -> exact track revision

texts.source_meta_json / table_model_meta_json
  source.media_package_ref                # package/track/revision/hash
  source.audio|captions                    # derived compatibility projection only
```

Новые таблицы — единственный канон track/revision. Compatibility passport является
материализованной проекцией: содержит `projection_of_revision_id` и `projection_sha256`;
consumer обязан reject/degrade при несовпадении, а не выбирать «более удобную» копию. Новый
L3a-writer хранит эту проекцию только в `source_meta_json`, а `table_model_meta_json` оставляет
табличному provider provenance; он никогда не пишет один track snapshot в обе legacy-колонки.
Старые карточки с паспортом в любой из колонок читаются прежним precedence до lazy promotion.

### 5.2 Proposed browser migration

Implementation начинается fresh preflight реального `MIGRATIONS.length`. На baseline это 44,
поэтому следующий actual schema version должен быть **45** с комментарием
`045_studio_media_package_l3a`. Нельзя выбирать номер по максимальному narrative label в файле.

```sql
studio_media_packages(
  package_id TEXT PRIMARY KEY,
  media_sha256 TEXT,
  mime TEXT,
  duration_ms INTEGER,
  original_name TEXT,
  opfs_path TEXT,
  size_bytes INTEGER,
  external_ref_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
)

studio_caption_tracks(
  track_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES studio_media_packages(package_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('raw_original','user_corrected','translated','simplified')),
  language TEXT,
  parent_track_id TEXT,
  current_revision_id TEXT,
  draft_base_revision_id TEXT,
  draft_json TEXT,
  draft_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)

studio_caption_revisions(
  revision_id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES studio_caption_tracks(track_id) ON DELETE CASCADE,
  parent_revision_id TEXT,
  revision_no INTEGER NOT NULL,
  segments_json TEXT NOT NULL,
  operations_json TEXT,
  canonical_sha256 TEXT NOT NULL,
  author_kind TEXT NOT NULL CHECK(author_kind IN ('provider','import','user')),
  provenance_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(track_id, revision_no)
)

studio_text_media_bindings(
  text_id TEXT PRIMARY KEY REFERENCES texts(id) ON DELETE CASCADE,
  package_id TEXT NOT NULL REFERENCES studio_media_packages(package_id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES studio_caption_tracks(track_id),
  revision_id TEXT NOT NULL REFERENCES studio_caption_revisions(revision_id),
  revision_sha256 TEXT NOT NULL,
  mapping_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

Required indexes/constraints:

- partial unique media SHA when non-null and package not deleted;
- tracks by package/role;
- revisions by track/revision_no;
- no application API for UPDATE/DELETE of a `raw_original` revision;
- transactional commit: insert revision → update track pointer → rebuild compatibility projection.

`raw_original` means immutable **normalized source track**, not an unbounded dump of provider
HTTP responses. Verbatim imported VTT/SRT may ride in package export as an optional Class-C source
file; Local/Gemini raw response persistence is not added by L3a.

## 6. Segment identity and lineage

L3a must end the overloaded `segment_index` family, not add another alias.

| Field | Meaning | Stability |
|---|---|---|
| `source_segment_id` | immutable raw normalized source segment | permanent |
| `caption_segment_id` | segment identity inside corrected track | retained on text/time edits |
| `source_segment_ids[]` | complete raw lineage for split/merge | permanent |
| `source_line_index` | original source-line/provider ordinal, cross-check only | never identity |
| `sentence_index` | premium segmenter sentence ordinal | never media identity |
| `row_id` / sentence UUID | saved learning-table row | table identity only |

### 6.1 Raw IDs

For a bound media source:

```text
track_fingerprint = sha256(canonical raw cue tuples + stable provider/model/revision/format fields)
source_segment_id = "srcseg:" + media_sha256 + ":" + track_fingerprint[0:16] + ":" + ordinal
```

For an unbound subtitle track, replace media SHA with `unbound:<track_fingerprint>`. Exact reimport
of the same semantic cue list produces the same raw IDs. Run/import timestamps, hardware and other
volatile provenance are excluded from the fingerprint but retained in revision provenance. No ID
depends on mutable corrected text.

### 6.2 Corrected IDs

- First corrected copy: new `caption_segment_id` per source segment; lineage contains raw ID.
- Text/time/speaker edit: retain `caption_segment_id` and lineage.
- Split: tombstone old corrected ID in operation log; create two new IDs, both referencing the
  original lineage plus `derived_from_caption_segment_id`.
- Merge: create one new ID with union of raw lineage and both parent corrected IDs.
- Reorder is not a standalone L3a action; timing/order determines display.

`studio-row-source-v2` adds `caption_segment_id` and `source_segment_ids[]`, while continuing to
emit legacy singular `source_segment_id`, `source_line_index`, `sentence_index` when meaningful.

## 7. Track and revision semantics

### 7.1 Raw versus corrected

- `raw_original`: one immutable canonical revision from ASR/import normalization.
- `user_corrected`: separate logical track whose revision 1 copies raw semantics.
- A corrected track never mutates raw and never becomes a new provider claim.
- Switching view changes only the selected track, not stored data.

### 7.2 Per-field authority (R9/R11)

A corrected segment is not wholly “human truth” merely because one word changed.

```json
{
  "caption_segment_id": "cseg:...",
  "source_segment_ids": ["srcseg:..."],
  "start_ms": 12340,
  "end_ms": 17880,
  "text": "...",
  "speaker": null,
  "authority": {
    "text": "user|provider|import",
    "timing": "user|provider|import|derived",
    "speaker": "user|unknown"
  },
  "quality_flags": []
}
```

Text edit promotes only text authority. Offset promotes timing authority for affected segments.
No UI badge may call untouched ASR timing user-verified.

### 7.3 Draft and commit

- One recoverable `draft_json` per corrected track.
- Draft explicitly names `draft_base_revision_id`.
- Autosave may replace only the draft slot; it never advances canonical revision.
- **Save version** validates, creates immutable revision, advances pointer and clears draft in one
  transaction.
- Stale draft base after another commit is a conflict: open comparison; never last-write-wins.
- Raw track API rejects edit/split/merge/offset operations by construction.

## 8. Editor operations and validators

### 8.1 Text edit

- trim only UI-injected outer whitespace; preserve internal Unicode and punctuation;
- normalize line endings; canonical hash uses Unicode NFC;
- empty text requires explicit delete confirmation; it is not a silent segment drop.

### 8.2 Timing edit

- milliseconds are the canonical unit;
- require finite `start_ms >= 0`, `end_ms > start_ms`;
- a raw source may honestly have `end_ms:null` (for example transcript-panel tail); corrected export
  derives end from next start or bound media duration and marks `timing:derived`; if neither exists,
  VTT/SRT export is blocked until the user supplies an end;
- clamp global negative offset only after user confirmation and report affected count;
- overlaps are allowed but warned—real multi-speaker subtitles may overlap;
- gaps are facts, not automatically “fixed”;
- known `blind`/clock-compressed ranges remain flagged until user explicitly edits timing.

### 8.3 Split

- split point must lie strictly inside segment range;
- text split point is explicit; no LLM guessing;
- playback-cursor time is proposed, user can adjust;
- both children preserve complete raw lineage and receive new corrected IDs.

### 8.4 Merge

- adjacent corrected segments only;
- new range is min(start)–max(end);
- text join default is one space but previewed before commit;
- union lineage; warnings/authority combined conservatively.

### 8.5 Global offset

- preview first and show first/last affected cue;
- one reversible draft operation;
- no linear drift/tempo stretch in L3a.

## 9. Table binding and no-dual-write rule

When table generation starts, freeze:

```json
{
  "package_id": "...",
  "track_id": "...",
  "revision_id": "...",
  "revision_sha256": "..."
}
```

Rows inherit `caption_segment_id`/raw lineage. Translation, niqqud and simplified columns remain
derived from this frozen revision. If corrected current revision later changes:

- existing table remains readable;
- UI marks it stale relative to track;
- karaoke continues using the table-bound revision, not whichever revision is latest;
- L3a offers **Create new table version**, never silent in-place rewrite;
- existing notes/SRS/history are not migrated automatically across split/merge.

Compatibility passport generation is a pure projection from the bound revision. Any stored
projection includes its revision/hash. A mismatch disables timing and surfaces repair, rather than
choosing passport or track opportunistically.

## 10. Media binding and relink

1. Media path remains `media/<sha256>.<ext>`.
2. Package references SHA-256, MIME, size, duration, original name, OPFS path.
3. Reimport on another device starts `media_missing` for slim package.
4. **Relink media** asks user for a file, computes SHA locally and binds only on exact equality.
5. Mismatch never offers “use anyway”; user may create a separate package explicitly.
6. Same SHA dedupes bytes/package, but multiple tracks/revisions are allowed.
7. Captions-only YouTube track may be honestly `unbound/external_ref`; it does not claim SHA binding.
8. Deletion checks reverse references; media bytes are removed only when the last package reference
   is gone and the user confirms.

## 11. Export/import contract

### 11.1 Three honest products

| Export | Guarantee | Deliberate limitation |
|---|---|---|
| Standalone VTT | text+timing semantic parity; cue IDs carry corrected IDs where supported | external editors may strip IDs/style |
| Standalone SRT | text+timing semantic parity | numeric cue order only; identity regenerated on standalone import |
| Slim Media Package v1 ZIP | lossless package/track/revision IDs, lineage, provenance, hashes | no media bytes |

Full ZIP with media bytes is L3b because 100–300MB browser ZIP requires streaming/memory evidence.

### 11.2 Slim package

```text
manifest.json
tracks/raw-original.json
tracks/raw-original.vtt
tracks/user-corrected.json
tracks/user-corrected.vtt
mapping/text-binding.json          # when exported from a saved text
quality/import-run.json
README.txt                         # media missing/relink instructions
```

`manifest.json` contains schema version, package/media identity, every file SHA-256, app version,
export time, selected revision and explicit `media_included:false`.

### 11.3 Semantic round-trip gate

Standalone subtitle semantic tuple per cue:

```text
[start_ms, end_ms, NFC(text)]
```

- VTT/SRT export → reimport must reproduce this tuple hash.
- Full package revision hash additionally covers segment IDs, raw lineage, speaker, authority and
  quality flags; standalone SRT/VTT do not promise speaker/authority/identity parity.
- Styling/position/word-level tags are not part of corrected-track promise.
- Original imported VTT/SRT can be exported verbatim from raw source attachment when retained.
- Package reimport additionally requires ID/lineage/revision/hash equality.
- Unknown package schema, checksum mismatch or duplicate conflicting ID is a hard error, never
  “0 imported / 0 skipped”.

## 12. Legacy promotion, rollback and compatibility (R13)

### 12.1 No mass backfill

Do not scan/rewrite the owner’s full library. Promotion is lazy on open or explicit action:

1. Read media passport from either metadata column using existing precedence.
2. Validate media SHA/segments/timing.
3. Build package/raw/corrected revision deterministically.
4. Commit new rows and compatibility projection in one transaction.
5. Re-read and compare canonical hash.
6. Only then mark the text bound.

Repeated promotion must create zero new packages/tracks/revisions.

### 12.2 Rollback

- Feature flag hides L3a editor and returns to current passport karaoke.
- Existing legacy passport is preserved during promotion as a projection with same semantics.
- Migration is additive; rollback does not drop tables or rewrite user content.
- Failed promotion rolls back transaction and leaves old card untouched.
- Before implementation acceptance: dry-run on the real Mia card and one captions card; export
  before/after semantic hashes and sentence/note counts.

## 13. Privacy, lifecycle, sync and cost

### R15 data classes

| Data | Class/default | Lifecycle |
|---|---|---|
| Media bytes | personal content C, local only | explicit delete + last-ref GC |
| Raw normalized track | personal content C, local only | export/delete with package |
| Corrected track/drafts | personal content C, local only | draft discard; revisions export/delete |
| Provenance/quality | B/C depending embedded text | travels only inside explicit package export |
| Learning table | existing product policy | unchanged by L3a |

L3a package tables are excluded from Cloud Artifact Sync. `exportBundle({slim:true})` должен
удалять L3a compatibility `segments`/raw/corrected snapshots из `source_meta` и оставлять только
честный local-only stub/package reference; иначе материализованная проекция обойдёт запрет через
существующий text artifact. Обычный явный user export/text-card/package export этим privacy-filter
не подменяется. Existing saved text/table sync keeps its current consent policy, but must not gain
raw track revisions or media bytes implicitly. Future cross-device package sync requires a
separate R14/R15 packet.

No LLM/provider call is required for editing, validation, export, import or relink. L3a does not
change Local/Gemini defaults or fallback. Cost ledger impact is zero beyond existing chosen
translation/ASR calls.

Deletion receipt reports:

- package/track/revision/draft rows removed;
- binding count removed;
- media blob removed or retained with remaining reference count;
- failure details per item; no silent partial success.

## 14. Adversarial role-lens review

### R2 — SLA/pedagogy

**Attack:** editor becomes subtitle software disconnected from learning.

**Design response:** replay-range and “continue to table” are primary; correction binds the exact
track revision used by listening/translation. Speaker and timing exist to serve comprehension, not
as metadata theatre.

### R4 — premium UX

**Attack:** 2,000-row spreadsheet is unusable at 380px; losing edits is a dead end.

**Response:** focused-segment mobile editor, sticky player, recoverable draft, explicit saved
version, undo/redo, honest stale/missing-media states, no dead replay buttons.

### R5 — product/market

**Attack:** a thin text area cannot match subtitle tools and gives no reason to stay in LinguistPro.

**Response:** minimum competitive core is segment replay/edit/split/merge/offset + portable VTT/SRT,
but differentiation is the exact corrected revision feeding the learning table and later drills.

### R9 — authority/provenance

**Attack:** calling a track “corrected” makes all model timing appear human-verified.

**Response:** per-field authority, immutable raw, lineage, revision/model/import provenance,
corrected text authority changes only where the user edited.

### R11 — do-no-harm/textual regression

**Attack:** generic save destroys IDs/notes; regeneration silently changes an existing table; raw
is overwritten.

**Response:** track-only revisions, raw API immutability, frozen table binding, stale badge, new
table version instead of destructive rewrite, independent round-trip hash.

### R12 — platform architecture

**Attack:** SQLite track, passport segments and exported VTT become three competing truths.

**Response:** SQLite revision is canon; passport/VTT are labelled projections with revision/hash;
transactional projection update; mismatch fails closed.

### R13 — migration steward

**Attack:** eager backfill damages hundreds of owner texts or makes rollback impossible.

**Response:** additive migration, lazy idempotent promotion, before/after hashes/counts, no table
drop on rollback, legacy passport preserved.

### R14/R15 — isolation/lifecycle

**Attack:** raw personal speech captions begin syncing because the learning text already syncs.

**Response:** package local-only, excluded from artifact sync, explicit export/delete/relink, no
server API or upload in L3a.

### R16 — cost governor

**Attack:** every edit triggers retranslation/ASR.

**Response:** zero model calls in editor. Regeneration is explicit and separately estimated.

### Cross-lens blockers found

1. **BLOCKER:** generic update destroys stable sentence identity — forbidden.
2. **BLOCKER:** raw and corrected in one mutable array — forbidden.
3. **BLOCKER:** compatibility passport without revision/hash can drift — forbidden.
4. **BLOCKER:** standalone SRT cannot honestly promise identity preservation — tiered guarantee.
5. **BLOCKER:** implicit package cloud sync would violate consent/lifecycle — package local-only.
6. **MAJOR:** storing every keystroke as immutable revision explodes history — one mutable draft +
   explicit immutable commits.
7. **MAJOR:** “corrected” cannot promote timing authority globally — per-field authority.
8. **MAJOR:** full media ZIP can OOM browser — defer until measured streaming design.

## 15. Required gates before L3a can be called complete

### 15.1 Pure core

- raw revision edit/split/merge/offset is impossible;
- text/time edit retains corrected ID and raw lineage;
- split/merge create new IDs with complete lineage;
- canonical tuple/hash deterministic across browser/Node;
- VTT and SRT parse/serialize semantic hash parity;
- malformed/unknown format fails explicitly;
- overlap warning, gap fact and blind-range flag survive round-trip.

### 15.2 Persistence/migration

- upgrade from real v44 profile to v45; applied count equals `MIGRATIONS.length`;
- transaction fault injection at every commit phase leaves previous revision canonical;
- repeated media import/promotion creates zero duplicates;
- raw row cannot be changed through public repository API;
- draft reload recovery and explicit discard;
- projection revision/hash parity;
- text delete/package delete/reference-count GC receipts;
- package tables and L3a compatibility track snapshots absent from cloud slim bundle;

### 15.3 Integration

- Local ASR → editor → correction → save revision → table → save → reopen;
- Gemini ASR same provider-neutral track contract;
- VTT and SRT import → correction → standalone export/reimport;
- slim package export/import preserves IDs/lineage/provenance;
- relink exact SHA passes, one-byte mismatch fails;
- legacy Mia card promotion: text/timing hash and sentence/note counts unchanged;
- corrected revision after saved table produces stale badge, not silent table rewrite;
- Local-selected flow makes zero Gemini requests during correction/export.

### 15.4 Browser/UX

- Chrome production-like 380×844 RU/LTR and HE/RTL screenshots inspected;
- desktop Chrome; Edge/Firefox only to the extent current Studio supports them—Local beta matrix
  remains Chrome-only;
- real audio and local video `<audio>/<video>` replay-range;
- missing media, quota full, OPFS write failure, corrupt package, dirty-close and crash recovery;
- 2,800-segment fixture: measure first-interactive, scroll/edit p95, draft save and revision commit;
  thresholds frozen before optimization, no virtualisation claim without measurement;
- accessibility: keyboard focus order, labels, contrast, screen-reader state for play/save/error.

### 15.5 Owner-live acceptance

1. Mia: correct at least ten substantive errors, close/reopen, compare raw vs corrected.
2. Split one segment, merge two, shift timing, replay every changed range.
3. Export corrected VTT and SRT, reimport and show semantic parity report.
4. Export slim package, import in fresh profile, relink the same media by SHA.
5. Confirm original raw track is unchanged and exportable.
6. Confirm existing saved table is marked stale after later correction and is not overwritten.

## 16. Owner decisions D1–D8

| ID | Options | Recommendation |
|---|---|---|
| D1 Canon | A first-class SQLite revisions · B passport JSON · C OPFS sidecar JSON | **A**; B/C create hidden/dual truth |
| D2 Save | A every keystroke revision · B memory-only draft · C recoverable draft + explicit revision | **C** |
| D3 Identity | A one overloaded segment ID · B raw source ID + corrected ID + lineage | **B** |
| D4 Existing table after correction | A rewrite in place · B silently latest · C freeze binding + stale + new version | **C** |
| D5 Export | A full media ZIP now · B standalone VTT/SRT + slim package; full ZIP later | **B** |
| D6 Legacy | A mass backfill · B lazy idempotent promotion | **B** |
| D7 Sync | A package follows text sync · B local-only until separate consent/sync design | **B** |
| D8 Timing | A global+per-segment now, drift later · B automatic drift/forced alignment now | **A** |

Recommended approval sentence, verbatim:

> **ОДОБРЯЮ L3a Correctable Media Package по рекомендациям D1–D8 из design packet 2026-07-31. Разрешаю отдельную инженерную сессию: additive browser migration v45, first-class OPFS-SQLite track/revision store, editor, VTT/SRT + slim-package round-trip и локальные/браузерные гейты. Не разрешаю push/deploy, server или production schema/data mutations, cloud-sync включение Media Package, L2/L4/L5/L6 или full-media ZIP без отдельного решения.**

Фраза утверждена владельцем дословно 2026-07-31; разрешённый bounded engineering slice
завершён локальным кандидатом. Это не даёт authority на push/deploy.

## 17. Предлагаемое разбиение будущей инженерной сессии

Это sequencing после approval, не authorization:

1. **T0 — frozen recon:** подтвердить actual migration count, source consumers, package/sync
   allowlist и реальные Mia fixtures.
2. **T1 — pure track core:** canonical schema/hash, ops, VTT/SRT parse/serialize, mutation tests.
3. **T2 — persistence:** migration/repository/transaction/draft/delete/relink, fault injection.
4. **T3 — import/promotion:** ASR/VTT/SRT → raw+corrected, legacy lazy promotion.
5. **T4 — editor UX:** player, focused segment, edit/split/merge/offset, 380px RU/HE.
6. **T5 — table binding:** freeze revision, row-source-v2, compatibility projection, stale state.
7. **T6 — export/import:** VTT/SRT semantic parity, slim package identity parity, SHA relink.
8. **T7 — adversarial diff review:** R4/R9/R11/R12/R13/R15, real-profile/performance/fault gates.
9. **T8 — owner-live packet:** commands, exact commit/device/fixtures, known failures, rollback.
10. Stop before push/deploy until separately authorized.

## 18. Paste-ready next-session prompt

```text
Работай в E:\projects\tts-prototype-android.

READ FIRST полностью и в порядке:
1. AGENTS.md
2. CLAUDE.md
3. docs/PROJECT_ROLES.md
4. docs/planning/STUDIO_INGEST_ROADMAP_2026_07_30.md
5. docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md
6. docs/planning/STUDIO_INGEST_L3A_CORRECTABLE_MEDIA_PACKAGE_DESIGN_PACKET_2026_07_31.md
7. docs/planning/STUDIO_KARAOKE_ROW_TIMING_MISMAP_2026_07_30.md
8. docs/planning/STUDIO_ASR_CLOCK_COMPRESSION_S12_7_2026_07_30.md

Production baseline: v3.11.279 / 88977240. L2 demand-triggered; не начинать.
Сначала проверь live code и actual MIGRATIONS.length, затем дай 5–10 строк recon.

Owner approval scope: [ВСТАВИТЬ ДОСЛОВНО УТВЕРЖДЁННУЮ ФРАЗУ D1–D8].
Если approval отсутствует — docs/recon only, код не менять.

Инварианты:
- raw immutable; corrected отдельно;
- SQLite revisions = canon; passport/VTT = revision-hashed projections;
- generic Update card/delete+recreate sentences запрещён;
- source_segment_id != caption_segment_id != source_line_index != sentence_index;
- no implicit cloud/model call; Local/Gemini defaults unchanged;
- Media Package local-only; cloud sync/server/full-media ZIP out of scope;
- dirty worktree preserve; explicit artifact/staging allowlist;
- adversarial critique before code and on final diff;
- stop before push/deploy/production without separate authority.

Выполни T0→T8 из §17 одним bounded engineering slice с красными-до-фикса тестами.
Оставь stable owner-live packet, exact gates/results, known failures и следующий paste-ready prompt.
```

## 19. Engineering outcome

T0–T8 реализованы отдельным локальным code commit
`097d212dff899642d4e83906caa20c03c9ef8cc9`. Stable owner-live packet, точные гейты,
известные остатки и следующий prompt находятся в
`docs/research/studio-l3a-correctable-media-package/2026-07-31/OWNER_LIVE_PACKET.md`.

Historical candidate впоследствии был pushed/deployed и доведён owner-evidence fixes до
production `v3.11.282`; точная хронология и remaining owner-live gates находятся в stable
owner packet. L2 остаётся demand-triggered и не был начат. Следующий слой — L3b Artifact
Continuity — пока утверждён как research/planning, но не как implementation.

Subsequent owner dogfood выявил следующий maturity gap: coarse whole-table stale и inline
single-cell editing безопасны, но вынуждают полную пересборку после малой correction. Владелец
2026-08-01 утвердил L3a.3 **Material Revision Workspace** с двумя слоями, immutable table
revisions, deterministic affected row/field impact, manual-field protection и explicit targeted
regeneration. Full rebuild становится rare advanced action. Normative packet:
`docs/planning/STUDIO_INGEST_L3A3_MATERIAL_REVISION_WORKSPACE_IMPLEMENTATION_PACKET_2026_08_01.md`.
Workspace implementation и Playback Review впоследствии shipped через `v3.11.286`; real-material
mapping repair `v1→v2` и synchronized follow owner-observed. First-slot/compact-header polish —
`v3.11.287`. Следующий owner-gated slice по L3b — P2 Portable Learning Package v2; P1B больше
не является implementation backlog.
