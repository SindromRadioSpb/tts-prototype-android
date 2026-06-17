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

## 6. Norms / gates this will honor
index.html/reader-core untouched (export is server + Trainer/Зал button); new gate `smoke:anki-apkg` (re-open + validate);
extend `anki-sync-smoke`/`anki-lifecycle-smoke`; @380px export UX screenshot; SW bump on shell change; prod-verify
Node-fetch + fresh-code browser; no secrets in code. **No code until this doc is approved + scope chosen.**
