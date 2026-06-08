# BRR-P0-001 — `pseudocatalogue.csv` → corpus-schema mapping

**Status:** schema-first contract landed (2026-06-08); **header verified + producer
shipped-as-code (BRR-P0-004, 2026-06-08)**. This table is the DoD artifact: how each
`corpus`-object field is sourced from the **verified** catalogue.

- **Contract module:** `db/premium/corpusMeta.js` (`buildCorpus` / `validateCorpus`).
- **Storage:** `source_meta_json.corpus` (OPFS) — Option A, no DB migration.
- **Bundle:** first-class top-level per-text `corpus` field + `corpus_meta_version: 1`
  (the additive "v2.1" marker over bundle `schema_version: 2`).
- **Gates:** `npm run smoke:corpus` (59 assertions) + `npm run smoke:benyehuda-ingest` (53).

> ✅ **Header VERIFIED 2026-06-08** (BRR-P0-004 first step) against the live file
> (`github.com/projectbenyehuda/public_domain_dump` master, 2026-03 / 10th release).
> The real header is:
> ```
> ID,path,title,authors,translators,author_uris,translator_uris,original_language,genre,source_edition
> ```
> **Deltas from the old assumption** (now reconciled in the table below):
> - `author` → actually **`authors`** (plural; may hold multiple, joined in the quoted field).
> - **No `sort_title` / `sort_author`** → no latin name in the CSV → `author_slug` stays
>   `null` (honest; never fabricated).
> - **New columns** `author_uris` / `translator_uris` (Wikidata QID URLs) and
>   `source_edition` (print edition) — modelled additively (see below).
> - `genre` is an i18n miss — literal `Translation missing: he.<token>`; the real token is
>   the suffix after `he.` (cleaned by the producer).
> - `original_language` is often empty → default `he`; a translated work with empty
>   orig_language is rejected by the R1 gate, so translations need a curated `orig_language`.
>
> **Path / URL scheme (verified):** raw vocalized text =
> `…/master/txt{path}.txt` (path `/p46/m16` → `txt/p46/m16.txt`); public work URL
> (→ `provenance.url`) = `https://benyehuda.org/read/{ID}`. Each txt ends with a BY
> attribution **footer block** the producer strips before ingest (excluded from body +
> `content_hash`). Producer: `scripts/premium/ingest-benyehuda.js` (+ pure helpers
> `scripts/premium/lib/benyehuda.js`); gate `npm run smoke:benyehuda-ingest`.

## Mapping

| `corpus` field | Type | Source | Notes / role |
|---|---|---|---|
| `schema` | int | computed (`CORPUS_SCHEMA_VERSION=1`) | set by `buildCorpus`; contract version |
| `byehuda_id` | string | CSV **`ID`** | stable source id; **primary** re-ingest idempotency key (R6) |
| `content_hash` | `sha256:<hex>`\|null | **computed** from work's plain Hebrew (niqqud-insensitive, footer stripped) | **dedup** key; filled by producer if absent; **null (not the empty-SHA sentinel) for content-less works** → warning (R6) |
| `author` | string | CSV **`authors`** (raw Hebrew display; multi-author kept as-is in P0) | facet; display (Hebrew) |
| `author_slug` | string\|null | from `author_latin` (curated) — **CSV has no `sort_author`** | latin ID anchor (R3); **null in auto-ingest, never fabricated** (use `author_uri` instead) |
| `author_uri` | string\|null | CSV **`author_uris`** (first Wikidata QID URL) | **NEW (additive)** — stable identity anchor (R3/R6); WARNING-only on malformed QID |
| `translator` | string\|null | CSV `translators` | honest `null` when absent |
| `translator_uri` | string\|null | CSV **`translator_uris`** (first Wikidata QID URL) | **NEW (additive)** — translator identity anchor |
| `orig_language` | ISO-639 | CSV `original_language` (default `he`) | R1: translated works record the **true** source lang (yi/de/ru/…); empty + translator set ⇒ build fails (curate it); non-ISO value → warning |
| `era` | string | **curated** (R7) — suggested vocab `biblical…contemporary` | unknown value → warning, not blocked (R7 extensible); auto-ingest maps known authors, else null |
| `genre` | string | CSV `genre` — **cleaned** `Translation missing: he.<token>` → `<token>` | facet |
| `themes` | string[] | **curated** (R7) | discovery tags |
| `register` | enum | **curated** (R7/R8) `literary\|spoken\|archaic\|poetic\|mixed` | honesty: literary ≠ spoken Hebrew |
| `track` | enum | **curated** (R6/R8) `accessible\|literary` | two-shelf routing |
| `difficulty` | int 1–5\|null | **Phase 2 / BRR-P1-007** (Dicta type-token + rankRoots freq + length) | **band pinned now**; out-of-band/non-int → coerced null / rejected (R6 anti-migration) |
| `provenance.source` | string | constant for this corpus: `Project Ben-Yehuda` | attribution required by license (R6) |
| `provenance.url` | string | **`https://benyehuda.org/read/{ID}`** | provenance link (surfaced in card/reader) |
| `provenance.license` | string | `public-domain` | |
| `attribution` (incl. `source_edition`) | string | composed: `Текст: Проект Бен-Йехуда` + `. Издание: <source_edition>` | CSV **`source_edition`** folded into the free-string attribution (no schema change) |
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
