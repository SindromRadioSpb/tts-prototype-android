# Direction 9 — Premium Notes Foundation Strategic Review

**Date:** 2026-05-11. **Author:** Claude (assistant) for `SindromRadioSpb`.
**Context:** End of Phase 9.3 (Templates + Links + SRS). Before launching Phase 9.4 (Morphology). User-requested review of fundamentals against the original premium-product concept and the diploma research goal.

**TL;DR:** Phase 9.1–9.3 built solid technical foundations (schema, API, modal UI, templates, links, SRS pointers). But three premium-UX gaps and one research-credibility gap surface when the system is examined as a *finished educational product* rather than a feature checklist. A focused **Phase 9.3.5 Foundation Reinforcement** (~5–7 days) is needed before Phase 9.4 to consolidate.

---

## 1. Concept vs current state — operational view

### What we set out to build (Direction 9 brief, 2026-05-10)

> Replace the current single-note-per-sentence model with category-defining premium notes (audio-anchored, polymorphic targets including Hebrew root/binyan, structured templates, bidirectional links + backlinks, versioning with diff, note→SRS micro-cards, cross-text smart-collections). Strategic positioning: **the only Hebrew-learning notes system that natively understands morphology + audio anchoring + never loses a thought**.

### What's shipped (9.1–9.3)

| Capability | Status | Notes |
|------------|--------|-------|
| Polymorphic targets (7 kinds × 5 types) | ✅ Schema + API | Modal UI allows free flip |
| Versioning with diff + 50-FIFO retention | ✅ | Race-safe (9.1.F retry-on-conflict) |
| Audio anchoring | ✅ | Live ticker, RTL-safe, Alt+A, replay |
| Bidirectional links + backlinks | ✅ Data + panel | Local panel only (see gap 4) |
| Note→SRS conversion | ⚠️ Half | Card written, but trainer can't yet render it |
| Bundle export/import | ✅ | All polymorphic data roundtrips |
| Library smart-chips | ✅ | with-note / audio-noted / templated / srs-noted |
| Hebrew morphology | ⏳ Phase 9.4 | Roots table seeded, sidecar not yet wired |
| Knowledge-graph view | ⏳ v3.3 | Deferred (M8) |
| Multi-note per sentence | ❌ Gap | Schema allows it; UI doesn't surface |
| Target × type matrix policy | ❌ Gap | All-to-all combinations, no guidance |
| Trainer-side note-card rendering | ❌ Gap | Cards created, can't be reviewed |
| Research-mode event coverage | ⚠️ Partial | Save/edit emit, but anchor/link/srs-convert don't |

### What's done well

- **Schema is right**. Polymorphic table + FK CASCADE + versioning + link graph + smart-chip indexes are all in place and battle-tested by 57 passing tests.
- **Modal UX flow is premium**. Anchor chip with live ticker, history sidebar, templated forms with required-field validation, dark mode + RTL.
- **Backwards-compat is honest**. Legacy `sentence_notes` VIEW + `upsertNote` path still work; data migration 025 was clean.
- **Bundle roundtrip is thorough**. Web↔web preserves everything; web→Android v2 degrades gracefully (only inline free notes survive).
- **Tests are real**. 57 cases exercise schema invariants, FK cascade, race conditions, FIFO retention, FK rewiring on import.

---

## 2. Concept vs current state — strategic view

### Educational premium product positioning

For a serious Hebrew learner using a tool over months/years, premium = three things:

1. **The tool gets out of the way**. One click to capture a thought; the system organizes it without ceremony.
2. **The tool builds my knowledge over time**. Notes link to each other, surface old work when relevant, become a personal Hebrew encyclopedia.
3. **The tool turns my notes into practice**. SRS, audio replay, cross-text recall.

Current state hits #1 (modal opens fast, anchor is one click, templates auto-validate). But:

- #2 partially: links exist locally per note, but no *cross-text discovery view* yet ("show me every note touching root שלם"). The Library smart-chips help, but they're text-level, not concept-level.
- #3 partially: SRS conversion writes a card, but the trainer doesn't render it. From the user's perspective, "Make a card" is a broken promise.

### Competitive landscape

