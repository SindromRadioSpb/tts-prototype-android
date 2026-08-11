# READING ROOM UX MATURITY — OWNER DECISION PACKET

> Date: 2026-08-11
>
> Status: **OWNER DECISION REQUIRED — application implementation not authorized**
>
> Research baseline: `f3fc06430e180842daba8ef0892f6230138a1c09`; public Room `3.11.354`
> Evidence: [`docs/research/room-ux-maturity/2026-08-11/`](../research/room-ux-maturity/2026-08-11/README.md)

## 1. Decision in one paragraph

Approve **Option B — Learning-first typified Room**, executed in five bounded slices. The current
Room already has premium-grade learning capabilities, but they are presented as three inconsistent
inventories. B makes the first screen a study return point, gives all corpora one honest
readiness/progress/action grammar, changes text-heavy browse from large sparse cards to compact
rows, progressively discloses filters/admin, and bounds shelves/DOM. It preserves LocalDb,
provenance, protected-group authority, Studio management, reader/trainer behavior, and native
corpus taxonomy. Option A (visual polish only) is insufficient; Option C (new platform shell and
recommendation system) is disproportionate and should not be opened now.

## 2. Why this is a product maturity problem, not a CSS cleanup

- The anonymous Ben-Yehuda page creates all `796` ready cards. A live 380px run exposed about
  `6,097` DOM elements and an interaction at `313ms` INP; the layout/style work touched thousands
  of nodes.
- At 380px, My Texts delays its first card until roughly `600px` after identity, management,
  search, selects, smart filters, and facets. Study Songs owner content can start around or below
  the first `844px` viewport because five admin actions come first.
- Ben-Yehuda alone has first-class cold-start, known-word fit, difficulty, continue/finished, and
  saved/reading-list depth. My Texts and Study Songs share some underlying activity state but not
  the same decision surface.
- Study Songs does not participate in the common corpus registry/switcher and uses a separate
  visual/interaction grammar.
- Lighthouse accessibility is `0.93`, with verified text contrast down to `2.28:1`. Manual geometry
  found `818` visible targets below 24px in one dimension, dominated by 15px author actions nested
  inside button-like cards.
- Functional smokes pass. The missing contracts are hierarchy, density, semantics, bounded cost,
  and cross-corpus typification.

Full evidence: [CURRENT_STATE_AUDIT.md](../research/room-ux-maturity/2026-08-11/CURRENT_STATE_AUDIT.md).

## 3. What the premium benchmark says

The benchmark studied Apple Books, Libby, Sefaria, Readwise Reader, LingQ, Beelinguapp, Readlang,
and O'Reilly using current primary sources.

Durable lessons:

1. Home is a return/next-action surface, not the full catalog.
2. Catalog, personal shelf/state, and management are distinct jobs.
3. Short curated previews lead to bounded exhaustive browse.
4. Text-heavy inventory uses scan-friendly rows; large cards require meaningful media or a
   featured rationale.
5. Progress, finished, saved, and history change retrieval, not merely card decoration.
6. Learning recommendations explain fit through vocabulary, level, time, curation, or assignment.
7. Advanced filters and contextual tools remain powerful but are progressively disclosed.
8. The learning act continues from library → reader → vocabulary/context → trainer.

What should **not** be borrowed: retail cover walls without editorial assets, gamified tile feeds,
unexplained AI recommendations, mandatory quizzes, all filters on the first mobile screen,
enterprise admin dashboards, or automatic “known” state from page navigation.

Full research and decision ledger:
[PREMIUM_BENCHMARK.md](../research/room-ux-maturity/2026-08-11/PREMIUM_BENCHMARK.md).

## 4. Product direction

Working thesis: **Hebrew learning atelier** — a calm scholarly learning desk backed by a deep
library and a language laboratory.

The signature is a single defensible **Learning Compass** on the next text:

```text
Подходит сейчас · ≈84% знакомых слов · средне · около 8 минут
```

It adapts to the evidence:

- empty profile: `Хороший первый текст · короткий · частотная лексика`;
- teacher corpus: `Назначено вашей группе · аудио полностью · уровень ב`;
- unsupported analysis: omit the percentage, never display a cosmetic zero.

The visual language is warm-neutral and editorial: Hebrew typography as the protagonist, one
featured raised surface, compact quiet rows, a restrained 2–3px state/corpus edge, strong focus,
and no repeated glow. The requested stronger separation is achieved by hierarchy and state-aware
borders/elevation rather than a heavy shadow around every one of 115 cards.

Full direction: [PRODUCT_DIRECTION.md](../research/room-ux-maturity/2026-08-11/PRODUCT_DIRECTION.md).

## 5. Non-negotiable target contract

Every authorized corpus gets the same zones:

1. place/identity and common corpus switcher;
2. one next learning action or honest cold start;
3. up to three short personal/curated shelves;
4. one search + compact filter state + paged/windowed browse;
5. secondary management/provenance disclosure.

Every text item gets the same ordered grammar:

```text
identity → readiness → learner state → primary action → secondary details
```

