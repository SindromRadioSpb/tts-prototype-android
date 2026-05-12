# Third-party notices

LinguistPro ships derived data and code from third-party projects. This
file records the upstream sources and their license terms.

## Hebrew morphology dictionary (Phase 9.4)

The file `public/morph/heb_morphology.bin` is generated at build time by
`scripts/morph/build-morphology.mjs` from the **hspell** Hebrew speller
and its bundled morphology data files (`hspell-data-files`).

- **Upstream:** [http://hspell.ivrix.org.il/](http://hspell.ivrix.org.il/)
- **Source repository:** [https://github.com/synhershko/HebMorph](https://github.com/synhershko/HebMorph) (HebMorph; redistributes the hspell-data-files)
- **Authors:** Nadav Har'El & Dan Kenigsberg
- **Copyright:** 2000–2017 Nadav Har'El & Dan Kenigsberg
- **License:** GNU Affero General Public License version 3 (AGPL-3.0)

The AGPL-3.0 carries a copyleft obligation: anyone receiving the derived
dictionary (`heb_morphology.bin`) must be able to obtain the underlying
source data files under the same license. LinguistPro itself is
non-commercial open-source and AGPL-compatible by license stack; the
generated dictionary inherits this status.

Provenance fields (provider, version, license, copyright, build commit,
SHA-256) are recorded in `public/morph/heb_morphology.meta.json` and
surfaced at runtime via the Settings → "🔤 Морфология иврита" status
panel for user transparency (requirement #6 of
`docs/MORPHOLOGY_REQUIREMENTS_v3_2.md`).

## Hebrew transliteration

The `hebrew-transliteration` npm package is used for SBL-style romanization
of Hebrew text in IDE / Classic mode tables.

- **Upstream:** [https://www.npmjs.com/package/hebrew-transliteration](https://www.npmjs.com/package/hebrew-transliteration)
- **Author:** Charles Loder
- **License:** MIT

## Roots seed dictionary

`public/morph/HEBREW_COMMON_ROOTS_SEED.json` (100 common Hebrew roots
with Russian/English glosses, used as Tier 2 fallback for the morphology
layer) is compiled from standard public-domain reference materials —
primarily Klein's etymological dictionary entries and similar Hebrew
grammar references. Glosses are short factual lookups; the file is freely
redistributable.

## TTS audio assets

Audio generated via Google Cloud Text-to-Speech and Piper (local neural
TTS). Their respective licenses apply to the engines, not to LinguistPro
source code; cached audio files in `data/audio-cache/` are user-private.

## SRS card templates

The SRS card system uses Anki-compatible note types via AnkiConnect
(local-only). Anki itself is GPL-3.0 (Damien Elmes); LinguistPro does
not bundle Anki, only writes to it via the user's local AnkiConnect
endpoint.

---

For per-file copyright headers see the source code. Questions about
license compatibility should be filed as GitHub issues against the
LinguistPro repository.
