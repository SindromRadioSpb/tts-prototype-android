# Typography, RTL and reflow audit

> Date: 2026-08-15  
> Source commit: `12dacd9a403ff8db2b7ad2dd20abf98e6c241386`; branch `main`; dirty worktree, runtime targets clean  
> Production: `https://linguistpro.kolosei.com/library.html`, served `3.11.388`  
> Evidence: `CODE`, `OWNER_LIVE_READ_ONLY`, `ISOLATED_AUTOMATION`, `EXTERNAL_PRIMARY`  
> Limitations: font appearance was inspected in Chrome/Windows only; no physical iOS/Android, screen-reader speech or full glyph/niqqud regression run.

## Current font contract

| Role | Current family | Assets / bytes | Finding |
|---|---|---:|---|
| RU/EN general UI | Apple/Segoe UI/Roboto/Helvetica/Arial system chain | 0 | fast and readable; platform metrics vary |
| Editorial RU/EN headings | Georgia, Times New Roman, serif | 0 | creates a strong reading identity; weights `760/780/850` are synthesized |
| Hebrew reading/table | Frank Ruhl Libre 400/500/700 | 63,404 B | self-hosted, niqqud-capable and already shared by Reader |
| Hebrew UI | Assistant 400/500/700 and Noto Sans Hebrew 400/500/700 | 46,228 B + 52,796 B | two overlapping sans families; selector ownership is not explicit |
| L0 Hebrew feature title | `Noto Serif Hebrew`, Times New Roman | missing | declared family has no local asset or `@font-face`; production falls back |

Total current WOFF2 payload is 162,428 B. Room preloads only Frank 400; all nine weights are precached by `sw.js`. `font-display: swap` is present. The local README records SIL OFL 1.1 and sources, but there are no per-font license files/checksums; a new dependency needs stronger provenance.

## Optical hierarchy findings

- L0's serif 26/32 px heading and 27/34 px feature title already establish a distinctive editorial hierarchy; replacing this with neutral utility sans would erase product character.
- The wide production view uses a good 1120 px content measure but many labels remain 10–13 px, so the UI feels optically small in a 1920 px viewport even though row titles are 16/21.6 px.
- Studio mixes Classic and v3 scales and uses many literal weights/sizes; broad typography normalization would be a separate refactor.
- Hebrew needs script-specific line-height and weight compensation. Treating `760` as a real available weight causes different synthetic bold behavior across Georgia, Frank and system Hebrew.
- Numeric counts benefit from existing `font-variant-numeric: tabular-nums`; it should become a shared numeric utility, not be applied to prose.

## Language and bidi

`public/i18n/index.js` correctly sets the document `lang` and `dir`. Reader tables post-tag Hebrew, Russian and Hebrew transliteration cells (`he`, `ru`, `he-Latn`). Trainer and Mentor are generally stronger: Hebrew prompts commonly carry both `lang=he` and `dir=rtl`, and Mentor uses `bdi` for mixed titles.

Room corpus/L0 code more often adds only `dir=rtl` after a Hebrew-regex test. In RU/EN UI, those titles inherit the wrong language even when their visual direction is correct. W3C guidance separates the contracts: `lang` identifies language and `dir`/`bdi` controls direction. Sources:

- https://www.w3.org/International/questions/qa-html-language-declarations
- https://www.w3.org/International/questions/qa-html-dir

Required rule:

- known Hebrew content: `lang=he dir=rtl`;
- unknown user/database label: `dir=auto`, plus a known `lang` only when metadata supplies it;
- mixed inline identity/count/date: isolate the user title in `bdi`, keep punctuation/count in UI direction;
- transliteration: `lang=he-Latn dir=ltr`;
- do not infer natural language from direction or Unicode alone for persisted content.

## Numbers and dates

Room and Mentor call bare `toLocaleString()` in counts and dates. That uses the browser locale, which can diverge from the selected application locale. Mixed HE dates/numbers can reorder punctuation around RTL titles.

V3 should freeze:

- one `Intl.NumberFormat(appLocale)` and `Intl.DateTimeFormat(appLocale, explicitOptions)` utility;
- tabular numerals for counts/progress, proportional numerals for prose;
- `bdi` around dynamic titles and time fragments when mixed;
- ISO dates only for machine/provenance details, localized dates for visible UI;
- no date/number change may alter canonical stored values.

## Reflow evidence

| Probe | Result | Classification |
|---|---|---|
| 380×844 RU | no horizontal overflow; literary tab visually ellipsized; header is tall | isolated automation |
| 380×844 HE/RTL | no overflow or sampled clipping; direction and arrows correct | isolated automation |
| WCAG 1.4.12 text spacing in RU and HE | no page overflow or sampled heading/button clipping | isolated automation |
| 720 CSS px proxy for 1440 at 200% | no overflow; long Hebrew feature title retained | isolated proxy, not physical zoom |
| owner 1920×911 Ben-Yehuda | 16 rows, 9–38 character Hebrew titles, stable 1054 px rows | owner-live read-only |
| owner My Texts DB | title range 10–96, mixed RU/HE, texts up to 1651 rows | owner-live read-only aggregate |

W3C reflow guidance relates 200% resize and avoidance of two-dimensional scrolling, while WCAG text spacing defines the tested 1.5/2/.12/.16 values: https://www.w3.org/WAI/WCAG22/Understanding/reflow and https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.

## Recommendation — V3

Immediate work adds **no new font dependency**:

- system UI for RU/EN;
- Assistant for HE UI where a deliberate Hebrew UI selector is present;
- Frank Ruhl Libre for Hebrew reading/editorial titles;
- Georgia/Times for RU/EN editorial display until a separately measured Cyrillic family is approved;
- remove the nonexistent `Noto Serif Hebrew` contract by mapping the feature title to existing Frank;
- use real 400/500/700 weights; reserve synthetic higher weights for backlog cleanup;
- retain only the currently justified preload, audit whether L0 actually needs it, and keep fonts self-hosted due COEP/CORP.

A future single editorial family such as Literata would add Cyrillic identity but lacks Hebrew; it is backlog and needs a measured subset, licence artifact, glyph/niqqud comparison and total font budget approval.
