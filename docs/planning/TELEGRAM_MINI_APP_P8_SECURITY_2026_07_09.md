# CLG-P8 — Telegram Mini App — AUTH & SECURITY SPEC

**Date:** 2026-07-09 · **Status:** design (owner-approval gate before any code) · **Parent:** `TELEGRAM_MINI_APP_P8_RECON_2026_07_09.md`
**Grounding:** live Telegram Mini Apps docs (`core.telegram.org/bots/webapps`, fetched 2026-07-09, Bot API 10.1) + `db/identityRepo.js`, `db/channelLinkRepo.js`, `agent/reviewer.js`, `server.js` (all `file:line`-verified this session).

> This spec must be owner-approved before P8.1 code. It defines the auth exchange, browser security posture, challenge binding, and deep-link handoff. It does **not** relax any P7 write-gate — it adds a **new, equally fail-closed** trusted surface.

---

## §8.1 AUTH EXCHANGE

### Contract

```
POST /api/telegram/miniapp/session
Body: { init_data: "<raw Telegram.WebApp.initData string, verbatim>" }
→ 200 { ok:true }  + Set-Cookie: lp_miniapp_session=<id.secret>; HttpOnly; SameSite=Lax; Secure
                    + { csrf:"<token>", user:{...masked}, consents:{...} }
→ 401 { ok:false, error:"MINIAPP_AUTH_FAILED", code:"<enum>" }
```

The client passes **raw `Telegram.WebApp.initData`** (the URL-encoded query string) **exactly once**. Never `initDataUnsafe` (client-parsed, unsigned).

### Server validation (ordered, fail-closed at every step)

1. **Feature flag** `MINI_APP_ENABLED === "1"` else `503 FEATURE_FLAG_OFF` (no auth attempt, no log of body).
2. **Bot token present** — `TELEGRAM_BOT_TOKEN` (`agent/telegram/api.js:16`) else `503` (fail-closed, mirrors webhook `server.js:1870`).
3. **Parse** `init_data` as `application/x-www-form-urlencoded`. Reject if size > cap (e.g. 4 KB) → `MINIAPP_INITDATA_TOO_LARGE`.
4. **Separate `hash`** (and `signature` if present) from the rest. `hash` is not part of the data-check-string.
5. **Build data-check-string:** all remaining fields sorted alphabetically by key, joined `key=<value>` with `\n` (LF). (Verified algorithm.)
6. **Derive secret key:** `secret_key = HMAC_SHA256(key="WebAppData", data=TELEGRAM_BOT_TOKEN)`. We are **first-party** (we hold the bot token) → use HMAC, not the Ed25519 third-party path.
7. **Verify:** `HMAC_SHA256(key=secret_key, data=data_check_string)` hex, **constant-time** compare to received `hash`. Mismatch → `MINIAPP_BAD_HASH`. (Constant-time like `db/identityRepo.js:74-75`, `server.js:1450`.)
8. **`auth_date` freshness:** reject if `now - auth_date > AUTH_DATE_TTL` (**fork A**) or `auth_date` in the future beyond small skew → `MINIAPP_AUTH_STALE` / `MINIAPP_AUTH_FUTURE`. **Rationale:** the HMAC key is the non-rotating bot token, so a captured initData is valid forever without this check (Critique §M7).
9. **Replay dedup:** `query_id` is **NOT** an official nonce (verified — its documented use is only `answerWebAppQuery`; absent for keyboard/inline launches). So dedup on `(user_id, hash, auth_date)` in a short-TTL ledger (**fork optional replay ledger**); a repeat within the auth window returns the *same* session, not a new one, and never re-mints on a replayed capture.
10. **Required fields & types:** `user` present and JSON-parseable with a numeric `id`; `auth_date` integer. Missing → `MINIAPP_NO_USER`.
11. **Telegram ids as strings, no 32-bit truncation** — store/compare `telegram_user_id` as TEXT (schema already TEXT: `channel_links.telegram_user_id`).
12. **Map to `user_id` — server-owned only:** `channelLinkRepo.getActiveLinkByTg(String(user.id), "telegram")` (`db/channelLinkRepo.js:164`). No active link → `MINIAPP_NOT_PAIRED` (drives the "link your account" state, recon §5.3). `user_id` is **never** read from the body.
13. **Live consent:** `telegramConsentActive(user_id)` (`db/channelLinkRepo.js:258`, `tg-v1`) required (this is the "may we interact via Telegram" bar). Revoked → `MINIAPP_CONSENT_REVOKED`.
14. **Mint scoped session:** `user_sessions` row with `session_kind='telegram_miniapp'`, `auth_method='telegram_init_data'`, `channel_link_id=<active link>`, and the current `auth_context_version`; set the **`lp_miniapp_session`** cookie. Raw initData is **not** accepted as per-request auth afterward.
15. **Rate limit** by Telegram principal **+ IP** (reuse the fail-limiter shape at `server.js:1379-1404`).
16. **Logging:** auth attempts and errors log **only** an error enum + masked telegram id. Never raw `initData`, user JSON, `hash`, or query data.

