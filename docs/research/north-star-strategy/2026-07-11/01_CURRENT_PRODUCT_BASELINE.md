# 01 — Current product baseline

**Status:** RESEARCH BASELINE · **Source commit:** `b426b1b7a91abcb4afb8fde7f0e34c042a9bc0d6` · **Date:** 2026-07-11

## Executive finding

**FACT:** LinguistPro today is a local-first Hebrew learning workbench with a production Reading Room, shared FSRS memory loop, linguistic enrichment, and a substantially shipped owner-only cloud mentor stack. It is not yet a validated consumer “Hebrew Operating System”: external onboarding, outcome evidence, public cloud lifecycle readiness, and a simple first-use promise are not proven.

**INFERENCE:** The strongest current product truth is “real Hebrew text becomes readable and learnable, and what happens there persists into later practice.” The mentor is already technically real, but its broad-market relationship is not yet proven. “Operating System” describes architecture/vision, not a credible ten-second acquisition message.

## Source reconciliation

| Source | Classification | Why |
|---|---|---|
| `CLAUDE.md`, `PROJECT_ROLES.md` | CANONICAL | Current repository invariants and R1–R17 mandates. |
| `RETENTION_PROGRAM_RECON_2026_07_02.md` | CANONICAL / SHIPPED | Append-only `review_log`, shared FSRS-6 and reading-native retrieval are in current code/tests. |
| `ROOM_DUE_CONTINUITY_2026_07_11.md` | CANONICAL / SHIPPED | Latest cross-surface due/count/streak status, live verified. |
| `AI_MENTOR_RECON_2026_07_04.md` | CANONICAL but status sections evolved | Architecture remains canonical; early “next phase” prose is superseded by its later status and rollout handoff. |
| `MENTOR_ROLLOUT_NEXT_2026_07_11.md` | ACTIVE | Latest shipped/remaining mentor program. |
| `MENTOR_HOME_P9_DECISION_2026_07_06.md` | SHIPPED | Mentor Home in Reading Room, API-only module, verified. |
| Telegram P7 / Mini App P8 documents | PARTIALLY SHIPPED | P7.0–P7.2d and P8.1–P8.5 shipped; nudges disabled; P8.6 ops open. |
| `SESSION_STATE_BRR_2026_06_14.md` | HISTORICAL BASELINE | Accurate for its date; later Room programs supersede “next” ordering. |
| Ben-Yehuda Reading Room strategy | CANONICAL PLANNING SNAPSHOT | Owner decisions stand; implementation status evolved. |
| `BRR_UX_AUDIT_2026_06_25.md` | PARTIALLY SHIPPED | Several epics shipped; remaining ordering is not a current global roadmap. |
| `SRS_STRATEGY_v3_2.md` | PARTIALLY SUPERSEDED | Doctrine ancestor; FSRS/review-log recon is newer truth. |
| `ROADMAP_PREMIUM.md` | HISTORICAL / CONTRADICTORY if read as current | Predates the July reading/mentor platform reality. |
| `PRIVACY.md` | CANONICAL PUBLIC POSTURE + DEV ADDENDUM | Local-first remains normal; cloud mentor is owner-only development mode. |

Conflict rule used: explicit canonical/superseded flags → newer live status → code/migrations/tests → commit history.

## Capability map

