# Ben-Yehuda Reading Room — CURRENT STATE (2026-06-09)

> **READ THIS FIRST.** Reconciles the live truth across the strategy / decision-brief /
> implementation-status / backlog / gap-matrix / runner-plan / competitor-audit docs,
> which contain layered historical states. **If another doc conflicts with this one, this
> wins (as of 2026-06-09).** Project phase: past "can it be built" → **"scale it without
> breaking UX, OPFS, trust"** = building the *operating system* for the corpus.

## 1. LIVE on prod (`linguistpro.kolosei.com`)
- SW **`v3.10.18-canon-audio-fastlink`**, `/healthz` 200.
- Reading Room (`library.html`) + room-mode + **embedded warm-reader (default-on)** + curated **canon-v3** (79 texts, keyless GCP WaveNet `he-IL-Wavenet-A` audio, tier-1 streaming).
- Shipped+live: P0-001 (corpus meta) · P0-002/002a (surface/room-mode) · P0-002b Stage 1 (warm reader) · P0-003 (shelves) · P0-004 (ingestion) · P0-005 (provenance) · P0-007 (canon audio) · P0-008 (versioned dedup) · P0-009 (niqqud foreign-guard).
- **P0-010 (audio-upload owner-token lock) — LIVE** (`f336a04`, no SW bump). `AUDIO_UPLOAD_TOKEN` is set in Coolify env. Prod-verified: anon/X-Local-Mode/XFF-spoof → 403; read path 200.

## 2. Local commits NOT pushed (safe to hold; producer/runner/docs only, no prod effect)
`origin/main = f336a04` (pushed). Local ahead: **`d96cbfc`** (planning + foundation) → **`6da7db7`** (bake-loop) → **`00c8037`** (`--status` dashboard) → (this doc, next commit).

## 3. Owner decisions IN FORCE (corpus pre-run) — do not re-litigate
- **A — scope = tiered** (known-era + short originals first; giants over `--giant-segments` deferred to a capped tail pass).
- **B — speed = free-tier only** (1500 Gemini req/day, **$0**, ~95 days; runner stops on the daily quota + resumes).
- **C — tail audio = on-demand computed-key + LRU** (BRR-P0-011 fix B). The runner does **NOT** pre-bake tail audio. Curated canon stays pre-baked.
- **D — niqqud = Dicta-cloud + backoff** (local sidecar NOT used for the run).
- Iron R1: `review_status=machine` always; provenance everywhere; niqqud **source-first** then Dicta; schema additive. Provider = `gemini-2.5-flash`.

## 4. CANCELLED / superseded premises — DO NOT implement these
- ❌ "~30 days" translation estimate → **actual ~95 days** (measured, 800-work sample).
- ❌ local niqqud sidecar as the pre-run path → **Dicta-cloud chosen** (sidecar code is fixed but operational/unused).
- ❌ full-corpus **audio pre-bake** → **INFEASIBLE** (~288 GB / ~98 WaveNet-free-tier-months) → on-demand only.
- ❌ one big bundle / auto-import for 26K → must be an **on-demand catalog** (canon-v3 auto-import was already a mobile risk at 79 texts; 26K cannot be auto-imported).
- ❌ P0-002b "NEXT" → **Stage 1 SHIPPED**; Stage 2 (`index.html`→reader-core) **DEFERRED** (not now).
- ❌ `sha256(mp3)==assetKey` verify → **infeasible by design** (the key is over the TTS *request*, not the MP3 bytes).

## 5. Key-safety invariant (verified 2026-06-09)
Prod holds **no** server TTS key (`GET /api/tts/key`→`configured:false`); both `/api/tts` synth paths are **BYOK-only** (401 without a per-request key). **Users cannot spend the owner's key.** On-demand tail audio = tier-1 keyless cached → tier-2 BYOK (user pays) → tier-3 browser-speech. Owner key lives only locally during owner bakes.

## 6. Measurement (grounding for §3) — `docs/planning/BEN_YEHUDA_CORPUS_RUNNER_PLAN.md §1`
26,455 works = **24,641 originals** + 1,814 translations. Heavy-tailed (median work ~1.5K chars / 41 segments; novels →638K). Σ≈**6.43M segments**; **~141K Gemini reqs ≈ ~95 days** free-tier; **~4.6M Dicta calls** (the time bottleneck); audio ~288 GB if pre-baked → on-demand. Era known for only **2,069** works (most → `era:unknown`, R1-honest).

