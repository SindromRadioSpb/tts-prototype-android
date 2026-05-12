# scripts/morph — Hebrew morphology build pipeline

Companion to `docs/MORPHOLOGY_REQUIREMENTS_v3_2.md` (Phase 9.4.C-local).

## What this produces

`npm run build:morphology` generates two files in `public/morph/`:

- `heb_morphology.bin` — compact JSON dictionary of normalized Hebrew word
  forms → multi-analysis entries. Each entry has root / lemma / binyan / pos
  / source / rank / surface (see scope doc §4 / §6 for the schema).
- `heb_morphology.meta.json` — provenance + integrity record: provider name,
  hspell version, license, entry count, SHA-256 of the dict, build timestamp.

The runtime layer (`public/js/morph-provider.js`, Phase 9.4.D) lazy-fetches
`heb_morphology.bin` on first word-study form open, caches via Service Worker,
and queries it < 1 ms per lookup.

## Requirements

The script tries several hspell access strategies in order:

1. **`hspell` on the local PATH** (Linux dev env)
   - Install: `sudo apt install hspell` (Debian/Ubuntu) or build from
     [hspell.ivrix.org.il](http://hspell.ivrix.org.il/).
   - Verify: `hspell -V` should print `Hspell 1.4` (or higher).
2. **WSL fallback** (Windows dev env, automatic when `process.platform === 'win32'`)
   - Install: `wsl --install -d Ubuntu-24.04`, then inside WSL:
     `sudo apt update && sudo apt install -y hspell git build-essential`.
   - Verify: `wsl -d Ubuntu-24.04 -- hspell -V`.
   - Override: `MORPH_HSPELL_VIA_WSL=1 npm run build:morphology` to force WSL
     path even on non-Windows.
3. **Stub-only mode** (no hspell available)
   - Falls back to emitting just the seed roots (from
     `public/morph/HEBREW_COMMON_ROOTS_SEED.json`) as a minimal dict.
   - Tier 1 still functions; Tier 2 carries the load.

## Wordlist sources (first that exists wins)

1. **`MORPH_WORDLIST=<path>`** env var pointing to a line-delimited Hebrew
   wordlist. Lets you target a specific corpus.
2. **`.external/HebMorph/test-files/`** — corpus shipped with the HebMorph
   git submodule (cloneable from `https://github.com/synhershko/HebMorph`).
   Mid-size; gets us a reasonable Tier 1 coverage.
3. **`public/morph/HEBREW_COMMON_ROOTS_SEED.json`** — fallback. Emits an
   entry per seed root (no inflections). ~100 entries.

## Determinism (#14)

- Output is sorted by normalized key before serialization.
- Same hspell version + same wordlist → same SHA-256 dict hash.
- The `build_commit` field captures the LinguistPro repo commit at build
  time, separating "our pipeline version" from "data version".

## Normalization (#15)

The shared invariant (`scripts/morph/normalize.mjs` ≡ `public/js/morph-normalize.js`):

1. NFC Unicode
2. Strip combining niqqud (U+0591..U+05C7 marks)
3. Strip ZWJ/ZWNJ/RLM/LRM (U+200B..U+200F, U+202A..U+202E, U+2066..U+2069)
4. Map final-letter forms (ך→כ ם→מ ן→נ ף→פ ץ→צ)
5. Trim whitespace

Both build and runtime apply this to the LOOKUP KEY. Surface forms
(`u` field) preserve the original spelling for display.

## Running the build

```sh
# From repo root.
npm run build:morphology
```

Expected output (with hspell + HebMorph corpus available):

```
[morph-build] starting pipeline
[morph-build] wordlist source=hebmorph-test-files, count=12834
[morph-build] hspell runner: native / Hspell 1.4
[morph-build] processed 1000/12834
...
[morph-build] done in 87234ms
              entries=8421, analyses=21733
              dict=public/morph/heb_morphology.bin (3247.8 KB)
              meta=public/morph/heb_morphology.meta.json
```

Larger corpora (and the future hspell-data-files full enumeration path)
push entry count toward ~250K. The script handles this via 1000-word
chunking through hspell stdin/stdout.

## Root derivation caveat

`hspell -l` emits lemma + morphology features but NOT 3-letter root
directly. The script applies a best-effort heuristic to derive root from
lemma (strip ה/נ prefix for hif'il/nif'al, strip yod for pi'el, etc.).
The `d` field on each analysis records which heuristic fired — useful
for diagnostics. Manual user input always overrides automatic root.

A future v3.4 epic (DictaBERT in-browser, Tier 3) supersedes this with
transformer-based morphology that emits root directly.

## License obligation

The shipped `heb_morphology.bin` is derived from hspell-data-files
(AGPL-3.0). The `data_provider_license` field in `meta.json` records
this — runtime can surface it in Settings, and `NOTICE.md` at the repo
root carries the upstream copyright attribution.
