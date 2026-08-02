# Studio Ingest L3a.3 — Material Revision Workspace

> **Дата:** 2026-08-01
> **Статус:** 🟢 `SHIPPED v3.11.287` / `2e8f4bf355a2babc0de619bfca817d1fff74b44f`;
> production automated PASS, real-material mapping repair/follow remains partial owner-live PASS
> **Baseline:** foundation `v3.11.283` / `82a392e6`; mapping/follow correction
> `v3.11.286` / `3589c0ee141f7b139ab9e584f9bcca0b8997ca2e`; actual browser
> `MIGRATIONS.length = 46`
> **Предки:** L3a Correctable Media Package shipped; L3b Artifact Continuity planning approved
> **Authority:** историческая implementation-фраза §19 была исполнена; последующие owner-approved
> playback/mapping/first-slot corrections зафиксированы в дочернем packet. Новая L3b/P2 работа,
> server/cloud sync, Hermes, L2/L4/L5/L6 и media-bearing ZIP требуют отдельной точной authority.
>
> **Implementation evidence:**
> `docs/research/studio-l3a3-material-revision-workspace/2026-08-01/OWNER_LIVE_PACKET.md`.
> Foundation и Playback Review deployed; полный owner-live matrix остаётся шире уже
> подтверждённых владельцем mapping-repair `v1→v2` и row-follow сценариев.
> **Subsequent program state:** the immutable Workspace canon is now packaged by shipped P2
> `v3.11.289` / `da30fdbaf79f6751bee74406f73b093be742e76b`; P2 adds no new mutable
> authority. P3 real iPhone continuity remains separately owner-gated.

## 0. Owner decision

Владелец 2026-08-01 утвердил:

> **Единый Material Revision Workspace с двумя слоями — рекомендуемый премиальный вариант.**

И зафиксировал целевое качество:

> Реализация должна быть не «расширенным редактором транскрипта», а версионным редактором
> всего учебного материала с точечной инвалидацией и обновлением. Полная пересборка становится
> редким осознанным действием, а не платой за каждую мелкую коррекцию.

Это снимает продуктовую развилку. Следующая design/engineering работа не должна повторно
сравнивать варианты «оставить два несвязанных редактора» и «смешать всё в одну mutable форму».
Нужно реализовать выбранный Workspace с двумя различимыми каноническими слоями.

## 1. Решение в одном экране

Material Revision Workspace — единая поверхность повторной работы с сохранённой карточкой
материала:

```text
media@sha256
  └─ raw ASR track                         immutable evidence
       └─ corrected caption revision v3    human-correctable source layer
            └─ exact row-source mapping
                 └─ learning table revision v2
                      ├─ Hebrew/plain
                      ├─ Hebrew/niqqud
                      ├─ transliteration@profile
                      └─ translation@language/provider
```

Пользователь видит один workflow, но система сохраняет разные authority:

- raw никогда не переписывается;
- corrected transcript — канон человеческой правки source layer;
- learning table — версионная производная, привязанная к exact corrected revision/hash;
- ручная правка конкретного learning field выше provider result для этого поля;
- table compatibility projection не становится вторым каноном;
- сохранение правок не вызывает provider;
- targeted regeneration затрагивает только явно выбранные stale machine-derived fields;
- full rebuild создаёт новую table revision и никогда не уничтожает прежнюю до commit.

## 2. Проверенный live baseline

### 2.1 Уже shipped

- Browser migration v45 создаёт first-class Media Package, tracks, immutable caption revisions
  и exact text↔revision binding.
- Raw и corrected tracks разделены.
- Recoverable draft и explicit revision commit разделены.
- Player↔cue, jump by cue number, replay, previous/next, split/merge/offset, raw compare работают.
- Исправленный transcript можно сохранить, закрыть и повторно открыть из карточки материала.
- Saved table остаётся frozen к exact corrected revision; новая correction ставит coarse stale.
- VTT/SRT и slim package round-trip, media SHA relink, local-only lifecycle реализованы.
- Source-player↔table row synchronization и original-media row replay shipped в `v3.11.282`.
- Existing sentence fields можно вручную менять в table edit mode; `edit_meta_json.edited`
  отмечает изменённые поля.

### 2.2 Подтверждённый owner pain

Owner dogfood на реальном 36:17 video / 514 cues показал:

