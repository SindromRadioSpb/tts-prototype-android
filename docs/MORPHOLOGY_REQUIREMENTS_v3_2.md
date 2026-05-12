# Hebrew Morphology — v3.2 Phase 9.4 requirements

> **Status:** Approved by user 2026-05-12.
> **Companion docs:** `docs/research/HEBREW_ROOT_EXTRACTOR_RESEARCH.md` (Phase 9.0 evidence base), `docs/PREMIUM_NOTES_PLAN_v3_2.md` (Direction 9 plan), `docs/SRS_STRATEGY_v3_2.md` (parallel scope-doc pattern).
> **Approval signature:** User 2026-05-12 ("Подтверждаю. Стартуй оформление документа."). Implementer: Claude Opus 4.7 (1M context). Branch: `phase-9-3-5-foundation-reinforcement` → next phase branch `phase-9-4-morphology`.

## 1. Decision

**LinguistPro v3.2 ships Hebrew morphology as a fully local, offline-first, in-browser layer.** No Railway sidecar. No JVM on the user's machine. No installer. Same compute model as a static asset — the dictionary is generated once at build time from hspell-data-files and shipped as a binary-packed lookup index over Service Worker cache.

Why this beats both Railway-sidecar and local-JVM-sidecar:
- **Cost** — zero ongoing infra, scales with user count for free.
- **Privacy** — Hebrew words being analyzed never leave the device.
- **Latency** — < 1 ms hashmap lookup vs 50-200 ms HTTP round-trip.
- **Reach** — works identically on PC desktop, Android Chrome, iOS Safari, PWA standalone.
- **Quality** — uses the SAME dictionary data (hspell-data-files, ~250K word forms) that HebMorph wraps, just queried directly without the HTTP layer.

The trade-off is a one-time ~5-7 MB download per device on first morphology use. Cached by Service Worker; subsequent loads are instant.

## 2. The 17 requirements (load-bearing)

| # | Requirement | Why it matters |
|---|---|---|
| 1 | Runtime must be cloud-free by default. | Defining premium positioning of v3.2 morphology layer. |
| 2 | No Railway morphology sidecar in v3.2 unless explicitly added later as an optional fallback (Tier 4). | Cost + privacy + complexity reduction. Tier abstraction in §3 keeps the door open without committing. |
| 3 | Generate the dictionary at build time from HebMorph/hspell data (we use hspell directly — HebMorph is a Java wrapper around the same data files). | Build-time isolation. Runtime never depends on hspell binaries or JVM. |
| 4 | **Store multi-analysis entries, not only one best result.** | Hebrew is structurally ambiguous: "ספרים" → books OR barbers; "אחד" → one OR united. A flattened single-best dictionary destroys premium UX (user picks the right analysis in template form). |
| 5 | Preserve `root`, `lemma`, `binyan`, `pos`, `source`, **and `rank`** (NOT "confidence" — hspell is dictionary-based, not statistical; `rank` is the order hspell emits analyses, typically most-likely first). | Fields the word_study template + future deep features will consume. `rank` is the honest hspell signal. |
| 6 | Add `heb_morphology.meta.json` with provider, version, license, entry count, build commit hash, hspell-data-files version, and dictionary file checksum (SHA-256). | Provenance + reproducibility audit. We can prove what was shipped and verify integrity at runtime. |
| 7 | Lazy-load dictionary only when word-study morphology is first needed (NOT on app boot). | Keeps cold-load fast; users who don't open word_study templates pay no morphology download cost. |
| 8 | Cache via Service Worker for offline use. Cache-first strategy; revalidation by `meta.json` version. | Once cached, fully offline. SW already used for app shell + audio cache; same pattern. |
| 9 | Manual user edits always override automatic morphology. The dictionary is a suggestion, never a constraint. | Premium hygiene. Auto-fill is a hint, not a lock. Especially important for OOV / proper nouns / slang. |
| 10 | If the dictionary is unavailable (failed fetch, quota exceeded, cleared cache, build-disabled), the app must continue with seed autocomplete + manual input. | Graceful degradation. No app feature regresses because morphology is missing. |
| 11 | Add Settings status: "Ready offline / Not downloaded / Update available / Clear cache". User-visible state machine for the dictionary lifecycle. | Trust signal — user sees what's installed, can flush, can verify version. |
| 12 | Smoke test suite with ≥30 representative cases: each of 7 binyanim verb conjugations, regular + irregular nouns, adjectives, ambiguous forms (≥3), prefix-attached forms (≥3 prefixes), niqqud-variants (≥3), OOV (≥3), manual override (≥3). | QA contract. If any case regresses on a future build, CI catches it. |
| 13 | Provider abstraction kept open for future hspell-WASM, DictaBERT-in-browser, optional cloud provider. Runtime layer reads from `IMorphologyProvider` interface; the current local-dictionary provider is one of N possible implementations. | Architectural insurance. Tier 3 (DictaBERT) and Tier 4 (cloud) slot in without rewriting the consumer. |
| 14 | Build-time deterministic regeneration. `npm run build:morphology` is idempotent: bit-by-bit identical output when run against the same hspell-data-files commit. Checksum in meta.json validates this. | Year-1 maintenance — we MUST be able to reproduce the shipped dictionary exactly to audit a specific analysis or fix a generation bug. |
| 15 | Word normalization invariant. Build-time and runtime use the SAME normalization function. Pipeline: `NFC Unicode → strip niqqud → final-letter mapping (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ)`. Documented as a contract; one canonical implementation shared between Node build script and browser runtime. | Classic Hebrew NLP pitfall: same word in 5 surface forms. Without a shared canonicalizer, lookup is non-deterministic. |
| 16 | Prefix segmentation captured at build time. hspell's enum exposes all prefix-attached forms (ב/ל/מ/ה/ו/ש/כ combinations). The build script enumerates and stores them — NOT just bare lemmas. | Otherwise the user types "בספר" (in-the-book) and gets null. Hebrew is heavily prefix-attached; missing this kills the premium feel immediately. |
| 17 | Privacy invariant — morphology lookups NEVER emit events to the analytics store. The words a user analyzes are NOT recorded, not even in research-mode aggregates. Only opt-in counter `morphology_lookup_total` (no word content, no shape, no length) may be emitted if research-mode wants a mastery proxy. | The whole premise of "local-first" is privacy. Burning that for the sake of our own analytics defeats the architecture. |

