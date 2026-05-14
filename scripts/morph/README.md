# scripts/morph — Hebrew morphology build pipeline

Companion to `docs/MORPHOLOGY_REQUIREMENTS_v3_2.md` (Phase 9.4.C-local).

## What this produces

`npm run build:morphology` generates two files in `public/morph/`:

- `heb_morphology.bin` — compact JSON dictionary of normalized Hebrew word
  forms → multi-analysis entries. Each entry has root / lemma / binyan / pos
  / source / rank / surface (see scope doc §4 / §6 for the schema).
- `heb_morphology.meta.json` — provenance + integrity record: provider name,
  hspell version, license, entry count, SHA-256 of the dict, build timestamp,
  and (since v3.3 Workstream A1 Phase 1) a `tier` field ∈ {basic, full}.

The runtime layer (`public/js/morph-provider.js`, Phase 9.4.D) lazy-fetches
the appropriate dictionary on first word-study form open, caches via Service
Worker, and queries it < 1 ms per lookup.

## Two-tier dictionary (v3.3 Workstream A1)

The pipeline supports two output tiers selected by `--tier <basic|full>`:

| Tier | Default? | Output filename | Use case |
|---|---|---|---|
| `basic` | ✓ | `heb_morphology.bin` + `.meta.json` | Ships in the PWA bundle for all users. Currently ~34K entries / ~7 MB / ~655 KB gzipped from the HebMorph test-files corpus. |
| `full` | (opt-in via Settings) | `heb_morphology_full.bin` + `.meta.json` | Lazy-fetched after the user enables «📚 Расширенный словарь». Target ~250K entries / ~30 MB max gzipped (iOS Safari quota constraint). |

Runtime tier selection lives in `localStorage.morphDictTier_v1`; see
`public/js/morph-provider.js` `setDictTier()` / `getDictTier()` /
`getStatus().dictTier`. The provider re-fetches when the tier changes,
discards the in-memory map, and purges both filenames from the SW cache
so a tier switch can never serve stale data.

`npm run build:morphology` defaults to `--tier basic`. Use
`npm run build:morphology:full` (or `--tier full` directly) to produce the
opt-in variant — typically with a comprehensive wordlist provided via the
`MORPH_WORDLIST` env var.

### Phase 1 — infrastructure (shipped on `feat/morph-full-hspell-dict`)

- ✅ `build-morphology.mjs --tier <basic|full>` — swaps output filenames +
  records `tier` field in meta.
- ✅ `morph-provider.js` — tier-aware fetch + `setDictTier()` /
  `getDictTier()` / `getStatus().dictTier`. SW cache purge covers both
  tier variants.
- ✅ `scripts/morph/tier-switch-smoke.js` — 9-case Playwright smoke
  exercising default tier, fetch URL routing for each tier, persistence to
  localStorage, invalid-tier rejection, same-tier no-op, dual SW cache
  purge. Run via `npm run smoke:morph:tier`.

### Phase 2 — what remains for end-of-pilot merge to main

The infrastructure is back-compat: shipping it without an actual full-tier
dict is a no-op (default tier = basic, all existing users keep current
behavior; full tier returns 404 on fetch if no full dict file exists).
Phase 2 adds the user-facing surface + the actual 250K dict:

1. **Settings UI toggle.** Add «📚 Расширенный словарь (бета)» row to
   Settings panel with: explanatory caption (~30 MB опционально), default-
   OFF checkbox bound to `MorphProvider.setDictTier()`, status line via
   `MorphProvider.getStatus()` (current tier + loaded entry count + size).
2. **Service worker cache strategy.** Register a separate cache bucket
   (`linguistpro-morph-full-v1`) for the larger bundle so it doesn't
   evict critical app shell entries under quota pressure. Stale-while-
   revalidate semantics on `heb_morphology_full.{bin,meta.json}`. Add
   handler-level guard: refuse to cache if Storage quota usage would
   exceed 80 % (iOS Safari friendliness).
3. **Generate the 250K dict.** Requires WSL + native hspell build chain:
   ```sh
   wsl -d Ubuntu-24.04
   sudo apt install -y hspell build-essential perl autoconf
   git clone https://github.com/SindromRadioSpb/tts-prototype-android.git
   cd tts-prototype-android
   # Option A: enumerate hspell's internal dictionary
   cd .external/hspell && ./configure && make && cd ../..
   # ... produce a comprehensive wordlist (output piped through inflection)
   MORPH_WORDLIST=path/to/full_wordlist.txt npm run build:morphology:full
   ```
   Acceptance targets: entries ≥ 250 000 · gzipped size ≤ 30 MB · SHA-256
   captured in meta.json for integrity verification.
4. **Acceptance smoke extensions.** `npm run smoke:morph:tier` now stubs
   404 for both tier files. After Phase 2 it should also exercise: the
   Settings UI toggle (DOM-level), the actual fetch + parse of the real
   full dict (live integration), a lookup miss-rate comparison test
   (basic vs full on a fixed test corpus).
5. **Optional `extract-full-dict.c` utility.** Per the original Workstream
   A1 plan in `docs/PARALLEL_WORK_PLAN_DURING_PILOT.md` §3 — a small C
   utility linking against `libhspell` that traverses `dict_radix.c` to
   produce a comprehensive wordlist directly. Not strictly required if
   external wordlist sources work, but offers full deterministic coverage
   of the hspell dictionary. Useful for the integrity audit angle.

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