1. После поздней correction вся table считается stale, хотя изменена одна реплика.
2. Обычный путь предлагает полную «Обновить таблицу» и повторный provider run.
3. Inline textarea внутри узкой ячейки неудобна для содержательного RTL/LTR редактирования.
4. Source cue и четыре learning fields не видны как один связанный объект.
5. Пользователь не видит impact до сохранения: какие строки/поля устареют и сколько вызовов
   потребуется.
6. Нет первого класса table revision/compare/rollback для post-save corrections.
7. Coarse stale честнее silent overwrite, но недостаточен для зрелого процесса.

### 2.3 Live code constraints

- `public/js/studio-media-editor.js` владеет focused caption editor.
- `public/js/media-package-repository.js` владеет package/track/revision/binding persistence.
- `public/js/studio-media-package.js` владеет reopen shelf/workspace activation.
- `public/index.html` владеет `currentTableData`, table generation, save/update и legacy
  inline editor.
- `public/js/studio-import.js` переносит row-source-v2 identity через `edit_meta_json`.
- `public/js/studio-media-karaoke.js` владеет media↔row playback mapping.
- `texts`/`sentences` остаются реальным saved learning-table surface.
- `edit_meta_json` сейчас metadata envelope, но не immutable table revision canon.
- generic saved-text Update содержит legacy replace-all path; он запрещён для promoted bound
  material и должен быть обойдён repository contract, а не переиспользован.

Frozen first-pass symbol anchors for T0:

- `v3MapSentenceApiRowToUiRow()` / `v3RestoreSavedTableIfUnchanged()`;
- `v3LibrarySaveCurrentCore()` / `v3LibraryUpdateCurrentCore()`;
- `v3TranslateTableChunked()`;
- `tableEditOpenCellEditor()` / `tableEditSaveCell()`;
- `StudioMediaPackage.activateTextBinding()` / `notifyRevision()`;
- `MediaPackageRepository.bindText()` / `isTextBindingStale()`;
- `StudioMediaEditor.saveVersion()` / `continueToTable()`;
- `StudioImport.rowEditMetaForSave()` / `restorePortableRowIdentity()`.

These anchors are recon seeds, not a complete writer allowlist. T0 must prove completeness.

## 3. Product goals и non-goals

### 3.1 Goals

1. Одна discoverable CTA из saved material: **«Редактировать материал»**.
2. Один workspace для source correction и learning projection review.
3. Routine loop без вертикального курсирования: replay → read/edit → next.
4. Save-without-generation как default.
5. Field/row-level impact вместо global stale-only.
6. Targeted regeneration только затронутых auto-derived fields.
7. Manual overrides never silently overwritten.
8. Immutable caption/table revisions, compare и rollback/reselect.
9. Exact provider/profile/provenance/cost preview.
10. Честная работа без cloud/LLM: edit/save/replay/export остаются полезными offline.
11. Модель, пригодная для последующего Portable Learning Package v2 и device continuity.

### 3.2 Non-goals

- новый ASR;
- улучшение Local/Gemini recognition quality;
- L2 jobs/batch;
- L4 full-local translation/niqqud program;
- diarization/forced alignment;
- automatic cloud sync;
- server-side media;
- Hermes tools;
- full-media ZIP;
- silent back-propagation table field → transcript;
- automatic provider calls on open/save/import/relink;
- destructive rewrite всех legacy texts;
- объявление provider output языковой истиной.

## 4. Core UX model

### 4.1 Один workspace, два слоя

#### Layer A — «Транскрипт»

Показывает и редактирует:

- corrected cue text;
- start/end;
- speaker;
- lineage/source IDs;
- raw comparison;
- split/merge/offset;
- source quality warnings.

Raw доступен только для сравнения/экспорта. Никакое действие в UI не пишет в raw.

#### Layer B — «Учебная строка»

Показывает связанные table rows и поля:

- plain Hebrew;
- Hebrew with niqqud;
- transliteration и exact selected profile;
- translation и target language;
- field provenance/authority;
- previous/current value;
- stale/needs-review/manual-locked state;
- original-media replay для строки.

Один cue может соответствовать нулю, одной или нескольким table rows. UI обязан показывать
`Строка 1 из N`, а не предполагать 1:1.

