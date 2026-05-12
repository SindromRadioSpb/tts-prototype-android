# Changelog

Все заметные изменения в проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/),
версионирование — [SemVer](https://semver.org/).

## [Unreleased] — v3.2.0 in progress

**Mega-release scope** (~7–9 рабочих недель). Approved 2026-05-10. Master plan: [`docs/PREMIUM_RELEASE_PLAN_v3_2.md`](docs/PREMIUM_RELEASE_PLAN_v3_2.md).

### Planned (remaining for v3.2.0 final)

- **Direction 11B — Research Mode** (~11–14 days, 6 sub-phases 11.2..11.7): opt-in privacy-preserving research infrastructure для ulpan diploma project. Multi-session implementation split — S1 server endpoints first, then consent UX + aggregation, then teacher dashboard, then outcome + docs. See `docs/ULPAN_RESEARCH_PLAN_v3_2.md` §7 + `memory/project_v3_2_progress.md`.

---

## [3.2.0-rc1] — 2026-05-13

**Release candidate snapshot** of mega-release v3.2.0 in progress. Ships Directions 9 + 10 + 11A complete; Direction 11B (research mode) follows in v3.2.0 final. Tag locks the «shipped scope so far» state before 11B implementation starts.

### Shipped (Directions 9 + 10 + 11A)

- **Direction 9 Phase 9.4 — Hebrew morphology (local-first, offline)** *(2026-05-12, branch `phase-9-4-morphology`)*. Strategic scope-decision (`docs/MORPHOLOGY_REQUIREMENTS_v3_2.md`, 17 load-bearing requirements) overrides the original Phase 9.0 §7 HebMorph-sidecar recommendation: morphology in v3.2 ships as a **fully local, offline-first, in-browser layer** — no Railway cost, no JVM, no installer, sub-millisecond lookups. Same data source as HebMorph (hspell-data-files, AGPL-3.0) pre-computed at build time and shipped as a static asset.
  - **9.4.A** *(commit `daccb19`)* — Roots seed JSON (100 entries with ru/en glosses + common-word arrays) + idle-time loader. Populates the `roots` table (migration 024 schema, no new SQL migration needed). Tier 2 fallback for autocomplete + OOV recovery. Privacy-safe (no events, just telemetry ring buffer).
  - **9.4.B** *(commit `a52c9a1`)* — Word-study UI: live root autocomplete merging seed + user-added roots via UNION (`searchRootsAutocomplete`). Locale-aware gloss rendering (ru/en/he). Keyboard nav (Arrow/Enter/Esc). Binyan select polished — 7 patterns reordered to pedagogical pa'al → nifal → pi'el → pu'al → hif'il → huf'al → hitpa'el order + "other/unsure" option for irregulars.
  - **9.4.C-local** *(commit `0fd95c5`)* — Build pipeline (`scripts/morph/build-morphology.mjs`, ~340 LOC) generates `public/morph/heb_morphology.bin` (~8 MB raw, ~655 KB gzipped on the wire) from real hspell-1.4 running via WSL on a Hebrew corpus. Yields **34 755 normalized keys → 68 826 multi-analysis entries** (#4 — flat-single-best forbidden, Hebrew is structurally ambiguous). Each analysis carries root / lemma / binyan / pos / source / rank / surface / derivation-hint. Shared normalization invariant (`scripts/morph/normalize.mjs` ≡ `public/js/morph-normalize.js`, #15): NFC → strip niqqud/cantillation/format → final-letter base mapping. Provenance recorded in `meta.json` with SHA-256 + build commit (#14 determinism). Prefix-attached forms captured (#16). hspell access path: native `hspell` on PATH OR WSL Ubuntu-24.04 fallback OR stub-only mode.
  - **9.4.D** *(commit `b08f497`)* — Runtime `IMorphologyProvider` chain (`public/js/morph-provider.js`). Tier 1: `LocalDictionaryMorphologyProvider` (lazy fetch on first word_study open, parses to `Map<key, Analysis[]>`, sub-ms thereafter, SW-cached). Tier 2: `SeedAutocompleteMorphologyProvider` (always-on local DB query, covers OOV + user-added). Chain returns first non-empty result. Auto-fill in word-study form: on word input debounce/blur, top-ranked analysis fills `root` + `binyan` IFF empty AND user hasn't touched the field (#9 — manual edits always win). Green-flash CSS animation on auto-fill. Settings panel (`v3MorphologyStatusShow`) shows lifecycle state / entry count / cache size / data provider / license / actions (Update / Clear cache) per #11. Provider abstraction keeps v3.4 Tier 3 (DictaBERT in-browser) and Tier 4 (optional cloud) slottable without consumer changes (#13). Privacy invariant (#17): morphology lookups emit zero events; only lifecycle telemetry to the operational ring buffer (no word content).
  - **9.4.E** *(this commit)* — 36-case smoke test suite (`tests/morphology/smoke.test.mjs`) covering: dictionary integrity, normalization invariant, 7 binyanim, regular + irregular nouns, adjectives, ambiguous forms, prefix-attached, OOV behaviour, schema compliance (root / lemma / binyan / pos / source / rank / surface), build determinism (SHA-256 match), coverage smoke. All 36 pass on the shipped dict. NOTICE.md created at repo root documenting hspell AGPL-3.0 obligation + Nadav Har'El & Dan Kenigsberg copyright. CHANGELOG + deploy + user-side smoke checklist.

- **Direction 9 Phase 9.3.5 — Foundation Reinforcement (Notes Premium redesign)** *(2026-05-11..12, branch `phase-9-3-5-foundation-reinforcement`)*. Mid-flight strategic redesign triggered by 2026-05-12 dogfood: six UX bugs surfaced in 9.3 (anchor disabled after play, sidebar hides on type switch, ghost data on reopen, cryptic toasts for root/binyan, 35-cell target×type matrix noisy, type-memorization burden). Strategic review (see `docs/research/9_3_5_TARGET_TYPE_REDESIGN.md` + `docs/research/9_3_5_STRATEGIC_REVIEW.md`) surveyed Anki/Pleco/LingQ/Obsidian/Notion/RemNote and proposed Option C — lock-at-creation + explicit Convert. Approved 2026-05-12 with WYSIWYG editor scope added.
  - **R1 — Lock-at-creation UX + intent quick-pick + word token picker** *(commit `b053ed0`)*. Removed Target × Type segmented controls (35-cell matrix gone from the UI; remains legal in DB). Modal header shows read-only locked badges. Row-index "+ Новая заметка" → 5 intent buttons (`row.free` / `row.word` / `row.grammar` / `row.translation` / `row.pronunciation`); each maps to a fixed (target_kind, note_type) pair. Word target opens a token picker (space-split heuristic; Phase 9.4 morphology slots in via same `'<sid>:<offset>'` target_id format with no UI change). Anchor button reactive — `play`/`pause`/`timeupdate` listeners re-evaluate `v3NotesAnchorAudioBelongsToModalRow` so the SET button transitions disabled→enabled mid-session (closes Bug 1.1). +25 i18n keys, -15 obsolete.
  - **R2 — WYSIWYG free-note editor + sidebar lift** *(commit `b2ceeba`)*. Replaced the 3-pane Markdown editor (toolbar + textarea + preview + legend) with native `contenteditable` + compact icon-toolbar + selection-bubble + markdown shortcuts. 8 inline/block formats: B / I / code / highlight / list / quote / link / heading. Selection bubble pops above the highlighted range (Medium/Notion pattern), 5 quick-format buttons. Markdown shortcuts auto-format inline (`**x**` → `<strong>`, `*x*` → `<em>`, `==x==` → `<mark>`, `# ` → `<h2>`, `- ` → `<ul>`, etc.). Hidden `<textarea id="v3NotesText">` retained as markdown serialization buffer so all save paths stay unchanged. New `v3NotesHtmlToMd` roundtrip-safe converter. History sidebar lifted out of the editor split container so it stays visible regardless of which template form is showing (closes Bug 1.2). Rationale for native-not-TipTap: ~600 LOC custom vs ~150 KB external + COEP/CORP fiddling + duplicate Hebrew RTL machinery; vanilla-JS monolithic codebase has no build step. Hebrew RTL + niqqud work natively via `dir="auto"` per paragraph. See `docs/research/9_3_5_WYSIWYG_DECISION.md`.
  - **R2.1 — Bug closure (bubble theme + sort + badge persistence)** *(commit `5087386`)*. Bubble icons were light-on-light in light theme; fixed by hardcoding dark surface (`#1e293b`) + light foreground regardless of theme. Row-index list sorted by `updated_at DESC` pushed first-created free note to the bottom; switched to `created_at ASC` (Anki / RemNote convention — notes appear in creation order). Count badge `📝 N` was off-by-one and lost on page refresh; root cause: `v3NotesUpdateButtonRow` read from a lazy main cache populated on row click (empty on cold load), AND save-flow timing read the cache BEFORE invalidation. Fixes: new `getRowNoteCounts(text_id)` API (single UNION query covering sentence + word targets), new `v3NotesRowCountsPrime(text_id)` bulk-prime on text load (wired into 3 ingest call sites), new dedicated count cache populated by both prime and per-row refresh, save/delete flow ordering — invalidate + await refresh BEFORE redrawing the row button in all 4 paths (legacy save/delete + polymorphic save/delete). Polymorphic save now updates badge for ANY sentence/word note, not just sentence/free.
  - **R3 — Convert flow + SRS warn** *(commit `63af80e`)*. Two-step Convert UX: anchored dropdown under the 🔄 button → confirm dialog with body archive promise + optional SRS warn banner. New `convertNoteType(id, newType)` API in local-db.js — snapshots current `body_json` as a new `note_versions` row via `_appendNoteVersion + _trimNoteVersions(50) + _stampVersionDiffSummary`, writes a blank body for the new type (free → empty markdown; templated → empty body object), bumps `updated_at`. `target_kind` / `target_id` stay fixed — convert changes content shape, not anchoring. New event `note_type_convert` (metadata only: note_id + from_type + to_type + flags). +15 i18n keys × 3 locales.
  - **R4 — DB-level bug-closure invariants** *(commit `83371a2`)*. 8-test suite in `public/db/notes-v2-test.html` locking in R1+R2.1+R3 invariants: Bug 3 (created_at ASC), Bug 2 (getRowNoteCounts UNION query + word-target prefix), R3 convert snapshot/blank/preserve-anchor/idempotence semantics, SRS card behavior on convert, API surface assertion.
  - **R2.2 — Close 8 dogfood-3 bugs** *(commit `dc5a759`)*. Second dogfood pass surfaced eight regressions in R1+R2+R3. (1) Row-click now ALWAYS opens row-index, even on empty rows — the panel's empty state already shows 5 intent buttons. (2) Multi-Free notes per row: `v3NotesOpen` treats `opts.intentKey` as a fresh-state signal (skips legacy pre-fill from `v3NotesGet` AND skips `v3NotesRestoreNoteIdIfMissing`), and `v3NotesSave` retires the legacy `upsertNote` branch entirely; each fresh "+ Свободная" save produces a new `notes_v2` row. (3) Row-button `📝 N` badge survives non-hover — `row-note-active` CSS class now driven by `v3NotesRowCount(sid) > 0` in addition to the legacy free-note cache, covering polymorphic-only rows. (4) Close button returns to row-index, not main screen — new `v3NotesModalReturnContext` tracks row-index origin across modal transitions; `v3NotesForceClose` re-dispatches `v3NotesRowEntryDispatch` with the captured context. Token-picker cancel honors the same context. (5) "🎴 ✓ В SRS" now opens SRS Trainer directly via `v3SrsTrainerOpen()` (earlier hash-based routing was a no-op). (6) Convert drops the linked SRS card instead of leaving an unrenderable orphan — `convertNoteType` deletes the card + reviews + nulls back-pointer; warn banner copy updated in 3 locales to promise removal. (7) One-time orphaned-card sweep on Trainer open via new `srs.cleanupOrphanedNoteCards()` — catches pre-R2.2 broken cards (cards whose `template_id` no longer matches the linked note's `note_type`). (8) Toast container z-index bumped 9999 → 100001 so success toasts render above modals; history diff pane max-height 240px → `min(60vh, 520px)` so multi-line v_N bodies are scannable.
  - **SRS scope decision** *(commit `f6213c8`)*. After R2.2 dogfood the user flagged the in-app Trainer as significantly behind Anki. Approved 2026-05-12 scope revision: LinguistPro is the *creation + linkage* layer; **Anki is the recommended review layer**. In-app Trainer stays as functional stub; premium SRS (FSRS-4.5 + Anki Connect sync + premium Trainer UX) deferred to **v3.4 Premium SRS Epic** (post-diploma). Research-mode retention metric replaced with `cards_exported_to_anki / cards_added_to_srs` engagement-mastery proxy; full retention validation gated on v3.4 Anki Connect bidirectional sync. See `docs/SRS_STRATEGY_v3_2.md` for the full decision record. PREMIUM_NOTES_PLAN M6 rewritten under new scope; ULPAN_RESEARCH_PLAN Layer-2 metrics updated.
  - **R5 — Onboarding refresh + Anki CTA banner + research event** *(commit `106fd33`)*. Row-index help-card body simplified (drops the SRS-card mention). Help-popover SRS section rewritten in 3 locales to reflect Anki-primary scope: *«Карточки создаются здесь, повторение — в Anki через 📥 Экспорт»*. New help-popover Convert section explains lock-at-creation + the SRS-drop-on-convert behavior. New dismissible "Повторяете в Anki?" CTA banner on SRS Trainer home view — opens existing `btnAnki` dialog directly. localStorage-gated dismiss (`srsAnkiCtaDismissed_v1`). New event `srs_card_exported_to_anki` emitted at success of both Anki export entry points (bulk-dialog + IDE single-card) — metadata only (counts + deck/model names + source field). Registered in `CONTRACTS_ANALYTICS.md`. Replaces in-app `srs_review` as the v3.2 mastery-proxy signal for research-mode (per SRS_STRATEGY).
  - **R6 — Final docs + smoke** *(this commit)*. CHANGELOG + WYSIWYG decision doc + PREMIUM_NOTES_PLAN final-state update + R6 smoke checklist.
  - **Test coverage**: notes-v2 suite at **67/67** (+10 cases for R2.1 + R3 + R2.2 + R5: `getRowNoteCounts`, `listNotesForRow created_at ASC`, `convertNoteType` snapshot/blank/preserve/idempotence/SRS-drop, `cleanupOrphanedNoteCards`, API export checks). Events emission 24/24 (+1 for `srs_card_exported_to_anki`). 0 new JS errors on `index.html` cold load.

### Phase 9.3.5 — Stubbed / deferred

- **In-app SRS Trainer premium UX** → v3.4+ Premium SRS Epic. Current stub stays functional (SM-2 grade + review). See `docs/SRS_STRATEGY_v3_2.md`.
- **Anki note-card .apkg bundling** (sentence-cards + note-cards in one .apkg per text) → R5.1 follow-up commit OR v3.4 Premium SRS Epic. R5 ships only the entry-point CTA + event emission; underlying export still bundles sentence-cards only.
- **Phase 9.4 morphology (HebMorph)** continues as planned — token-picker target_id format `'<sid>:<offset>'` already locked in R1 so morphology slots in without UI change.


- **Direction 9 Phase 9.1 — Foundation COMPLETE** *(2026-05-10..11, branch `worktree-agent-ad33453576637a27d`)*. All 5 sub-phases shipped: 9.1.A schema migrations + 9.1.B polymorphic API + 9.1.C modal UI revamp with premium hardening + 9.1.D bundle compat + 9.1.E i18n finalization. Test counts evolved 18 → 38 → 39 → **42** notes-v2 cases; events-emission stable at 23/23 throughout. See `docs/research/9_1_FOUNDATION_FINAL_REPORT.md` for the full closure record.
  - **9.1.A** *(commit `8da394e`, merged to main)*: migrations 021–025 — `notes_v2` polymorphic table, `note_versions`, `note_links`, `roots`, `sentence_notes` → notes_v2 data migration + read-only VIEW shim. 64k body_json cap + json_valid CHECK invariants. Diagnostic helpers `dbQuery` / `dbRun` exported. **18/18 tests**.
  - **9.1.B** *(commit `3a45833`, merged to main)*: notes API rewritten on top of new schema. Backwards-compat preserved (legacy `upsertNote/listNotes/deleteNote/searchNotes/resolveNote` work through VIEW + new schema). New polymorphic helpers: 16 exports including `createNote/updateNote/deleteNoteById/listNotesByTarget/listAllNotesForText/getNoteById/searchAllNotes/listNoteVersions/restoreNoteVersion/setNoteLinks/listOutgoingLinks/listBacklinks/seedRoots/searchRootsAutocomplete/getNotesSmartCollectionsSummary/getTextIdsForNotesSmartChip`. `updateNote` auto-snapshots versions with `+N/-M` diff_summary + 50-FIFO retention. `restoreNoteVersion` itself versioned. **38/38 tests**.
  - **9.1.C** *(branch-only, commits `949a932..a2d6efa`)*: Notes modal UI revamp + premium polish + hardening pass. Initial 5-stage agent implementation: target picker (7 kinds: sentence/word/root/binyan/text/note/free), note type switcher (5 kinds), M5 versioning sidebar with per-line diff view, M7 Library smart-chips (4 new: with-note/audio-noted/srs-noted/templated). Interactive premium polish: dynamic modal title per target_kind, i18n stubs, a11y focus rings, dark-mode contrast. Hardening pass closed 1 High + 5 Medium issues: H1 race condition in `_appendNoteVersion` → retry-on-conflict + new test; M1 delete confirm dialog (Direction 6 baseline); M2 i18n hooks for status strings; M3 Library smart-chip cache invalidation; M4 note-target self-loop prevention; M5 ~150 lines dead code removed (legacy `v3NotesForceClose`, `v3NotesBindHotkeysOnce`). **39/39 tests** + new H1 race case.
  - **9.1.D** *(branch-only, commit `d439683`)*: bundle compat via web-only `library/notes_advanced.json` file in ZIP. Android v2 schema_version=1 preserved; Android ignores unknown ZIP entries. Web→web roundtrip preserves full notes_v2 + 50-FIFO versions + outgoing links + user-customized roots. FK rewiring with 3 maps (textId/sentenceId/noteId) + sentence-bound free note MERGE semantics (no duplicate on collision). Manifest carries `notes_advanced_path` + `notes_advanced_present` flags. **42/42 tests** (+3 bundle roundtrip cases).
  - **9.1.E** *(branch-only)*: i18n finalization. ~90 new keys authored for `ru` / `en` / `he` locales across `notes.*` / `library.*` / `confirms.*` / `toast.*` namespaces. `noteTooLong` cap updated 16000 → 65,536 to match schema. Hebrew translations machine-grade; native review scheduled before Direction 11 ulpan deployment. Final regression: **23/0 events + 42/0 notes-v2 + main app 0 new JS errors**.
  - **Phase 9.3 — Templates + Links + SRS micro-cards (M3 + M4 + M6)** *(branch `phase-9-3-templates-links-srs`, 2026-05-11)*. Three milestones in one branch.
    - **M3 — Templates**: 4 structured forms for the non-free note types. `word_study` (word + niqqud + root + meaning + POS + binyan + mnemonic + example), `grammar_rule` (title + body + examples[] + counterexamples[] + tags[]), `translation_discrepancy` (source + seen + suggested + reasoning), `pronunciation_note` (word + IPA + common_mistakes; reuses Phase 9.2 audio anchor). Required-field validation surfaces missing fields by label in the toast. Switching `note_type` mid-edit stashes the current type's body so flipping back doesn't lose work (objects for templated, strings for free). The legacy "⏳ Phase 9.3" placeholder banner is retired.
    - **M4 — Links**: collapsible "🔗 Связи" panel below the body with outgoing + backlinks sections. Add via kind-selector + target input + optional alias; remove via per-chip ✕. Backlink chips are clickable — they close the current modal and open the source note. New atomic `addNoteLink` / `removeNoteLink` API replaces the wasteful "fetch all + setNoteLinks" pattern. INSERT OR IGNORE makes re-adding the same edge a no-op. Bundle export/import already covers `note_links` via 9.1.D.
    - **M6 — Note → SRS**: new modal-footer button "🎴 Сделать карточкой" (templated notes only); confirm dialog → `srs.createCardFromNote` → toast → button flips to "🎴 ✓ В SRS" + clicks navigate to the trainer. **Migration 026** seeds 4 SRS card templates with `card_kind='note'` (`tpl_note_word_study/grammar_rule/translation_discrepancy/pronunciation_note`), idempotent INSERT OR IGNORE. `notes_v2.srs_card_id` back-pointer set on conversion; re-conversion returns the existing card.
    - **Premium quality**: dark mode + RTL verified everywhere; focus-visible rings; `prefers-reduced-motion` honored. ~50 new i18n keys per locale (RU/EN/HE) covering field labels + placeholders + POS/binyan select options + toasts + confirms. Tests: **57/57** notes-v2 (+10 cases — 4 template roundtrips, link atomic helpers, free-note conversion rejection, etc.) + 23/23 events + 0 new JS errors.
    - **Deferred to v3.3**: multi-card-per-note (today one card per note), trainer-side renderer for `card_kind='note'` (cards are created and listable; reviewing them with proper front/back rendering follows in `/srs` page work).
    See `docs/research/9_3_TEMPLATES_LINKS_SRS_PLAN.md` and `docs/research/9_3_TEMPLATES_LINKS_SRS_REPORT.md`.
  - **Phase 9.2 — Audio anchoring (M2)** *(branch `phase-9-2-audio-anchoring`, 2026-05-11)*. A premium chip inside the Notes modal lets the user pin the note to a specific moment within the row's TTS audio. While the row's audio is playing, the SET button shows live current-time ("📍 Привязать к 0:01.4" → "0:01.5" → …) — click locks the moment. Once anchored, the chip flips to "📍 0:04.5 ▶︎" (clickable to seek + play from that point) + a separate ✕ to clear. Alt+A hotkey toggles set/clear while the modal is focused. Anchor persists on `notes_v2.audio_anchor_ms`, survives modal close/reopen via `v3NotesRestoreNoteIdIfMissing` + `v3NotesAnchorLoadForCurrentNote`. Row notes badge gets a 📍 sub-overlay when the sentence's free note has an anchor — visible without opening the modal. Smart-chip "📍 Audio-noted" already wired in 9.1.C now lights up. Bundle export/import roundtrip preserves anchors; replay from anchor on bundle-imported rows inherits 9.1.F's HEAD pre-flight → fresh regen on cache miss. RU/EN/HE locales got 10 new keys each; digit cluster uses `dir="ltr"` + `font-variant-numeric: tabular-nums` so timestamps render Western-ordered inside the HE-RTL modal. Dark mode + `:focus-visible` + `prefers-reduced-motion` all honored. **47/47** notes-v2 (+4 cases) + 23/23 events + 0 new JS errors. **Bonus fix**: discovered and closed a pre-existing Shape A import bug — `item.rows → sentences` reshape inside `importBundle` was silently dropping `row_id`, which left `oldToNewSentenceId` unpopulated and caused sentence-targeted polymorphic notes from `notes_advanced.json` to be dropped on import. See `docs/research/9_2_AUDIO_ANCHORING_REPORT.md`.
  - **9.1.F post-smoke hardening** *(branch-only, prior commit)*: three bugs caught during user smoke-check addressed.
    1. **Versioning semantics rewritten** — `v_N` now snapshots the body **after** the N-th save (was "previous body before update", which produced confusing "v1 = first edit" displays where the latest edit was never visible). `createNote` and `upsertNote` (legacy free notes) now both seed `v1` so history is meaningful from the first save. `restoreNoteVersion` snapshots the restored body as a new version, not the pre-restore body. Plus the **reopen fix**: `v3NotesOpen` now back-fills `v3NotesModalNoteId` from `notes_v2` via async lookup when a sentence-bound row is reopened, so the History sidebar shows existing versions across modal close/reopen cycles (was empty until the next save). New test `createNote seeds v1 = body at creation (snapshot semantics)`; existing version tests updated to match. **43/43 notes-v2**.
    2. **Notes Preview / textarea / sentence-ctx theming** — replaced hardcoded `background: #fff` (and no explicit `color`) with `var(--theme-bg-card)` + `var(--theme-text-primary)` everywhere in the modal so dark mode is readable (was white text on white background on Preview block).
    3. **Row TTS bundle-import bug** — Row TTS now does a HEAD pre-flight against `/api/audio/<key>` before setting `<audio>.src`, falling through to fresh TTS generation on cache miss instead of bubbling up `MEDIA_ERR_SRC_NOT_SUPPORTED` ("Failed to load because no supported source was found"). Tightened server: `POST /api/audio/cache/upload` now returns `ok:false` + 500 when `writeMp3IfNotExists` fails, instead of `ok:true` masking the write error.

- **Direction 9 Phase 9.0** — Hebrew root extractor research *(two-phase, 2026-05-10)*:
  - **v1** *(commit `39230f8`)* — initial recommendation Plan B+C (manual + autocomplete + seed dictionary). Cause: AGPL libraries (HebMorph, hspell) vetoed when commercial-friendly licensing was assumed.
  - **v2 / re-research** *(commit `6f5c1ad`)* — user clarified app is non-commercial open-source → **AGPL unlocked**. New recommendation **Option A: HebMorph sidecar** for native root extraction (250K word forms, 10+ years production maturity via Elasticsearch Hebrew plugin). Plan B+C retained as graceful offline/OOV fallback — three-tier layered architecture.
  - **Net for v3.2:** Phase 9.4 ships premium-tier auto-extraction. Effort revised 2.5–3.5d → **5.5–7d** (+3d). New endpoint `POST /api/morphology/v1/analyze` (stateless, same baseline as `/api/transliterate`). Risk Low → Medium (operational sidecar uptime; mitigated by graceful client-side fallback).
  - **v3.3 follow-up:** DictaBERT in-browser via transformers.js becomes new highest-priority morphology epic — fully-offline premium upgrade.

- **Direction 11A — Analytics Foundation** *(2026-05-10, commits `7ed309f` → `3f6b959`)*. Closes the long-standing CONTRACTS_ANALYTICS drift (Tier 0 audit gap) и переводит time-spent на heartbeat-based real measurements, useful to all users (not only research mode).
  - **Phase 11.0:** 12 event types wired into `events` table — `text_open`, `text_close`, `play_audio`, `save_note`, `note_edit`, `srs_review`, `srs_session_started`, `srs_session_finished`, `search_query`, `smart_tag_override`, `translit_toggle`, plus legacy `row_tts` preserved for backwards-compat. New `v3Emit()` helper + privacy-strict invariants enforced (no raw text / note bodies / search query strings ever leak — see `docs/CONTRACTS_ANALYTICS.md § 0`).
  - **Phase 11.1:** heartbeat-based session tracking with idle gating (5 min) + visibility gating + max-session cap (60 min). Three new aggregation API exports in `local-db.js`: `getActiveMsReal()`, `getActiveMinutesByDay()`, `getSessionMetrics()`. `getAnalytics()` shape evolved with new `active_ms_real` field alongside legacy `time_ms` (backwards-compat preserved). 23/23 browser-driven Playwright tests pass.
  - **Test page:** `public/db/events-emission-test.html` — runs all 12 emit + Phase 11.1 aggregation tests in browser; can be visited any time at `/db/events-emission-test.html`.

### Planned
- **Direction 9 — Premium Notes Redesign** (~13–17 days): polymorphic note targets (sentence / word / root / binyan / text / note / free), 4 templates (word_study / grammar_rule / translation_discrepancy / pronunciation_note), audio-anchored notes, bidirectional links + backlinks, versioning + diff (50 versions retention), note → SRS micro-card, Hebrew root extractor research. Schema migrations 021–025. Bundle compat preserved (sentence-bound free notes inline; advanced notes in new `library/notes_advanced.json` web-only). See [`docs/PREMIUM_NOTES_PLAN_v3_2.md`](docs/PREMIUM_NOTES_PLAN_v3_2.md).
- **Direction 10 — Text-card System** (~7–8.5 days): three-mode lifecycle (Mode A bulk builder / Mode B peer-share via lightweight JSON exploiting content-addressed audio cache / Mode C curator request with Standard-vs-Curated split). v3.2 без новых server endpoints. See [`docs/TEXT_CARD_PLAN_v3_2.md`](docs/TEXT_CARD_PLAN_v3_2.md).
- **Direction 11A — Analytics Foundation** (~5–7 days, ships independently): closes CONTRACTS_ANALYTICS gap (12 event types), heartbeat-based time-spent v2, improves Activity Heatmap accuracy for all users.
- **Direction 11B — Research Mode** (~11–14 days): opt-in privacy-preserving research infrastructure for ulpan diploma project. Anonymous student_id + cohort code + daily aggregate uploads + new endpoint family `/api/research/v1/*` (architectural exception: aggregates only, no PII) + teacher dashboard `/teacher.html` + IRB-style consent. See [`docs/ULPAN_RESEARCH_PLAN_v3_2.md`](docs/ULPAN_RESEARCH_PLAN_v3_2.md), [`docs/RESEARCH_METRICS_SCHEMA.md`](docs/RESEARCH_METRICS_SCHEMA.md), [`docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`](docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md).

### Deferred → v3.3
- Functional code-split монолита `public/index.html`.
- Sherpa adapter lazy-load.
- Knowledge-graph view для notes (Direction 9 M8).
- Server-side TTL share-cache + short public URLs (Direction 10 v3.3 epic).
- End-to-end encryption на text-card share.
- Calibrated in-app diagnostic quiz.
- Multi-cohort comparative dashboard.
- Premium table-edit mechanics (long-press DnD).

### Documentation prep (2026-05-10)
- New plan docs: `PREMIUM_RELEASE_PLAN_v3_2.md`, `PREMIUM_NOTES_PLAN_v3_2.md`, `TEXT_CARD_PLAN_v3_2.md`, `ULPAN_RESEARCH_PLAN_v3_2.md`, `RESEARCH_METRICS_SCHEMA.md`, `RESEARCH_ETHICS_CONSENT_TEMPLATE.md`.
- Tier 0 audit reconciliation: `PREMIUM_RELEASE_PLAN_v3_1.md` audit checklist updated to reflect actual shipped state (16 feedback Tier 1+2 items + WCAG + sticky bar + suspend semantics flipped to `[x]`); honest gaps preserved as `[ ]` или `[~]` with cross-references to v3.2 directions.
- Plans archived (superseded): `FINAL_RELEASE_PLAN.md` → `FINAL_RELEASE_PLAN.archived-2026-05-10.md`; `LOCAL_WORKSPACE_STORAGE_ITERATION_PLAN.md` → `LOCAL_WORKSPACE_STORAGE_ITERATION_PLAN.archived-2026-05-10.md`.
- I18N_PREMIUM_COMPLETION_PLAN re-stated as COMPLETE.
- NAV_CODEMAP `(deferred)` markers removed (sticky bar давно работает).
- ROADMAP_PREMIUM P3/P4/P5/P6 statuses updated to reflect v3.1 partial closures + v3.2 cross-references.
- Top-level README Roadmap section expanded с v3.2 scope.

## [3.1.0] — 2026-05-10

**Premium polish release.** Восемь directions из [Premium Release Plan v3.1.0](docs/PREMIUM_RELEASE_PLAN_v3_1.md) — все `[x]`. Релиз о цельном premium-качестве: типография, темы, локализация, onboarding, smart-sort, error gentleness, PWA, trust signals. Никаких новых тяжёлых фич — каждый экран ощущается так же продуманно, как feedback-модалка.

Совместимость: ZIP-bundle формат не менялся (unified Android v2 spec из v3.0.0). OPFS-схема расширена миграцией 020 (`manual_smart_tag` column) — backwards-compatible, авто-применяется при upgrade.

### Added

#### Direction 1 — Hebrew typography & RTL
- Self-hosted woff2 шрифты в `public/fonts/`: Frank Ruhl Libre / Assistant / Noto Sans Hebrew (3 веса × 3 шрифта = 9 файлов, ~167 KB total). `font-display: swap`, premium fallback chain.
- Premium Hebrew rendering: `font-feature-settings: kern + calt + liga`, `text-rendering: optimizeLegibility`, line-height-1.65 для никуда.
- Bidi-isolation в mixed-content строках (иврит + русский + английский).
- Visual regression page `/typo-test.html` со всеми сложными комбинациями огласовок.

#### Direction 2 — App-wide theming (light / dark / auto)
- CSS-variable foundation на `:root` — 12 светлых + 12 тёмных переменных, shadow-trio, density tokens.
- Три режима: `light` / `dark` / `auto` (по системной prefers-color-scheme), persistent в `localStorage.appTheme_v1`.
- **Pre-paint inline boot** в `<head>` — блокирует FOWT (Flash Of Wrong Theme) перед первым кадром.
- Toggle `🌗` в IDE header + Classic toolbar (cycle auto → light → dark).
- Density modes (compact / comfortable / spacious) через `body.theme-density-*` + `localStorage.appDensity_v1`.
- Live-react на изменения OS-темы через `matchMedia`.
- Inline-style overrides для legacy hardcoded цветов (`#fff`, `#0f172a`, `#475569`) через theme-aware selectors.

#### Direction 3 — Full i18n coverage
- **3 локали**: русский, английский, **עברית** (с автоматическим RTL `dir`).
- **Phase 1**: smart-chip strings + 8 high-traffic toasts мигрированы.
- **Phase 2**: остальные ~120 hardcoded `showToast("…")` callsites мигрированы на `t("toast.*")` с поддержкой параметров (`{error}`, `{count}`, `{done}/{total}` etc.). Составные сообщения переписаны как композиция `t() + (cond ? t() : "")`.
- **Verification**: финальный `grep` по hardcoded toast-литералам в `public/index.html` = 0.
- Динамически отрендеренный контент реагирует на `i18n:changed` event без перезагрузки.

#### Direction 4 — Onboarding & discovery
- First-time welcome modal с двумя CTA: «Попробовать на демо» / «Начать с моего текста».
- Inline 5-предложение Hebrew demo с автоматической установкой языка `he-IL`.
- Persistent decision via `localStorage.onboardingSeen_v1`.
- Кнопка «Сбросить onboarding» в About modal для повторного показа.

#### Direction 5 — SRS + Library smart-sort
- **Activity heatmap** в Dashboard (GitHub-style 7×~30 grid за 30 дней, цвет → интенсивность).
- **Library smart-filter UI**: 4 чипа `⏱ Недавние / 🔥 Сложные / ✓ Освоено / ✨ Новые с прошлого визита`. Persistent в URL hash (`#smart=struggling`), one-click ✕ clear, mobile-responsive (2-up grid на ≤600px), full theme-aware.
- **Manual smart-tag override** (миграция 020): пользователь может вручную пометить карточку как «🔥 Сложно» / «✓ Освоено» через Text Meta Edit, переопределяя SRS-derived auto classification. Inline badge на library card.
- Last-visit timestamp tracking в `localStorage.v3LibraryLastVisit_v1` для «Новые с прошлого визита».
- Foundation helpers в `local-db.js`: `getActivityHeatmap`, `getStrugglingTexts`, `getMasteredTexts`, `getTextsCreatedAfter`, `setManualSmartTag`, `getManualSmartTag`.

#### Direction 6 — Error gentleness app-wide
- Все active-path `alert(...)` / `window.confirm(...)` callsites переведены на `v3ConfirmModal` / `showToast`.
- Остались только 3 fallback-path вызова (внутри самого `v3ConfirmModal`-ultimate-fallback, в feedback Phase6 alert try-catch, в WA-confirm fallback).
- В `public/index.html` нет ни одного destructive blocking-диалога в active code path.

#### Direction 7 — Performance / PWA
- **manifest.json** с `id`, `scope`, `start_url`, standalone display, тремя app shortcuts (Library / SRS / Dashboard), theme/background colors.
- **Icon set**: vector SVG + 192/512/512-maskable/180/32 PNG. LP monogram на slate-900 с blue accent bar (premium signal). Генерируется pure-Node скриптом `scripts/generate-pwa-icons.js` без external deps (built-in `zlib` для IDAT). Re-runnable через `npm run pwa:icons`.
- **PWA meta tags**: `theme-color` (light/dark via media query), `apple-touch-icon`, `apple-mobile-web-app-capable` + `status-bar-style`, `application-name`.
- **Tiered Cache-Control** на статику: fonts/icons immutable (1y), JS modules must-revalidate (1d), shell entry points (`index.html`, `manifest.json`, `sw.js`) no-cache.
- **JSZip lazy-load** (~95 KB сэкономлено на cold start). `v3LoadJSZip()` идемпотентный helper по образцу `v3FbLoadQr()` (qrcode.js уже был lazy).
- **Service Worker** (`public/sw.js`) с тремя стратегиями:
  - **Precache** (install): app shell + i18n + DB layer + TTS layer + fonts + icons. Полный offline cold start после первой загрузки.
  - **Stale-while-revalidate** (runtime): остальная same-origin статика (lazy modules, /typo-test.html, /mockups/*).
  - **Network-first** с timeout 2.5s + cache fallback: `/api/client-config`.
  - **Network-only**: все остальные `/api/*` (translate, tts, audio, transliterate, export-docx, feedback) — кеширование исказило бы корректность (квоты, состояние, upload).
- **Premium update UX**: новый SW устанавливается в `waiting`, не выполняет `skipWaiting()` автоматически. Приложение показывает toast «Доступно обновление» с кнопками «Обновить» / «Позже» — пользователь контролирует момент применения.
- **Cache invalidation** на activate, versioned cache names (`linguistpro-precache-v3.1.0-pwa-1`), `clients.claim()`.
- **Module preload hints**: `<link rel="modulepreload">` для `sqlite-api.js` / `local-db.js` / `i18n/index.js` — параллельная загрузка с HTML parsing.
- **Removed**: vestigial `fonts.googleapis.com` `<link>` из `<head>` (Direction 1 self-hosted woff2 сделал его dead code).

#### Direction 8 — Trust signals + content polish
- Footer на всех экранах: «🔒 Данные на этом устройстве» badge → `docs/OPFS_USER_GUIDE.md`, version + commit, GitHub link, Privacy link.
- About modal с full credits, license, dependencies, onboarding-reset кнопкой.
- `docs/PRIVACY.md`.
- Version из `package.json` через `/api/client-config`.

### Changed

- README — теперь premium WOW-first-impression top-level entry point.
- `docs/PREMIUM_RELEASE_PLAN_v3_1.md` — live-status переключён на complete для всех 8 directions.
- Server static-asset middleware — теперь tiered Cache-Control вместо одного дефолта.
- `package.json` version bumped 3.0.0 → 3.1.0.

### Fixed

- **Theming regressions** (Direction 2 follow-ups): premium color-system rework для table / headers / cards / panel cards / modal headers / mobile bottom-sheet / mobile card overflow / source-link colour / filter chip / heatmap cell outline.
- **IDE checkbox dark-mode**: column-settings panel («Настройки таблицы сохранены на устройстве») использовал hardcoded `#f8fafc` background, в dark theme labels становились white-on-white. Switched to `var(--theme-bg-muted / border-soft / text-primary / accent[-hover])`.
- **Library bundle export**: notes preserved в `exportBundle` (раньше CASCADE-related path терял notes для архивированных текстов).
- **Premium pipeline**: madlad fallback restoration + SBL gemination edge case.
- **Classic mode toggle**: contract restoration (placement + visibility).
- **IDE table headers**: refresh on locale change (i18n event listener).
- **Table editing** (post-Direction-1 follow-up): consecutive moves + mobile reorder/cell-editing; `tbl-edit-mode` class restoration after `renderTable`.

### Documentation

- New: [`docs/PWA.md`](docs/PWA.md) — install, offline, update lifecycle, troubleshooting, cache versioning, icon regeneration, deferred items.
- New: top-level [`README.md`](README.md) — WOW-first-impression entry point with what / why / how / architecture / roadmap.
- Updated: [`docs/PREMIUM_RELEASE_PLAN_v3_1.md`](docs/PREMIUM_RELEASE_PLAN_v3_1.md) — live-status finalized.
- Updated: this entry.

### Deferred → v3.2

- **Functional code-split** (Dashboard / SRS / IDE → отдельные dynamic-import ES-модули). Требует extraction inline `<script>` блоков из 30k-line `public/index.html` в ES-модули с явными imports/exports вместо `window.*` глобалов. Out of scope для v3.1.0 ради стабильности; v3.1.0 шипает PWA как **продукт** (install, offline, fast), а не как архитектурный refactor монолита.
- **Sherpa adapter lazy-load** (~13.7 KB) — небольшая экономия, но в чувствительной TTS startup-sequence.
- **Premium table-edit mechanics** — отложено per `docs/` backlog.

### Tooling

- New npm script: `npm run pwa:icons` → запускает `scripts/generate-pwa-icons.js`.

## [3.0.0] — 2026-05-08

Большой релиз: полный переход на offline-first архитектуру (OPFS + wa-sqlite),
агрессивная очистка серверных stateful-эндпоинтов, премиум-UX bundle.

### Breaking changes
- `localMode` теперь дефолтный — пользовательская библиотека хранится
  в OPFS (Origin Private File System) браузера, не на сервере.
- Серверные stateful API (`/api/library/*`, `/api/srs/*`, `/api/progress/*`,
  `/api/history/*`, `/api/notes/search`, `/api/sentences/search`,
  `/api/nav/resolve`, `POST /api/library/import`) возвращают `410 Gone`.
  Helper-функции в `server.js` сохранены для отката, но обработчики
  закрыты middleware `gone410`.
- Опт-аут (`localStorage.localMode='0'`) формально работает, но не имеет
  смысла — серверные ручки 410 Gone, в server-mode библиотека неработоспособна.
- Тест `tests/storage_location_audit.test.js` удалён — он документировал
  pre-Phase-6 контракт «данные на сервере», который инвертирован релизом.

### Added — Phases 0–5 (offline-first foundation)
- **Phase 0:** wa-sqlite (sync + async Asyncify) + VFS fallback chain
  (`AccessHandlePoolVFS` → `IDBBatchAtomicVFS`) + sticky VFS preference;
  19 SQLite миграций; `/db/db-init-test.html` с 16 тестами.
- **Phase 1:** все чтения из OPFS (texts/sentences/notes/audio_assets
  с JOIN, search, nav resolve, recent activity).
- **Phase 2:** все записи (CRUD, JSON+ZIP экспорт/импорт, stateless
  `POST /api/export/docx`).
- **Phase 3:** локальная аналитика (`getAnalytics({days, includeArchived})`),
  dashboard refresh, recent-rows из events.
- **Phase 4:** SRS-режим (templates, today/summary, sessions, review,
  trainer-view); премиум Anki-экспорт с кастомной моделью
  `LinguistPro SRS Card v1` и fuzzy grading.
- **Phase 5:** ZIP-bundle с аудио в unified Android v2 формате;
  re-upload MP3 в Railway audio-cache; 2-фазный импорт (texts → audio).

### Added — Pre-Phase-6 consolidated plan (A/B/D bundle)
- **A1:** first-open migration prompt с тремя кнопками (перенести /
  начать с чистого листа / решу позже).
- **A2:** mobile dogfood прошёл на iPhone iOS 17+ и Android Chrome.
- **A3:** cross-device ZIP roundtrip — Kotlin strict-schema compliance
  для Android v2 import (language default `'he-IL'`, content_hash explicit
  null, created_at/updated_at fallback к export-ts, tags coerce).
- **A4:** concurrent-tabs guard через `BroadcastChannel` — non-blocking
  minimisable banner.
- **B1:** storage quota monitoring (`navigator.storage.estimate()` widget +
  80%/95% thresholds в save-path).
- **B2:** migration failure rollback — per-text atomicity в `importBundle`
  через `deleteText`/CASCADE + `rollbackImportedTexts` +
  `window.v3Phase6UndoLastMigration`.
- **B3:** in-memory undo для delete-text — snapshot через
  `exportBundle({textIds})` + `v3UndoToast` 7s window.
- **B4:** per-IP rate limiting на stateless endpoints (60/min transliterate,
  30/min export-docx, 2000/min audio-cache-upload — после hotfix).
- **B5:** OPFS pre-Phase-6 telemetry (`window.v3OpfsTelemetry.list()` /
  `.summary()`).
- **D1:** user-facing OPFS storage guide (`docs/OPFS_USER_GUIDE.md`).
- **D2:** header trust audit — `requireSameOriginJson` middleware на
  stateless POSTs (Content-Type + Origin/Referer guard).
- **D3:** PRAGMA integrity_check on startup — idle-time после init.
- **D4:** notes audit Test 16 — multi-line/Unicode/2KB/RTL/JSON-shaped
  notes survive roundtrip + CASCADE при deleteText.
- **D5:** kill switch — env-var `KILL_LOCAL_MODE=1` на Railway →
  `/api/client-config` отдаёт `flags.killLocalMode=true` → 15-min cached
  на клиенте → принудительный сброс LOCAL_MODE без app-deploy.

### Added — Phase 6 release
- `LOCAL_MODE` теперь true по умолчанию (`localStorage.localMode !== '0'`).
- A1 prompt fires для всех первого-разовых посетителей; copy переписан
  под пост-flip реальность.
- `gone410` middleware на стейтфул-эндпоинтах.
- `GET /api/library/export(/bundle)` сохранён для last-mile recovery.

### Added — Premium UX (cross-cutting)
- Card-level TTS profile auto-apply + cache-first playback.
- Multi-select + bulk delete/archive в Library.
- Wipe-all с type-confirm modal.
- VFS fallback chain для mobile (iPhone iOS 17+, Android Chrome).
- One-time server→OPFS migration кнопка («Импорт из облака»).
- Stateless `POST /api/transliterate` + LOCAL_MODE lazy-fill при открытии
  карточки (восстановление translit для legacy-данных).
- Reconcile audio links после `importBundle` для уже существующих текстов.
- Diagnostic helper `window.__localDB.audioLinkDiag(titleSubstring)`.

### Fixed
- Bulk-delete + cache-restore FK constraint failure: session держал
  stale `textId` после delete, FK ломался при `addSentence`. Fix:
  `v3SessionForgetTextIfStale` + defense-in-depth в
  `v3LibraryUpdateCurrentCore`.
- «Сохранить как новый» теперь всегда доступен при наличии update-target
  (раньше было только при `baseTextId`/draft-fork).
- `v3Phase6ResetDecision` чистит все ключи (`phase6FirstOpenSeen`,
  `localMode`, `phase6LastMigration`).
- Bulk ZIP-import 429-storm: rate limit на `/api/audio/cache/upload`
  поднят с 200/min → 2000/min; client `uploadOne` retry'ит 429 с
  Retry-After + exponential backoff (3 попытки).
- Translit edits SBL-профиля не сохранялись — `tableEditSaveCell`
  безусловно удалял `payload.translit`.
- Edit-marker badge + niqqud column + activity panel
  (`(без названия) (пусто) 0`) + TTS settings ignored.
- Anki «all duplicates»: AnkiConnect Plus возвращает per-note ошибки
  как Python-stringified list — теперь регэкс + JSON.parse + retry-as-fresh.
- Mobile init failure: false-negative на `createSyncAccessHandle` per
  spec в main thread → VFS fallback chain в worker.
- AnkiConnect health-check в LOCAL_MODE: direct из браузера к
  `127.0.0.1:8765`, минуя Railway.

### Documentation
- `docs/OPFS_MIGRATION_PLAN.md` — статусная таблица + dated changelog
  по фазам и багфиксам.
- `docs/OPFS_USER_GUIDE.md` — user-facing reference: где живут данные,
  таблица endpoint'ов после Phase 6, kill switch, FAQ.
- `docs/C_SERIES_PLAN.md` — рекомендованный порядок реализации
  C-серии и premium-product требования (post-Phase-6 backlog).

---

## [2.0.0] и ранее

См. историю коммитов: `git log --oneline`. Включает Phase 4-9 SRS,
Anki-экспорт, dashboard аналитика, IDE-режим, audio-prefetch,
Hebrew TTS POC, classic mode, i18n.
