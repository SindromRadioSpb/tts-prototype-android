# ⑤ Anki — hardening plan + manual smoke-check (audit 2026-06-19)

> Pre-B2 audit (owner-asked): bottlenecks / undiscussed requirements across **A** (export), **B** (read-back), and the
> **Anki system as a whole** (web / Desktop / mobile). Method: 3-dimension adversarial audit workflow. **Verdict: real,
> worthwhile gaps exist** — a cluster with ONE root cause: **cross-surface note-identity inconsistency.** This doc is the
> plan (FOR APPROVAL — touches already-shipped export/read-back behavior) + a manual smoke-check for live validation.

## Root cause (one sentence)
The three Anki write/read paths use **incompatible identity**: the `.apkg` builder sets a stable `word:<lemmaKey>` GUID +
tags `['lp','lp_word','lp_pos_X']`; the AnkiConnect push lets Anki auto-GUID, dedups by `Word`+`tag:lp_word`, and stamps
the per-note `lp_note_<id>` tag; the read-back maps **only** by `lp_note_<id>`. So the recommended **universal `.apkg`
path is invisible to the read-back, collides on re-import, and risks model drift.**

## Gaps (prioritized)

### P0 — the identity cluster (MAJOR; closes 4 bugs with one brick)
- **G1. Read-back is a silent no-op for `.apkg` users.** `v3AnkiFetchWordReviewStates` (index.html ~15188) maps cards→notes
  by `lp_note_<id>`; `.apkg` cards lack it → counted `untagged` and skipped → «нет карточек / изменений нет» even though
  the user studied them. The unique B feature delivers value to almost nobody on the recommended transport. *(major, the
  headline read-back fails silently for its primary audience.)*
- **G2. Lean global export clobbers rich modal cards.** Both surfaces emit Word v2 under the SAME `word:<lemmaKey>` GUID,
  but the Trainer/global export is LEAN (no Conjugation/Example/Audio) while the modal is RICH. Anki overwrites ALL fields
  on GUID match → re-importing the global deck **strips** conjugation/example/audio from a previously-rich card (silent
  data loss). The design only reasoned about same-deck idempotency. *(major)*
- **G3. push-then-`.apkg`-import duplicates cards.** AnkiConnect-pushed cards (Anki-auto GUID) and `.apkg` cards
  (`word:<lemmaKey>` GUID) diverge → a user who used both gets DUPLICATES, not updates. *(major)*
- **G4. Model field drift / no version guard.** «LinguistPro Word v2» / «SRS Card v1» are create-if-missing-**by-name**
  (`v3AnkiEnsureWordModel`) with no field-equality check; `.apkg` pins `LP_MODEL_ID` while AnkiConnect lets Anki assign an
  id → same NAME, different model identity, and an older/divergent field set risks positional field-shift / data loss. *(major)*

**The fix — one shared identity module** (`public/db/anki-identity.js`, UMD; imported by `anki-srs-export.js` +
`index.html` AnkiConnect path):
1. **Canonical tags** incl. a **local-resolvable `lp_lemma_<key>`** stamped by BOTH transports (`.apkg` + AnkiConnect push)
   on every word card, where `<key>` = the shared `lemmaKey(body)`.
2. **Read-back maps by `lp_lemma_<key>`** → fan a lemma's mastery out to **ALL** `word_study` notes sharing that lemma
   (a new `local-db` helper `notesByLemmaKey`). Keep `lp_note_<id>` as a fast-path. This also fixes a latent AnkiConnect
   gap (per-form notes that were never the canonical exported note never light up). [G1]
3. **One GUID scheme + one model identity across transports** — AnkiConnect push adopts the same `word:<lemmaKey>` GUID
   (Anki `addNote` supports an explicit note `guid`? if not, dedup by the `lp_lemma_` tag) and the same model spec/id so
   `.apkg` and push produce mergeable, non-duplicating cards. [G3, G4]
4. **Pin the model**: a version-safe model name and a field-order assertion (the existing `smoke:anki-wordcard` static
   field-reference check, extended to fail on field drift). [G4]
5. **Unify the global Trainer export on the RICH builder** (resolve paradigm/example/audio there too — lazily/capped) so
   a re-import never downgrades; OR give lean vs rich **distinct decks/GUIDs**. (Prefer unify.) [G2]
Effort: **M–L.** Highest leverage — closes G1–G4. Gate: extend `smoke:anki-srs-export` (lemma tag on both, read-back
lemma-fan) + a cross-transport identity parity test.

### P1 — large-deck performance (MAJOR)
- **G5.** A ~1,924-card global export with embedded audio: no progress UI, no per-fetch timeout/AbortController, no cap,
  **serial** audio+paradigm awaits, all-in-memory zip → multi-second main-thread freeze or **OOM/hang on mobile**.
  *(major for the global Trainer export; the modal per-text deck is bounded.)* **Fix:** progress indicator + `AbortController`
  timeout per `/api/audio` fetch + a soft cap/warn (e.g. >N cards or >M MB) + bounded concurrency; consider a Worker for
  the sql.js build. Effort **M**.

### P2 — UX / discoverability (MINOR)
- **G6.** Two `.apkg` surfaces are undiscoverable/inconsistent (global-lean Trainer vs per-text-rich modal; the modal hides
  under the «Экспорт в Anki (AnkiConnect)» title that reads Desktop-only). **Fix:** relabel — Trainer = «Скачать весь
  словарь (.apkg)», modal = «Скачать карточки этого текста (.apkg)»; retitle the modal header «Экспорт в Anki» (the `.apkg`
  is the universal/mobile path, AnkiConnect is its local twin); one helper line per surface stating scope + richness;
  ideally consolidate to one entry with a this-text/whole-vocab toggle. Effort **S–M**.