### 4.2 Desktop layout

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ sticky media player + timeline + current time                           │
├──────────────────────────────────────────────────────────────────────────┤
│ ← Previous     [ 11 / 514 ]     ▶ Replay cue     Next →                 │
│ Player and selection are synchronized in both directions                │
├───────────────────────────────┬──────────────────────────────────────────┤
│ SOURCE / TRANSCRIPT           │ LEARNING PROJECTION                      │
│ corrected text                │ row 1 / 2                                │
│ timing / speaker              │ Hebrew · niqqud · translit · translation │
│ raw compare / warnings        │ provenance · stale · manual locks        │
├───────────────────────────────┴──────────────────────────────────────────┤
│ Save corrections | Update 3 affected rows | ⋯ Full table version        │
└──────────────────────────────────────────────────────────────────────────┘
```

- Panels resizable within bounded min/max widths.
- Player/navigation/action bar remain visible for the routine loop.
- Advanced split/merge/offset/export/relink/delete are progressive disclosure.
- No routine action requires scrolling from text to replay/next.

### 4.3 Mobile 380 px layout

- Compact sticky player with expand/collapse; cue replay remains one tap.
- Sticky cue navigator: previous, editable number/total, replay, next.
- Tabs/segmented control: `Транскрипт` / `Учебная строка`.
- Learning fields render as full-width form cards, never narrow grid cells.
- Bottom sticky action bar contains one primary save action and an impact sheet trigger.
- Advanced operations live in a bottom sheet.
- Hebrew fields set `dir=rtl`; translation/UI language remains correct LTR/RTL.
- Soft keyboard must not hide save/cancel or unexpectedly advance cue.

### 4.4 Keyboard/accessibility

- `Alt+←/→`: previous/next cue.
- `Space` outside inputs: replay current cue.
- `Ctrl/Cmd+Enter`: save current draft/revision according to explicit state.
- `Esc`: close compare/advanced panel; never silently discard dirty state.
- All player/navigation/status controls have names and focus order.
- Status is not color-only.
- Screen reader announces cue index, save state, affected row count and provider-call state.

## 5. Material state model

### 5.1 User-visible state rail

Example:

```text
Raw ✓ · Transcript v3 (saved) · Table v2 from Transcript v2
2 cues changed · 3 rows need review · 1 manual translation protected
Media available on this device · Backup not checked
```

Required states:

- aligned;
- source draft dirty;
- source saved, table aligned;
- source saved, affected rows need review;
- targeted generation pending;
- targeted generation failed, old table preserved;
- mapping conflict after split/merge;
- media missing/relinkable;
- compatibility projection stale/rebuildable;
- recoverable draft available.

### 5.2 Three primary completion actions

#### A. `Сохранить правки`

- Commits caption revision and/or manual learning field changes.
- Makes **zero** provider/model calls.
- Computes and persists impact.
- Keeps existing table revision usable and explicitly labeled.
- Default primary action.

#### B. `Обновить затронутые строки`

- Opens impact review first.
- Shows affected rows/fields, selected provider/profile, expected requests and network/privacy
  boundary.
- Regenerates only checked stale machine-derived fields.
- Preserves manual fields by default.
- Commits a new immutable table revision atomically.

#### C. `Создать новую версию всей таблицы`

- Advanced/secondary action.
- Required only for broad mapping/provider/settings changes or explicit owner intent.
- Shows full scope and provider-call estimate.
- Old table stays current until new generation validates and commits.
- Failure never deletes/replaces the previous table revision.

There is no button whose ambiguous label hides whether it saves locally or spends model quota.

## 6. Identity and mapping

The following identities remain distinct:

| Identity | Meaning |
|---|---|
| `package_id` | local Media Package |
| `raw_revision_id` | immutable ASR/subtitle evidence revision |
| `corrected_revision_id` | immutable human-corrected caption revision |
| `source_segment_id` | raw lineage anchor |
| `caption_segment_id` | cue identity in corrected track |
| `source_line_index` | import/table-source line position |
| `sentence_id` | saved learning row local identity |
| `row_id` | portable stable learning-row identity |
| `table_revision_id` | immutable table composition/version |
| `text_id` | current local saved-card identity |
| `text_key` | future portable material identity |

Mapping edge must include:

- corrected revision ID/hash;
- caption segment ID;
- zero/one/many row IDs;
- ordered source segment IDs;
- mapping method/version;
- confidence/quality flags only when they affect safe behavior;
- no overloaded legacy `segment_index`.

## 7. Field authority and provenance

Every learning field has an envelope conceptually equivalent to:

```json
{
  "value": "...",
  "authority": "source|provider|user|imported",
  "provider": "gemini|google-translate|local|none",
  "model_or_profile": "...",
  "input_revision_sha256": "...",
  "input_row_hash": "...",
  "generated_at": "...",
  "edited_at": "...",
  "status": "aligned|needs_review|stale|conflict|failed",
  "locked": true
}
```

Rules:

1. `authority=user` is protected from regeneration by default.
2. Provider output may replace only a selected provider-derived stale field.
3. Imported/asserted/user/provider values remain distinguishable.
4. A provider name without exact model/profile/input hash is insufficient provenance.
5. Transliteration stores exact profile (`sbl`, `ru-phonetic`, future profile), not only display
   string.
6. Manual niqqud is not silently normalized by a provider.
7. A table-only Hebrew edit does not rewrite corrected transcript unless the user chooses
   `Применить к транскрипту` and accepts an impact preview.
8. A transcript edit does not erase a table-only pedagogical paraphrase; it marks the relation
   for review.

## 8. Deterministic impact and invalidation rules

Impact analysis is pure and runs before persistence/provider calls.

| Caption change | Mapping impact | Learning-field impact |
|---|---|---|
| timing only | update cue/time edge | none |
| speaker only | metadata edge | none by default |
| punctuation/spacing | same cue/rows | configurable review; never auto-call |
| text, same cue identity | same mapped rows | source Hebrew changes; provider fields need review |
| global offset | timing edges only | none |
| split | mapping reconciliation | affected range conflict/review |
| merge | mapping reconciliation | affected range conflict/review |
| row manual field edit | no caption impact | that field becomes user authority |
| table row add/delete/reorder | table composition change | new table revision; mapping validation |
| provider/profile change | no caption change | selected provider-derived fields stale |

### 8.1 Dirty mask

The impact result contains, at minimum:

```json
{
  "base_caption_revision_id": "...",
  "target_caption_revision_id": "...",
  "base_table_revision_id": "...",
  "affected_caption_segment_ids": [],
  "affected_row_ids": [],
  "fields": {
    "he_plain": [],
    "he_niqqud": [],
    "transliteration": [],
    "translation": []
  },
  "mapping_conflicts": [],
  "protected_manual_fields": [],
  "reason_codes": []
}
```

No timestamps, random IDs or UI order enter deterministic impact identity.

### 8.2 Split/merge reconciliation

Split/merge never guesses a destructive mapping. The workspace shows:

- old cue(s) and rows;
- new cue(s);
- proposed row allocation;
- preserved manual fields;
- unresolved rows;
- choices: keep one row, split row, attach multiple rows, leave unbound.

Until resolved, old table remains usable and new table revision cannot be declared aligned.

## 9. Table revision architecture

### 9.1 Canon decision

For promoted bound media material, immutable table revisions become canon. Existing
`texts`/`sentences` remain the compatibility surface until consumers are migrated, but are a
rebuildable projection for promoted material, not an independent truth.

The implementation must not create a hidden `rows_json` beside mutable sentences while both
are treated as authoritative.

### 9.2 Proposed additive browser migration

At current baseline `MIGRATIONS.length=45`; the likely next additive migration is **v46**.
The next session must re-check the live count and stop on collision. Recommended logical store:

```text
studio_learning_materials
  material_id, package_id, text_id, portable_text_key,
  current_table_revision_id, created_at, updated_at

