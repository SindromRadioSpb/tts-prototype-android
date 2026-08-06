# Studio — media binding provenance gate + material visibility: decision packet

> **Date:** 2026-08-06
> **Status:** **PROPOSAL — awaiting owner approval.** This document carries no implementation,
> commit, push, deploy or data-mutation authority.
> **Production baseline at diagnosis:** `v3.11.314`, browser schema `MIGRATIONS.length=48`
> **Evidence:** `docs/research/studio-media-binding-provenance/2026-08-06/README.md`
> **Trigger:** owner could not transfer one media card to iPhone; investigation found the card was
> silently bound to a different video.
> **Scope:** three browser-local defects in the Studio save→bind→promote→transfer chain, plus one
> authorised repair of the owner's affected card. No server, no schema migration, no provider default
> change.

## 0. Decision in one screen

A learning card can end up **asserting a media source it does not have**, and every downstream
surface then behaves "correctly" over a false fact:

```text
composer rows (carry their own provenance: asrseg:<media_sha>:N)
        │
        ▼
save to library ──► bindText(package = window.v3LastMediaPackageRef)   ← ambient, never compared
        │                                                                 to the rows in hand
        ▼
binding claims media X while rows come from media Y
        │
        ├─► Room/Studio player offers the wrong file, karaoke honestly silent (0 links)
        ├─► card never promoted to a learning material → invisible to Import Center
        └─► Import Center silently shows/exports a *different* material instead of saying "absent"
```

The fix is one principle applied in three places: **the rows' own provenance is the authority for
which media a card belongs to; ambient UI state is not evidence, and an entity that is absent must be
reported as absent, never substituted.**

## 1. Confirmed defects

### D1 — binding written from ambient state, never checked against row provenance *(root cause)*

`public/index.html:26733`

```js
const l3ref = window.v3LastMediaPackageRef || (v3LastGeminiMeta && … .media_package_ref);
if (l3ref && window.StudioMediaPackage) {
  await …bindText({ text_id: newTextId, package_id: l3ref.package_id, track_id: l3ref.track_id,
                    revision_id: l3ref.revision_id, revision_sha256: …,
                    mapping: { schema: 'studio-row-source-v2', rows: l3Rows } });
}
```

`l3Rows` already contains `source_segment_id = asrseg:<media_sha256>:N` for every row — the exact,
independent signal identifying the true media. It is written into the same statement that names a
possibly unrelated `package_id`, and the two are never compared.

`public/js/media-package-repository.js:217-230` (`bindText`) does gate the media triple —
`BINDING_TARGET_MISMATCH` for package↔track↔revision incoherence, `BINDING_HASH_MISMATCH` for the
revision hash — but has **no gate on `mapping.rows` versus `package_id`**. A perfectly coherent
triple for the wrong package passes.

Observed damage: 561 rows sourced from `mpkg:00c088eb…` bound to `mpkg:af77ff0c…`; 0/561 rows
mappable; player would serve an unrelated 42-minute video.

### D2 — promotion to a learning material is keyed by track, one text per track

`public/js/studio-material-revision.js:236-241`

```js
var bindings = await window.__localDB.dbQuery(
  'SELECT text_id FROM studio_text_media_bindings WHERE track_id=? ORDER BY updated_at DESC LIMIT 1',[trackId]);
…
var material = await repo().promoteLegacyText(String(bindings[0].text_id));
```

`promoteLegacyText` is the only lazy promotion path outside portable import, and it is reachable only
through this track→text lookup. `studio_learning_materials.text_id` is `UNIQUE` while `package_id` is
not, so N texts per media package is a supported shape — but this lookup can only ever promote one of
them, and picks it by `updated_at`, i.e. it can promote a card the user is not looking at.

Consequence: a card with no material row is **absent from the Import Center catalog**
(`portable-learning-package-repository.js:487` — `FROM studio_learning_materials m JOIN texts t`),
so it cannot be exported, transferred or backed up, with no explanation offered anywhere.

### D3 — Import Center substitutes a different material instead of reporting absence