- **G7.** Minor: custom deck-name ignored for «both»; date-only filename collisions; front-mode select ignored for `.apkg`
  sentences; friendlier offline/engine-load error; pre-build card count. Effort **S** each.
- **G8. B UX:** read-back discoverability (buried in the modal — it's the unique feature); no post-sync feedback that
  «Следующий для тебя» improved (show the i+1 delta); no in-app guidance for AnkiConnect `webCorsOriginList` + the Chrome-142
  Local-Network-Access prompt; the LOCAL_MODE gate should say «на телефоне недоступно» honestly. Effort **S–M**.

### P3 — B2 retention surfacing (the known residual; task #9)
- Recorded `source='anki'` retention events are not aggregated/shown in the teacher/research dashboard. Touches the
  privacy-sensitive Direction 11 (opt-in, k=5); pilot postponed → **PROPOSE a design first** before code.

## Recommended sequencing
**P0 (shared identity module)** → **P1 (large-deck perf)** → **P2 (UX polish)** → **P3 (retention, propose).** P0 is the
one that makes the shipped read-back actually deliver value to the universal/mobile audience and stops silent data loss —
do it before any teacher-dashboard work.

## Manual smoke-check (run on a real machine + phone — the live Anki round-trips are owner device-smoke)

### Setup
- Desktop: install **Anki Desktop** + the **AnkiConnect** add-on (code `2055492159`); in AnkiConnect config add your app
  origin to `webCorsOriginList` (`https://linguistpro.kolosei.com` and/or `http://localhost:3000`); restart Anki.
- Have a phone with **AnkiDroid** (Android) or **AnkiMobile** (iOS).
- In LinguistPro: have a text open with several ②-word notes + a few sentences (some with audio).

### A — Export (`.apkg`, universal)
1. **Trainer global:** 🎯 SRS Тренажёр → «📦 Скачать .apkg (словарь)». Expect a file `LinguistPro-Words-<date>.apkg`.
   - Desktop: import → deck **LinguistPro::Words** appears; open a card → Hebrew front, Russian+root+binyan+pos back;
     model **LinguistPro Word v2**; tap audio → device TTS speaks the word. Count cards ≈ unique lemmas (not note count).
   - **Re-import the same file** → Anki says "updated", **no duplicates**.
2. **Modal per-text:** open a text → «Anki» → choose **Слова** / **Предложения** / **Оба** → «📦 Скачать .apkg».
   - Import → word cards show the **conjugation table + example sentence**; sentence cards in **LinguistPro::SRS**;
     with «озвучка» ON, the example/sentence **plays embedded audio** (not just TTS).
   - **«Оба»** → ONE file imports BOTH decks (Words + SRS).
3. **Mobile:** open a `.apkg` from Files/share → AnkiDroid/AnkiMobile imports it → cards + audio play. (No AnkiConnect needed.)
4. **⚠ KNOWN-BUG CHECK (G2):** export the **modal rich** deck, import; THEN export the **Trainer global lean** deck for the
   same words, import → check whether the rich cards LOST their conjugation/example/audio. (Expected today: yes — confirms G2.)
5. **⚠ KNOWN-BUG CHECK (G3):** export+import via `.apkg`, THEN push the same text via «Экспортировать» (AnkiConnect) →
   check for **duplicate** cards. (Expected today: duplicates — confirms G3.)

### B — Read-back (Desktop-local only)
6. **AnkiConnect path (works today):** open a text → «Anki» → «Экспортировать» (AnkiConnect push, Anki Desktop open).
   Study a few of those cards in Anki (grade them). Back in LinguistPro → «Синхронизировать из Anki».
   - Expect a toast like «обновлено N… удержание X%». Re-open the text → the studied words now read as **«известно»**
     in «Следующий для тебя» / coverage; the i+1 recommendations shift.
   - Re-click sync → idempotent (no double-count).
7. **⚠ KNOWN-BUG CHECK (G1):** instead export those words via **`.apkg`** (not AnkiConnect), import into Anki, study them,
   then «Синхронизировать из Anki» → expect **«нет карточек LinguistPro»** / no change (confirms the read-back doesn't see
   `.apkg` cards — the headline gap).
8. **Phone-honesty:** on a phone, confirm «Синхронизировать из Anki» is unavailable / clearly explained (AnkiConnect is
   Desktop-only; no read API on mobile).

### Whole-system / platform matrix (what should hold)
| Path | Web (remote) | Desktop | Mobile |
|---|---|---|---|
| `.apkg` export + import | ✅ download, manual import | ✅ | ✅ (AnkiDroid/AnkiMobile) |
| AnkiConnect push | ❌ (localhost) | ✅ (Anki open + CORS + LNA) | ❌ |
| Read-back (sync) | ❌ | ✅ (same conditions) | ❌ |
9. Confirm the UI never offers a path that can't work on the current platform (esp. no «sync» promise on mobile).
10. **Model drift (G4):** if you have an OLD «Word v2»/«SRS Card v1» model in Anki from a prior version, importing a new
    `.apkg` → check fields don't shift/mismatch.

> Report back which KNOWN-BUG checks reproduce (G1/G2/G3/G4) — that confirms the audit + prioritizes the P0 fix.