studio_table_revisions
  table_revision_id, material_id, revision_no, parent_revision_id,
  bound_caption_revision_id, bound_caption_revision_sha256,
  content_sha256, mapping_sha256, provider_context_json,
  impact_json, created_at, committed_at

studio_learning_row_versions
  row_version_id, stable_row_id, content_sha256,
  he_plain, he_niqqud, translit, translit_ru, ru,
  field_meta_json, created_at

studio_table_revision_rows
  table_revision_id, row_version_id, order_index,
  caption_segment_id, source_segment_ids_json, mapping_meta_json
```

Exact names/columns may change only if recon proves a simpler lossless form. Invariants may not.

### 9.3 Projection rule

- Repository commits canonical table revision first inside one SQLite transaction.
- Every commit names `base_table_revision_id`; a changed head fails with an explicit
  `TABLE_BASE_STALE`-class result and opens compare/rebase instead of last-writer-wins.
- Compatibility `texts`/`sentences` projection is updated/rebuilt in the same controlled path.
- Direct generic delete+recreate/update on a promoted bound text fails closed or routes through
  the repository.
- Projection carries canonical revision/hash marker.
- Reader detects divergence and offers deterministic rebuild; it never chooses the newer-looking
  copy by timestamp.
- Rollback can disable Workspace routing while preserving all legacy table data.

### 9.4 Lazy promotion

- No mass backfill.
- First open/edit of a bound legacy table performs idempotent promotion.
- Promotion snapshots current rows, `edit_meta_json`, source mapping and bound caption revision.
- Second promotion creates zero new canonical rows/revisions.
- Failure rolls back fully and leaves legacy material usable.

## 10. Provider and targeted regeneration contract

### 10.1 No implicit calls

Opening, navigating, replaying, editing, saving, importing, relinking, comparing and exporting
make zero provider calls.

### 10.2 Explicit preflight

Before regeneration UI shows:

- provider and exact profile/model where known;
- target fields;
- affected row count;
- request/chunk estimate;
- whether text leaves the device;
- manual fields protected/skipped;
- fallback policy: **none** unless separately selected by user.

### 10.3 Subset request

The client sends only selected affected rows, with stable request-local IDs. Returned rows must:

- match every requested ID exactly once;
- contain no unexpected ID;
- pass schema/language/empty-field validation;
- retain source input hash;
- pass mapping/cardinality gates;
- be assembled into a candidate revision before commit.

Existing provider endpoints should be reused if they can safely accept a subset. New server/API
work is out of scope unless separately authorized after recon proves it necessary.

### 10.4 Failure semantics

- Timeout/quota/429/invalid JSON keeps old table current.
- Partial response is not committed as aligned.
- Candidate may be retryable with receipt, but not displayed as saved truth.
- Provider failure never clears manual edits.
- Changing provider after failure is an explicit user choice, never implicit fallback.

## 11. Version/compare UX

The material card and workspace expose:

- current transcript revision;
- current table revision and its bound transcript revision;
- number/reasons of affected rows;
- revision history with created time and provenance;
- compare transcript v2→v3;
- compare table v1→candidate v2 field-by-field;
- select previous table revision as current without deleting newer history;
- explicit delete/archive policy, not hidden garbage collection.

Compare presentation distinguishes:

- source change;
- provider regeneration;
- manual edit;
- mapping change;
- unchanged preserved field.

## 12. Saved-card and Import Center integration

The current transcript card becomes the material hub:

```text
Бибас.mp4
Transcript v3 · Table v2 from v2 · 3 rows need review
Media: on this device · Backup: not checked