| Capability | Surface/value | Status | Code/source of truth | Inputs → events/state | Constraint / next |
|---|---|---|---|---|---|
| Text ingest, translation, niqqud, transliteration | Studio: turn arbitrary text into a bilingual learning artifact | SHIPPED | `public/index.html`, server translation repos, OPFS artifact | user text → local artifact | Provider/privacy latency; simplify first-use. |
| Audio/TTS/karaoke | Studio + Room: listen while tracking sentence/word | SHIPPED | `public/tts/`, `reader-core.js`, audio repos | text/SSML → cached asset/timing | Cost/licence/degraded sentence mode. |
| Morphology and tap morphology | Studio + Room: form→lemma/sense/construct evidence | SHIPPED, quality-gated | `reader-morph.js`, `notes-autogen.js`, Dicta/offline resolver | token+context → evidence/word mark | Honest confidence; resolver, never LLM, asserts truth. |
| Reading Room | Continuous reading, corpus/BYOK, progress, due-in-context | SHIPPED | `library.html`, `library-ui.js`, `reader-core.js` | artifact + progress → reading/mark/review events | Avoid overlays that break flow. |
| Library / Ben-Yehuda corpus | Discover and progress through ~26K-work catalogue | PARTIALLY SHIPPED | corpus catalog/index/search + prebake pipeline | catalogue/works → local artifacts | Curation/graded progression incomplete; bodies outside git. |
| SRS/FSRS | Durable memory across Studio/Room/channels | SHIPPED | `fsrs-core.js`, `review_log`, migrations 041/042 local + cloud 021/022 | review events → derived projection | Projection only; Anki demotion/roundtrip debt. |
| Reading-native retrieval / cross-text review | Recall in live context and across texts | SHIPPED | Room due ring, lemma canon, continuity program | anchored occurrences + due → graded event | Fresh due should remain reading-first. |
| Learner Graph / cloud sync | Cross-device/channel state | SHIPPED owner-only | migrations 020–025, `cloud-sync.js`, learner repos | local/cloud events → projections | External rollout requires P8.6, lifecycle proof. |
| Planner/recommendations | Exact next actions | SHIPPED foundation | `agent/planner.js`, Mentor Home `/plan` | projections/anchors/construct ids → plan artifact | Outcome quality not validated; curriculum engine later. |
| AI explanations | Contextual explanation of user's sentence | SHIPPED with consent | agent runtime/explainer, privacy decision | selected sentence → expiring/provider context + explanation artifact | Class C/D consent/TTL; LLM not language authority. |
| Grader | Deterministic-first scoring | SHIPPED/gold-gated | `agent/grader.js`, grade policy, grader fixtures | answer/challenge → review event with provenance | MNAR, D1, annul; no free writing certification. |
| Constructs/misconceptions | Explain recurring skill gaps | PARTIAL | `agent/constructs.js`, Mentor Home summary | plan/explanation facts → limited construct summary | Full misconception model/independent validation not built. |
| Telegram mentor | Cross-session plan/explain/review | SHIPPED owner-live | `agent/telegram/*`, migrations 027–033 | paired channel action → same review log | Proactive flag off; external security/ops gate open. |
| Telegram Mini App | Mobile training/progress/handoff | PARTIALLY SHIPPED | `miniapp.html`, `miniapp-ui.js`, migrations 034–038 | challenge answers → same log | P8.6 rollout checklist open. |
| Nudges / habit | Return at useful time | CODE SHIPPED, DISABLED | nudge state/preferences, P7.3 | due signal → notification ledger | Cross-channel budget; fatigue; reason-aware not built. |
| Analytics/evaluation | Health/outcome evidence | PARTIAL / DEFERRED | smoke gates, limited counters; P10 not built | events → counters | No credible NSM/outcome cohort baseline yet. |
| Listening | TTS, karaoke, dictation | PARTIAL-STRONG | TTS + Telegram/MA dictate | audio response → deterministic grade | Transfer validation limited. |
| Speaking / writing | Productive Hebrew | DEFERRED / LIMITED | no mature end-to-end surface | — | Do not promise now; grader safety hard. |
| Onboarding / habit formation | First-value and return | PARTIAL | Room first-run/a11y epics, mentor/account flows | — | No unified activation path or cohort evidence. |
| Cross-device | Shared cloud state | OWNER-ONLY SHIPPED | auth/sync/artifact repos | consented data → server | Public lifecycle/ops gate. |
| Export/integrations | Anki/APKG, account export/delete | PARTIAL-SHIPPED | Anki export/ingest; identity export/delete | logs/artifacts → export | Roundtrip edge cases, deletion completeness drill. |
| Privacy/security/cost | Trust and sustainable service | PARTIAL-STRONG | consent/audit/TTL/limits, R14–R16 smoke gates | consent + ledger | P8.6 rotation/firewall/purge/rollback still BLOCKER for public pilot. |

## Current identity by time horizon

- Ten seconds: **a powerful but potentially confusing real-text Hebrew learning product**.
- First use: Studio is strongest for urgent user-owned text; curated Reading Room is lower-friction for users without a text.
- Daily return: due-in-context plus one recommended action; Telegram/MA can maintain continuity but should not replace reading.
- 3–12 months: accumulated event history, contextual transfer, lower scaffolding, and cross-text memory are the defensible value.

## Facts, assumptions, unresolved questions

**FACT:** Source tree contains no production changes from this research. **INFERENCE:** current readiness is asymmetric: A is market-presentable, B is owner-live, D is architectural. **PROPOSAL:** use this baseline, rather than legacy roadmaps, for D1–D7. **ASSUMPTION:** the primary buyer values real-life comprehension over gamified beginner curriculum. **UNRESOLVED:** activation funnel, external W1/W4 retention, outcome lift versus existing stack, WTP, cloud consent acceptance, and cost per meaningful outcome.

## Sources

The classified sources above plus current `public/`, `agent/`, `db/`, migrations `020`–`038`, package smoke scripts, and commits `068e49e` through `b426b1b`.
