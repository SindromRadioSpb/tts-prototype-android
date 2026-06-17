# BRR continuation handoff — updated 2026-06-17 (non-ready add-to-list SHIPPED; Anki ⑤ design NEXT)

**★ READ FIRST:** `docs/planning/BRR_SEARCH_IMPL_2026_06_16.md` (per-feature impl log — non-ready add-to-list section + lessons at end) ·
`docs/planning/BRR_SEARCH_DISCOVERY_STATE_2026_06_16.md` (canon, SHIPPED) · `docs/planning/BRR_P2_DISCOVERY_2026_06_14.md` (§B journal) ·
`docs/PROJECT_ROLES.md` (R1–R10 auto) · CLAUDE.md.
Project = LinguistPro (Node PWA, иврит↔рус), prod https://linguistpro.kolosei.com (Зал `/library.html`, Studio `/index.html`).
Owner-инвариант: бескомпромиссное качество, без заглушек; роли R1–R10 авто.

## ✅ SHIPPED THIS SESSION — non-ready add-to-reading-list (SW `v3.10.71-list-nonready`)
**Was:** «➕ В список» lived only inside the lazy snippet → appeared on ready+matched-line rows only.
**Now:** the button is on the work ROW (`renderCorpusWorkRow`, `opts.showListBtn`; icon-only via `btn.__iconOnly`) → offered on EVERY
result incl. ⏳ non-ready + title-only matches, on the search/FTS pager (`appendPagedWorkRows`) AND the L3 author drill (`corpusWorkSection`).
- **Honest store (R8):** authoritative `openable` threaded `openListPicker(card,btn,ready)`→`toggleItemInList(…,ready)`→`cardToListItem(card,ready)`
  — wins over the `file&&text_key` heuristic, so a non-ready work is stored `r:false` even if its catalog card carries a pre-bake path (no dead-end).
