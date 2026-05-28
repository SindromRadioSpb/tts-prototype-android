# Chapter 3 — System Design

> **Status.** DRAFT COMPLETE (sequential drafting per established cadence 2026-05-22).
> **Target length.** ~12 pages (BRIEF §3 range 10–15).
> **Bilingual workflow.** EN canonical for thesis submission; RU mirror at `thesis/03_system_design.ru.md` for author comprehension. Sync invariant per `docs/THESIS_BILINGUAL_WORKFLOW.md`.
> **Glossary.** `thesis/GLOSSARY.md`.
> **Sources.** `docs/ULPAN_RESEARCH_PLAN_v3_2.md §2 + §5`, `docs/PRODUCT_COHESION_PLAN_v3_4.md`, `docs/PREMIUM_RELEASE_PLAN_v3_3.md`, `docs/SMART_LEARNING_GRAPH_ROADMAP_v3_6.md`, `docs/MOBILE_UX_REDESIGN_PLAN_v3_7.md`, `docs/MORPHOLOGY_REQUIREMENTS_v3_2.md`, `docs/PREMIUM_NOTES_PLAN_v3_2.md`, `docs/TEXT_CARD_PLAN_v3_2.md`, `docs/OPFS_MIGRATION_PLAN.md`, `docs/PILOT_READINESS_GATE_v3_6.md`, `docs/SRS_STRATEGY_v3_2.md`, `docs/CLAUDE.md`, `README.md`, and the codebase itself.
> **Stylistic conventions.** Academic "we"; APA 7 citations; `[TODO: cite X]` markers.
> **Last updated.** 2026-05-22 (draft complete).

---

## 3.1 Introduction and Architectural Philosophy

This chapter describes the LinguistPro system as it exists at the time of the empirical study reported in Chapters 5–6: a privacy-preserving, offline-first, open-source workspace for Hebrew language learning, deployed as a Progressive Web Application with optional research-mode aggregation. The chapter is organized to make the architectural decisions of Chapter 4 (the privacy-preserving research-mode) and the methodological choices of Chapter 5 (the empirical study) intelligible against the broader system in which they sit.

The architecture is shaped by three philosophical commitments documented in the project's README and across its planning documents: **(i) data sovereignty** — the user's library, audio cache, notes, and progress live in the user's browser, not on a remote server; **(ii) Hebrew-as-first-language**, not as a localization afterthought — typography, RTL rendering, niqqud, and morphology are treated as primary product affordances; and **(iii) iterative refinement against real pedagogical observations** — the system evolved across versions 3.0 through 3.7 in response to identified ulpan-learning friction points rather than from a single up-front specification.

We describe these commitments and their architectural consequences in §3.3, the resulting domain architecture in §3.4, and the integration of the research-mode subsystem in §3.5. UI architecture (§3.6), data architecture (§3.7), and build / deployment (§3.8) close the chapter.

## 3.2 System Evolution: v3.0 → v3.7

LinguistPro's current form is the result of seven major version cycles, each addressing a specific pedagogical or architectural concern identified through iterative use. We summarize the evolution because the system was not designed up-front — the path itself is part of the contribution.

- **v3.0 (Offline-first migration, 2026-05-08).** The system migrated from a server-mediated storage model to OPFS (Origin Private File System) + SQLite WebAssembly, completing what is internally called Phase 6 of the OPFS migration plan [TODO: cite `docs/OPFS_MIGRATION_PLAN.md`]. After v3.0, stateful server endpoints became `410 Gone`; the user's library, audio, notes, and SRS state lived entirely in the browser. The privacy posture of Chapter 4 inherits directly from this migration: the research-mode is an architectural exception to a "no server state" norm, not a default.

- **v3.1 (Premium polish).** Audio handling, premium Hebrew typography (three self-hosted fonts), and RTL stability across mixed-content rows. The CSS surface stabilized as a ~39,000-line `public/index.html` with documented pitfalls (the `button { width: 100% }` mobile override; the mobile-first `@media` block ordering against component CSS) recorded in `docs/CLAUDE.md`.

- **v3.2 (Mega-release: Premium Notes + Text-card + Research-mode, 2026-05-13).** Three coordinated directions: polymorphic typed-graph notes (Direction 9), a three-mode text-card sharing system (Direction 10: Mode A bulk builder / Mode B peer-share via lightweight JSON / Mode C curator request), and the opt-in research-mode (Direction 11). The research-mode shipped architecturally complete (Direction 11B closed 2026-05-13) and is described in detail in Chapter 4. Morphology shipped at 34K stems / 68K analyses with the full 250K dictionary deferred to a later patch.

