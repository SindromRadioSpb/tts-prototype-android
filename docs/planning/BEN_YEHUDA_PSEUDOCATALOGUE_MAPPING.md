# BRR-P0-001 — `pseudocatalogue.csv` → corpus-schema mapping

**Status:** schema-first contract landed (2026-06-08). Population from the real
catalogue is **BRR-P0-004** (ingestion). This table is the DoD artifact:
how each `corpus`-object field is sourced.

- **Contract module:** `db/premium/corpusMeta.js` (`buildCorpus` / `validateCorpus`).
- **Storage:** `source_meta_json.corpus` (OPFS) — Option A, no DB migration.
- **Bundle:** first-class top-level per-text `corpus` field + `corpus_meta_version: 1`
  (the additive "v2.1" marker over bundle `schema_version: 2`).
- **Gate:** `npm run smoke:corpus` (35 assertions).

> ⚠ **Verify before ingestion (tripwire).** The exact `pseudocatalogue.csv`
> header is **not yet verified against the live file** — the strategy doc names
> `(title, author, genre, path)`, but the published Project Ben-Yehuda dump
> historically carries more columns (id/path/title/sort_title/genre/
> original_language/author/sort_author/translators/…). BRR-P0-004 **must** read
> the actual header first and reconcile this table — do not treat the "CSV column"
> column below as fact until then.

## Mapping

| `corpus` field | Type | Source | Notes / role |
|---|---|---|---|
| `schema` | int | computed (`CORPUS_SCHEMA_VERSION=1`) | set by `buildCorpus`; contract version |
| `byehuda_id` | string | CSV `id`/`path` | stable source id; **primary** re-ingest idempotency key (R6) |
| `content_hash` | `sha256:<hex>`\|null | **computed** from work's plain Hebrew (niqqud-insensitive) | **dedup** key; filled by producer if absent; **null (not the empty-SHA sentinel) for content-less works** → warning (R6) |
| `author` | string | CSV `author` | facet; display (Hebrew) |
| `author_slug` | string\|null | computed from `author_latin` (CSV `sort_author`/translit) | latin ID anchor for future graph (R3); **null, never fabricated** |
| `translator` | string\|null | CSV `translators` | honest `null` when absent |
| `orig_language` | ISO-639 | CSV `original_language` (default `he`) | R1: translated works record the **true** source lang (yi/de/ru/…); non-ISO value → warning |
| `era` | string | **curated** (R7) — suggested vocab `biblical…contemporary` | unknown value → warning, not blocked (R7 extensible) |
| `genre` | string | CSV `genre` | facet |
| `themes` | string[] | **curated** (R7) | discovery tags |
| `register` | enum | **curated** (R7/R8) `literary\|spoken\|archaic\|poetic\|mixed` | honesty: literary ≠ spoken Hebrew |
| `track` | enum | **curated** (R6/R8) `accessible\|literary` | two-shelf routing |
| `difficulty` | int 1–5\|null | **Phase 2 / BRR-P1-007** (Dicta type-token + rankRoots freq + length) | **band pinned now**; out-of-band/non-int → coerced null / rejected (R6 anti-migration) |
| `provenance.source` | string | constant for this corpus: `Project Ben-Yehuda` | attribution required by license (R6) |
| `provenance.url` | string | CSV `path` → work URL | provenance link |
| `provenance.license` | string | `public-domain` | |
| `provenance.reviewer` / `reviewed_at` | string\|null | **R7 proofing** (BRR-P0-005) | evidence anchor: lets a `human_proofread` claim be trusted instead of warned |
| `attribution` | string | composed (`Текст: Проект Бен-Йехуда …`) | surfaced in card/reader (BRR-P0-005) |
| `review_status` | enum | **honest default `machine`** → `human_proofread` only after R7 proofs | R1: MT is **never** labelled "вычитано" |
| `audio_status` | enum | **honest default `tts`** → `human` only for real voice | R1: TTS is **never** labelled "native" |

## Honesty gate (R1) — enforced by `validateCorpus`

Hard **errors** (fail the build, mirrors `audit:note-fields`):
`review_status`/`audio_status` outside their enums (no free-string "вычитано"/"native");
`track`/`register` invalid; malformed `content_hash` **or the empty-string SHA
sentinel**; out-of-band/non-integer `difficulty`; `translator` set with
`orig_language='he'`; broken `schema`. **Warnings** (incomplete or needs a
spot-check, not an outright lie): missing `byehuda_id`/`author`/`content_hash`/
`provenance.source`; unknown `era`; non-ISO `orig_language`; **`human_proofread`
without `provenance.reviewer`/`reviewed_at`**; **`audio_status='human'`** (the
structured-enum human claims — the schema permits the value but flags it for
human verification, since a pure validator cannot confirm external reality).

## Round-trip (DoD)

`source_meta_json.corpus` → export lifts to top-level bundle `corpus` (also stays
nested for legacy importers) → import folds back into `source_meta_json.corpus`,
**byte-identical**. Producer (`build-notes-from-bundle.js`) preserves + validates
+ stamps `corpus_meta_version`. Mirror functions: `liftCorpusToBundle` /
`mergeCorpusIntoSourceMeta` (`corpusMeta.js`), replicated inline in
`public/db/local-db.js` (each cites the other).
