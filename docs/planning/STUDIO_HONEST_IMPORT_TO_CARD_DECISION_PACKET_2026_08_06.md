# Studio — honest import → card: decision packet

> **Date:** 2026-08-06
> **Status:** **SHIPPED / PRODUCTION VERIFIED.** Owner approval was received 2026-08-06; W1–W6
> shipped in `b04a7a8c` (`v3.11.325`). Downstream long-job/save hardening and owner-live evidence
> continue in `STUDIO_LONG_JOB_HONESTY_REAL_SERIES_ACCEPTANCE_PACKET_2026_08_07.md`.
> **Production baseline:** `v3.11.319`, browser schema `MIGRATIONS.length=48`
> **Predecessor (shipped today):** `STUDIO_MEDIA_BINDING_PROVENANCE_DECISION_PACKET_2026_08_06.md`
> — F1/F2/F3 in `v3.11.315`, D4 in `v3.11.316`, shelf regression in `v3.11.317`,
> D5 segment-identity restore in `v3.11.318`–`v3.11.319`.
> **Trigger:** owner walked the full path — transcript → draft → Gemini table → saved card — and got
> a card with no media, no learning material and no warning. In their words: *«процесс полуслепой и
> неорганичный по ожиданиям»*.
> **Scope:** browser-local. No server, no schema migration, no provider default change.

## 0. Decision in one screen

Six defects surfaced in one day. They are one family:

> **A capability that depends on tab memory is a capability the user loses without being told.**

```text
canon on disk (OPFS)                    ambient globals (tab memory)
  media package · tracks                  v3LastImportMeta        ← segments for the request
  caption revisions (the only timings)    v3ActiveMediaAudio      ← row provenance on save
  text · sentences · bindings             v3LastMediaPackageRef   ← bind target on save
        │                                          │
        └── survives reload ───────────────────────┴── does not survive reload
                                                   │
                        every one of them silently gates a capability
```

`v3.11.318`–`319` made *one* consumer content-addressed and proved the approach: from a cold reload
with zero in-memory state, the segment passport rebuilt itself in 398 ms by matching the composer
text against saved revisions. The remaining two globals were left ambient — and that is exactly
where the owner's card fell through.

## 1. The six defects and their status

| # | Defect | Status |
|---|---|---|
| D1 | Binding written from ambient ref, never compared to row provenance | **shipped** `v3.11.315` |
| D2 | Promotion keyed `track → text LIMIT 1`; second card invisible to Import Center | **shipped** `v3.11.315` |
| D3 | Import Center substitutes `catalog[0]` instead of reporting absence | **shipped** `v3.11.315` |
| D4 | One dead package reference cancels the entire library backup | **shipped** `v3.11.316` |
| D5 | Reopened transcript loses segment identity → `>250 rows` refusal with no way out | **shipped** `v3.11.318–319` |
| D6 | Save path binds nothing, and says nothing, when media context is absent | **open — this packet** |

### D6 in detail

`public/index.html:26733`

```js
const l3ref = window.v3LastMediaPackageRef || (v3LastGeminiMeta && … .media_package_ref);
if (l3ref && window.StudioMediaPackage) {          // ← no ref: no bind, no toast, no trace
  … resolveBindTarget … bindText … else v3MediaBindRefused = true;
}
```

The honest-refusal toast added in `v3.11.315` lives *inside* the `if`. When there is no ambient ref
at all, the entire block is skipped: no binding, no receipt, no explanation. The card is saved as a
plain text card and the loss is discovered only later, by opening it.

Measured on the owner's card `В сокрытии - 2 версия 2`: 566 rows, `binding = null`,
`studio_learning_materials` row absent, every `sentences.edit_meta_json._studio_source` carrying
`source_segment_id: null` — because `v3ActiveMediaAudio` (a *third* global, not the one D5 restored)
was empty at save time. The Gemini premium branch never consults segments at all, so nothing else
caught it either.

## 2. Second finding: the aligner is binary where the data is partial

`AsrTranscript.alignRowsToSegments` walks rows in order and returns a single `ok` verdict; the first
row it cannot place aborts the whole mapping. Measured against the owner's card:

| | |
|---|---|
| rows | 566 |
| segments | 555 |
| rows found verbatim somewhere in the transcript | **542 (95.8%)** |
| aligner verdict | `ok:false`, `ROW_NOT_IN_SEGMENT`, `alignedRows: 123`, **mapped 0** |

The provider re-split rather than rewrote: row 123 (`…זה לא הייטק.`) is a fragment of a segment that
merged three rows. 95.8% of rows are provably inside a specific segment and could carry that
segment's timing; the remainder honestly carries none.

This is **not** loosening R11. Per-row proof is stricter than a global verdict: a row either is
contained in its segment or gets no timing. The product already models exactly this shape with
`blind` ranges and `study_without_media`, and `MaterialRevisionCore.planExactAlignedMappingRepair`
already reports `missing_count` / `conflict_count`. Only the `al.ok` gate in front of it is binary.

## 3. Work items

### W1 — one media-context resolver *(closes D6; required)*

Collapse `v3LastImportMeta` / `v3ActiveMediaAudio` / `v3LastMediaPackageRef` into a single resolver
derived from canon plus the composer text, extending the shipped
`v3RestoreImportPassportFromWorkspace` to return the whole context, not just segments:

```text
resolveMediaContext() → { package, track, revision, segments, rows_provenance } | null
```

- exact-identity gate stays `MediaHost.revisionMatchesLines` (full line-for-line match; two matching
  revisions → refuse, never pick);
- ambient values become a fast path, never the authority;
- the **premium branch consults it too**, so a Gemini-built table records row provenance;
- one resolver means one place to prove correct, instead of three globals that can disagree.

### W2 — a save never loses media silently *(closes D6; required)*

The save path always produces one of three recorded outcomes, never silence:

| outcome | card state | user sees |
|---|---|---|
| bound, provenance verified | media exact | nothing (normal) |
| bound, provenance unverifiable (legacy rows) | media present, `provenance_checked:false` | one-line note |
| no media context / provenance disagrees | no binding | toast **and** a persistent card note with the next action |

Move the toast out of the `if`, and record the outcome on the card so it survives the toast.

### W3 — partial proven alignment *(recommended; unlocks karaoke for W1 cards)*

Replace the binary `al.ok` gate with per-row acceptance:

- a row provably contained in exactly one segment takes that segment's timing;
- ambiguous or absent rows take none and are reported as coverage, not failure;
- surface coverage honestly (`542/566 строк со звуком`), never a bare "karaoke on";
- timing stays derived at open time, never written to canon;
- `alignRowsToSegments` keeps its strict verdict for callers that need all-or-nothing — the new
  behaviour is an additional, explicitly-named mode, not a redefinition.

### W4 — deletion states its consequences *(recommended)*

`deletePackage` currently says "bound table rows will not be rewritten" and then destroys the only
copy of the timings while orphaning materials that reference the package. The confirmation must name:
materials that will lose their source, that caption revisions are the sole timing copy, and that
re-importing the identical file restores the package identity by SHA-256.

### W5 — integrity is visible before it bites *(recommended)*

`materialArchiveGaps()` (shipped with D4) already computes dangling material→package references.
Surface it in Import Center diagnostics as a standing check rather than only at export preflight.

### W6 — every refusal names the next action *(recommended)*

The `>250 rows` guard is honest and load-bearing — a single call at that size 500s server-side and
loses the whole translation — but it was terminal. Refusals in the composer must offer the route out
(restore segment identity, import as media, split), matching the `prepare-transfer` pattern the
Import Center now uses.

## 4. Adversarial role critique

- **R11.** W3 is the only item that touches mapping authority; it must be *stricter* per row than the
  current global verdict, and must never interpolate between proven rows. If a reviewer cannot state
  the proof for one row, that row gets no timing.
- **R9.** `provenance_checked:false` and "coverage 542/566" are asserted-versus-derived distinctions
  and must remain visible, not averaged into a single green state.
- **R4.** The owner's verdict — semi-blind, unorganic — is the acceptance bar. A card must never
  reach the Library in a state its creator did not see and accept.
- **R12.** One resolver, no second registry of media context; canon stays the single truth.
- **R13.** No writes without a preview; W4 is the missing preview.
- **R16.** Nothing here calls a provider. W3 in particular converts a *paid* re-run into a free
  local re-derivation.