| App | Polymorphic notes | Audio anchor | Morphology graph | SRS-from-notes | Knowledge graph |
|-----|-------------------|--------------|------------------|----------------|-----------------|
| Anki | ❌ | ❌ | ❌ | ✅ native | ❌ |
| Pleco (Chinese) | ⚠️ flat | ❌ | ✅ (Chinese) | ✅ | ❌ |
| Speakly / Lingvist | ❌ | ❌ | ❌ | ✅ algorithmic | ❌ |
| HebrewPod101 | ❌ | ⚠️ lessons-only | ❌ | ❌ | ❌ |
| Duolingo | ❌ | ❌ | ❌ | ❌ | ❌ |
| Obsidian (with plugins) | ✅ | ❌ | ❌ | ⚠️ via plugin | ✅ |
| **LinguistPro** | ✅ | ✅ | 🟡 9.4 | 🟡 partial | ⏳ v3.3 |

**Our actual differentiator after 9.3 + 9.4 will be**: morphology-aware structured notes with audio anchoring + bidirectional graph + SRS pipeline, in one app. No competitor combines all four. **But** the differentiator only materializes if all four feel *finished*. A "broken-promise" SRS button damages the perception of the whole.

### Diploma research credibility

The thesis is "Analysis of correlation between digital learning activity and Hebrew ulpan outcomes". The premise is that **observable in-app behavior predicts real-world ulpan exam performance**. For this to be statistically credible, the activity signal must be:

- **Comprehensive** — capture all the things a learner actually does (notes, edits, anchors, links, SRS).
- **Granular** — distinguish "casual jotter" from "structured studier" from "deep linker".
- **Privacy-preserving** — never expose body content, only metadata.

Current `events` table coverage:

| Event | Status |
|-------|--------|
| `save_note` | ✅ wired (Phase 11.0) |
| `note_edit` (delta chars) | ✅ wired |
| `play_audio` | ✅ wired |
| `srs_review` | ✅ wired |
| `note_anchor_set/clear` | ❌ missing |
| `note_link_added/removed` | ❌ missing |
| `note_srs_convert` | ❌ missing |
| `template_field_filled` (e.g. only word filled vs full form) | ❌ missing |
| `note_open` (read without edit — recall behavior) | ❌ missing |

Without anchor/link/srs/template signals, research analytics will undercount the *premium-engagement* learners — exactly the cohort the thesis is most interested in.

---

## 3. Critical gaps — ranked by impact

### Gap 1 — Multi-note per sentence isn't surfaced (UX-critical)

**Symptom**: Row click → modal opens with one note. To create a second note about a word IN this sentence, user must change target_kind manually, knowing the magic. There's no UI affordance.

**Impact**: This kills the "layered learning" premise. A real learner has 3–5 notes on a juicy sentence (free comment + 2 vocab cards + 1 grammar pattern + 1 pronunciation tip). Without UI for this, users either don't make multi-notes (data loss for research) or get frustrated.

**Fix shape**: Row click opens a *notes index panel* (not the edit modal directly). The panel lists existing notes as compact cards (type icon + title + 1-line excerpt + open/delete) + a "+ New note" CTA with quick-pick types. Clicking a card opens the existing edit modal (current behavior).

### Gap 2 — Target × type matrix is "all to all" (UX confusion)

**Symptom**: All 7 × 5 = 35 combinations are equally surfaced. Many make no sense (target=binyan + type=word_study, target=root + type=translation_discrepancy). User has to know which combinations are sensible.

**Impact**: Choice paralysis + confused data (random combinations land in DB). Smart-chip analytics show noise.

**Fix shape**: Recommend-don't-restrict policy:
- Each target_kind defines a *canonical* type (e.g., word → word_study) and a *reasonable* set.
- Non-canonical types appear muted with tooltip "Не рекомендуется".
- Hard-impossible cells hidden entirely.
- Schema CHECK left open (flexibility) — UI guides, doesn't block.

### Gap 3 — SRS trainer can't render note-cards (broken promise)

**Symptom**: Phase 9.3.C button "🎴 Сделать карточкой" creates a `srs_cards` row, sets `notes_v2.srs_card_id`, but the `/srs` trainer doesn't know how to render `card_kind='note'`. User opens the trainer → sees the card listed but front/back are blank or fall back to sentence-template rendering (wrong source).

**Impact**: Headlining premium feature is broken end-to-end. Cannot be marketed.

**Fix shape**: Extend trainer renderer:
- Detect `card.template_id LIKE 'tpl_note_%'`.
- Load `source_note_id` → `notes_v2` row → parse `body_json`.
- Use template's `front_schema_json.prompt` / `back_schema_json.answer + extra` to map fields → DOM.
- Audio-anchored notes: optional "▶︎ from anchor" button on front.

