# Hebrew Root Extractor — Research Output

**Phase 9.0 (Direction 9 — Premium Notes Redesign).** Output for mechanic M10 (root-aware notes) and M9 (niqqud-variant pinning) — see `docs/PREMIUM_NOTES_PLAN_v3_2.md`.

> ⚠ **§ 1–§ 6 SUPERSEDED 2026-05-10 by § 7 re-research.** AGPL constraint reversed (LinguistPro is non-commercial, AGPL is compatible). New recommendation in § 7. § 1–§ 6 retained for evidence/audit.

**Research budget:** 0.5 day (original) + 1 day (re-research). **Date:** 2026-05-10.

---

## § 1 — JS-only npm packages survey

| Package | Last published | License | Capability | Verdict |
|---|---|---|---|---|
| [`hebrew-transliteration`](https://www.npmjs.com/package/hebrew-transliteration) (charlesLoder) — already in our deps | 2.9.1 (active) | MIT | Transliteration only (SBL, brillAcademic, custom). NO root, NO binyan. | ✗ Not applicable |
| [`havarotjs`](https://github.com/charlesLoder/havarotjs) (same author) | active | MIT | Syllabification (Tiberian / Sephardic). NO root extraction. | ✗ Not applicable |
| [`morphhb`](https://github.com/openscriptures/morphhb) (Open Scriptures Hebrew Bible) | active | CC-BY 4.0 (data) + Public Domain (text) | **Pre-annotated Bible data only** — JSON/OSIS lookup of `[wordString, lemma, morphology]`. **Cannot analyze arbitrary words.** | ✗ Bible-only, not runtime analyzer |
| `@gedeonix/hebrew` | 0.0.6 (≈6 years stale) | unspecified | Trivial helpers. Not analytic. | ✗ Stale, no capability |
| Any "hebrew-morphology", "hebrew-root", "hebrew-binyan", "hebrew-lemmatizer" packages | — | — | **None found.** | ✗ |

**Conclusion §1:** JavaScript / npm landscape for runtime Hebrew root or binyan extraction is **empty**. The vast majority of Hebrew NLP tooling lives in academic Python/Java/Go/C ecosystems. This is not a research gap to be plugged with one more search — it's the structural state of the field.

---

## § 2 — WASM-compile feasibility (existing C/Java/Go libraries)

| Library | Language | License | Multi-week WASM effort | Blocker |
|---|---|---|---|---|
| **HebMorph** ([synhershko/HebMorph](https://github.com/synhershko/HebMorph)) | Java + .NET, Lucene analyzer | **AGPL-3.0** (incl. dictionary files + generated word lists) | 2–3 weeks via TeaVM/J2CL | **AGPL contamination** — viral, breaks commercial / closed-source distribution. Even open-source LinguistPro shouldn't bundle AGPL via WASM unless we adopt AGPL ourselves. |
| **YAP** ([OnlpLab/yap](https://github.com/OnlpLab/yap)) | Go (modern, maintained) | Apache-2.0 | 2–4 weeks via TinyGo + lexicon embed. Lexicons are large (~50–100 MB), would need on-demand fetch. | Effort + bundle size — not a license issue. **Viable for v3.3 mini-epic.** |
| **hspell** | C, primarily a spellchecker | AGPL-3.0 (data files included) | 1–2 weeks via Emscripten | Same AGPL viral problem. Root extraction is secondary; mainly stems. |
| **MILA tools** / Hebrew Dependency Parser / MorphTagger | Mixed Python/Perl/Cython, academic | Mixed (often not specified) | Multi-week to months | Mixed licenses, low maintenance signal. |

**Conclusion §2:** The only **license-clean** path is **YAP→WASM**. Effort 2–4 weeks, plus lexicon distribution problem (~50–100 MB). This is a **separate v3.3 epic**, not in v3.2 scope.

---

## § 3 — Cloud options

| Service | Hebrew morphology? | Pricing | Privacy | Verdict |
|---|---|---|---|---|
| **Google Cloud Natural Language API** — `analyzeSyntax` (which would emit lemma + POS) | **Hebrew NOT in supported languages** (verified at [docs.cloud.google.com/natural-language/docs/languages](https://docs.cloud.google.com/natural-language/docs/languages) — list: zh, en, fr, de, it, ja, ko, pt, ru, es). | n/a | n/a | ✗ **Out — Hebrew unsupported.** |
| **DICTA** ([dicta.org.il](https://dicta.org.il/?lang=en), Israeli academic non-profit) | Has Nakdan (vocalization), Abbreviation Expander, BERT model `alephbertgimmel`. **No documented public morphology API endpoint** for runtime root/binyan extraction. | Free for non-profit. Need to contact. | Israeli .org.il — sending Hebrew text plausibly OK but no documented privacy contract. | △ Theoretical fit; needs direct outreach. Out of v3.2 scope. |
| **Babel Street Rosette** | Generic morphology; Hebrew likely supported but undocumented in surface results. | Commercial, opaque pricing (likely $1k+/mo). | Vendor sees user text. | ✗ Cost + opacity. |
| **Lexicala** (via RapidAPI) | Lemma lookup; "disregards diacritics in Hebrew/Arabic". Unclear whether actually morphological analyzer or just dictionary. | Tiered pricing. | Vendor + RapidAPI proxy. | ✗ Probably dictionary, not analyzer. |
| **Self-hosted YAP sidecar on Railway** | Yes (best-in-class Modern Hebrew morphology). | Hosting cost + maintenance. | We control. | △ Possible but Railway + Go binary + lexicon = ~200 MB image, plus operational burden. Out of v3.2 scope. |

**Conclusion §3:** No premium-quality cloud option in 2026. Google's Hebrew gap is a hard "no". Self-hosted YAP is the best deferred path, but not a v3.2 fit.

---

## § 4 — Decision tree result

```
IF (JS-only library handles ≥80% of common verbs)            → ✗ no JS lib exists
ELSE IF (cloud option viable AND privacy-acceptable)         → ✗ Google unsupported; others unfit
ELSE IF (WASM multi-week feasible)                            → ✓ YAP→WASM is feasible (Apache-2.0, Go),
                                                                BUT 2–4 week epic + ~50–100 MB lexicon
                                                                → defer to v3.3 separate epic
ELSE                                                          → manual + Plan C seeded dictionary
```

**Decision: ship M10 in v3.2 Phase 9.4 with Plan B (manual entry + autocomplete) + Plan C (seeded ~100 common roots dictionary). Defer auto-extraction to v3.3 as separate "YAP→WASM Hebrew morphology" epic.**

---

## § 5 — Recommended path for v3.2 Phase 9.4

### M10 (root-aware notes) — manual-entry edition

1. **Word-study template `root` field** — text input, max 3 Hebrew letters (`[֐-׿]{2,4}`). Live autocomplete from:
   - User's previously-noted roots (`SELECT DISTINCT root_3letter FROM roots WHERE my_note_id IS NOT NULL`).
   - Seeded dictionary (~100 most-common Hebrew roots) — see § Plan C below.

2. **Word-study template `binyan` field** — `<select>` dropdown, 7 Modern Hebrew options: `pa'al / nif'al / pi'el / pu'al / hif'il / huf'al / hitpa'el`. Free-text "other / unsure" option for irregulars.

3. **Roots dictionary seed** (`docs/research/HEBREW_COMMON_ROOTS_SEED.json`, separate deliverable in Phase 9.4 — **NOT in this research doc**):
   - ~100 entries: `{ root: "שלם", gloss_ru: "целостность, мир", gloss_en: "completeness, peace", common_words: ["שלום", "שלמות", "השלים"] }`
   - Source: any standard Hebrew-grammar reference (e.g. Klein's etymological dictionary entries that are already in public-domain data sources).
   - Migration 024 (`roots` table) populated at first DB init from this JSON.
   - User-added roots merge with seed seamlessly (`UNION` query in autocomplete).

### M9 (niqqud-variant pinning) — unchanged from plan

Already manual in original M9 spec — user types preferred niqqud variant in `word_study.niqqud_variant` field. Plan B doesn't change anything here.

---

## § 6 — v3.2 Phase 9.4 implementation impact

| Item | Original plan | After Phase 9.0 research | Delta |
|---|---|---|---|
| Phase 9.4 scope | Auto root extractor + binyan classifier + niqqud pinning | Manual root + binyan input + Plan C seed dictionary + niqqud pinning | **Simpler** |
| Phase 9.4 effort | 3–4 days (high risk, research-blocked) | **2–3 days** (low risk, all UI/data work) | **−1 day** |
| Phase 9.4 risk register | R1 (root extractor not feasible) — **realized: it isn't feasible** | R1 retired; replaced by minor R: dictionary seed accuracy / completeness | Risk down |
| Roots dictionary seeding (~100 entries) | Out of scope (extractor was supposed to handle) | **+0.5 day** added to Phase 9.4 | New sub-task |
| Phase 9.4 net effort | 3–4 days | **2.5–3.5 days** | Saved ~0.5 day overall |

### v3.3 follow-up epic (sized for separate planning)

- **"YAP→WASM Hebrew morphology"** — 2–4 week epic. Compile YAP (Apache-2.0, Go) to WASM via TinyGo. Solve lexicon distribution (~50–100 MB; possibly on-demand fetch via Service Worker precache toggle). When shipped, Phase 9.4 manual root/binyan fields gain auto-fill via offline morphology — backwards-compat: manual input always wins.

- **Alternative v3.3 path:** opt-in cloud sidecar on Railway. Run YAP in a Python/Go sidecar, expose `POST /api/morphology/v1/analyze {word}` → `{root, binyan, lemma}`. Privacy-positive: explicit user opt-in (consent flow similar to research-mode in Direction 11B). Effort ~1 week. Avoids 50 MB WASM lexicon download, but adds ongoing hosting cost + privacy surface.

Direction 9.4 acceptance criteria (updated):
- [ ] `roots` table populated with ≥100 seed entries on first init.
- [ ] Word-study template `root` input has live autocomplete (seed + user roots).
- [ ] Word-study template `binyan` dropdown with 7 patterns + "other".
- [ ] M9 niqqud-variant pinning functional via `word_study.niqqud_variant` field.
- [ ] No regression in M3 word-study template UX.

---

**Bottom line:** Hebrew NLP JS landscape is structurally thin in 2026. v3.2 ships M10/M9 manual-with-autocomplete + a seeded roots dictionary — premium-honest, **−0.5 day** vs original plan, and **opens a clean v3.3 epic** for power-user auto-extraction via YAP→WASM (license-clean) or opt-in cloud sidecar.

---

## § 7 — Re-research 2026-05-10 (non-commercial license unlock)

**Trigger:** user clarified that LinguistPro is explicitly non-commercial open-source. AGPL libraries (HebMorph, hspell) are no longer vetoed — § 1–§ 6 conclusion is invalidated. Re-research aims at **premium-quality auto-extraction in v3.2**.

### § 7.1 — HebMorph (Java/.NET, AGPL-3.0) — top candidate

[github.com/synhershko/HebMorph](https://github.com/synhershko/HebMorph). License confirmed AGPL-3.0 for both code + dictionary (hspell-data-files redistributed under same terms — copyright Nadav Har'El & Dan Kenigsberg, 2000-2013).

| Aspect | Finding |
|---|---|
| What it does | Lucene/SOLR/Elasticsearch analyzer for Hebrew. Tokenizes, then for each token uses **hspell dictionary lookup** to enumerate possible morphological analyses including **root** (שורש), lemma, prefix decomposition, POS. |
| Java + .NET binaries | Available on Maven Central. Mature; deployed in production (e.g., the Elasticsearch Hebrew plugin builds on it). |
| **Native root output** | ✅ **Yes** — root is a dictionary field, not derived. This is exactly what M10 needs. |
| Modern Hebrew coverage | Good for in-dict words (~250K word forms in hspell). Falls back gracefully for OOV (proper nouns, slang) — returns POS without root. |
| Sidecar effort | 0.5–1 week: containerize a small JVM (~120 MB Docker image including hspell-data-files) with a tiny HTTP wrapper exposing `POST /api/morphology/v1/analyze {word}` → `{root, lemma, binyan, pos}`. Stateless, similar pattern to existing `/api/transliterate`. |
| Memory | ~256 MB JVM heap is plenty. Fits Railway hobby tier. |
| WASM via TeaVM | Theoretically possible but **not recommended** — TeaVM doesn't fully support modern Java APIs HebMorph uses. Sidecar is cleaner. |

### § 7.2 — hspell (C, AGPL-3.0) — lighter alternative

[hspell.ivrix.org.il](http://hspell.ivrix.org.il/) / mirrored on GitHub. License AGPL-3.0.

| Aspect | Finding |
|---|---|
| What it does | Hebrew spell-checker + morphology engine. Generates inflected forms from root + binyan + noun-stem inputs. **Reverse lookup** (word → root) is essentially what HebMorph wraps. |
| Direct usage | The C library + dictionary (hspell-data-files) are the SAME data HebMorph uses. Using hspell directly avoids the JVM. |
| Emscripten WASM | Feasible (~1–2 weeks). hspell is plain C with minimal deps. Resulting WASM bundle: ~300 KB code + ~7-10 MB compressed dictionary. Could ship in-browser. |
| Sidecar effort | 0.5 week — Linux binary + a 50-line Python/Node wrapper exposing the same morphology endpoint. Smaller than HebMorph (~30 MB Docker). |
| Trade-off vs HebMorph | hspell C API is lower-level (returns inflection paths); HebMorph wraps it with a clean analyzer interface. **For sidecar deployment, HebMorph is more time-efficient than building hspell wrappers.** For WASM, hspell is the better candidate (smaller binary). |

### § 7.3 — YAP (Go, Apache-2.0) — re-evaluated

[github.com/OnlpLab/yap](https://github.com/OnlpLab/yap). License Apache-2.0, no AGPL concern.

| Aspect | Finding |
|---|---|
| What it does | Joint morphological analysis + dependency parsing for Modern Hebrew. State-of-the-art accuracy (TACL 2019 paper benchmarks). |
| **Native root output** | YAP outputs morphological lattice with prefixes/segmentation/POS. **Root is NOT in the standard output schema.** Lemma yes, root no. Would need post-processing to derive root from lemma + verb pattern. |
| Sidecar effort | 1 week: Go binary + lexicon (~50–100 MB) + HTTP wrapper. |
| Trade-off vs HebMorph | YAP is more accurate for **disambiguation in context** (sentence-level), but slower per-word and **doesn't natively provide root**. For LinguistPro's per-word use case (autocomplete in word_study template), HebMorph is the better fit. |

### § 7.4 — DICTA — direct evaluation

[dicta.org.il](https://dicta.org.il/). Israeli academic non-profit. GitHub org [Dicta-Israel-Center-for-Text-Analysis](https://github.com/Dicta-Israel-Center-for-Text-Analysis).

| Tool | What it offers | Verdict |
|---|---|---|
| Public website tools (Nakdan, Abbreviation Expander, etc.) | Web UIs only. **No documented public REST API for runtime morphology.** Their "API" is internal to their site. | ✗ Not directly callable. Out-of-scope to reverse-engineer. |
| **DictaBERT model suite on HuggingFace** | Open-weight BERT models for Hebrew. **License: CC BY 4.0.** Includes purpose-built variants — see § 7.5. | ✅ **Major finding** |
| `dictabert-morph` | Fine-tuned for **morphological tagging**: POS, gender, number, person, tense, prefixes, suffix. 0.2B params. | ✅ Modern + accurate |
| `dictabert-lex` | Fine-tuned for **lemmatization**: word → lexeme/lemma. Output: `[["מאמרים","מאמר"], ["השלים","השלים"]]`. 0.2B params. **For verbs returns 3rd-person past sing as canonical form, NOT 3-letter root.** | ✅ But indirect for root |
| AlephBertGimmel | Earlier base model. License: **CC0-1.0**. 128K vocab, SOTA on Hebrew benchmarks per [arxiv.org/abs/2308.16687](https://arxiv.org/abs/2308.16687). | ✅ Foundation only — fine-tuned variants are what we'd actually use. |
| DictaLM 3.0 24B | Large LLM, premium quality but **24B params** — way too heavy for our scale. | ✗ Overkill |

### § 7.5 — DictaBERT inference — sidecar vs in-browser

`dictabert-morph` and `dictabert-lex` are 0.2B params each (~200 MB F32, ~50 MB INT8 quantized).

| Deployment | Feasibility | Effort | UX |
|---|---|---|---|
| **Sidecar on Railway** (Python + transformers + ONNX-INT8) | ✅ Confirmed by HuggingFace docs — embedded ONNX INT8 supported for DictaBERT variants ("provides a lower latency and memory footprint"). Per-word latency ~50–200 ms on CPU. | ~1.5 weeks | One round-trip per word. Comparable to existing `/api/transliterate`. |
| **In-browser via transformers.js** ([huggingface/transformers.js](https://github.com/huggingface/transformers.js)) | Theoretically yes — transformers.js runs ONNX models in WASM/WebGPU. 50–200 MB model precache via Service Worker. **Untested for DictaBERT specifically.** | ~2–3 weeks (proof-of-concept + integration + caching) | **Fully offline once model cached.** Premium tier. |
| **Critical caveat — root extraction** | Neither model directly emits Semitic root (שורש). They emit lemma + morphology features. **Root must be derived** via post-processing: for verbs, peel binyan-specific affixes from lemma; for nouns, dictionary-of-derivation lookup. | +1–2 days for root-derivation heuristics + small derivation table | Works for ~90% of common Modern Hebrew verbs; manual fallback for irregulars. |

### § 7.6 — Premium decision tree (re-derived)

```
GIVEN: AGPL is compatible (non-commercial); premium-quality bias; sidecar deployment OK.

OPTION A: HebMorph sidecar — DIRECT root extraction
  + Native root output (no heuristics)
  + Mature (10+ years prod use, Elasticsearch Hebrew plugin)
  + Smallest infra footprint (256 MB JVM)
  + Effort: 0.5–1 week
  − AGPL: any commercial fork would need licensing; OK for us
  − Coverage: ~250K words; OOV → graceful fallback (no root)

OPTION B: DictaBERT sidecar (CC BY 4.0)
  + State-of-the-art accuracy
  + CC BY 4.0 (more permissive than AGPL)
  + Modern transformer architecture
  − Doesn't natively output root → +1–2d derivation heuristics
  − Higher infra cost (2-4 GB RAM)
  − Effort: 1.5–2 weeks

OPTION C: DictaBERT in-browser (transformers.js)
  + Fully offline once model cached → premium tier
  + No server cost, no opt-in privacy flow
  − 50–200 MB model precache (large for PWA)
  − transformers.js compatibility with DictaBERT untested
  − Same root-derivation challenge as B
  − Effort: 2–3 weeks (untested; high risk of integration surprises)

OPTION D: hspell direct sidecar
  + Smallest possible footprint (~30 MB Docker)
  + Same dictionary HebMorph uses
  − Lower-level C API, more wrapping needed
  − Effort: 0.5–1 week (saves nothing vs HebMorph since both use same dict)

OPTION E (fallback): Plan B + C from § 5 (manual + autocomplete + seed)
  − No auto-extraction
  − But: simplest, no infra change
```

### § 7.7 — Recommendation

**Ship Option A (HebMorph sidecar) in v3.2 Phase 9.4. Defer Option C (DictaBERT in-browser) to v3.3 as the "fully-offline premium" path.**

Rationale:
1. **Direct root extraction** — no derivation heuristics needed. Native dictionary output matches M10's needs precisely (`{root, lemma, binyan, pos}`).
2. **Best effort/quality ratio** — 0.5–1 week sidecar vs 1.5+ week DictaBERT setup with similar accuracy on the in-dictionary case where M10 needs it.
3. **Mature** — HebMorph + hspell are 10+ years in production via the Elasticsearch Hebrew analyzer; failure modes are well-understood.
4. **Graceful OOV fallback** — when HebMorph returns no root for a word, M10 UI defaults to manual entry (Plan B), and seeded dictionary (Plan C) helps autocomplete. **All three paths layer cleanly.**
5. **License-clean for us** — AGPL is fine for non-commercial. v3.3 DictaBERT in-browser path remains open if we later want fully-offline premium.

### § 7.8 — Phase 9.4 implementation impact (re-revised)

| Item | § 6 plan (Plan B+C only) | § 7 plan (Option A + retain Plan B+C as offline fallback) | Delta |
|---|---|---|---|
| Phase 9.4 scope | Manual root + binyan + seed dictionary | **Auto-extraction via HebMorph sidecar + opt-in consent + manual/seed as offline fallback** | Premium up |
| Phase 9.4 effort | 2.5–3.5 days | **5.5–7 days** (sidecar 3–5d + UI 2d + opt-in consent 0.5d) | +3–3.5 days |
| Phase 9.4 risk | Low | Medium (operational — sidecar uptime; mitigated by graceful manual fallback) | One step up |
| New deliverable: `/api/morphology/v1/analyze` endpoint | n/a | Stateless, opt-in, identical pattern to `/api/transliterate`. CONTRACTS_ANALYTICS-style privacy: no logging of submitted words beyond rate limit counters. | New |
| Roots dictionary seed (Plan C) | Yes (~100 entries, 0.5d) | **Retained** as offline fallback + autocomplete enrichment for OOV cases | Same |
| Direction 9 total effort | ~13–16.5 days | **~16–20 days** | +3 days, **still inside 4-week target** |

### § 7.9 — v3.3 follow-up paths (revised)

- **YAP→WASM Hebrew morphology** (originally planned v3.3): **lower priority now** — HebMorph sidecar already gives auto-extraction. WASM only matters if user explicitly wants offline. Promote to "nice-to-have v3.3+".
- **DictaBERT in-browser via transformers.js**: **new candidate v3.3 epic** — would replace HebMorph sidecar with fully-offline premium experience. Requires proof-of-concept first (transformers.js + DictaBERT untested combination).
- **HebMorph hardening for v3.2.x patch**: rate limiter, cache layer (Railway audio-cache pattern — cache morphology results by word hash), telemetry. Small follow-on items, not blockers for ship.

### § 7.10 — Acceptance criteria for Phase 9.4 (final)

- [ ] `/api/morphology/v1/analyze {word}` endpoint deployed; returns `{root, lemma, binyan, pos}` for in-dict words; `{root: null, ...}` graceful for OOV.
- [ ] HebMorph + hspell-data-files containerized; Dockerfile committed.
- [ ] Word-study template `root` field auto-fills via the endpoint (with loading indicator); manual edit always wins.
- [ ] Word-study template `binyan` field auto-fills for verbs.
- [ ] Opt-in consent banner explaining "word morphology lookup sends the word to the LinguistPro server (no logging beyond rate limits)" — disabled = manual + seed only.
- [ ] `roots` table seeded with ~100 entries (Plan C, retained from § 5) — used as offline fallback + autocomplete enrichment.
- [ ] All Plan B (manual entry) UX preserved — auto-extraction is enhancement, not replacement.
- [ ] No regression in M3 word-study template UX.

---

**Re-research bottom line:** AGPL unlock + premium-quality bias makes auto-extraction feasible in v3.2 via **HebMorph sidecar** (Option A). Net effort impact +3 days vs § 6 Plan B+C, total Direction 9 ~16–20 days (still within 4-week target). DictaBERT in-browser becomes the new v3.3 follow-up epic for fully-offline premium.
