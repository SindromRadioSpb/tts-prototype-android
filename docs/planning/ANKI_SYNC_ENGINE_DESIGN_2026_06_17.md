# ⑤ Anki-sync engine — recon design (FOR OWNER APPROVAL, no code yet)

> Status: **DESIGN / awaiting owner decision.** Created 2026-06-17. Per the «крупная фича → recon-дизайн НА УТВЕРЖДЕНИЕ
> перед кодом» norm. Roles R1–R10 applied. Reconciles with the standing v3.2 SRS decision
> (`docs/SRS_STRATEGY_v3_2.md`; memory `project_srs_strategy`): **LinguistPro = creation + linkage layer; Anki = review
> layer; in-app Trainer = intentional stub; FSRS + Anki-Connect bidirectional sync = deferred to a v3.4 «Premium SRS
> Epic».** Choosing «⑤ Anki design» **opens that epic** — this doc scopes it honestly.

## 0. TL;DR — the decisive architectural fact
The existing Anki integration is **AnkiConnect-only** (`server.js` `ankiInvoke` → `http://127.0.0.1:8765`,
`ANKI_CONNECT_PORT` `:4530`, endpoints `/api/srs/export/anki{,/preview,/status}` `:7150–7430`, repo `db/ankiExportRepo.js`,
table `srs_card_exports`). **There is NO `.apkg` file generation anywhere in the repo** (the `archiver`/`JSZip` usage is for
library/works bundles, not Anki). Consequences:

- AnkiConnect is **local-only**: the *server* calls *its own* `127.0.0.1:8765`. On the prod Hetzner container there is no
  Anki there → **the live export is non-functional for every remote user.** It works only when the LinguistPro server and
  Anki Desktop run on the *same* machine (your local dogfooding).
- A **browser→AnkiConnect** bridge from the prod `https://linguistpro.kolosei.com` PWA is **blocked** (mixed-content
  `https→http://127.0.0.1` + AnkiConnect CORS allowlist). So there is no clean client-side bridge either.
- **Net:** today a real remote user has **no working way to get a card into Anki**, and **no read-back at all**. The
  «Anki Export v1 baseline» in the roadmap is a *local-dev* capability mislabelled as shippable.

**This is the thing to decide around — not «build a sync engine», but «what is the honest, deploy-safe Anki path for
remote users, and how far into bidirectional sync do we go».**