- `public/js/studio-portable-learning-package.js:183` — `selectMaterial` falls back to
  `state.catalog[0]` when the requested material is not found. The "Use on another device" wizard
  then builds and hashes an archive **of the wrong material** under the user's expectation that it is
  theirs.
- `public/js/studio-portable-learning-package.js:186` — `renderOverview` always renders
  `materialCard(attention[0] || ready[0])`, ignoring `state.materialId` / `options.textId` entirely.
- `public/index.html:11119` — the global entry `#v3PortableGlobalBtn` calls `open({view:'overview'})`
  with no `textId`, so an open card never reaches the surface at all.

This is the exact pattern already recorded as "silent empty ≠ real empty" and "singleton reset on
entity change": a reusable surface keeping another entity's state on entity change.

### Non-defect, worth naming

`public/js/media-package-repository.js:98-104` — the "Транскрипты" shelf is a **media-package** list
titled by filename, capped at 8. It is behaving as designed; it simply has no notion of which cards
use a package, which is why the owner searched it for a card name and found nothing. Addressed as an
optional label change (F3b), not as a defect.

## 2. Adversarial role critique

- **R11 (do-no-harm / independent oracle).** The strongest signal available — row provenance — was
  discarded in favour of ambient UI state, and the resulting false fact was accepted by every
  downstream gate because none of them re-derived it. Any fix that merely "usually picks better"
  fails R11; the gate must be a hard comparison against data already in the transaction.
