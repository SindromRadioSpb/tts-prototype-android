# LinguistPro-native composition directions

> Date: 2026-08-15  
> Source commit: `12dacd9a403ff8db2b7ad2dd20abf98e6c241386`; branch `main`; dirty worktree, runtime targets clean  
> Production: `https://linguistpro.kolosei.com/library.html`, served `3.11.388`  
> Evidence: `OWNER_LIVE_READ_ONLY`, `CODE`, `HISTORICAL_AUTOMATION`  
> Limitations: these are evidence-backed composition specifications, not implemented mockups; historic screenshots are versioned automation fixtures, not current owner-live.

## Real fixture set

Both directions were tested conceptually against the same constraints:

- owner Ben-Yehuda: 16 current real rows, Hebrew titles 9–38 characters, 86–113 px row height;
- owner My Texts: 115 real entries; sampled titles 10–96 characters, mixed RU/HE, 1–1651 rows, progress and media variants;
- current 1920 desktop header/catalog and isolated 380 RU/HE L0;
- recent Reader/Trainer/My Texts/Studio screenshots for component density and cross-surface continuity.

No title/body is copied into this packet; fixtures are described only by aggregate stress dimensions.

## Direction E1 — Editorial calm, operational clarity

**Thesis:** LinguistPro is a reading-and-learning workspace whose hierarchy is carried by text; icons and depth quietly clarify action and state.

Composition:

- retain the current warm editorial feature at L0 and corpus next-action;
- LP monogram anchors the product, while a restrained book/Aleph mark differentiates Room;
- serif is limited to editorial titles and source identity; all controls/statuses use the UI sans contract;
- 1120 px desktop measure remains, but the header/due CTA align to that measure and important 10–12 px copy is optically strengthened;
- material rows stay flat/vertical; a 3 px logical source rail, title and one action carry hierarchy;
- Learning Compass and media/provenance remain compact text-first details, not colorful badges;
- empty/offline/partial/error panels share one quiet anatomy with surface-owned copy/action;
- motion is nearly invisible: 120–180 ms color/opacity/continuity, never spectacle.

Real-fixture evaluation:

| Fixture | Result |
|---|---|
| 96-character mixed My Texts title | wraps to two lines in the hero; rows use one-line ellipsis with the full accessible/title value; bidi-isolated title prevents count/action reordering |
| 1651-row personal text | row density does not scale with text size; count is tabular secondary metadata |
| 16 current Ben rows | flat vertical scan is preserved; icon replacement reduces multicolor noise without reducing information |
| media/progress variants | text + semantic icon/status token handles none/partial/full without badge collage |
| 1920 desktop | aligned max-width header/CTA restores rhythm while retaining readable central measure |
| 380 HE | editorial title uses existing Frank, controls use Assistant/system, logical arrows mirror |

Risk: editorial warmth can spread into utility/state components. Control: only `--learning-warm-*` composition tokens may use the warm palette; system status uses shared semantic tokens.

## Direction E2 — Learning desk

**Thesis:** LinguistPro is a rigorous language workbench, with manuscript material framed by a neutral operating surface.

Composition:

- neutral slate header and compact toolbar become the primary frame;
- editorial serif appears only inside text/document areas;
- cards flatten further and controls use a consistent 36/44 px utility rhythm;
- filters, status and provenance become more visible and structured;
- the LP monogram plus one manuscript accent replaces most warm depth;
- Studio, Trainer and Mentor align more quickly because utility primitives dominate.

Real-fixture evaluation:

| Fixture | Result |
|---|---|
| long My Texts catalog | strongest density and status scanning |
| Ben-Yehuda reading identity | loses some literary distinctiveness; looks closer to a generic admin/catalog system |
| Studio Classic/v3 | easier token adoption but risks validating existing dense toolbar clutter |
| 380 header | compact and efficient, but product/sub-brand character weakens |
| Trainer/Mentor states | clear operational grouping, though the learning experience feels less calm |

Risk: utility efficiency becomes the visual thesis and erases the reading moat. It also encourages a broader Studio/component rewrite than this lane authorizes.

## Decision

Recommend **E1**. It is one coherent thesis, not a collage: text is expressive; controls and states are quiet and exact. Direction A supplies its migration method and Direction C supplies verification discipline, but neither changes the character.

Exact V1 value: `V1=B_EDITORIAL_CALM`.

## Surface translation under E1

| Surface | Shared continuity | Local character retained |
|---|---|---|
| Library/L0 | tokens, focus, system icons, state panels | warm editorial lead and learning journey |
| Corpus/My Texts | row/action/status grammar | corpus identity, provenance and filters |
| Reader/Morph | type roles, icon controls, focus/motion | bilingual table and word-card semantics |
| Trainer | icons, status colors, control geometry | prompt/reveal/training channels |
| Mentor | state/consent panels and controls | evidence/provenance copy and API boundaries |
| Studio | shell icons/tokens/focus in staged allowlist | Classic/v3 workflow layouts and source/result hierarchy |