[Редактировать материал] [Учиться] [Версии и перенос]
```

The old `Вернуться к правкам` CTA is replaced/aliased by `Редактировать материал`.

Import Center later reads the same states; it must not re-derive competing status from passport
text. Portable Learning Package v2 serializes table revisions, mappings and field provenance
defined here. Therefore Workspace/table-revision contract precedes P2 package implementation.

## 13. Educational behavior

- Source replay remains primary context for every row.
- Correction itself is not an SRS grade.
- Existing review events remain bound to stable learning item/row identity and exact material
  revision when relevant.
- New table revision does not reset word memory or duplicate notes.
- A changed row may mark downstream audio/export/Anki projection stale, but no downstream work
  runs automatically.
- User can continue learning from the previous aligned table while a correction awaits review,
  with a visible version badge.

## 14. Adversarial role review

### R1/R9 — linguistic authority

Risk: regenerated niqqud/translation looks more authoritative than user correction. Mitigation:
per-field authority, provider provenance, manual lock, compare, honest unknown/conflict.

### R2/R17 — educational continuity

Risk: editor becomes subtitle tooling disconnected from learning. Mitigation: row/source replay,
stable learning identity, no grade from correction, downstream stale visibility.

### R3 — graph identity

Risk: relations rebuilt by text equality. Mitigation: stable IDs and typed mapping edges; text
similarity can propose, never silently assert.

### R4 — premium UX

Risk: one workspace becomes overloaded. Mitigation: two layers, focused cue/row, sticky routine
controls, progressive advanced actions, mobile tabs, no hidden model calls.

### R5 — product

Risk: manual package editor feels technical. Mitigation: material-centric language, impact count,
one-click save, provider cost only at explicit update.

### R11 — do-no-harm

Risk: small source edit destroys correct table work. Mitigation: immutable revisions, affected-only
candidate, protected manual fields, old revision preserved, independent diff oracle.

### R12 — canon/projection

Risk: captions, `currentTableData`, sentences, passport and package become parallel truths.
Mitigation: caption canon + table revision canon + rebuildable compatibility projections, hashes
and repository-only promoted writes.

### R13 — migration

Risk: lazy promotion or rollback loses table edits. Mitigation: transactional idempotent promotion,
fresh-profile oracle, projection rebuild, old path retained until acceptance.

### R14/R15 — isolation/lifecycle

Risk: targeted provider or future package leaks personal content. Mitigation: existing explicit
provider choice, local default, separate package/sync/agent consents, export/delete receipts later.

### R16 — cost

Risk: minor edits consume full-table quota. Mitigation: zero-call save, exact subset request,
request estimate, no fallback, full rebuild advanced only.

## 15. Red-before-fix gates

### 15.1 Pure impact core

1. Timing-only edit → zero language fields stale.
2. Speaker-only edit → zero provider fields stale by default.
3. Text edit → only mapped rows affected.
4. Unmapped cue edit → zero table rows plus honest warning.
5. Manual field survives impact and regeneration selection.
6. Provider/profile change invalidates only matching provider-derived fields.
7. Split/merge produces explicit mapping conflict, never guessed aligned state.
8. Same inputs produce byte-identical canonical impact hash.
9. `source_segment_id`, `caption_segment_id`, line/sentence indexes cannot substitute.

### 15.2 Persistence/migration

1. Actual next migration verified; collision hard-fails.
2. Legacy promotion is idempotent.
3. Revision commit is atomic under injected failure at every write boundary.
4. Old table stays current until candidate validates.
5. Projection divergence detected and rebuilt from canon.
6. Raw/corrected revisions unchanged by table-only edit.
7. Generic Update cannot delete+recreate promoted bound rows.
8. Process kill recovers draft/candidate without a false committed revision.
9. Two-tab same-base commits produce one success and one stale-base conflict, never silent LWW.

### 15.3 Provider

1. Save/reopen/compare generates zero network/model calls.
2. One affected row sends exactly one subset item, not full table.
3. Duplicate/missing/unexpected provider IDs fail candidate.
4. 429/timeout/invalid payload leaves previous revision/hash unchanged.
5. No implicit Gemini↔Google↔Local fallback.
6. Manual field excluded unless explicitly unlocked/selected.

### 15.4 Integration/regression

- `smoke:ingest`;
- `smoke:studio-chunks`;
- `smoke:captions-parse`;
- `smoke:text-card`;
- existing media-package core/persistence/integration/browser gates;
- table edit/reorder/delete/add compatibility;
- saved library reopen;
- source player↔cue↔row;
- VTT/SRT/slim package unchanged or versioned honestly;
- no change to Local/Gemini defaults.

### 15.5 UX/accessibility

- desktop RU/LTR and HE/RTL;
- Chrome production-like 380×844 screenshots inspected;
- routine replay/edit/next without vertical scroll;
- soft-keyboard/focus/dirty-close;
- cue with 0, 1 and N mapped rows;
- 514-cue real owner material;
- visible provider/cost/affected count before call;
- no color-only status;
- keyboard and screen-reader state.

### 15.6 Performance

Measure before thresholds are frozen:

- open/first interactive for 514 and 2,800 cues;
- cue navigation p95;
- impact calculation p95;
- draft save and revision commit p95;
- memory during compare and targeted regeneration;
- no O(N²) scan per player timeupdate;
- no claim of virtualization without real evidence.

## 16. Definition of Done

Material Revision Workspace is complete only when:

1. Saved material reopens through one `Редактировать материал` CTA.
2. Source and learning layers are visible and synchronized but retain separate authority.
3. Player seek selects cue/row; cue/row selection seeks media.
4. Routine controls remain visible at desktop and 380 px.
5. Save creates no provider calls.
6. Impact identifies exact rows/fields and reasons.
7. Targeted update changes only selected affected machine fields.
8. Manual fields are preserved by default.
9. Full rebuild is secondary, explicit and versioned.
10. Split/merge conflicts require reconciliation.
11. Old table revision survives every failure.
12. Saved/reopened state and hashes match.
13. Raw remains byte/semantic unchanged.
14. Compatibility projection can be rebuilt from canon.
15. Existing table/audio/export/Anki/library flows do not regress.
16. Stable owner-live packet contains exact commit/version/device/fixture hashes/gates/failures.

## 17. Recommended engineering sequence

This is sequencing after approval, not implementation authority.

1. **T0 — frozen recon:** re-read canon; actual migration count; enumerate every direct
   sentence/table writer; current provider batching; real fixtures; baseline gates.
2. **T1 — red pure core:** field envelopes, row/table canonical hashing, impact analyzer,
   split/merge conflict model, mutation/adversarial tests.
3. **T2 — persistence v46:** additive schema, repositories, idempotent lazy promotion,
   transaction/fault injection, compatibility projection guard/rebuild.
4. **T3 — integration contract:** corrected revision commit → impact; table revision select;
   saved-card material activation; no provider calls.
5. **T4 — Workspace shell:** material CTA, player/nav sticky shell, two layers, cue↔row mapping,
   desktop + 380 px RU/HE.
6. **T5 — learning-row editor:** full-row form, transliteration profile, provenance/locks,
   manual save/undo/compare, 0/1/N mappings.
7. **T6 — targeted regeneration:** explicit preflight, subset provider call, candidate validation,
   atomic table revision, failure receipts, no fallback.
8. **T7 — version UX:** impact sheet, compare, select previous revision, mapping reconciliation,
   full rebuild advanced path.
9. **T8 — downstream compatibility:** table/audio/export/Anki/text-card/slim-package gates;
   package-v2 serialization hooks only, not the full L3b portable implementation.
10. **T9 — adversarial final diff:** R1–R5/R9/R11–R17, direct-writer sweep, performance/fault,
    real-profile and 380 px visual review.
11. **T10 — owner-live packet:** exact commands/results/known failures/rollback and next prompt.
12. Stop before push/deploy/production until separately authorized.

## 18. Stop conditions

Stop and request a new owner decision if:

- first-class revisions require destructive rewrite of existing texts/sentences;
- canonical table revisions cannot be introduced without unresolved dual truth;
- direct writers cannot be safely routed/guarded in the bounded slice;
- targeted regeneration requires a new server endpoint or server schema not explicitly allowed;
- mapping conflicts cannot fail closed;
- provider subset response lacks stable request identity;
- current browser migration count is not 45 and proposed v46 collides;
- 514/2,800-cue performance needs a separate virtualization architecture;
- scope expands to sync/Hermes/L2/L4/L5/L6/full-media ZIP;
- push/deploy/production mutation is needed without exact authority.

## 19. Proposed implementation approval sentence

Use verbatim if the owner chooses to authorize the next engineering session:

> **ОДОБРЯЮ реализацию L3a.3 Material Revision Workspace по packet 2026-08-01. Разрешаю один bounded engineering slice T0–T10: red-before-fix pure impact/table-revision core, additive browser migration v46 после проверки actual MIGRATIONS.length, first-class OPFS-SQLite table/revision/field-provenance store, idempotent legacy promotion, единый двухслойный Workspace, targeted regeneration через существующие provider contracts, compatibility projection и локальные/browser gates. Не разрешаю push/deploy, production/server schema или data mutations, новый server API без отдельного решения, cloud sync, Hermes, L2/L4/L5/L6 либо full-media ZIP. Остановись перед push/deploy и оставь owner-live packet.**

## 20. Paste-ready next-session prompt

```text
Работай в E:\projects\tts-prototype-android.