### Owner forks (§8.1)

| Fork | Options | Recommendation |
|---|---|---|
| **auth_date TTL** | 300 s / 3600 s / 86400 s | **3600 s** (1 h): short enough to bound a captured-initData window, long enough for a normal open→auth. Community default is 86400 s but that is a full day of replay validity — too loose for a non-rotating key. |
| **auth_date TTL** | 300 s / 3600 s / 86400 s | **3600 s** (`MINIAPP_INITDATA_MAX_AGE_SECONDS`) — bounds the captured-initData window. |
| **Idle session TTL** | 30 m / 2 h / 24 h | **2 h** (`MINIAPP_SESSION_IDLE_SECONDS`) idle, sliding via `last_seen_at` bump. |
| **Absolute session TTL** | 24 h / 7 d / 30 d | **24 h first launch** (`MINIAPP_SESSION_ABSOLUTE_SECONDS`), owner-tightened from 7 d; Telegram re-supplies fresh `initData` on the next open so re-auth is nearly invisible. Raise to 7 d later after observation. |
| **Cookie vs bearer** | cookie / bearer | **Secure+HttpOnly cookie** + existing CSRF double-submit + same-origin API (reuses `validateSession`/`requireCsrf`/revoke/GDPR machinery; no token in JS). Bearer would put a token in JS (XSS-reachable) and bypass the mature cookie path. |
| **Scoped `user_sessions` vs separate `miniapp_sessions`** | fixed `session_kind` on `user_sessions` / separate table | **One table, fixed `session_kind` enum (owner, 2026-07-09):** `session_kind ∈ {pwa, telegram_miniapp, future_mobile, future_teacher}` — NOT a free-text `scope`. Reuses `validateSession` (`db/identityRepo.js:63`), `requireCsrf`, revoke, and the structural GDPR sweep with zero duplication. A separate table would create a second security lifecycle (validation, extension, revoke, GDPR sweep, cleanup, session-fixation defense) with drift risk against PWA auth — rejected at this scale. Migration 034 expresses: `session_kind`, `auth_method`, `channel_link_id`, `auth_context_version`, `idle_expires_at`, `absolute_expires_at`, `last_seen_at`, `revoked_at` (reuse existing `user_sessions` columns where present). Recommended values: `session_kind='telegram_miniapp'`, `auth_method='telegram_init_data'`, `channel_link_id=<validated active link>`. |
| **Separate cookie name** | shared `lp_session` / separate | **Separate: `lp_miniapp_session`** — both sessions live in `user_sessions` under one validator but never overwrite each other and carry different audience/capability. Cookie: `Secure; HttpOnly; SameSite=Lax`, **no `Domain`**, limited lifetime. |
| **Replay ledger for `hash`/`auth_date`** | yes / no | **Yes, short-TTL** — cheap; prevents re-mint from a replayed capture within the auth window. |
| **Session refresh** | re-auth via fresh initData / silent extend | **Re-auth via fresh initData** on absolute expiry; idle refresh is the `last_seen_at` bump. |

### Revoke — structural via `auth_context_version` (owner, 2026-07-09)

The session stores `channel_link_id` + `auth_context_version`. Middleware compares the session's `auth_context_version` to the user's current value on **every** request; a bump invalidates all affected sessions **without physically sweeping rows**. Bump triggers: `/unlink`, `telegram_delivery` consent revoke, consent-version bump, account delete, channel-link deactivation, manual security logout, and bot-token change (if an auth-context bump is wired to it). The physical `deleteUserData` per-`user_id` sweep still removes the rows on account delete (they carry `user_id`); `auth_context_version` covers the *revoke-without-delete* paths cheaply and consistently. Also wire into the existing `channelLinkRepo.revokeTelegramCascade` (`db/channelLinkRepo.js:196`).

---

## §8.2 BROWSER SECURITY