## 1. What exists today (verified)
| Layer | Artifact | State |
|---|---|---|
| Card model | `srs_cards` (migration 010): state/due_date/interval_days/ease_factor/reps/lapses/meta_json | live (SM2 v1, not FSRS) |
| Export idempotency | `srs_card_exports` (migration 016): provider/card_id/external_note_id/export_hash; `db/ankiExportRepo.js` (`getSrsCardExport`/`upsertSrsCardExport`/`computeSrsExportHash`) | live |
| Push (AnkiConnect) | `server.js` `buildSrsAnkiPreview` (`:5029`), `ankiInvoke` (`:4799`), model «LinguistPro SRS Card v1» 17 fields, deck `LinguistPro::SRS::<level>` | live **but local-only** |
| Read-back plumbing | `public/db/local-db.js` `applyAnkiReviewStates` (`:2148`), `recordAnkiReviews` (`:2225`); pure mapper `v3AnkiCardStatsToLocalState` (`scripts/premium/anki-sync-smoke.js`) | **scaffolded, NOT wired to a live pull** |
| In-app Trainer | `public/check_script.js` `v3SrsTrainer*` (`:8937–9200`), modes reveal/typing/listening/cloze | intentional stub (no FSRS) |
| i+1 mastery source-of-truth | `public/js/corpus-vocab.js` (`CFG` zone 0.70–0.90) ← `getKnownWordStates` (`local-db.js:2101`) joins `word_study` notes + SRS overlay; lemma key `pid:<id>` else `<norm>#<pos>` | live |
| Notes → cards | `notes_v2` `word_study` (word/niqqud/root/binyan/meaning/**pealim_id**) + S10 «💾 В заметки» writes word_study w/ `pealim_id` + bilingual `body.context` | live (Зал shipped) |
| Gates | `scripts/premium/anki-sync-smoke.js`, `anki-lifecycle-smoke.js` (pure, no Anki needed) | live |

**Gap to a real product:** (a) no universal export for remote users; (b) the rich new fields (`pealim_id`/root/binyan/S10
context/keyless audio) are **not** mapped into the exported card; (c) read-back is unwired, so the diploma **retention
metric** (`cards_exported / cards_added` proxy → real retention) and **Anki-fed i+1 mastery** don't exist.

## 2. The hard constraint, stated plainly (R3 architect · R4/R5)
AnkiConnect requires Anki **Desktop** + the AnkiConnect addon, reachable on the caller's `127.0.0.1:8765`. There are
exactly three transport options, with their reach:

| Transport | Works for | Read-back? | Deploy-safe? |
|---|---|---|---|
| **`.apkg` download** (generate package, user imports) | **everyone** — Desktop, AnkiDroid, AnkiMobile; offline; no addon | ❌ one-way | ✅ yes |
| **AnkiConnect, server-side** | only when server == user's machine (local dev / you) | ✅ yes | ❌ no (prod can't reach user localhost) |
| **AnkiConnect, browser-side** | local power-user willing to disable mixed-content / configure CORS | ✅ yes | ⚠️ poor UX |

**There is no transport that is both deploy-safe for remote users AND bidirectional.** Read-back is *intrinsically* a
local / power-user / managed-cohort capability. Any honest design must split «universal one-way» from «local two-way».

## 3. Options (R-lensed)

### Option A — Universal `.apkg` export v1  ⟵ recommended first
Server generates a **real Anki package** (`collection.anki2` SQLite [col/notes/cards/revlog/graves] + `media` map, zipped
to `.apkg`) from the user's SRS cards / `word_study` notes, streamed as a download from the PWA (Studio Trainer + the Зал
«В заметки» surface). Rich card built from the new fields: Hebrew(+niqqud), Russian, **root/binyan/pealim_id**, meaning,
S10 **bilingual context** sentence, and **keyless TTS audio** embedded as media (`[sound:lp_<key>.mp3]`, opt-in / v1.1).
Stable per-card **GUID** (derived from lp card id / `pid:<id>`) so re-importing an updated deck **updates** notes instead
of duplicating (Anki dedupes on GUID). Reuses `srs_card_exports.export_hash` for change-detection.
- **Reach:** every user, every platform, offline, no addon. **On-strategy:** finishes «creation + linkage» without an
  in-app scheduler. **R1:** card faithfully carries root/binyan/niqqud (no fabricated morphology). **R2/R5:** the real
  «move to your review tool» path the v3.2 decision promised but never shipped for remote users.
- **Effort:** ~medium (3–5 d). The work is the package builder + a golden gate.
- **Risks:** a valid `.apkg` is fiddly (model JSON, `sfld`/`csum` first-field checksum, due/queue defaults, schema
  version). **Mitigation:** hand-rolled, fully-understood builder (owner norm «без заглушек/без чёрных ящиков») + a
  re-open-and-validate smoke `smoke:anki-apkg` (unzip → open SQLite → assert schema/notes/dedupe-GUID/round-trip). Audio
  bloat → text-first v1, audio opt-in v1.1.

### Option B — AnkiConnect bridge, **repositioned as local / power-user + read-back**
Finish the *bidirectional* loop for users who run LinguistPro **locally** alongside Anki Desktop+AnkiConnect (you, a
managed research cohort): keep server-side push, and **wire the read-back pull** (`findCards`/`cardsInfo`/
`getReviewsOfCards` → existing `v3AnkiCardStatsToLocalState` → `applyAnkiReviewStates`/`recordAnkiReviews`) → feeds the
**research retention metric** (`docs/ULPAN_RESEARCH_PLAN_v3_2.md`) and **Anki-fed i+1 mastery** (`getKnownWordStates`
overlay → `corpus-vocab` zone). **Must be documented as local-only** (a settings toggle + honest «requires Anki Desktop on
this machine» gate; never offered to a prod remote user as if it would work).
- **This is where the genuine «sync engine» value lives** — but it is inherently local. **R5 honesty:** do not market a
  localhost feature as a cloud one (cf. the Windows-curl egress-myth lesson — don't ship a capability that silently can't
  reach its target).
- **Effort:** ~the deferred v3.4 «3–4 d Anki Connect sync», + the local-only UX gating.

### Option C — Full v3.4 Premium SRS Epic (in-app FSRS + bidirectional)
Build an FSRS scheduler + premium Trainer + sync. **Re-opens the «don't duplicate Anki» decision** the owner already
made. Not recommended now; listed for completeness.

## 4. Recommendation
**A first** (universal, deploy-safe, completes the linkage layer for *every* user, fully on-strategy), then **B as an
explicit opt-in LOCAL / research-cohort capability** (delivers read-back → the diploma retention metric + Anki-fed
mastery, honestly gated to local setups). **Defer C.** This converts «Anki-sync engine» from an architecturally-blocked
slogan into two honest, shippable bricks.

## 5. Decision points for the owner (the fork — пользователь решает)
1. **Scope this round:** A only · A + B · B only (you dogfood locally) · rethink.
2. **Read-back now?** Is the retention metric / Anki-fed i+1 needed for the diploma cohort *now* (→ B, local-only), or is
   one-way universal export enough for now (→ A)?
3. **Export surface:** Studio Trainer (existing `btnAnki`) · the Зал (where S10 word_study notes are born) · both.
4. **`.apkg` builder:** hand-rolled (full control, zero black-box, matches «без заглушек») vs a vetted npm lib (faster,
   external dep). Recommend hand-rolled + golden gate.
5. **Audio in cards:** text-only v1 (smaller, simpler) vs embed keyless-TTS mp3 media (richer, heavier) — recommend
   text-first, audio v1.1.

## 5a. APPROVED 2026-06-17 — scope **A + B** (owner)
Owner chose **A + B together**. Secondary defaults (doc §5, owner may redirect): builder **hand-rolled** (sqlite3 +
archiver, no black-box dep — toolchain verified present) · audio **text-first v1**, keyless-TTS media in v1.1 · surface
**Studio Trainer (`btnAnki`) first**, Зал «В заметки» export next · read-back **B is honestly local-only gated**.

### Phased plan
- **A1 — `.apkg` builder lib — ✅ DONE 2026-06-17.** `lib/ankiApkg.js` (hand-rolled, sqlite3+archiver, no black-box
  dep) builds a legacy `collection.anki2` (ver 11) + media-zip → `.apkg` Buffer; stable per-card GUID (`stableGuid`,
  genanki-shaped base91) → idempotent re-import; correct `csum`/`sfld`/`req`; fixed deck/model ids merge on re-import.
  Gate `smoke:anki-apkg` **30/30** (unzip → open SQLite → assert schema/fields/csum/guid-idempotency/cards/empty-deck).
  **Open for A2:** confirm where the user's SRS cards live (server `srs_cards` + `getCardSnapshotById`/`buildSrsAnkiPreview`
  vs OPFS — the app went OPFS-first with stateful endpoints 410'd; the Anki export endpoints are server-side). Real-Anki
  *import* test = owner device-smoke (the gate validates structure, not a live Anki round-trip). **Original A1 spec:**
- ~~A1 — `.apkg` builder lib~~ (`lib/ankiApkg.js`): pure Node, builds a legacy `collection.anki2` (schema ver 11) — `col`
  (models/decks/conf JSON), `notes` (`guid` stable per lp card / `pid:<id>`; `flds` `\x1f`-joined; `sfld`; `csum` = first
  8 hex of sha1(first field)), `cards` (new: type/queue 0, due=ordinal), zipped with `media` map → `.apkg`. Model
  «LinguistPro SRS Card v1» reusing the existing 17-field spec + adding Root/Binyan/PealimId/Context. Gate
  `smoke:anki-apkg`: build → unzip → open SQLite → assert schema/notes/csum/dedupe-GUID/round-trip. **Self-contained,
  no browser/OPFS — the foundational brick.**
- **A2 — CLIENT-side export (owner chose client build 2026-06-17).** The server has NO user data (OPFS-first;
  `texts` empty in prod, `server.js:342`); precedent `exportBundle` is client-side; wa-sqlite has no serialize →
  client uses vendored sql.js.
  - **A2a — engine — ✅ DONE 2026-06-17.** Shared core `public/db/anki-apkg-core.js` (UMD, pure-JS SHA-1
    byte-equal to crypto, all col-JSON/DDL/csum/guid/`prepareCollection`); `lib/ankiApkg.js` refactored onto it
    (server sqlite3+archiver adapter); **client `public/db/anki-apkg.js`** (sql.js+jszip → `buildApkgBytes`/
    `buildApkgBlob`/`downloadApkg` + lazy-loaders); sql.js vendored `/db/sql-wasm.{js,wasm}` (lazy, only on export).
    Gates `smoke:anki-apkg` **36/36** + `smoke:anki-apkg-client` **21/21** (server↔client PARITY identical
    guids/flds/csum/col-JSON; valid collection; idempotent; empty deck). Headless.
  - **A2b — wiring — ✅ DONE 2026-06-17.** v1 exports **word_study notes** (the S10/②-vocabulary — the simplest
    high-value path; sentence-card export via the 17-field model is a follow-up). `public/db/anki-srs-export.js`
    (`buildWordStudySpec` → purpose-built «LinguistPro Word v1» model: Word/Niqqud/Root/Binyan/POS/Meaning/PealimId;
    He→Ru template; lemma-dedup; stable per-lemma GUID). OPFS query `listWordStudyNotesForExport()` (local-db.js).
    «📦 Скачать .apkg (словарь)» button + `v3SrsDownloadApkg()` in the Studio Trainer home — **edited `index.html`
    inline (the live source); `check_script.js` is a gitignored dead copy (TRAP — see lessons)**. 3 UMD scripts loaded
    in index.html + added to SW PRECACHE_URLS (sql.js stays lazy); SW bumped **v3.10.72-anki-apkg**. Gate
    `smoke:anki-srs-export` **14/14**. Browser-verified @380px dark: globals load, OPFS query runs, **real in-browser
    sql.js(27ms)+jszip pipeline → valid Anki collection** (re-opened), button renders + wired, empty-path graceful,
    0 console-errors. Real-profile export→Anki-import = owner device-smoke. **NEXT follow-ups:** Зал surface · sentence-card export.
- **B1 — AnkiConnect read-back (local-only)**: wire the live pull (`findCards`/`cardsInfo`/`getReviewsOfCards`) →
  existing `v3AnkiCardStatsToLocalState` → `applyAnkiReviewStates`/`recordAnkiReviews`; settings toggle + honest
  «requires Anki Desktop on this machine» gate; never offered to a remote prod user as functional.
- **B2 — feed read-back into value**: research retention metric (`ULPAN_RESEARCH_PLAN_v3_2`) + Anki-fed i+1 mastery
  (`getKnownWordStates` overlay → `corpus-vocab` zone).

## 5b. Q2/Q3 feasibility study — 2026-06-18 (owner-asked: unify export · rework Trainer? · Desktop/Mobile sync "unique"?)
Research: 3 agents (AnkiConnect-export map · Trainer architecture · Anki-sync tech + competitive, sourced).

**Q2 — unify `.apkg` to words/sentences/both; rework Trainer?** The live «Экспорт в Anki (AnkiConnect)» modal
(`v3AnkiModal`, index.html ~11356) ALREADY offers 3 options with RICHER models than A2b: words → **`LinguistPro
Word v2`** (11 fields incl. full conjugation paradigm + mnemonic + GCP-TTS audio; `v3AnkiBuildWordCardFields`
~14253), sentences → **`LinguistPro SRS Card v1`** (6 fields: Hebrew/Niqqud/Translit/Russian/Note/Audio), both →
merge; per-text scoped. Its transport is **direct browser→`127.0.0.1:8765`** → fails for remote/mobile (mixed-
content/CORS/Chrome-142 LNA). **Verdict:** unify = make the `.apkg` export reuse the SAME builders/models + 3
options → the universal deploy-safe twin of the Desktop-only AnkiConnect export. **NOT a Trainer rework** (Trainer
SM2 scheduler untouched; export is a gather+build step, ~2–3 d). **R8 fix:** A2b shipped `Word v1` (8 fields) —
DIVERGENT from live `Word v2`; unify must reconcile A2b → Word v2 (one card per word, two transports).

**Q3 — Desktop/Mobile sync as a "unique feature"?** BLUNT (sourced): full bidirectional in-app-trainer ↔ Anki
**MOBILE** sync from a PWA is **IMPOSSIBLE** — iOS only write-only `anki://` app-switch (no review-state read);
Android ContentProvider/Instant-Add is native-app-only (no web surface); AnkiWeb has no public sync API. Desktop
AnkiConnect works but is fragile (Anki open + `webCorsOriginList` + Chrome-142 Local-Network-Access prompt).
Competitive: everyone does ONE-WAY export→Anki; NOBODY reads Anki review-state BACK to drive in-app behavior
(JPDB does app→Anki; Migaku owns its SRS). **Verdict:** "mobile bidirectional sync" = false promise, don't ship/
market. The genuinely-unique + achievable thing = the **Desktop read-back loop = B1/B2** (Anki mastery → i+1
reading recommendations + true retention metric). **Q3 collapses into B** (already approved). Do NOT FSRS-rework the
Trainer now (re-opens the settled v3.2 "Anki = review layer"; v3.4 epic).

**A-unify progress (owner chose A-unify→B, 2026-06-18):**
- **A-unify-1 — ✅ DONE `84b4089` (SW v3.10.73):** generalized the `.apkg` engine to **multi-model/multi-deck** —
  `prepareCollection` accepts `{ groups: [<single-model spec>, …] }` → one collection with many models+decks (each
  group: mid=LP_MODEL_ID+i, did=LP_DECK_ID+i); single-model specs backward-compatible. Foundation for «both»
  (Word v2 + SRS Card v1 in one `.apkg`). Gate `smoke:anki-apkg-client` 28/28 (+7 multi-model); anki-apkg 36 +
  anki-srs-export 14 green. Engine only, not yet UI-wired.
- **A-unify-2a — ✅ DONE `c98096f` (SW v3.10.74) — Word v1→v2 reconciliation (DRY).** New `public/db/anki-models.js`
  (UMD) = canonical «LinguistPro Word v2» (11 fields) + «SRS Card v1» specs. `anki-srs-export.js` builds Word v2 via it
  (was a divergent Word v1). `index.html` `v3AnkiWordModelSpec()` **delegates** to `window.AnkiModels.wordV2()`
  (load-order fallback kept) → AnkiConnect push + client `.apkg` produce IDENTICAL cards. Gate `smoke:anki-srs-export`
  19/19 (Word v2, {{tts}} fallback); browser+prod verified (export = Word v2 11 fields; `acUsesSharedWordV2=true`;
  real card `לכתוב→писать`; 0 console-err). **A-unify-2b NEXT** = the modal «Скачать .apkg» (words/sentences/both):
- **A-unify-2b — ✅ DONE `29e58a8` (SW v3.10.75) — modal «📦 Скачать .apkg» words/sentences/both.** The Anki modal
  (`v3AnkiModal`) now offers a `.apkg` download next to the AnkiConnect push, same form options. `anki-srs-export.js`
  adds pure group-builders `sentenceGroup` (SRS Card v1, stable `sent:<id>` guid) + `wordGroupFromCards` (Word v2,
  dedup by lemma, `word:<key>` guid). Browser orchestrator `v3AnkiDownloadApkg` (index.html, before `v3AnkiPushNow`)
  reuses the INLINE `v3AnkiBuildWordCardFields` + `v3AnkiResolveParadigm` (→ rich Conjugation+Example, richer than the
  global Trainer export) + `getCanonicalWordNotesForText`/`getSentences`/`listNotes` → `{groups}` →
  `AnkiApkg.downloadApkg`. Text-first audio ({{tts}} fallback). i18n `anki.apkgBtn` + clarified `anki.helpText` (ru/en/he).
  Gate `smoke:anki-srs-export` 29/29 (+sentenceGroup/wordGroupFromCards/«both»). Browser-verified: «both»→2 models/3
  decks, word card carries rich Example HTML; 0 console-err. Real modal-click on a text = owner device-smoke. **NOTE:**
  custom deck-name only applies for single-kind (ignored for «both», which uses the two default decks) — acceptable v1.
  **A track = DONE.**

### B (Desktop read-back) — ALREADY IMPLEMENTED + LIVE (audit 2026-06-19; earlier "B next" was WRONG)
A deep code audit found B is essentially **already shipped** (not a future task — the v3.4 sync landed):
- **B1 read-back — LIVE.** Button «Синхронизировать из Anki» (`v3AnkiSyncBtn`) → `v3AnkiSyncNow` (index.html ~36131) →
  `v3AnkiSyncFromAnki` (~15300): LOCAL_MODE-gated → `v3AnkiFetchWordReviewStates` (AnkiConnect findNotes `tag:lp_word`→
  notesInfo→cardsInfo, map by `lp_note_<id>` tag) → pure mapper `v3AnkiCardStatsToLocalState` (~15137) →
  `applyAnkiReviewStates` (local-db.js ~2156, writes srs_cards state/ivl/ease/reps/lapses/due + meta.anki_managed; conflict
  guard local-newer; materializes reviewed-but-uncarded). Honest LOCAL_MODE/CORS messaging.
- **B2 i+1 — LIVE.** `getLearningStateOverlay` (local-db.js ~1920) reads the Anki-written `srs_cards.state`/`reps`
  (comment cites "R-3.2 sync"; review+reps>0 → "known", suspended→"learning") → `getKnownWordStates` → `corpus-vocab`
  «Следующий для тебя». Round-trip wired; no gap.
- **B2 retention — RECORDED.** `v3AnkiFetchReviewLog` (getReviewsOfCards, degrades silently on old AnkiConnect) →
  `v3AnkiRetentionFromReviews` (type-1 reviews, ease≥3, per-week) → toast «удержание X%» + `recordAnkiReviews` writes
  `events(source='anki', event_type='srs_review')` idempotently (id `anki:<reviewId>`).
- Gates `smoke:anki-sync` **52/52** + `smoke:anki-lifecycle` **15/15**. Live AnkiConnect round-trip = owner device-smoke.
- **RESIDUAL GAP (the only real B work left):** the recorded `source='anki'` retention events are NOT surfaced as a
  real retention metric in the teacher/research dashboard (`teacher.html` has no anki/retention read) — the v3.4
  research-completion piece. It touches the privacy-sensitive Direction 11 (opt-in, k=5) and the pilot is postponed →
  **PROPOSE before implementing.**

### A-follow-up — embedded audio in `.apkg` — ✅ DONE `ee1e6d4` (SW v3.10.76)
The modal export now embeds the learner's EXISTING audio (no re-synthesis), gated on the «озвучка» checkbox:
sentence `audio_asset_key` → sentence-card Audio; word `example_audio_key` → word-card Example. Orchestrator
`attachApkgAudio` fetches `/api/audio/<key>` once per unique key (deduped) → media file `lp_<key>.mp3` (same
convention as AnkiConnect's `v3AnkiAttachAudio`); 404/offline skips gracefully ({{tts}} for words, silent for
sentences). `anki-srs-export.js` `sentenceFields`/`sentenceGroup` take `audioBySid` → `[sound:…]`; `{groups, media}`
→ the multi-model engine's media path. Gate `smoke:anki-srs-export` 33/33 (+`[sound:]` field + media-file bytes
preserved). Browser-verified (real sql.js+jszip embeds media; Audio=`[sound:lp_demo.mp3]`). Real audio fetch +
Anki-plays = owner device-smoke. **Remaining A-follow-up:** Зал export surface (lower priority).

### A-unify-2b — adversarial review (3-dim workflow) + lessons (2026-06-18/19)
Review verdict: **0 blocker/major/minor; 3 nits, all acceptable/documented:** (a) custom deck-name ignored for «both» —
CORRECT (matches the AnkiConnect «both» path's fixed `::Words`+`::SRS` decks); (b) toast strings literal-Russian not i18n
keys — consistent with the surrounding `v3Anki*` status strings; (c) `headwordAudioFile:''` ignores the resolvable
`example_audio_key` — the deliberate text-first v1 decision (embedding existing sentence audio = the follow-up). No fixes.
**Lessons:**
- **`data-i18n` overrides HTML literals.** A modal element with `data-i18n="anki.helpText"` (an EXISTING key) renders the
  LOCALE value, so editing the HTML literal does nothing — you MUST update `public/i18n/locales/{ru,en,he}.js`. A NEW
  `data-i18n` key absent from locales shows the HTML literal (`applyI18n` skips passthrough). Add new keys to all 3 locales.
- **A review Workflow can hang at synthesis.** The 3 high-effort review agents completed (large `agent-*.jsonl`) but the run
  never emitted completion (≈1.5 h idle). Detect via the workflow dir's file mtime vs `date`; recover by `TaskStop` + grep
  the `agent-*.jsonl` for `"severity"`/`"verdict"` (do NOT full-read — overflow) to extract findings, then proceed. The
  change was already gate+browser+prod verified, so the hang didn't block shipping.
- ~~A-unify-2b plan~~ (superseded — DONE above). Original: reuse `v3AnkiWordModelSpec()`

**Recommended sequencing:** A-unify (`.apkg` words/sentences/both + reconcile A2b→Word v2, ~2–3 d) → B1/B2
(Desktop read-back, honestly local-only gated → retention metric + Anki-fed i+1, ~4–5 d). Honest framing: «Экспорт
в Anki (.apkg, везде)» + optional «Desktop Anki-мост (power-user): adds cards AND reads mastery back to tune
reading». Never promise mobile sync.

## 5c. Re-test on REAL data — 2026-06-18 (A2b + A-unify-1 re-validated)
Re-ran the shipped export on the project's enriched bundle `Library/test-enriched-lean.zip` (real Hebrew vocabulary):
- **8,967 real `word_study` notes → 1,924 cards** (lemma-dedup collapsed 7,043 same-`pealim_id` notes → **ONE card per
  lemma** — correct for vocab SRS), 259 KB `.apkg` in 679 ms; sample cards correct (`לכתוב [לִכְתֹּב] √כתב verb → писать`).
  Integrity over all 1,924: csum correct · mid valid · ZERO duplicate GUIDs · idempotent rebuild.
- **Multi-model «both» on real data:** real words (`buildWordStudySpec`) + real sentences (SRS Card v1 group) → ONE
  `.apkg` with **2 models + 3 decks** (Default + `LinguistPro::Words` + `LinguistPro::SRS`), correct per-model counts.
- **Browser end-to-end:** seeded 5 real notes via the real `createNote({target_kind:'word', note_type:'word_study', body})`
  → `listWordStudyNotesForExport()` returns them → the **real `v3SrsDownloadApkg()` button** ran (toast «Экспортировано 5
  карточек») → a `.apkg` **downloaded to disk** → re-opened: a **valid importable Anki collection** (ver 11, 2 decks, 5
  notes/cards, every card links a real note, all NEW, unique GUIDs). 0 console-errors.

### Lessons (re-test)
- **Test the export on REAL data, not just fixtures.** The enriched bundle stores `note_type` at the top with `body_json`
  as a **string** (NOT `note.body`); feed `{ id, body_json }` straight in (the exact `listWordStudyNotesForExport` shape).
- **Seed real OPFS notes** via `createNote({ target_kind:'word', target_id:'…', note_type:'word_study', body:{…} })` — a
  word note needs `target_kind:'word'` (not `'word_study'`; that's the note_type). Valid kinds: sentence/word/root/binyan/
  text/note/free (`_TARGET_KINDS`). This unblocks headless real-flow testing the earlier handoff marked owner-only.
- **Validate the ACTUAL downloaded file**, not just the in-memory bytes: Playwright captures the `a.download` click to disk;
  re-open with sql.js and assert Anki-import invariants (ver 11, note.mid↔model, card.nid↔note, new-state, unique guid).
- **Product note (confirm w/ owner):** lemma-dedup = one card per lemma (8,967 notes → 1,924). Right default for vocab;
  documented in the user guide `docs/ANKI_EXPORT_GUIDE.md`.

User-facing help seeded: **`docs/ANKI_EXPORT_GUIDE.md`** (rendered via the /docs/*.md premium renderer) — how to export,
import (Desktop/AnkiDroid/AnkiMobile), what's in a card, `.apkg` vs AnkiConnect, troubleshooting. Update it when A-unify-2
ships (Word v2 + words/sentences/both).

## 6. Norms / gates this will honor
index.html/reader-core untouched (export is server + Trainer/Зал button); new gate `smoke:anki-apkg` (re-open + validate);
extend `anki-sync-smoke`/`anki-lifecycle-smoke`; @380px export UX screenshot; SW bump on shell change; prod-verify
Node-fetch + fresh-code browser; no secrets in code. **No code until this doc is approved + scope chosen.**
