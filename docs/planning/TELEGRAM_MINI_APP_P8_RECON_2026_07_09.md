# CLG-P8 — Telegram Mini App — GROUNDED RECON

**Date:** 2026-07-09 · **Author:** owner + agent recon · **Phase:** CLG-P8 (design/recon only — NO production UI yet)
**Canon parents:** `AI_MENTOR_RECON_2026_07_04.md` (§4.3, §5, §6, §7, §8, §9, §10, §11), `AI_MENTOR_CRITIQUE_2026_07_04.md` (§M7, §M8, §M11, §M16, §M29, §M35), `TELEGRAM_P7_DECISION_2026_07_06.md`, `TELEGRAM_P7_2d_SELECTOR_SPEC_2026_07_08.md`, `MENTOR_HOME_P9_DECISION_2026_07_06.md`
**Companion docs (this session):** `TELEGRAM_MINI_APP_P8_SECURITY_2026_07_09.md` (auth/session/challenge-binding/deep-link) · `docs/research/miniapp-p8-readiness/2026-07-09/` (measurement SQL + README)

> **READ-FIRST verdict.** P8 is **GO as an owner-pilot**, **NOT product-validated**. Critique §M8 [R5] ("Mini App at zero external users is a strictly worse duplicate of the trainer; deprioritize or gate behind an external-pilot trigger") was flagged MINOR and **never overturned** in the recon adjudication table. This session **explicitly overrides** it with reasoning (see §1) rather than proceeding silently: P8 ships behind `MINI_APP_ENABLED` for the owner only, with launch telemetry that lets us *decide* value after first use — matching the P7.3d measure-before-code precedent (don't build elaborate machinery before the pool/user base justifies it). **No slice is called "product-validated" until §1 launch-trigger metrics say so.**

---

## §0 PRODUCT CHARTER

**Product formula (invariant):** Telegram nudge/command/menu button → one tap, no re-login → a short 3–7 min personal training session → each exercise bound to its **source sentence** → after the result, one action returns the user to the exact place in the Reading Room (Зал). The Mini App must be **better than the text bot for interactive training**, **faster than the PWA for launching a micro-session**, **deliberately poorer than the Зал for real reading**, a **thin client of existing server pedagogy**, and **one more host-adapter of the Learner Graph** — never a new learning brain.

| Charter field | Value |
|---|---|
| **Primary user** | The owner (n=1 today), operating as a real learner. Secondary/future: a small closed pilot of independent testers once one exists. |
| **Job-to-be-done** | "I got a Telegram nudge / I have 5 idle minutes — give me a tiny, context-rich review session I can finish on my phone with taps (not typed replies), and drop me back into the exact sentence in the Зал when I'm done." |
| **Differs from the text bot (P7)** | Taps not typed ForceReply replies; visible session progress (n/N, due-remaining); audio-native dictate with inline replay; instant modality feedback + *why this modality* + source sentence rendered visually; no message-thread clutter; discoverable menu button. Same server selector/grader/log underneath. |
| **Differs from the Зал (PWA)** | Zero reading surface beyond the single anchoring sentence; no corpus browse, no library, no OPFS-backed reader; no full morphology-on-tap; launches in one tap without the PWA login/sync dance. Reading *lives in the Зал*; the Mini App's only reading affordance is "open this in the Зал." |
| **Success criteria (owner-pilot)** | (1) First challenge reached without a second login; (2) a completed review writes **exactly one** `review_log` row that down-syncs into OPFS and replays identically; (3) source sentence shown, no pre-answer leak; (4) deep-link opens the exact text at the exact `order_index`; (5) owner subjectively prefers it to the bot for a quick session; (6) reading-return + cannibalization events are *recordable* for later P10 analysis. |
| **Anti-goals** | Not a generic flashcard app; not a P9 dashboard clone; not a second SRS/selector/grader; not a reading surface; not a free-form AI chat; not P10 analytics/teacher/curriculum. Must **strengthen** return-to-reading, not replace reading-native retrieval. |
| **Launch trigger (to call it "validated," not just "shipped")** | Any ONE of: (a) an external pilot date/tester cohort exists; (b) ≥2 independent users testing; (c) live P7 shows a concrete text-bot problem (high unfinished-session rate, too many messages per card, weak discoverability, awkward input, no visible progress) that the Mini App measurably fixes. Until then: **owner-pilot**, instrumented, not "product-validated." |
| **Kill criteria** | (a) Mini App reviews measurably drain the Зал due-ring and reading-session frequency drops (cannibalization realized, §7); (b) owner does not reach for it after the novelty; (c) it cannot hold the context-first invariant honestly (too few due items have a source anchor — see §2/§6 fork). Any → flip `MINI_APP_ENABLED=0` (§18), keep the written review events, do not regress bot/PWA. |

---

## §1 GO / NO-GO — product justification before UI

**Explicit adjudication of Critique §M8 [R5].** The MINOR recommendation stands unless overridden. We override it, narrowly:

- **Accept the premise:** at n=0 external users, a *naive* Mini App is indeed a worse duplicate of the trainer, and the bot already covers the owner-as-user messenger case. Building a full PWA-lite now would be waste.
- **Override the conclusion for a scoped pilot:** P9 ("Дом наставника", `public/js/mentor-home.js`) was **built as the P8 skeleton by construction** (API-only + host-adapter — `AI_MENTOR_RECON §9` CLG-P9 row). The marginal cost of a *thin* P8 that reuses that skeleton + the existing deterministic selector/grader/log is small and mostly server-side hardening we want anyway (initData auth, surface-generalized challenge, down-sync of externally-originated reviews). The pilot's purpose is to **generate the very evidence §M8 says we lack** — is a tap-native, context-first micro-session actually better than the bot? We cannot answer without shipping the thin version to one real user (the owner).
- **Guardrail:** everything ships behind `MINI_APP_ENABLED`, owner-only, with §14 telemetry. We do **not** build P10 analytics, a second selector, or a reading surface. If the pilot says "no added value over the bot," we stop at P8.3/P8.4 and have lost only server hardening that also benefits the bot.

**Verdict:** Proceed to design + staged build as an **owner-pilot**. Frame every slice honestly. Minimal telemetry from P8.1 so value is checkable post-launch.

**Status ladder (owner, 2026-07-09) — do NOT use a flat "P8 complete", which conflates technical readiness with product proof:**

```
architecture-ready → owner-live → pilot-ready → externally-validated → general-availability
```

Enablement is owner-only and explicit: `MINI_APP_ENABLED=0` by default **plus** an owner allowlist `MINI_APP_OWNER_USER_IDS=<owner>` (a Telegram principal not on the allowlist gets a fail-closed 503 even with the flag on). "owner-live" = the owner uses it on prod; "externally-validated" is reached only when a §0 launch-trigger fires. **"Instrument the bot first" is NOT an alternative to P8 — it is folded into P8.0** (§10): add comparable bot telemetry now so a Bot-vs-Mini-App baseline exists the moment the Mini App ships.

---

## §2 EXISTING CONTRACTS & MEASURED READINESS (grounded §3.1 + §3.2)

### 2.1 What already exists (all `file:line`-verified this session)

**No Mini App surface exists yet.** `grep -ni miniapp server.js` → 0 hits. The closest analogues (`/api/agent/telegram/*`, `/api/learner/*`) all require an `lp_session` cookie, which a Telegram WebView `initData` context does not natively carry — so the **auth bridge is genuinely new code** (see §8 + security spec).

**Endpoints that already work with a normal browser session** (cookie `lp_session` + `X-LP-CSRF`), directly reusable by a Mini App *once it holds a session cookie*:

| Endpoint | `server.js` | Use for P8 |
|---|---|---|
| `GET /api/auth/me` | 1468 | session probe + consents seed |
| `GET /api/agent/status` | 1792 | mentor status line |
| `GET /api/learner/context` | 1711 | **home payload** (`getAgentContext`: honest `due_now`, weak/due samples) |
| `GET /api/learner/due` | 1691 | due list (⚠ window-pin, §5) |
| `GET /api/learner/weak` / `known` | 1705/1699 | progress MVP |
| `GET /api/learner/log?after_rid=&limit=` | 2183 | **down-sync source** (rowid cursor, hole-free) |
| `POST /api/agent/plan` | 1755 | plan (lazy, on-tap; already semantic — P8 = 2nd renderer) |
| `GET /api/agent/explanations` / `constructs/summary` | 1817/1828 | tertiary blocks |
| `POST /api/auth/consent` | 1510 | consent toggles + purge cascade |
| `POST /api/agent/telegram/unlink` | 1910 | unlink |

**`POST /api/agent/review` (server.js:1843) is receptive-locked over HTTP** — it strips `challenge_id` and rejects production channels (400). Production writes flow **only** through the webhook-trusted path (`ctx.viaTelegramReview===true`). **This is the central design gap P8 must close** (§5, §8.3): the Mini App answer path needs a *new* trusted-surface entry that is as fail-closed as the webhook, not a relaxation of `/api/agent/review`.

**Session/auth (security-critical):** `lp_session` = `"<id>.<secret>"`, only `sha256(secret)` stored (`db/identityRepo.js:50,63-83`); `HttpOnly; SameSite=Lax; Secure`-behind-Traefik (`server.js:1417-1421`); CSRF double-submit `X-LP-CSRF` vs `user_sessions.csrf_token` (`server.js:1430-1437`); **90-day sliding TTL** (`db/identityRepo.js:30`); single-owner bootstrap (`server.js:1439-1466`), no multi-user signup. `user_sessions` has **no `scope` column**. `user_id` is **never** trusted from a body (the one read at `server.js:1623` exists solely to 403 a mismatch).

**Identity mapping** already surface-agnostic-ready: `channel_links` carries a generic `channel` column; `getActiveLinkByTg(tgUserId, channel)` (`db/channelLinkRepo.js:164`) maps Telegram id → `user_id`; `redeemToPending` sources `user_id` from the token row, never the payload.

**Challenge/review stack** (P7, live): deterministic `selectEligible` (`agent/telegram/review.js:91`), LLM-free grader (`agent/grader.js`), append-only `review_log` (`migrations/021`), replay oracle (`smoke:server-replay`, independent `ts-fsrs` reference), down-sync (`cloud-sync.js` `syncDown`), 3-layer idempotency (webhook dedup / challenge single-use / deterministic `attempt_id`). Migrations at **033** → P8 starts **034**.

### 2.2 Measured readiness (§3.2)

**Honest constraint: the local dev DB (`data/app.db`) has ZERO owner rows** in every CLG/P7 table (`review_log`, `agent_challenges`, `channel_links`, `srs_projections`, `users` = 0; only `sentences` = 7494, the shipped dataset). **The real owner profile lives ONLY on the prod volume** (`/app/data/app.db`). Therefore the §3.2 numbers below are **owner-gated prod measurements**, not fabricated here.

**Deliverable:** `docs/research/miniapp-p8-readiness/2026-07-09/measure-readiness.sql` — read-only, emits **distributions not verdicts** (overdue-day histogram, stability buckets) so thresholds (§7) are set *from* data, not guessed. Run: `sqlite3 -readonly /app/data/app.db < measure-readiness.sql` on the prod host.

**MEASURED 2026-07-09 (prod owner profile, via the authenticated browser session hitting `/api/learner/*` — kapture; aggregates only, no `item_key`/content persisted):**

| Metric | Value |
|---|---|
| tracked distinct items / log rows | 5235 items · 5596 log rows (of which **5367 are manual `mark`s** — bulk status-marking; only **143 reviews**, 74 seed, 12 skip) |
| **scheduled (in FSRS) / due now** | **98 scheduled · 51 due** |
| overdue distribution (all 51 due are overdue) | <1d: 24 · 1–3d: 13 · 3–7d: 14 · none >7d |
| stability (fragility) | s<1: **15** · 1–3: 31 · 3–7: 5 |
| lapses among due | 0 lapses: **36** · 1: 8 · 2–3: 4 · >3: 3 (⇒ ~15 lapsed/fragile) |
| review grades (all channels) | g1: 44 · g2: 14 · g3: 97 |
| **Telegram production reviews to date** | **10 completed** (dictate:tg 6, cloze:tg 4) · 6 tg skips · **reverse:tg 0 completed / 3 skipped** |
| reading-surface reviews (baseline) | read:mc 80 · read:tiles 29 · read:typed 7 · dictate:tiles 13 · reading:tap 2 · … |
| consents | cloud_texts ✓ · agent_read_texts ✓ · telegram_delivery ✓ · Telegram linked |
| latency_ms | **null on agent reviews** → not recorded; needs P8.0 telemetry |

**Interpretation (feeds §7 thresholds, honestly):** (1) the due pool is **small (51)** and cycles on ~1-day intervals, so *almost everything due is already overdue* — a "fresh-due reservation" reserves little at this maturity; the meaningful Mini-App-vs-reading split is better keyed on **lapsed/fragile** (~15 items: lapses≥1 or stability<1) vs **healthy** (~36) than on overdue-age. (2) Telegram review volume is **tiny (10)** — confirms owner-pilot framing; completion/abandonment can't yet be compared, which is exactly why P8.0 adds bot baseline telemetry. (3) reverse:tg is avoided by the owner (0/3) — dictate+cloze are the live modalities.

| Metric (§3.2) | Source | Status |
|---|---|---|
| due count / overdue / stability / lapses | `srs_projections` (via `/api/learner/due`+`/context`) | **MEASURED ✅** (above) |
| reviews by channel+kind, grades, cadence | `review_log` (via `/api/learner/log` full paging) | **MEASURED ✅** (above) |
| latency per review | `review_log.latency_ms` | **null** — not recorded; add in P8.0 telemetry |
| challenge outcomes (abandonment = expired/cancelled ÷ completed) | `agent_challenges.status` | **PENDING prod DB** — not exposed via HTTP (`measure-readiness.sql` §6) |
| exposure ledger, select_reason mix | `tg_stimulus_exposure`, `agent_challenges.select_reason` | **PENDING prod DB** (`measure-readiness.sql` §8–9) |
| **% due with source-sentence anchor** | builder-driven, **not pure SQL** | **PENDING builder probe** (§2.3) — the gating number for §6/fork-4 |
| % due eligible for cloze/dictate/reverse assets | builder-driven | **PENDING builder probe** |
| avg messages per completed bot review | Telegram-side | needs P8.0 bot telemetry |

### 2.3 The one measurement that gates the product — **MEASURED 2026-07-10 ✅**

**"For what % of current due items does a resolvable, non-leaking source sentence exist?"** Full-scan builder probe on the prod owner profile (81/81 artifacts, 3568 sentences; same primitives as `selectEligible`; aggregates only) — artifact: `docs/research/miniapp-p8-readiness/2026-07-10/anchor-coverage-probe.md`. Headline (n_due=50):

- **anchor coverage 64%** (32/50 due items have their unambiguous form in the user's own texts; all 32 also admit a single-blank cloze);
- **dictate-ready 62%** (31/50, всё с запечёнными ассетами) · reverse-strict 14% (7/50);
- **any production modality 84%** (42/50); modality∧anchor 64%; **neither 16%** (8/50);
- dictate-only 9 · cloze-only 8 · reverse-only 1 → 20% of due trainable ONLY through honest lexeme modalities;
- serving cap `MAX_DUE_FORMS=40` loses 4 anchored items at pool=50 — P8.3 orchestrator note.

**Fork-4 → C (mixed by modality), data-driven:** cloze = anchor-required by construction; dictate/reverse = honest lexeme modalities with the sentence ATTACHED when it exists (64%), honestly omitted when not; the 8 no-modality-no-anchor items route to reading. Strict 4A would over-exclude 20% of due; 4B would under-use 64% real context. **P8.3 is unlocked.**

---

## §3 TELEGRAM LAUNCH CONTEXTS & CAPABILITY MATRIX (§3.3)

Verified live from `core.telegram.org` 2026-07-09 (Bot API 10.1 current; Mini-App-relevant surface stabilized at 8.0). **Gate by `isVersionAtLeast()`, never by `platform` string** (platform values are convention, not officially enumerated; client build ≠ latest Bot API).

| Launch context | How `start_param` arrives | Notes / fallback |
|---|---|---|
| **Bot menu button** | none (no `start_param`) | primary discoverable entry; home shows due + CTA |
| **`web_app` inline button under /review or a nudge** | `initData.start_param` if we use a Direct-Link with `startapp` | the nudge deep-links straight to a session |
| **Direct link `t.me/bot/app?startapp=<token>`** | `start_param` = `startapp` value; also as `tgWebAppStartParam` GET param | ≤64 chars, `A-Za-z0-9_-`, base64url — carries an **opaque** session/handoff token, never raw anchors |
| **Attachment menu** | `start_param` = `startattach` value | likely unused for P8 |
| **Reopen from recent apps** | may relaunch with stale `start_param` | must treat `start_param` as a *hint*, re-validate server-side; never auto-act |

**Capability matrix (feature → min Bot API → P8 fallback):**

| Feature | Min | Fallback if `!isVersionAtLeast` |
|---|---|---|
| `ready()`, `expand()`, `viewportHeight`, `viewportStableHeight`, `viewportChanged`, `themeParams`/`themeChanged`, `MainButton`, `BackButton` | 6.0–6.1 | our floor; below this, render a plain DOM page |
| `enableClosingConfirmation` | 6.2 | skip confirmation (we only enable it on real unsaved input anyway) |
| `SettingsButton` | 7.0 | use in-DOM settings row |
| `openTelegramLink` without closing app | 7.0 | on older clients it closes the app → prefer `openLink` for handoff |
| `disableVerticalSwipes` | 7.7 | accept native swipe-to-dismiss; guard unsaved input via closing confirmation |
| `SecondaryButton` / `BottomButton` rename / `position` | 7.10 | single `MainButton` + DOM secondary action |
| `isActive`/`activated`/`deactivated`, `safeAreaInset`, `contentSafeAreaInset`, fullscreen | 8.0 | fall back to `document.visibilitychange`; pad with a conservative fixed safe-area constant; **do not rely on CSS `env(safe-area-inset-*)` — unreliable in iOS WebView** |

**Cross-platform gotchas to design around (verified):** iOS `viewportHeight` may not reflect the on-screen keyboard (form repositioning must not depend on it); iOS `env(safe-area-inset-*)` unreliable → use Telegram's `safeAreaInset`/`contentSafeAreaInset` + CSS vars `--tg-safe-area-inset-*`; iOS `expand()` can leave a top gap; deep-links less reliable on iOS → defensive fallback UI; Mini App runs in the host OS WebView (can lag evergreen browsers) → **test on real Android + iOS + Desktop + Web, not desktop Chrome resized.** `openLink`/`openTelegramLink` require a **user gesture** (documented) → handoff must be triggered from a tap handler, never a timer/`.then()`.

---

## §4 REUSE MAP — mentor-home (P9) / P7 (§ deliverable 4)

| Component (`file:line`) | Verdict | Reason |
|---|---|---|
| `jget`/`jpost` (`mentor-home.js:40-51`), `credentials:"same-origin"` + `X-LP-CSRF` | **Reuse as-is** | same-origin API; no OPFS/cookie coupling |
| `renderStatus` / consent toggle / `degradeLabel` (`mentor-home.js:61-129`) | **Reuse as-is** | API-driven, DOM-only |
| `renderPlanBlock`/`runPlan` (`mentor-home.js:190-251`) | **Reuse core, adapt `host.runTrainer`** | fetch/render host-agnostic; `runTrainer` becomes an in-app session start |
| `renderHistory`/tombstones (`mentor-home.js:253-320`) | **Reuse as-is, adapt `host.openTextAt`** | list/pagination/purge pure; `openTextAt` OPFS resolve **not transplantable** |
| `renderConstructs` (`mentor-home.js:322-337`) | **Reuse as-is** | pure API read |
| `mount`/`refresh`/`S` closure (`mentor-home.js:386-394`) | **Reuse as-is** | second mount = designed reuse path; no teardown → host manages show/hide |
| `dir=auto`/`dir=rtl` handling (`mentor-home.js:200,279`) | **Reuse as-is** | RTL-in-LTR-shell is standard HTML, host-independent |
| Tier-1 stub (`mentor-home.js:352-361`) | **Reuse, re-copy** | mechanically portable; copy references PWA ☁ button → re-word via `host.t()` |
| `renderTelegramBlock` pairing (`mentor-home.js:135-187`) | **REJECT / inverts** | pairing PWA→bot is **backwards inside Telegram**; P8 uses `initData→channel_links`. Needs a *reverse* "link your cloud account" flow for an unpaired Telegram user (new state, §5.3) |
| `host.csrf` = `localStorage['cloud.csrf']` (`library-ui.js:2527`) | **REJECT impl, reuse contract** | Mini App sources CSRF from its own session bootstrap |
| `host.openTextAt` OPFS `SELECT id FROM texts` (`library-ui.js:2533`) | **REJECT impl, reuse contract** | webview has no OPFS → **handoff token to the PWA (§9)** |
| `host.openReading` = `closeMentorView` (`library-ui.js:2529`) / CSS `#roomMentorView` | **REJECT (DOM-coupled)** | re-author shell + lifecycle wrapper for the Mini App container |

**Net:** the *data-access layer and renderers* transplant; the *host-adapter implementations, pairing flow, and OPFS handoff* are new. Exactly the P9-as-skeleton thesis.

---

## §5 CHANNEL-NEUTRAL REVIEW-SESSION ORCHESTRATOR (§ deliverable 5)

**Goal:** one selector/orchestrator serves bot **and** Mini App; parity proven by real `start→challenge→answer` flows on both surfaces, not a shared helper alone.

**Proposed boundary (server-side service, extracted from `agent/telegram/review.js`):**

```
reviewSession.start(principal, {surface})      → challenge descriptor (server-selected)
reviewSession.answer(principal, challenge_id, attempt_id, answer, {surface}) → existing reviewer.record
reviewSession.skip(principal, challenge_id, attempt_id, {surface})          → existing explicit-skip policy
reviewSession.annul(principal, review_row_id, reason)                        → existing _annul (24h window)
```

Both adapters receive the **same** eligibility, ordering, `select_reason`, exposure rules, challenge state, grader, provenance, and review-event semantics. Bot adapter formats to messages (ForceReply); Mini App adapter renders touch UI + submits over the trusted HTTP surface.

**What must change in the challenge layer (grounded — this is NOT purely additive):**

1. **`agent_challenges` surface generalization.** Today: `telegram_user_id`/`telegram_chat_id` **NOT NULL** (`migrations/028:21-22`), reply-binding via `telegram_prompt_message_id`. Add `surface TEXT NOT NULL DEFAULT 'telegram_bot'` (migration 034); make `telegram_chat_id`/`telegram_prompt_message_id` nullable for `surface='telegram_miniapp'` (Mini App has no chat message to reply to). **Keep one home of fact** — do NOT create a `miniapp_challenges` table (fork-6).
2. **Answer→challenge binding branches by surface.** Bot: `reply_to_message_id == telegram_prompt_message_id` (`review.js:313`). Mini App: `challenge_id` + authenticated session + client-supplied stable `attempt_id`. **Idempotency gap:** bot `attempt_id = "tg"+sha1(challenge_id+":"+update_id)`; Mini App has **no `update_id`** → the client must send a stable `attempt_id` (nonce) generated once per challenge and resent verbatim on retry, so `ingestBatch(idempotency_key="miniapp:"+attempt_id)` replays instead of double-writing (§13 lost-response recovery).
3. **Widen the write-gate regex deliberately, fail-closed.** `CHALLENGE_CHANNEL_RE = /^(reverse|cloze|dictate):tg$/` (`reviewer.js:49`) and `ctx.viaTelegramReview` are the literal trust anchors. Generalize to a `ctx.surface ∈ {telegram_bot, telegram_miniapp}` trusted-origin check + a channel family that still fail-closes on anything unexpected. The HTTP `/api/agent/review` path stays receptive-locked; the new Mini App answer endpoint sets the trusted surface flag **only after** the initData-derived session + active-link + consent checks pass (§8.3).
4. **One active challenge per user across surfaces (fork-6A recommended).** The partial-unique `ux_agent_challenges_open ON (user_id) WHERE status IN ('active','processing')` (`migrations/028:46`) **already enforces one open challenge per user, surface-agnostic** — so a single item cannot be simultaneously active on bot + Mini App *for free*. Keep this; it is the anti-double-surface guarantee (§7). A Mini App `start` returns the existing open challenge if one exists (resume), else creates one.

**Everything else is reused unchanged:** `claimForAttempt`/`complete`/`release`/`decline`/`cancel` state machine, TTL 10min, exposure cooldown (30min)/`tg_stimulus_exposure`, `selectEligible` tiers + `select_reason`, grader + provenance, `_ingestOne` → `ingestBatch` → `recomputeForKeys`, MNAR/ktiv/near_miss/abstain write-nothing rules, annul.

---

## §6 CONTEXT-FIRST MASKING MATRIX + LEAK-GATE (§ deliverable 6)

Context-first is a **gate, not a preference** (canon §8/§9). Every challenge carries a server-attested source anchor **if one exists**, and **never** reveals the expected answer pre-submit.

| Modality | Pre-answer stimulus | Masking rule | Post-result reveal |
|---|---|---|---|
| **Cloze** | source sentence with target replaced by a blank | no expected form anywhere before submit; expected = **surface** (`chal.expected_surface`), not lemma | reveal + highlight target in the sentence |
| **Dictate** | audio + source sentence with target masked | surrounding context allowed only if it doesn't reveal the target; replay audio ≠ grade | show full sentence + written form |
| **Reverse** | RU gloss + source sentence with target masked | Hebrew expected **absent** from prompt payload, DOM, and a11y tree | full sentence |
| **Receptive/reveal** | full source sentence, meaning hidden | grade only after explicit reveal + explicit self-rating | — |

**Structural leak-gate (must all hold; enforced client + server):**
- expected absent from pre-answer visible text;
- expected absent from `aria-*`/`title`/`data-*` attributes;
- expected absent from client logs;
- expected **not shipped** in the challenge JSON until after submit (server sends the masked stimulus + a `challenge_id`; the expected form stays server-side and is resolved at grade time exactly as `reviewer.js:167-169` does today);
- shown stimulus contains no accepted skeleton (reuse the existing `shown_stimulus`/`stimulus_hash` audit columns);
- the **server** challenge builder rejects a leak-capable challenge.

**If no source anchor exists:** do NOT fabricate a sentence; do NOT show "from your text." Decision is **fork-4**, gated on the §2.3 measurement — options: skip item / open Зал (strictest), honest lexeme-only fallback, or mixed-by-modality. **Owner fork; do not pre-decide before the coverage number.**

---

## §7 READING-FIRST / ANTI-CANNIBALIZATION CHANNEL ALLOCATION (§ deliverable 7)

Named, gated risk (Critique §M16): agent channels close due-words out of context → the Зал due-ring empties → the main trigger to return to reading disappears. P8 owns *not regressing* the invariant it will be measured against (metric itself is P10).

**Allocation policy (deterministic, shared with the selector — no second policy):**
- overdue / almost-lapsed → Mini App allowed by default;
- recent-struggle → cued/contextual modality (already how `selectEligible` tiers 1–2 behave);
- **fresh due → preferentially left to reading** by default;
- user may explicitly choose "review everything now" (override);
- **one item never active on two Telegram surfaces** — guaranteed *for free* by the surface-agnostic `ux_agent_challenges_open` index (§5.4).

**The client passes only INTENT, never selection.** `POST /api/miniapp/review-sessions {mode:"reading_first"|"all_due"}`. The client does **not** send `item_key`, overdue-flag, priority, modality, or grade — the server builds the eligible pool. `reading_first` is the system default; `all_due` is an explicit user override ("Repeat all now"). First UI = primary reading-first + a secondary "Повторить всё сейчас" button. Future `review_default_mode ∈ {reading_first, balanced, all_due}` can be added without a schema change.

**Allocation is a versioned server-side policy module (owner, 2026-07-09) — separated from every surface (norm §20.4):**

```
ReviewAllocationPolicy
  policy_version
  classifyDueItem()        → fresh_due | almost_lapsed | overdue | recent_struggle | reading_reserved | user_override
  buildEligiblePool()
  applyReadingReservation()
  applyExplicitOverride()
```

The chosen `allocation_policy`/`scope`/`override` are stamped into **challenge provenance** so a review event is self-describing and auditable — e.g. `{"selection":{"allocation_policy":"reading-first-v1","scope":"overdue_or_almost_lapsed","override":false,"select_reason":"recent_struggle_prefer_cued"}}`. **Bot and Mini App call the SAME module** — neither surface classifies due items itself.

**Values to SET FROM the §2.2 measurement, not guess (§7 discipline):** the `almost_lapsed` predicate/threshold, overdue threshold, fresh-due reservation, session cap, anti-starvation floor, user override. Each lives in the one policy file, carries `policy_version`, and is used identically by both surfaces. **Data-driven starting point from the 2026-07-09 measurement** (owner to confirm as `reading-first-v1`): because at this profile maturity *all 51 due are already overdue*, keying the Mini-App pool on overdue-age reserves almost nothing for reading; instead default the Mini-App pool to **`almost_lapsed := lapses≥1 OR stability<1`** (~15 items) and reserve the **~36 zero-lapse healthy due** for reading, with the explicit "review everything now" override lifting the reservation. Re-derive as the pool grows (more scheduled items, longer intervals → overdue-age regains signal). **Anti-starvation already exists** (selector tier "default_dictation" guarantees a due word eligible only for dictate is never silently dropped — `review.js:170`) and must be preserved.

**Minimal guardrail telemetry (P8, events only — analysis is P10):** reviews completed in Mini App; reviews completed in reading; reading opens after Mini App; source deep-link success; share of Mini App reviews carrying source context; reading-session frequency (for later delta). See §10.

---

## §8 AUTH & SECURITY — pointer

Full spec: **`TELEGRAM_MINI_APP_P8_SECURITY_2026_07_09.md`**. Summary of the binding decisions:
- **Auth exchange** `POST /api/telegram/miniapp/session`: raw `initData` once → HMAC-SHA256 validate (secret = `HMAC("WebAppData", TELEGRAM_BOT_TOKEN)`) → short `auth_date` TTL → map `telegram_user_id → user_id` via `getActiveLinkByTg` (active link + live `telegram_delivery` consent required) → mint a **scoped short-lived session** (recommend a `scope` on `user_sessions` reusing `validateSession`/`requireCsrf`/revoke/GDPR machinery) → raw initData never accepted per-request afterward. `user_id` never from body. Replay dedup on `(hash, auth_date)` since `query_id` is **not** an official nonce.
- **Browser security:** strict CSP; `textContent`-only rendering (no agent HTML); no auth token in `localStorage`/URL/logs; no raw `initData`/answer/expected/prompt in logs; feature-flag fail-closed; separate rate limits for auth/start/answer/annul/handoff.
- **Challenge binding (§8.3):** answer accepted only if challenge belongs to the authenticated user, surface allowed, active, `attempt_id` matches, not expired, answer-family matches `prompt_kind`, expected taken only from the server challenge, single-use, dedup on repeat; nothing trusted from client (`item_key`/`expected`/`grade`/`channel`/`source`/`select_reason`/anchor/audio/event id).

---

## §9 DEEP-LINK / HANDOFF TO THE ЗАЛ (§ deliverable 8 — summary; detail in security spec)

`openTextAt(text_key, order_index)` from P9 **cannot** be mechanically ported: the PWA may not be logged in, and raw anchors would leak data into URL/history. Two designs:

- **A. Raw anchor URL** — simple, but leaks `text_key`/`order_index` into URL + browser history; no purge/revoke fail-close; rejected as default.
- **B. Opaque one-time handoff token (RECOMMENDED)** — server-bound to `user_id`, `text_key`, `order_index`, optional `token_index`, `expires_at`, `used_at`, intended action. Flow: explicit "Open in Зал" tap → Mini App requests handoff (`openLink`/`openTelegramLink`, gesture-bound) → server checks session + consent + artifact existence → issues short link with opaque token → PWA accepts token → binds to live browser session or offers safe login → runs down-sync → opens the right text, scrolls to `order_index`, highlights target **without** leaking sensitive data in the URL → token single-use/TTL → purge/revoke ⇒ fail-closed. New table `handoff_tokens` (migration 034; auto-covered by GDPR sweep via its `user_id` column).

Contexts to test: open via `openLink` (gesture only), existing browser focus, new browser, installed PWA, mobile Safari/Chrome, desktop, expired token, missing text, changed-but-re-anchorable text, deleted text.

---

## §10 TELEMETRY CONTRACT (§ deliverable 9)

Only privacy-safe `learner_events` (telemetry-only; **review facts FORBIDDEN here** — they go to `review_log`) + operational metrics. `learner_events.type` vocabulary is ingest-enforced; payload = identifiers only, size-capped; timestamps UTC-Z.

**Allowed events:** `miniapp_opened`, `miniapp_auth_succeeded`, `miniapp_auth_failed{error_code}`, `miniapp_home_ready`, `review_session_started`, `challenge_shown{kind, reason}` (enums only, no item), `answer_submitted`, `answer_recorded`, `answer_abstained`, `explicit_skip`, `challenge_abandoned`, `review_session_completed`, `reading_handoff_requested`, `reading_handoff_opened`, `miniapp_closed`, `retry_recovered`.

**Never write:** raw answer, expected, sentence, `text_key`, `item_key`, Telegram profile JSON, raw `initData`, document title, audio text.

**Bot baseline (folded into P8.0, not a separate phase):** add the comparable events on the *existing bot* path now — `review_session_started`, `challenge_shown`, `answer_recorded`, `review_session_completed`, messages-per-completed-review, abandonment, elapsed time, transition-to-Зал — so the moment the Mini App ships there is a Bot-vs-Mini-App baseline: bot completion vs Mini App completion; bot messages/card vs Mini App actions/card; bot abandonment vs Mini App abandonment; reading-return for each.

---

## §11 STAGED PLAN P8.0–P8.6 (§ deliverable 10)

Each slice: grounded recon → spec → adversarial role-critique → owner forks → code → diff-critique → independent gate → adjacent regression → commit+push → prod-verify → owner live-verify.

| Slice | Scope | No-prod-UI? | Writes? |
|---|---|---|---|
| **P8.0** | Product charter (this doc) + security/session decision (companion) + §2.3 builder-probe number + **bot baseline telemetry** (§10) | mostly design + bot instrumentation | bot `learner_events` only |
| **P8.1** | Auth exchange (`/api/telegram/miniapp/session`) + Telegram shell (host adapter, theme/safe-area) + read-only `/me`; pairing/consent states | minimal shell | none (auth session only) |
| **P8.2** | Read-only mentor home: primary CTA + progress MVP (§12) + plan/explanations lazy | — | none |
| **P8.3** | Server review-session + context-first rendering (start/resume challenge) | behind write flag OFF | none (flag OFF) |
| **P8.4** | Answer/skip/annul + down-sync — full canonical cycle | — | **review_log** (flag ON, owner) |
| **P8.5** | Reading handoff + Telegram-native polish (MainButton/BackButton, a11y) | — | handoff tokens |
| **P8.6** | Owner rollout + closed pilot (flag, metrics, rollback drill) | — | — |

---

## §12 OWNER FORKS — recommendations (§ deliverable 11)

The 4 most decision-gating forks are asked via `AskUserQuestion` this session; all 10 are recorded here with recommendations. Unasked ones default to the recommendation unless the owner overrides.

> **RESOLVED 2026-07-09 (owner):** Fork 1 → **A (context micro-session)** · Fork 2 → **A (owner-pilot now)** · Fork 3 → **A (reading-first)** · Fork 7 → **A (scoped cookie on `user_sessions`)**. Forks 5, 6, 8, 9, 10 **default to their recommendations** (opaque handoff token · single active challenge across surfaces · coordinated MainButton+DOM · today-completed+due-remaining+reading CTA · owner→closed-pilot→wider-flag).
> **Fork 4 → C (mixed by modality), MEASURED 2026-07-10 (§2.3):** anchor coverage 64% / any-modality 84% / dictate-only+reverse-only 20% → strict 4A would over-exclude, 4B would under-use context. cloze = anchor-required by construction; dictate/reverse = honest lexeme with anchor attached when it exists; no-modality-no-anchor (16%) → route to reading. Awaiting owner confirm at P8.3 spec approval.

1. **Role of P8** → **A. context micro-session + return-to-reading (RECOMMENDED)** · B. mirror Mentor Home · C. full PWA-lite.
2. **Launch gate** → **A. owner-pilot now, product-validation later (RECOMMENDED at n=1)** · B. wait for external pilot · C. instrument the bot first.
3. **Fresh-due policy** → **A. reading-first, Mini App mostly overdue/almost-lapsed (RECOMMENDED)** · B. all due available · C. user-selectable mode.
4. **Missing source sentence** → A. skip/open Зал (strictest) · B. honest lexeme fallback · C. mixed by modality. **Deferred until §2.3 coverage number exists** (recommendation set after measurement).
5. **Deep-link** → **A. opaque one-time handoff token (RECOMMENDED)** · B. raw `text_key`/`order_index` URL.
6. **Active challenge** → **A. single active challenge per user across bot+Mini App (RECOMMENDED — already enforced by `ux_agent_challenges_open`)** · B. per-surface · C. session queue.
7. **Auth session** → **A. scoped server-session cookie + CSRF (RECOMMENDED)** · B. short bearer token · C. raw initData per request — **FORBIDDEN**.
8. **Primary action UI** → A. Telegram MainButton · B. DOM CTA · **C. coordinated MainButton + DOM navigation (RECOMMENDED — MainButton for submit, DOM for in-app nav; guard viewport-instability)**.
9. **Progress scope** → **A. today-completed + due-remaining + reading CTA (RECOMMENDED)** · B. full P9 dashboard · C. P10-lite analytics (NOT recommended).
10. **Rollout** → **A. owner → closed pilot → wider flag (RECOMMENDED)** · B. owner → straight ON.

---

## §13 ACCEPTANCE GATES (§ deliverable 12) — must be independent, not tautological

- **`smoke:miniapp-auth`** — valid raw initData; tampered field; bad hash/signature; expired/future `auth_date`; missing user; 64-bit Telegram id (no truncation); unlinked/pending/revoked link; revoked consent; foreign `user_id` in body → 403; replay (same hash+auth_date); session expiry; unlink/delete invalidate session; **raw initData absent from stdout/logs**.
- **`smoke:miniapp-review`** — same selector result as the real shared orchestrator (drive both surfaces, compare); context anchor present; modality masking; **no expected leak** (payload+DOM+a11y); answer→grade provenance; **exactly one** review event; retry idempotency; lost-response recovery by `attempt_id`; explicit skip; close/no-answer → **zero** review rows; unsupported/empty → zero rows; annul; projection parity; **down-sync into OPFS**; local replay == server replay.
- **`smoke:miniapp-reading-handoff`** — correct user/text/`order_index`; expired token; used token; cross-user token; purge; missing artifact; changed-but-re-anchorable text; login-required path; **no raw sensitive anchor leakage**.
- **`smoke:miniapp-ui`** — 320/360/380/430 widths; light/dark; ru/en/he; mixed RTL; safe-area; compact/full-height; Android/iOS/Desktop/Web capability fallback; Back-handler teardown; MainButton no duplicate callback; keyboard; text scaling; offline/retry; **no HTML injection**.
- **Regression (must stay green):** telegram-review, telegram-selector, telegram-dictate, telegram-cloze, telegram-nudge, agent-review, grade-policy, server-replay, memory-canon, cloud-sync, artifact-sync, mentor-home, auth, learner-graph, account export/delete, i18n, api-smoke.

**Anti-tautology rule:** gates drive real HTTP/session/challenge/reviewer paths; expected state constructed independently (recompute due/session from raw log, not from the code under test); verify the **browser OPFS** leg, not only server DB.

---

## §14 EXPLICIT NON-GOALS (§ deliverable 13)

No P10 analytics; no teacher dashboard; no personal-curriculum engine; no free-form AI chat; no second selector/grader/SRS; no Mini App writes to projections/`word_status`/SRS; no LLM choosing modality or grade; no reading surface beyond the anchoring sentence; no raw-answer/expected persistence beyond canon; no auto-open/auto-review/auto-write without explicit user action; no Tier-1/local-only PWA regression.

---

## §15 RISK REGISTER (§ deliverable 14)

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | **Cannibalization** of reading-native retrieval | med | §7 allocation (fresh-due reserved to reading), guardrail telemetry, kill criterion |
| R2 | **initData replay** (HMAC key = non-rotating bot token → captured initData valid forever) | med-high | short `auth_date` TTL + `(hash,auth_date)` dedup + own scoped session; never raw initData per request |
| R3 | **Context-first not honestly achievable** (too few due items anchored) | unknown → **measure (§2.3)** | builder probe before P8.3; fork-4 policy; skip/open-Зал fallback |
| R4 | **Second writer of state during migration** (P8 double-writes something the bot owns) | low | single orchestrator, single `review_log` ingest, single selector; `ux_agent_challenges_open` cross-surface |
| R5 | **Expected-answer leak** into payload/DOM/a11y/logs | med | structural leak-gate (§6) + server builder rejects leak-capable challenge + smoke gate asserts DOM/a11y |
| R6 | **Lost-response double-write** (network drops after server commit) | med | client-stable `attempt_id` nonce → `ingestBatch` idempotency replays |
| R7 | **Down-sync gap** ("server wrote" but OPFS never got it) | med | mandatory `syncDown` after Mini App review; superset-verify; rollback drill re-run with Mini-App-originated events |
| R8 | **iOS WebView quirks** (viewport/keyboard, `env()` safe-area, `expand()` gap, deep-link flakiness) | med | Telegram safe-area API not CSS `env()`; test on real iOS; defensive handoff fallback |
| R9 | **Unpaired Telegram user** (has Telegram, no cloud account) | high for external | explicit "not paired" state + reverse account-link flow (§5.3); no silent auth |
| R10 | **GDPR miss** on new tables | low | structural sweep auto-covers any `user_id` table; add export secret-strip for token hashes |
| R11 | **Consent race** (revoke between prompt and answer) | low | live fail-closed rechecks at delivery + write (mirror `reviewer.js:143-147`) |
| R12 | **Over-claiming validation** from a green smoke | med | §1 launch-trigger metrics gate the word "validated"; owner live-verify required |

---

## §16 COMPLEXITY ESTIMATE PER SLICE (§ deliverable 15)

| Slice | New server | New client | New migration | Relative effort |
|---|---|---|---|---|
| P8.0 | — | — | — | **S** (this doc + probe) |
| P8.1 | initData validate + session mint + rate-limit | Telegram shell + host adapter | 034 (surface col, sessions scope or table, handoff table can defer to P8.5) | **L** (security-critical, new auth path) |
| P8.2 | none (reuse endpoints) | home render (reuse mentor-home) | — | **M** |
| P8.3 | `reviewSession.start` + surface-generalized challenge + masked descriptor | challenge render (cloze/dictate/reverse/reveal) + leak-gate | — | **L** |
| P8.4 | `reviewSession.answer/skip/annul` trusted surface + down-sync endpoint reuse | submit + result + down-sync trigger | — | **L** (write path, idempotency, MNAR) |
| P8.5 | handoff token issue/redeem | MainButton/BackButton, a11y, handoff | handoff table if deferred | **M** |
| P8.6 | flag + metrics + rollback drill | — | — | **M** |

---

## §17 NEW FILES / MIGRATIONS / ENDPOINTS (§ deliverable 16)

**Migrations (start at 034):**
- `034_miniapp.sql` — `agent_challenges.surface` column (default `'telegram_bot'`, nullable `telegram_chat_id`/`telegram_prompt_message_id`); Mini App session scope (either `user_sessions.scope`/`auth_source` columns **or** a `miniapp_sessions` table — fork-7); `handoff_tokens` table (`user_id`, `text_key`, `order_index`, `token_index?`, `token_hash`, `expires_at`, `used_at`, `action`). All `user_id`-scoped tables auto-covered by GDPR sweep; add `exportUserData` secret-strip for any token hash.

**Endpoints — a Backend-for-Frontend (owner, 2026-07-09), NOT the Mini App cookie hitting `/api/learner/*`/`/api/agent/*` directly.** A dedicated `/api/miniapp/*` surface guarded by `requireSessionKind('telegram_miniapp')`; each route internally calls the same application services the PWA/bot use. This avoids scattering dozens of per-endpoint scope checks and lets the audience guard be centralized.

- `POST /api/miniapp/session` — initData → scoped session (`session_kind='telegram_miniapp'`, no `user_id` from body).
- `GET  /api/miniapp/home` — home payload (wraps `learnerGraphService.getAgentContext` + recommendation + last explanation).
- `POST /api/miniapp/review-sessions` — start/resume; body `{mode:"reading_first"|"all_due"}` (intent only).
- `POST /api/miniapp/review-sessions/:id/answer` — answer (stable `attempt_id`, `UNIQUE(user_id, attempt_id)`).
- `POST /api/miniapp/review-sessions/:id/skip` — explicit skip.
- `POST /api/miniapp/review-events/:id/annul` — annul within 24h.
- `POST /api/miniapp/reading-handoffs` — issue opaque handoff token.
- `GET  /api/miniapp/reading-handoffs/:token` (PWA redeem side) — redeem + open.

Centralized guard: `/api/miniapp/* → requireSessionKind('telegram_miniapp')`; PWA-privileged routes → `requireSessionKind('pwa')`; genuinely shared read-only endpoints accept both via an **explicit allowlist**, never by default.

**Server application services (new / extracted):**
- `agent/reviewSession.js` — **channel-neutral** `reviewSessionService.{start,resume,answer,skip,annul}`, extracted from `agent/telegram/review.js`; both `telegramBotReviewAdapter` and `telegramMiniAppReviewAdapter` delegate to it (norm §20.1).
- `agent/reviewAllocationPolicy.js` — the versioned `ReviewAllocationPolicy` module (§7); one home of the reading-first/almost-lapsed rules for both surfaces (norm §20.4).
- `agent/telegram/miniappAuth.js` — initData HMAC validation + session mint (security spec §8.1).
- Thin service wrappers as needed: `learnerGraphService`, `graderService` (existing `agent/grader.js`), `artifactService` (existing `learnerArtifactsRepo`), `readingHandoffService`.

**Client files (new):** `public/miniapp.html` (Telegram shell), `public/js/miniapp-host.js` (Telegram-native host adapter: `ready/expand/theme/safe-area/BackButton/MainButton/closingConfirmation/isActive`), `public/js/miniapp-ui.js` (session/challenge render + fuller home shell, reusing `mentor-home.js` renderers as the **secondary read-only layer**). **`index.html` and `library.html` untouched.**

---

## §18 FIRST-PRODUCTION-CODE CRITERION (§ deliverable 17)

Production code (beyond P8.0 docs) is authorized only when **all** hold:
1. Owner approves the §12 forks (at least 1,2,3,5,6,7,9,10; fork-4 may wait for §2.3).
2. The §2.3 builder-probe anchor-coverage number exists (gates the context-first honesty claim + fork-4).
3. The security spec (`TELEGRAM_MINI_APP_P8_SECURITY_2026_07_09.md`) is owner-approved (auth/session/challenge-binding/handoff).
4. Ops preconditions §19 have an owner-agreed sequencing (some may run in parallel with P8.1–P8.4 but MUST close before P8.6 public/pilot enable).

**First code slice = P8.1** (auth exchange + shell), never HTML/CSS first, never copying `agent/telegram/review.js` into browser code.

---

## §19 OPS / ROLLBACK PRECONDITIONS (before public/pilot enable)

Close before P8.6: rotate `AUDIO_UPLOAD_TOKEN`; firewall Coolify port 8000; scrub attack-roadmap/private docs; re-run the P3 rollback drill **with Mini-App-originated review events**; backup/integrity; disk alert; `MINI_APP_ENABLED` kill-switch; session-purge job; challenge-expiry cleanup; delete/export completeness (new tables); rate-limit burst; **no raw initData/answer/prompt in logs**.

**Rollback (`MINI_APP_ENABLED=0`) must:** stop new sessions/challenges; **keep** already-written review events; finish server→OPFS down-sync; verify checksum; preserve auditability; leave no active sessions/challenges; not disturb the Telegram bot or PWA.

---

## §20 OWNER ARCHITECTURAL INVARIANTS (RESOLVED 2026-07-09)

Beyond the four fork choices, the owner fixed five non-negotiable norms. They are the "fundament for scaling" and bind every slice:

1. **Channel-neutral review session.** No second learning engine (`telegramMiniAppReview.js`). One `reviewSessionService.{start,resume,answer,skip,annul}`; `telegramBotReviewAdapter` + `telegramMiniAppReviewAdapter` only format/render. Bot and Mini App share one selector, one grader, one challenge table, one `review_log`.
2. **Active challenge = a server transactional entity**, uniqueness enforced by the **DB**, not a Node in-memory `Map`/process-local lock (so it holds across multiple API instances). Invariant: one user + one item + one active learning challenge **across bot + Mini App** — provided today by the partial-unique `ux_agent_challenges_open` (`migrations/028:46`); keep it (or a transactional `active_challenges` acquire) as the mechanism.
3. **Idempotency on every write.** Each submit carries `attempt_id` + `challenge_id` + `session_id`, with `UNIQUE(user_id, attempt_id)`. Lost client response → retry returns the prior result; `review_log` keeps exactly one row.
4. **Policy separated from surface.** Neither bot nor Mini App decides fresh-vs-overdue, dictate/cloze eligibility, reading-reservation, recent-struggle, or source-sentence admissibility — the versioned server `ReviewAllocationPolicy` (§7) does, identically for both.
5. **Deep-link via opaque handoff only.** No `text_key`/`sentence_id`/`order_index`/`item_key` in any URL; a short-lived server `reading_handoff_token` bound to `user_id`/`text_key`/`order_index`/`expires_at`/`used_at`, so internal ids, re-anchor rules, and login flow can change without touching the Mini App client (§9).

**Home information architecture (Mentor Home = secondary read-only layer, not the central role):**

```
Home
├── Continue training   (primary CTA)
├── Due / done today     (honest counts, §12)
├── Mentor recommendation + select_reason
├── Last explanation
└── Open in the Зал
Micro-session
├── cloze · reverse · dictate
├── server result + deterministic feedback
├── source sentence (masked pre-answer)
└── one tap → exact place in the Зал
```

## The phase question, answered

**"How to make the Mini App substantially better than the Telegram bot without turning it into a degraded copy of the Зал or breaking reading-native retrieval?"**

By making it the **fastest path to a tap-native, context-anchored micro-session that ends by pushing the user back into the living text.** Concretely: (1) **tap, don't type** — cloze/dictate/reverse rendered as touch targets with instant deterministic feedback + the honest *why-this-modality*, replacing the bot's ForceReply round-trips; (2) **context-first as a visible gate** — every card shows its source sentence (masked pre-answer, revealed after), which the bot can only gesture at in text; (3) **visible session shape** — n/N, due-remaining, "5 minutes," which the bot lacks; (4) **one-tap return to the exact sentence in the Зал** via an opaque handoff token — the Mini App's *only* reading affordance, so it *feeds* reading rather than replacing it; (5) **reading-first allocation** — fresh due stays with the Зал by default, the Mini App works overdue/almost-lapsed, and the shared open-challenge index guarantees no item is reviewed twice across surfaces. It is deliberately poorer than the Зал (no corpus, no library, no reader) and identical to the bot underneath (same selector, grader, log, consent, replay) — a thin client whose entire added value is *speed, tappability, honest context, and a clean door back to reading.*
