# Direction 9 Phase 9.3 — Templates + Links + SRS Plan

**Branch:** `phase-9-3-templates-links-srs` (base = `main@005a7fb` post-9.2.A).
**Date:** 2026-05-11.
**Goal:** Make the four non-free `note_type`s (`word_study`, `grammar_rule`, `translation_discrepancy`, `pronunciation_note`) fully usable with structured forms; ship bidirectional links + backlinks panel; allow converting a templated note into an SRS micro-card.

Total effort: ~5–7 dev-days. Split into three deployable chunks for premium-quality pacing.

---

## Inventory — what's already in place

### Schema (Phase 9.1.A — `db/migrations.js`)
- `notes_v2.note_type` CHECK ∈ `{free, word_study, grammar_rule, translation_discrepancy, pronunciation_note}`.
- `notes_v2.body_json` ≤ 64 KB + `json_valid` CHECK — arbitrary structured data goes here.
- `notes_v2.srs_card_id` (nullable) — pointer to the SRS card derived from this note (if any).
- `note_links (from_note_id, to_kind, to_id, link_alias, created_at)` — already exists; FK CASCADE on delete.
- `srs_cards.source_note_id` (nullable) — already exists; ties cards back to source notes.

### API (Phase 9.1.B — `db/local-db.js`)
- `createNote / updateNote` accept `body` as either a string (free) or an object (templated). `_buildBodyJson` serializes correctly.
- `setNoteLinks(noteId, links[])`, `listOutgoingLinks(noteId)`, `listBacklinks(toKind, toId)` — all functional, tested in 9.1.B.
- `srs.createCard({ entity_type, entity_id, template_id, source_note_id })` — exists; need new template ids for note-based cards.

### UI placeholder (Phase 9.1.C — `index.html`)
- 5 `note_type` segments wired (`v3NotesSetNoteType`).
- Non-free selection currently shows `⏳ Структурированная форма появится в Phase 9.3 — сейчас сохраняется как пустая заготовка.` banner.
- Title input shown for non-free; otherwise hidden.

### What's missing
1. **Structured forms** for the 4 templated kinds (M3).
2. **Linking UI**: add/remove outgoing links from current note; show backlinks panel (M4).
3. **Note → SRS conversion** button + auto-mapping of template fields to card front/back (M6).

---

## Template designs

Each form serializes to `body_json` as `{ kind: "<note_type>", ...fields }`. Required fields marked `*`. Fields are renderable to SRS card front/back per the table below.

### `word_study` — Hebrew vocabulary card

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `word` | text (HE) | * | The Hebrew word being studied |
| `niqqud_variant` | text (HE) | | Vowel-pointed form (`שָׁלוֹם`) |
| `root` | text (HE, 3 letters) | | Optional; will autocomplete in Phase 9.4 |
| `meaning` | text (RU/EN) | * | Translation/gloss |
| `part_of_speech` | select | | `noun / verb / adjective / adverb / preposition / pronoun / interjection / other` |
| `binyan` | select | | `pa'al / pi'el / hif'il / hitpa'el / nif'al / pu'al / huf'al` (only enabled when POS=verb) |
| `mnemonic` | markdown | | Memory aid |
| `example_sentence` | markdown | | Usage example |

**SRS mapping**: front = `word` (HE). Back = `meaning` + `niqqud_variant` (if present) + `mnemonic` (if present).

### `grammar_rule` — Hebrew grammar rule card

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `rule_title` | text | * | Short name (e.g., "smikhut on plural masculine") |
| `rule_body` | markdown | * | The rule explained |
| `examples` | array of strings | | Positive examples ("בית ספר") |
| `counterexamples` | array of strings | | What NOT to do |
| `tags` | array of strings | | `tense / agreement / construct / vowels / ...` |

**SRS mapping**: front = `rule_title`. Back = `rule_body` + first 2 examples.

### `translation_discrepancy` — debrief a translation that felt off

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `source_text` | text (HE) | * | Original Hebrew (1–3 sentences) |
| `translation_seen` | text (RU) | * | The translation that bothered the user |
| `translation_suggested` | text (RU) | | User's alternative |
| `reasoning` | markdown | * | Why the original is off / what nuance is lost |

**SRS mapping**: front = `source_text`. Back = `translation_suggested` (if present, else `translation_seen`) + `reasoning`.

### `pronunciation_note` — pronunciation tip

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `word` | text (HE) | * | What's being pronounced |
| `ipa` | text | | IPA transcription |
| `common_mistakes` | markdown | | What learners say wrong |
| `audio_anchor_ms` | INTEGER | | Already a top-level column — reuses Phase 9.2 chip in the meta-bar |

**SRS mapping**: front = `word`. Back = `ipa` (if present) + `common_mistakes`. (Audio playback from anchor is a Phase 9.4 enhancement.)

---

## Linking UX (M4)

- Below the body section in the modal, a new collapsible **"🔗 Связи"** panel.
- Two columns: **Outgoing** (this note → others) and **Backlinks** (others → this note).
- **Add outgoing**: button "+ Связь" → modal-in-modal with kind selector (`note / root / binyan / sentence / word`) + target picker. Already-implemented autocomplete from 9.1.C is reused for `note` and `root` kinds.
- **Remove outgoing**: click "✕" next to a chip.
- **Backlinks** are read-only — click navigates to the source note (which closes current modal and opens the linked one via `v3NotesOpen({ noteId })`).
- Bundle export/import already preserves `note_links` rows via 9.1.D; no schema change needed.

---

## SRS conversion (M6)