- **Auto-upgrade (R4):** `renderReadingListCard` re-derives readiness from the LIVE `corpusReadyMap` — a work saved while «перевод готовится»
  drops its «перевод позже» badge and opens the moment it ships (live ready card has file+text_key even when the saved stub didn't); no migration.
- Snippet keeps only 💾 «В заметки». `library-ui.js` only (+ `library.html` CSS `.corpus-work-listbtn`). **No new i18n keys** (reuses
  `room.corpus.lists.{add,short,notReady}` + `room.corpus.later`); **no token**; **index.html/reader-core untouched.**
- **Gates green:** `smoke:corpus-snippet`(30) · `corpus-fts`(48) · `corpus-fts-parity`(30) · `reader-parity` · `i18n`(226).
- **Live-verified @380px L+D** (89/89 ⏳ rows show ➕; add→`r:false`; shelf badge; tap→toast «Перевод готовится»; auto-upgrade opens 17-row reader), 0 console-err.
  Lesson: a per-result action that must cover EVERY result belongs on the ROW, not the lazy snippet · freeze-vs-derive: re-derive readiness at
  render = zero-migration auto-upgrade · this Room surface (localStorage + corpus-served-on-open, NOT OPFS) IS headless-live-verifiable.

## STATE
main HEAD will be the new commit (was `0004d54`), **SW `v3.10.71-list-nonready`**. Whole search/Discovery block S1–S16 + P3 + this follow-up = SHIPPED.
FTS core (P2-001..006a) + Karaoke + i+1 + Scaffolded Console in prod. Engine `public/js/corpus-fts.js`; all search/Discovery UI in `public/js/library-ui.js`.
Data: works/<id>.json (796 ready, in git locally) · corpus-{catalog,index,search}-v7 (in git) · corpus-fts-v7 shards (PROD-vol, gitignored) · translit-ru-v7.json (in git).

## ⑤ Anki-sync — design APPROVED (scope **A+B**), A1 SHIPPED, A2/B1/B2 NEXT
Design `docs/planning/ANKI_SYNC_ENGINE_DESIGN_2026_06_17.md` (committed `3d0d105`) + memory [[project_anki_sync_design]].
**Decisive finding:** AnkiConnect = **local-only** (server→`127.0.0.1:8765`) → non-functional for remote prod users; **no `.apkg` gen existed**.
Owner approved **A+B**: A = universal `.apkg` export (deploy-safe one-way); B = AnkiConnect bridge repositioned as LOCAL/power-user + read-back (retention metric + Anki-fed i+1 mastery). Defer C (in-app FSRS). Reconciles [[project_srs_strategy]] (Anki=review layer; no competing scheduler).
- **A1 SHIPPED `4018ce8`:** `lib/ankiApkg.js` hand-rolled legacy `collection.anki2`(ver 11)+media-zip→`.apkg` Buffer (sqlite3+archiver, no black-box). Stable per-card GUID (genanki-shaped base91)→idempotent re-import; fixed deck/model ids merge; correct csum/sfld/req; model mirrors server `getSrsAnkiModelSpec` («LinguistPro SRS Card v1», 17 fields). Gate **`smoke:anki-apkg` 30/30**. Server-side lib (no SW bump). Real-Anki *import* = owner device-smoke (gate validates structure only).
- **A2 — CLIENT-side export (owner chose client build). Resolved open question:** SRS cards live in **OPFS** (`public/db/local-db.js` `srs.listCards`/`createCard`/`createCardFromNote`); the **server has NO user data** (OPFS-first; `texts` empty in prod, `server.js:342`); precedent `exportBundle` (local-db.js:3534) is client-side; wa-sqlite has no serialize → client uses **sql.js**.
  - **A2a SHIPPED `a22a191`:** shared core `public/db/anki-apkg-core.js` (UMD, pure-JS SHA-1 byte-equal to crypto, col-JSON/DDL/csum/guid/`prepareCollection`); `lib/ankiApkg.js` refactored onto it; **client `public/db/anki-apkg.js`** (sql.js+jszip → `buildApkgBytes`/`buildApkgBlob`/`downloadApkg`); sql.js vendored `/db/sql-wasm.{js,wasm}` (lazy). Gates **`smoke:anki-apkg` 36/36** + **`smoke:anki-apkg-client` 21/21** (server↔client PARITY). Headless. Not wired to UI yet → no SW bump.
  - **A2b SHIPPED+PROD `0da074d` (SW `v3.10.72-anki-apkg`):** v1 exports **word_study notes** (S10/②-vocabulary — simplest high-value; sentence-cards = follow-up). `public/db/anki-srs-export.js` `buildWordStudySpec` → «LinguistPro Word v1» (Word/Niqqud/Root/Binyan/POS/Meaning/PealimId; He→Ru; lemma-dedup; stable per-lemma GUID). OPFS query `listWordStudyNotesForExport()` (local-db.js). «📦 Скачать .apkg (словарь)» + `v3SrsDownloadApkg()` in Studio Trainer home — **edited `index.html` INLINE (live source); `public/check_script.js` = gitignored DEAD copy, DON'T edit → [[feedback_studio_live_source_inline]]**. 3 UMD scripts in index.html + SW PRECACHE (sql.js lazy). Gate `smoke:anki-srs-export` 14/14; reader-parity+i18n green. PROD-verified Node-fetch + prod browser (real sql.js(27ms)+jszip → valid collection re-opened; button renders+wired; only a benign pre-existing 410). Real-profile export→Anki-import = owner device-smoke.
- **⑤ NEXT = B (AnkiConnect read-back, LOCAL-only gated):** B1 wire live pull `findCards`/`cardsInfo`/`getReviewsOfCards` → existing `v3AnkiCardStatsToLocalState` → `applyAnkiReviewStates`/`recordAnkiReviews` (`public/db/local-db.js` :2148/:2225) + settings toggle + honest «requires Anki Desktop on this machine» gate. B2 feed read-back → research retention metric (`ULPAN_RESEARCH_PLAN_v3_2`) + Anki-fed i+1 mastery (`getKnownWordStates` overlay → `corpus-vocab` zone). A-follow-ups: Зал export surface · sentence-card export (17-field model mirroring `getSrsAnkiModelSpec` server.js:4910).
- **B1 NEXT — read-back (local-only):** wire live pull (AnkiConnect `findCards`/`cardsInfo`/`getReviewsOfCards`) → existing `v3AnkiCardStatsToLocalState` → `applyAnkiReviewStates`/`recordAnkiReviews` (`public/db/local-db.js` :2148/:2225); settings toggle + honest «requires Anki Desktop on this machine» gate.
- **B2 NEXT — value:** feed read-back → research retention metric (`ULPAN_RESEARCH_PLAN_v3_2`) + Anki-fed i+1 mastery (`getKnownWordStates` :2101 overlay → `corpus-vocab` zone).

## P3 BACKLOG (owner-deprioritized / blocked)
- **S18 latin/SBL input** — only remaining small follow-up (digraph-aware fold; low ROI for russian audience).
- S17 inflection-phrase (cheap alt = `slop` toggle) · S19 KMap-link (Studio-only, touches index.html → Stage-2) · FTS→26K (needs token rotation).
- Other tracks: ④ R10 tap-gloss quality + Yiddish 47097 · ③ publish baked → catalog v8 (token-blocked).

## 🔑 OPEN (owner, not code) — STILL OWED
Rotate **AUDIO_UPLOAD_TOKEN** (leaked) + **Gemini** + old **GCP** — blocks repo publish + ③ corpus publish + FTS-grow→26K.

## NORMS (hard)
index.html + reader-core builder UNtouched (`smoke:reader-parity`); reader features POST-render on Room mount; крупная фича → recon-дизайн
`docs/planning/<TICKET>.md` НА УТВЕРЖДЕНИЕ перед кодом; MEASURE on non-empty profile; gates green before push; commit+push autonomously (Coolify);
prod-verify Node-fetch (NOT Windows-curl for Hebrew) + browser on FRESH code (freshness probe; don't clear cache before warm-speed measure);
bump SW CACHE_VERSION + FTS_DATA_REV/TRANSLIT_DATA_REV on format change; @380px RTL light+dark screenshot.
Lessons memory: [[project_search_discovery_closure]] · [[feedback_headless_opfs_playwright]] · [[feedback_fts_hebrew_inverted_index]] · [[feedback_browser_verify_fresh_code]].