- **v3.3 (Master plan + admin polish).** Master plan `docs/PREMIUM_RELEASE_PLAN_v3_3.md` consolidated the directions. The full 250K hspell-derived morphological dictionary shipped 2026-05-14 (493,398 entries / 685,632 analyses, 4.24 MB gzipped, cached in a dedicated Service Worker bucket). Multicohort teacher dashboard and a cross-text "Where occurs" hub landed in v3.3.2. The calibrated diagnostic quiz (Direction 13, `ulpan_diagnostic_v1`) shipped under provisional sign-off in v3.3.5.

- **v3.4 (Deferred).** Anki Connect bidirectional sync, premium SRS Trainer (FSRS algorithm with audio-anchored review), and the C-series peer-comparison disambiguation. The `docs/PRODUCT_COHESION_PLAN_v3_4.md` roadmap consolidates these.

- **v3.5 (Dogfood prototype fixes).** Auto-text backbone, render-don't-blank invariant, and the `[[` quick-link opening flow.

- **v3.6 (Smart Learning Graph, 2026-05-17).** Local read-only graph visualization of notes / texts / roots / binyanim with `note_link_suggestions` as a retrieval-practice instrument. Pilot-readiness gate passed [TODO: cite `docs/PILOT_READINESS_GATE_v3_6.md`].

- **v3.7 (Mobile UX redesign, 2026-05-18).** Eleven UX issues addressed through a mobile-first refactor; described in §3.6.2.

The diploma research described in Chapters 5–6 deploys against a v3.7 build frozen at tag `v3.7.0-pilot` for cohort lockstep per `docs/PARALLEL_WORK_PLAN_DURING_PILOT.md`.

## 3.3 Core Architectural Principles

### 3.3.1 Offline-First (OPFS + SQLite WebAssembly)

The user's library, audio cache, notes, SRS state, and engagement events live entirely in the browser's Origin Private File System — a per-origin private filesystem exposed to web applications via the File System Access API [TODO: cite WHATWG OPFS specification]. SQLite is compiled to WebAssembly via the `wa-sqlite` library and runs in the browser, providing relational query capability without a server hop. The principal consequence is that the user can use LinguistPro indefinitely without an internet connection except for the cloud-only resources of §3.3.3 (TTS, translation). Cached audio and cached translations remain functional offline once retrieved.

### 3.3.2 Progressive Web Application

The application is installable on desktop and mobile browsers as a PWA, providing offline-cache via a Service Worker, install-on-add-to-home-screen UX, and a standalone window mode without browser chrome [TODO: cite `docs/PWA.md`]. Service Worker caching strategies are tuned per resource class: static assets are precached at install; HTML and locale files use cache-bust URL parameters during development iteration; morphological dictionaries are cached in a dedicated `MORPH_CACHE` bucket with explicit invalidation hooks.

### 3.3.3 Cloud-Only Resources

Server interaction is the exception, not the rule. Two classes of resource require server-side computation: text-to-speech (Google Cloud TTS as the production provider) and AI translation (Google Gemini). For both, the server acts as a credentials-protecting proxy — the user's GCP / Gemini API key is held server-side in `data/gcp-tts-key.json` / `.env` and never exposed to the browser. All other functionality (text editing, morphology lookup, notes, SRS card creation, smart graph rendering) runs purely client-side.

### 3.3.4 Open-Source by Default

The codebase is open-source on GitHub under permissive licensing (MIT for code, CC-BY 4.0 for documentation). The design contribution of Chapter 4 inherits its reusability claim from this commitment. Internal development documents (CLAUDE.md, planning documents, audit reports) ship in the repository alongside production code; this transparency is a deliberate trade-off — verbose internal documentation is more useful to future researchers than concise polished documentation that hides the iterative process.

## 3.4 Domain Architecture

LinguistPro's domain is structured around the central artifact of the **Hebrew text** — every other module orbits the text editor (§3.4.1) and contributes a specific learning affordance to it.

### 3.4.1 Hebrew Text Editor — the Central Study Workspace

A participant pastes or imports a Hebrew text (article, song, conversation, literary passage) and receives an editor view with one row per sentence. Each row carries: the original Hebrew, optional niqqud (vowel marks), optional transliteration, a Russian / English translation, and a clickable ▶ audio button for TTS playback. Rows are RTL-rendered with mixed-content `bdi` isolation to prevent bidi-bugs in mixed Hebrew / Russian / English text [TODO: cite project typography test page `/typo-test.html`]. This editor is the workspace where ulpan-style row-by-row work happens; every other module in the system (morphology, notes, SRS, smart graph) attaches to specific rows or words within this view.