- **R9 (derived ≠ asserted).** A binding is presented to the user as a derived, verified fact ("this
  card has media"), while it was in truth an assertion inherited from whatever was last open. The fix
  must make an unverifiable binding *absent*, not *optimistic*.
- **R4 (premium UX, no dead ends).** "Card is not in the list" with no route out is a dead end. The
  card must appear with an honest state and an offered next action.
- **R2/R17 (pedagogy).** A card that claims media it cannot play teaches nothing and erodes trust in
  every other provenance badge in the product. Silent substitution of another material in a transfer
  wizard is worse: the learner would ship the wrong content to their phone.
- **R12 (no dual-write).** The fix must not introduce a second registry of "which media does this card
  belong to". Provenance already lives in the rows; the binding table stays the single materialised
  answer, derived from it.
- **R13 (migration steward).** The owner's repair touches canon. It requires a full backup first, a
  dry-run-equivalent preview, and a reversible path. No destructive step without the backup in hand.
- **R16 (cost governor).** Re-deriving timings costs one BYOK ASR run over a ~125 MB video. That is
  unavoidable — the timings are provably gone — but it must be spent once, and it must not be
  triggered automatically by any of the code fixes.

## 3. Fix contract

### F1 — provenance is the binding authority *(required; closes D1)*

Pure helper (new, testable without DOM/SQL): extract the media-sha set from a
`studio-row-source-v1|v2` mapping. Both known id shapes carry it:
`asrseg:<media_sha256>:<n>` and `srcseg:<media_sha256>:<track>:<n>`.

1. **Gate in `bindText`.** When `mapping.rows` yields a non-empty sha set, require it to equal
   exactly `{package.media_sha256}`; otherwise throw `BINDING_PROVENANCE_MISMATCH` and write nothing.
   An empty/unparseable set (legacy rows) is not judged and passes, but is recorded as
   `provenance_checked: false` in the mapping envelope so the state stays honest.
2. **Self-heal in the save path** (`index.html:26733`). Resolve the binding target from the rows'
   sha first: if a live package with that sha has a `user_corrected` track and current revision, bind
   to *that*, and use the ambient ref only when it agrees or when rows carry no provenance. If the
   provenance package does not exist locally, **bind nothing** and surface
   `studio.mediaPackage.sourceUnverified` on the card — the transcript and table stay fully usable.
3. **Never rewrite existing bindings** as a side effect. The gate applies on write only.

### F2 — a card is never invisible, and never substituted *(required; closes D2 + D3)*

1. `openForTrack(trackId, textId)` takes an explicit text; `studio-media-package.js` already carries
   it in `activeWorkspaceOptions.text_id` (set by `activateTextBinding`). The `LIMIT 1` lookup remains
   only as a no-context fallback, and when the track resolves to more than one text it must present a
   choice rather than pick silently.
2. `lifecycleInventory` additionally reports media-bound or non-empty texts that have **no** material
   row, with `import_state: 'not-promoted'` and `next_action: 'prepare-transfer'` — one explicit
   button that runs `promoteLegacyText` for that exact text. Catalog completeness is what makes the
   Import Center's own claim ("show what learning material exists") true.
3. `selectMaterial` returns `null` when an explicit id was requested and not found. Every caller
   renders "this card is not here yet" plus the `prepare-transfer` route. **The `catalog[0]` fallback
   is deleted, not softened.**
4. `renderOverview` renders the requested material when one was requested; the attention-first card
   is shown only for a context-free entry and is labelled as such.
5. `#v3PortableGlobalBtn` passes the active text id when a card is open.

### F3 — honest labelling *(recommended, low cost)*

- **F3a** Card/Room state for an unverifiable media source: distinct from "media missing on this
  device". Missing = we know which file and its SHA; unverified = we do not know that this card has
  that file at all. RU/EN/HE strings ship together (`tt()` fallback is dead — all three locales plus
  SW/locale version bump).
- **F3b** "Транскрипты" shelf rows list how many cards use each package, so a shelf entry is
  identifiable by card and not only by filename.

### Deliberately not proposed

Re-validating or auto-repairing every existing binding at startup. Existing data may legitimately
predate provenance recording; a silent mass rewrite would violate R11 exactly as the original defect
did. Existing damage is repaired explicitly, per card, under §4.

## 4. Owner data repair — the affected card

Preconditions proven in the evidence file: source video SHA-256 equals the deleted package identity
byte-for-byte, so package identity is exactly reconstructible; transcript timings are provably
unrecoverable and must be re-derived once.

| Step | Action | Reversible |
|---|---|---|
| RP0 | Full library ZIP backup via Import Center, saved off-device, before any write | — |
| RP1 | Re-import the source video in Studio → package identity `mpkg:00c088eb…` is reconstructed; the archived sibling card's dangling `package_id` heals by construction | yes (delete package) |
| RP2 | ASR runs once (BYOK, chunked path); S12.5/S12.6/S12.7 coverage and clock-compression gates apply as normal | yes |
| RP3 | Re-point the affected card's binding from the wrong package to the reconstructed one, with the new track/revision — **the only step with no current UI**; must be an explicit, backed-up, single-card action, not a sweep | yes (backup) |
| RP4 | Promote the card to a learning material (`promoteLegacyText` for that exact text) | yes |
| RP5 | Fill row↔segment links with the existing proven aligner (`prepareMappingRepair` / `repairMapping`, `alignRowsToSegments` by text) and commit a new table revision with `impact.kind='mapping_repair'` and its provenance proof. **Row index is never used as a mapping** | yes (immutable history) |
| RP6 | Export archive `.lplp.zip` from Import Center; confirm the saved-copy assertion | — |
| RP7 | Transfer `.lplp.zip` **and** the video to the phone. The video must be sent **as a file, not as a video** — recompression changes the bytes and the exact-SHA relink will correctly refuse it | — |
| RP8 | On iPhone: Import Center → Restore → verify → dry-run → Apply → relink media by exact SHA → play → cold reopen | yes (Undo receipt) |

Residual, stated plainly: the archived sibling card's own transcript revision is gone and stays gone;
re-import restores its media reference but not its timings unless it is separately re-aligned.

## 5. Red-before-fix tests

Written and failing before any implementation:

1. `bindText` rejects a mapping whose row sha set disagrees with the package and writes nothing.
2. `bindText` accepts an agreeing set, and accepts legacy rows with no parseable provenance while
   marking `provenance_checked: false`.
3. The sha extractor handles both `asrseg:` and `srcseg:` shapes, mixed sets, and malformed ids.
4. The save path binds to the provenance package when it exists and the ambient ref disagrees.
5. The save path binds nothing — and loses no rows — when the provenance package is absent locally.
6. Two texts on one track: each promotes to its own material; neither promotion picks the other.
7. `lifecycleInventory` lists a media-bound text with no material as `not-promoted` /
   `prepare-transfer`.
8. `selectMaterial` returns `null` for an explicitly requested missing id, and no export path can be
   reached with a substituted material.
9. `renderOverview` shows the requested material when one was requested.
10. Regression pin: an existing valid binding is unchanged by the new gate.

## 6. Gates

```text
npm run smoke:media-package        npm run smoke:media-package:browser
npm run smoke:material-revision    npm run smoke:material-revision:browser
npm run smoke:import-center        npm run smoke:import-center:browser
npm run smoke:portable-learning-package                npm run smoke:portable-learning-package:browser
npm run smoke:room-media           npm run smoke:media-karaoke
npm run smoke:studio-chunks        npm run smoke:text-card
npm run smoke:i18n                 npm test
```

Plus the standing UI rule: 380 px screenshot in RU/LTR and HE/RTL before any UI commit. Any new
failure against the current baseline blocks release.

## 7. Exact implementation allowlist

```text
public/index.html                                   # save path + global entry textId
public/js/media-package-repository.js               # bindText provenance gate
public/js/studio-media-package.js                   # explicit text context
public/js/studio-material-revision.js               # openForTrack(trackId, textId)
public/js/portable-learning-package-repository.js   # not-promoted inventory rows
public/js/studio-portable-learning-package.js       # honest absence, no catalog[0] fallback
public/i18n/locales/{ru,en,he}.js                   # F3 strings, all three together
public/sw.js                                        # cache/locale version bump under release authority
tests/mediaPackageRepository.test.js
tests/materialRevisionRepository.test.js
tests/importCenterCore.test.js
tests/portableLearningPackageRepository.test.js
tests/portableLearningPackageUi.test.js
docs/planning/STUDIO_MEDIA_BINDING_PROVENANCE_DECISION_PACKET_2026_08_06.md
docs/research/studio-media-binding-provenance/2026-08-06/README.md
```

No browser migration. No server file. No provider or model change.

## 8. Rollback

1. Reverting the code restores the previous behaviour; no schema or data shape changes.
2. The provenance gate is write-path only — reverting cannot invalidate bindings already written.
3. RP0's full backup is the recovery point for every repair step; RP1–RP5 are individually
   reversible, and RP8 retains the existing import receipt Undo.
4. If the aligner cannot prove a mapping in RP5, the card keeps text and table and stays honestly
   without karaoke. Fabricating a mapping from row order is forbidden.

## 9. Explicit exclusions

Automatic revalidation or rewriting of existing bindings; any mass backfill of learning materials;
automatic ASR re-runs; media bytes inside `.lplp.zip`; cloud sync or automatic media transport;
server schema/API/data; provider defaults or implicit fallback; Option C material/text decoupling;
Hermes; L2/L4/L5/L6.

## 10. Paste-ready owner authorisation sentence

The following is a proposal and carries no authority merely by appearing here:

> **ОДОБРЯЮ реализацию строго по packet 2026-08-06: F1 provenance-гейт привязки медиа
> (`BINDING_PROVENANCE_MISMATCH`, self-heal по sha строк, ничего не привязывать при отсутствии
> пакета), F2 честное отсутствие вместо подмены (`openForTrack` с явным текстом, `not-promoted` в
> каталоге Import Center, удаление fallback на `catalog[0]`, requested-материал в Overview, textId в
> глобальной кнопке), F3 честные строки RU/EN/HE. Red-before-fix тесты §5 до кода, гейты §6, allowlist
> §7. Разрешаю один локальный scoped commit. Отдельно разрешаю ремонт моей карточки по §4 RP0–RP8
> после полного бэкапа. Не разрешаю: массовую ревалидацию существующих привязок, автоматический
> ASR, миграции схемы, серверные изменения, изменение провайдер-дефолтов. Остановись перед
> push/deploy и покажи commit и гейты.**