- For non-free notes only (free notes don't have natural card mapping).
- New button "🎴 Сделать карточкой" in the modal footer (between Delete and Save).
- On click: confirm dialog ("Создать SRS-карточку из этой заметки?") → create `srs_cards` row with:
  - `entity_type = 'note'`
  - `entity_id = noteId`
  - `template_id = 'tpl_note_<noteType>'` (new templates seeded by migration 026 — see below)
  - `source_note_id = noteId`
- Update `notes_v2.srs_card_id` to point at the new card.
- Button changes to "🎴 В SRS (готово ✓)" once converted; click navigates to the SRS card.
- Re-conversion blocked (one card per note in v3.2; multi-card-per-note deferred to v3.3).

### Migration 026 — note-card templates

```sql
INSERT OR IGNORE INTO srs_card_templates
  (id, code, label, card_kind, prompt_lang, answer_lang, front_schema_json, back_schema_json, answer_mode, is_active, sort_order)
VALUES
  ('tpl_note_word_study',              'note_word_study',              'Note: Word',          'note', 'he', 'ru', '{"prompt":"word"}',         '{"answer":"meaning","extra":["niqqud_variant","mnemonic"]}', 'reveal', 1, 100),
  ('tpl_note_grammar_rule',            'note_grammar_rule',            'Note: Grammar rule',  'note', 'he', 'ru', '{"prompt":"rule_title"}',   '{"answer":"rule_body","extra":["examples"]}',                 'reveal', 1, 110),
  ('tpl_note_translation_discrepancy', 'note_translation_discrepancy', 'Note: Translation',   'note', 'he', 'ru', '{"prompt":"source_text"}',  '{"answer":"translation_suggested","extra":["reasoning"]}',    'reveal', 1, 120),
  ('tpl_note_pronunciation_note',      'note_pronunciation_note',      'Note: Pronunciation', 'note', 'he', 'he', '{"prompt":"word"}',         '{"answer":"ipa","extra":["common_mistakes"]}',                'reveal', 1, 130);
```

The SRS trainer renders card front/back by reading `template_id.front_schema_json.prompt` + `back_schema_json.answer/extra` against `body_json` of the source note. (Existing sentence-template renderer logic to be extended.)

---

## Deliverable chunks

### Chunk 9.3.A — Plan + Templates (M3) — this commit
- This plan doc.
- HTML: new `v3NotesTemplateForm` container with field rows per kind.
- CSS: clean field group styling, dark-mode + focus-visible.
- JS: `v3NotesTemplateRender(noteType)`, `v3NotesTemplateCollect()`, `v3NotesTemplateHydrate(bodyJson)`.
- Save flow: when `note_type !== 'free'`, build `body` object from form, pass to createNote/updateNote.
- Open flow: hydrate form from `body_json` when modal opens an existing templated note.
- Remove "⏳ Phase 9.3 placeholder" banner for the 4 active types.
- i18n: ~25 keys per locale (field labels, placeholders, POS/binyan select options).
- Tests in `notes-v2-test.html`: roundtrip create+update for each of the 4 types; verify body_json shape.

### Chunk 9.3.B — Linking + backlinks (M4) — next commit
- HTML: new `v3NotesLinksPanel` collapsible below body.
- JS: `v3NotesLinksRender()`, `v3NotesLinksAddOpen()`, `v3NotesBacklinksRender()`.
- Click-to-navigate from a link.
- Bundle compat verified (no migration; existing 9.1.D code already covers `note_links`).
- 2 new test cases.

### Chunk 9.3.C — Note → SRS (M6) — third commit
- Migration **026** — seed 4 new `srs_card_templates`.
- HTML: footer button.
- JS: `v3NotesConvertToSrs()` with confirm dialog.
- SRS trainer renderer extension to handle `card_kind='note'` templates.
- 1 new test case + verify template seeding idempotent.

### Chunk 9.3.D — Final closure
- Closure report: `9_3_TEMPLATES_LINKS_SRS_REPORT.md`.
- CHANGELOG + PREMIUM_NOTES_PLAN_v3_2 flip 9.3 to [x].
- Final regression + remote prod smoke.

---

## Premium-quality bar

- **No regressions** in existing 47/47 notes-v2 + 23/23 events suites.
- **i18n complete** RU/EN/HE for every new string at ship time (no machine-generated placeholders for RU/EN).
- **Dark mode + RTL** verified in every UI change.
- **Auto-save** continues to work for templated forms (debounced same 30 s).
- **Bundle roundtrip** preserves templated body + links + srs_card_id.
- **Backwards-compat** with existing free-text notes (no migration of body_json for existing data; existing notes stay as `{markdown: "..."}`).
- **A11y**: `:focus-visible`, `aria-label` on icon-only buttons, `aria-expanded` on collapsibles.
- **Empty-state UX**: empty templated forms show graceful placeholders, not "undefined".

---

## Acceptance criteria

1. User can click each of the 4 non-free `note_type`s, fill the structured form, click Save, close, reopen → all fields restored.
2. Switching `note_type` while editing preserves field values via `v3NotesBodyStashByType` (already in place from 9.1.C — just needs to handle structured bodies).
3. Add 3 outgoing links of mixed kinds (note + root + binyan) → close → reopen → all 3 visible.
4. Backlinks panel shows the right reciprocal entries when another note links to this one.
5. Click "🎴 Сделать карточкой" on a `word_study` note → SRS card created → re-opening the note shows "✓ В SRS"; the new card appears in `/srs` trainer.
6. Bundle export + reimport → templated body + links + srs_card_id roundtrip.
7. Remote prod smoke shows all of the above working after Railway redeploy.
8. 47 + N notes-v2 tests pass; 23/23 events; 0 new JS errors.