### 3.4.2 Morphological Analysis

Hebrew morphology is computationally non-trivial: a single word may have multiple legitimate analyses (binyan, root, person / number / gender, tense). LinguistPro embeds a local-first pre-computed morphological dictionary derived from Nadav Har'El and Dan Kenigsberg's hspell project [TODO: cite hspell project Har'El & Kenigsberg]. The default tier carries ~34K stems / ~68K analyses; the extended tier (shipped 2026-05-14) carries 493,398 entries / 685,632 analyses across 4.24 MB gzipped, cached in a dedicated Service Worker bucket. The provider abstraction `MorphProvider` (`public/js/morph-provider.js`) allows future expansion to a Tier 3 server-side morphological analyzer for unhandled forms and a Tier 4 probabilistic disambiguation layer (planned for v3.4+) without changing the consumer-side API [TODO: cite `docs/MORPHOLOGY_REQUIREMENTS_v3_2.md`].

### 3.4.3 Text-to-Speech and Translation

The TTS layer uses Google Cloud TTS with the WaveNet voice family, proxied through the server to protect API credentials. The translation layer uses Google Gemini with a daily quota (default 50 requests / day) tracked in `data/usage.json` and a daily reset at the configured UTC hour. Both layers are intentionally cloud-only — local TTS quality and local neural translation quality were assessed during the v3.0 cycle and rejected as below-acceptable for adult-learner pedagogical use [TODO: cite `docs/TTS_HEBREW_DECISION.md`]. The architectural cost of cloud dependency is that fresh translations and fresh TTS requests require connectivity; once cached locally in OPFS, both function offline.

### 3.4.4 Premium Notes (Polymorphic Typed-Graph)

The notes subsystem (Direction 9, shipped in v3.2) is a polymorphic typed-graph: notes are **typed** (free / word_study / grammar / etc., per a per-type input schema), **audio-anchored** (each note may attach to a specific row's audio timestamp for playback during review), **templated** (the per-type schema drives the input form), **versioned** (edit history retained, no destructive overwrites), **linked** (cross-note `[[note]]` references resolved via autocomplete), and **SRS-card-creating** (any note may spawn an SRS micro-card with the `🎴 Make a card` action) [TODO: cite `docs/PREMIUM_NOTES_PLAN_v3_2.md`]. The polymorphic graph is the substrate for the Smart Learning Graph of §3.4.6.

### 3.4.5 Text-Card Sharing System

Introduced in v3.2 (Direction 10) [TODO: cite `docs/TEXT_CARD_PLAN_v3_2.md`], the text-card system addresses a prerequisite of research-grade cohort study: identical study materials across participants. **Mode A** is a bulk builder for the teacher to compose curated text-card sets. **Mode B** is peer-share via lightweight JSON files — one student exports a text-card, another imports it directly without server mediation, preserving the offline-first invariant. **Mode C** is a curator-request flow with Standard-vs-Curated split for institutional content. Without Mode B, each ulpan student would paste their own text, producing inconsistent study materials and breaking scientific comparability of the cohort-level engagement metrics described in Chapter 5.

### 3.4.6 SRS Layer

The SRS layer per `docs/SRS_STRATEGY_v3_2.md` (approved 2026-05-12) splits responsibilities: LinguistPro is the **creation and linkage** layer — `srs_cards` rows are created from notes, polymorphic with `card_kind ∈ {sentence, note}`, retaining a back-pointer `source_note_id` for linkage. The in-app **Trainer** stays as a minimum-viable stub. The **recommended review** layer is Anki, integrated via the `📥 Export to Anki` (`btnAnki`) flow. The diploma research treats `srs_error_rate` and `cards_added_to_srs` accordingly (Chapter 5 §5.6.2 documents the proxy framing). Future v3.4+ work is planned for Anki Connect bidirectional sync to close the in-app retention measurement gap.

### 3.4.7 Smart Learning Graph

Introduced in v3.6, the Smart Learning Graph is a local, read-only visualization of the learner's accumulated notes, texts, roots, and binyanim with `note_link_suggestions` for retrieval-practice confirmation [TODO: cite `docs/SMART_LEARNING_GRAPH_ROADMAP_v3_6.md`, `docs/PILOT_READINESS_GATE_v3_6.md`]. The system proposes local shared-root / shared-lemma / shared-binyan / same-text candidate connections; the learner confirms, defers, or rejects each — a retrieval-practice interaction that turns the graph into a learning instrument rather than a passive visualization. No telemetry leaves the device for graph interactions; no writes to the `events` table; the graph is privacy-quiet by design and explicitly out-of-scope for the research-mode data collection.

### 3.4.8 Cross-Text "Where Occurs" Hub

Shipped in v3.3.2. From any `word_study` note, a `🔎 Where occurs` button opens a side-panel listing every other text in the learner's library where the same word or its root appears. The lookup is purely local — no server query — and the inverted index is built lazily on first use and cached in memory until idle. The architectural commitment of §3.3.1 (offline-first) is preserved.

## 3.5 Research-Mode Layer

The research-mode (Direction 11B) is described in detail in Chapter 4. Here we note its architectural integration into the broader system:

- **Endpoint family.** `/api/research/v1/*` is the single namespace introduced as an explicit architectural exception to §3.3.1's "no server state" norm. The exception is justified because the research-mode aggregates are categorically different from raw application state — aggregates are statistical summaries that the participant has explicitly opted in to share, not application state being transparently replicated. The architectural distinction is load-bearing for the privacy posture: the user's text library, notes, and SRS state still never leave the device.

- **Module boundary.** Server code lives in `research/` (`validate.js`, `storage.js`, `rateLimit.js`); client code lives in `public/js/research.js` and `public/js/research-ui.js`. The module boundary is explicit: no other module imports from `research/`, and no `research/` module imports from elsewhere except via the schema contract documented in `docs/RESEARCH_METRICS_SCHEMA.md`.

- **Default OFF.** In line with the architectural privacy principle, research-mode is OFF by default on fresh installs and requires explicit consent activation (Chapter 4 §4.3.1). A user who installs LinguistPro to learn Hebrew and never opens the Research panel never has any data leave their device beyond the cloud-only TTS / translation requests of §3.3.3.

- **Code-level enforcement of privacy invariants.** The schema-strict validator (`research/validate.js`) and the k-anonymity gate (`aggregateCohort` in `research/storage.js`) are the runtime enforcement points; Chapter 4 §4.4 traces these in detail.

The research-mode is the single deliberate deviation from a pure offline-first architecture. The cost is documented honestly in Chapter 4 §4.5; the benefit — enabling ethical empirical research on a privacy-preserving foundation — is the methodological contribution of the diploma.

The scaling architecture described in `docs/ULPAN_RESEARCH_PLAN_v3_2.md §5` (Stages 1–5: single-user → single-cohort → multi-cohort → institutional → public research platform) does not require rewriting the core architecture; the cohort-isolated `research-data/<cohort_code>/` directory layout is multi-cohort-ready by construction, even though Stages 3–5 are out of scope for the current diploma.

## 3.6 UI Architecture

### 3.6.1 Dual-Mode UX: Classic and IDE

The participant chooses between two presentation modes for the central text-editor workspace. **Classic mode** uses an accordion-cards layout with row-by-row navigation and a per-text Live State preview that surfaces the current settings (provider, transliteration profile, niqqud status) without expanding the full settings panel — a v3.7 polish improvement informed by the dogfood observation that users frequently lost track of which TTS provider or niqqud mode was active. **IDE mode** uses a denser, multi-pane layout closer to a code editor — playlist queue, search-anywhere, side-by-side notes — for learners who prefer keyboard-driven workflows. Both modes share the same underlying data model; the distinction is purely presentational.

### 3.6.2 Mobile UX Redesign (v3.7)

A mobile-first redesign closed on 2026-05-18 addressed eleven UX issues identified through dogfood observation [TODO: cite `docs/MOBILE_UX_REDESIGN_PLAN_v3_7.md`]: chip-based filter selectors replacing dropdowns, grid layout for library cards, modal scrollability fixes, dark theme refinement, and a bottom tab bar for IDE mode. The redesign treats mobile not as a scaled-down desktop but as a primary use mode for an ulpan student who studies on a phone during commutes or breaks between classes. Post-v3.7 polish (commits `4440aa5` through `9a1bfe2`, 2026-05-21) addressed remaining issues: modal scrollability in confirm dialogs, IDE play-button wiring, filter chip polish, and live-state preview improvements.

### 3.6.3 Teacher Dashboard `/teacher.html`

Separate from the main application is the teacher dashboard at `/teacher.html`, accessible only with a cohort code and researcher token. The dashboard renders cohort aggregates, an engagement timeline, per-student breakdown (k-anonymity gated), correlation analyses, and CSV export functionality. It is the researcher's entry point to the data described in Chapters 5–6; full operational documentation is in `docs/RESEARCHER_GUIDE.md §5`. The teacher dashboard is fully internationalized (RU / EN / HE) and ships with an in-dashboard Help drawer explaining each card and action.

### 3.6.4 Component-Level Structure

The UI is implemented as a single `public/index.html` (≈ 39,000 lines) with inline CSS and JavaScript organized into named regions documented in `docs/CLAUDE.md`. While unconventional by modern web standards (which favor component-framework decomposition such as React or Vue), the choice serves the offline-first invariant: a single file with embedded resources installs faster, caches deterministically as a single Service Worker entry, and runs without a build step on the user's device. The trade-off is build-tooling complexity (no automatic component extraction) and CSS-cascade pitfalls (the `@media (max-width: 600px) button { width: 100% }` mobile override requires explicit per-component exception); these are mitigated by a strict CSS-pitfall documentation regime in `docs/CLAUDE.md` and by paired-edit conventions during development.

## 3.7 Data Architecture

The application's data lives in two tiers: **client-side** (the OPFS-resident SQLite database and `localStorage`) and **server-side** (only the research-mode `research-data/` directory tree).

### 3.7.1 Client-Side Schema

The OPFS-resident SQLite database (`data/app.db` relative to the application's OPFS root) carries the user's full state: `texts`, `sentences`, `rows`, `notes`, `note_links`, `note_link_suggestions`, `srs_cards`, `srs_reviews`, `events`, and various supporting tables. Schema migrations are versioned and applied at boot via the migration runner; backups are created automatically before risky migrations through the `db:backup` npm script. The schema is documented in `docs/DB_SCHEMA.md` and the API contracts are in `docs/API_CONTRACTS.md`, `docs/CONTRACTS_SRS.md`, and `docs/CONTRACTS_ANALYTICS.md`.

### 3.7.2 Server-Side Schema (Research-Mode Only)

The only persistent server-side data is the `research-data/` directory tree described in Chapter 4 §4.4.2: per-cohort `cohort_meta.json`, per-day `.jsonl` append-only files, `outcomes.csv`, and `deletions.log`. There is no user account table, no session state, no application telemetry, and no metadata beyond what the research-mode opt-in explicitly authorizes. The server is otherwise stateless across application requests; restart-recovery requires no replay, and a fresh deployment is operational from an empty `research-data/` directory.

### 3.7.3 Audio Cache

Audio responses from Google Cloud TTS are cached in the browser's OPFS (`data/audio-cache/`) keyed by `(text, voice, params)`. A cache hit returns instantly with no network call; a cache miss triggers a TTS request to the server-side proxy, which fetches from Google Cloud TTS, returns the audio, and the client stores it. The cache is per-user and persists across sessions until cleared manually via the application's storage management UI. This caching makes repeat-playback of previously-encountered sentences feasible at zero latency and zero recurring server cost — important for an ulpan student who reviews the same dialogue many times across days.

## 3.8 Build and Deployment

The project uses Node.js with a small npm-script surface for build, test, migrate, and start operations (documented in `docs/CLAUDE.md` «Ключевые команды» section). Morphological dictionaries are built via `scripts/morph/build-morphology.mjs` against the hspell source corpus. The PWA icon set is generated via `npm run pwa:icons`. Tests run via `node --test`, supplemented by domain-specific smoke runners (`smoke:morph`, `smoke:quiz`, `smoke:crosstext`, `smoke:research:fast`).

Deployment is via Railway in the EU region (per the consent template's data-location disclosure, Chapter 4 §4.7.2). The deployment is protected during the pilot phase via tag-pinning per `docs/PARALLEL_WORK_PLAN_DURING_PILOT.md §2`: the production Railway service tracks `tag: v3.7.0-pilot` rather than `branch: main`, isolating pilot participants from in-progress development changes. Any hotfix during the pilot ships through a dedicated `hotfix/v3.7.x` branch from the frozen tag, never directly to main.

## 3.9 Summary and Transition to Chapter 4

This chapter has described LinguistPro as a privacy-preserving, offline-first, open-source workspace for Hebrew language learning. The architectural commitments — data sovereignty, Hebrew-as-first-language, iterative refinement against pedagogical observations — shape every subsystem decision: the OPFS-resident database (§3.3.1), the local-first morphological analyzer (§3.4.2), the polymorphic typed-graph notes (§3.4.4), the local Smart Learning Graph (§3.4.7), and the dual-mode UI (§3.6.1). The research-mode (§3.5) is the single deliberate exception to the offline-first norm — an architectural exception justified by the methodological contribution defended in Chapter 4.

Chapter 4 follows with the detailed design of that research-mode: the seven architectural decisions, their implementation as code-anchored artifacts, the threat model, the comparison with alternatives, the ethical framework that anchors them, and the limitations honestly acknowledged.

---

**End of Chapter 3.**