## 3. Tier architecture (load-bearing for #13)

```
┌───────────────────────────────────────────────────────────────┐
│  Tier 1 — Local pre-computed dictionary       (v3.2 default)  │
│    public/morph/heb_morphology.bin   ~5-7 MB gzip             │
│    public/morph/heb_morphology.meta.json                      │
│    Provider: LocalDictionaryMorphologyProvider                │
│    Offline-capable, zero cost, < 1 ms lookup                  │
├───────────────────────────────────────────────────────────────┤
│  Tier 2 — Manual + autocomplete + seed dict   (v3.2 fallback) │
│    Seeded ~100 roots in `roots` table (migration 027)         │
│    User-added roots merge via UNION                           │
│    Provider: SeedAutocompleteMorphologyProvider               │
│    Always-on. Used when Tier 1 is unavailable OR for OOV.     │
├───────────────────────────────────────────────────────────────┤
│  Tier 3 — DictaBERT in-browser via transformers.js  (v3.4+)   │
│    50-200 MB precache, INT8 inference                         │
│    Provider: DictaBertInBrowserMorphologyProvider             │
│    Opt-in toggle: "🔬 Deeper morphology analysis"             │
├───────────────────────────────────────────────────────────────┤
│  Tier 4 — Optional cloud provider                  (v3.4+)    │
│    Opt-in only; explicit consent banner                       │
│    Provider: CloudSidecarMorphologyProvider                   │
│    For users without device cache or wanting fresh corpus     │
└───────────────────────────────────────────────────────────────┘
```

Runtime resolution (v3.2):

```
analyze(word):
  result = Tier1.analyze(word)                # local dict
  if !result.length:
    result = Tier2.analyze(word)              # seed + user roots
  return result || []
```

Future (v3.4+) — same call site, more tiers behind the provider chain:

```
analyze(word):
  for provider in user.enabledProviders:
    result = provider.analyze(word)
    if result.length: return result
  return []
```

## 4. Data model — multi-analysis entries