- **CSP:** strict, self + Telegram web-app frame ancestors only; no inline scripts beyond a nonce'd bootstrap; no external script/style/font/img hosts except what Telegram requires; `connect-src 'self'`. (Mini App runs framed by Telegram — set `frame-ancestors` to the Telegram origins, not `*`.)
- **Rendering:** all learner/agent-derived strings via `textContent` (never `innerHTML`). No agent-produced HTML is ever injected. Hebrew/RU rendered via `dir=auto`/`dir=rtl` attributes (reuse mentor-home pattern), not markup.
- **No auth token in JS storage:** session is an `HttpOnly` cookie; **nothing** auth-bearing in `localStorage`/`sessionStorage`/URL. CSRF token held in memory for the session lifetime only.
- **No secrets in URL/logs:** no `text_key`/`order_index`/answer/expected/`initData` in any URL, `history` entry, console, or server log. Handoff uses opaque tokens (§9).
- **No Telegram profile persistence** beyond the masked id needed to map the link; raw Telegram `user` JSON is never stored.
- **Referrer-Policy:** `no-referrer` (or `same-origin`) on the Mini App document.
- **CORS:** same-origin only; the auth + review + handoff endpoints do **not** send permissive CORS headers.
- **Feature flag fail-closed:** every Mini App endpoint checks `MINI_APP_ENABLED` (and owner allowlist) first → `503` if off (no partial behavior).
- **Backend-for-Frontend + centralized audience guard (owner, 2026-07-09):** the Mini App cookie does **not** call `/api/learner/*` or `/api/agent/*` directly. A dedicated `/api/miniapp/*` surface is guarded once by `requireSessionKind('telegram_miniapp')`; each route internally calls the shared application services. PWA-privileged routes use `requireSessionKind('pwa')`; genuinely shared read-only endpoints accept both kinds via an **explicit allowlist**, never by default. This replaces dozens of scattered per-endpoint scope checks with one guard.
- **Rate limits (separate buckets):** auth / start / answer / annul / handoff each rate-limited independently by principal+IP. Burst-tested (§13 gate).
- **Payload caps + schema validation:** answer ≤ `MAX_ANSWER_CHARS` (400, `reviewer.js:55`); every request body schema-validated; unknown fields rejected (closed whitelist, like `reviewer.js:103-104`).
- **Server error allowlist:** the client is given a precise `error_code` enum (never a stack/internal message); "generic something-went-wrong" is forbidden when the server has an exact code (recon §5.3 states-honesty).

---

## §8.3 CHALLENGE BINDING

A Mini App answer is accepted **only if all** hold (server-enforced, mirroring and extending `agent/reviewer.js:124-160`):

- challenge belongs to the authenticated `user_id` (from session, not body);
- `challenge.surface` ∈ allowed set and matches the calling surface (`telegram_miniapp`);
- challenge `status ∈ {active, processing}` (not terminal);
- `attempt_id` matches the claim (`claimForAttempt`) — single-use;
- challenge not expired (`expires_at > now`, `reviewer.js:139`);
- answer family matches `prompt_kind` (`EXPECTED_SCOPE` canon check, `reviewer.js:231-235`, fail-closed on mismatch);
- **expected form taken only from the server challenge** (`chal.expected_surface` / `keyingService.displayForItemKey`, `reviewer.js:167-169`) — never from the client;
- challenge single-use; repeat request deduped;
- **accepted server response lost by the client → retry returns the prior result, not a new event.** Each submit carries `attempt_id` + `challenge_id` + `session_id`, with a DB `UNIQUE(user_id, attempt_id)` constraint backing the existing `ingestBatch` idempotency replay (norm §20.3). The Mini App generates `attempt_id` once per challenge and resends it verbatim on retry (it has no Telegram `update_id`).

**Never trusted from the client:** `item_key`, `expected`, `grade`, `channel`, `source`, `select_reason`, sentence anchor, audio asset, review event id. (These are exactly the closed-whitelist args the reviewer already refuses — `GRADE_ARGS` at `reviewer.js:60`.)

**Trusted-surface flag:** the new `/api/telegram/miniapp/review/*` handlers set `ctx.surface='telegram_miniapp'` (the Mini App analogue of `ctx.viaTelegramReview`) **only after** initData-session + active-link + live-consent all pass. The generalized write-gate (recon §5.3) accepts production writes for `surface ∈ {telegram_bot, telegram_miniapp}` and fail-closes on anything else. The plain HTTP `/api/agent/review` (`server.js:1843`) stays **receptive-locked** (strips `challenge_id`, rejects production) — unchanged.