Native differences remain: period/author/FTS for Ben-Yehuda; levels/tags/row-note search and Studio
ownership for My Texts; performer/assignment/audio coverage and protected authority for Study
Songs.

Full matrix: [CORPUS_PARITY_MATRIX.md](../research/room-ux-maturity/2026-08-11/CORPUS_PARITY_MATRIX.md).

## 6. Options

### A — Normalize visuals only

Restyle current cards and headers; add clearer borders/shadows; align spacing and typography.
Keep current hub, zone ordering, all visible filter chips, group admin placement, and full item
rendering.

- Strength: smallest diff and quickest visible improvement.
- Weakness: leaves the 796-card DOM, first-screen delay, nested interaction, missing parity, and
  storage-first hub intact.
- Estimate: one or two slices.
- Verdict: useful techniques, **not an acceptable final maturity outcome**.

### B — Learning-first typified Room (recommended)

Create a Learning Home, common corpus zones, one featured next action, shared compact rows,
progressive filter/admin disclosure, bounded shelves, and paged/windowed lists. Introduce a pure
presentation adapter over existing canonical state.

- Strength: solves the learner decision and density problem; uses existing capabilities; creates a
  distinctive market position; no new data authority is required for the core.
- Weakness: shared Room presentation changes need cross-corpus regression gates and staged owner
  acceptance.
- Estimate: five bounded implementation/release slices after approval.
- Verdict: **approve**.

### C — New multi-route learning platform

Create separate Home/Browse/Saved/Paths/Review/Admin routes, a new navigation shell,
user-configurable dashboards, and a recommendation/assignment service.

- Strength: maximum long-term flexibility.
- Weakness: high route/state/migration scope; can duplicate Studio, Room, Trainer, LocalDb, and
  protected-group truths; delays the immediate product quality win.
- Estimate: separate program/recon.
- Verdict: **reject for this program**.

## 7. Role decision

| Lens | A | B | C |
|---|---|---|---|
| R2 learning value | same dead ends, prettier | **clear next step and context-to-review loop** | risks information/workflow overload |
| R4 premium/mobile/RTL | partial polish | **solves hierarchy, density, semantics with 380/RTL gates** | large cross-route risk |
| R5 product/market | generic visual uplift | **distinct offline Hebrew learning fit** | expensive before proven need |
| R6 curator/library | inventory remains a dump | **curated preview + exhaustive browse** | more shelves/routes do not guarantee curation |
| R7 Hebrew editor | no recommendation honesty gain | **register/period caveats and curated on-ramp** | algorithm can outrun editorial authority |
| R8 graded reading | weak on-ramp | **fit ladder, fading scaffold, “what next”** | curriculum system outside current scope |
| R9 authority/provenance | unchanged inconsistency | **normalized asserted/derived/curated display** | new service risks opaque derivation |
| R11 do-no-harm | low code risk, poor outcome | **safe only in slices over existing truth** | high regression/second-truth risk |

## 8. Recommended bounded sequence

### B0 — Red gates and visual contract

Before changing product behavior:

- freeze current functional smokes;
- add initial-page work-item/DOM bound red test;
- add no-nested-interactive semantic test;
- add target-size, contrast, persistent-label, first-useful-content geometry checks;
- add 380px RU + HE/RTL and desktop reference fixtures for all three corpora;
- define normalized view-model unit fixtures for missing/partial/derived data.

No production UI change. Gate failure is expected until B1/B2.

### B1 — Density, semantics, and performance safety

- Ben-Yehuda ready shelf becomes a curated/ordered preview, maximum 12, with `Все 796` handoff.
- All-text destination uses existing 60-item page renderer or equivalent bounded list.
- Introduce a proper compact `TextItemRow`: real title link, sibling author/overflow actions.
- My Texts and Study Songs gain page/window bounds without changing canonical data.
- Fix in-scope contrast, 24px minimum/44px preferred targets, form labels/id/name, focus states,
  and meta description.
- No Learning Home or recommendation expansion yet.

### B2 — Learning Home

- Replace storage-first L0 hierarchy with Continue/Start feature, Today actions, short Ready shelf,
  then compact corpus browse entries.
- Derive all views from existing LocalDb/corpus state; no new table/store.
- Empty profile uses current honest cold-start data.
- Teaser moves out of real-corpus grammar.

### B3 — Common corpus shell

- One authorized switcher including dynamic group corpora.
- One zone order and shared progress/action vocabulary.
- Mobile filter drawer and active-filter summary; desktop compact filter bar.
- Study Songs owner tools move into an explicit management disclosure.
- My Texts niqqud and management move to secondary actions/details while consent/protection remains.

### B4 — Readiness and corpus adapters

- Ben-Yehuda maps current difficulty/coverage/provenance to the Learning Compass.
- My Texts maps asserted level, progress, media, and personal state; no familiar percentage until a
  validated analysis contract exists.
- Study Songs maps assignment/position, level, progress, performer, and audio coverage; TTS
  revision becomes provenance detail.
- Preserve native search/taxonomy paths and advanced expert retrieval.

### B5 — Continuity and release hardening