## 7. Runner — built + verified (local, committed `6da7db7`/`00c8037`)
- `scripts/premium/measure-corpus-prerun.js` — cost×volume×time estimator (sample-download).
- `scripts/premium/lib/corpusLedger.js` (+ `tests/premium/corpusLedger.test.js` 6/6) — pure resumable work-ledger (status/daily-quota/tiering).
- `scripts/premium/lib/ingestCore.js` — shared translate/niqqud/fetch factory; producer refactored onto it (**zero-drift**); fix: caches only non-empty translations (empties retry).
- `scripts/premium/run-corpus-prebake.js` — **`--plan`** (offline tiered schedule + ETA), **`--bake`** (resumable: daily-quota stop, Gemini-429/quota detect→retry, giant-defer, per-era shard output, ledger resume), **`--status`** (operator dashboard + `run-status.json`).
- Gates: `corpusLedger` 6/6 · `smoke:benyehuda-ingest` 59/59 (producer lib untouched) · node -c clean · bake-loop live-verified (free google-free, then artifacts reset). **Ledger is provider-agnostic → one provider per run.**

## 8. NEXT ORDER OF WORK (owner-approved, Проход 1–5)
1. **Стабилизация (in progress):** ✅ bake-loop committed · ✅ `--status` · ✅ this doc → **OWNER runs the Gemini PILOT** `--bake --provider gemini --limit 20` (needs `GEMINI_API_KEY`) → verify shards/ledger-resume/no-empty/quota-behaviour/R1/R7-sample → fix → `--limit 100` → daily.
2. **giant-pass:** chapterize deferred-giants (existing `chapterizeWork`); emit `work_id + part_index + total_parts`; never one monolithic 18K-segment text (TOC in UI). Don't block the short-tier run, but Track A is NOT production-ready without it.
3. **delivery design (architectural gap):** `catalog-vN.json` + per-work `works/<id>.json` served-on-open + OPFS LRU + curated canon preinstalled + versioning. Prototype on 100–300 works, NOT 26K. Do NOT repeat the canon-v3 auto-import pattern.
4. **BRR-P0-011 computed-key audio:** do BEFORE the tail delivery UI (don't design delivery around storing `audio_asset_key` on millions of rows). Keep canon pre-baked compat; add server/OPFS LRU + never-hang mobile timeout.
5. **long runner:** daily free-tier; QA sample every N days; **do NOT ship bulk to users until the delivery layer exists**; never switch provider mid-ledger.

## 9. Open security follow-up
**BRR-P1-013** — `/api/audio/prefetch/start` is a BYOK-self-funded write into the same cache (X-Local-Mode-reachable; an owner-token gate would break legit in-browser self-prefetch). Pick a control (per-IP/session/BYOK quota, max MB/day; no-overwrite already exists) **before public on-demand audio**. NOT a blocker for the text/niqqud/translation runner.

## 10. NOT doing now (owner review "что я бы не делал")
- No tail-audio pre-bake · no one-big-bundle · no Stage 2 (`index.html`→reader-core) · no 95-day run without the Gemini pilot + status reporting · never mark bulk as curated/human (R1) · no LingQ-paywall / Beelinguapp-AI-graded copying (moat = authentic canon + honest free public-domain + premium via Studio/BYOK).
- **P1-polish deferred** until the first stable 26K slice. Exceptions that protect the current Room: HE-native review of `room.*`/`room.prov.*`, era·register badge, honest loading/error/retry states, 380px RTL visual regression.

## Canonical docs (this reconciles them)
`docs/strategy/*` · `docs/planning/BEN_YEHUDA_READING_ROOM_DECISION_BRIEF.md` · `docs/research/*GAP_MATRIX|COMPETITOR*` · `docs/BEN_YEHUDA_READING_ROOM_IMPLEMENTATION_STATUS.md` §10/§11 · `docs/planning/BEN_YEHUDA_READING_ROOM_REQUIREMENTS_BACKLOG.md` · `docs/planning/BEN_YEHUDA_CORPUS_RUNNER_PLAN.md`.
