# Reading Room corpus parity and typification contract

> Purpose: define what must feel the same across corpora without pretending that a baked literary
> catalog, a learner's local texts, and a protected song corpus have identical data or authority.

## 1. Principle: normalize the learning grammar, not the storage model

The interface should present one stable grammar:

```text
Where am I? → What should I do next? → Is this text right for me?
→ What state is it in? → How do I browse further? → What secondary actions exist?
```

The corpus adapter supplies native data. A shared presenter turns available data into the same
ordered regions. Missing data stays absent or explicitly unavailable; it is never simulated.

The current `corpus-registry.js` already declares a “uniform retrieval contract,” but the visual
contract remains partial and group corpora are outside the registry. The target below extends that
contract from filters into the whole learner journey.

## 2. Current capability matrix

Legend: `✓` implemented and visible; `~` present but weaker/different; `—` absent; `n/a` genuinely
not applicable; `hidden` capability exists in underlying state but has no first-class surface.

| Capability / surface | Ben-Yehuda | My Texts | Study Songs | Current parity problem |
|---|---:|---:|---:|---|
| L0 hub entry | ✓ | ✓ | ✓ dynamic | group not in common switcher/registry |
| Common corpus switcher | ✓ | ✓ | — | independent breadcrumb for group corpus |
| Identity + honest count | ✓ | ✓ | ✓ | different geometry/vocabulary |
| Search title/metadata | ✓ | ✓ | ✓ | three different control compositions |
| Search inside text | ✓ FTS | ✓ rows/notes | — | honest native difference, not a defect by itself |
| Personal `#tag` syntax | ✓ materialized works | ✓ | — via UI | group has tag facets but not query syntax |
| Recent smart filter | ✓ | ✓ | ✓ | placement and counts differ |
| Struggling / mastered / new | ✓ | ✓ | ✓ | same state sets, different surface hierarchy |
| Notes/audio/SRS/template smart filters | ✓ | ✓ | ✓ | eight chips always consume mobile space |
| Native taxonomy facets | era/genre/lang | level/tags | status/audio/tags | correct differences, inconsistent composition |
| Recently opened sort | ✓ | ✓ | ✓ | labels/layout differ |
| Alphabetic sort | ✓ | ✓ | ✓ | correct |
| Native sort | ready/length | updated/topic | position/progress | correct differences |
| Continue grouping | ✓ cross/home | hidden in sort/card | card-only | no shared dedicated “continue” logic |
| Finished grouping | ✓ | hidden in smart state | status filter | recognition differs by corpus |
| Bookmarks/reading list | ✓ | — | — | saved-text concept is corpus-specific in UI |
| Cold-start “start here” | ✓ | — | — | user example confirmed |
| Intrinsic difficulty | ✓ sidecar | level only | level searchable, not card | no normalized readiness signal |
| Familiar-word estimate | ✓ when honest | — | — | strongest learning signal is corpus-bound |
| Length | rows/segments | raw progress row only | rows | different labels and placement |
| Estimated time | — | — | — | shared opportunity, must be derived honestly |
| Progress percentage | ✓ when materialized | — (row N only) | ✓ | no common progress grammar |
| Finished badge | ✓ | hidden/smart | progress label | inconsistent recognition |
| Audio presence/coverage | capability/status | media icon | exact N/N | different signal strength is justified |
| Translation/provenance | baked badges/details | learner-owned | n/a/own | presentation currently infrastructure-heavy |
| Primary action | read/continue | read/continue | open + optional continue | wording and placement differ |
| Secondary actions | author/list etc. | niqqud | open/share | nested and repetitive actions |
| Management/admin | separate | Studio links | five inline owner controls | group management overwhelms study |
| Pagination/windowing | result lists only | — | — | home/list scale is unbounded |
| Empty-state guidance | ✓ specialized | ✓ basic | ✓ basic | uneven coaching quality |

## 3. Target normalized corpus contract

Every corpus page must render these zones in this order. A zone self-hides only if it has no honest
content and no useful empty-state action.

### Zone A — place and identity