- Return/finish actions: next text, saved words/review, related or home using existing state.
- Full RU/HE/RTL/light/dark/keyboard/screen-reader/320–430px/desktop matrix.
- Performance repeat with cold/cached paths; service worker/update/version checks.
- Owner-live iPhone gate is distinct from automation and required before premium/GA claim.

## 9. B0/B1 exact initial allowlist

Implementation after approval should begin with a fresh packet and target-only allowlist:

```text
package.json                                      # test wiring/version only
public/library.html                               # Room-local shell/CSS/meta only
public/js/library-ui.js                           # bounded rendering/presenter/semantics
public/js/corpus-registry.js                      # presentation contract only
public/i18n/locales/ru.js
public/i18n/locales/en.js
public/i18n/locales/he.js
tests/i18n.locale-version.lock.json                # only with locale version work
tests/i18n.smoke.js                               # if locale keys change
tests/roomUxMaturity.test.js                      # new
scripts/premium/room-ux-maturity-browser-smoke.js # new
public/sw.js                                      # APP/CACHE bump only at release slice
```

Any need outside this list stops B1 for owner review.

## 10. Shared-contract stop list

Do not change during B0/B1 without a separate recon/decision:

```text
public/css/reader-core.css
public/css/reader-morph.css
public/js/morph-host.js
public/js/local-db.js
public/js/media-host.js
public/js/media-readiness.js
public/js/studio-*.js
db/**
migrations/**
server.js
ingest/**
media-acquisition/**
```

Also stop on:

- new progress, vocabulary, bookmark, recommendation, or saved-item store;
- schema/API changes for a presentation-only need;
- automatic vocabulary status changes from scroll/open;
- fabricated familiar-word %, time, level, translation, audio, or completion;
- changed group membership/privacy/backup authority;
- moved My Text editing/import into the Room;
- new AI recommendation/quiz/cover generation;
- shared Reader/Studio component extraction without a separate regression proof;
- deployment of multiple shared-surface programs in one release.

## 11. Quantitative acceptance gates

Final thresholds should be confirmed in B0 fixtures, but the maturity target is:

| Gate | Target |
|---|---|
| Initial Ben-Yehuda ready items in DOM | ≤12 preview items; no hidden 796-card rail |
| Initial total DOM | bounded and at least 60% below captured ~6,097, with no offscreen full-corpus construction |
| Long task on hub → corpus | no presentation task >50ms in the reference desktop/mobile trace, or documented bounded exception |
| Interaction | lab interaction consistently <200ms at 1× reference run; production field claim only with field evidence |
| 380px first useful content | next action visible and first full item/next meaningful shelf within first 844px |
| Mobile text item | normally 72–104px; exceptions require real excerpt/media information |
| Desktop text item | normally 72–88px; no full-width sparse ledger card |
| Shelf preview | 4–12 items with explicit All destination |
| Text contrast | WCAG AA: 4.5:1 normal, 3:1 large; zero in-scope Lighthouse contrast failures |
| Target size | WCAG 2.2 AA 24px/spacing floor; 44px preferred for frequent touch actions |
| Semantics | zero nested interactive controls; labels and accessible names present |
| Responsive | no overflow at 320/360/380/430/510/1280; RU and HE/RTL |
| Themes/motion | light/dark and reduced-motion evidence |
| Functional continuity | current My Texts, group corpus, reader, search, SRS/trainer, media and i18n gates green |

## 12. Evidence matrix per slice

| Evidence type | B0 | B1 | B2 | B3 | B4 | B5 |
|---|---:|---:|---:|---:|---:|---:|
| unit/DOM red-green | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| seeded 380 RU/HE | baseline | ✓ | ✓ | ✓ | ✓ | ✓ |
| desktop visual | baseline | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lighthouse/a11y | baseline | ✓ | ✓ | ✓ | ✓ | ✓ |
| performance trace | baseline | ✓ | ✓ | ✓ | ✓ | ✓ cold/cached |
| functional corpus smokes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| reader/trainer regression | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| production clean-profile | — | release | release | release | release | ✓ |
| owner iPhone/live data | — | optional geometry | UX acceptance | owner/admin | content truth | required closure |

Automation/fixtures must never be described as owner-live evidence.

## 13. Immediate versus backlog

### Immediate B program

- Learning Home and common corpus shell;
- compact row + one featured next action;
- bounded shelves/lists;
- progress/readiness/action grammar;
- mobile filter and admin disclosure;
- a11y/RTL/dark/performance maturity;
- return/finish continuity using existing state.

### Separate owner decisions later

- cross-corpus saved/bookmark identity;
- familiar-word analysis for currently unsupported personal/group items;
- individualized time estimates;
- curated multi-item paths and teacher assignment UX;
- optional comprehension checks;
- user-configurable/pinned home views;
- goals/streaks;
- editorial artwork/cover program;
- AI recommendation or content generation.

## 14. Owner decision requested

Recommended decision:

> **Approve Option B and authorize only B0 → B1 preparation/implementation packet.**
>
> B2–B5 remain stop/go decisions after evidence from the preceding slice. Reject C for this
> program. Use A's border/typography techniques inside B, not as the final scope.

No application code, version, service worker, production state, or owner learner data was changed
by this research packet.
