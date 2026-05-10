# Hebrew Root Extractor — Research Output

**Phase 9.0 (Direction 9 — Premium Notes Redesign).** Output for mechanic M10 (root-aware notes) and M9 (niqqud-variant pinning) — see `docs/PREMIUM_NOTES_PLAN_v3_2.md`.

**Research budget:** 0.5 day. **Date:** 2026-05-10.

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