- **R2/R17.** Partial coverage serves learning; a silent all-or-nothing refusal does not.

## 5. Acceptance

The owner's exact path, replayed end-to-end on a fresh reload between every step:

1. import media → ASR → transcript in composer;
2. reload the tab; build the table via **Gemini premium**;
3. save to Library;
4. the card opens with **its own** video, is a learning material, is listed in Import Center, and its
   karaoke state is whatever the coverage honestly is — with no step depending on tab memory and no
   silent outcome anywhere in the chain.

## 6. Gates

```text
npm run smoke:studio-chunks        npm run smoke:media-package(+:browser)
npm run smoke:material-revision(+:browser)   npm run smoke:import-center(+:browser)
npm run smoke:portable-learning-package      npm run smoke:room-media
npm run smoke:media-karaoke        npm run smoke:text-card       npm run smoke:i18n
npm test
```

Plus 380 px RU/LTR and HE/RTL screenshots for any new card state, and a replay of §5 in the browser
smoke with a reload between each step — the reload is the regression this family keeps producing.

## 7. Allowlist

```text
public/index.html
public/js/media-host.js
public/js/asr-transcript.js                  # W3 only, additive mode
public/js/material-revision-core.js          # W3 coverage reporting
public/js/media-package-repository.js        # W4 preview payload
public/js/studio-media-package.js
public/js/studio-import.js
public/js/portable-learning-package-repository.js
public/js/studio-portable-learning-package.js
public/i18n/locales/{ru,en,he}.js
public/sw.js
tests/{mediaHost,asrTranscript,materialRevisionCore,mediaPackageRepository,studioMediaPackage}.test.js
scripts/premium/{studio-chunks,media-package-browser,import-center-browser}-smoke.js
docs/planning/STUDIO_HONEST_IMPORT_TO_CARD_DECISION_PACKET_2026_08_06.md
```

No browser migration. No server file.

## 8. Explicit exclusions

Interpolated or index-based timing; rewriting existing bindings in bulk; automatic ASR or
translation re-runs; storing derived timing in canon; cloud sync; Hermes; provider-default changes.

## 9. Paste-ready owner authorisation sentence

The following is a proposal and carries no authority merely by appearing here:

> **ОДОБРЯЮ реализацию строго по packet «honest import → card» 2026-08-06: W1 единый
> content-addressed резолвер медиа-контекста вместо трёх ambient-глобалов (включая премиум-ветку),
> W2 сохранение никогда не теряет медиа молча (три именованных исхода, заметка на карточке),
> W3 частичное ДОКАЗАННОЕ выравнивание вместо бинарного вердикта с честным покрытием, W4 превью
> последствий удаления пакета, W5 проверка целостности в диагностике, W6 каждый отказ называет
> следующее действие. Red-before-fix тесты, гейты §6 с перезагрузкой между шагами, allowlist §7,
> 380 px RU/HE. Не разрешаю: интерполированный тайминг, массовую перезапись привязок,
> автоматический ASR/перевод, запись производного тайминга в канон, серверные изменения.**

## 10. Closure evidence

- W1: all three former ambient consumers resolve one content-addressed media context, including
  the premium branch.
- W2: save records exactly one named outcome — `bound_verified`, `bound_unverified` or
  `not_bound` — and never converts an optional cache failure into a failed canonical card.
- W3: `aligned-partial-proven` grants timing only to rows proved inside exactly one segment; blind
  rows remain without timing. No interpolation, voting or nearest-neighbour rule was added.
- W4/W5/W6: deletion preview, Import Center integrity diagnostics and named next actions shipped.
- Primary implementation: `b04a7a8c`; subsequent acceptance hardening: `bfe7016e`, `e0a45643`,
  `0db64fd6`, `8df50a18`, `c36536bf`, `5913b044`.
- Final observed production shell: `v3.11.340`; browser schema remains
  `MIGRATIONS.length=48`; full suite **868 total / 864 pass / 4 unchanged baseline failures**.
- No mass binding rewrite, automatic ASR/translation, interpolated timing, derived timing canon,
  schema migration or provider-default change was performed. The old incorrectly bound
  `В сокрытии - 2` remains an explicit owner decision and was not touched.