- Back to Learning Home.
- One corpus switcher containing all authorized corpora, including dynamic group corpora.
- Corpus title, compact description, count, authority/privacy marker if material.
- No repeated capability-badge cloud. One concise “what works here” disclosure is enough.

### Zone B — next learning action

- If there is a resumable item: one dominant Continue row/card.
- Else if a recommendation can be justified: one “Start with…” item and its reason.
- Else: a concise cold-start chooser using native difficulty/level/category.
- Owner/admin actions never precede this zone.

### Zone C — short personal shelves

Use at most three visible shelves from this ordered set:

1. Continue;
2. Ready for you;
3. Saved / bookmarked;
4. Recently added or assigned;
5. Finished, as a compact history entry rather than prime content.

Each shelf previews 4–12 items and ends in “Все”. No shelf is an unbounded corpus dump.

### Zone D — browse and search

- One search field.
- A compact filter summary/trigger on mobile; expanded filter bar on desktop.
- “Recommended / Recent / A–Я” as primary sorts. Native sorts live in the same control.
- Advanced smart filters and tag grammar remain available but default collapsed.
- Results use compact rows by default, with optional comfortable cards only where visual media adds
  information.

### Zone E — management and provenance

- Corpus settings, backup/import/export, participants, and Studio management are grouped in one
  secondary disclosure.
- Provenance that changes user trust remains visible; revisions, internal IDs, and implementation
  status move to details.

## 4. Target text-item schema

The shared UI should consume a normalized view model, not read each corpus's raw fields directly.
This is a presentation adapter; it must not become a second database or progress source.

```js
{
  corpusId, itemId, textKey,
  title, creator, secondaryIdentity,
  languageDirection, kind, artwork,
  learnerState: {
    state,                 // new | reading | finished
    resumeLabel,           // honest row/percent/time form
    progressValue,         // null when no defensible denominator
    lastOpenedAt
  },
  readiness: {
    levelLabel,            // asserted level or honest intrinsic band
    familiarityPct,        // null until real profile overlap exists
    confidence,            // asserted | derived-high | derived-soft
    caveats,               // names/archaic, incomplete audio, etc.
    reason                 // “подходит по знакомым словам”, “назначено группой”
  },
  media: {
    kind, coverage, humanOrTts
  },
  savedState, tags,
  primaryAction,
  secondaryActions,
  provenanceSummary
}
```

The adapter may return `null`; the UI must then omit the signal or say “оценка появится после
чтения,” depending on context. It may not convert absence into zero.

## 5. Shared row/card anatomy

### Compact row — default for browse/search

```text
┌ state edge ───────────────────────────────────────────────┐
│ Hebrew title                              [Continue 38%]  │
│ Creator / corpus context       level · ≈84% familiar · 8m │
│ progress line                                  [⋯]        │
└───────────────────────────────────────────────────────────┘
```

Rules:

- Entire row is not a fake nested button. Title is a real link; author and overflow are sibling
  controls with their own targets.
- One primary CTA, visually strongest only for the recommended/current item.
- Maximum two learning signals in the scan line; extra provenance/caveats go to disclosure.
- State edge (2–3px) may carry restrained corpus/progress color. It must not be the only state cue.
- Hover/focus uses border/elevation; resting rows use quiet separation.
- Mobile row target is at least 64px high; secondary touch actions target 44px where practical.

### Featured learning card — only for one next action

- Can be larger and warmer than browse rows.
- Shows why it is recommended, expected commitment, and direct Continue/Start.
- May include a restrained excerpt or artwork if it improves recognition.
- Never repeated 100 times; normally one per screen.

### Media tile — only when media is identity

Study Songs may use a thumbnail/waveform/accent artwork, but only if the image/audio state is real.
Without meaningful imagery it should fall back to the compact text row rather than a blank card.

## 6. Shared terminology