Each dictionary entry is a list of analyses (preserving #4):

```typescript
interface MorphologyAnalysis {
  root: string | null;        // 3-letter Hebrew root (no niqqud), e.g. "שלם"
  lemma: string;              // Canonical dictionary form, e.g. "שלום"
  binyan: string | null;      // One of: pa'al, nif'al, pi'el, pu'al, hif'il, huf'al, hitpa'el. null for non-verbs.
  pos: string;                // POS tag: noun, verb, adj, adv, prep, conj, prn, num, intj, prefix, other
  source: string;             // "hspell-1.4" | "seed" | "user" | "dictabert" | ...
  rank: number;               // 0-indexed; 0 = hspell's most-likely first analysis
  surface: string;            // The actual surface form this analysis matched (may differ from query if prefixes attached)
  prefixes?: string;          // If prefix-attached, the prefix(es) stripped (e.g. "ב" for "בספר")
}

interface MorphologyEntry {
  query: string;              // Normalized lookup key (see §5 normalization)
  analyses: MorphologyAnalysis[];   // 1..N, in rank order
}
```

Wire format (binary or compact JSON; see §6) preserves all fields. No flattening.

## 5. Normalization contract (#15)

**Function:** `normalizeHebrew(input: string): string`

```
1. Unicode NFC normalize
2. Strip combining niqqud marks (U+05B0..U+05BC, U+05BD..U+05C7)
3. Strip cantillation marks (U+0591..U+05AF)
4. Strip ZWJ/ZWNJ/RLM/LRM if present
5. Map final-letter forms to base: ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ
6. Trim whitespace
7. Return as-is (no case folding — Hebrew has no case)
```

Build script: `scripts/morph/normalize.js` (Node).
Runtime: imported by browser → `public/morph/normalize.js` (or inline in index.html for v3.2).

**Acceptance test (must pass identically in both environments):**
- `normalizeHebrew("שָׁלוֹם") === "שלום"`
- `normalizeHebrew("שָׁלֹם") === "שלום"` (different niqqud → same key)
- `normalizeHebrew("ספרים‎") === "ספרים"` (LRM stripped)
- `normalizeHebrew("ספרים") === "ספרים"`
- `normalizeHebrew("מסך") !== normalizeHebrew("מסכ")` — wait, this is wrong: ך final → כ base means "מסך" → "מסכ" and equals "מסכ". Documented behavior: final letters CONFLATE for lookup. Correct.

## 6. Wire format

**Decision:** compact JSON in v3.2, gzipped by HTTP server (Railway default sends `Content-Encoding: gzip` for `.json`).

```json
{
  "v": 1,
  "entries": {
    "ספרים": [
      {"r":"ספר","l":"ספר","b":null,"p":"noun","s":"hspell-1.4","k":0,"u":"ספרים"},
      {"r":"ספר","l":"ספר","b":null,"p":"noun","s":"hspell-1.4","k":1,"u":"ספרים","x":"barbers"}
    ],
    "בספר": [
      {"r":"ספר","l":"ספר","b":null,"p":"noun","s":"hspell-1.4","k":0,"u":"ספר","f":"ב"}
    ]
  }
}
```

Short keys: `r=root`, `l=lemma`, `b=binyan`, `p=pos`, `s=source`, `k=rank`, `u=surface`, `f=prefixes`, `x=gloss_hint` (optional).

Estimated size: ~250K entries × ~2-3 analyses avg × ~80 bytes/analysis = ~50 MB raw JSON → ~6-8 MB gzipped. Within target.

**Future provider** can use SQLite-WASM if memory becomes a concern on iOS Safari (50 MB quota). Provider abstraction (#13) accommodates this.

## 7. meta.json schema

```json
{
  "format_version": 1,
  "provider": "local-hspell-prebuilt",
  "data_provider": "hspell-1.4 (hspell-data-files)",
  "data_provider_license": "AGPL-3.0",
  "data_provider_copyright": "Nadav Har'El & Dan Kenigsberg, 2000-2013",
  "entry_count": 247831,
  "analysis_count": 612944,
  "build_commit": "<SHA of LinguistPro commit that ran the build>",
  "build_timestamp": "2026-05-XX",
  "hspell_data_version": "<hspell-data-files commit hash>",
  "dictionary_sha256": "<SHA-256 of heb_morphology.bin>",
  "normalization_version": 1
}
```

Runtime fetches `meta.json` first to decide whether to use cached binary or re-download.

## 8. Settings UX (#11)

In Settings panel → new section "🔤 Морфология иврита":

```
┌─────────────────────────────────────────────────────┐
│ 🔤 Морфология иврита                                │
│                                                     │
│ Статус: ✅ Готова к работе offline                  │
│ Версия словаря: hspell-1.4 (247 831 слов)           │
│ Размер кеша: 6.4 MB                                 │
│                                                     │
│ Последнее обновление: 2026-05-12                    │
│                                                     │
│ [Обновить словарь]  [Очистить кеш]                  │
└─────────────────────────────────────────────────────┘
```

States:
- `not_downloaded` — "📥 Словарь будет загружен при первом обращении (~6 MB)"
- `downloading` — "⏳ Загрузка словаря... (3.2 / 6.4 MB)"
- `ready` — as above
- `update_available` — "🔄 Доступна новая версия словаря (v2 → v3)"
- `error` — "⚠️ Ошибка загрузки. Работают только seed-словарь + ручной ввод."

## 9. Provider interface (#13)

```typescript
interface IMorphologyProvider {
  readonly id: string;                    // "local-hspell-prebuilt", "seed-autocomplete", ...
  readonly displayName: string;           // i18n key for Settings panel
  readonly version: string;
  readonly isOffline: boolean;

  isReady(): boolean | Promise<boolean>;
  ensureReady(): Promise<void>;           // Triggers download/init if needed
  analyze(word: string): Promise<MorphologyAnalysis[]>;
  getStatus(): MorphologyProviderStatus;
  clearCache?(): Promise<void>;
}
```

The morphology subsystem entry point `analyzeWord(word)` walks the configured provider chain in order; first non-empty result wins.

## 10. Smoke test minimum (#12, expanded)

Test cases live in `public/db/morphology-test.html` (analogous to `notes-v2-test.html`). Must include:

| Category | Cases | Acceptance |
|---|---|---|
| **Verb conjugations × 7 binyanim** | ≥1 sample per binyan: `שמר/נשמר/שימר/שומר/השמיר/הושמר/השתמר` | Each returns ≥1 analysis with correct `binyan` |
| **Regular nouns** | `ספר`, `בית`, `יום`, `שנה`, `איש` | Each returns analysis with `pos: "noun"` and correct root |
| **Irregular nouns** | `אנשים` (plural of `איש`), `ימים` (plural of `יום`) | lemma resolves to singular root |
| **Adjectives** | `גדול`, `קטן`, `יפה` | `pos: "adj"` |
| **Ambiguous forms** | `ספרים` (books / barbers), `אחד` (one / united), `יורה` (he shoots / first rain) | ≥2 analyses returned |
| **Prefix-attached** | `בספר`, `לבית`, `מהבית`, `ושלום`, `שכאשר` | `prefixes` field populated, `surface` is the bare form |
| **Niqqud variants** | Same word with 3 different niqqud sets → same lookup result | Normalization invariant |
| **OOV (out-of-vocabulary)** | Proper noun `דנילו`, modern slang, English transliteration `קומפיוטר` | Returns `[]`; Tier 2 falls back to seed/manual |
| **Manual override** | After auto-fill, user edits root → save → reload → user value preserved | Manual wins per #9 |

Total: 30+ cases. Run on every CI build.

## 11. License obligations

- **hspell-data-files** is AGPL-3.0. We redistribute the derived dictionary (a transformation of the source data files).
- LinguistPro is non-commercial open-source — AGPL-3.0 is compatible with our license stack.
- We add to a project-root `NOTICE.md` (creating if absent):
  - Acknowledgement: "Hebrew morphology data derived from hspell-data-files (AGPL-3.0), © Nadav Har'El & Dan Kenigsberg, 2000-2013. http://hspell.ivrix.org.il/"
  - Note that the `heb_morphology.bin` artifact carries through the AGPL-3.0 obligation: anyone receiving it must be able to obtain the underlying source data files.
- `meta.json` carries the same license string at runtime (#6).

## 12. What we're explicitly NOT doing in v3.2

- No HebMorph JVM container.
- No Railway sidecar service for morphology.
- No DictaBERT integration (deferred to v3.4 Tier 3).
- No hspell-WASM (deferred — pre-computed dict supersedes it for v3.2).
- No POS-tagging beyond what hspell emits per-word (no sentence-level disambiguation; sentence context is a future epic).
- No automatic OOV resolution. OOV words fall to Tier 2 (manual / seed).
- No real-time dictionary updates (rebuild + redeploy is the update path).

## 13. Implementation roadmap — Phase 9.4 sub-phases

| Sub | Work | Effort | Dependencies |
|---|---|---|---|
| **9.4.A** | Roots seed (~100 entries) → `docs/HEBREW_COMMON_ROOTS_SEED.json` + migration 027 (`roots` table populate) | 0.5d | none |
| **9.4.B** | Word-study UI: live autocomplete on `root` field (merged seed + user-added). Binyan dropdown polish (7 patterns + "other"). | 0.5d | 9.4.A |
| **9.4.C-local** | Build pipeline: `scripts/morph/build-morphology.js` — install hspell deps + iterate hspell dictionary + emit `public/morph/heb_morphology.bin` + `meta.json`. Includes normalization, prefix segmentation, multi-analysis storage. Idempotent. | 2.5-3d | none (parallel to 9.4.A/B) |
| **9.4.D** | Runtime morphology subsystem: provider abstraction + `LocalDictionaryMorphologyProvider` + lazy fetch + SW caching + word-study auto-fill + manual override + Settings panel | 1.5-2d | 9.4.C-local, 9.4.B |
| **9.4.E** | Privacy event guard (#17), smoke test suite (#12, ≥30 cases), i18n × 3, onboarding update, CHANGELOG, smoke deploy, user-side checklist | 0.5-1d | all above |
| | **Total** | **5.5-6.5d** | |

Branch: `phase-9-4-morphology` (new, fork from `main` after Phase 9.3.5 close at `dd478f4`).

## 14. Approval signature

- User confirmation: 2026-05-12 — "Подтверждаю. Стартуй оформление документа."
- 17-point scope locked. Modifications require explicit user reapproval; any future addition / removal references this doc as the baseline.
- Implementer: Claude Opus 4.7 (1M context).
- This document governs morphology-related decisions for v3.2 and the architectural framing of v3.4 Tier 3/4.