READ FIRST полностью и в порядке:
1. AGENTS.md
2. CLAUDE.md
3. docs/PROJECT_ROLES.md
4. docs/planning/STUDIO_INGEST_ROADMAP_2026_07_30.md
5. docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md
6. docs/planning/STUDIO_INGEST_L3A_CORRECTABLE_MEDIA_PACKAGE_DESIGN_PACKET_2026_07_31.md
7. docs/research/studio-l3a-correctable-media-package/2026-07-31/OWNER_LIVE_PACKET.md
8. docs/research/studio-ingest-artifact-continuity/2026-08-01/REPORT.md
9. docs/planning/STUDIO_INGEST_L3B_ARTIFACT_CONTINUITY_PLAN_2026_08_01.md
10. docs/planning/STUDIO_INGEST_L3A3_MATERIAL_REVISION_WORKSPACE_IMPLEMENTATION_PACKET_2026_08_01.md
11. docs/planning/STUDIO_KARAOKE_ROW_TIMING_MISMAP_2026_07_30.md
12. docs/planning/STUDIO_ASR_CLOCK_COMPRESSION_S12_7_2026_07_30.md

Planning baseline: production/origin v3.11.282 / 95bd37a3; actual browser
MIGRATIONS.length=45. Re-check live code, current main/origin and migration count; do not assume.
Preserve the dirty worktree and stage only an explicit allowlist. Give 5–10 lines frozen recon
before changes.