**Consent race (fail-closed at the write boundary):** for cloze (class-C content), re-check `cloud_texts` + `agent_read_texts` live at answer time and cancel+return `TEXT_CONSENT_REVOKED` if revoked between prompt and answer (mirror `reviewer.js:143-147`).

**MNAR / abstain / near-miss / app-close / network-loss:** write **nothing** to `review_log`. Only an explicit in-session skip may write `kind='skip'`. Closing the Mini App, losing network, or an unsupported/empty/ambiguous state produce **zero** review rows (canon §7; enforced by the same reviewer branches).

---

## §9 DEEP-LINK / HANDOFF TO THE ЗАЛ (detailed)

### Why not raw anchors
`openTextAt(text_key, order_index)` (P9) does a **host-side OPFS query** (`library-ui.js:2533`) — a webview has no OPFS. And a raw `?text_key=…&order_index=…` URL leaks sensitive learner content into the URL + browser history + any referrer, with no purge/revoke fail-close. **Rejected as default.**

### Recommended: opaque one-time handoff token

**Table** `handoff_tokens` (migration 034; `user_id` column → auto-covered by GDPR sweep; add `exportUserData` strip for `token_hash`):

```
handoff_tokens (
  token_hash   TEXT PRIMARY KEY,     -- sha256(raw); raw never stored (pattern: channel_pairing_tokens)
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text_key     TEXT NOT NULL,
  order_index  INTEGER,
  token_index  INTEGER,              -- optional finer anchor
  action       TEXT NOT NULL DEFAULT 'open_reader',
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,        -- short TTL (e.g. 5 min)
  used_at      TEXT                  -- single-use
)
```

**Flow:**
1. User **explicitly taps** "Open in Зал" (gesture-bound — `openLink`/`openTelegramLink` require it, verified).
2. Mini App → `POST /api/telegram/miniapp/handoff` `{challenge_id or text_key+order_index}`.
3. Server checks session + consent + **artifact existence** (text still present, not purged) → issues a short link carrying an **opaque** token (`t.me/...` or the app origin), never the raw anchor.
4. Mini App opens the link via `openLink` (external browser) or `openTelegramLink` (in-Telegram; **on pre-7.0 clients this closes the app** — gate with `isVersionAtLeast('7.0')`).
5. PWA receives the token at `GET /api/telegram/miniapp/handoff/redeem?t=…`.
6. PWA binds the token to a live browser session, or offers a safe login if none.
7. PWA runs down-sync (`fullSync`) so the local log ⊇ server.
8. PWA opens the correct text, scrolls to `order_index`, highlights the target — **without** the anchor ever appearing in the URL (resolve server-side, redirect to a clean reader URL / in-app route).
9. Token single-use (`used_at`) + TTL; on purge/revoke/missing-artifact → **fail-closed** with an honest message, never a broken reader.

**Contexts to test (§10 gate):** `openLink` gesture-only; existing browser focus vs new browser; installed PWA; mobile Safari/Chrome; desktop; expired token; used token; cross-user token (must 403); purged text; changed-but-re-anchorable text; deleted text; login-required path; **no raw sensitive anchor in URL/history**.

**Owner fork (§9):** A. raw anchor URL (rejected) · **B. opaque one-time handoff token (RECOMMENDED)**.

---

## RESOLVED 2026-07-09 (owner)
1. **Auth session:** one `user_sessions` table with fixed `session_kind='telegram_miniapp'` enum; separate `lp_miniapp_session` cookie; `auth_method`/`channel_link_id`/`auth_context_version` bound; **BFF `/api/miniapp/*` + `requireSessionKind`** (no direct `/api/learner/*` access). auth_date TTL **1 h**, idle **2 h**, absolute **24 h first launch** — all config-driven; replay ledger **yes**. Separate `miniapp_sessions` table and JS bearer token **rejected**.
2. **Handoff:** opaque one-time `reading_handoff_token` (§9).
3. **Trusted-surface:** widen `viaTelegramReview` → `surface ∈ {telegram_bot, telegram_miniapp}`, fail-closed; HTTP `/api/agent/review` stays receptive-locked.

## Still open (before P8.1 code)
- Exact migration-034 column set vs reuse of existing `user_sessions` columns (confirm at spec-for-P8.1).
- Whether the bot-token-change → `auth_context_version` bump is wired now or deferred.
