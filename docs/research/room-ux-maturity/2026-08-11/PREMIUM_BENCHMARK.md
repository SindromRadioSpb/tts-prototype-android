# Premium libraries and learning readers — systematic benchmark

> Date: 2026-08-11
>
> Purpose: durable product foundation for the Reading Room, not a gallery of visual references
>
> Decision vocabulary: **Adopt** = take the principle directly; **Adapt** = reshape it for
> LinguistPro's Hebrew-learning and local-first constraints; **Reject** = do not import the pattern

## 1. Research question

What makes a library or learning reader feel premium and useful as the main place of study, and
which practices should LinguistPro adopt without becoming a clone, a content storefront, or an
overloaded learning-management system?

The comparison intentionally covers four archetypes:

1. **Language-learning readers:** LingQ, Beelinguapp, Readlang.
2. **Personal/premium libraries:** Apple Books, Libby.
3. **Knowledge and canonical corpora:** Sefaria.
4. **High-volume reading/learning workspaces:** Readwise Reader, O'Reilly Learning.

No product is treated as the universal winner. Each optimizes a different job. The useful output
is the combination of compatible principles, with explicit rejections where their business model,
content type, or data assumptions differ from LinguistPro.

Priority language in this document:

- **P0** — preserve trust/canonical behavior; a violation blocks any redesign release;
- **P1** — required for the first mature learner-facing release;
- **P2** — valuable premium capability after the shared foundation is stable;
- **P3** — later experiment or separate owner decision.

## 2. Evaluation framework

Each product is evaluated on the same dimensions:

| Dimension | Question for LinguistPro |
|---|---|
| Entry and return | Does the home surface resume learning or merely expose inventory? |
| Choice support | Can the learner tell which item fits level, time, interest, and state? |
| Information density | Can many textual items be scanned without empty cards or metadata noise? |
| Personal state | Are continue, finished, saved, recent, and progress recognizable and stable? |
| Retrieval | Are search, facets, tags, views, and taxonomy powerful without dominating the page? |
| Learning loop | Does reading feed vocabulary, review, comprehension, or a guided path? |
| Corpus identity | Are different content domains coherent without being visually identical? |
| Reader continuity | Does the library lead into and back from reading without a context break? |
| Trust | Are source, machine/owner authority, privacy, and missing data represented honestly? |
| Accessibility | Are text, target size, semantics, RTL, theme, and reduced-motion needs respected? |
| Complexity cost | What new state, model, moderation, or infrastructure would the pattern require? |

## 3. Cross-product synthesis first

Across the benchmark, the strongest recurring practices are:

1. **Home is a return surface.** Apple Books, Sefaria, Readwise, and O'Reilly all prioritize recent,
   current, saved, recommended, or profile-specific material over a raw catalog dump.
2. **Catalog and personal shelf are distinct concepts.** Libby explicitly separates Library,
   Shelf, and Tags. Readwise separates database location/status from saved filtered views.
3. **A short list is more useful than a huge rail.** Premium products preview a subset and provide
   “all,” filters, or a dedicated browse view. They do not instantiate hundreds of horizontal
   cards on a home shelf.
4. **Text-heavy inventory wants rows.** Platform guidance and products with dense textual content
   prefer scan-friendly lists; large tiles earn their space only through meaningful artwork,
   excerpt, or a featured recommendation.
5. **Progress is a retrieval signal, not decoration.** Continue/finished/history alter where an
   item appears. Readwise even distinguishes actual reading progress from the last scrolled
   location.
6. **Guidance is reasoned.** LingQ uses known/new vocabulary; O'Reilly uses skills and curated
   tracks; Sefaria uses taxonomy, schedules, and connections. “Recommended” without a visible
   reason is weaker.
7. **Advanced power is progressively disclosed.** Readwise offers deep query/filter capability,
   but home can contain only selected views. Sefaria moves tools into a passage resource panel.
8. **Learning features continue inside the reader.** Vocabulary, notes, translation, audio,
   quizzes, contextual references, and review derive from the reading act rather than becoming an
   unrelated dashboard.

These practices support a LinguistPro-specific thesis: the Reading Room should be a **learning
desk with a library behind it**, not a library catalog with learning controls scattered across it.

## 4. Product studies

### 4.1 Apple Books — calm return hierarchy and collections

Primary sources:

- [Read books in the Books app on iPhone](https://support.apple.com/en-ae/108759)
- [Set reading goals in Books on iPhone](https://support.apple.com/en-lamr/guide/iphone/iph6013e96f4/ios)
- [Apple HIG: Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)
- [Apple HIG: Collections](https://developer.apple.com/design/human-interface-guidelines/collections)

Observed model:

- Home separates current reading, personalized suggestions, and “Want to Read.”
- Library remains the full inventory and contains system/custom collections such as Finished.
- Reading goals and finished state exist, but can be disabled; motivation is supportive rather
  than mandatory.
- Apple's current HIG explicitly recommends rows/tables for textual information and collections
  for image-led content. It advises avoiding oversized rows by revealing detail after selection.

What to adopt:

- **P1 Adopt:** a calm single current/next item at the top; Library/Browse below it.
- **P1 Adopt:** Finished, saved, and custom groupings as retrieval/state views rather than badges
  repeated on every item.
- **P1 Adopt:** textual browse defaults to rows; image-based tiles require actual useful imagery.
- **P2 Adapt:** optional daily reading goal only after the core Room feels trustworthy. It should
  represent time/read acts, not reward opening or scrolling.

What not to copy:

- **Reject:** cover-store aesthetics without a real editorial cover system. Generated decorative
  covers would add visual inconsistency and provenance/quality work.
- **Reject:** entertainment-first recommendation language. LinguistPro needs “why this fits your
  Hebrew now,” not only “you may also like.”
- **Defer:** streaks and annual goals. They can turn a premium study space into a pressure loop and
  require reliable cross-device activity semantics.

LinguistPro adaptation: a single “Продолжить занятие” feature card and compact personal shelves,
then a dense textual library. The emotional calm is worth adopting; the retail bookshelf is not.

### 4.2 Libby — strict separation of catalog, shelf, and tags

Primary sources:

- [Navigating Libby](https://help.libbyapp.com/en-us/6011.htm)
- [Libby quick-start guide](https://help.libbyapp.com/en-us/6289.htm)
- [Smart tags](https://help.libbyapp.com/en-us/6253.htm)
- [Reading Journey](https://help.libbyapp.com/en-us/6257.htm)
- [Cross-device sync behavior](https://help.libbyapp.com/en-us/6137.htm)

Observed model:

- Navigation names five different jobs: Search, Library, Menu, Shelf, Tags.
- Library provides curated campaigns/guides and catalog browsing; Shelf contains active loans,
  holds, notices, and timeline; Tags contain learner/user-defined saved sets.
- Filters such as format and language can be pinned and persist while browsing.
- Smart tags arise from meaningful events such as borrow or sample.
- A Reading Journey groups progress, tags, notes, highlights, bookmarks, and history for a title;
  destructive reset explicitly warns that all of these will be removed.

What to adopt:

- **P1 Adopt:** distinguish “Browse all corpora” from “My learning shelf/state.” Do not mix corpus
  authority with personal state into one undifferentiated card wall.
- **P2 Adapt:** sticky/pinned filter preferences for expert users, but default mobile should remain
  compact and provide an obvious reset.
- **P2 Adopt:** treat a text as a learning journey whose progress, notes, vocabulary, media
  annotations, and saved state remain connected.
- **P2 Adapt:** event-derived smart sets should be few, understandable, and self-populating.

What not to copy:

- **Reject:** loan/availability/hold metaphors; LinguistPro's corpus does not have scarcity.
- **Reject:** five permanent navigation destinations on the current narrow Room shell. The mental
  separation is useful, but the exact tab count would increase navigation weight.
- **Reject:** device/card-specific sync semantics. LinguistPro must keep its existing local/cloud
  authority contracts rather than borrow Libby's account model.

LinguistPro adaptation: L0 becomes “Учиться” with Today/Continue; “Все тексты” is browse; saved and
finished become compact personal views. Tags remain a power feature behind one filter/view entry.

### 4.3 Sefaria — canonical depth, coherent taxonomy, and contextual tools

Primary sources:

- [Meet the Sefaria Library homepage](https://help.sefaria.org/hc/en-us/articles/18472380899484-Quick-Guide-Meet-the-Sefaria-Library-Homepage)
- [Structure of Sefaria](https://help.sefaria.org/hc/en-us/articles/24863556783900-Quick-Guide-The-Structure-of-Sefaria)
- [Reading history](https://help.sefaria.org/hc/en-us/articles/20235167969436-How-to-View-Your-Reading-History)
- [Library Resource Panel](https://help.sefaria.org/hc/en-us/articles/18472472138652-Quick-Guide-Meet-the-Sefaria-Library-Resource-Panel)
- [Using the Sefaria Library](https://help.sefaria.org/hc/en-us/categories/12721826687772-Using-the-Sefaria-Library)
- [Explore by topic](https://help.sefaria.org/hc/en-us/articles/20528374643740-How-to-Explore-the-Library-by-Topic)

Observed model:

- The home presents stable canonical categories with short explanations and universal search.
- Recently Viewed brings the user back to study; reading history can be disabled.
- Published Library texts, user-created Voices, and developer/API tools are separate but linked
  product spaces. This prevents creator/admin tools from overwhelming reading.
- Passage selection opens a contextual Resource Panel with translations, text information, table
  of contents, in-text search, related texts, topics, manuscripts, and external connections.
- Reader preferences explicitly support bilingual/monolingual layout, Hebrew vowels,
  cantillation/punctuation, font size, and translations.
- Topic pages distinguish curated notable sources with introductions from an exhaustive all-source
  list; AI-generated content is marked.

What to adopt:

- **P1 Adopt:** separate learning/reading from content creation and administration. Study Songs
  owner operations should not lead the learning surface; My Text management remains in Studio.
- **P1 Adapt:** native corpus taxonomy can retain strong identity below a shared learning header.
- **P1 Adopt:** recently viewed/continue is a first-class return path.
- **P2 Adapt:** the reader's existing context overlay should be framed as the coherent resource
  panel for morphology, translation, notes, examples, audio, and provenance.
- **P2 Adopt:** distinguish curated “start here/notable” selections from exhaustive browse.
- **P2 Adopt:** label machine/AI-derived content where it changes trust.

What not to copy:

- **Reject:** a category-first home as the only entry. LinguistPro knows personal learning state
  and should use it before showing periods/topics.
- **Reject:** exposing all reference tools at library-card level. Context tools belong after text
  or passage selection.
- **Adapt, not clone:** Sefaria's visual style is designed for canonical scholarship. LinguistPro
  should preserve Hebrew typographic dignity while adding explicit language-learning readiness.

LinguistPro adaptation: Ben-Yehuda's periods/authors stay deep and respected; the home first offers
Continue/Ready, then “Explore the library.” The Room's contextual learning panel becomes a
signature bridge between canonical reading and vocabulary acquisition.

### 4.4 Readwise Reader — dynamic views, bounded home, and truthful progress

Primary sources:

- [Filtered Views](https://docs.readwise.io/reader/docs/faqs/filtered-views)
- [Default Filtered Views](https://docs.readwise.io/reader/guides/filtering/default-views)
- [Reader basics and progress](https://docs.readwise.io/reader/docs/faqs)
- [Library configurations](https://docs.readwise.io/reader/guides/workflows/library-configuration)
- [Highlights, tags, and notes](https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes)

Observed model:

- One flat document database is exposed through query-backed saved views. Views can be named,
  pinned, counted, split by status, and selected for the home page.
- Defaults encode useful behavior: Continue Reading requires meaningful progress and recent open;
  Quick Reads and Long Reads use estimated minutes; Recently Added and Shortlist serve different
  decisions.
- Reader distinguishes furthest actual reading progress from last scroll location, avoiding the
  claim that a fast skim equals reading.
- Different library configurations support triage, shortlist, or classic later/archive workflows
  without duplicating documents.
- Advanced keyboard actions and tags exist, while only selected views need appear on Home.

What to adopt:

- **P1 Adopt:** home shelves are queries/views over canonical state, never duplicated collections
  of text records.
- **P1 Adopt:** Continue requires a meaningful start, not a single accidental open.
- **P1 Adapt:** distinguish learner progress from navigation position where current data can support
  it. Do not call the furthest scroll “learned.”
- **P2 Adapt:** Quick/short reading as a useful “I have 5–10 minutes” choice, derived only from real
  rows/audio duration and later personalized pace.
- **P2 Adapt:** allow a small set of default views first; user-configurable home is a later expert
  feature, not the first redesign scope.

What not to copy:

- **Reject:** expose a query language as the primary learner interface. `#tag` and advanced search
  may remain, but ordinary choices need direct controls.
- **Reject:** inbox-triage metaphors for curated corpora. Ben-Yehuda is not a backlog to process.
- **Defer:** multiple configurable workflow modes. They create settings and migration complexity
  before the shared Room grammar is stable.

LinguistPro adaptation: implement Today/Continue/Ready/Saved as derived views over existing
LocalDb/corpus state. Cap their previews. Later allow rearranging or pinning, but never create a
second source of truth.

### 4.5 LingQ — known-word state as the library's learning intelligence

Primary sources:

- [LingQ product/method overview](https://www.lingq.com/en/learn-english-online/)
- [About LingQ and known-word tracking](https://www.lingq.com/en/about/)
- [LingQ mobile reader support](https://www.lingq.com/en/ios-app-support/)

Observed model:

- The reader maintains known/learning word state across lessons, rather than treating each text as
  a disconnected document.
- Library content combines matching transcripts and audio; own content can be imported into the
  same learning environment.
- The product claims to guide learners toward content slightly above their current level.
- Sentence view combines sentence translation, audio, vocabulary, and small review activities.
- Progress and vocabulary created during reading feed later review.

What to adopt:

- **P0/P1 Preserve and expand:** familiar-word coverage is LinguistPro's strongest unique library
  signal and should become part of the normalized item grammar wherever evidence supports it.
- **P1 Adopt:** imported personal content and curated corpus content should feel like one learning
  system after selection, even when storage/provenance differs.
- **P1 Adopt:** recommendations need a visible “fit” explanation based on learner vocabulary,
  asserted level, length, and content constraints.
- **P2 Adapt:** sentence-focused study should connect to the existing context overlay/trainer, not
  introduce a competing reader mode without a separate decision.

What not to copy:

- **Reject:** turn every library card into a cloud of vocabulary statistics. One readiness line is
  enough; detailed coverage belongs in preview/details.
- **Reject:** automatic promotion of all unmarked words to known merely because a page was advanced.
  LinguistPro's state semantics must remain explicit and evidence-backed.
- **Reject:** indiscriminate color highlighting across the entire library. Color should carry a
  small stable number of meanings and remain accessible in light/dark/RTL.

LinguistPro adaptation: “≈84% знакомых слов · средне · 8 мин” is a decision aid, not a scorecard.
Ben-Yehuda can provide it now; My Texts and group corpora gain it only through the same validated
analysis contract, never through a cosmetic placeholder.

### 4.6 Beelinguapp — content-level fit and multimodal reading

Primary sources:

- [Beelinguapp product overview](https://beelinguapp.com/)
- [Beelinguapp FAQ](https://beelinguapp.com/faq)
- [About Beelinguapp](https://beelinguapp.com/about)

Observed model:

- Content is browsed by level and category and combines target text, translation, and native audio.
- Learners can hide translation, select words/phrases, add vocabulary to a glossary, use
  flashcards, and answer comprehension questions.
- The content promise spans stories, news, songs, and cultural material, while the learning tool
  vocabulary stays consistent.

What to adopt:

- **P1 Adapt:** level/category/audio are useful choice signals, especially for Study Songs and My
  Texts when asserted honestly.
- **P2 Adopt:** translation should be a confidence aid that can be progressively hidden rather than
  a permanent side-by-side dependency.
- **P2 Adapt:** comprehension check can become an optional post-reading action in selected curated
  texts, using existing training infrastructure and clearly authored/derived questions.
- **P2 Adopt:** multiple media/content types can share one learning grammar.

What not to copy:

- **Reject:** a bright entertainment feed full of category tiles; it would fight the literary,
  focused character of Hebrew reading.
- **Reject:** mandatory quizzes after every item. Reading should stay enjoyable and self-directed.
- **Reject:** treat parallel translation as a library-card feature. It belongs inside reading and
  preparation details.

LinguistPro adaptation: Study Songs should look like a first-class content type within the same
Room, with audio readiness and optional comprehension follow-up—not like a separate admin ledger.

### 4.7 Readlang — distraction-free reader and vocabulary continuity

Primary sources:

- [Readlang features](https://readlang.com/features)
- [About Readlang](https://readlang.com/about)

Observed model:

- The core reader is intentionally clean and supports fast inline word/phrase translation.
- Translated words become contextual flashcards; prioritization and spaced repetition connect
  reading to review.
- Users can import plain text or read a web page through a browser tool.
- Separate video reading combines transcription and synchronized media.

What to adopt:

- **P1 Preserve:** keep the reader calmer than the library; moving complexity out of cards must not
  move all of it into the reading canvas.
- **P1 Adopt:** actions taken while reading should create reusable vocabulary/review context.
- **P2 Adapt:** inline translation/context remains fast, but the current morphology and provenance
  model should stay richer than a simple dictionary popup.

What not to copy:

- **Reject:** make import the main Reading Room action. Studio remains the controlled acquisition
  and correction surface.
- **Reject:** assume every translated token should automatically become a review card. Learner
  intent and existing note/SRS semantics must decide.
- **Reject:** sparse reader aesthetics as the library design. Discovery needs denser information
  than the reading canvas.

LinguistPro adaptation: the Reading Room library decides what to read; the reader makes learning
effortless; the trainer resurfaces deliberately saved learning material. These are one loop, not
three competing products.

### 4.8 O'Reilly Learning — curated paths and mixed-format learning

Primary sources:

- [O'Reilly feature overview](https://www.oreilly.com/online-learning/support/features.html)
- [Online learning features](https://www.oreilly.com/online-learning/features)

Observed model:

- Profile/home consolidates recommendations, history, playlists, and live/on-demand content.
- Expert playlists and academies create curated paths through books, chapters, videos, and audio.
- Skill plans can begin with assessment and focus on identified gaps.
- Search spans formats and supports topic/publisher/rating filters and meaningful sorts.
- Team assignments expose progress to authorized coordinators.

What to adopt:

- **P2 Adapt:** curated “starting paths” through mixed texts and songs can become a distinctive
  LinguistPro feature once the shared corpus surface is stable.
- **P2 Adapt:** owner/teacher assignment can justify a recommendation in Study Songs (“назначено
  группой”), separate from algorithmic fit.
- **P3 Adapt:** a path may mix a text, song, vocabulary review, and comprehension activity without
  forcing them into one giant content card.

What not to copy:

- **Reject:** enterprise dashboard density, ratings, publisher facets, and team analytics in the
  learner's default Reading Room.
- **Reject:** assessment-driven personalized curriculum as part of this UI program. It requires a
  separate pedagogical model and owner decision.
- **Reject:** AI-generated playlists without source/level/provenance constraints.

LinguistPro adaptation: later add small editor/teacher-curated “маршруты” such as “первые пять
песен” or “короткая проза уровня X,” with a reason and completion state. The immediate redesign
should only create the shell where such a path can later live.

## 5. Pattern decision ledger

| Pattern | Source archetypes | Decision | Priority | Rationale / adaptation |
|---|---|---|---:|---|
| One dominant Continue/Start item | Apple, Sefaria, Readwise | Adopt | P1 | immediately turns inventory into a study home |
| Catalog separate from personal shelf | Libby, Readwise | Adopt | P1 | clarifies corpus versus learner state without new storage |
| Curated preview + exhaustive “All” | Sefaria, Apple, Readwise | Adopt | P1 | prevents 796-card shelves and improves decision quality |
| Compact rows for textual inventory | Apple HIG, Readwise | Adopt | P1 | raises density and scanability; large card only when earned |
| Personal familiar-word fit | LingQ | Adapt/expand | P1 | core LinguistPro differentiator; show only on real overlap |
| Shared learning grammar across media | LingQ, Beelinguapp, O'Reilly | Adopt | P1 | typifies texts and songs while preserving native metadata |
| Context resource panel | Sefaria, Readlang | Adapt | P1/P2 | build on existing overlay, do not add another reader |
| Advanced saved/filtered views | Readwise, Libby | Adapt | P2 | defaults first; expert pin/configure later |
| Short/long reading by time | Readwise | Adapt | P2 | only from actual duration/rows, later calibrated to user |
| Reading Journey | Libby | Adapt | P2 | progress + notes + vocab + media as one recoverable item |
| Curated learning paths | O'Reilly, Sefaria | Adapt | P2/P3 | teacher/editor paths after shared item identity exists |
| Optional comprehension check | Beelinguapp | Adapt | P2 | selected content only, no mandatory quiz wall |
| Goals/streaks | Apple and learning apps | Defer | P3 | only after honest activity semantics and opt-out |
| Huge cover grid | retail libraries | Reject | — | LinguistPro is text-heavy and lacks coherent cover assets |
| Expose every filter on first screen | power tools | Reject | — | progressive disclosure preserves expert power without noise |
| Admin controls before learner content | LMS/admin tools | Reject | P1 fix | separates authority from default study task |
| Automatic “known” from navigation | some language readers | Reject | — | violates evidence-backed vocabulary state |
| AI recommendation without reason | generic feeds | Reject | — | trust requires signal and provenance |
| Gamified tile feed | consumer language apps | Reject | — | conflicts with focused, literary product character |

## 6. Premium visual principles derived from the benchmark

Premium is not synonymous with more shadows. The visual system should express the product model:

1. **Hierarchy before decoration.** One feature action can use a tinted surface/elevation; browse
   rows remain quiet.
2. **Density proportional to information.** A text title plus three signals deserves a 68–88px row,
   not a 160–220px card. A card earns height through excerpt, artwork, recommendation rationale,
   or meaningful media.
3. **Subtle physicality.** Use a 1px neutral border, 2–3px state/corpus edge, and a low soft shadow
   only on featured/hover/focus states. Continuous glow is distracting and harms dark mode.
4. **Hebrew is the visual protagonist.** Hebrew title/excerpt receives dignified size and line
   rhythm; RU/EN support text stays compact. RTL changes reading order and alignment, not product
   priority.
5. **Fewer chromatic meanings.** Accent for primary action, state colors for progress/difficulty,
   neutral provenance. Never use color alone.
6. **Controls form a distinct layer.** Search/filter/admin controls should be recognizable yet not
   visually merge with content. On mobile, filter state collapses into one summary action.
7. **Motion confirms continuity.** Short transitions for filter/result and shelf expansion;
   respect reduced motion. No floating/ambient animation in a reading product.

## 7. What makes the synthesis uniquely LinguistPro

The benchmark products each own only part of the desired experience:

- Apple/Libby know calm personal library navigation but not Hebrew learning.
- LingQ/Readlang know vocabulary continuity but not LinguistPro's provenance and layered Hebrew
  morphology/context.
- Sefaria knows Hebrew canonical depth but does not optimize every choice for a second-language
  learner's vocabulary state.
- Readwise knows derived views but treats reading as a personal information workflow.
- O'Reilly knows curated paths but is enterprise/professional learning, not close reading.

LinguistPro's defensible combination is:

```text
canonical and personal Hebrew content
+ honest vocabulary-based readiness
+ local-first personal learning state
+ morphology/context/audio inside the reader
+ trainer continuity
+ explicit source and machine provenance
```

Therefore the target is not “Apple Books with Hebrew” or “LingQ clone.” It is a **Hebrew learning
atelier**: a calm place that recommends the next real text, explains why it fits, lets the learner
read with deep language support, and carries the resulting knowledge into review.

## 8. Risks and anti-pattern tests

Before importing any future pattern, ask:

1. Does it improve the next learning decision or only decorate inventory?
2. Can it be derived from canonical current state, or would it create a second truth?
3. Is the recommendation reason visible and defensible?
4. Does it work with no profile, incomplete translations, partial audio, and local-only texts?
5. Is it useful at 380px in RU and HE/RTL before desktop embellishment?
6. Does it preserve a calm reader and move management out of the study hierarchy?
7. Can it be bounded to 4–12 home choices and a paged browse result?
8. Does it remain understandable without emoji, color, hover, or a tooltip?
9. Does it add an ongoing editorial/moderation burden (covers, paths, quizzes, AI copy)?
10. Can it be removed or disabled without losing learner data?

If a pattern fails questions 1–4, it should not enter the immediate maturity program.

## 9. Research limitations

- This benchmark uses current official product/help documentation and public product pages, not
  authenticated paid-account walkthroughs for every competitor.
- Marketing claims are treated as descriptions of intended behavior, not independent proof of
  learning efficacy.
- Visual specifics change faster than the underlying interaction patterns; the durable decisions
  are recorded at the model/behavior level.
- No competitor analytics, private user data, or copied design assets were used.
- A later visual-prototyping slice should test two LinguistPro-native compositions with owner
  content fixtures; it should not reopen the product principles unless evidence contradicts them.