Owner-approved product decision: one premium Material Revision Workspace with two distinct
layers — corrected transcript source and versioned learning projection. It is not an expanded
transcript textarea. Save is zero-call; deterministic impact identifies affected rows/fields;
targeted regeneration is explicit and preserves manual fields; full rebuild is rare, advanced,
versioned and never destructive.

Implementation authority: [ВСТАВИТЬ ДОСЛОВНО ФРАЗУ ИЗ §19]. If that exact authority is absent,
perform docs/recon only and do not change code or migrations.

Execute T0→T10 from §17 as one bounded slice with red-before-fix tests. Required invariants:
- raw immutable; corrected and table revisions separate;
- table canon is immutable revisions; texts/sentences only controlled compatibility projection
  for promoted bound material;
- source_segment_id != caption_segment_id != source_line_index != sentence_index != row_id;
- no generic delete+recreate Update for promoted material;
- no implicit provider/cloud/model call or fallback;
- manual field authority never silently overwritten;
- exact affected-only generation and old table preserved on every failure;
- Local/Gemini defaults unchanged;
- no server/sync/Hermes/L2/L4/L5/L6/full-media ZIP scope;
- adversarial critique before code and on final diff;
- RU/LTR + HE/RTL desktop and 380×844 visual inspection;
- stop before push/deploy/production.