### Gap 4 — Cross-text knowledge graph signal is weak

**Symptom**: Backlinks panel inside a single note shows what links INTO that note. But "show me every note that touches root שלם across all my texts" requires the user to open the root's note (if it exists) and inspect backlinks. There's no Library-level view "Root שלם: 12 references across 4 texts".

**Impact**: Knowledge accumulation isn't visible. The graph exists in data but not in UX. This is the heart of premium positioning.

**Fix shape**: A "Knowledge hub" page (or Library section) for roots/binyanim — listing references with text/sentence context. Minimal MVP: a "Где встречается" tab on root/binyan notes that calls `listBacklinks('root', root_3letter)` and renders cards.

### Gap 5 — Research event coverage is incomplete

**Symptom**: Events table doesn't capture anchor/link/srs-convert/template-completion behaviors.

**Impact**: Thesis analytics will under-represent the *deepest learners*. Statistical power drops.

**Fix shape**: Add 5 event types to `v3Emit` from the appropriate UI handlers. Privacy: only metadata (note_id, kind, type, target_kind), never body content. Tests verify no body leaks.

### Gap 6 — Word disambiguation in sentences (Phase 9.4 dependency)

**Symptom**: `target_kind='word'` uses `target_id = '<lemma>'`. If a sentence has the same lemma twice, the note can't disambiguate which token. Also, Phase 9.4 morphology produces results per-token, not per-lemma.

**Impact**: When Phase 9.4 ships, mapping `morphology_result.token[i] ↔ notes_v2.target_id='<lemma>'` will be ambiguous. Notes attached to "shalom" can't distinguish first vs second occurrence.

**Fix shape**: Define a stable token-position scheme NOW. Simplest: `target_id = sentence_id + ':' + word_offset` (where word_offset is the 0-indexed position in the tokenized sentence). Phase 9.4 morphology results use the same offset scheme. Backwards-compat: existing lemma-only target_ids treated as "any occurrence".

---

## 4. Proposed Phase 9.3.5 — Foundation Reinforcement

Five workstreams, ranked. ~5–7 days total. Two-thirds of the gap surface area.

### 9.3.5.A — Target × type guidance matrix (~1 day)

- Define matrix (canonical / sensible / muted / hidden) per cell.
- HTML: note_type segmented control re-orders + greys per target_kind selection.
- i18n: tooltip strings ("Не рекомендуется для этой цели", "Рекомендуется").
- Schema: no change (CHECKs stay open).
- Tests: matrix application + smart defaults.

### 9.3.5.B — Multi-note per row index panel (~2 days)

- New "Notes for this row" panel (replaces direct modal open from row).
- Lists existing notes attached to OR about this row (target_kind ∈ {sentence, word with sentence_id parent}).
- Cards: target icon · type icon · title or first 60 chars of body · audio-anchor badge if any · "open" / "delete" icons.
- "+ New note" CTA with quick-pick: Comment / Word / Rule / Translation / Pronunciation. Each pre-fills target_kind + note_type sensibly.
- Existing edit modal opens via card click.
- Row badge shows note COUNT (e.g. "📝 3") not just presence.
- v3NotesBySentenceId cache becomes a list per sentence (array, not single object).
- Mobile-friendly: panel becomes full-screen.

### 9.3.5.C — Event emission completeness (~0.5 day)

- New events: `note_anchor_set`, `note_anchor_clear`, `note_link_added`, `note_link_removed`, `note_srs_convert`, `note_open` (read-only inspection).
- Each carries: `{ note_id, note_kind, target_kind, ts }` — no body, no targets-as-text.
- Privacy test: assert no `markdown`/`body`/`text` content in any event payload.
- Updates `docs/CONTRACTS_ANALYTICS.md` (add 6 new event types to canon).

### 9.3.5.D — SRS trainer-side note-card renderer (~1.5 days)

- Detect `card.template_id LIKE 'tpl_note_%'` in `/srs` trainer code.
- Load source note via `getNoteById(card.source_note_id)`.
- Parse `body_json` + apply template's front/back schemas.
- Render front/back DOM with Hebrew + niqqud + IPA + arrays handled.
- For `tpl_note_pronunciation_note` cards with `audio_anchor_ms`: add "▶︎ Audio" button to play from anchor.
- Tests: 4 card-kind renders + a snapshot of generated HTML for each type.

### 9.3.5.E — Cross-text "Where used" hub (~1 day)

