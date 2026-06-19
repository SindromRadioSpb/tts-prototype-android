# BRR/SRS continuation handoff — updated 2026-06-19

**★ READ FIRST:** `docs/planning/ANKI_SYNC_ENGINE_DESIGN_2026_06_17.md` (⑤ canon — design + Q2/Q3 study + A-unify + re-test §5c) ·
`docs/ANKI_EXPORT_GUIDE.md` (user help guide) · `docs/planning/BRR_SEARCH_*` (search/Discovery) · `docs/PROJECT_ROLES.md` (R1–R10 auto) · CLAUDE.md.
Memory: [[project_anki_sync_design]] · [[feedback_studio_live_source_inline]] · [[feedback_headless_opfs_playwright]] · [[feedback_workflow_hang_recovery]] · [[project_search_discovery_closure]] · [[project_srs_strategy]].
Project = LinguistPro (Node PWA, иврит↔рус), prod https://linguistpro.kolosei.com (Зал `/library.html`, Studio `/index.html`). Owner-инвариант: бескомпромиссное качество, без заглушек; R1–R10 авто.

## STATE — main HEAD `b5301f3`, SW `v3.10.76-anki-apkg-audio` (ALL prod-verified)
**⑤ Anki = DONE (track A export + B read-back).** Newest:
- **B (Anki read-back) was ALREADY LIVE** (audit 2026-06-19; earlier "B next" was WRONG): «Синхронизировать из Anki»→`v3AnkiSyncNow`→`v3AnkiSyncFromAnki` (LOCAL_MODE→`v3AnkiFetchWordReviewStates`→`applyAnkiReviewStates`); B2 i+1 LIVE (`getLearningStateOverlay` reads Anki srs_cards.state→known→`getKnownWordStates`→corpus-vocab); retention events recorded. Gates `smoke:anki-sync` 52 + `smoke:anki-lifecycle` 15. Live round-trip = owner device-smoke. **Residual (task #9):** real Anki retention NOT surfaced in teacher/research dashboard → PROPOSE (Direction 11, pilot postponed). Details: design doc §B.
- **Embedded audio in modal `.apkg`** `ee1e6d4` (SW v3.10.76): reuse EXISTING audio (sentence `audio_asset_key`, word `example_audio_key`) → media in `.apkg` (deduped, `lp_<key>.mp3`, gated on «озвучка»); 404 graceful. `attachApkgAudio` fetches `/api/audio/<key>`; `sentenceGroup` `audioBySid`→`[sound:…]`; `{groups, media}`. Gate `smoke:anki-srs-export` 33. Browser-verified (media bytes preserved). Headword still {{tts}}.
- **⑤ NEXT options:** B2-retention-surfacing (PROPOSE, Direction 11) · Зал export surface (low) · or another track (④ R10 quality + Yiddish 47097). 🔑 token rotation still owed (blocks repo publish + ③ + FTS→26K).

**Track A export (earlier this arc), all SHIPPED+PROD:**
- **A1+A2a** — `.apkg` engine: shared core `public/db/anki-apkg-core.js` (UMD, pure-JS SHA-1=crypto, `prepareCollection` — now **multi-model/multi-deck** via `{groups:[…]}`) + `lib/ankiApkg.js` (server sqlite3+archiver) + `public/db/anki-apkg.js` (client sql.js+jszip → `buildApkgBytes`/`downloadApkg`); sql.js vendored `/db/sql-wasm.{js,wasm}` (lazy). Gates `smoke:anki-apkg` 36 · `smoke:anki-apkg-client` 28.
- **A2b** — Studio Trainer «📦 Скачать .apkg (словарь)» = whole word_study vocabulary (global).
- **A-unify-2a** — Word v1→v2 reconciliation. `public/db/anki-models.js` = canonical «Word v2»(11 fields)+«SRS Card v1» (single source). `index.html` `v3AnkiWordModelSpec()` delegates to it → AnkiConnect push + `.apkg` = identical cards.
- **A-unify-2b** `29e58a8` — Anki MODAL «📦 Скачать .apkg» with **words/sentences/both** (universal twin of AnkiConnect push). `anki-srs-export.js` `sentenceGroup`/`wordGroupFromCards`; `index.html` `v3AnkiDownloadApkg` reuses inline `v3AnkiBuildWordCardFields`+`v3AnkiResolveParadigm` (rich Conjugation+Example, per-text). i18n `anki.apkgBtn`+`helpText`(ru/en/he). Gate `smoke:anki-srs-export` 29.
- **Re-test on REAL data (design doc §5c):** 8967 real notes → 1924 cards (lemma-dedup=1/lemma); «both» real words+sentences → 2 models/3 decks; browser end-to-end → **downloaded `.apkg` = valid importable Anki collection**. Adversarial reviews (2 workflows): 0 real issues, only documented nits.
- **User guide:** `docs/ANKI_EXPORT_GUIDE.md` (two surfaces: Trainer=whole vocab; modal=per-text words/sentences/both).

## ⑤ NEXT = B (Desktop read-back, LOCAL-only gated) — the genuinely-unique feature
B1: wire live pull AnkiConnect `findCards`/`cardsInfo`/`getReviewsOfCards` → existing `v3AnkiCardStatsToLocalState` → `applyAnkiReviewStates`/`recordAnkiReviews` (`public/db/local-db.js` :2148/:2233; orchestrator `v3AnkiFetchWordReviewStates` already inline+tested in `anki-sync-smoke`) + a settings toggle + honest «requires Anki Desktop on this machine» gate. B2: feed read-back → research **retention metric** (`docs/ULPAN_RESEARCH_PLAN_v3_2.md`) + **Anki-fed i+1 mastery** (`getKnownWordStates` overlay → `corpus-vocab` zone). Q2/Q3 study (design doc §5b): full bidirectional **mobile** Anki sync from a PWA is IMPOSSIBLE (don't market); the read-back loop is uniquely achievable + differentiated. A-follow-ups: embedded audio in `.apkg` (reuse `example_audio_key`); Зал export surface.

## NORMS / TRAPS (hard)
- **Studio live JS = INLINE in `index.html`; `public/check_script.js` = gitignored DEAD copy** — verify a file is `<script>`-loaded before editing ([[feedback_studio_live_source_inline]]). Zал=`library-ui.js`(real). DB=`local-db.js`(real, `window.__localDB`, `ensureLocalDB()`).
- **`data-i18n="existing.key"` overrides HTML literals** → change `public/i18n/locales/{ru,en,he}.js`, not the HTML. New key absent from locales shows the literal.
- index.html table renderer parity-locked (`smoke:reader-parity`) — don't touch renderTable. Global `button{width:100%}` mobile trap. **Bump SW `CACHE_VERSION`** on ANY index.html/locale/precached-asset change.
- **Headless browser-verify the Anki export fully** (small OPFS writes ok): seed via `createNote({target_kind:'word',note_type:'word_study',body})`; for the modal, stub `getCanonicalWordNotesForText`/`getSentences` with real-shaped fixtures (real text+occurrences seeding is fragile). Validate the actual DOWNLOADED `.apkg` with sql.js. Real profile = owner device-smoke. ([[feedback_headless_opfs_playwright]])
- **Workflow can hang at synthesis** — detect via dir mtime, recover by grep agent-*.jsonl + TaskStop, proceed ([[feedback_workflow_hang_recovery]]).
- commit+push autonomously (Coolify); prod-verify Node-fetch (NOT Windows-curl for Hebrew) + fresh-code browser (clear SW+caches+reload+freshness-probe before measuring).

## 🔑 OPEN (owner, not code) — rotate AUDIO_UPLOAD_TOKEN (leaked) + Gemini + old GCP. Blocks repo publish + ③ corpus publish + FTS→26K. (NOT blocking ⑤/Зал dev.)
