# BRR/SRS continuation handoff — updated 2026-06-18

**★ READ FIRST:** `docs/planning/ANKI_SYNC_ENGINE_DESIGN_2026_06_17.md` (⑤ canon — design + Q2/Q3 study + A-unify plan) ·
`docs/planning/BRR_SEARCH_IMPL_2026_06_16.md` + `BRR_SEARCH_DISCOVERY_STATE_2026_06_16.md` (search/Discovery) · `docs/PROJECT_ROLES.md` (R1–R10 auto) · CLAUDE.md.
Memory: [[project_anki_sync_design]] · [[feedback_studio_live_source_inline]] · [[project_search_discovery_closure]] · [[feedback_headless_opfs_playwright]] · [[project_srs_strategy]].
Project = LinguistPro (Node PWA, иврит↔рус), prod https://linguistpro.kolosei.com (Зал `/library.html`, Studio `/index.html`). Owner-инвариант: бескомпромиссное качество, без заглушек; R1–R10 авто.

## STATE — main HEAD `84b4089`, SW `v3.10.73-anki-multimodel` (prod-verified up to A2b; A-unify-1 deploying)
**SHIPPED+PROD this arc:**
- **Зал non-ready add-to-list** (SW v3.10.71) — ➕ on every result row + auto-upgrade. [[project_search_discovery_closure]]
- **⑤ Anki design APPROVED A+B** + **Q2/Q3 feasibility study** (3-agent research, in the design doc §5b).
- **⑤ A1+A2a** — client-side `.apkg` engine: shared core `public/db/anki-apkg-core.js` (UMD, pure-JS SHA-1=crypto, `prepareCollection`) + `lib/ankiApkg.js` (server sqlite3+archiver) + `public/db/anki-apkg.js` (client sql.js+jszip, `buildApkgBytes`/`downloadApkg`); sql.js vendored `/db/sql-wasm.{js,wasm}` (lazy). Gates `smoke:anki-apkg` 36 + `smoke:anki-apkg-client` 28.
- **⑤ A2b** (SW v3.10.72) — «📦 Скачать .apkg (словарь)» in Studio Trainer exports word_study notes → «LinguistPro Word v1» (`public/db/anki-srs-export.js` `buildWordStudySpec`; OPFS query `listWordStudyNotesForExport()`). Gate `smoke:anki-srs-export` 14. PROD-verified (real browser sql.js+jszip → valid collection).
- **⑤ A-unify-1** `84b4089` (SW v3.10.73) — engine now **multi-model/multi-deck** (`{groups:[…]}` → many models+decks in one `.apkg`; single-model backward-compat). Foundation for «both». Gate +7 multi-model checks (client 28/28).

## ⑤ Q2/Q3 STUDY VERDICT (design doc §5b)
- **Existing «Экспорт в Anki (AnkiConnect)» modal** (`v3AnkiModal` index.html ~11356) already has words/sentences/both with RICH models: **Word v2** (11 fields incl. conjugation+mnemonic+GCP-TTS audio; `v3AnkiWordModelSpec` ~14171, builder `v3AnkiBuildWordCardFields` ~14253) + **SRS Card v1** (6 fields). But transport = browser→`127.0.0.1:8765` → FAILS remote/mobile (mixed-content/CORS/Chrome-142 LNA). So `.apkg` is the only universal path.
- **Q2:** unify `.apkg` to 3 options reusing those builders/models = NOT a Trainer rework (gather+build; SM2 untouched). **R8: reconcile my A2b Word v1 → Word v2** (no divergence).
- **Q3:** full bidirectional **mobile** Anki sync from a PWA is **IMPOSSIBLE** (iOS write-only `anki://`; Android ContentProvider native-only; no AnkiWeb API). DON'T market it. The genuinely-unique+achievable thing = **Desktop read-back loop = B** (Anki mastery → i+1 reading recommendations + retention metric); no competitor reads Anki state back. **Owner chose: A-unify → B.**

## NEXT — A-unify-2 (browser), then B
**A-unify-2** (full plan in design doc §5b A-unify-2): add «📦 Скачать .apkg» to `v3AnkiModal` (~11403) reading the same form (textId, cardKind words/sentences/both, includeHint). REUSE the INLINE builders (do NOT duplicate): `v3AnkiWordModelSpec()` + `v3AnkiBuildWordCardFields()` + `v3AnkiResolveParadigm()` (offline) for words → Word v2 group; extract `buildSentenceFields(s,note,includeHint)` (~14490) for sentences → SRS Card v1 group; «both» → two groups → `AnkiApkg.buildApkgBytes({groups:[…]})` (multi-model ready). **Audio text-first** (Audio empty → Word v2 `{{tts he_IL:Word}}` device-TTS; sentences silent). Stable per-note/-sentence GUID. **Reconcile A2b:** retire `anki-srs-export.js` Word v1 → Trainer button produces SAME Word v2 cards. SW bump; browser-verify @380px (3 options→valid `.apkg`, models == AnkiConnect); prod-verify.
**Then B1/B2** (Desktop read-back, LOCAL-only gated): wire pull `findCards`/`cardsInfo`/`getReviewsOfCards` → existing `v3AnkiCardStatsToLocalState` → `applyAnkiReviewStates`/`recordAnkiReviews` (local-db.js :2148/:2233; orchestrator `v3AnkiFetchWordReviewStates` already inline+tested in anki-sync-smoke) + settings toggle + «requires Anki Desktop» gate → research retention metric + Anki-fed i+1 mastery.

## NORMS / TRAPS (hard)
- **Studio live JS = INLINE in `index.html`; `public/check_script.js` = gitignored DEAD copy — verify a file is `<script>`-loaded before editing** ([[feedback_studio_live_source_inline]]). Zал=`library-ui.js`(real). DB=`local-db.js`(real, `window.__localDB`, `ensureLocalDB()`).
- index.html table renderer parity-locked (`smoke:reader-parity`) — don't touch renderTable. Global `button{width:100%}` mobile trap. Bump SW `CACHE_VERSION` on ANY index.html/precached-asset change. `v3NotesT(key,fallback)` new keys w/o locale entries DON'T break `smoke:i18n`.
- PWA SW staleness: clear SW+caches + reload + freshness-probe before browser-verify ([[feedback_browser_verify_fresh_code]]). Headless OPFS importBundle crashes wa-sqlite; small writes ok; `createNote` needs valid `target_kind` (seeding word_study headless is fiddly → real-profile export = owner device-smoke) ([[feedback_headless_opfs_playwright]]).
- commit+push autonomously (Coolify); prod-verify Node-fetch (NOT Windows-curl for Hebrew) + fresh-code browser.

## 🔑 OPEN (owner, not code) — rotate AUDIO_UPLOAD_TOKEN (leaked) + Gemini + old GCP. Blocks repo publish + ③ corpus publish + FTS→26K. (NOT blocking ⑤/Зал dev.)
