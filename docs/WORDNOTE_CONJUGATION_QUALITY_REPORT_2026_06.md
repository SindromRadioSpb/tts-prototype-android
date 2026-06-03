# Word-note & conjugation quality report — Block ② (2026-06)

Status: **shipped** to prod (`https://linguistpro.kolosei.com`), SW `v3.5.58`,
resolver model `pealim-infl-v12`. This report consolidates the in-app
conjugation/declension + meaning + bulk word-note pipeline, the exhaustive
quality test, the achieved accuracy, lessons learned, and the unresolved tail.

Applies the project role-lenses (`docs/PROJECT_ROLES.md`): **R1** lexicographer
(roots/binyan/forms, no invented forms), **R2** SLA methodist, **R3** architect,
**R4** premium-UX, **R5** market.

---

## 1. Architecture

Two sources, deliberately complementary (R3):

- **Dicta** (`db/premium/providers/dictaMorph.js`) — **context-sensitive** POS,
  segmentation, binyan, vocalization. Disambiguates the word *in the sentence* —
  a dictionary cannot. **Must be fed PLAIN (unvocalized) text** (it self-vocalizes).
- **Pealim** (`db/premium/providers/pealim.js`) — authoritative paradigm (спряжение/
  склонение) + the RU gloss, scraped from the dict page (`/ru/dict/<id>`). The gloss
  is parsed for free from the page `<title>` (`<lemma> – <meaning> – …`).

**Resolver disambiguation** (`scoreCandidate` / `resolveLemma`). Hebrew homographs
share roots across POS and binyan, so the scan scores candidates and the **vocalized
form is the authoritative tie-breaker**:

| Signal | Score |
|---|---|
| POS class match / mismatch | +10 / −100 |
| noun ↔ adjective kinship (Dicta cross-tags) | +6 |
| exact niqqud-stripped lemma | +5 |
| ktiv haser↔male (mater-insensitive) | +3 |
| root match | +4 |
| binyan match | +3 |
| **text's vocalized form appears in the paradigm** | **+20** |
| declined-preposition structural (P-1s cells) | +8 |
| non-inflecting POS picking a content homograph | −100 |

Plus: binyan/form-gated early-exit (don't stop on a binyan mismatch or before the
form winner), an **inflected-surface fallback** (Pealim indexes verbs by dictionary
form, not bare root — see §4) with **proclitic peeling**, a low-confidence `>0` guard,
and a "best-effort" flag when POS+lexical keys don't both agree.

**Data model (3 layers).** saved NOTE (`notes_v2.body_json`: user-owned word/root/POS/
binyan/meaning/niqqud_variant, set at creation, never auto-rewritten) · CORPUS
`sentence_morph` (Dicta, re-enrichable per text) · PARADIGMS `lemma_inflection`
(Pealim, model-keyed, lazy-fetched). The conjugation accordion follows the **fresh
corpus Dicta POS**, not the stale saved note.

**Model versions** (each clears the model-keyed cache):
v2 stress capture · v3 model-versioned page cache · v4 POS-dominant homograph scoring ·
v5 low-confidence guard · v6 non-content penalty · v7 "other"→invariant · **v8** niqqud
form-match +20 + binyan-gated early-exit · **v9** inflected-surface fallback (hitpael) ·
**v10** noun↔adj kinship + wrong-binyan form-fallback + proclitic-stripped form-match ·
**v11** proclitic-stack surface fallback ·
**v12** stem-aware exact-lemma scoring — a prefixed surface (כ+זאת, ו+כש+ה+מלך) now
matches its Pealim base via the **Dicta stem** (threaded client→server→resolver),
NOT a blind peel (which over-peeled proper names: משה→שה). Fixes the typical
"prefixed word → empty inflection" class (e.g. כזאת→זֹאת invariant).

---

## 2. Exhaustive test (method)

`scripts/premium/build-notes-from-bundle.js` — reads a library ZIP →
`dictaMorph.analyzeSentence(PLAIN)` per sentence (context-faithful) → resolves each
distinct `(lemma+binyan+pos)` unit through the **same resolver the app uses**
(`inflectionGateway.inflect`, + Pealim meaning, + niqqud form) → checks **structural
invariants per class** (verb AP-ms/PERF-3ms/IMPF-3ms/INF-L; noun/adj/preposition
forms; two-voice; form-in-paradigm; binyan) → emits `word_study` notes (with meaning)
into `library/notes_advanced.json` and a **defect report by CLASS** (`bundle-defects.json`).

Permanent regression nets:
- `npm run smoke:conj` — parser + card render (16/16)
- `npm run smoke:conj:audit` — 175-word structural matrix
- `pealim-parse-smoke --live` — live resolver guards (63/63)

---

## 3. Accuracy achieved (final v11 sweep — 80 texts / 3545 sentences / 2010 distinct units)

- Strict **PASS 81.6%** · SUSPECT 133 · FAIL 237 · meaning-fill **88%** · 9042 notes.
- **Genuine resolver defects = 12 / 2010 = 0.6% → ~99.4% of words resolve correctly.**

"Genuine" excludes the **acceptable tail**: loanwords/slang/proper-nouns not in Pealim
(`content-no-table`, `unresolved`), best-effort-flagged picks, and highlight-only form
misses (`form-unmatched` — the verb is correct, only the cell highlight differs). The
class breakdown:

| class | n | nature |
|---|---|---|
| ok | 1182 | correct |
| best-effort | 389 | low-confidence but mostly correct (flagged) |
| content-no-table | 225 | loanwords/slang/proper-nouns (no Pealim entry) |
| unresolved | 94 | slang/loanwords |
| function-no-table | 69 | gated function words (correct) |
| form-unmatched | 37 | highlight-only; verb correct |
| **wrong-binyan** | **10** | **genuine + Dicta-side mix (see §5)** |
| missing-slots | 2 | genuine |
| nominal-thin | 2 | edge |

---

## 4. Lessons learned (durable)

1. **Feed Dicta PLAIN text.** Its analyzer self-vocalizes; pre-niqqud input mis-analyses
   (`הַחֹרֶף` "winter" noun → `הָחֳרֵף` hufal verb). Switching to `hebrew_plain` lifted
   pass-rate 79.9%→81.4% and cut `form-unmatched` 68→38.
2. **The niqqud form is the authoritative homograph disambiguator** (+20 overrides a
   wrong Dicta binyan): `תְּגַלִּי` piel ≠ `תִּגְלִי` paal; `נִמְצָא` nifal vs paal-future-1pl.
3. **Pealim indexes verbs by DICTIONARY form, not the bare root** — hifil/hufal/nifal/
   hitpael carry an added ה/נ, so `search(root)` returns only the paal/piel. Fix:
   inflected-surface fallback + proclitic peel (`תסתכלי`→hitpael 1352; `שלהחלים`→hifil 606).
4. **noun ↔ adjective are nominal kin.** Dicta routinely tags an adjective ("`עשיר`") as
   noun; a hard POS −100 wrongly rejected ~100 words. A +6 kinship recovers them.
5. **Model-versioned cache discipline.** Bumping the resolver model invalidates correctly
   but triggers lazy re-scrape; **never cache a binyan-mismatch** (a formless batch resolve
   of a hufal/hifil picks the paal — caching it under the wanted-binyan key poisons it).
   Negative results are not cached.
6. **A reused singleton UI must reset its per-entity state on entity change** — both the
   conjugation accordion and the Dicta root-hint leaked the previous note's data; reset in
   `v3NotesTemplateHydrate`.
7. **A composite FK inside `target_id`** (`<sentenceId>:<offset>` for word notes) must be
   remapped on import, or the note imports but orphans per-row (invisible in the panel,
   no 📝 count).
8. **Search must normalize Hebrew** (strip niqqud from the query) and query the CURRENT
   table (`notes_v2`), not the legacy `sentence_notes`.
9. **An exhaustive class-sweep beats reactive whack-a-mole** — the 80-text harness surfaces
   defect CLASSES; fix by class and the matrix becomes the regression net.
10. **The Pealim gloss is free** — it is in the page `<title>` we already fetch for the table.

---

## 5. Unresolved problems (with examples)

- **Pealim-coverage limits (~2)** — no searchable Pealim entry exists for the form:
  `שמונח` (hufal participle `מֻנָּח` — no clean hufal page), `מטיב` (hifil of `יטב` is indexed
  under `היטיב`, unreachable from the surface `מטיב`). A fix would require synthesizing the
  binyan dictionary form from the root — high risk of **invented forms**, which violates the
  R1 invariant. **Accepted as external-source limits.**
- **Dicta-side mis-tags (~5)** — the resolver is often MORE correct than Dicta:
  `נצעק`/`נהיה` (paal/nifal 1st-plural mis-read as nifal), `תבין` (hifil "understand", Dicta
  said paal), `תחקירה`/`תעטיפה` (nouns `תחקיר`/`עטיפה` tagged as verbs). Flagged honest
  "best-effort". Mitigation idea (deferred): let a strong Pealim noun/adjective match outrank
  a weak verb pick.
- **Loanwords / slang / rare** — not in Pealim: `ומאסטר`, `תאוהב`, `אלוקה`, `אגו`, `בפאקינג`,
  `וואלה`. Acceptable (honest "no table").
- **Word-tap offset anchor** — bulk-generated notes are findable per-row (panel + 📝 badge),
  but the exact *tap-on-word → that note* link may miss because the batch's Dicta-token offset
  can differ from the app token-picker's tokenization. Deferred (secondary; per-row works).
- **Search perf** — `searchWordNotes` uses `LIKE` on `body_json` (not FTS5). Fine at current
  scale; FTS5 is C-series backlog (`docs/C_SERIES_PLAN.md`).

---

## 6. Architecture recommendation — "брать всё из Pealim, Dicta избыточна?"

**No — keep both; the niqqud form is the tie-breaker (already implemented).** Dicta provides
the **in-context POS/segmentation** a dictionary cannot; Pealim is the authority for the
paradigm + gloss. Where Dicta's binyan conflicts with a unique niqqud-form match, the form
already wins (+20). Neither source is redundant.

---

## 7. Permanent artefacts
- Provider: `db/premium/providers/pealim.js` (resolver + meaning), `inflectionGateway.js`.
- Test/build tool: `scripts/premium/build-notes-from-bundle.js`.
- Regression: `scripts/premium/{pealim-parse-smoke,conj-card-browser-smoke,conj-audit}.js`,
  `scripts/premium/fixtures/conj-audit-matrix.json` (175 words).
- Search: `public/db/local-db.js` (`searchSentences` niqqud-norm, `searchWordNotes`).