Leave stable owner-live packet with exact commit, migration, changed files, red/green gates,
request-count evidence, real 514-cue fixture evidence by hashes only, screenshots, known failures,
rollback and a paste-ready push/deploy prompt. Do not claim completion from unit tests alone.
```

## 21. Planning conclusion

Material Revision Workspace is the required local maturity bridge between shipped L3a and L3b
portability. Artifact Graph/Portable Package must serialize this versioned material model rather
than preserve the coarse stale flag and mutable cell-edit workflow.

The premium behavior is therefore:

```text
small correction
  → save locally with zero model calls
  → deterministic affected-row review
  → optional targeted regeneration
  → atomic new table revision

full rebuild
  → explicit advanced action only
```

This closes the owner-observed dead end without sacrificing raw evidence, provenance, cost
control, rollback or future cross-device reproducibility.

## 22. Owner-approved Playback Review UX follow-up

The foundation shipped to production as client `3.11.283` at commit `82a392e6`.
After testing the real 36:17 / 514-row material, the owner approved the synchronized
Playback Review follow-up: exact cue↔learning-row selection, initially second-slot contextual
anchoring (superseded by §23), compact context rows with one expanded editor, sequential field-review modes,
and explicit pause/resume when the owner scrolls or types.

The deterministic mixed-mapping repair, full-width adaptive compact rows and guarded
follow shipped as client `3.11.286` at commit
`3589c0ee141f7b139ab9e584f9bcca0b8997ca2e`. The owner then confirmed on the real material
that repair created immutable table revision `v2` and playback selected the mapped row.

The authoritative bounded implementation/deployment contract is:

`STUDIO_INGEST_L3A3_PLAYBACK_REVIEW_UX_IMPLEMENTATION_PACKET_2026_08_01.md`

It is additive to this packet and does not change immutable revision, authority,
provider, compatibility projection, migration v46, or stale-base invariants.

## 23. Owner-approved final Workspace polish

On 2026-08-02 the owner superseded the second-slot choice for this Workspace only: the
current playback row must occupy the first visible row, maximizing the visible upcoming
trail. The header is compacted into the semantic sequence title → state → history/revision;
380 px wraps without overflow and HE mirrors the same order in RTL. Client `v3.11.287`
implements this as presentation-only code with no migration/provider/canon change.

## 24. Production closure and handoff

Production started the `v3.11.287` container at `2026-08-02 02:19:01 +03:00`.
Cache-busted HTTP verified exact local/served hashes for the release HTML, service worker
and both changed JavaScript assets. Ephemeral Chromium `148.0.7778.96` verified desktop RU,
380 px RU/LTR and HE/RTL, first-slot placement, following context, compact semantic header,
exact 0/1/N mapping/follow, pause/resume, zero provider calls and zero page errors.

Disk cleanup stayed inside the explicit authority: unused build cache was removed before and
after deploy, plus three exact older unreferenced app images before deploy. Active and newest
prior rollback images, all running containers, volumes, database, OPFS and user data were
preserved. Disk moved from `97% / 1.16 GiB free` before cleanup to
`79% / 7.69 GiB free` after deploy and post-deploy cleanup; `disk_warn=false`.

No release defect or fix commit was required. P0/P1A/P1B are closed for roadmap sequencing.
The next slice is P2 Portable Learning Package v2 and remains owner-gated; this closure does
not authorize P2 code, schema, push or deploy.