| Concept | Required learner wording | Avoid |
|---|---|---|
| Start | `Начать чтение` / `Начать занятие` | generic `Открыть` as sole primary label |
| Resume | `Продолжить · 38%` or `Продолжить · строка 17` | showing both Continue and Open equally |
| Finished | `Прочитано` | infrastructure status code |
| Difficulty | `легче / средне / сложнее` with explanation | unqualified CEFR if not asserted |
| Familiarity | `≈84% знакомых слов` | bare percentage with no referent |
| Audio | `аудио полностью / частично / нет` | `TTS r1` in the scan line |
| Personal source | `ваш текст` / `из Студии` | implementation/storage vocabulary |
| Protected source | `учебная группа · только участникам` | implying public availability |
| Derived layer | concise result + “как получено” disclosure | hiding machine provenance entirely |

## 7. Intentional corpus-specific differences

Uniformity is not sameness. These differences should remain:

| Corpus | Native value to preserve | How it fits the shared grammar |
|---|---|---|
| Ben-Yehuda | periods, authors, full-text/concordance, baked readiness | native facets and deep browse after shared next-action zones |
| My Texts | learner ownership, row/note search, Studio management, niqqud consent | owner badge + advanced search; preparation in overflow/detail |
| Study Songs | assignment/order, performer, audio coverage, protected membership | assignment reason + media signal; admin in secondary disclosure |

Do not force bookmarks if no stable saved-item contract exists for a corpus. Instead, first define
one cross-corpus saved-item identity contract or retain the feature only where it is truthful.

## 8. Placement matrix for target release

| UI region | Ben-Yehuda | My Texts | Study Songs |
|---|---|---|---|
| Featured next action | continue or justified i+1 | recent/struggling or last opened | assigned/order/recent item |
| Readiness line | band + familiar % + caveat | asserted level; familiar % only after supported analysis | asserted level + familiar % only after supported analysis |
| Native context | period / author | topic / source | performer / assignment position |
| Media line | human/TTS if present | own audio/video presence | exact coverage, human/TTS detail disclosed |
| Saved state | reading list/bookmark | only after shared identity contract | only after shared identity contract |
| Management | corpus info/provenance | “Управлять в Студии” | “Управление корпусом” owner disclosure |
| Browse mode | compact rows + period/author views | compact rows + optional dense grid | compact rows/media tiles |
| Scale | 12-preview + paged 60/window | paged/window 40–60 | paged/window 40–60 |

## 9. Honest readiness fallback ladder

The learner should see the best defensible signal available, in this order:

1. personal familiar-word coverage with real profile overlap;
2. asserted course/owner level;
3. corpus-derived intrinsic difficulty with a visible “approximate” explanation;
4. neutral length/estimated commitment if derivable from actual rows/audio duration;
5. no readiness badge, plus a local hint that recommendations improve after reading.

Never map a song's position number, TTS revision, tags, or raw line count into a fabricated
difficulty score.

## 10. Typification acceptance checklist

A new or existing corpus is not “integrated” until all are true:

- appears in the authorized common switcher and L0 browse surface;
- exposes a normalized next action or honest cold-start state;
- uses the shared compact row/featured-card anatomy;
- uses the same progress and primary-action vocabulary;
- supports shared recent/alphabetic retrieval plus native facets;
- keeps advanced filters and admin controls out of the first mobile learning viewport;
- bounds DOM output by preview/page/window rules;
- has RU and HE/RTL, light/dark, keyboard, screen-reader, and 380px evidence;
- preserves source authority, privacy, and no-fabrication rules;
- adds no second progress, saved-item, vocabulary, or recommendation truth.

## 11. Immediate versus backlog parity

### Immediate maturity program

- common switcher including group corpora;
- learning-home and corpus zone order;
- shared compact row + one featured next action;
- continue/progress/finished terminology;
- collapsed advanced controls on mobile;
- admin disclosure;
- DOM windowing/pagination;
- contrast, target, label, and nested-interaction fixes.

### Backlog after shared data contracts exist

- cross-corpus bookmarks/collections;
- familiar-word analysis for My Texts and group works not currently covered;
- estimated reading time calibrated to the individual;
- recommendation explanations using multiple behavior signals;
- user-configurable home shelves;
- artwork generation or editorial cover program.

This split prevents a visual redesign from silently inventing new learner truth or expanding into
an unbounded recommendation platform.