- Light MVP: on root or binyan note, a "Где встречается" tab.
- Calls `listBacklinks('root'/'binyan', target_id)` + cross-references via `note_links.to_id`.
- Renders list of source notes grouped by their text (with text title shown).
- Click navigates to that note (deep-link `?noteId=...`).
- Counts surfaced in Library smart-chips ("📍 ROOT שלם: 12 заметок in 4 текстах").

### 9.3.5.F — Word token disambiguation (~1 day, partial)

- Schema decision: extend `target_id` semantics for `target_kind='word'` to `'<sentence_id>:<word_offset>'` instead of bare lemma.
- Backwards-compat: notes with bare-lemma target_ids treated as "any occurrence" (search uses `LIKE 'word_offset:%'`).
- Document in plan doc as Phase 9.4 prerequisite.
- No migration of existing data (no word-target notes exist yet on prod).
- Tests verify the new format.

---

## 5. What to revisit AFTER Phase 9.4

When morphology results land per-token, two things become natural:

- **Auto-enrich**: word_study notes can auto-populate root/binyan/POS from morphology API. User just fills meaning + mnemonic. Reduces friction → more notes → richer data.
- **Cross-form retrieval**: clicking a conjugated verb form → see all sibling forms sharing the same root via the auto-extracted root link.
- **Audio segmentation alignment**: if 9.4 produces per-word timings (currently it doesn't — only full-sentence audio), pronunciation_note's `audio_anchor_ms` can default to the word's start time. Big UX upgrade.
- **Smart-chip extension**: "📚 Root coverage" — % of distinct roots seen in opened texts.

These become Phase 9.4.5 follow-ups; not pressing.

---

## 6. Blind spots / things still open

- **Template evolution**: when (not if) we add a 6th field to word_study, existing data has old shape. Hydrate logic tolerates absent fields, but a schema-version field inside `body_json` (`"v": 1`) would future-proof.
- **Note ownership in multi-device sync**: not v3.2 scope, but the OPFS-only model assumes one device. Multi-device + sync is a v3.3 epic, will need conflict resolution per note (CRDT-ish).
- **Tag registry**: Phase 9.3 templates produce string-array tags on grammar_rule notes. Cross-note retrieval ("show all 'смихут'-tagged notes") works via SQL-derived index for v3.2. Beyond ~1000 notes, a separate `note_tags(note_id, tag)` table will pay off.
- **Mobile-first multi-note panel**: 9.3.5.B's index panel needs careful mobile design — small screen + many notes + quick-pick. Worth a wireframe before code.
- **Bundle compatibility when target_id format changes** (9.3.5.F): existing bundles use bare-lemma; new format adds offset prefix. Import path needs to transparent-upgrade or refuse-and-warn.

---

## 7. Recommendation

**Approve Phase 9.3.5 Foundation Reinforcement before launching Phase 9.4.**

Total effort: ~5–7 dev-days. Split into 6 workstreams (A–F) with clear independent value. Each can ship + deploy individually.

Effort comparison:
- Phase 9.4 (Morphology): ~5.5–7 days (per master plan).
- Phase 9.3.5 (Reinforcement): ~5–7 days (this proposal).

Total to a production-ready premium notes system: 10–14 days, of which 9.3.5 closes UX/research-credibility gaps that *cannot be backfilled after launch without dogfood damage*.

Alternative — skip 9.3.5: launch 9.4 now. We get morphology faster, but:
- Multi-note UX gap stays → real learners hit it within days of dogfood.
- SRS button stays broken → trust damage on demo.
- Research event coverage stays partial → thesis statistical power dented.
- After 9.4 we'd need to revisit anyway — but with more dependencies entangled.

**My recommendation: 9.3.5 first.** It's the iteration the user asked about — fundamentals refinement, not feature creep.

---

## 8. Decision points for the user

1. **Approve 9.3.5 as a whole?** Y / N / Adjust priorities.
2. **Order of 9.3.5 sub-phases?** Default I propose: B (multi-note) → A (matrix policy) → D (trainer renderer) → C (events) → E (hub) → F (token IDs). B first because it's the most visible UX win.
3. **Cut anything?** F (token IDs) could move into Phase 9.4 itself as a prereq item. E (cross-text hub) could be light MVP and deferred to v3.3 if time is tight.
4. **Defer 9.4 by 1 week** to fit 9.3.5? Yes/No.
5. **Tokens — choose now or in 9.4?** If in 9.4, document the postponement explicitly.

Once you decide, I'll write the detailed plan doc for 9.3.5 and start B.
